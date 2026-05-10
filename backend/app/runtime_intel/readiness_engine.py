from __future__ import annotations

import http.client
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse


def http_probe(url: str, timeout_s: float = 2.0, method: str = "HEAD") -> Dict[str, Any]:
    parsed = urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    try:
        port = int(parsed.port or (443 if parsed.scheme == "https" else 80))
    except (TypeError, ValueError):
        port = 80
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    conn_cls = (
        http.client.HTTPSConnection
        if str(parsed.scheme or "").lower() == "https"
        else http.client.HTTPConnection
    )
    conn: http.client.HTTPConnection | None = None
    t0 = time.time()
    try:
        conn = conn_cls(host, port, timeout=timeout_s)
        conn.request(
            str(method or "HEAD").upper(),
            path,
            headers={"Connection": "close", "Accept": "*/*"},
        )
        resp = conn.getresponse()
        elapsed_ms = int((time.time() - t0) * 1000)
        # Dev servers (e.g. Next.js) may not finish the response until the body is read.
        try:
            remaining = 262144
            while remaining > 0:
                chunk = resp.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
        except Exception:
            pass
        return {
            "success": True,
            "probe_url": url,
            "probe_method": str(method or "HEAD").upper(),
            "status_code": int(resp.status),
            "reason": str(resp.reason or ""),
            "elapsed_ms": elapsed_ms,
        }
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        return {
            "success": False,
            "probe_url": url,
            "probe_method": str(method or "HEAD").upper(),
            "elapsed_ms": elapsed_ms,
            "error": f"{type(e).__name__}: {e}",
        }
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def probe_runtime_ready(
    base_url: str,
    health_path: Optional[str] = None,
    *,
    probe_timeout_s: float = 25.0,
) -> Dict[str, Any]:
    hp = str(health_path or "").strip()
    if hp and not hp.startswith("/"):
        hp = f"/{hp}"
    candidates = []
    if hp:
        candidates.append(hp)
    # Lighter paths first: full-page GET on / can block on first compile (Next.js / Turbopack).
    candidates.extend(["/favicon.ico", "/"])
    seen: set[str] = set()
    attempts: list[Dict[str, Any]] = []
    for p in candidates:
        if p in seen:
            continue
        seen.add(p)
        probe_url = f"{base_url.rstrip('/')}{p}"
        # GET before HEAD: some stacks answer GET reliably while HEAD stalls or misbehaves.
        for method in ("GET", "HEAD"):
            out = http_probe(probe_url, probe_timeout_s, method=method)
            attempts.append(out)
            if out.get("success"):
                return {
                    "success": True,
                    "probe_url": out.get("probe_url"),
                    "probe_method": out.get("probe_method"),
                    "status_code": out.get("status_code"),
                    "reason": out.get("reason"),
                    "elapsed_ms": out.get("elapsed_ms"),
                    "attempts": attempts[-6:],
                }
    return {"success": False, "attempts": attempts[-8:], "error": "no_http_response"}
