"""
Inline Code Explanation Endpoints

Provides contextual AI explanations for selected code snippets
with follow-up conversation support.
"""

import os
import logging
from fastapi import APIRouter, HTTPException, Header

from app.models.schemas import (
    InlineExplainRequest,
    InlineExplainResponse,
    FollowupRequest,
    FollowupResponse,
)
from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import repositories_db
from app.services.bedrock_client import call_nova_pro

router = APIRouter()
logger = logging.getLogger(__name__)

# ── System prompt shared across explain calls ────────────────────────
_SYSTEM_PROMPT = """You are a Staff Engineer with deep expertise across multiple tech stacks. \
You're pair-programming with a developer who selected a piece of code and wants to understand it. \
Be practical, slightly opinionated, and grounded in real-world reasoning. \
Never use filler like "Great question!" or "Let's dive in". \
Speak as if the developer already knows how to code — don't explain basic syntax."""


@router.post("/inline", response_model=InlineExplainResponse)
async def explain_inline(
    request: InlineExplainRequest,
    authorization: str = Header(None),
):
    """Generate a structured inline explanation for a selected code snippet."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # ── Usage limit check ──
    from app.services.billing_service import check_usage_limit
    from app.services.persistence import load_subscription, update_subscription_usage
    sub = load_subscription(user.id)
    tier = sub.get("tier", "free") if sub else "free"
    usage = sub.get("usage", {}) if sub else {}
    current_count = usage.get("explains", 0)
    allowed, limit = check_usage_limit(tier, "explains", current_count)
    if not allowed:
        raise HTTPException(status_code=403, detail={
            "code": "LIMIT_EXCEEDED",
            "feature": "explains",
            "used": current_count,
            "limit": limit,
            "tier": tier,
            "upgrade_url": "/pricing",
        })

    repo = repositories_db.get(request.repository_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Build context window: truncate full file if too long
    file_context = request.full_file_content[:6000] if request.full_file_content else ""

    prompt = f"""A developer selected the following code in `{request.file_path}` (lines {request.start_line}–{request.end_line}):

```
{request.selected_code[:3000]}
```

{"Full file context (truncated):" + chr(10) + "```" + chr(10) + file_context + chr(10) + "```" if file_context else ""}

Respond with EXACTLY three sections using these exact headers. No other text outside these sections.

**WHAT:** (1-3 sentences) What does this code do? Be specific — name the operation, data flow, or transformation.

**WHY:** (2-4 sentences) Why does this code exist? What problem does it solve? What would break or degrade without it? Mention the design motivation or trade-off if you can infer one.

**HOW:** (1-3 sentences) How does this fit into the broader file and project? What depends on this code? What does this code depend on?"""

    try:
        raw = await call_nova_pro(prompt, system_prompt=_SYSTEM_PROMPT)
    except Exception as e:
        logger.error("Bedrock call failed for inline explain: %s", e)
        raise HTTPException(status_code=503, detail="AI explanation unavailable. Please try again.")

    # Parse sections from the response
    what, why, how = _parse_sections(raw)

    # Increment usage counter
    update_subscription_usage(user.id, "explains")

    return InlineExplainResponse(
        what=what,
        why=why,
        how=how,
        summary=what.split(".")[0] + "." if what else "",
    )


@router.post("/followup", response_model=FollowupResponse)
async def explain_followup(
    request: FollowupRequest,
    authorization: str = Header(None),
):
    """Answer a follow-up question about previously selected code."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    repo = repositories_db.get(request.repository_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Build conversation context
    history_str = ""
    for msg in request.conversation_history[-6:]:  # Keep last 6 messages for context
        role_label = "Developer" if msg.role == "user" else "Engineer"
        history_str += f"\n{role_label}: {msg.content}\n"

    file_context = request.full_file_content[:4000] if request.full_file_content else ""

    prompt = f"""Context: A developer is asking about code in `{request.file_path}`.

Selected code:
```
{request.selected_code[:2000]}
```

{"File context (truncated):" + chr(10) + "```" + chr(10) + file_context + chr(10) + "```" if file_context else ""}

Previous conversation:
{history_str}

Developer's question: {request.question}

Answer the question directly. Be concise (2-5 sentences). Stay grounded in the actual code — don't speculate about things not visible in the snippet or file. If you're unsure, say so."""

    try:
        answer = await call_nova_pro(prompt, system_prompt=_SYSTEM_PROMPT)
    except Exception as e:
        logger.error("Bedrock call failed for followup: %s", e)
        raise HTTPException(status_code=503, detail="AI explanation unavailable. Please try again.")

    return FollowupResponse(answer=answer.strip())


def _parse_sections(raw: str) -> tuple[str, str, str]:
    """Parse WHAT/WHY/HOW sections from LLM output. Gracefully handles missing sections."""
    import re

    what = why = how = ""

    # Try to find sections by headers
    what_match = re.search(r"\*\*WHAT:\*\*\s*(.*?)(?=\*\*WHY:\*\*|\*\*HOW:\*\*|$)", raw, re.DOTALL)
    why_match = re.search(r"\*\*WHY:\*\*\s*(.*?)(?=\*\*HOW:\*\*|$)", raw, re.DOTALL)
    how_match = re.search(r"\*\*HOW:\*\*\s*(.*?)$", raw, re.DOTALL)

    if what_match:
        what = what_match.group(1).strip()
    if why_match:
        why = why_match.group(1).strip()
    if how_match:
        how = how_match.group(1).strip()

    # Fallback: if no sections were parsed, split evenly
    if not what and not why and not how:
        sentences = [s.strip() for s in raw.split(".") if s.strip()]
        third = max(1, len(sentences) // 3)
        what = ". ".join(sentences[:third]) + "."
        why = ". ".join(sentences[third:third * 2]) + "."
        how = ". ".join(sentences[third * 2:]) + "." if sentences[third * 2:] else ""

    return what, why, how
