"""
Studio preview: split-repo bootstrap, HTTP proxy edge cases, iframe URL helper.

No real npm/uvicorn — uses a loopback thread server for proxy streaming.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def mini_studio_app():
    from fastapi import FastAPI
    from app.api.endpoints import studio as studio_mod

    app = FastAPI()
    app.include_router(studio_mod.router, prefix="/studio")
    return app


def test_detect_bootstrap_split_backend_frontend_sets_preview_processes(tmp_path: Path):
    from app.services.repo_bootstrap import detect_bootstrap_plan

    be = tmp_path / "backend"
    fe = tmp_path / "frontend"
    be.mkdir()
    fe.mkdir()
    (be / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
    (be / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")
    pkg = {
        "name": "fe",
        "scripts": {"dev": "vite"},
        "devDependencies": {"vite": "^5.0.0"},
    }
    (fe / "package.json").write_text(json.dumps(pkg), encoding="utf-8")

    plan = detect_bootstrap_plan(str(tmp_path))
    assert len(plan.preview_processes) == 2
    prim = [p for p in plan.preview_processes if p.get("primary")]
    assert len(prim) == 1
    assert prim[0].get("cwd_rel") == "frontend"
    non_prim = [p for p in plan.preview_processes if not p.get("primary")]
    assert len(non_prim) == 1
    assert non_prim[0].get("cwd_rel") == "backend"
    assert "uvicorn" in str(non_prim[0].get("cmd") or "")
    assert plan.preview_use_proxy is False


def test_detect_bootstrap_pure_go_module(tmp_path: Path):
    from app.services.repo_bootstrap import detect_bootstrap_plan

    root = tmp_path / "goproj"
    root.mkdir()
    (root / "go.mod").write_text("module example.com/app\ngo 1.22\n", encoding="utf-8")
    (root / "main.go").write_text("package main\nfunc main(){}\n", encoding="utf-8")

    plan = detect_bootstrap_plan(str(root))
    assert plan.framework == "go"
    assert plan.framework_variant == "native"
    assert plan.runtime == "go"
    assert "go mod download" in plan.install_cmd


def test_detect_bootstrap_go_with_air(tmp_path: Path):
    from app.services.repo_bootstrap import detect_bootstrap_plan

    air_root = tmp_path / "goair"
    air_root.mkdir()
    (air_root / "go.mod").write_text("module x\ngo 1.22\n", encoding="utf-8")
    (air_root / "main.go").write_text("package main\nfunc main(){}\n", encoding="utf-8")
    (air_root / ".air.toml").write_text("root = '.'\n", encoding="utf-8")
    pa = detect_bootstrap_plan(str(air_root))
    assert pa.framework == "go"
    assert pa.framework_variant == "air"
    assert pa.dev_cmd.strip() == "air"


def test_detect_bootstrap_split_go_and_frontend_sets_preview_processes(tmp_path: Path):
    from app.services.repo_bootstrap import detect_bootstrap_plan

    be = tmp_path / "backend"
    fe = tmp_path / "frontend"
    be.mkdir()
    fe.mkdir()
    (be / "go.mod").write_text("module api\ngo 1.22\n", encoding="utf-8")
    (be / "cmd" / "server").mkdir(parents=True)
    (be / "cmd" / "server" / "main.go").write_text(
        "package main\nfunc main(){}\n", encoding="utf-8"
    )
    pkg = {
        "name": "fe",
        "scripts": {"dev": "vite"},
        "devDependencies": {"vite": "^5.0.0"},
    }
    (fe / "package.json").write_text(json.dumps(pkg), encoding="utf-8")

    plan = detect_bootstrap_plan(str(tmp_path))
    assert len(plan.preview_processes) == 2
    be_proc = next(p for p in plan.preview_processes if p.get("cwd_rel") == "backend")
    fe_proc = next(p for p in plan.preview_processes if p.get("cwd_rel") == "frontend")
    assert be_proc.get("primary") is False
    assert fe_proc.get("primary") is True
    assert "go run ./cmd/server" in str(be_proc.get("cmd") or "")


def test_compose_studio_iframe_proxy_for_fastapi_when_enabled():
    from app.services.preview_runner import compose_studio_iframe_url

    url, active = compose_studio_iframe_url(
        session_id="sess-1",
        proxy_public_base="https://api.example.com",
        proxy_enabled_globally=True,
        plan_dict={"framework": "fastapi"},
        direct_url="http://127.0.0.1:8000",
    )
    assert active is True
    assert url == "https://api.example.com/api/studio/sessions/sess-1/preview/"


def test_compose_studio_iframe_proxy_for_go_when_enabled():
    from app.services.preview_runner import compose_studio_iframe_url

    url, active = compose_studio_iframe_url(
        session_id="sess-go",
        proxy_public_base="https://api.example.com",
        proxy_enabled_globally=True,
        plan_dict={"framework": "go"},
        direct_url="http://127.0.0.1:8080",
    )
    assert active is True
    assert "/preview/" in url


def test_compose_studio_iframe_direct_for_vite_when_split_explicit():
    from app.services.preview_runner import compose_studio_iframe_url

    direct = "http://127.0.0.1:5173"
    url, active = compose_studio_iframe_url(
        session_id="sess-2",
        proxy_public_base="https://api.example.com",
        proxy_enabled_globally=True,
        plan_dict={"framework": "vite", "preview_use_proxy": False},
        direct_url=direct,
    )
    assert active is False
    assert url == direct


def test_preview_loopback_base():
    from app.services.preview_runner import preview_loopback_base

    b = preview_loopback_base(9123)
    assert b.endswith(":9123")
    assert b.startswith("http://")


def test_studio_preview_proxy_websocket_returns_501(mini_studio_app):
    from starlette.testclient import TestClient

    with TestClient(mini_studio_app) as client:
        r = client.get(
            "/studio/sessions/any/preview",
            headers={"Upgrade": "websocket"},
        )
    assert r.status_code == 501


def test_studio_preview_proxy_streams_from_loopback(mini_studio_app, monkeypatch):
    from starlette.testclient import TestClient
    from app.api.endpoints import studio as studio_mod
    from app.models.schemas import User

    class _H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            self.wfile.write(b"hello-proxy")

        def log_message(self, *args):
            pass

    srv = HTTPServer(("127.0.0.1", 0), _H)
    port = srv.server_port
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    try:

        async def _fake_guard(authorization: str | None = None):
            return User(id="u1", github_id=1, username="t", access_token="")

        monkeypatch.setattr(studio_mod, "_guard", _fake_guard)
        monkeypatch.setattr(
            studio_mod,
            "load_session",
            lambda _sid: {"user_id": "u1", "kind": "imported", "source_id": "r1"},
        )

        import app.services.preview_runner as pr

        class _FakeRm:
            async def status(self, _rkey: str, session_id=None):
                return {"status": "running", "port": port}

        monkeypatch.setattr(studio_mod, "_get_runtime_manager_checked", lambda _sid: _FakeRm())
        monkeypatch.setattr(
            pr,
            "get_preview_status",
            lambda _k: {"status": "running", "port": port},
        )

        with TestClient(mini_studio_app) as client:
            r = client.get(
                "/studio/sessions/s1/preview/",
                headers={"Authorization": "Bearer x"},
            )
        assert r.status_code == 200
        assert r.text == "hello-proxy"
        assert "x-frame-options" not in {k.lower() for k in r.headers.keys()}
    finally:
        srv.shutdown()
        th.join(timeout=5)


def test_docker_cli_available_is_bool():
    from app.services.studio_docker_install import docker_cli_available

    assert isinstance(docker_cli_available(), bool)


def test_inject_port_forwards_through_package_manager_scripts():
    """``npm run dev`` must receive ``--port`` or Studio probes the wrong TCP port."""
    from app.services.preview_runner import _inject_port_into_cmd

    assert _inject_port_into_cmd("npm run dev", 4000) == "npm run dev -- --port 4000"
    assert _inject_port_into_cmd("pnpm run dev", 4001) == "pnpm run dev -- --port 4001"
    assert _inject_port_into_cmd("pnpm dev", 4002) == "pnpm dev -- --port 4002"
    assert _inject_port_into_cmd("yarn dev", 4003) == "yarn dev --port 4003"
    assert _inject_port_into_cmd("npm run dev -- --turbo", 4004) == (
        "npm run dev -- --turbo --port 4004"
    )
    # already pinned
    assert _inject_port_into_cmd("next dev --port 3000", 4000) == "next dev --port 3000"
