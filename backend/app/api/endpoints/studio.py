"""
DocuVerse Studio — Unified Workspace API

Endpoints under ``/api/studio`` that merge App Studio (generated apps) and
Repository Viewer (imported repos) into one editable workspace contract.

Phase 1 surface (this file):
  POST   /sessions                       create from builder project or repo
  GET    /sessions                       list current user's sessions
  GET    /sessions/{id}                  full session state
  DELETE /sessions/{id}                  archive/delete a session
  POST   /sessions/{id}/bootstrap        run framework detection
  POST   /sessions/{id}/classify-edit    classify an edit prompt
  POST   /sessions/{id}/inspect/click    record a source-aware click event
  POST   /sessions/{id}/checkpoint       create an edit checkpoint marker

Later phases will add: install/launch (sandbox), edit orchestration, graph
queries, commit/PR, WebSocket stream. Endpoints are intentionally
forward-compatible — the response shapes already include ``runtime``,
``graphs_built``, etc.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from fastapi import APIRouter, Body, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field

from urllib.parse import urljoin, urlparse, urlunparse

from app.config import get_settings
from app.services.telemetry_service import summarize_runtime_telemetry
from app.api.endpoints.auth import get_current_user
from app.services.builder_persistence import load_builder_project
from app.services.edit_classifier import classify_edit
from app.services.preview_runner import preview_loopback_base
from app.services.repo_bootstrap import (
    BootstrapPlan,
    detect_bootstrap_plan,
    recommend_clone_strategy,
)
from app.services.studio_session_service import (
    append_runtime_telemetry,
    append_chat_message,
    create_session,
    delete_session,
    get_runtime_telemetry,
    get_chat_messages,
    list_user_sessions,
    load_session,
    record_checkpoint,
    record_edit,
    save_session,
    session_summary,
    set_bootstrap_plan,
    set_inspected_node,
    set_runtime,
)

logger = logging.getLogger(__name__)
router = APIRouter()
_RUNTIME_TELEMETRY_TOKENS: Dict[str, Tuple[str, float]] = {}


def _issue_runtime_telemetry_token(session_id: str, ttl_s: int = 4 * 3600) -> str:
    tok = secrets.token_urlsafe(24)
    _RUNTIME_TELEMETRY_TOKENS[tok] = (session_id, time.time() + max(300, int(ttl_s)))
    return tok


def _validate_runtime_telemetry_token(token: Optional[str], session_id: str) -> bool:
    if not token:
        return False
    row = _RUNTIME_TELEMETRY_TOKENS.get(str(token))
    if not row:
        return False
    sid, exp = row
    if time.time() > float(exp):
        _RUNTIME_TELEMETRY_TOKENS.pop(str(token), None)
        return False
    return sid == session_id


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

async def _guard(authorization: str | None):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _ensure_owns(session: Dict[str, Any], user) -> None:
    if session.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    kind: str = Field(..., pattern=r"^(generated|imported)$")
    source_id: str = Field(..., max_length=128)
    base_branch: Optional[str] = Field(None, max_length=200)
    initial_focus: Optional[Dict[str, Any]] = None


class CreateFromTemplateRequest(BaseModel):
    """Studio shortcut: build an App Studio project from a template, then wrap
    it in a Studio session and return a session-ready response."""
    template_id: str = Field(..., max_length=64)
    brand_name: Optional[str] = Field(None, max_length=120)
    color_scheme: Optional[str] = Field(None, max_length=120)
    style: Optional[str] = Field(None, max_length=120)
    additional_notes: Optional[str] = Field(None, max_length=1000)


class CreateFromPromptRequest(BaseModel):
    """Studio shortcut: build an App Studio project from a natural-language
    description, then wrap it in a Studio session."""
    prompt: str = Field(..., min_length=10, max_length=4000, alias="raw_input")
    app_type: Optional[str] = Field(None, max_length=80)

    model_config = {"populate_by_name": True}


class ClassifyEditRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    anchor_symbol: Optional[str] = Field(None, max_length=300)
    anchor_file: Optional[str] = Field(None, max_length=500)


class InspectClickRequest(BaseModel):
    """Payload from the source-aware click overlay (dv-bridge.js).

    A6 fix: capped payload — reject requests that exceed reasonable size
    limits so a misbehaving iframe cannot flood DynamoDB.
    """
    dv_id: Optional[str] = Field(None, max_length=128)
    dom: Optional[Dict[str, Any]] = None
    source: Optional[Dict[str, Any]] = None
    component: Optional[Dict[str, Any]] = None
    props: Optional[Dict[str, Any]] = None
    state: Optional[Dict[str, Any]] = None
    styles: Optional[Dict[str, Any]] = None
    framework: Optional[str] = Field(None, max_length=64)

    def model_post_init(self, __context: Any) -> None:
        """Enforce a 10 KB cap on the full payload (A6 fix)."""
        import json as _json
        raw = _json.dumps(self.model_dump(), default=str)
        if len(raw) > 10_240:
            raise ValueError("InspectClickRequest payload exceeds 10 KB limit")


class RuntimeTelemetryRequest(BaseModel):
    """Frontend/runtime telemetry emitted from Studio preview clients."""

    category: str = Field(
        ...,
        pattern=r"^(process_startup_failure|http_readiness_failure|frontend_runtime_failure|topology_mismatch|post_start_application_state|degraded_runtime_state|network|console|runtime)$",
    )
    source: str = Field("frontend", max_length=64)
    severity: str = Field("info", pattern=r"^(debug|info|warning|error|critical)$")
    payload: Dict[str, Any] = Field(default_factory=dict)


class CheckpointRequest(BaseModel):
    label: str = Field(..., max_length=200)
    snapshot_ref: Optional[str] = Field(None, max_length=128)
    diff_summary: Optional[Dict[str, Any]] = None


class ChatMessageRequest(BaseModel):
    """A user message in the persistent Studio chat."""
    message: str = Field(..., min_length=1, max_length=4000)
    # Optional explicit slash-command hint (e.g. "edit", "explain", "deploy").
    intent: Optional[str] = Field(None, max_length=32)
    # Optional anchor: file path, dv-id, or symbol the user is referring to.
    anchor: Optional[Dict[str, Any]] = None


def _dv_bridge_allowed_parent_origins() -> List[str]:
    """Origins allowed to toggle ``__dv_bridge.js`` and receive ``element-click`` posts.

    The bridge checks ``message.origin`` against this list; the Studio shell must match
    or inspect mode stays off and clicks never propagate. We include both localhost and
    127.0.0.1 for the same listen port whenever one is configured.
    """
    settings = get_settings()
    origins: List[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        u = (raw or "").strip().rstrip("/")
        if not u or u in seen:
            return
        seen.add(u)
        origins.append(u)
        try:
            parsed = urlparse(u)
            host = (parsed.hostname or "").lower()
            port = parsed.port
            if host == "localhost" and port is not None:
                add(urlunparse(parsed._replace(netloc=f"127.0.0.1:{port}")))
            elif host == "127.0.0.1" and port is not None:
                add(urlunparse(parsed._replace(netloc=f"localhost:{port}")))
        except Exception:
            pass

    add("http://localhost:3000")
    add("http://127.0.0.1:3000")
    add(getattr(settings, "frontend_url", "") or "")
    return origins


# ---------------------------------------------------------------------------
# Source resolution helpers
# ---------------------------------------------------------------------------

def _abs(p: Optional[str]) -> Optional[str]:
    """Best-effort absolute path.

    Prefer paths already absolute. Relative paths resolve against the
    **current process CWD** — for repository roots, ``local_path`` should
    already be absolute after clone / ``repos_directory`` normalization.
    """
    if not p:
        return None
    try:
        return str(Path(p).resolve())
    except Exception:
        return p


async def _ensure_imported_repo_on_disk(repo, user) -> str:
    """For ``kind=imported`` sessions, make sure the repo is cloned locally.

    Reuses the existing transparent re-clone helper from
    ``repositories.py`` so behaviour matches every other endpoint
    (App Runner restart, manual cleanup, fresh DynamoDB load, etc.).

    Returns the absolute on-disk path. Raises HTTPException on failure.
    """
    # Lazy import to avoid circular deps at module load time
    from app.api.endpoints.repositories import _ensure_repo_cloned

    # Prefer the fresh user.access_token; fall back to repo's stored token
    # path if get_current_user returned a reconstructed user.
    access_token = getattr(user, "access_token", "") or ""

    abs_path = _abs(getattr(repo, "local_path", None))
    if abs_path and os.path.exists(abs_path):
        return abs_path

    if not access_token:
        raise HTTPException(
            status_code=400,
            detail=(
                "Repository files are missing locally and no GitHub access "
                "token is available to re-clone. Please reconnect GitHub."
            ),
        )

    try:
        ok = await _ensure_repo_cloned(repo, access_token)
    except Exception as e:
        logger.error(f"Re-clone failed for repo {getattr(repo, 'id', '?')}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Re-clone failed: {str(e)[:300]}",
        )

    if not ok:
        raise HTTPException(
            status_code=502,
            detail="Re-clone did not produce a local working copy.",
        )

    abs_path = _abs(getattr(repo, "local_path", None))
    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(
            status_code=502,
            detail="Repository was re-cloned but local path is still missing.",
        )
    return abs_path


def _lookup_imported_repo(source_id: str, user):
    from app.api.endpoints.repositories import repositories_db
    repo = repositories_db.get(source_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if getattr(repo, "user_id", None) != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return repo


def _resolve_source(kind: str, source_id: str, user) -> Dict[str, Any]:
    """Resolve a (kind, source_id) pair to a concrete source descriptor.

    Returns:
        {
          "title": str,
          "workspace_path": Optional[str],
          "default_branch": str,
          "repo_short": str,
        }
    Raises HTTPException on missing/forbidden.

    Note: this does **not** trigger a re-clone. It only reports the current
    declared local path. Bootstrap-time materialisation is handled by
    ``_resolve_session_workspace`` which is async.
    """
    if kind == "generated":
        project = load_builder_project(source_id)
        if not project:
            raise HTTPException(status_code=404, detail="Builder project not found")
        if project.get("user_id") != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        from app.services.studio_workspace import get_project_dir
        return {
            "title": project.get("title", "Untitled App"),
            "workspace_path": str(get_project_dir(source_id)),
            "default_branch": "main",
            "repo_short": source_id[:12],
        }

    if kind == "imported":
        repo = _lookup_imported_repo(source_id, user)
        return {
            "title": getattr(repo, "name", "Repository"),
            "workspace_path": _abs(getattr(repo, "local_path", None)),
            "default_branch": getattr(repo, "default_branch", "main") or "main",
            "repo_short": getattr(repo, "name", source_id)[:12],
        }

    raise HTTPException(status_code=400, detail=f"Unknown session kind: {kind}")


async def _resolve_session_workspace(session: Dict[str, Any], user) -> str:
    """Return an absolute, on-disk workspace path for the session.

    For imported repos this triggers a transparent re-clone if the local
    files are missing (matches the behaviour of every other repository
    endpoint). For generated apps this just resolves the builder workspace.

    Persists the resolved path back onto the session so subsequent calls
    are stable.
    """
    kind = session.get("kind")
    source_id = session.get("source_id")

    if kind == "generated":
        from app.services.builder_persistence import load_builder_project
        from app.services.studio_workspace import get_project_dir, write_project_files

        path = str(get_project_dir(source_id))
        # Prefer an on-disk tree. If Magic Build produced fullstack_files but the
        # user has not launched preview yet, materialise the same way launch does.
        if not os.path.exists(path):
            project = load_builder_project(source_id)
            if project and project.get("fullstack_files"):
                await write_project_files(
                    source_id,
                    project["fullstack_files"],
                    project.get("env_config") or {},
                )
        if not os.path.exists(path):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Generated app has no files on disk yet. Run Magic "
                    "Build (or a full-stack preview launch) first."
                ),
            )
        if session.get("workspace_path") != path:
            session["workspace_path"] = path
            save_session(session)
        return path

    if kind == "imported":
        repo = _lookup_imported_repo(source_id, user)
        path = await _ensure_imported_repo_on_disk(repo, user)
        if session.get("workspace_path") != path:
            session["workspace_path"] = path
            save_session(session)
        return path

    raise HTTPException(status_code=400, detail=f"Unknown session kind: {kind}")


# ---------------------------------------------------------------------------
# Endpoints — Sessions
# ---------------------------------------------------------------------------

@router.post("/sessions")
async def create_studio_session(
    body: CreateSessionRequest,
    authorization: str = Header(None),
):
    """Create a new unified Studio session for either a generated or
    imported project."""
    user = await _guard(authorization)

    if body.kind not in ("generated", "imported"):
        raise HTTPException(status_code=400, detail='kind must be "generated" or "imported"')

    src = _resolve_source(body.kind, body.source_id, user)

    session = create_session(
        user_id=user.id,
        kind=body.kind,        # type: ignore[arg-type]
        source_id=body.source_id,
        title=src["title"],
        repo_short=src["repo_short"],
        base_branch=body.base_branch or src["default_branch"],
        workspace_path=_abs(src["workspace_path"]),
        initial_focus=body.initial_focus,
    )
    return session


@router.post("/sessions/from-template")
async def create_session_from_template(
    body: CreateFromTemplateRequest,
    authorization: str = Header(None),
):
    """Single-call shortcut: build an App Studio project from a template,
    wrap it in a Studio session, return the session.

    The frontend uses this on the /studio index "Pick a template" CTA so the
    user lands directly in /studio/<sessionId> without an intermediate hop.
    """
    user = await _guard(authorization)

    # Reuse the existing builder factory so we don't fork the codepath.
    from app.services.app_generator import AppGenerator
    from app.services.builder_persistence import (
        count_user_builder_projects,
        save_builder_project,
    )
    from app.services.billing_service import PLAN_LIMITS  # noqa: F401  (parity)
    from app.api.endpoints.builder import APP_STUDIO_LIMITS

    tier = getattr(user, "subscription_tier", "free") or "free"
    limit = APP_STUDIO_LIMITS.get(tier, 1)
    if count_user_builder_projects(user.id) >= limit:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LIMIT_EXCEEDED",
                "feature": "app_studio_projects",
                "limit": limit,
                "tier": tier,
                "upgrade_url": "/pricing",
            },
        )

    generator = AppGenerator()
    customizations = {
        k: v
        for k, v in {
            "brand_name": body.brand_name,
            "color_scheme": body.color_scheme,
            "style": body.style,
            "additional_notes": body.additional_notes,
        }.items()
        if v is not None
    }
    try:
        project = await generator.generate_from_template(
            template_id=body.template_id,
            user_id=user.id,
            customizations=customizations,
        )
        save_builder_project(project)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create project from template: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project")

    # NOTE: For generated apps the source files only exist on disk after Magic
    # Build / launch. _resolve_source returns the workspace_path placeholder
    # without checking existence; _resolve_session_workspace later enforces
    # existence at bootstrap time, and prompts the user to run Magic Build.
    src = _resolve_source("generated", project["id"], user)
    session = create_session(
        user_id=user.id,
        kind="generated",
        source_id=project["id"],
        title=src["title"],
        repo_short=src["repo_short"],
        base_branch=src["default_branch"],
        workspace_path=_abs(src["workspace_path"]),
    )
    return {"session": session, "project_id": project["id"]}


@router.post("/sessions/from-prompt")
async def create_session_from_prompt(
    body: CreateFromPromptRequest,
    authorization: str = Header(None),
):
    """Single-call shortcut: build an App Studio project from a prompt and
    wrap it in a Studio session."""
    user = await _guard(authorization)

    from app.services.app_generator import AppGenerator
    from app.services.builder_persistence import (
        count_user_builder_projects,
        save_builder_project,
    )
    from app.api.endpoints.builder import APP_STUDIO_LIMITS

    tier = getattr(user, "subscription_tier", "free") or "free"
    limit = APP_STUDIO_LIMITS.get(tier, 1)
    if count_user_builder_projects(user.id) >= limit:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LIMIT_EXCEEDED",
                "feature": "app_studio_projects",
                "limit": limit,
                "tier": tier,
                "upgrade_url": "/pricing",
            },
        )

    generator = AppGenerator()
    try:
        project = await generator.generate_from_requirements(
            raw_input=body.prompt,
            user_id=user.id,
        )
        save_builder_project(project)
    except Exception as e:
        logger.error(f"Failed to create project from prompt: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project")

    src = _resolve_source("generated", project["id"], user)
    session = create_session(
        user_id=user.id,
        kind="generated",
        source_id=project["id"],
        title=src["title"],
        repo_short=src["repo_short"],
        base_branch=src["default_branch"],
        workspace_path=_abs(src["workspace_path"]),
    )
    return {"session": session, "project_id": project["id"]}


@router.get("/sessions")
async def list_studio_sessions(authorization: str = Header(None)):
    user = await _guard(authorization)
    sessions = list_user_sessions(user.id)
    return {
        "sessions": [session_summary(s) for s in sessions],
        "total": len(sessions),
    }


@router.get("/sessions/{session_id}")
async def get_studio_session(
    session_id: str,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    out = dict(session)
    rows = list(session.get("runtime_telemetry") or [])
    if rows:
        out["runtime_diagnostics"] = summarize_runtime_telemetry(rows[-200:])
    return out


@router.delete("/sessions/{session_id}")
async def remove_studio_session(
    session_id: str,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    delete_session(session_id)
    return {"success": True, "message": "Session deleted"}


# ---------------------------------------------------------------------------
# Endpoints — Bootstrap
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/bootstrap")
async def bootstrap_session(
    session_id: str,
    authorization: str = Header(None),
):
    """Run deterministic framework/PM/monorepo detection on the session's
    workspace. Persists the resulting BootstrapPlan onto the session.

    Safe to call multiple times — re-runs detection.
    """
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    # Resolve workspace (auto-reclone for imported repos if needed).
    abs_workspace = await _resolve_session_workspace(session, user)

    try:
        # C5 fix: detect_bootstrap_plan is synchronous and disk-intensive.
        # Run it in a thread pool so it does not block the asyncio event loop.
        import asyncio as _asyncio
        plan: BootstrapPlan = await _asyncio.to_thread(detect_bootstrap_plan, abs_workspace)
    except Exception as e:
        logger.error(f"Bootstrap detection failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")

    plan_dict = plan.to_dict()
    plan_dict["clone_strategy"] = recommend_clone_strategy(plan)

    updated = set_bootstrap_plan(session_id, plan_dict)
    return updated


# ---------------------------------------------------------------------------
# Endpoints — Source map (Phase 2)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/source-map/build")
async def build_source_map(
    session_id: str,
    authorization: str = Header(None),
    dry_run: bool = False,
):
    """Inject ``data-dv-id`` attributes throughout the session workspace and
    persist the resulting bidirectional route index.

    This is the foundation of source-aware editing — once injected, every
    clicked DOM element carries a ``data-dv-id`` that resolves to an exact
    (file, line, col) on disk.
    """
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    abs_workspace = await _resolve_session_workspace(session, user)

    try:
        import asyncio as _asyncio
        from app.services.dv_id_injector import build_route_index
        from app.services.dv_bridge import install_bridge

        allowed_parents = _dv_bridge_allowed_parent_origins()

        result = await _asyncio.to_thread(
            build_route_index, abs_workspace, dry_run=dry_run
        )
        bridge = await _asyncio.to_thread(
            install_bridge, abs_workspace, allowed_parent_origins=allowed_parents
        ) if not dry_run else {"wrote_bridge_at": None, "patched_entry": None, "warning": "dry-run"}
    except Exception as e:
        logger.error(f"Source map build failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Source map build failed: {e}")

    # Persist a compact form on the session — full index can grow large, so
    # we keep both: a summary for fast list responses and the full mapping for
    # lookups by the Surgical Edit Engine.
    session["route_index"] = result["route_index"]
    session["route_index_summary"] = {
        "files_visited": result["files_visited"],
        "files_modified": result["files_modified"],
        "elements_indexed": result["elements_indexed"],
        "errors": result["errors"][:20],
        "built_at": session.get("updated_at"),
    }
    session["bridge_install"] = bridge
    save_session(session)

    return {
        "session_id": session_id,
        "files_visited": result["files_visited"],
        "files_modified": result["files_modified"],
        "elements_indexed": result["elements_indexed"],
        "errors": result["errors"][:50],
        "bridge": bridge,
    }


@router.post("/sessions/{session_id}/undo")
async def undo_session(
    session_id: str,
    authorization: str = Header(None),
):
    """Undo the most recent applied checkpoint."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    from app.services import checkpoint_engine

    try:
        import asyncio as _asyncio
        result = await _asyncio.to_thread(checkpoint_engine.undo_last, session_id)
    except Exception as e:
        logger.error(f"Undo failed: {e}")
        raise HTTPException(status_code=500, detail=f"Undo failed: {e}")
    if not result:
        raise HTTPException(status_code=400, detail="Nothing to undo")
    return {"session_id": session_id, **result}


