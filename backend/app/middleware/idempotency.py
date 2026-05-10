"""
DocuVerse — Idempotency Key Middleware  (SEV-1 fix: C4)

Any POST request that includes an ``Idempotency-Key`` header will have its
response cached for IDEMPOTENCY_TTL seconds. Duplicate requests with the
same key (per user) receive the cached response immediately.

Wire by adding the ``IdempotencyMiddleware`` in ``main.py`` and decorating
expensive endpoints with the ``idempotent`` dependency.

Cache is in-memory (process-local) with a TTL.  When Redis is available,
replace ``_cache`` with a Redis client.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, Optional, Tuple

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

IDEMPOTENCY_TTL = 60  # seconds

# {key: (stored_at, status_code, body_dict)}
_cache: Dict[str, Tuple[float, int, Any]] = {}


def _evict_expired() -> None:
    now = time.time()
    stale = [k for k, (t, _, _) in _cache.items() if now - t > IDEMPOTENCY_TTL]
    for k in stale:
        del _cache[k]


def _cache_key(user_id: str, idempotency_key: str) -> str:
    raw = f"{user_id}:{idempotency_key}"
    return hashlib.sha256(raw.encode()).hexdigest()


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """Cache POST responses by (user_id, Idempotency-Key) for IDEMPOTENCY_TTL s."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Never touch CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)
        # Only POST/PUT/PATCH; skip GETs and DELETEs
        if request.method not in ("POST", "PUT", "PATCH"):
            return await call_next(request)

        idem_key = request.headers.get("Idempotency-Key")
        if not idem_key:
            return await call_next(request)

        # Need a user identifier — pulled from JWT sub in auth header
        user_id = _extract_user_id(request)
        if not user_id:
            return await call_next(request)

        cache_key = _cache_key(user_id, idem_key)

        _evict_expired()
        cached = _cache.get(cache_key)
        if cached:
            _, status_code, body = cached
            resp = JSONResponse(content=body, status_code=status_code)
            resp.headers["Idempotency-Replay"] = "true"
            return resp

        response = await call_next(request)

        # Cache only successful responses
        if response.status_code < 400:
            body_bytes = b""
            async for chunk in response.body_iterator:  # type: ignore[attr-defined]
                body_bytes += chunk
            try:
                body_dict = json.loads(body_bytes)
                _cache[cache_key] = (time.time(), response.status_code, body_dict)
                return JSONResponse(
                    content=body_dict,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                )
            except Exception:
                pass

        return response


def _extract_user_id(request: Request) -> Optional[str]:
    """Extract user_id from JWT without full validation (just for cache keying)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    try:
        import base64
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        return payload.get("user_id")
    except Exception:
        return None
