"""
DocuVerse Studio — Unified Session Service

A ``StudioSession`` is the single object that unifies App Studio (generated
apps) and Repository Viewer (imported repos) into one editable workspace.

Storage: in-memory primary cache (always works) plus optional DynamoDB sync
when the table ``{prefix}_studio_sessions`` exists. Mirrors the pattern in
``builder_persistence.py`` so no new infrastructure is required to ship.

Model design notes:
  - ``kind`` distinguishes ``"generated"`` (the existing builder world)
    from ``"imported"`` (a cloned external repo).
  - ``source_id`` is the foreign key — for generated kind it is the
    ``builder_project_id``; for imported it is the ``repository_id``.
  - ``branch_head`` is the per-session edit branch
    (``docuverse/session-...``) created off ``branch_base``. Branch
    creation itself is deferred to ``git_workflow_service`` (later phase);
    this service only stores the names.
  - ``checkpoints`` is a small append-only list used by the rollback /
    timeline UI (worktree snapshots are produced by the sandbox layer,
    later phase; here we just record metadata).
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from app.monorepo_paths import default_workspace_dir
from app.services.telemetry_service import normalize_payload, should_accept_event

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory cache (primary)
# ---------------------------------------------------------------------------

_sessions_cache: Dict[str, dict] = {}


def _workspace_root() -> Path:
    return Path(os.environ.get(
        "PREVIEW_WORKSPACE",
        default_workspace_dir(),
    )).resolve()


def _studio_sessions_dir() -> Path:
    """JSON persistence when DynamoDB is not configured — survives uvicorn reload."""
    d = _workspace_root() / "_studio_sessions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _session_disk_path(session_id: str) -> Path:
    return _studio_sessions_dir() / f"{session_id}.json"


def _write_session_disk(session: Dict[str, Any]) -> None:
    fp = _session_disk_path(session["id"])
    tmp = fp.with_suffix(".json.tmp")
    try:
        tmp.write_text(
            json.dumps(session, default=str, indent=2),
            encoding="utf-8",
        )
        tmp.replace(fp)
    except OSError as e:
        logger.warning("Studio session disk write failed (%s): %s", fp, e)
        tmp.unlink(missing_ok=True)


def _read_session_disk(session_id: str) -> Optional[Dict[str, Any]]:
    fp = _session_disk_path(session_id)
    if not fp.is_file():
        return None
    try:
        return json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Studio session disk read failed (%s): %s", fp, e)
        return None


def _delete_session_disk(session_id: str) -> None:
    _session_disk_path(session_id).unlink(missing_ok=True)


def _hydrate_cache_from_disk() -> None:
    d = _studio_sessions_dir()
    if not d.is_dir():
        return
    for fp in d.glob("*.json"):
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            sid = data.get("id")
            if sid and fp.stem == sid:
                _sessions_cache[sid] = data
        except Exception as e:
            logger.debug(f"Skipping bad studio session file {fp}: {e}")

_dynamo_available: Optional[bool] = None
_TABLE_KEY = "studio_sessions"


def _try_dynamo() -> bool:
    """Check once whether the studio_sessions DynamoDB table is reachable."""
    global _dynamo_available
    if _dynamo_available is not None:
        return _dynamo_available
    try:
        from app.services.persistence import _get_dynamodb_resource, _table_name
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name(_TABLE_KEY))
        table.table_status  # forces a remote check
        _dynamo_available = True
    except Exception:
        _dynamo_available = False
        logger.info(
            "Studio DynamoDB table not found — using in-memory storage only"
        )
    return _dynamo_available


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Session creation
# ---------------------------------------------------------------------------

SessionKind = Literal["generated", "imported"]


def _new_session_id() -> str:
    return f"sess_{uuid.uuid4().hex[:16]}"


def _new_branch_name(repo_short: str, user_short: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    rand = secrets.token_hex(3)
    return f"docuverse/session-{repo_short}-{user_short}-{ts}-{rand}"


def create_session(
    *,
    user_id: str,
    kind: SessionKind,
    source_id: str,
    title: str,
    repo_short: Optional[str] = None,
    base_branch: str = "main",
    workspace_path: Optional[str] = None,
    initial_focus: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create and persist a new StudioSession."""
    session_id = _new_session_id()
    short = (repo_short or source_id)[:12]
    user_short = (user_id or "anon")[:6]

    session: Dict[str, Any] = {
        "id": session_id,
        "user_id": user_id,
        "kind": kind,
        "source_id": source_id,
        "title": title,
        "workspace_path": workspace_path,
        "branch_base": base_branch,
        "branch_head": _new_branch_name(short, user_short),
        "commit_sha": None,
        "bootstrap": None,        # populated by /bootstrap step
        "runtime": {              # populated by /launch step
            "status": "stopped",
            "url": None,
            "port": None,
            "pid": None,
            "started_at": None,
            "runtime_id": None,
            "runtime_backend": "host",
            "container_id": None,
        },
        "graphs_built": False,    # set true after graph_builder runs
        "route_index": None,      # populated by source_mapping_service
        "policy": None,           # populated by repo_policy detection (later)
        "edit_history": [],       # list of EditEvent dicts (see record_edit)
        "checkpoints": [],        # list of Checkpoint dicts
        "chat_messages": [],      # Phase 1: list of {id, role, content, ts, action?}
        "last_inspected_node": None,
        "initial_focus": initial_focus or None,
        "metadata": metadata or {},
        "status": "draft",        # draft | bootstrapping | ready | error | archived
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }

    save_session(session)
    return session


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def save_session(session: Dict[str, Any]) -> None:
    """Persist a session (in-memory primary, DynamoDB optional)."""
    session["updated_at"] = _now_iso()
    _sessions_cache[session["id"]] = session

    if _try_dynamo():
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name(_TABLE_KEY))
            table.put_item(Item={
                "id": session["id"],
                "user_id": session["user_id"],
                "data_json": json.dumps(session, default=str),
                "updated_at": session["updated_at"],
            })
        except Exception as e:
            logger.debug(f"DynamoDB save_session skipped: {e}")
    else:
        _write_session_disk(session)


