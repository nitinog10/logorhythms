"""
DocuVerse Provenance API — Why Graph + Assumption Ledger (GitHub-backed).
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import repositories_db, _ensure_repo_cloned
from app.models.schemas import (
    ProvenanceQueryRequest,
    ProvenanceQueryResponse,
    ProvenanceFeedbackRequest,
    ProvenanceRefreshBody,
    StaleAssumptionAlert,
    APIResponse,
)
from app.services.provenance_service import get_or_build_provenance, collect_stale_rollup
from app.services.persistence import load_provenance_card, save_provenance_card

router = APIRouter()


async def _guard_repo(repo_id: str, authorization: str | None):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    repo = repositories_db.get(repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    return user, repo


@router.post("/query", response_model=ProvenanceQueryResponse)
async def query_provenance(
    body: ProvenanceQueryRequest,
    authorization: str = Header(None),
):
    """Build or return a cached Provenance Card for a file (optional symbol)."""
    user, repo = await _guard_repo(body.repository_id, authorization)

    # ── Usage limit check ──
    from app.services.billing_service import check_usage_limit
    from app.services.persistence import load_subscription, update_subscription_usage
    sub = load_subscription(user.id)
    tier = sub.get("tier", "free") if sub else "free"
    usage = sub.get("usage", {}) if sub else {}
    current_count = usage.get("provenance", 0)
    allowed, limit = check_usage_limit(tier, "provenance", current_count)
    if not allowed:
        raise HTTPException(status_code=403, detail={
            "code": "LIMIT_EXCEEDED",
            "feature": "provenance",
            "used": current_count,
            "limit": limit,
            "tier": tier,
            "upgrade_url": "/pricing",
        })

    if repo.source != "github":
        raise HTTPException(
            status_code=400,
            detail="Provenance is available for GitHub-connected repositories only.",
        )

    if not repo.local_path or not os.path.exists(repo.local_path):
        if repo.source == "upload":
            raise HTTPException(
                status_code=400,
                detail="Uploaded project files are not available. Provenance needs indexed files.",
            )
        await _ensure_repo_cloned(repo, user.access_token)
        if not repo.local_path or not os.path.exists(repo.local_path):
            raise HTTPException(status_code=500, detail="Could not prepare local repository files.")

    try:
        card, from_cache = await get_or_build_provenance(
            repo,
            user.access_token,
            body.file_path,
            symbol=body.symbol,
            symbol_type=body.symbol_type,
            force_refresh=body.force_refresh,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Provenance generation failed: {e}")

    # Increment usage counter (only for newly generated cards, not cache hits)
    if not from_cache:
        update_subscription_usage(user.id, "provenance")

    return ProvenanceQueryResponse(success=True, card=card, from_cache=from_cache)


@router.get("/{repo_id}/symbol", response_model=ProvenanceQueryResponse)
async def get_symbol_provenance(
    repo_id: str,
    file_path: str = Query(..., description="Path to file in repo"),
    symbol: Optional[str] = Query(None),
    symbol_type: Optional[str] = Query(None),
    refresh: bool = Query(False),
    authorization: str = Header(None),
):
    """GET convenience wrapper for file/symbol provenance."""
    body = ProvenanceQueryRequest(
        repository_id=repo_id,
        file_path=file_path,
        symbol=symbol,
        symbol_type=symbol_type,
        force_refresh=refresh,
    )
    return await query_provenance(body, authorization)


@router.get("/{repo_id}/stale-assumptions", response_model=list[StaleAssumptionAlert])
async def list_stale_assumptions(
    repo_id: str,
    authorization: str = Header(None),
):
    """Roll up stale-assumption alerts from cached provenance cards."""
    _, repo = await _guard_repo(repo_id, authorization)
    if repo.source != "github":
        raise HTTPException(
            status_code=400,
            detail="Stale assumption rollup is available for GitHub repositories only.",
        )
    return collect_stale_rollup(repo_id)


@router.post("/{repo_id}/refresh", response_model=ProvenanceQueryResponse)
async def refresh_provenance(
    repo_id: str,
    body: ProvenanceRefreshBody,
    authorization: str = Header(None),
):
    """Force-refresh a card (same as query with force_refresh)."""
    req = ProvenanceQueryRequest(
        repository_id=repo_id,
        file_path=body.file_path,
        symbol=body.symbol,
        symbol_type=body.symbol_type,
        force_refresh=True,
    )
    return await query_provenance(req, authorization)


@router.post("/{repo_id}/feedback", response_model=APIResponse)
async def provenance_feedback(
    repo_id: str,
    body: ProvenanceFeedbackRequest,
    authorization: str = Header(None),
):
    """Attach user feedback to the cached card metadata."""
    user, repo = await _guard_repo(repo_id, authorization)
    _ = user
    card = load_provenance_card(repo_id, body.file_path, body.symbol)
    if not card:
        raise HTTPException(status_code=404, detail="No cached provenance card for this target")

    fb = card.metadata.get("feedback") or []
    fb.append({"rating": body.rating})
    card.metadata["feedback"] = fb
    save_provenance_card(card)
    return APIResponse(success=True, message="Feedback recorded")
