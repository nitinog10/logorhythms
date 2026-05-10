from __future__ import annotations

import json
import os
import sys
import importlib.util
import builtins
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _fake_cfg():
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
        studio_runtime_start_timeout_seconds=30,
        studio_runtime_idle_timeout_seconds=1800,
        studio_runtime_allow_custom_dockerfile=False,
        studio_runtime_custom_dockerfile_trusted_only=True,
        studio_runtime_docker_user="",
        studio_runtime_http_probe_timeout_seconds=2.0,
        studio_runtime_docker_post_mortem_retain_seconds=0,
        studio_runtime_docker_autoremove=False,
    )


def _load_runtime_manager_module():
    root = Path(__file__).resolve().parents[1]
    target = root / "app" / "services" / "runtime_manager.py"
    name = "runtime_manager_under_test"
    spec = importlib.util.spec_from_file_location(name, target)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _stub_preview_gateway(rm):
    rm.preview_gateway = SimpleNamespace(
        gateway_enabled=lambda: False,
        public_url_for_session=lambda sid: f"https://preview.docuverse.ai/{sid}/",
        upsert_session_route=lambda session_id, target: None,
        remove_session_route=lambda session_id: None,
        prune_routes=lambda valid: 0,
    )


@pytest.mark.asyncio
async def test_docker_runtime_missing_cli_returns_structured_error(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    state_file = tmp_path / "runtimes.json"
    state_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: False)

    mgr = rm.DockerRuntimeManager()
    out = await mgr.launch(
        rm.RuntimeLaunchInput(
            runtime_key="sess_x",
            session_id="sess_x",
            session_kind="imported",
            source_id="repo_x",
            project_dir=tmp_path,
            env_config={},
            plan={"framework": "nextjs", "dev_cmd": "npm run dev"},
            proxy_public_base=None,
            studio_proxy_enabled=True,
            docker_install=False,
        )
    )
    assert out["status"] == "error"
    assert out["error_code"] == "DOCKER_CLI_MISSING"
    assert out["phase"] == "detect"


@pytest.mark.asyncio
async def test_docker_runtime_launch_status_logs_stop(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"next dev"}}',
        encoding="utf-8",
    )

    state_file = tmp_path / "runtimes.json"
    state_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: True)
    monkeypatch.setattr(rm, "_is_port_open", lambda p: True)
    monkeypatch.setattr(
        rm,
        "_http_probe",
        lambda *_args, **_kwargs: {"success": True, "status_code": 200},
    )

    finsp_full = {"n": 0}

    def fake_run(args, timeout=30):
        cmd = " ".join(args)
        if "docker run" in cmd:
            return 0, "abc123container", ""
        if "docker port" in cmd:
            return 0, "127.0.0.1:45678", ""
        if "docker inspect" in cmd and "--format" in cmd:
            if ".State.ExitCode" in cmd or ".State.Status" in cmd:
                return 0, "true|0|running", ""
            return 0, "true", ""
        if "docker inspect" in cmd and "--format" not in cmd:
            finsp_full["n"] += 1
            if finsp_full["n"] <= 1:
                return (
                    0,
                    '[{"State":{"Running":true,"Status":"running","ExitCode":0}}]',
                    "",
                )
            return (
                0,
                '[{"State":{"Running":false,"Status":"exited","ExitCode":0}}]',
                "",
            )
        if "docker logs" in cmd:
            return 0, "[runtime-phase] start\nready", ""
        if "docker rm -f" in cmd:
            return 0, "", ""
        return 0, "", ""

    monkeypatch.setattr(rm, "_run_docker", fake_run)

    mgr = rm.DockerRuntimeManager()
    launch = await mgr.launch(
        rm.RuntimeLaunchInput(
            runtime_key="sess_y",
            session_id="sess_y",
            session_kind="imported",
            source_id="repo_y",
            project_dir=tmp_path,
            env_config={},
            plan={"framework": "nextjs", "dev_cmd": "npm run dev"},
            proxy_public_base=None,
            studio_proxy_enabled=True,
            docker_install=False,
        )
    )
    assert launch["status"] == "running"
    assert launch["runtime_backend"] == "docker"
    assert launch["phase"] == "ready"
    assert launch["port"] == 45678
    assert launch["runtime_provenance"] == "generated_spec"

    status = await mgr.status("sess_y", session_id="sess_y")
    assert status is not None
    assert status["status"] == "running"
    assert status["container_id"] == "abc123container"

    logs = await mgr.logs("sess_y", tail=50)
    assert "ready" in logs

    stopped = await mgr.stop("sess_y")
    assert stopped is True
    pending = list(mgr._docker_teardown_tasks)
    for task in pending:
        await task
    data = json.loads(state_file.read_text(encoding="utf-8"))
    assert "sess_y" not in data