def load_session(session_id: str) -> Optional[Dict[str, Any]]:
    if session_id in _sessions_cache:
        return _sessions_cache[session_id]

    if _try_dynamo():
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name(_TABLE_KEY))
            resp = table.get_item(Key={"id": session_id})
            item = resp.get("Item")
            if item:
                data = json.loads(item.get("data_json", "{}"))
                _sessions_cache[session_id] = data
                return data
        except Exception as e:
            logger.debug(f"DynamoDB load_session skipped: {e}")
    else:
        data = _read_session_disk(session_id)
        if data:
            _sessions_cache[session_id] = data
            return data

    return None


def list_user_sessions(user_id: str) -> List[Dict[str, Any]]:
    if not _try_dynamo():
        _hydrate_cache_from_disk()

    cached = [s for s in _sessions_cache.values() if s.get("user_id") == user_id]

    if _try_dynamo() and not cached:
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name(_TABLE_KEY))
            response = table.scan(
                FilterExpression="user_id = :uid",
                ExpressionAttributeValues={":uid": user_id},
            )
            for item in response.get("Items", []):
                data = json.loads(item.get("data_json", "{}"))
                _sessions_cache[data["id"]] = data
                cached.append(data)
        except Exception as e:
            logger.debug(f"DynamoDB list scan skipped: {e}")

    return sorted(cached, key=lambda s: s.get("updated_at", ""), reverse=True)


def delete_session(session_id: str) -> bool:
    _sessions_cache.pop(session_id, None)
    if not _try_dynamo():
        _delete_session_disk(session_id)
    if _try_dynamo():
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name(_TABLE_KEY))
            table.delete_item(Key={"id": session_id})
        except Exception as e:
            logger.debug(f"DynamoDB delete_session skipped: {e}")
    return True


# ---------------------------------------------------------------------------
# Session mutators
# ---------------------------------------------------------------------------

