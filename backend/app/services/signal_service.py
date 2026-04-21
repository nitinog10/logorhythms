"""
Signal Service — Main orchestrator for DocuVerse Signal.

Coordinates ticket classification, clustering, code mapping,
and Signal Packet generation.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from app.models.schemas import (
    CustomerSignal,
    SignalPacket,
    SignalCluster,
    SignalCodeMatch,
    SignalIssueType,
    SignalUrgency,
    SignalStatus,
)
from app.services.ticket_classifier import classify_ticket
from app.services.signal_clusterer import find_or_create_cluster
from app.services.vector_store import VectorStoreService
from app.services.bedrock_client import call_nova_pro, call_nova_lite

logger = logging.getLogger(__name__)

_vector_store = VectorStoreService()


# ── Code Mapping ──────────────────────────────────────────────────────

async def _map_signal_to_code(
    repo_id: str,
    title: str,
    body: str,
    technical_terms: List[str],
) -> List[SignalCodeMatch]:
    """
    Use the existing vector store to find code chunks that match
    the ticket text and technical terms.
    """
    matches: List[SignalCodeMatch] = []
    seen_files: set = set()

    # Build search queries from title, body keywords, and technical terms
    queries = [title]
    if technical_terms:
        queries.extend(technical_terms[:5])

    # Also extract any quoted strings or backtick terms from the body
    for marker in ["`", "'", '"']:
        parts = body.split(marker)
        for i in range(1, len(parts), 2):
            term = parts[i].strip()
            if 2 < len(term) < 80:
                queries.append(term)

    queries = queries[:10]  # Cap at 10 queries

    for query in queries:
        try:
            chunks = await _vector_store.search(
                query=query,
                repository_id=repo_id,
                n_results=3,
            )
            for chunk in chunks:
                if chunk.file_path in seen_files:
                    continue
                seen_files.add(chunk.file_path)
                matches.append(
                    SignalCodeMatch(
                        file_path=chunk.file_path,
                        symbol=chunk.name,
                        confidence=0.6,  # Base confidence for keyword match
                        snippet=chunk.content[:200] if chunk.content else None,
                        start_line=chunk.start_line,
                        end_line=chunk.end_line,
                    )
                )
        except Exception as e:
            logger.warning("Code search failed for query '%s': %s", query, e)

    # Sort by confidence descending
    matches.sort(key=lambda m: m.confidence, reverse=True)
    return matches[:10]  # Return top 10


# ── Fix Packet Generation (Bedrock) ───────────────────────────────────

_PACKET_SYSTEM_PROMPT = """You are a senior engineering lead helping triage customer-reported issues. 
You produce structured analysis to help engineers fix issues quickly.
Respond with valid JSON only — no markdown fencing, no commentary."""

_PACKET_PROMPT_TEMPLATE = """A customer ticket has been filed. Analyze it and provide actionable engineering guidance.

TICKET TITLE: {title}

TICKET BODY:
{body}

CLASSIFICATION:
- Issue Type: {issue_type}
- Urgency: {urgency}
- Domain Area: {domain_area}

CODE AREAS LIKELY INVOLVED:
{code_areas}

