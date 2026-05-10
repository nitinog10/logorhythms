from __future__ import annotations

import importlib.util
import json
import os
import sys
import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _cfg():
    return SimpleNamespace(
        studio_preview_gateway_mode="local",
        studio_preview_domain="",
        studio_gateway_provider="none",
        studio_runtime_mode="docker",
        studio_runtime_docker_node_image="node:20-bookworm-slim",
        studio_runtime_docker_python_image="python:3.11-slim",
        studio_runtime_docker_go_image="golang:1.22-bookworm",
        studio_runtime_cpus=1.0,
        studio_runtime_memory="1g",
        studio_runtime_pids_limit=128,
        studio_runtime_start_timeout_seconds=20,
        studio_runtime_idle_timeout_seconds=1,
        studio_runtime_allow_custom_dockerfile=False,
        studio_runtime_custom_dockerfile_trusted_only=True,
        studio_runtime_docker_user="",
        studio_runtime_http_probe_timeout_seconds=2.0,
        studio_runtime_docker_post_mortem_retain_seconds=0,
        studio_runtime_docker_autoremove=False,
    )


def _load_rm():
    root = Path(__file__).resolve().parents[1]
    target = root / "app" / "services" / "runtime_manager.py"
    name = "runtime_manager_stress_under_test"
    spec = importlib.util.spec_from_file_location(name, target)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _stub_gateway(rm):
    routes = {}

    def _upsert(sid, target):
        routes[str(sid)] = str(target)

    def _remove(sid):
        routes.pop(str(sid), None)

    def _prune(valid):
        keep = {str(x) for x in valid}
        removed = 0
        for k in list(routes.keys()):
            if k not in keep:
                routes.pop(k, None)
                removed += 1
        return removed

    rm.preview_gateway = SimpleNamespace(
        gateway_enabled=lambda: True,
        public_url_for_session=lambda sid: f"https://preview.docuverse.ai/{sid}/",
        upsert_session_route=_upsert,
        remove_session_route=_remove,
        prune_routes=_prune,
    )
    return routes


@pytest.mark.asyncio
async def test_concurrent_launch_status_logs_stop_cycles(monkeypatch, tmp_path: Path):
    rm = _load_rm()
    routes = _stub_gateway(rm)

    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"next dev"}}',
        encoding="utf-8",
    )

    state = tmp_path / "runtimes.json"
    state.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state)
    monkeypatch.setattr(rm, "get_settings", _cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: True)
    monkeypatch.setattr(rm, "_is_port_open", lambda p: True)
    monkeypatch.setattr(
        rm,
        "_http_probe",
        lambda *_args, **_kwargs: {"success": True, "status_code": 200},
    )
    rm.reset_runtime_metrics_for_tests()

    next_port = {"v": 45000}
    cid_to_port = {}
    cid_serial = {"n": 0}

    def fake_run(args, timeout=30):
        cmd = " ".join(args)
        if "docker run" in cmd:
            cid_serial["n"] += 1
            cid = f"cid{cid_serial['n']}"
            cid_to_port[cid] = next_port["v"]
            next_port["v"] += 1
            return 0, cid, ""
        if "docker port" in cmd:
            cid = args[2]
            return 0, f"127.0.0.1:{cid_to_port.get(cid, 45000)}", ""
        if "docker inspect" in cmd:
            cid = args[-1]
            if "--format" in cmd:
                if ".State.ExitCode" in cmd or ".State.Status" in cmd:
                    return (
                        (0, "true|0|running", "")
                        if cid in cid_to_port
                        else (1, "", "missing")
                    )
                return (0, "true", "") if cid in cid_to_port else (1, "", "missing")
            return (
                (0, '[{"State":{"Running":true,"Status":"running","ExitCode":0}}]', "")
                if cid in cid_to_port
                else (1, "", "missing")
            )
        if "docker logs" in cmd:
            return 0, "hmr websocket reconnect ok", ""
        if "docker rm -f" in cmd:
            cid = args[-1]
            cid_to_port.pop(cid, None)
            return 0, "", ""
        return 0, "", ""

    monkeypatch.setattr(rm, "_run_docker", fake_run)

    mgr = rm.DockerRuntimeManager()

    async def cycle(i: int):
        sid = f"sess_{i}"
        payload = rm.RuntimeLaunchInput(
            runtime_key=sid,
            session_id=sid,
            session_kind="imported",
            source_id=f"repo_{i}",
            project_dir=tmp_path,
            env_config={},
            plan={"framework": "nextjs", "dev_cmd": "npm run dev"},
            proxy_public_base=None,
            studio_proxy_enabled=True,
            docker_install=False,
            trusted_runtime=True,
        )
        launched = await mgr.launch(payload)
        assert launched["status"] == "running"
        st = await mgr.status(sid, session_id=sid)
        assert st and st["status"] == "running"
        logs = await mgr.logs(sid, tail=20)
        assert "websocket" in logs
        stopped = await mgr.stop(sid)
        assert stopped is True

    await asyncio.gather(*(cycle(i) for i in range(1, 9)))

    for task in list(mgr._docker_teardown_tasks):
        await task

    assert json.loads(state.read_text(encoding="utf-8")) == {}
    assert routes == {}
    m = rm.runtime_metrics_snapshot()
    assert m["launch_attempts"] >= 8
    assert m["launch_success"] >= 8
    assert m["active_runtime_rows"] == 0