@router.post("/sessions/{session_id}/redo")
async def redo_session(
    session_id: str,
    authorization: str = Header(None),
):
    """Redo the most recently undone checkpoint."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    from app.services import checkpoint_engine

    try:
        import asyncio as _asyncio
        result = await _asyncio.to_thread(checkpoint_engine.redo_last, session_id)
    except Exception as e:
        logger.error(f"Redo failed: {e}")
        raise HTTPException(status_code=500, detail=f"Redo failed: {e}")
    if not result:
        raise HTTPException(status_code=400, detail="Nothing to redo")
    return {"session_id": session_id, **result}


@router.get("/sessions/{session_id}/git/diff")
async def session_git_diff(
    session_id: str,
    authorization: str = Header(None),
):
    """Return the list of files this session has modified, with both the
    ``before`` and ``after`` contents — feeds the right-pane Git tab's
    diff viewer (Phase 3)."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    from app.services import git_workflow_service
    files = git_workflow_service.list_changed_files(session)
    return {
        "session_id": session_id,
        "branch_head": session.get("branch_head"),
        "branch_base": session.get("branch_base"),
        "files": files,
    }


class CommitAndPRRequest(BaseModel):
    title: str = Field(..., min_length=4, max_length=120)
    body: Optional[str] = Field(None, max_length=4000)
    open_pr: bool = True
    only_paths: Optional[List[str]] = None


