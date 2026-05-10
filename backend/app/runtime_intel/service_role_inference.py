"""
Heuristic inference of preview *surface* vs internal API/companion listeners.

Goals:
- Prefer the user-facing SPA / SSR dev shell over API-only HTTP listeners when
  multiple published ports reply.
- Avoid surfacing debugger ports and Studio split-backend ports when possible.

This is intentionally pragmatic (preview UX over taxonomic purity).
"""

from __future__ import annotations

import http.client
from typing import Any, Dict, Mapping, Sequence, Tuple

from app.runtime_intel.studio_launch_plan import STUDIO_SPLIT_BACKEND_INTERNAL_PORT

# Role labels stored in telemetry / diagnostics only.
SERVICE_ROLE_FRONTEND = "frontend_ui"
SERVICE_ROLE_API = "api_backend"
SERVICE_ROLE_WS_HMR = "websocket_or_hmr"
SERVICE_ROLE_DEBUG = "debugger_or_admin"
SERVICE_ROLE_WORKER = "background_worker"
SERVICE_ROLE_UNKNOWN = "unknown"


def http_probe_fingerprint(
    *,
    host: str = "127.0.0.1",
    port: int,
    timeout_s: float = 1.35,
    path: str = "/",
) -> Dict[str, Any]:
    """
    Lightweight GET to capture headers + snippet for classification.
    """
    out: Dict[str, Any] = {
        "ok": False,
        "host": host,
        "port": int(port),
        "status": None,
        "content_type": "",
        "server": "",
        "snippet": "",
        "html_like": False,
        "json_like": False,
        "vite_hmr_hint": False,
    }
    p = path if path.startswith("/") else f"/{path}"
    conn: http.client.HTTPConnection | None = None
    try:
        conn = http.client.HTTPConnection(host, int(port), timeout=timeout_s)
        conn.request("GET", p, headers={"Connection": "close", "Accept": "*/*"})
        resp = conn.getresponse()
        out["status"] = int(resp.status)
        ctype = resp.getheader("content-type") or ""
        srv = resp.getheader("server") or ""
        out["content_type"] = ctype
        out["server"] = srv
        blob = resp.read(4096) or b""
        try:
            txt = blob.decode("utf-8", errors="replace").lower()
        except Exception:
            txt = ""
        out["snippet"] = txt[:2000]
        out["html_like"] = "<!doctype html" in txt or "<html" in txt[:400]
        cl = ctype.lower()
        out["json_like"] = ("application/json" in cl or "application/problem+json" in cl) or (
            txt.strip().startswith("{") and txt.strip().endswith("}")
        )
        out["vite_hmr_hint"] = "@vite/client" in txt or "/@vite/client" in txt or "vite-plugin" in txt
        out["next_hint"] = "next.js" in txt or "__next_data__" in txt or "__NEXT_DATA__" in blob.decode(
            "utf-8", errors="replace"
        )
        out["webpack_hint"] = "webpack" in txt or "__webpack_require__" in txt
        out["ok"] = True
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
    return out


def _port_only_score(
    internal_port: int,
    *,
    framework: str,
    primary_listen: int,
    split_preview_mode: bool,
) -> float:
    fw = str(framework or "").lower().strip()
    p = int(internal_port)
    s = 0.0

    if split_preview_mode and p == int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT):
        s -= 220.0
    # Studio companion internal ports from split shell (8787 + n*11)
    if split_preview_mode and p > int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT) and p != int(primary_listen):
        if p in range(int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT) + 10, int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT) + 200):
            s -= 80.0

    if p == int(primary_listen):
        s += 55.0

    if p in {5173, 5174, 4173, 4321, 8080}:
        s += 70.0
    if p == 3000 and fw in {"nextjs", "vite", "cra", "remix", "unknown"}:
        s += 35.0
    if p in {5000, 8000, 8081, 9000}:
        s -= 25.0
    if p in {9229, 9230, 5858, 9222}:
        s -= 160.0
    if p in {22, 2375, 5432, 6379, 27017}:
        s -= 300.0
    return s