def set_bootstrap_plan(session_id: str, plan: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return None
    s["bootstrap"] = plan
    if s.get("status") == "draft":
        s["status"] = "bootstrapping"
    save_session(s)
    return s


def set_runtime(session_id: str, runtime: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return None
    s["runtime"] = {**s.get("runtime", {}), **runtime}
    if runtime.get("status") == "running":
        s["status"] = "ready"
    save_session(s)
    return s


def record_edit(
    session_id: str,
    *,
    prompt: str,
    classification: Dict[str, Any],
    files_touched: Optional[List[str]] = None,
    result: str = "applied",
    error: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return None
    event = {
        "id": f"edit_{uuid.uuid4().hex[:12]}",
        "ts": _now_iso(),
        "prompt": prompt,
        "classification": classification,
        "files_touched": files_touched or [],
        "result": result,           # applied | failed | partial
        "error": error,
    }
    s.setdefault("edit_history", []).append(event)
    s["last_inspected_node"] = s.get("last_inspected_node")
    save_session(s)
    return s


def record_checkpoint(
    session_id: str,
    *,
    label: str,
    diff_summary: Optional[Dict[str, Any]] = None,
    snapshot_ref: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return None
    cp = {
        "id": f"cp_{uuid.uuid4().hex[:10]}",
        "ts": _now_iso(),
        "label": label,
        "diff_summary": diff_summary or {},
        "snapshot_ref": snapshot_ref,
    }
    s.setdefault("checkpoints", []).append(cp)
    save_session(s)
    return s


def append_chat_message(
    session_id: str,
    *,
    role: str,
    content: str,
    action: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Append a chat message to the session.

    Args:
        role: "user" | "assistant" | "system"
        content: Markdown-formatted content.
        action: Optional structured action this message produced (edit plan,
                command, etc.) — used by the UI to show inline cards.
    """
    s = load_session(session_id)
    if not s:
        return None
    msg = {
        "id": f"msg_{uuid.uuid4().hex[:10]}",
        "ts": _now_iso(),
        "role": role,
        "content": content,
        "action": action,
    }
    history = s.setdefault("chat_messages", [])
    history.append(msg)
    # Keep last 200 messages so we never bloat past Dynamo's 400 KB item cap.
    if len(history) > 200:
        s["chat_messages"] = history[-200:]
    save_session(s)
    return msg


def get_chat_messages(session_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return []
    return list(s.get("chat_messages", []))[-limit:]


def set_inspected_node(
    session_id: str,
    inspector_event: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return None
    s["last_inspected_node"] = {
        "ts": _now_iso(),
        "event": inspector_event,
    }
    save_session(s)
    return s


def append_runtime_telemetry(
    session_id: str,
    *,
    category: str,
    payload: Dict[str, Any],
    source: str = "frontend",
) -> Optional[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return None
    severity = str((payload or {}).get("severity") or "info").lower()
    if not should_accept_event(severity):
        return {
            "id": f"rtel_drop_{uuid.uuid4().hex[:8]}",
            "ts": _now_iso(),
            "category": str(category or "runtime"),
            "source": str(source or "frontend"),
            "dropped": True,
            "reason": "sampled_out",
            "severity": severity,
        }
    norm_payload = normalize_payload(payload or {})
    entry = {
        "id": f"rtel_{uuid.uuid4().hex[:10]}",
        "ts": _now_iso(),
        "category": str(category or "runtime"),
        "source": str(source or "frontend"),
        "severity": severity,
        "payload": norm_payload,
    }
    rows = s.setdefault("runtime_telemetry", [])
    rows.append(entry)
    if len(rows) > 300:
        s["runtime_telemetry"] = rows[-300:]
    save_session(s)
    return entry


def get_runtime_telemetry(session_id: str, limit: int = 120) -> List[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return []
    rows = list(s.get("runtime_telemetry", []))
    return rows[-max(1, int(limit)) :]


# ---------------------------------------------------------------------------
# Helpers consumed by API layer
# ---------------------------------------------------------------------------

def session_summary(s: Dict[str, Any]) -> Dict[str, Any]:
    """Lightweight projection for list responses."""
    return {
        "id": s["id"],
        "title": s.get("title", "Untitled"),
        "kind": s.get("kind"),
        "source_id": s.get("source_id"),
        "status": s.get("status", "draft"),
        "branch_head": s.get("branch_head"),
        "framework": (s.get("bootstrap") or {}).get("framework"),
        "preview_url": (s.get("runtime") or {}).get("url"),
        "edit_count": len(s.get("edit_history", [])),
        "created_at": s.get("created_at"),
        "updated_at": s.get("updated_at"),
    }


__all__ = [
    "SessionKind",
    "create_session",
    "save_session",
    "load_session",
    "list_user_sessions",
    "delete_session",
    "set_bootstrap_plan",
    "set_runtime",
    "record_edit",
    "record_checkpoint",
    "set_inspected_node",
    "append_runtime_telemetry",
    "get_runtime_telemetry",
    "session_summary",
]