@router.post("/sessions/{session_id}/git/commit-and-pr")
async def session_commit_and_pr(
    session_id: str,
    body: CommitAndPRRequest,
    authorization: str = Header(None),
):
    """Push the session's edits to its feature branch and (optionally) open
    a PR. Replaces the App Studio ``push-to-github`` stub."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    if not getattr(user, "access_token", None):
        raise HTTPException(
            status_code=400,
            detail="GitHub access token missing. Reconnect GitHub in Settings → Integrations.",
        )

    from app.services import git_workflow_service

    if session.get("kind") == "imported":
        repo = _lookup_imported_repo(session.get("source_id"), user)
        full = getattr(repo, "full_name", None)
        if not full or "/" not in full:
            raise HTTPException(status_code=400, detail="Repository has no GitHub full_name")
        owner, repo_name = full.split("/", 1)

        push_summary = await git_workflow_service.push_session_to_branch(
            session=session,
            user_access_token=user.access_token,
            owner=owner,
            repo=repo_name,
            branch_head=session["branch_head"],
            branch_base=session.get("branch_base", getattr(repo, "default_branch", "main")),
            commit_message=body.title,
            only_paths=body.only_paths,
        )

        result: Dict[str, Any] = {
            "kind": "imported",
            "branch": push_summary.branch,
            "files_pushed": push_summary.files_pushed,
            "files_skipped": push_summary.files_skipped,
            "error": push_summary.error,
        }

        if push_summary.error:
            result["pr"] = None
            return result

        if body.open_pr and push_summary.files_pushed:
            try:
                pr = await git_workflow_service.open_pull_request(
                    user_access_token=user.access_token,
                    owner=owner,
                    repo=repo_name,
                    branch_head=session["branch_head"],
                    branch_base=session.get("branch_base", getattr(repo, "default_branch", "main")),
                    title=body.title,
                    body=(body.body or _default_pr_body(session)),
                )
                result["pr"] = pr
            except Exception as e:
                result["pr"] = {"created": False, "error": str(e)}
        else:
            result["pr"] = None

        # Persist commit ref on the session
        if push_summary.files_pushed:
            session["commit_sha"] = "pending-tree-api"
            save_session(session)
        return result

    # Generated app: first push creates a brand-new repo
    repo_slug = (session.get("title") or "studio-app").lower().replace(" ", "-")[:60]
    push_summary = await git_workflow_service.push_session_to_new_repo(
        session=session,
        user_access_token=user.access_token,
        repo_name=repo_slug,
        description=f"Created by DocuVerse Studio · session {session_id}",
        commit_message=body.title,
    )
    return {
        "kind": "generated",
        "repo_url": push_summary.pr_url,
        "files_pushed": push_summary.files_pushed,
        "files_skipped": push_summary.files_skipped,
        "error": push_summary.error,
    }


class SavedBlockRequest(BaseModel):
    """Save the currently-anchored element as a re-usable block."""
    label: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field(None, max_length=400)
    dv_id: Optional[str] = Field(None, max_length=128)
    html: Optional[str] = Field(None, max_length=20_000)
    tag: Optional[str] = Field(None, max_length=64)


def _enrich_component_block_from_route_index(
    block: Dict[str, Any], session: Dict[str, Any]
) -> Dict[str, Any]:
    """Add source_file / source_line / source_col from ``route_index`` when possible."""
    from app.services.dv_id_injector import lookup

    out = dict(block)
    dv_id = out.get("dv_id")
    if not dv_id:
        return out
    ri = session.get("route_index")
    if not isinstance(ri, dict):
        return out
    m = lookup(ri, str(dv_id))
    if not m or not isinstance(m, dict):
        return out
    if not out.get("source_file") and m.get("file"):
        out["source_file"] = m["file"]
    if out.get("source_line") is None and m.get("line") is not None:
        try:
            out["source_line"] = int(m["line"])
        except (TypeError, ValueError):
            pass
    if out.get("source_col") is None and m.get("col") is not None:
        try:
            out["source_col"] = int(m["col"])
        except (TypeError, ValueError):
            pass
    if not out.get("tag") and m.get("tag"):
        out["tag"] = str(m["tag"])
    return out


@router.get("/sessions/{session_id}/components")
async def list_components(
    session_id: str,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    raw = session.get("components", []) or []
    enriched: List[Dict[str, Any]] = []
    dirty = False
    for c in raw:
        if not isinstance(c, dict):
            enriched.append(c)
            continue
        had_sf = bool(c.get("source_file"))
        e = _enrich_component_block_from_route_index(c, session)
        if not had_sf and e.get("source_file"):
            dirty = True
        enriched.append(e)
    if dirty and len(enriched) == len(raw):
        session["components"] = enriched
        save_session(session)
    return {
        "session_id": session_id,
        "components": enriched,
    }


@router.post("/sessions/{session_id}/components")
async def save_component(
    session_id: str,
    body: SavedBlockRequest,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    import uuid as _uuid

    block = {
        "id": f"blk_{_uuid.uuid4().hex[:10]}",
        "label": body.label,
        "description": body.description or "",
        "dv_id": body.dv_id,
        "html": body.html,
        "tag": body.tag,
        "ts": datetime.utcnow().isoformat() + "Z",
    }
    block = _enrich_component_block_from_route_index(block, session)
    components = session.setdefault("components", [])
    components.append(block)
    if len(components) > 100:
        session["components"] = components[-100:]
    save_session(session)
    return block


@router.delete("/sessions/{session_id}/components/{component_id}")
async def delete_component(
    session_id: str,
    component_id: str,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    components = session.get("components", [])
    new_components = [c for c in components if c.get("id") != component_id]
    if len(new_components) == len(components):
        raise HTTPException(status_code=404, detail="Component not found")
    session["components"] = new_components
    save_session(session)
    return {"deleted": True, "id": component_id}


class DeployRequest(BaseModel):
    project_name: Optional[str] = Field(None, max_length=60)


@router.post("/sessions/{session_id}/deploy")
async def deploy_session_to_vercel(
    session_id: str,
    body: DeployRequest,
    authorization: str = Header(None),
):
    """Deploy the session workspace to the user's Vercel account."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    token = getattr(user, "vercel_access_token", None) or os.getenv("VERCEL_DEFAULT_TOKEN")
    if not token:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "VERCEL_NOT_CONNECTED",
                "message": (
                    "Vercel is not connected. Add a personal access token in "
                    "Settings → Integrations to enable one-click deploy."
                ),
                "connect_url": "/settings/integrations",
            },
        )

    # Ensure workspace is materialised
    abs_workspace = await _resolve_session_workspace(session, user)
    framework = (session.get("bootstrap") or {}).get("framework") or "nextjs"
    project_name = body.project_name or session.get("title") or "studio-app"

    from app.services import vercel_service
    try:
        result = await vercel_service.create_deployment(
            workspace_path=abs_workspace,
            project_name=project_name,
            vercel_access_token=token,
            framework=framework,
            team_id=getattr(user, "vercel_team_id", None),
        )
    except vercel_service.VercelError as e:
        logger.error(f"Vercel deploy failed: {e}")
        raise HTTPException(status_code=502, detail=f"Vercel API error: {e.body}")
    except Exception as e:
        logger.exception("Vercel deploy raised")
        raise HTTPException(status_code=500, detail=f"Deploy failed: {e}")

    # Persist the latest deployment on the session
    deployments = session.setdefault("deployments", [])
    deployments.append({
        "id": result.get("id"),
        "url": None,
        "ready_state": result.get("readyState"),
        "ts": datetime.utcnow().isoformat() + "Z",
    })
    if len(deployments) > 20:
        session["deployments"] = deployments[-20:]
    save_session(session)

    return {
        "deployment_id": result.get("id"),
        "skipped": result.get("skipped", []),
        "readyState": result.get("readyState"),
        "inspectorUrl": result.get("inspectorUrl"),
    }