def test_cleanup_orphan_state_entries(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    state_file = tmp_path / "runtimes.json"
    state_file.write_text(
        json.dumps(
            {
                "sess_live": {"container_id": "live"},
                "sess_dead": {"container_id": "dead"},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)

    def fake_run(args, timeout=30):
        cmd = " ".join(args)
        if "inspect" in cmd and "live" in cmd:
            return 0, "true", ""
        if "inspect" in cmd and "dead" in cmd:
            return 1, "", "No such container"
        return 0, "", ""

    monkeypatch.setattr(rm, "_run_docker", fake_run)
    rm._cleanup_orphan_state_entries()
    data = json.loads(state_file.read_text(encoding="utf-8"))
    assert "sess_live" in data
    assert "sess_dead" not in data


@pytest.mark.asyncio
async def test_custom_dockerfile_policy_rejects_privileged_patterns(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"next dev"}}',
        encoding="utf-8",
    )
    (tmp_path / "next.config.js").write_text("module.exports = {}", encoding="utf-8")

    state_file = tmp_path / "runtimes.json"
    state_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)

    cfg = _fake_cfg()
    cfg.studio_runtime_allow_custom_dockerfile = True
    cfg.studio_runtime_custom_dockerfile_trusted_only = False
    monkeypatch.setattr(rm, "get_settings", lambda: cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: True)

    dockerfile = tmp_path / "Dockerfile"
    dockerfile.write_text("FROM node:20\n# --privileged\n", encoding="utf-8")

    mgr = rm.DockerRuntimeManager()
    out = await mgr.launch(
        rm.RuntimeLaunchInput(
            runtime_key="sess_df",
            session_id="sess_df",
            session_kind="imported",
            source_id="repo_df",
            project_dir=tmp_path,
            env_config={},
            plan={"framework": "nextjs", "app_root_rel": ".", "dev_cmd": "npm run dev"},
            proxy_public_base=None,
            studio_proxy_enabled=True,
            docker_install=False,
            trusted_runtime=True,
        )
    )
    assert out["status"] == "error"
    assert out["error_code"] == "DOCKERFILE_POLICY_REJECTED"


def test_get_runtime_manager_returns_docker_when_configured(monkeypatch):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    mgr = rm.get_runtime_manager()
    assert isinstance(mgr, rm.DockerRuntimeManager)


def test_get_runtime_manager_invalid_mode_raises(monkeypatch):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)
    cfg = _fake_cfg()
    cfg.studio_runtime_mode = "invalid_mode"
    monkeypatch.setattr(rm, "get_settings", lambda: cfg)
    with pytest.raises(RuntimeError):
        rm.get_runtime_manager()


def test_structured_error_classifies_missing_package_json():
    rm = _load_runtime_manager_module()
    out = rm._structured_error(
        phase="start",
        code="DOCKER_RUNTIME_EXITED",
        message="runtime exited",
        diagnostics={
            "package_root": "/workspace",
            "package_root_exists": True,
            "package_json_exists": False,
            "detected_runtime_command": "npm run dev",
        },
    )
    cls = out.get("failure_classification") or {}
    assert cls.get("code") == "MISSING_PACKAGE_JSON"
    assert "failure_classification" in (out.get("diagnostics") or {})


def test_structured_error_classifies_unsupported_node_engine():
    rm = _load_runtime_manager_module()
    out = rm._structured_error(
        phase="start",
        code="DOCKER_RUNTIME_EXITED",
        message="runtime exited",
        diagnostics={
            "recent_logs": "npm ERR! code EBADENGINE Unsupported engine",
            "package_root_exists": True,
            "package_json_exists": True,
            "detected_runtime_command": "npm run dev",
        },
    )
    cls = out.get("failure_classification") or {}
    assert cls.get("code") == "UNSUPPORTED_NODE_ENGINE"