@pytest.mark.asyncio
async def test_restart_recovery_and_cleanup_prunes_state_and_routes(monkeypatch, tmp_path: Path):
    rm = _load_rm()
    routes = _stub_gateway(rm)

    state = tmp_path / "runtimes.json"
    state.write_text(
        json.dumps(
            {
                "sess_live": {
                    "container_id": "cid_live",
                    "session_id": "sess_live",
                    "started_at": 1.0,
                    "created_at": 1.0,
                },
                "sess_dead": {
                    "container_id": "cid_dead",
                    "session_id": "sess_dead",
                    "started_at": 1.0,
                    "created_at": 1.0,
                },
            }
        ),
        encoding="utf-8",
    )
    routes["sess_live"] = "http://127.0.0.1:4000"
    routes["sess_dead"] = "http://127.0.0.1:4001"
    routes["sess_stale"] = "http://127.0.0.1:4999"

    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state)
    monkeypatch.setattr(rm, "get_settings", _cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: True)
    monkeypatch.setattr(rm.time, "time", lambda: 9999.0)
    rm.reset_runtime_metrics_for_tests()

    def fake_run(args, timeout=30):
        cmd = " ".join(args)
        if "docker inspect" in cmd and "cid_dead" in cmd:
            return 1, "", "missing"
        if "docker inspect" in cmd and "cid_live" in cmd:
            if "--format" in cmd:
                if ".State.ExitCode" in cmd or ".State.Status" in cmd:
                    return 0, "false|0|exited", ""
                return 0, "true", ""
            return (
                0,
                '[{"State":{"Running":false,"Status":"exited","ExitCode":0}}]',
                "",
            )
        if "docker logs" in cmd:
            return 0, "cleanup log line", ""
        if "docker rm -f" in cmd:
            return 0, "", ""
        return 0, "", ""

    monkeypatch.setattr(rm, "_run_docker", fake_run)
    mgr = rm.DockerRuntimeManager()
    out = await mgr.cleanup()
    assert out["adapter"] == "docker"

    for task in list(mgr._docker_teardown_tasks):
        await task

    data = json.loads(state.read_text(encoding="utf-8"))
    assert data == {}
    assert routes == {}
    m = rm.runtime_metrics_snapshot()
    assert m["cleanup_runs"] >= 1
    assert m["route_prune_runs"] >= 1