def _infer_role_from_fingerprint(
    internal_port: int,
    fp: Mapping[str, Any],
    *,
    split_preview_mode: bool,
) -> str:
    p = int(internal_port)
    if split_preview_mode and p == int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT):
        return SERVICE_ROLE_API
    if p in {9229, 9230, 5858, 9222}:
        return SERVICE_ROLE_DEBUG
    if not fp.get("ok"):
        return SERVICE_ROLE_UNKNOWN
    srv = str(fp.get("server") or "").lower()
    if "uvicorn" in srv or "gunicorn" in srv or "werkzeug" in srv or "daphne" in srv:
        return SERVICE_ROLE_API
    if fp.get("html_like") or fp.get("vite_hmr_hint") or fp.get("next_hint") or fp.get("webpack_hint"):
        return SERVICE_ROLE_FRONTEND
    if fp.get("json_like") and int(fp.get("status") or 0) in {200, 401, 403, 404}:
        # Many APIs expose JSON errors on `/`.
        return SERVICE_ROLE_API
    return SERVICE_ROLE_UNKNOWN


def preview_surface_priority_score(
    internal_port: int,
    fingerprint: Mapping[str, Any],
    *,
    framework: str,
    topology_analysis: Mapping[str, Any],
    primary_listen: int,
    split_preview_mode: bool,
) -> Tuple[float, str]:
    topo = str((topology_analysis or {}).get("topology_kind") or "")
    fw = str(framework or "").lower().strip()

    score = _port_only_score(
        internal_port,
        framework=fw,
        primary_listen=primary_listen,
        split_preview_mode=split_preview_mode,
    )
    role = _infer_role_from_fingerprint(internal_port, fingerprint, split_preview_mode=split_preview_mode)

    if fingerprint.get("ok"):
        if role == SERVICE_ROLE_FRONTEND:
            score += 95.0
        elif role == SERVICE_ROLE_API:
            score -= 65.0
        elif role == SERVICE_ROLE_DEBUG:
            score -= 120.0
        if fingerprint.get("vite_hmr_hint") or fingerprint.get("next_hint"):
            score += 40.0

    # Hybrid repos: steer away from “first generic HTTP” that might be FastAPI JSON.
    if topo == "hybrid_frontend_backend" and fw in {"vite", "nextjs", "remix", "nuxt", "unknown"}:
        json_only = fingerprint.get("json_like") and not fingerprint.get("html_like")
        if json_only:
            score -= 45.0

    return score, role


def rank_preview_bindings(
    bindings: Sequence[Tuple[int, int]],
    *,
    primary_listen: int,
    publish_order: Sequence[int],
    framework: str,
    topology_analysis: Mapping[str, Any],
    split_preview_mode: bool,
) -> list[Tuple[int, int]]:
    """
    Higher preview_surface_priority_score probes first — maximizes iframe UX while
    still falling back when the UI server is slower to boot.
    """
    ranked, _ = rank_preview_bindings_with_diagnostics(
        bindings,
        primary_listen=primary_listen,
        publish_order=publish_order,
        framework=framework,
        topology_analysis=topology_analysis,
        split_preview_mode=split_preview_mode,
    )
    return ranked


def rank_preview_bindings_with_diagnostics(
    bindings: Sequence[Tuple[int, int]],
    *,
    primary_listen: int,
    publish_order: Sequence[int],
    framework: str,
    topology_analysis: Mapping[str, Any],
    split_preview_mode: bool,
) -> Tuple[list[Tuple[int, int]], list[Dict[str, Any]]]:
    pub_idx = {int(p): i for i, p in enumerate(publish_order)}
    rows: list[Tuple[float, int, Tuple[int, int], str, Dict[str, Any]]] = []
    for cinp, hhp in bindings:
        cinpi, hhpi = int(cinp), int(hhp)
        fp = http_probe_fingerprint(port=hhpi)
        pri, role = preview_surface_priority_score(
            cinpi,
            fp,
            framework=framework,
            topology_analysis=topology_analysis,
            primary_listen=primary_listen,
            split_preview_mode=split_preview_mode,
        )
        rows.append((pri, pub_idx.get(cinpi, 999), (cinpi, hhpi), role, dict(fp)))

    rows.sort(key=lambda t: (-t[0], t[1], t[2][0]))
    ranked: list[Tuple[int, int]] = []
    trace: list[Dict[str, Any]] = []
    for pri, _pub, pair, role, fp in rows:
        ranked.append(pair)
        trace.append(
            {
                "container_port": int(pair[0]),
                "host_port": int(pair[1]),
                "preview_priority_score": float(pri),
                "service_role_inference": role,
                "probe_ok": bool(fp.get("ok")),
                "probe_status": fp.get("status"),
                "content_type": (fp.get("content_type") or "")[:120],
                "server": (fp.get("server") or "")[:120],
            }
        )
    return ranked, trace