def test_phase_commands_prefer_live_preview_over_production_build(tmp_path: Path):
    rm = _load_runtime_manager_module()
    payload = rm.RuntimeLaunchInput(
        runtime_key="rk1",
        session_id="sid1",
        session_kind="imported",
        source_id="repo1",
        project_dir=tmp_path,
        env_config={},
        plan={
            "framework": "vite",
            "install_cmd": "npm install",
            "dev_cmd": "npm run dev",
            "build_cmd": "vite build && esbuild src/main.ts --bundle",
        },
        proxy_public_base=None,
        studio_proxy_enabled=True,
        docker_install=False,
    )
    cmds = rm._derive_phase_commands(payload, 3000)
    assert cmds["preview_strategy"] == "live_preview"
    assert cmds["build"] == ""
    assert "npm run dev" in cmds["start"]


def test_phase_commands_can_force_build_when_required(tmp_path: Path):
    rm = _load_runtime_manager_module()
    payload = rm.RuntimeLaunchInput(
        runtime_key="rk2",
        session_id="sid2",
        session_kind="imported",
        source_id="repo2",
        project_dir=tmp_path,
        env_config={},
        plan={
            "framework": "nextjs",
            "install_cmd": "npm install",
            "dev_cmd": "npm run dev",
            "build_cmd": "next build",
            "require_build_before_start": True,
            "preview_strategy": "deployment_build",
        },
        proxy_public_base=None,
        studio_proxy_enabled=True,
        docker_install=False,
    )
    cmds = rm._derive_phase_commands(payload, 3000)
    assert cmds["preview_strategy"] == "deployment_build"
    assert cmds["build"] == "next build"


def test_structured_error_classifies_topology_mismatch_lifecycle():
    rm = _load_runtime_manager_module()
    out = rm._structured_error(
        phase="start",
        code="DOCKER_START_TIMEOUT",
        message="timeout",
        diagnostics={
            "http_probe": {"success": False},
            "topology_analysis": {
                "lifecycle_category_hint": "frontend_backend_topology_mismatch"
            },
        },
    )
    cls = out.get("failure_classification") or {}
    assert cls.get("lifecycle_category") in {
        "http_readiness_failure",
        "frontend_backend_topology_mismatch",
    }


@pytest.mark.asyncio
async def test_docker_launch_does_not_import_preview_runner(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"next dev"}}',
        encoding="utf-8",
    )

    state_file = tmp_path / "runtimes.json"
    state_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: True)
    monkeypatch.setattr(rm, "_is_port_open", lambda p: True)
    monkeypatch.setattr(
        rm,
        "_http_probe",
        lambda *_args, **_kwargs: {"success": True, "status_code": 200},
    )

    def fake_run(args, timeout=30):
        cmd = " ".join(args)
        if "docker run" in cmd:
            return 0, "cid-no-import", ""
        if "docker port" in cmd:
            return 0, "127.0.0.1:46789", ""
        if "docker inspect --format" in cmd:
            return 0, "true|0|running", ""
        if "docker inspect" in cmd:
            return 0, '[{"State":{"Running":true,"Status":"running","ExitCode":0}}]', ""
        if "docker rm -f" in cmd:
            return 0, "", ""
        return 0, "", ""

    monkeypatch.setattr(rm, "_run_docker", fake_run)

    original_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "app.services.preview_runner":
            raise AssertionError("Docker runtime attempted to import preview_runner")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", guarded_import)

    mgr = rm.DockerRuntimeManager()
    launch = await mgr.launch(
        rm.RuntimeLaunchInput(
            runtime_key="sess_no_preview_runner",
            session_id="sess_no_preview_runner",
            session_kind="imported",
            source_id="repo_no_preview_runner",
            project_dir=tmp_path,
            env_config={},
            plan={"framework": "nextjs", "dev_cmd": "npm run dev"},
            proxy_public_base=None,
            studio_proxy_enabled=True,
            docker_install=False,
        )
    )
    assert launch["status"] == "running"
    assert launch["runtime_backend"] == "docker"


