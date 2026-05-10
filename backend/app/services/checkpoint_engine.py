"""
DocuVerse Studio — Checkpoint / Undo-Redo Engine  (Phase 2)

Records per-session file deltas so the workspace gets real, multi-step
undo/redo. Used by the Surgical Edit Engine right after a successful patch.

Design:
  * One checkpoint = an atomic edit. It stores ``files`` as a list of
    ``{path, before, after}`` records.
  * Each session keeps a timeline of checkpoints with a ``state`` of
    ``applied`` or ``undone``.
  * ``undo_last`` flips the most recent ``applied`` -> ``undone`` and writes
    ``before`` back to disk.
  * ``redo_last`` flips the most recent ``undone`` -> ``applied`` and writes
    ``after`` back to disk.

Storage budget: each checkpoint is capped at 256 KB of file content total;
we keep the last 50 checkpoints per session. Beyond that we rotate the
oldest entries — long undo histories are an anti-pattern (use Git).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.studio_session_service import load_session, save_session

logger = logging.getLogger(__name__)

_MAX_CHECKPOINTS_PER_SESSION = 50
_MAX_BYTES_PER_CHECKPOINT = 256 * 1024


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _truncate(s: Optional[str], cap: int) -> Optional[str]:
    if s is None:
        return None
    if len(s.encode("utf-8", errors="replace")) <= cap:
        return s
    # Hard cap with marker — restore() will refuse to apply truncated content.
    return s[: cap // 2] + "\n\n/* DV_TRUNCATED */"


def _path_inside(workspace: Path, p: str) -> Path:
    """Resolve and ensure the path is contained inside the workspace."""
    abs_path = (workspace / p).resolve()
    try:
        abs_path.relative_to(workspace.resolve())
    except ValueError as e:
        raise ValueError(f"Path escapes workspace: {p}") from e
    return abs_path


def record_checkpoint(
    session_id: str,
    *,
    label: str,
    files: List[Dict[str, Optional[str]]],
    edit_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Record a checkpoint.

    Args:
        files: list of dicts ``{path, before, after}`` (path is workspace-relative).
               ``before`` may be None if the file did not exist before.
               ``after`` may be None if the file was deleted.
    """
    s = load_session(session_id)
    if not s:
        return None

    # Cap each file's stored content
    per_file_cap = max(_MAX_BYTES_PER_CHECKPOINT // max(1, len(files)), 4096)
    sanitized: List[Dict[str, Any]] = []
    for f in files:
        path = str(f.get("path", "")).strip()
        if not path or path.startswith("/") or ".." in path.split("/"):
            continue
        sanitized.append({
            "path": path,
            "before": _truncate(f.get("before"), per_file_cap),
            "after": _truncate(f.get("after"), per_file_cap),
        })
    if not sanitized:
        return None

    cp = {
        "id": f"cp_{uuid.uuid4().hex[:10]}",
        "ts": _now_iso(),
        "label": label,
        "edit_id": edit_id,
        "state": "applied",
        "files": sanitized,
    }
    history = s.setdefault("checkpoints", [])
    history.append(cp)
    if len(history) > _MAX_CHECKPOINTS_PER_SESSION:
        s["checkpoints"] = history[-_MAX_CHECKPOINTS_PER_SESSION:]
    save_session(s)
    return cp


def _restore(workspace_path: str, cp: Dict[str, Any], target: str) -> List[str]:
    """Write either the ``before`` (target='before') or ``after`` content of
    every file in the checkpoint. Returns list of touched relative paths.
    """
    workspace = Path(workspace_path)
    if not workspace.is_dir():
        raise FileNotFoundError(f"workspace_path missing: {workspace_path}")

    touched: List[str] = []
    for f in cp.get("files", []):
        path = f.get("path")
        if not path:
            continue
        try:
            abs_path = _path_inside(workspace, path)
        except ValueError as e:
            logger.warning(f"Checkpoint restore: {e}")
            continue

        content = f.get(target)
        if content is not None and "/* DV_TRUNCATED */" in (content or ""):
            logger.warning(
                f"Skipping restore of {path}: content was truncated at checkpoint time."
            )
            continue

        if content is None:
            # Originally absent — delete the file if it exists now.
            try:
                if abs_path.exists():
                    abs_path.unlink()
                    touched.append(path)
            except OSError as e:
                logger.warning(f"Checkpoint restore unlink failed: {e}")
        else:
            abs_path.parent.mkdir(parents=True, exist_ok=True)
            abs_path.write_text(content, encoding="utf-8")
            touched.append(path)
    return touched


def undo_last(session_id: str) -> Optional[Dict[str, Any]]:
    """Undo the most recent ``applied`` checkpoint.  Returns the checkpoint
    dict or None if there is nothing to undo."""
    s = load_session(session_id)
    if not s:
        return None

    workspace = s.get("workspace_path")
    if not workspace:
        raise RuntimeError("Session has no workspace_path; bootstrap first.")

    history: List[Dict[str, Any]] = s.get("checkpoints", [])
    target_idx = None
    for i in range(len(history) - 1, -1, -1):
        if history[i].get("state") == "applied":
            target_idx = i
            break
    if target_idx is None:
        return None

    cp = history[target_idx]
    touched = _restore(workspace, cp, "before")
    cp["state"] = "undone"
    cp["last_action"] = "undo"
    cp["last_action_at"] = _now_iso()
    save_session(s)
    return {"checkpoint": cp, "files_touched": touched}


def redo_last(session_id: str) -> Optional[Dict[str, Any]]:
    """Redo the most recent ``undone`` checkpoint."""
    s = load_session(session_id)
    if not s:
        return None
    workspace = s.get("workspace_path")
    if not workspace:
        raise RuntimeError("Session has no workspace_path; bootstrap first.")

    history: List[Dict[str, Any]] = s.get("checkpoints", [])
    # Most recent undone (i.e. youngest undone in chronological order).
    target_idx = None
    for i in range(len(history) - 1, -1, -1):
        if history[i].get("state") == "undone":
            target_idx = i
            break
    if target_idx is None:
        return None

    cp = history[target_idx]
    touched = _restore(workspace, cp, "after")
    cp["state"] = "applied"
    cp["last_action"] = "redo"
    cp["last_action_at"] = _now_iso()
    save_session(s)
    return {"checkpoint": cp, "files_touched": touched}


def list_checkpoints(session_id: str) -> List[Dict[str, Any]]:
    s = load_session(session_id)
    if not s:
        return []
    return list(s.get("checkpoints", []))


def jump_to(session_id: str, checkpoint_id: str) -> Optional[Dict[str, Any]]:
    """Restore the workspace to the state at ``checkpoint_id``.

    Walks the timeline from latest applied -> oldest, applying ``before`` for
    each checkpoint younger than the target, and ``after`` for each one older
    than (or equal to) the target. Cheapest correct implementation.
    """
    s = load_session(session_id)
    if not s:
        return None
    workspace = s.get("workspace_path")
    if not workspace:
        raise RuntimeError("Session has no workspace_path; bootstrap first.")

    history: List[Dict[str, Any]] = s.get("checkpoints", [])
    idx = next(
        (i for i, c in enumerate(history) if c.get("id") == checkpoint_id),
        None,
    )
    if idx is None:
        return None

    touched: List[str] = []
    # Roll forward: every checkpoint <= idx should be in 'after' state.
    for i, cp in enumerate(history):
        if i <= idx:
            if cp.get("state") != "applied":
                touched.extend(_restore(workspace, cp, "after"))
                cp["state"] = "applied"
        else:
            if cp.get("state") != "undone":
                touched.extend(_restore(workspace, cp, "before"))
                cp["state"] = "undone"
    save_session(s)
    return {"jumped_to": checkpoint_id, "files_touched": touched}
