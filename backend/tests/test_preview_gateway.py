from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _cfg(tmp_path: Path):
    return SimpleNamespace(
        studio_preview_gateway_mode="preview_domain",
        studio_gateway_provider="traefik_file",
        studio_preview_domain="preview.docuverse.ai",
        studio_gateway_traefik_entrypoint="websecure",
        studio_gateway_traefik_dynamic_config_path=str(tmp_path / "traefik_dynamic.yml"),
    )


def test_traefik_route_upsert_and_remove(tmp_path: Path, monkeypatch):
    import app.preview_gateway as gw

    state = tmp_path / "routes.json"
    state.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(gw, "get_settings", lambda: _cfg(tmp_path))
    monkeypatch.setattr(gw, "_routes_state_path", lambda: state)

    gw.upsert_session_route("sess_123", "http://127.0.0.1:45678")
    routes = json.loads(state.read_text(encoding="utf-8"))
    assert routes["sess_123"] == "http://127.0.0.1:45678"

    dyn = (tmp_path / "traefik_dynamic.yml").read_text(encoding="utf-8")
    assert "Host(`preview.docuverse.ai`)" in dyn
    assert "PathPrefix(`/sess_123`)" in dyn
    assert "http://127.0.0.1:45678" in dyn

    gw.remove_session_route("sess_123")
    routes2 = json.loads(state.read_text(encoding="utf-8"))
    assert "sess_123" not in routes2


def test_public_url_for_session(tmp_path: Path, monkeypatch):
    import app.preview_gateway as gw

    monkeypatch.setattr(gw, "get_settings", lambda: _cfg(tmp_path))
    assert gw.public_url_for_session("sess_abc") == "https://preview.docuverse.ai/sess_abc/"


def test_prune_routes_removes_stale_entries(tmp_path: Path, monkeypatch):
    import app.preview_gateway as gw

    state = tmp_path / "routes.json"
    state.write_text(
        json.dumps(
            {
                "sess_keep": "http://127.0.0.1:4000",
                "sess_drop": "http://127.0.0.1:4001",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(gw, "get_settings", lambda: _cfg(tmp_path))
    monkeypatch.setattr(gw, "_routes_state_path", lambda: state)

    removed = gw.prune_routes({"sess_keep"})
    assert removed == 1
    data = json.loads(state.read_text(encoding="utf-8"))
    assert "sess_keep" in data
    assert "sess_drop" not in data