@pytest.mark.asyncio
async def test_docker_timeout_error_does_not_emit_legacy_preview_process_string(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"next dev"}}',
        encoding="utf-8",
    )

    state_file = tmp_path / "runtimes.json"
    state_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    monkeypatch.setattr(rm, "_docker_cli_exists", lambda: True)
    monkeypatch.setattr(rm, "_is_port_open", lambda p: False)
    tick = {"t": 1000.0}

    def fast_time():
        tick["t"] += 5.0
        return tick["t"]

    monkeypatch.setattr(rm.time, "time", fast_time)

    def fake_run(args, timeout=30):
        cmd = " ".join(args)
        if "docker run" in cmd:
            return 0, "cid-timeout", ""
        if "docker port" in cmd and "3000/tcp" in cmd:
            return 0, "127.0.0.1:47890", ""
        if "docker inspect" in cmd:
            return 0, '[{"State":{"Running":true,"Status":"running","ExitCode":0}}]', ""
        if "docker exec" in cmd:
            return 0, "", ""
        if "docker logs" in cmd:
            return 0, "still booting", ""
        if "docker rm -f" in cmd:
            return 0, "", ""
        return 0, "", ""

    monkeypatch.setattr(rm, "_run_docker", fake_run)

    mgr = rm.DockerRuntimeManager()
    out = await mgr.launch(
        rm.RuntimeLaunchInput(
            runtime_key="sess_timeout",
            session_id="sess_timeout",
            session_kind="imported",
            source_id="repo_timeout",
            project_dir=tmp_path,
            env_config={},
            plan={"framework": "nextjs", "dev_cmd": "npm run dev"},
            proxy_public_base=None,
            studio_proxy_enabled=True,
            docker_install=False,
        )
    )
    assert out["status"] == "error"
    assert out["error_code"] == "DOCKER_START_TIMEOUT"
    assert "preview_process[" not in str(out.get("error") or "")
    assert "backend:host" not in str(out.get("error") or "")


@pytest.mark.asyncio
async def test_cleanup_does_not_stop_startup_phase_runtime(monkeypatch, tmp_path: Path):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)

    state_file = tmp_path / "runtimes.json"
    state_file.write_text(
        json.dumps(
            {
                "sess_launching": {
                    "session_id": "sess_launching",
                    "container_id": "cid-launching",
                    "phase": "detect",
                    "created_at": 1.0,
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(rm, "_runtime_state_path", lambda: state_file)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    monkeypatch.setattr(rm.time, "time", lambda: 10_000.0)
    monkeypatch.setattr(rm, "_cleanup_orphan_state_entries", lambda: None)

    stop_calls: list[str] = []

    async def fake_stop(self, runtime_key: str) -> bool:
        stop_calls.append(runtime_key)
        return True

    monkeypatch.setattr(rm.DockerRuntimeManager, "stop", fake_stop)
    mgr = rm.DockerRuntimeManager()
    out = await mgr.cleanup()

    assert out["adapter"] == "docker"
    assert out["removed"] == 0
    assert stop_calls == []


@pytest.mark.asyncio
async def test_host_runtime_manager_raises_when_mode_is_docker(monkeypatch):
    rm = _load_runtime_manager_module()
    _stub_preview_gateway(rm)
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)

    mgr = rm.HostRuntimeManager()
    with pytest.raises(RuntimeError):
        await mgr.status("sess_guard")


def test_pick_image_split_toolchain_override_wins(monkeypatch):
    rm = _load_runtime_manager_module()
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    assert (
        rm._pick_image(
            {"framework": "fastapi"},
            {"studio_split_toolchain_image": "corp/studio-hybrid:prod"},
        )
        == "corp/studio-hybrid:prod"
    )


def test_pick_image_uses_adapter_primary_toolchain(monkeypatch):
    rm = _load_runtime_manager_module()
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    assert rm._pick_image({"framework": "fastapi"}, {}) == "python:3.11-slim"
    assert rm._pick_image({"framework": "nextjs"}, {}) == "node:20-bookworm-slim"
    assert rm._pick_image({"framework": "go"}, {}) == "golang:1.22-bookworm"


def test_pick_image_split_uses_backend_disk_python_markers(monkeypatch):
    """Python base image when backend tree has Python markers even if cmd is nonstandard."""
    rm = _load_runtime_manager_module()
    monkeypatch.setattr(rm, "get_settings", _fake_cfg)
    pcm = {
        "studio_split_preview_mode": True,
        "studio_split_backend_has_python": True,
        "studio_split_backend_has_go": False,
        "backend_dev_command_wired": "./scripts/run-backend.sh",
    }
    assert rm._pick_image({"framework": "nextjs"}, pcm) == "python:3.11-slim"

