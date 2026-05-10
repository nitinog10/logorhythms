"""
DocuVerse — Preview Token  (SEV-1 fix: A4)

Lightweight, time-limited signed tokens that authorise an iframe to load a
preview without exposing the user's main JWT.  The token encodes:
  - user_id
  - resource_id (project_id or session_id)
  - issued_at / expires_at  (TTL: 4 hours)

Usage:
    # Backend — issue a token when the frontend requests a preview:
    token = issue_preview_token(user_id, project_id)
    return {"preview_url": f"/api/builder/projects/{project_id}/preview?pt={token}"}

    # Backend — validate on the preview GET endpoint:
    require_preview_token(token, project_id)

    # Frontend — embed as ?pt=<token> in the iframe src.
"""
from __future__ import annotations

import secrets
import time
from typing import Optional

from fastapi import HTTPException

from app.config import get_settings

_PREVIEW_TOKEN_TTL = 4 * 3600  # 4 hours in seconds

# In-memory store: {token -> (user_id, resource_id, expires_at)}
# Replace with Redis SETEX in production.
_preview_tokens: dict[str, tuple[str, str, float]] = {}


def _evict_expired() -> None:
    now = time.time()
    stale = [t for t, (_, _, exp) in _preview_tokens.items() if now > exp]
    for t in stale:
        del _preview_tokens[t]


def issue_preview_token(user_id: str, resource_id: str) -> str:
    """Issue a short-lived opaque preview token for a specific resource."""
    _evict_expired()
    token = secrets.token_urlsafe(24)
    expires_at = time.time() + _PREVIEW_TOKEN_TTL
    _preview_tokens[token] = (user_id, resource_id, expires_at)
    return token


def validate_preview_token(token: Optional[str], resource_id: str) -> str:
    """Validate a preview token.  Returns user_id on success, raises 401 on failure."""
    if not token:
        raise HTTPException(status_code=401, detail="Preview token required")
    _evict_expired()
    entry = _preview_tokens.get(token)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired preview token")
    user_id, stored_resource, expires_at = entry
    if time.time() > expires_at:
        del _preview_tokens[token]
        raise HTTPException(status_code=401, detail="Preview token expired")
    if stored_resource != resource_id:
        raise HTTPException(status_code=403, detail="Preview token resource mismatch")
    return user_id
