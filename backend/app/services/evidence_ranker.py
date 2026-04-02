"""
Rank and de-duplicate provenance evidence from mined GitHub history.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from app.models.schemas import EvidenceLink, EvidenceSourceType
from app.services.history_miner import MinedHistory


def _stable_id(prefix: str, url: str) -> str:
    h = hashlib.sha256(f"{prefix}:{url}".encode()).hexdigest()[:12]
    return f"{prefix}_{h}"


def _parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def rank_and_build_links(history: MinedHistory, *, max_links: int = 24) -> list[EvidenceLink]:
    """Turn mined history into scored, de-duplicated ``EvidenceLink`` rows."""
    candidates: list[tuple[float, EvidenceLink]] = []

    for pr in history.pulls:
        url = pr.html_url
        excerpt = (pr.body or "")[:400].replace("\r", " ")
        score = 0.75
        if pr.merged_at:
            score += 0.1
        if len(pr.title or "") > 10:
            score += 0.03
        dt = _parse_date(pr.merged_at)
        candidates.append(
            (
                score,
                EvidenceLink(
                    id=_stable_id("pr", url),
                    source_type=EvidenceSourceType.PULL_REQUEST,
                    source_url=url,
                    title=pr.title,
                    excerpt=excerpt,
                    confidence=min(1.0, score),
                    created_at=dt,
                ),
            )
        )

    for commit in history.commits:
        url = commit.html_url
        msg_first = (commit.message or "").split("\n")[0][:200]
        msg_full = (commit.message or "")[:400]
        score = 0.45
        if len(history.commit_to_pr_numbers.get(commit.sha, [])) > 0:
            score += 0.15
        dt = _parse_date(commit.date)
        if dt:
            score += 0.02
        candidates.append(
            (
                score,
                EvidenceLink(
                    id=_stable_id("c", commit.sha),
                    source_type=EvidenceSourceType.COMMIT,
                    source_url=url,
                    title=msg_first or commit.sha[:7],
                    excerpt=msg_full,
                    confidence=min(1.0, score),
                    created_at=dt,
                ),
            )
        )

    for issue in history.issues:
        url = issue.html_url
        candidates.append(
            (
                0.55,
                EvidenceLink(
                    id=_stable_id("iss", url),
                    source_type=EvidenceSourceType.ISSUE,
                    source_url=url,
                    title=issue.title,
                    excerpt="",
                    confidence=0.55,
                    created_at=None,
                ),
            )
        )

    seen_url: set[str] = set()
    ordered: list[EvidenceLink] = []
    for score, link in sorted(candidates, key=lambda x: (-x[0], x[1].source_url)):
        if link.source_url in seen_url:
            continue
        seen_url.add(link.source_url)
        ordered.append(link)
        if len(ordered) >= max_links:
            break

    if not ordered:
        ordered.append(
            EvidenceLink(
                id=f"placeholder_{uuid.uuid4().hex[:8]}",
                source_type=EvidenceSourceType.OTHER,
                source_url="",
                title="No Git history found for this path",
                excerpt="Try another file or ensure the default branch matches GitHub.",
                confidence=0.1,
                created_at=None,
            )
        )

    return ordered
