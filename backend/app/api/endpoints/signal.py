"""
DocuVerse Signal API — Customer Voice-to-Code Copilot endpoints.

Ingest customer tickets, generate Signal Packets with code-aware
analysis, and create GitHub issues from insights.
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query, BackgroundTasks

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import repositories_db
from app.models.schemas import (
    CustomerSignal,
    SignalPacket,
    SignalCluster,
    SignalSourceConfig,
    SignalCodeMatch,
    SignalSource,
    SignalStatus,
    SignalIssueType,
    SignalUrgency,
    SignalImportRequest,
    SignalConfigRequest,
    SignalPacketResponse,
    CreateIssueFromSignalRequest,
    CreateIssueResponse,
    APIResponse,
)
from app.services.signal_service import process_signal
from app.services.persistence import (
    save_signal_config,
    load_signal_config,
    save_customer_signal,
    load_customer_signals,
    save_signal_packet,
    load_signal_packets,
    load_signal_packet,
    save_signal_cluster,
    load_signal_clusters,
)
from app.services.github_service import GitHubService

router = APIRouter()


# ── Auth guard (follows provenance pattern) ──────────────────────────

async def _guard_repo(repo_id: str, authorization: str | None):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    repo = repositories_db.get(repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    return user, repo


# ── Helper to rebuild Pydantic models from stored dicts ──────────────

def _signal_from_dict(data: dict) -> CustomerSignal:
    return CustomerSignal(**data)


def _packet_from_dict(data: dict) -> SignalPacket:
    # Handle nested code_matches
    if "code_matches" in data and data["code_matches"]:
        data["code_matches"] = [
            SignalCodeMatch(**m) if isinstance(m, dict) else m
            for m in data["code_matches"]
        ]
    return SignalPacket(**data)


def _cluster_from_dict(data: dict) -> SignalCluster:
    return SignalCluster(**data)


# ── Import endpoint ──────────────────────────────────────────────────

@router.post("/import", response_model=SignalPacketResponse)
async def import_signal(
    body: SignalImportRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    """Import a customer ticket/signal manually and generate a Signal Packet."""
    user, repo = await _guard_repo(body.repo_id, authorization)

    # Create the normalized signal
    signal = CustomerSignal(
        id=f"sig_{uuid.uuid4().hex[:12]}",
        repo_id=body.repo_id,
        source=body.source,
        external_ticket_id=body.external_ticket_id,
        title=body.title,
        body=body.body,
        customer_segment=body.customer_segment,
        priority=body.priority,
        status=SignalStatus.PROCESSING,
        tags=body.tags,
    )

    # Save the signal immediately
    save_customer_signal(json.loads(signal.model_dump_json()))

    # Load existing data for clustering
    existing_signal_dicts = load_customer_signals(body.repo_id)
    existing_signals = []
    for d in existing_signal_dicts:
        try:
            existing_signals.append(_signal_from_dict(d))
        except Exception:
            continue

    existing_cluster_dicts = load_signal_clusters(body.repo_id)
    existing_clusters = []
    for d in existing_cluster_dicts:
        try:
            existing_clusters.append(_cluster_from_dict(d))
        except Exception:
            continue

    try:
        # Process the signal (classify, cluster, map, generate packet)
        packet, cluster, is_new_cluster = await process_signal(
            signal=signal,
            existing_clusters=existing_clusters,
            existing_signals=existing_signals,
        )

        # Update signal status
        signal.status = SignalStatus.COMPLETED
        save_customer_signal(json.loads(signal.model_dump_json()))

        # Save packet and cluster
        save_signal_packet(json.loads(packet.model_dump_json()))
        save_signal_cluster(json.loads(cluster.model_dump_json()))

        return SignalPacketResponse(
            success=True,
            message="Signal processed successfully",
            packet=packet,
            total=1,
        )

    except Exception as e:
        signal.status = SignalStatus.FAILED
        save_customer_signal(json.loads(signal.model_dump_json()))
        raise HTTPException(
            status_code=500,
            detail=f"Signal processing failed: {str(e)}"
        )


# ── Webhook endpoints (stubs for future integrations) ────────────────

@router.post("/webhooks/linear")
async def linear_webhook(
    body: dict,
    background_tasks: BackgroundTasks,
):
    """
    Receive Linear webhooks. Stub for future integration.
    Linear sends issue events with action, data, type, etc.
    """
    # TODO: Validate webhook signature, extract issue fields,
    #       map to SignalImportRequest and process.
    return {"status": "received", "message": "Linear webhook support coming soon"}


# ── Config endpoints ─────────────────────────────────────────────────

@router.get("/{repo_id}/config")
async def get_signal_config(
    repo_id: str,
    authorization: str = Header(None),
):
    """Get the Signal source configuration for a repository."""
    _, repo = await _guard_repo(repo_id, authorization)

    config_data = load_signal_config(repo_id)
    if not config_data:
        # Return defaults
        return {
            "repo_id": repo_id,
            "source": "manual",
            "enabled": True,
            "auto_create_issues": False,
            "priority_threshold": 0.5,
        }
    return config_data


@router.put("/{repo_id}/config")
async def update_signal_config(
    repo_id: str,
    body: SignalConfigRequest,
    authorization: str = Header(None),
):
    """Update Signal source configuration."""
    _, repo = await _guard_repo(repo_id, authorization)

    config_data = {
        "repo_id": repo_id,
        "source": body.source.value,
        "enabled": body.enabled,
        "api_key": body.api_key or "",
        "auto_create_issues": body.auto_create_issues,
        "priority_threshold": body.priority_threshold,
    }
    save_signal_config(config_data)
    return APIResponse(success=True, message="Signal configuration updated")


# ── Packet list / detail endpoints ───────────────────────────────────

@router.get("/{repo_id}/packets", response_model=SignalPacketResponse)
async def list_packets(
    repo_id: str,
    authorization: str = Header(None),
):
    """List all Signal Packets for a repository."""
    _, repo = await _guard_repo(repo_id, authorization)

    packet_dicts = load_signal_packets(repo_id)
    packets = []
    for d in packet_dicts:
        try:
            packets.append(_packet_from_dict(d))
        except Exception:
            continue

    # Sort by created_at descending
    packets.sort(key=lambda p: p.created_at, reverse=True)

    return SignalPacketResponse(
        success=True,
        packets=packets,
        total=len(packets),
    )


@router.get("/{repo_id}/packets/{packet_id}")
async def get_packet(
    repo_id: str,
    packet_id: str,
    authorization: str = Header(None),
):
    """Get a single Signal Packet by ID."""
    _, repo = await _guard_repo(repo_id, authorization)

    packet_data = load_signal_packet(packet_id)
    if not packet_data:
        raise HTTPException(status_code=404, detail="Signal Packet not found")

    if packet_data.get("repo_id") != repo_id:
        raise HTTPException(status_code=404, detail="Signal Packet not found")

    return _packet_from_dict(packet_data)


# ── Cluster endpoint ─────────────────────────────────────────────────

@router.get("/{repo_id}/clusters")
async def list_clusters(
    repo_id: str,
    authorization: str = Header(None),
):
    """List all Signal Clusters for a repository."""
    _, repo = await _guard_repo(repo_id, authorization)

    cluster_dicts = load_signal_clusters(repo_id)
    clusters = []
    for d in cluster_dicts:
        try:
            clusters.append(_cluster_from_dict(d))
        except Exception:
            continue

    clusters.sort(key=lambda c: c.size, reverse=True)
    return clusters


# ── Create GitHub Issue from Signal ──────────────────────────────────

@router.post("/{repo_id}/packets/{packet_id}/create-issue")
async def create_issue_from_signal(
    repo_id: str,
    packet_id: str,
    body: CreateIssueFromSignalRequest,
    authorization: str = Header(None),
):
    """Create a GitHub issue from a Signal Packet."""
    user, repo = await _guard_repo(repo_id, authorization)

    packet_data = load_signal_packet(packet_id)
    if not packet_data:
        raise HTTPException(status_code=404, detail="Signal Packet not found")

    packet = _packet_from_dict(packet_data)

    # Build issue body
    issue_body_parts = [
        f"## 🔔 Signal Packet: {packet.issue_type.value.replace('_', ' ').title()}",
        "",
        f"**Business Urgency:** {packet.business_urgency.value.upper()}",
        f"**Confidence Score:** {packet.confidence_score:.0%}",
        f"**Duplicate Count:** {packet.duplicate_count}",
        "",
    ]

    if packet.root_cause_hypothesis:
        issue_body_parts.extend([
            "### Root Cause Hypothesis",
            packet.root_cause_hypothesis,
            "",
        ])

    if packet.fix_summary:
        issue_body_parts.extend([
            "### Recommended Fix",
            packet.fix_summary,
            "",
        ])

    if packet.likely_files:
        issue_body_parts.append("### Likely Files")
        for f in packet.likely_files[:10]:
            issue_body_parts.append(f"- `{f}`")
        issue_body_parts.append("")

    if packet.docs_update_suggestions:
        issue_body_parts.append("### Documentation Updates Needed")
        for s in packet.docs_update_suggestions:
            issue_body_parts.append(f"- {s}")
        issue_body_parts.append("")

    issue_body_parts.extend([
        "---",
        f"*Generated by DocuVerse Signal from packet `{packet.id}`*",
    ])

    issue_title = f"[Signal] {packet.issue_type.value.replace('_', ' ').title()}: {packet.fix_summary[:80] if packet.fix_summary else 'Investigation needed'}"

    labels = ["signal", f"urgency:{packet.business_urgency.value}"]
    if packet.issue_type != SignalIssueType.OTHER:
        labels.append(packet.issue_type.value.replace("_", "-"))
    labels.extend(body.additional_labels)

    try:
        gh = GitHubService(user.access_token)
        result = await gh.create_issue(
            owner=body.owner,
            repo=body.repo,
            title=issue_title,
            body="\n".join(issue_body_parts),
            labels=labels,
        )

        # Update packet with issue info
        packet.github_issue_url = result.get("html_url", "")
        packet.github_issue_number = result.get("number")
        save_signal_packet(json.loads(packet.model_dump_json()))

        return {
            "issue_number": result.get("number"),
            "url": result.get("html_url", ""),
            "title": issue_title,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create GitHub issue: {str(e)}"
        )


# ── Signals list (for debugging / admin) ─────────────────────────────

@router.get("/{repo_id}/signals")
async def list_signals(
    repo_id: str,
    authorization: str = Header(None),
):
    """List all raw customer signals for a repository."""
    _, repo = await _guard_repo(repo_id, authorization)

    signal_dicts = load_customer_signals(repo_id)
    signals = []
    for d in signal_dicts:
        try:
            signals.append(_signal_from_dict(d))
        except Exception:
            continue

    signals.sort(key=lambda s: s.created_at, reverse=True)
    return signals
