"""
Orchestrates DocuVerse Provenance: GitHub history → ranked evidence → LLM card.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.config import get_settings
from app.models.schemas import (
    Repository,
    ProvenanceCard,
    EvidenceLink,
    AssumptionEntry,
    AssumptionStatus,
    StaleAssumptionAlert,
    DecisionThread,
)
from app.services.github_service import GitHubService
from app.services.history_miner import mine_file_history
from app.services.evidence_ranker import rank_and_build_links
from app.services.assumption_extractor import extract_provenance_fields, map_extraction_to_models
from app.api.endpoints.files import _find_symbol_context
from app.services.persistence import (
    load_provenance_card,
    save_provenance_card,
    list_provenance_cards_for_repo,
)


def _snippet_for_symbol(
    content: str,
    file_path: str,
    symbol: Optional[str],
    symbol_type: Optional[str],
    local_full_path: str,
) -> tuple[str, Optional[str], Optional[str]]:
    """Return code snippet and resolved symbol / type."""
    if not symbol:
        lines = content.splitlines()
        return "\n".join(lines[:200]), None, None

    ctx = _find_symbol_context(local_full_path, file_path, symbol)
    if not ctx or not ctx.get("found"):
        lines = content.splitlines()[:120]
        return "\n".join(lines), symbol, symbol_type

    start = max(0, int(ctx["start_line"]) - 1)
    end = min(len(content.splitlines()), int(ctx["end_line"]))
    chunk = "\n".join(content.splitlines()[start:end])
    return chunk, ctx.get("name") or symbol, ctx.get("type") or symbol_type


def _heuristic_stale_assumptions(
    assumptions: list[AssumptionEntry],
    code_lower: str,
    file_path: str,
    symbol: Optional[str],
) -> list[StaleAssumptionAlert]:
    """Lightweight stale signals to complement LLM stale_hints."""
    alerts: list[StaleAssumptionAlert] = []
    keywords = ("temporary", "until we", "legacy", "old client", "workaround", "hack", "single region")
    for a in assumptions:
        low = a.statement.lower()
        if any(k in low for k in keywords):
            reason = "Language suggests time-bounded or legacy intent — verify against current code and traffic."
            if "async" in code_lower and "sync" in low:
                reason = "Code appears asynchronous while assumption mentions synchronous behavior."
            alerts.append(
                StaleAssumptionAlert(
                    id=f"heur_{uuid.uuid4().hex[:8]}",
                    assumption_id=a.id,
                    statement=a.statement,
                    file_path=file_path,
                    symbol=symbol,
                    reason=reason,
                    severity="medium",
                    evidence_ids=a.evidence_ids[:3],
                )
            )
    return alerts


async def get_or_build_provenance(
    repo: Repository,
    user_access_token: str,
    file_path: str,
    *,
    symbol: Optional[str] = None,
    symbol_type: Optional[str] = None,
    force_refresh: bool = False,
) -> tuple[ProvenanceCard, bool]:
    """
    Return (card, from_cache). Uses cache unless *force_refresh* or missing.
    """
    settings = get_settings()
    if repo.source != "github":
        raise ValueError("Provenance requires a GitHub-connected repository.")

    safe_path = os.path.normpath(file_path).lstrip(os.sep).lstrip("/")
    if not repo.local_path or not os.path.exists(repo.local_path):
        raise ValueError("Repository files are not available locally.")

    ttl = settings.provenance_cache_ttl_seconds
    if not force_refresh and ttl > 0:
        cached = load_provenance_card(repo.id, safe_path, symbol)
        if cached:
            age = (datetime.now(timezone.utc) - cached.updated_at).total_seconds()
            if age < ttl:
                return cached, True

    local_full = os.path.join(repo.local_path, safe_path)
    if not os.path.exists(local_full):
        raise ValueError("File not found in local repository.")

    with open(local_full, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    snippet, sym_resolved, sym_type_resolved = _snippet_for_symbol(
        content, safe_path, symbol, symbol_type, local_full
    )

    owner, name = repo.full_name.split("/", 1)
    gh = GitHubService(user_access_token)
    history = await mine_file_history(
        gh,
        owner,
        name,
        safe_path,
        branch=repo.default_branch or "main",
        max_commits=settings.provenance_max_history_commits,
        max_prs=settings.provenance_max_prs,
    )
    evidence_links = rank_and_build_links(history, max_links=28)

    summaries: list[str] = []
    id_by_index: list[str] = []
    for link in evidence_links:
        if not link.source_url:
            continue
        summaries.append(f"{link.title}: {link.excerpt}".strip())
        id_by_index.append(link.id)

    if not summaries:
        for link in evidence_links:
            summaries.append(link.title)
            id_by_index.append(link.id)

    extracted = await extract_provenance_fields(
        file_path=safe_path,
        code_snippet=snippet,
        evidence_summaries=summaries,
        symbol=sym_resolved or symbol,
        symbol_type=sym_type_resolved or symbol_type,
    )

    cur, origin, decision, asm_tuples, stale_tuples, safe_notes, thread_tuples, conf = map_extraction_to_models(
        extracted,
        id_by_index,
        safe_path,
        sym_resolved or symbol,
    )

    assumptions: list[AssumptionEntry] = []
    for aid, stmt, status_s, cfd, eids in asm_tuples:
        try:
            st = AssumptionStatus(status_s)
        except ValueError:
            st = AssumptionStatus.ACTIVE
        assumptions.append(
            AssumptionEntry(
                id=aid,
                statement=stmt,
                status=st,
                confidence=cfd,
                evidence_ids=eids,
                last_validated_at=None,
            )
        )

    stmt_to_id = {a.statement: a.id for a in assumptions}
    stale_alerts: list[StaleAssumptionAlert] = []
    for sid, stmt, reason, eids in stale_tuples:
        aid = stmt_to_id.get(stmt, "")
        stale_alerts.append(
            StaleAssumptionAlert(
                id=sid,
                assumption_id=aid,
                statement=stmt,
                file_path=safe_path,
                symbol=sym_resolved or symbol,
                reason=reason,
                severity="high" if "break" in reason.lower() else "medium",
                evidence_ids=eids,
            )
        )

    stale_alerts.extend(
        _heuristic_stale_assumptions(assumptions, content.lower(), safe_path, sym_resolved or symbol)
    )

    threads: list[DecisionThread] = []
    for tid, summ, eids, tconf in thread_tuples:
        threads.append(
            DecisionThread(id=tid, summary=summ, evidence_ids=eids, confidence=tconf)
        )

    thresh = settings.provenance_confidence_threshold
    if conf < thresh and evidence_links:
        conf = min(1.0, conf + 0.1)

    card = ProvenanceCard(
        id=str(uuid.uuid4()),
        repo_id=repo.id,
        file_path=safe_path,
        symbol=sym_resolved or symbol,
        symbol_type=sym_type_resolved or symbol_type,
        current_purpose=cur,
        origin_summary=origin,
        decision_summary=decision,
        assumptions=dedupe_assumptions(assumptions),
        stale_assumptions=stale_alerts[:12],
        safe_change_notes=safe_notes[:12],
        evidence_links=evidence_links,
        confidence_score=conf,
        decision_threads=threads[:8],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        metadata={"github_full_name": repo.full_name},
    )

    save_provenance_card(card)
    return card, False


def dedupe_assumptions(items: list[AssumptionEntry]) -> list[AssumptionEntry]:
    seen: set[str] = set()
    out: list[AssumptionEntry] = []
    for a in items:
        key = a.statement.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def collect_stale_rollup(repo_id: str) -> list[StaleAssumptionAlert]:
    """Gather stale alerts from cached cards for a repo."""
    all_alerts: list[StaleAssumptionAlert] = []
    for card in list_provenance_cards_for_repo(repo_id):
        all_alerts.extend(card.stale_assumptions)
    return all_alerts
