"""
DocuVerse Studio — Vercel Deploy Adapter  (Phase 3)

One-click deploys for Studio sessions. Uses the Vercel REST API directly so
we don't need the Vercel CLI on the server.

Flow:
  1. User connects Vercel token via Integrations.
  2. ``create_deployment`` POSTs files to ``POST /v13/deployments`` (returns quickly).
  3. The browser polls ``poll_deployment`` (GET deployment) until READY / ERROR so the
     HTTP request is not held open for entire build (avoids gateway timeouts).

Notes:
  * Vercel's deployment API takes the full file inline for small projects;
    for bigger projects you upload by SHA and reference. For the Phase 3
    cut we go with the inline path (capped at ``_MAX_BYTES_TOTAL`` so we
    never accidentally upload a 200 MB ``node_modules`` / ``.next``).
  * Skips the same dirs as the GitHub workflow.
"""

from __future__ import annotations

import base64
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class VercelError(Exception):
    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body
        super().__init__(f"Vercel API error {status}: {body!r}")


_VERCEL_API = "https://api.vercel.com"
_DEPLOY_URL = f"{_VERCEL_API}/v13/deployments"

# Long server-side waits exceed most reverse-proxy / client timeouts; polling lives on the client.


def _team_params(team_id: Optional[str]) -> Dict[str, str]:
    if not team_id or not str(team_id).strip():
        return {}
    return {"teamId": str(team_id).strip()}


def _https_url(host_or_url: Optional[str]) -> Optional[str]:
    if not host_or_url:
        return None
    s = str(host_or_url).strip()
    if s.startswith("http://") or s.startswith("https://"):
        return s
    return f"https://{s}"


def _best_public_url(data: Dict[str, Any]) -> Optional[str]:
    """Prefer a stable production *.vercel.app alias when Vercel assigns one."""
    candidates: List[str] = []
    al = data.get("alias")
    if isinstance(al, str):
        candidates.append(al)
    elif isinstance(al, list):
        for x in al:
            if isinstance(x, str):
                candidates.append(x)
            elif isinstance(x, dict):
                dom = x.get("domain") or x.get("url")
                if isinstance(dom, str):
                    candidates.append(dom)
    auto = data.get("automaticAliases")
    if isinstance(auto, list):
        for x in auto:
            if isinstance(x, str):
                candidates.append(x)
    for ali in candidates:
        if ".vercel.app" in ali:
            u = _https_url(ali.strip())
            if u:
                return u
    return _https_url(data.get("url"))


def _deployment_error_message(data: Dict[str, Any]) -> str:
    if data.get("errorMessage"):
        return str(data["errorMessage"])
    err = data.get("error")
    if isinstance(err, dict) and err.get("message"):
        return str(err["message"])
    return "Vercel reported a failed deployment (see build logs in Vercel dashboard)."


async def _fetch_deployment(
    client: httpx.AsyncClient,
    deployment_id: str,
    vercel_access_token: str,
    team_id: Optional[str],
) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {vercel_access_token}"}
    resp = await client.get(
        f"{_VERCEL_API}/v13/deployments/{deployment_id}",
        headers=headers,
        params=_team_params(team_id),
    )
    if resp.status_code >= 300:
        raise VercelError(resp.status_code, resp.text)
    return resp.json()


_SKIP_DIRS = {
    "node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build",
    ".git", "__pycache__", ".turbo", ".vercel", ".cache", "out",
    "coverage", ".docusaurus", "venv", ".venv", "env", ".pytest_cache",
}
_SKIP_FILES = {"__dv_bridge.js"}
_MAX_BYTES_TOTAL = 50 * 1024 * 1024     # 50 MB upload cap
_MAX_FILE_BYTES = 5 * 1024 * 1024       # 5 MB per file


# ---------------------------------------------------------------------------
# OAuth helpers (token exchange)
# ---------------------------------------------------------------------------

