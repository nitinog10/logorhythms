"""
LLM-backed extraction of assumptions, rationale, and stale hints for Provenance.

Output must stay grounded in supplied evidence excerpts (anti-hallucination prompt).
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from app.services.bedrock_client import call_nova_lite

logger = logging.getLogger(__name__)


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        return m.group(1).strip()
    return text


async def extract_provenance_fields(
    *,
    file_path: str,
    code_snippet: str,
    evidence_summaries: list[str],
    symbol: str | None,
    symbol_type: str | None,
) -> dict[str, Any]:
    """
    Returns a dict with keys:
      current_purpose, origin_summary, decision_summary, assumptions, superseded,
      safe_change_notes, stale_hints, decision_threads, confidence_score
    """
    ev_block = "\n".join(f"- ({i+1}) {s[:500]}" for i, s in enumerate(evidence_summaries[:20]))
    sym_line = f"Symbol: {symbol} ({symbol_type})" if symbol else "Scope: whole file"

    prompt = f"""You are documenting code PROVENANCE. You MUST only use facts supported by the evidence lines below or the code snippet. Cite evidence numbers in parentheses in summaries where possible, e.g. (1)".

{sym_line}
File path: {file_path}

Code snippet (may be truncated):
```
{code_snippet[:8000]}
```

Evidence (from commits, PRs, issues; numbered):
{ev_block if ev_block else "(no evidence — say data is insufficient)"}

Respond with a single JSON object ONLY, no markdown, keys:
- "current_purpose": string — what this code does now
- "origin_summary": string — why it likely exists / history in one paragraph, grounded in evidence numbers
- "decision_summary": string — key engineering decisions
- "assumptions": array of {{"statement": string, "confidence": number 0-1, "evidence_nums": number[]}}
- "superseded": array of strings — older decisions that appear replaced (if any)
- "safe_change_notes": array of strings — what might break if changed
- "stale_hints": array of {{"statement": string, "reason": string, "evidence_nums": number[]}}
- "decision_threads": array of {{"summary": string, "evidence_nums": number[]}}
- "confidence_score": number 0-1 for overall grounding quality

If evidence is empty or weak, keep confidence_score low and avoid inventing PR/issue numbers."""

    try:
        raw = await call_nova_lite(prompt, max_tokens=3072, temperature=0.2)
        data = json.loads(_strip_json_fence(raw))
        if not isinstance(data, dict):
            return _fallback(symbol, file_path)
        return data
    except Exception as e:
        logger.warning("assumption extract JSON failed: %s", e)
        return _fallback(symbol, file_path)


def _fallback(symbol: str | None, file_path: str) -> dict[str, Any]:
    return {
        "current_purpose": "Could not reliably summarize — LLM output was not valid JSON.",
        "origin_summary": f"Insufficient automated provenance for `{file_path}`."
        + (f" Focus symbol `{symbol}`." if symbol else ""),
        "decision_summary": "",
        "assumptions": [],
        "superseded": [],
        "safe_change_notes": [
            "Re-run provenance after connecting GitHub evidence or widening history window.",
        ],
        "stale_hints": [],
        "decision_threads": [],
        "confidence_score": 0.15,
    }


def map_extraction_to_models(
    data: dict[str, Any],
    evidence_ids_by_index: list[str],
    file_path: str,
    symbol: str | None,
) -> tuple[
    str,
    str,
    str,
    list[tuple],
    list[tuple],
    list[str],
    list[tuple],
    float,
]:
    """
    Returns tuples for provenance_service to build Pydantic models.
    (current_purpose, origin, decision, assumptions_args, stale_args, superseded, threads, conf)
    Each assumption tuple: (id, statement, status_str, confidence, evidence_ids)
    """
    current = str(data.get("current_purpose") or "")
    origin = str(data.get("origin_summary") or "")
    decision = str(data.get("decision_summary") or "")
    conf = float(data.get("confidence_score") or 0.4)
    conf = max(0.0, min(1.0, conf))

    def _nums_to_ids(nums: Any) -> list[str]:
        out: list[str] = []
        if not isinstance(nums, list):
            return out
        for n in nums:
            try:
                idx = int(n) - 1
            except (TypeError, ValueError):
                continue
            if 0 <= idx < len(evidence_ids_by_index):
                eid = evidence_ids_by_index[idx]
                if eid not in out:
                    out.append(eid)
        return out

    assumptions: list[tuple] = []
    for a in data.get("assumptions") or []:
        if not isinstance(a, dict):
            continue
        st = str(a.get("statement") or "").strip()
        if not st:
            continue
        assumptions.append(
            (
                f"asm_{uuid.uuid4().hex[:10]}",
                st,
                "active",
                float(a.get("confidence") or 0.5),
                _nums_to_ids(a.get("evidence_nums")),
            )
        )

    stale: list[tuple] = []
    for s in data.get("stale_hints") or []:
        if not isinstance(s, dict):
            continue
        stmt = str(s.get("statement") or "").strip()
        if not stmt:
            continue
        stale.append(
            (
                f"stale_{uuid.uuid4().hex[:10]}",
                stmt,
                str(s.get("reason") or ""),
                _nums_to_ids(s.get("evidence_nums")),
            )
        )

    safe_notes = [str(x) for x in (data.get("safe_change_notes") or []) if str(x).strip()]
    threads_raw = data.get("decision_threads") or []

    thread_tuples: list[tuple] = []
    for t in threads_raw:
        if not isinstance(t, dict):
            continue
        summ = str(t.get("summary") or "").strip()
        if not summ:
            continue
        thread_tuples.append(
            (f"thr_{uuid.uuid4().hex[:10]}", summ, _nums_to_ids(t.get("evidence_nums")), 0.55)
        )

    return current, origin, decision, assumptions, stale, safe_notes, thread_tuples, conf
