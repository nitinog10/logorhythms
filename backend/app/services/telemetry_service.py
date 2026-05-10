from __future__ import annotations

import json
import random
from typing import Any, Dict, List

_MAX_PAYLOAD_BYTES = 16_384
_MAX_STRING_BYTES = 2_048
_ALLOWED_SEVERITY = {"debug", "info", "warning", "error", "critical"}
_DEBUG_SAMPLE_RATE = 0.2


def _truncate_string(value: str, max_bytes: int = _MAX_STRING_BYTES) -> str:
    b = (value or "").encode("utf-8", errors="replace")
    if len(b) <= max_bytes:
        return value
    out = b[:max_bytes].decode("utf-8", errors="replace")
    return out + " …[truncated]"


def normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in (payload or {}).items():
        if isinstance(v, str):
            out[str(k)] = _truncate_string(v)
        else:
            out[str(k)] = v
    raw = json.dumps(out, default=str)
    if len(raw.encode("utf-8")) <= _MAX_PAYLOAD_BYTES:
        return out
    out = {
        "payload_truncated": True,
        "raw_preview": _truncate_string(raw, _MAX_PAYLOAD_BYTES),
    }
    return out


def should_accept_event(severity: str) -> bool:
    sv = str(severity or "info").lower()
    if sv not in _ALLOWED_SEVERITY:
        return True
    if sv != "debug":
        return True
    return random.random() <= _DEBUG_SAMPLE_RATE


def summarize_runtime_telemetry(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    rows = list(items or [])
    findings: List[Dict[str, Any]] = []
    counts = {
        "frontend_runtime_failure": 0,
        "topology_mismatch": 0,
        "post_start_application_state": 0,
        "degraded_runtime_state": 0,
        "console_error": 0,
    }
    localhost_requests: Dict[str, int] = {}
    pending_requests: Dict[str, int] = {}
    websocket_issues: int = 0
    bootstrap_wait: int = 0
    for r in rows:
        cat = str(r.get("category") or "").strip().lower()
        payload = r.get("payload") or {}
        kind = str(payload.get("kind") or "").strip().lower()
        if cat in counts:
            counts[cat] += 1
        if cat == "console" and kind == "error":
            counts["console_error"] += 1
        url = str(payload.get("url") or "")
        if "localhost" in url or "127.0.0.1" in url:
            localhost_requests[url] = localhost_requests.get(url, 0) + 1
        if kind == "pending_request":
            u = str(payload.get("url") or "unknown")
            pending_requests[u] = pending_requests.get(u, 0) + 1
            age = int(payload.get("age_ms") or 0)
            if age >= 10_000:
                bootstrap_wait += 1
        if "websocket" in kind:
            websocket_issues += 1
    if localhost_requests:
        top = sorted(localhost_requests.items(), key=lambda kv: kv[1], reverse=True)[0]
        findings.append(
            {
                "code": "LOCALHOST_API_MISUSE",
                "severity": "warning",
                "message": f"Detected localhost API usage inside preview runtime: {top[0]}",
            }
        )
    if pending_requests:
        top = sorted(pending_requests.items(), key=lambda kv: kv[1], reverse=True)[0]
        findings.append(
            {
                "code": "PENDING_BOOTSTRAP_REQUEST",
                "severity": "warning",
                "message": f"Frontend bootstrap appears blocked by pending request: {top[0]}",
            }
        )
    if websocket_issues > 0:
        findings.append(
            {
                "code": "WEBSOCKET_DEGRADED",
                "severity": "warning",
                "message": "Frontend waiting on unresolved websocket/HMR connection.",
            }
        )
    if counts["frontend_runtime_failure"] > 0:
        findings.append(
            {
                "code": "FRONTEND_RUNTIME_EXCEPTIONS",
                "severity": "error",
                "message": "Frontend runtime exceptions detected after HTTP-ready state.",
            }
        )
    if bootstrap_wait > 0 and counts["post_start_application_state"] > 0:
        findings.append(
            {
                "code": "APPLICATION_STUCK_BOOTSTRAPPING",
                "severity": "warning",
                "message": "Application mounted successfully but bootstrap network requests never completed.",
            }
        )
    lifecycle_state = "frontend_ready"
    if any(f["severity"] == "error" for f in findings):
        lifecycle_state = "runtime_degraded"
    elif any(f["code"] in {"LOCALHOST_API_MISUSE"} for f in findings):
        lifecycle_state = "topology_degraded"
    elif findings:
        lifecycle_state = "frontend_bootstrapping"
    return {
        "counts": counts,
        "findings": findings[:12],
        "suggested_lifecycle_state": lifecycle_state,
    }