Produce this JSON:
{{
  "root_cause_hypothesis": "<your best guess at the root cause, be specific about what code path might be failing>",
  "fix_summary": "<concise fix plan with 2-3 concrete steps an engineer should take>",
  "owner_suggestions": ["<team or role best suited to fix this>"],
  "docs_update_suggestions": ["<any docs/FAQ/changelog entries that should be updated after the fix>"],
  "customer_response_draft": "<a professional, empathetic customer-facing response acknowledging the issue without promising specific timelines>"
}}"""


async def _generate_packet_analysis(
    title: str,
    body: str,
    classification: Dict[str, Any],
    code_matches: List[SignalCodeMatch],
) -> Dict[str, Any]:
    """Use Bedrock Nova Pro to generate the fix packet analysis."""
    try:
        code_areas = "\n".join(
            f"  - {m.file_path}" + (f" ({m.symbol})" if m.symbol else "")
            for m in code_matches[:5]
        ) or "  (no code matches found)"

        # Build prompt inside try block — code_areas and user input
        # may contain curly braces which would crash str.format()
        prompt = _PACKET_PROMPT_TEMPLATE.format(
            title=title,
            body=body[:2000],
            issue_type=classification.get("issue_type", "unknown"),
            urgency=classification.get("urgency", "medium"),
            domain_area=classification.get("domain_area", "unknown"),
            code_areas=code_areas,
        )

        raw = await call_nova_pro(
            prompt,
            max_tokens=1024,
            temperature=0.2,
            system_prompt=_PACKET_SYSTEM_PROMPT,
        )

        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        return json.loads(text)

    except json.JSONDecodeError as e:
        logger.warning("Failed to parse packet analysis JSON: %s", e)
        return _fallback_analysis(title)
    except Exception as e:
        logger.error("Bedrock packet generation failed: %s", e)
        return _fallback_analysis(title)


def _fallback_analysis(title: str) -> Dict[str, Any]:
    """Fallback when Bedrock is unavailable."""
    return {
        "root_cause_hypothesis": f"Investigation needed for: {title}",
        "fix_summary": "1. Reproduce the issue\n2. Check logs for related errors\n3. Identify the root cause and apply fix",
        "owner_suggestions": ["Engineering team"],
        "docs_update_suggestions": [],
        "customer_response_draft": (
            "Thank you for reporting this issue. Our engineering team is investigating "
            "and will provide an update once we have more information."
        ),
    }


# ── Main Orchestration ────────────────────────────────────────────────

async def process_signal(
    signal: CustomerSignal,
    existing_clusters: List[SignalCluster],
    existing_signals: List[CustomerSignal],
) -> tuple:
    """
    Process a customer signal end-to-end:
    1. Classify the ticket (issue type + urgency)
    2. Find or create a cluster (duplicate detection)
    3. Map to code areas
    4. Generate a fix packet via Bedrock

    Returns:
        Tuple of (SignalPacket, SignalCluster, is_new_cluster)
    """
    logger.info("Processing signal %s: %s", signal.id, signal.title)

    # Default fallback values so a packet is always returned
    issue_type = SignalIssueType.OTHER
    urgency = SignalUrgency.MEDIUM
    classification: Dict[str, Any] = {}
    code_matches: List[SignalCodeMatch] = []
    analysis: Dict[str, Any] = {}
    cluster: Optional[SignalCluster] = None
    is_new_cluster = True

    try:
        # Step 1: Classify
        classification = await classify_ticket(signal.title, signal.body)
        try:
            issue_type = SignalIssueType(classification["issue_type"])
        except (ValueError, KeyError):
            issue_type = SignalIssueType.OTHER
        try:
            urgency = SignalUrgency(classification["urgency"])
        except (ValueError, KeyError):
            urgency = SignalUrgency.MEDIUM

        logger.info(
            "Signal %s classified: type=%s, urgency=%s",
            signal.id, issue_type.value, urgency.value,
        )
    except Exception as e:
        logger.error("Signal %s classification failed: %s", signal.id, e, exc_info=True)

    try:
        # Step 2: Cluster
        cluster, is_new_cluster = find_or_create_cluster(
            signal=signal,
            signal_urgency=urgency,
            existing_clusters=existing_clusters,
            existing_signals=existing_signals,
        )
    except Exception as e:
        logger.error("Signal %s clustering failed: %s", signal.id, e, exc_info=True)

    # Create a default cluster if clustering failed
    if cluster is None:
        cluster = SignalCluster(
            id=f"cluster_{uuid.uuid4().hex[:12]}",
            repo_id=signal.repo_id,
            representative_title=signal.title,
            signal_ids=[signal.id],
            size=1,
            combined_urgency=urgency,
        )
        is_new_cluster = True

    try:
        # Step 3: Map to code
        code_matches = await _map_signal_to_code(
            repo_id=signal.repo_id,
            title=signal.title,
            body=signal.body,
            technical_terms=classification.get("technical_terms", []),
        )
    except Exception as e:
        logger.error("Signal %s code mapping failed: %s", signal.id, e, exc_info=True)

    try:
        # Step 4: Generate packet analysis
        analysis = await _generate_packet_analysis(
            title=signal.title,
            body=signal.body,
            classification=classification,
            code_matches=code_matches,
        )
    except Exception as e:
        logger.error("Signal %s packet generation failed: %s", signal.id, e, exc_info=True)
        analysis = _fallback_analysis(signal.title)

    # Build the Signal Packet — always succeeds
    packet = SignalPacket(
        id=f"pkt_{uuid.uuid4().hex[:12]}",
        repo_id=signal.repo_id,
        signal_id=signal.id,
        cluster_id=cluster.id,
        issue_type=issue_type,
        business_urgency=urgency,
        duplicate_count=cluster.size,
        likely_files=[m.file_path for m in code_matches],
        likely_symbols=[m.symbol for m in code_matches if m.symbol],
        code_matches=code_matches,
        owner_suggestions=analysis.get("owner_suggestions", []),
        fix_summary=analysis.get("fix_summary", ""),
        root_cause_hypothesis=analysis.get("root_cause_hypothesis", ""),
        docs_update_suggestions=analysis.get("docs_update_suggestions", []),
        customer_response_draft=analysis.get("customer_response_draft", ""),
        confidence_score=_compute_confidence(classification, code_matches),
        metadata={
            "classification": classification,
        },
    )

    logger.info(
        "Signal Packet %s created (confidence=%.2f, code_matches=%d, cluster_size=%d)",
        packet.id, packet.confidence_score, len(code_matches), cluster.size,
    )

    return packet, cluster, is_new_cluster


def _compute_confidence(
    classification: Dict[str, Any],
    code_matches: List[SignalCodeMatch],
) -> float:
    """Compute an overall confidence score for the packet."""
    score = 0.3  # Base confidence

    # Boost for code matches
    if code_matches:
        match_boost = min(len(code_matches) / 5, 0.3)  # Up to 0.3
        score += match_boost

    # Boost for having technical terms (better classification)
    terms = classification.get("technical_terms", [])
    if terms:
        term_boost = min(len(terms) / 5, 0.2)  # Up to 0.2
        score += term_boost

    # Boost for non-"other" classification
    if classification.get("issue_type") != "other":
        score += 0.1

    # Boost for domain area identified
    if classification.get("domain_area", "unknown") != "unknown":
        score += 0.1

    return min(score, 1.0)