@router.get("/sessions/{session_id}/deploy/status")
async def vercel_deploy_poll(
    session_id: str,
    deployment_id: str = Query(..., min_length=4, max_length=128),
    authorization: str = Header(None),
):
    """Poll one Vercel deployment (browser calls every few seconds until terminal)."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    known = {d.get("id") for d in (session.get("deployments") or []) if d.get("id")}
    if deployment_id not in known:
        raise HTTPException(status_code=404, detail="Deployment not found for this session")

    token = getattr(user, "vercel_access_token", None) or os.getenv("VERCEL_DEFAULT_TOKEN")
    if not token:
        raise HTTPException(status_code=400, detail="Vercel not connected")

    from app.services import vercel_service
    try:
        return await vercel_service.poll_deployment(
            deployment_id=deployment_id,
            vercel_access_token=token,
            team_id=getattr(user, "vercel_team_id", None),
        )
    except vercel_service.VercelError as e:
        raise HTTPException(status_code=502, detail=f"Vercel API error: {e.body}")


def _default_pr_body(session: Dict[str, Any]) -> str:
    edits = session.get("edit_history", [])[-10:]
    edit_lines = "\n".join(f"- {e.get('prompt', '')[:120]}" for e in edits)
    return (
        f"## Changes from DocuVerse Studio\n\n"
        f"Session: `{session.get('id')}`\n\n"
        f"### Recent edits\n\n{edit_lines or '_No edit history yet._'}\n\n"
        f"---\n_Generated by [DocuVerse Studio](https://docuverse.ai)._"
    )


@router.post("/sessions/{session_id}/jump-to/{checkpoint_id}")
async def jump_to_checkpoint(
    session_id: str,
    checkpoint_id: str,
    authorization: str = Header(None),
):
    """Restore the workspace to a specific checkpoint in the timeline."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    from app.services import checkpoint_engine

    try:
        import asyncio as _asyncio
        result = await _asyncio.to_thread(
            checkpoint_engine.jump_to, session_id, checkpoint_id
        )
    except Exception as e:
        logger.error(f"Jump-to failed: {e}")
        raise HTTPException(status_code=500, detail=f"Jump-to failed: {e}")
    if not result:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return {"session_id": session_id, **result}


