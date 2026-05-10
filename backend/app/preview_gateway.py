"""
Studio preview gateway integration.

Traefik-first design:
- Runtime layer writes deterministic session -> target mappings here.
- This module renders a Traefik file-provider config for HTTP + websocket
  passthrough (handled natively by Traefik).
- Studio API remains runtime-agnostic; no routing logic in endpoints.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict

from app.config import get_settings
from app.monorepo_paths import default_workspace_dir


def _gateway_state_dir() -> Path:
    root = Path(default_workspace_dir()).resolve()
    d = root / "_studio_gateway"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _routes_state_path() -> Path:
    p = _gateway_state_dir() / "routes.json"
    if not p.exists():
        p.write_text("{}", encoding="utf-8")
    return p


def _dynamic_config_path() -> Path:
    cfg = get_settings()
    raw = (cfg.studio_gateway_traefik_dynamic_config_path or "").strip()
    if raw:
        p = Path(raw)
        if not p.is_absolute():
            p = Path.cwd() / p
    else:
        p = _gateway_state_dir() / "traefik_dynamic.yml"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _read_routes() -> Dict[str, str]:
    p = _routes_state_path()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except Exception:
        pass
    return {}


def _write_routes(data: Dict[str, str]) -> None:
    p = _routes_state_path()
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(p)


def _safe_id(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "-", (value or "").strip())


def _render_traefik_yaml(routes: Dict[str, str]) -> str:
    cfg = get_settings()
    host = (cfg.studio_preview_domain or "").strip().strip("/")
    ep = (cfg.studio_gateway_traefik_entrypoint or "websecure").strip() or "websecure"

    lines = ["http:", "  routers:", "  services:", "  middlewares:"]
    if not host or not routes:
        return "\n".join(lines) + "\n"

    router_lines = ["http:", "  routers:"]
    service_lines = ["  services:"]
    middleware_lines = ["  middlewares:"]

    for sid, target in sorted(routes.items()):
        slug = _safe_id(sid)
        router = f"studio-{slug}"
        service = f"studio-{slug}-svc"
        mw = f"studio-{slug}-strip"
        prefix = f"/{sid}"
        target_url = (target or "").strip().rstrip("/")

        router_lines.extend(
            [
                f"    {router}:",
                f"      rule: \"Host(`{host}`) && PathPrefix(`{prefix}`)\"",
                f"      service: \"{service}\"",
                f"      entryPoints: [\"{ep}\"]",
                f"      middlewares: [\"{mw}\"]",
            ]
        )
        middleware_lines.extend(
            [
                f"    {mw}:",
                "      stripPrefix:",
                f"        prefixes: [\"{prefix}\"]",
            ]
        )
        service_lines.extend(
            [
                f"    {service}:",
                "      loadBalancer:",
                "        servers:",
                f"          - url: \"{target_url}\"",
            ]
        )

    return "\n".join(router_lines + service_lines + middleware_lines) + "\n"


def _rewrite_dynamic_config() -> None:
    yml = _render_traefik_yaml(_read_routes())
    p = _dynamic_config_path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(yml, encoding="utf-8")
    tmp.replace(p)


def gateway_enabled() -> bool:
    cfg = get_settings()
    return (
        cfg.studio_preview_gateway_mode == "preview_domain"
        and cfg.studio_gateway_provider == "traefik_file"
        and bool((cfg.studio_preview_domain or "").strip())
    )


def public_url_for_session(session_id: str) -> str:
    host = (get_settings().studio_preview_domain or "").strip().strip("/")
    return f"https://{host}/{session_id}/"


def upsert_session_route(session_id: str, target_base_url: str) -> None:
    if not gateway_enabled():
        return
    sid = (session_id or "").strip()
    tgt = (target_base_url or "").strip().rstrip("/")
    if not sid or not tgt:
        return
    routes = _read_routes()
    routes[sid] = tgt
    _write_routes(routes)
    _rewrite_dynamic_config()


def remove_session_route(session_id: str) -> None:
    sid = (session_id or "").strip()
    if not sid:
        return
    routes = _read_routes()
    if sid not in routes:
        return
    routes.pop(sid, None)
    _write_routes(routes)
    _rewrite_dynamic_config()


def prune_routes(valid_session_ids: set[str]) -> int:
    """Remove routes that no longer map to active runtime/session ids."""
    routes = _read_routes()
    keep = {str(s).strip() for s in (valid_session_ids or set()) if str(s).strip()}
    removed = 0
    for sid in list(routes.keys()):
        if sid not in keep:
            routes.pop(sid, None)
            removed += 1
    if removed:
        _write_routes(routes)
        _rewrite_dynamic_config()
    return removed

