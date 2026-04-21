"""
Ticket Classifier Service — AWS Bedrock Nova Integration

Classifies customer tickets by issue type and business urgency
using AWS Bedrock Nova models. Extracts key technical terms for
downstream code mapping.
"""

import json
import logging
from typing import Dict, Any, Tuple

from app.services.bedrock_client import call_nova_lite
from app.models.schemas import SignalIssueType, SignalUrgency

logger = logging.getLogger(__name__)

# ── Prompts ──────────────────────────────────────────────────────────

_CLASSIFY_SYSTEM_PROMPT = """You are an expert support triage engineer. You classify customer tickets into structured categories.

You MUST respond with valid JSON only — no markdown, no commentary."""

_CLASSIFY_PROMPT_TEMPLATE = """Classify this customer support ticket.

TICKET TITLE: {title}

TICKET BODY:
{body}

Respond with this exact JSON structure:
{{
  "issue_type": "<one of: bug, feature_request, question, performance, ux, security, other>",
  "urgency": "<one of: critical, high, medium, low>",
  "technical_terms": ["<list of key technical terms, file names, error messages, API names, or component names mentioned>"],
  "domain_area": "<short description of the product area affected, e.g. 'billing', 'auth', 'dashboard', 'api'>",
  "summary": "<one-sentence technical summary of the issue for engineers>"
}}"""


async def classify_ticket(title: str, body: str) -> Dict[str, Any]:
    """
    Classify a customer ticket using Bedrock Nova.

    Returns:
        Dict with keys: issue_type, urgency, technical_terms, domain_area, summary
    """
    try:
        # Build prompt inside try block — user input may contain curly braces
        # which would crash str.format()
        prompt = _CLASSIFY_PROMPT_TEMPLATE.format(title=title, body=body[:3000])

        raw = await call_nova_lite(
            prompt,
            max_tokens=512,
            temperature=0.1,
            system_prompt=_CLASSIFY_SYSTEM_PROMPT,
        )

        # Strip markdown fencing if present
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        result = json.loads(text)

        # Validate and normalize enums
        issue_type = result.get("issue_type", "other").lower()
        try:
            SignalIssueType(issue_type)
        except ValueError:
            issue_type = "other"

        urgency = result.get("urgency", "medium").lower()
        try:
            SignalUrgency(urgency)
        except ValueError:
            urgency = "medium"

        return {
            "issue_type": issue_type,
            "urgency": urgency,
            "technical_terms": result.get("technical_terms", []),
            "domain_area": result.get("domain_area", "unknown"),
            "summary": result.get("summary", title),
        }

    except json.JSONDecodeError as e:
        logger.warning("Failed to parse classifier JSON: %s", e)
        return _fallback_classify(title, body)
    except Exception as e:
        logger.error("Bedrock classification failed: %s", e)
        return _fallback_classify(title, body)


def _fallback_classify(title: str, body: str) -> Dict[str, Any]:
    """Keyword-based fallback when Bedrock is unavailable."""
    combined = f"{title} {body}".lower()

    # Issue type heuristics
    if any(w in combined for w in ["crash", "error", "bug", "broken", "fix", "exception", "traceback"]):
        issue_type = "bug"
    elif any(w in combined for w in ["feature", "request", "add", "would be nice", "suggestion"]):
        issue_type = "feature_request"
    elif any(w in combined for w in ["slow", "performance", "timeout", "latency", "memory"]):
        issue_type = "performance"
    elif any(w in combined for w in ["security", "vulnerability", "cve", "auth", "token leak"]):
        issue_type = "security"
    elif any(w in combined for w in ["how", "question", "help", "what is", "where"]):
        issue_type = "question"
    elif any(w in combined for w in ["ui", "ux", "design", "confusing", "layout"]):
        issue_type = "ux"
    else:
        issue_type = "other"

    # Urgency heuristics
    if any(w in combined for w in ["urgent", "critical", "blocker", "production down", "data loss"]):
        urgency = "critical"
    elif any(w in combined for w in ["important", "high priority", "affecting many", "regression"]):
        urgency = "high"
    elif any(w in combined for w in ["minor", "low priority", "cosmetic", "nice to have"]):
        urgency = "low"
    else:
        urgency = "medium"

    return {
        "issue_type": issue_type,
        "urgency": urgency,
        "technical_terms": [],
        "domain_area": "unknown",
        "summary": title,
    }