@router.get("/sessions/{session_id}/source-map/lookup")
async def lookup_source_map(
    session_id: str,
    dv_id: str,
    authorization: str = Header(None),
):
    """Resolve a ``data-dv-id`` value back to its source location."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    route_index = session.get("route_index") or {}
    mapping = route_index.get(dv_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="dv_id not in route index")
    return mapping


# ---------------------------------------------------------------------------
# Chat assistant core (shared by unary POST and SSE stream)
# ---------------------------------------------------------------------------


async def _studio_chat_assistant_payload(
    session_id: str,
    session: Dict[str, Any],
    body: ChatMessageRequest,
) -> Tuple[str, Dict[str, Any], Any]:
    """Compute assistant reply text + action card + optional EditResult."""
    repo_kind = "generated" if session.get("kind") == "generated" else "imported"
    anchor = body.anchor or {}
    classification = classify_edit(
        body.message,
        anchor_symbol=anchor.get("symbol"),
        anchor_file=anchor.get("file"),
        repo_kind=repo_kind,
    )
    cls_dict = classification.to_dict()

    intent = (body.intent or "").lower()
    is_explain = intent in ("explain", "explanation")
    has_route_index = bool(session.get("route_index"))
    anchor_dv_id = (anchor.get("dv_id") if isinstance(anchor, dict) else None)

    edit_result = None
    if not is_explain and has_route_index:
        from app.services.surgical_edit_engine import execute as run_edit
        try:
            import asyncio as _asyncio
            edit_result = await _asyncio.to_thread(
                run_edit,
                session_id=session_id,
                prompt=body.message,
                anchor_dv_id=anchor_dv_id,
            )
        except Exception:
            logger.exception("Surgical edit engine raised")
            edit_result = None

    framework = (session.get("bootstrap") or {}).get("framework") or "your app"
    tier_label = {
        "css": "a small visual change",
        "quick": "a fast targeted change",
        "structural": "a multi-file structural change",
    }.get(cls_dict.get("tier", "quick"), "a change")

    if edit_result and edit_result.success:
        files_list = "\n".join(f"- `{f}`" for f in edit_result.files_changed[:6])
        more = (
            ""
            if len(edit_result.files_changed) <= 6
            else f"\n_(+ {len(edit_result.files_changed) - 6} more)_"
        )
        assistant_text = (
            f"Done - applied **{tier_label}** to {framework}.\n\n"
            f"**{edit_result.summary}**\n\n"
            f"Files changed:\n{files_list}{more}\n\n"
            f"You can press **Ctrl+Z** to undo."
        )
        action = {
            "type": "edit_applied",
            "classification": cls_dict,
            "checkpoint_id": edit_result.checkpoint_id,
            "files_changed": edit_result.files_changed,
        }
    elif edit_result and not edit_result.success:
        notes = "\n".join(edit_result.notes) if edit_result.notes else ""
        errors = "\n".join(f"- {e}" for e in edit_result.errors) if edit_result.errors else ""
        assistant_text = (
            f"I understand this should be **{tier_label}** to {framework}, "
            f"but I couldn't apply it directly.\n\n"
            + (f"**Why:**\n{errors}\n\n" if errors else "")
            + (
                notes
                or "Use **Pick for AI** on the preview toolbar (scanner icon), click the target "
                "element, then describe the change. If clicks do nothing, run **Source map** once."
            )
        )
        action = {
            "type": "edit_failed",
            "classification": cls_dict,
            "errors": edit_result.errors,
        }
    else:
        reasons = "; ".join(cls_dict.get("reasons", [])[:3]) or "based on prompt analysis"
        if not anchor_dv_id:
            hint = (
                "Turn on **Pick for AI** above the preview, click your target element "
                "(you’ll see an indigo outline on hover). If clicks don’t register, "
                "run **Source map** once, then reload the preview. After the tag appears "
                "in the assistant panel, send your instructions again."
            )
        elif not has_route_index:
            hint = (
                "Build the **Source map** in the toolbar so I can resolve clicks "
                "to source files."
            )
        else:
            hint = (
                "The **anchored Nova Lite planner** should propose class/text or same-file edits. "
                "If nothing applies, confirm AWS Bedrock is configured, simplify the instruction, "
                "or describe a smaller change."
            )
        assistant_text = (
            f"Got it - this looks like **{tier_label}** to {framework}.\n\n"
            f"Plan: {reasons}.\n\n"
            f"{hint}"
        )
        action = {
            "type": "edit_proposal",
            "classification": cls_dict,
            "anchor": body.anchor,
        }

    return assistant_text, action, edit_result


# ---------------------------------------------------------------------------
# Endpoints — Persistent chat (Phase 1)
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/chat")
async def list_chat_messages(
    session_id: str,
    authorization: str = Header(None),
    limit: int = 200,
):
    """Return persisted chat history for a session (most recent N messages)."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    messages = get_chat_messages(session_id, limit=limit)
    return {"session_id": session_id, "messages": messages}


