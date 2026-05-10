"""
DocuVerse — Per-User Rate Limiting  (SEV-1 fix: E1, E2)

Provides a simple token-bucket rate limiter that is dependency-injected
into expensive endpoints (screen generation, magic-build, edit, launch).

When slowapi / Redis are available we can swap to them; this implementation
is in-memory and works with a single Gunicorn worker.

Usage (in an endpoint):

    from app.middleware.rate_limiter import RateLimiter, TIER_LIMITS

    @router.post("/generate")
    async def generate(
        project_id: str,
        authorization: str = Header(None),
        _: None = Depends(RateLimiter("ai_call")),
    ):
        ...
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import Depends, Header, HTTPException

from app.api.endpoints.auth import get_current_user
from app.errors import ErrorCode, api_error_response

# {tier: {action: (max_calls, window_seconds)}}
TIER_LIMITS: Dict[str, Dict[str, Tuple[int, int]]] = {
    "free": {
        "ai_call":      (15, 3600),   # 15 AI calls / hour
        "generate":     (5,  3600),   # 5 full generations / hour
        "launch":       (10, 3600),   # 10 preview launches / hour
        "bootstrap":    (20, 3600),   # 20 bootstrap runs / hour
    },
    "pro": {
        "ai_call":      (100, 3600),
        "generate":     (30,  3600),
        "launch":       (50,  3600),
        "bootstrap":    (100, 3600),
    },
    "team": {
        "ai_call":      (500, 3600),
        "generate":     (100, 3600),
        "launch":       (200, 3600),
        "bootstrap":    (500, 3600),
    },
}

# {(user_id, action): deque of timestamps}
_buckets: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)


def _check_rate_limit(user_id: str, tier: str, action: str) -> None:
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["free"])
    max_calls, window = limits.get(action, (30, 3600))

    bucket = _buckets[(user_id, action)]
    now = time.time()

    # Evict timestamps older than the window
    while bucket and now - bucket[0] > window:
        bucket.popleft()

    if len(bucket) >= max_calls:
        retry_after = int(window - (now - bucket[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=api_error_response(
                ErrorCode.QUOTA_RATE_LIMIT,
                f"Rate limit exceeded: {max_calls} {action} calls per {window}s.",
                status=429,
                retry_after=retry_after,
            ).body,
            headers={"Retry-After": str(retry_after)},
        )

    bucket.append(now)


class RateLimiter:
    """FastAPI dependency that enforces per-user rate limits."""

    def __init__(self, action: str):
        self.action = action

    async def __call__(self, authorization: str = Header(None)) -> None:
        user = await get_current_user(authorization)
        if not user:
            return  # let the endpoint's own auth guard handle unauthenticated
        tier = getattr(user, "subscription_tier", "free") or "free"
        _check_rate_limit(user.id, tier, self.action)
