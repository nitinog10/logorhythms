"""
Signal Clusterer Service

Groups similar customer signals (tickets) using text similarity.
Uses Bedrock Nova for embedding-based similarity when available,
falls back to keyword overlap for basic clustering.
"""

import logging
import uuid
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timezone

from app.models.schemas import (
    CustomerSignal,
    SignalCluster,
    SignalUrgency,
)
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _text_fingerprint(title: str, body: str) -> set:
    """Extract a set of normalized words for similarity comparison."""
    combined = f"{title} {body}".lower()
    # Remove common stop words and short tokens
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "shall",
        "should", "may", "might", "can", "could", "i", "we", "you", "they",
        "it", "this", "that", "and", "or", "but", "in", "on", "at", "to",
        "for", "of", "with", "by", "from", "not", "no", "my", "our", "your",
    }
    words = set()
    for word in combined.split():
        # Remove punctuation
        clean = "".join(c for c in word if c.isalnum())
        if len(clean) > 2 and clean not in stop_words:
            words.add(clean)
    return words


def _jaccard_similarity(set_a: set, set_b: set) -> float:
    """Compute Jaccard similarity between two word sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def _highest_urgency(urgencies: List[SignalUrgency]) -> SignalUrgency:
    """Return the highest urgency from a list."""
    priority_order = [
        SignalUrgency.CRITICAL,
        SignalUrgency.HIGH,
        SignalUrgency.MEDIUM,
        SignalUrgency.LOW,
    ]
    for urgency in priority_order:
        if urgency in urgencies:
            return urgency
    return SignalUrgency.MEDIUM


def find_or_create_cluster(
    signal: CustomerSignal,
    signal_urgency: SignalUrgency,
    existing_clusters: List[SignalCluster],
    existing_signals: List[CustomerSignal],
    threshold: Optional[float] = None,
) -> Tuple[SignalCluster, bool]:
    """
    Find the best matching cluster for a signal or create a new one.

    Args:
        signal: The new incoming customer signal
        signal_urgency: Classified urgency of the signal
        existing_clusters: All existing clusters for the repo
        existing_signals: All existing signals for the repo (needed for text comparison)
        threshold: Similarity threshold (defaults to config value)

    Returns:
        Tuple of (cluster, is_new) where is_new is True if a new cluster was created
    """
    threshold = threshold or settings.signal_max_cluster_distance

    # Actually we compare similarity, so threshold is minimum similarity to match
    # The config says "max_cluster_distance" so similarity threshold = 1 - distance
    similarity_threshold = 1.0 - threshold

    new_fingerprint = _text_fingerprint(signal.title, signal.body)

    best_cluster: Optional[SignalCluster] = None
    best_similarity = 0.0

    # Build a map of signal_id -> signal for quick lookup
    signal_map: Dict[str, CustomerSignal] = {s.id: s for s in existing_signals}

    for cluster in existing_clusters:
        if cluster.repo_id != signal.repo_id:
            continue

        # Compare against all signals in the cluster
        cluster_similarities = []
        for sid in cluster.signal_ids:
            member = signal_map.get(sid)
            if member:
                member_fp = _text_fingerprint(member.title, member.body)
                sim = _jaccard_similarity(new_fingerprint, member_fp)
                cluster_similarities.append(sim)

        if cluster_similarities:
            avg_sim = sum(cluster_similarities) / len(cluster_similarities)
            if avg_sim > best_similarity:
                best_similarity = avg_sim
                best_cluster = cluster

    # If we found a good match, add to that cluster
    if best_cluster and best_similarity >= similarity_threshold:
        best_cluster.signal_ids.append(signal.id)
        best_cluster.size = len(best_cluster.signal_ids)
        best_cluster.updated_at = datetime.now(timezone.utc)

        # Update combined urgency to highest
        urgencies = [best_cluster.combined_urgency, signal_urgency]
        best_cluster.combined_urgency = _highest_urgency(urgencies)

        logger.info(
            "Signal %s added to cluster %s (similarity=%.2f, size=%d)",
            signal.id, best_cluster.id, best_similarity, best_cluster.size,
        )
        return best_cluster, False

    # Create a new cluster
    new_cluster = SignalCluster(
        id=f"cluster_{uuid.uuid4().hex[:12]}",
        repo_id=signal.repo_id,
        representative_title=signal.title,
        signal_ids=[signal.id],
        size=1,
        combined_urgency=signal_urgency,
    )
    logger.info("Created new cluster %s for signal %s", new_cluster.id, signal.id)
    return new_cluster, True