@router.post("/sessions/{session_id}/chat")
async def post_chat_message(
    session_id: str,
    body: ChatMessageRequest,
    authorization: str = Header(None),
):
    """Send a chat message (unary response). For streaming tokens use
    ``POST /sessions/{id}/chat/stream``."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    user_msg = append_chat_message(
        session_id,
        role="user",
        content=body.message,
        action={"intent": body.intent, "anchor": body.anchor}
        if body.intent or body.anchor
        else None,
    )

    assistant_text, action, edit_result = await _studio_chat_assistant_payload(
        session_id, session, body
    )

    assistant_msg = append_chat_message(
        session_id,
        role="assistant",
        content=assistant_text,
        action=action,
    )

    return {
        "session_id": session_id,
        "user_message": user_msg,
        "assistant_message": assistant_msg,
        "edit_result": (
            {
                "success": edit_result.success,
                "summary": edit_result.summary,
                "files_changed": edit_result.files_changed,
                "checkpoint_id": edit_result.checkpoint_id,
            }
            if edit_result
            else None
        ),
    }


@router.post("/sessions/{session_id}/chat/stream")
async def post_chat_message_stream(
    session_id: str,
    body: ChatMessageRequest,
    authorization: str = Header(None),
):
    """Stream assistant reply as SSE (``text/event-stream``).

    Events: ``token`` ({\"t\": string chunk}), then ``complete`` (same shape as
    unary ``POST .../chat``).
    """
    import json

    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    user_msg = append_chat_message(
        session_id,
        role="user",
        content=body.message,
        action={"intent": body.intent, "anchor": body.anchor}
        if body.intent or body.anchor
        else None,
    )

    assistant_text, action, edit_result = await _studio_chat_assistant_payload(
        session_id, session, body
    )

    async def event_gen():
        # Chunk by ~20–32 chars so markdown survives
        step = 28
        for i in range(0, len(assistant_text), step):
            chunk = assistant_text[i : i + step]
            yield f"event: token\ndata: {json.dumps({'t': chunk})}\n\n"
        assistant_msg = append_chat_message(
            session_id,
            role="assistant",
            content=assistant_text,
            action=action,
        )
        done_payload = {
            "session_id": session_id,
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "edit_result": (
                {
                    "success": edit_result.success,
                    "summary": edit_result.summary,
                    "files_changed": edit_result.files_changed,
                    "checkpoint_id": edit_result.checkpoint_id,
                }
                if edit_result
                else None
            ),
        }
        yield f"event: complete\ndata: {json.dumps(done_payload)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/sessions/{session_id}/chat")
async def clear_chat(
    session_id: str,
    authorization: str = Header(None),
):
    """Wipe the chat history for a session (UI 'New chat' button)."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    session["chat_messages"] = []
    save_session(session)
    return {"session_id": session_id, "cleared": True}


# ---------------------------------------------------------------------------
# Endpoints — Edit classification (used by AI chat panel before dispatching)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/classify-edit")
async def classify_edit_endpoint(
    session_id: str,
    body: ClassifyEditRequest,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    repo_kind = "generated" if session.get("kind") == "generated" else "imported"

    classification = classify_edit(
        body.prompt,
        anchor_symbol=body.anchor_symbol,
        anchor_file=body.anchor_file,
        repo_kind=repo_kind,
    )

    return {
        "session_id": session_id,
        "prompt": body.prompt,
        "classification": classification.to_dict(),
    }


# ---------------------------------------------------------------------------
# Endpoints — Source-aware inspector (replaces tag-only click overlay)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/inspect/click")
async def record_click_event(
    session_id: str,
    body: InspectClickRequest,
    authorization: str = Header(None),
):
    """Record an inspector click event from the in-iframe Studio bridge.

    During Phase 1 the bridge runtime is still being shipped; this endpoint
    accepts whatever subset of fields is available so the frontend overlay
    can already start sending structured payloads (any missing fields will
    be filled in later by the source-mapping service).
    """
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    payload = body.model_dump(exclude_none=True)
    updated = set_inspected_node(session_id, payload)
    return {
        "session_id": session_id,
        "last_inspected_node": (updated or {}).get("last_inspected_node"),
    }


@router.post("/sessions/{session_id}/runtime-telemetry")
async def post_runtime_telemetry(
    session_id: str,
    body: RuntimeTelemetryRequest,
    authorization: str = Header(None),
    rt: Optional[str] = None,
):
    """Store structured runtime/frontend telemetry for troubleshooting."""
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    user = None
    if authorization:
        user = await _guard(authorization)
        _ensure_owns(session, user)
    elif not _validate_runtime_telemetry_token(rt, session_id):
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user:
        _ensure_owns(session, user)
    row = append_runtime_telemetry(
        session_id,
        category=body.category,
        source=body.source,
        payload={**(body.payload or {}), "severity": body.severity},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    category = str(body.category or "").strip().lower()
    runtime_state_patch: Dict[str, Any] = {}
    if category == "frontend_runtime_failure":
        runtime_state_patch["lifecycle_state"] = "runtime_degraded"
    elif category == "topology_mismatch":
        runtime_state_patch["lifecycle_state"] = "topology_degraded"
    elif category == "degraded_runtime_state":
        runtime_state_patch["lifecycle_state"] = "runtime_degraded"
    elif category == "post_start_application_state":
        runtime_state_patch["lifecycle_state"] = "frontend_bootstrapping"
    if bool((body.payload or {}).get("frontend_ready")):
        runtime_state_patch["lifecycle_state"] = "frontend_ready"
    if runtime_state_patch:
        set_runtime(session_id, runtime_state_patch)
    # Correlate telemetry into actionable diagnostics and lifecycle suggestion.
    rows = get_runtime_telemetry(session_id, limit=250)
    summary = summarize_runtime_telemetry(rows)
    suggested = str(summary.get("suggested_lifecycle_state") or "").strip()
    if suggested in {
        "frontend_bootstrapping",
        "frontend_ready",
        "topology_degraded",
        "runtime_degraded",
    }:
        set_runtime(session_id, {"lifecycle_state": suggested})
    return {"session_id": session_id, "telemetry": row}


@router.get("/sessions/{session_id}/runtime-telemetry")
async def list_runtime_telemetry(
    session_id: str,
    authorization: str = Header(None),
    limit: int = 120,
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    rows = get_runtime_telemetry(session_id, limit=max(1, min(int(limit), 500)))
    return {
        "session_id": session_id,
        "items": rows,
        "total": len(rows),
        "summary": summarize_runtime_telemetry(rows),
    }


# ---------------------------------------------------------------------------
# Endpoints — Edit history & checkpoints
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/checkpoint")
async def create_checkpoint(
    session_id: str,
    body: CheckpointRequest,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    updated = record_checkpoint(
        session_id,
        label=body.label,
        snapshot_ref=body.snapshot_ref,
        diff_summary=body.diff_summary,
    )
    return {
        "session_id": session_id,
        "checkpoint": (updated or {}).get("checkpoints", [])[-1] if updated else None,
    }


@router.get("/sessions/{session_id}/edit-history")
async def get_edit_history(
    session_id: str,
    authorization: str = Header(None),
):
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    return {
        "session_id": session_id,
        "edits": session.get("edit_history", []),
        "checkpoints": session.get("checkpoints", []),
    }


def _preview_router_key(session: Dict[str, Any], session_id: str) -> str:
    """Key used in ``_running_previews`` — generated apps use builder project id."""
    if session.get("kind") == "generated":
        return str(session.get("source_id") or session_id)
    return session_id


def _get_runtime_manager_checked(session_id: str):
    from app.services.runtime_manager import get_runtime_manager

    cfg = get_settings()
    mgr = get_runtime_manager()
    backend = type(mgr).__name__
    if cfg.studio_runtime_mode == "docker" and backend != "DockerRuntimeManager":
        logger.error(
            "[studio:%s] runtime backend mismatch: mode=docker manager=%s",
            session_id,
            backend,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "RUNTIME_BACKEND_MISMATCH",
                "message": "Docker mode requested but DockerRuntimeManager is not active",
                "diagnostics": {
                    "runtime_mode": cfg.studio_runtime_mode,
                    "manager": backend,
                },
            },
        )
    return mgr


# ---------------------------------------------------------------------------
# Authenticated HTTP proxy → loopback preview (Python / static previews)
# ---------------------------------------------------------------------------

_PROXY_HOP_HEADERS = frozenset(
    name.lower()
    for name in (
        "Connection",
        "Keep-Alive",
        "Proxy-Authenticate",
        "Proxy-Authorization",
        "TE",
        "Trailer",
        "Transfer-Encoding",
        "Upgrade",
        "Host",
    )
)


def _forward_headers_no_hop_no_auth(request: Request) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for k, v in request.headers.items():
        lk = k.lower()
        if lk in _PROXY_HOP_HEADERS or lk == "authorization":
            continue
        out[k] = v
    return out


def _filter_upstream_response_headers(hdrs: httpx.Headers) -> Dict[str, str]:
    skip = (
        _PROXY_HOP_HEADERS
        | {"x-frame-options", "content-security-policy", "content-encoding"}
    )
    fwd: Dict[str, str] = {}
    for key, val in hdrs.multi_items():
        lk = key.lower()
        if lk in skip:
            continue
        fwd[key] = val
    fwd.pop("Content-Length", None)
    fwd.pop("content-length", None)
    return fwd


def _inject_runtime_telemetry_script(
    html: str, session_id: str, telemetry_token: str
) -> str:
    script = f"""
<script>
(function(){{
  try {{
    if (window.__dvRuntimeObsInstalled) return;
    window.__dvRuntimeObsInstalled = true;
    const sid = {session_id!r};
    const rt = {telemetry_token!r};
    const endpoint = `/api/studio/sessions/${{sid}}/runtime-telemetry?rt=${{encodeURIComponent(rt)}}`;
    const send = (category, payload, severity='info') => {{
      const body = JSON.stringify({{ category, source: 'preview_iframe', severity, payload }});
      if (navigator.sendBeacon) {{
        const blob = new Blob([body], {{ type: 'application/json' }});
        navigator.sendBeacon(endpoint, blob);
        return;
      }}
      fetch(endpoint, {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body }}).catch(()=>{{}});
    }};
    const pending = new Map();
    const wrapFetch = window.fetch;
    if (typeof wrapFetch === 'function') {{
      window.fetch = function(...args) {{
        const id = Math.random().toString(36).slice(2);
        const url = String((args[0] && args[0].url) || args[0] || '');
        const started = Date.now();
        pending.set(id, {{url, started}});
        if (/https?:\\/\\/(localhost|127\\.0\\.0\\.1)/i.test(url)) {{
          send('topology_mismatch', {{ kind: 'localhost_api_usage', url }}, 'warning');
        }}
        return wrapFetch.apply(this, args).then((res)=>{{
          pending.delete(id);
          if (!res.ok) send('post_start_application_state', {{ kind:'fetch_failed', url, status:res.status }}, 'warning');
          return res;
        }}).catch((err)=>{{
          pending.delete(id);
          send('frontend_runtime_failure', {{ kind:'fetch_exception', url, error:String(err||'') }}, 'error');
          throw err;
        }});
      }};
    }}
    const WS = window.WebSocket;
    if (typeof WS === 'function') {{
      window.WebSocket = function(url, protocols) {{
        const ws = protocols ? new WS(url, protocols) : new WS(url);
        ws.addEventListener('close', ()=> send('degraded_runtime_state', {{ kind:'websocket_closed', url:String(url||'') }}, 'warning'));
        ws.addEventListener('error', ()=> send('degraded_runtime_state', {{ kind:'websocket_error', url:String(url||'') }}, 'warning'));
        return ws;
      }};
      window.WebSocket.prototype = WS.prototype;
    }}
    window.addEventListener('error', (e)=> send('frontend_runtime_failure', {{ kind:'window_error', message:String(e.message||''), source:String(e.filename||'') }}, 'error'));
    window.addEventListener('unhandledrejection', (e)=> send('frontend_runtime_failure', {{ kind:'unhandled_rejection', reason:String((e.reason&&e.reason.message)||e.reason||'') }}, 'error'));
    const cerr = console.error; const cwarn = console.warn;
    console.error = function(...a) {{ send('console', {{ kind:'error', args:a.slice(0,4).map(x=>String(x)) }}, 'error'); return cerr.apply(this,a); }};
    console.warn = function(...a) {{ send('console', {{ kind:'warn', args:a.slice(0,4).map(x=>String(x)) }}, 'warning'); return cwarn.apply(this,a); }};
    setTimeout(()=> send('post_start_application_state', {{ kind:'frontend_bootstrapping' }}, 'info'), 500);
    const markReady = () => send('runtime', {{ frontend_ready:true, kind:'dom_interactive' }}, 'info');
    if (document.readyState === 'complete' || document.readyState === 'interactive') markReady();
    else document.addEventListener('DOMContentLoaded', markReady, {{ once:true }});
    setInterval(()=> {{
      const now = Date.now();
      for (const [id, v] of pending.entries()) {{
        if ((now - v.started) > 15000) {{
          send('post_start_application_state', {{ kind:'pending_request', url:v.url, age_ms:(now-v.started) }}, 'warning');
          pending.delete(id);
        }}
      }}
    }}, 5000);
  }} catch (_e) {{}}
}})();
</script>
"""
    low = html.lower()
    if "</body>" in low:
        idx = low.rfind("</body>")
        return html[:idx] + script + html[idx:]
    return html + script


async def _session_preview_stream_proxy(
    session_id: str,
    full_path: str,
    request: Request,
    authorization: str | None,
) -> StreamingResponse:
    if request.headers.get("upgrade", "").lower() == "websocket":
        raise HTTPException(
            status_code=501,
            detail="WebSocket preview proxy is not supported; use direct_url for HMR.",
        )

    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)
    rtok = str(((session.get("runtime") or {}).get("runtime_telemetry_token")) or "").strip()
    if not rtok:
        rtok = _issue_runtime_telemetry_token(session_id)
        set_runtime(session_id, {"runtime_telemetry_token": rtok})

    rkey = _preview_router_key(session, session_id)
    pinfo = await _get_runtime_manager_checked(session_id).status(
        rkey, session_id=session_id
    )
    if not pinfo or pinfo.get("status") != "running":
        raise HTTPException(status_code=502, detail="Preview is not running.")

    base = (pinfo.get("direct_url") or "").strip().rstrip("/")
    if not base:
        port = pinfo.get("port")
        try:
            p_int = int(port)
        except (TypeError, ValueError):
            raise HTTPException(status_code=502, detail="Preview port unavailable.")
        base = preview_loopback_base(p_int)
    rel = (full_path or "").replace("\\", "/").lstrip("/")
    tgt = urljoin(base + "/", rel or "")
    if request.url.query:
        sep = "&" if "?" in tgt else "?"
        tgt = f"{tgt}{sep}{request.url.query}"

    fwd_h = _forward_headers_no_hop_no_auth(request)
    body = await request.body()

    timeout = httpx.Timeout(240.0, connect=45.0)
    client = httpx.AsyncClient(timeout=timeout, follow_redirects=False)

    try:
        up_req = client.build_request(
            request.method.upper(),
            tgt,
            headers=fwd_h,
            content=body if body else None,
        )
        up_resp = await client.send(up_req, stream=True)
    except Exception as e:
        await client.aclose()
        logger.warning("studio preview proxy upstream error: %s", e)
        raise HTTPException(status_code=502, detail="Preview upstream unreachable.") from e

    out_hdr = _filter_upstream_response_headers(up_resp.headers)
    ctype = str(up_resp.headers.get("content-type") or "").lower()
    if request.method.upper() == "GET" and "text/html" in ctype:
        try:
            body_bytes = await up_resp.aread()
            html = body_bytes.decode("utf-8", errors="replace")
            html = _inject_runtime_telemetry_script(html, session_id, rtok)
            await up_resp.aclose()
            await client.aclose()
            out_hdr.setdefault(
                "Cache-Control", "no-store, max-age=0, must-revalidate"
            )
            return Response(
                content=html.encode("utf-8"),
                status_code=up_resp.status_code,
                headers=out_hdr,
                media_type=up_resp.headers.get("content-type"),
            )
        except Exception:
            # fall back to streaming path below
            pass

    async def _chunked():
        try:
            async for chunk in up_resp.aiter_bytes():
                yield chunk
        finally:
            try:
                await up_resp.aclose()
            finally:
                await client.aclose()

    return StreamingResponse(
        _chunked(),
        status_code=up_resp.status_code,
        headers=out_hdr,
        media_type=up_resp.headers.get("content-type"),
    )


@router.api_route(
    "/sessions/{session_id}/preview",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
@router.api_route(
    "/sessions/{session_id}/preview/{full_path:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def studio_preview_http_proxy(
    session_id: str,
    request: Request,
    authorization: str = Header(None),
    full_path: str = "",
):
    return await _session_preview_stream_proxy(
        session_id, full_path, request, authorization
    )


# ---------------------------------------------------------------------------
# Endpoints — Preview lifecycle (Launch / Status / Stop)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/launch")
async def launch_session_preview(
    session_id: str,
    request: Request,
    authorization: str = Header(None),
):
    """Launch a live preview for the session.

    For ``kind=generated`` projects with Magic-Build output: writes the
    fullstack files to disk and starts the dev server (existing pipeline).

    For ``kind=imported`` repos: uses the session's ``BootstrapPlan`` to
    run install + dev commands generically. Bootstrap must have been run
    at least once first.
    """
    from app.services.runtime_manager import RuntimeLaunchInput
    from app.services.studio_workspace import write_project_files

    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    # Explicit launch clears the user-stop latch so preview-status / fast-path
    # can reflect live runtime again after a deliberate Stop.
    set_runtime(session_id, {"preview_user_halt": False})

    rkey = _preview_router_key(session, session_id)
    cfg = get_settings()
    runtime_manager = _get_runtime_manager_checked(session_id)
    active_backend = type(runtime_manager).__name__
    logger.info(
        "[studio:%s] launch requested runtime_mode=%s manager=%s",
        session_id,
        cfg.studio_runtime_mode,
        active_backend,
    )

    # If something is already running for this session, return its info.
    existing = await runtime_manager.status(rkey, session_id=session_id)
    if existing and existing.get("status") == "running":
        set_runtime(session_id, existing)
        return existing

    kind = session.get("kind")
    plan = session.get("bootstrap")

    proxy_pb = (cfg.public_api_base_url or "").strip().rstrip("/")
    if not proxy_pb:
        proxy_pb = str(request.base_url).rstrip("/")

    preview_flags_kwargs = dict(
        proxy_public_base=proxy_pb,
        studio_proxy_enabled=bool(cfg.studio_preview_proxy_enabled),
        docker_install=bool(cfg.studio_preview_docker_install),
    )

    if kind == "generated":
        # Reuse the existing builder pipeline so semantics match
        # /api/builder/projects/{id}/fullstack-preview exactly.
        # Do NOT call _resolve_session_workspace here — the workspace directory
        # is created by write_project_files on first launch.
        project = load_builder_project(session.get("source_id"))
        if not project:
            raise HTTPException(status_code=404, detail="Builder project missing")
        files = project.get("fullstack_files")
        if not files:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No full-stack files yet. In Studio: run “Generate designs”, "
                    "then “Magic build”, then launch preview again."
                ),
            )
        env_config = project.get("env_config", {})
        project_dir = await write_project_files(
            session.get("source_id"), files, env_config
        )
        result = await runtime_manager.launch(
            RuntimeLaunchInput(
                runtime_key=rkey,
                session_id=session_id,
                session_kind=str(kind),
                source_id=str(session.get("source_id") or ""),
                project_dir=project_dir,
                env_config=env_config,
                plan=plan if isinstance(plan, dict) else None,
                trusted_runtime=bool((session.get("metadata") or {}).get("trusted_runtime")),
                **preview_flags_kwargs,
            )
        )
    else:
        workspace = await _resolve_session_workspace(session, user)
        # kind=imported — use the BootstrapPlan
        if not plan:
            raise HTTPException(
                status_code=400,
                detail="No bootstrap plan. Run framework detection first.",
            )
        env_config = (session.get("metadata") or {}).get("env_config") or {}
        result = await runtime_manager.launch(
            RuntimeLaunchInput(
                runtime_key=rkey,
                session_id=session_id,
                session_kind=str(kind),
                source_id=str(session.get("source_id") or ""),
                project_dir=Path(workspace),
                env_config=env_config,
                plan=plan if isinstance(plan, dict) else {},
                trusted_runtime=bool((session.get("metadata") or {}).get("trusted_runtime")),
                **preview_flags_kwargs,
            )
        )

    if result.get("status") in ("running", "starting"):
        rtok = _issue_runtime_telemetry_token(session_id)
        rid = result.get("runtime_id") or result.get("container_id") or rkey
        set_runtime(session_id, {
            "status": result.get("status"),
            "url": result.get("url"),
            "port": result.get("port"),
            "pid": result.get("pid"),
            "started_at": result.get("started_at"),
            "direct_url": result.get("direct_url"),
            "proxy_surface": result.get("proxy_surface"),
            "runtime_id": rid,
            "runtime_backend": result.get("runtime_backend") or cfg.studio_runtime_mode,
            "container_id": result.get("container_id"),
            "runtime_provenance": result.get("runtime_provenance"),
            "dockerfile_path": result.get("dockerfile_path"),
            "phase": result.get("phase"),
            "lifecycle_state": result.get("lifecycle_state") or "http_alive",
            "runtime_telemetry_token": rtok,
        })
    elif result.get("status") == "error":
        # Merge would keep a previous session's url — clear so the iframe does not
        # point at a dead port after switching repos or a failed launch.
        set_runtime(session_id, {
            "status": "stopped",
            "url": None,
            "port": None,
            "pid": None,
        })

    return result


@router.get("/sessions/{session_id}/preview-status")
async def get_session_preview_status(
    session_id: str,
    authorization: str = Header(None),
):
    """Poll the live status of the session's preview process."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    rt0 = session.get("runtime") or {}
    if rt0.get("preview_user_halt"):
        # User hit Stop — do not resurrect "running" from a still-warm backend
        # until they launch again (clears preview_user_halt).
        return {
            "status": "stopped",
            "url": None,
            "port": None,
            "pid": None,
        }

    # Generated apps still use the builder project id as the running key
    # to remain compatible with /api/builder previews.
    key = _preview_router_key(session, session_id)
    status = await _get_runtime_manager_checked(session_id).status(
        key, session_id=session_id
    )
    if not status:
        # If runtime says it was running but the process died, reflect that.
        rt = session.get("runtime") or {}
        if rt.get("status") == "running":
            set_runtime(session_id, {
                "status": "stopped",
                "pid": None,
                "url": None,
                "port": None,
                "lifecycle_state": "process_stopped",
            })
        return {"status": "stopped"}

    set_runtime(session_id, {
        "status": status.get("status", "running"),
        "url": status.get("url"),
        "port": status.get("port"),
        "pid": status.get("pid"),
        "direct_url": status.get("direct_url"),
        "runtime_id": status.get("runtime_id"),
        "runtime_backend": status.get("runtime_backend"),
        "container_id": status.get("container_id"),
        "phase": status.get("phase"),
        "runtime_provenance": status.get("runtime_provenance"),
        "dockerfile_path": status.get("dockerfile_path"),
        "lifecycle_state": status.get("lifecycle_state") or "http_alive",
    })
    return status


@router.post("/sessions/{session_id}/stop")
async def stop_session_preview(
    session_id: str,
    authorization: str = Header(None),
):
    """Stop the session's live preview process."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    # Stop both possible keys (session id and source id) to be safe.
    runtime_manager = _get_runtime_manager_checked(session_id)
    stopped_a = await runtime_manager.stop(session_id)
    stopped_b = False
    if session.get("kind") == "generated":
        stopped_b = await runtime_manager.stop(session.get("source_id"))

    set_runtime(session_id, {
        "status": "stopped",
        "url": None,
        "port": None,
        "pid": None,
        "runtime_id": None,
        "container_id": None,
        "phase": None,
        "preview_user_halt": True,
    })
    return {
        "stopped": bool(stopped_a or stopped_b),
        "message": "Preview stopped" if (stopped_a or stopped_b) else "No preview was running",
    }


@router.get("/sessions/{session_id}/preview-logs")
async def get_session_preview_logs(
    session_id: str,
    authorization: str = Header(None),
    tail: int = 200,
):
    """Return runtime logs from the active adapter (host/docker)."""
    user = await _guard(authorization)
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _ensure_owns(session, user)

    key = _preview_router_key(session, session_id)
    mgr = _get_runtime_manager_checked(session_id)
    if not hasattr(mgr, "logs"):
        return {"session_id": session_id, "runtime_key": key, "logs": ""}
    try:
        logs = await mgr.logs(key, tail=max(10, min(int(tail), 2000)))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Preview logs unavailable: {e}") from e
    return {"session_id": session_id, "runtime_key": key, "logs": logs or ""}


@router.get("/runtime-metrics")
async def get_runtime_metrics(
    authorization: str = Header(None),
):
    """Operational visibility for runtime/gateway stabilization."""
    await _guard(authorization)
    from app.services.runtime_manager import runtime_metrics_snapshot

    return runtime_metrics_snapshot()