async def exchange_vercel_oauth_code(
    *,
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> Dict[str, Any]:
    """Exchange a Vercel OAuth ``code`` for an access token.

    Vercel's flow: ``POST https://api.vercel.com/v2/oauth/access_token``
    with ``client_id``, ``client_secret``, ``code``, ``redirect_uri``.
    """
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{_VERCEL_API}/v2/oauth/access_token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise VercelError(resp.status_code, resp.text)
    return resp.json()


# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------

def _iter_files(workspace: Path):
    stack: List[Path] = [workspace]
    while stack:
        d = stack.pop()
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.name in _SKIP_FILES:
                continue
            if entry.is_dir():
                if entry.name in _SKIP_DIRS or entry.name.startswith("."):
                    if entry.name not in {".github"}:
                        continue
                stack.append(entry)
            elif entry.is_file():
                yield entry


def _gather_payload(workspace: Path) -> Dict[str, Any]:
    """Build the inline files payload for the Vercel deploy API."""
    file_blobs: List[Dict[str, Any]] = []
    total_bytes = 0
    skipped: List[Dict[str, str]] = []

    for path in _iter_files(workspace):
        try:
            size = path.stat().st_size
        except OSError as e:
            skipped.append({"path": str(path), "reason": str(e)})
            continue
        if size > _MAX_FILE_BYTES:
            skipped.append({"path": str(path), "reason": f"size>{_MAX_FILE_BYTES}"})
            continue
        if total_bytes + size > _MAX_BYTES_TOTAL:
            skipped.append({"path": str(path), "reason": "batch>cap"})
            continue
        try:
            data = path.read_bytes()
        except OSError as e:
            skipped.append({"path": str(path), "reason": str(e)})
            continue

        file_blobs.append({
            "file": path.relative_to(workspace).as_posix(),
            "data": base64.b64encode(data).decode("ascii"),
            "encoding": "base64",
        })
        total_bytes += size
    return {"files": file_blobs, "total_bytes": total_bytes, "skipped": skipped}


async def create_deployment(
    *,
    workspace_path: str,
    project_name: str,
    vercel_access_token: str,
    framework: Optional[str] = None,
    target: str = "production",
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """POST the workspace to Vercel. Returns immediately (browser polls build state).

    Returns: ``{ "id", "skipped", "inspectorUrl", "readyState" }``.
    """
    workspace = Path(workspace_path)
    if not workspace.is_dir():
        raise FileNotFoundError(f"workspace_path missing: {workspace_path}")

    payload = _gather_payload(workspace)
    if not payload["files"]:
        raise VercelError(400, "no files to upload")

    # Slug-safe project name
    name = "".join(c if c.isalnum() or c in "-_" else "-" for c in project_name).strip("-").lower()
    if not name:
        name = "studio-app"
    name = name[:60]

    body: Dict[str, Any] = {
        "name": name,
        "files": payload["files"],
        "target": target,
        "projectSettings": {
            "framework": framework or "nextjs",
        },
    }

    headers = {
        "Authorization": f"Bearer {vercel_access_token}",
        "Content-Type": "application/json",
    }
    q = _team_params(team_id)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(_DEPLOY_URL, json=body, headers=headers, params=q)

    if resp.status_code >= 300:
        raise VercelError(resp.status_code, resp.text)
    data = resp.json()
    dep_id = data.get("id")
    if not dep_id:
        raise VercelError(502, "Vercel did not return a deployment id")

    return {
        "id": str(dep_id),
        "skipped": payload["skipped"],
        "inspectorUrl": data.get("inspectorUrl"),
        "readyState": data.get("readyState"),
    }


async def poll_deployment(
    *,
    deployment_id: str,
    vercel_access_token: str,
    team_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Single GET. The Studio UI polls every few seconds until ``terminal`` is true."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        data = await _fetch_deployment(client, deployment_id, vercel_access_token, team_id)
    state = (data.get("readyState") or "").upper()
    terminal = state in ("READY", "ERROR", "CANCELED")
    url_out: Optional[str] = None
    err_msg: Optional[str] = None
    if state == "READY":
        url_out = _best_public_url(data)
    elif state == "ERROR":
        err_msg = _deployment_error_message(data)
    elif state == "CANCELED":
        err_msg = "Deployment was canceled on Vercel."
    return {
        "id": data.get("id"),
        "readyState": data.get("readyState"),
        "inspectorUrl": data.get("inspectorUrl"),
        "terminal": terminal,
        "url": url_out,
        "errorMessage": err_msg,
    }
