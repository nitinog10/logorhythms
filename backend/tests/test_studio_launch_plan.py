"""Regression tests for adapter-owned Studio Docker launch planning."""

from pathlib import Path

import pytest

from app.config import get_settings
from app.runtime_intel import studio_launch_plan as slp

_INTERNAL = 3000


def test_prepare_wrong_package_root_returns_mismatch(tmp_path: Path):
    prep, err = slp.prepare_studio_docker_launch(
        tmp_path,
        {"framework": "vite", "app_root_rel": "apps/does-not-exist"},
        {},
        _INTERNAL,
    )
    assert prep is None and err is not None
    ph, code, msg, diag = err
    assert code == "LAUNCH_PLAN_PACKAGE_ROOT_MISMATCH"
    ml = msg.lower()
    assert (
        "wrong" in ml
        or "no directory" in ml
        or "usable" in ml  # exhausting candidate_roots when none exist on disk
    )


def test_prepare_missing_required_env_after_defaults(tmp_path: Path):
    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"vite"}}',
        encoding="utf-8",
    )
    (tmp_path / "vite.config.js").write_text("export default {}", encoding="utf-8")
    _, err = slp.prepare_studio_docker_launch(
        tmp_path,
        {"framework": "vite", "dev_cmd": "npm run dev", "env_keys_required": ["CUSTOM_API_KEY"]},
        {},
        _INTERNAL,
    )
    assert err is not None
    assert err[1] == "LAUNCH_PLAN_MISSING_ENV_VARS"
    assert "CUSTOM_API_KEY" in err[2]
    assert "CUSTOM_API_KEY" in (err[3].get("missing_env_keys") or [])


def test_prepare_missing_npm_script_uses_fallback_chain(tmp_path: Path):
    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"vite"}}',
        encoding="utf-8",
    )
    (tmp_path / "vite.config.ts").write_text("export default {}", encoding="utf-8")
    prep, err = slp.prepare_studio_docker_launch(
        tmp_path,
        {"framework": "vite", "dev_cmd": "npm run start"},
        {},
        _INTERNAL,
    )
    assert err is None and prep is not None
    assert prep.phase_cmds.get("start_execution_mode") == "multi_strategy"
    diag = prep.phase_cmds.get("studio_launch_diagnostics") or {}
    warns = diag.get("launch_plan_warnings") or []
    assert any("start" in str(w).lower() for w in warns)
    cands = prep.phase_cmds.get("_start_fallback_candidates") or []
    assert any(
        "vite" in str(c).lower() or "npm run dev" in str(c).lower() for c in cands
    )


def test_prepare_build_only_bootstrap_gets_next_dev_fallback(tmp_path: Path):
    (tmp_path / "package.json").write_text(
        '{"scripts":{"build":"next build"}}',
        encoding="utf-8",
    )
    (tmp_path / "next.config.js").write_text("module.exports = {}", encoding="utf-8")
    prep, err = slp.prepare_studio_docker_launch(
        tmp_path,
        {"framework": "nextjs", "dev_cmd": "npm run build"},
        {},
        _INTERNAL,
    )
    assert err is None and prep is not None
    cands = prep.phase_cmds.get("_start_fallback_candidates") or []
    assert any("next" in str(c).lower() and "dev" in str(c).lower() for c in cands)


def test_prepare_express_retries_workspace_root_when_monorepo_candidates_absent(tmp_path: Path):
    """Monorepo candidate paths are skipped when missing; Studio falls back to workspace root."""
    (tmp_path / "package.json").write_text('{"scripts":{}}', encoding="utf-8")
    prep, err = slp.prepare_studio_docker_launch(
        tmp_path,
        {
            "framework": "express",
            "monorepo_tool": True,
            "candidate_apps": ["apps/web"],
        },
        {},
        _INTERNAL,
    )
    assert err is None and prep is not None
    diag = prep.phase_cmds.get("studio_launch_diagnostics") or {}
    assert diag.get("successful_app_root_rel") == "."
    hints = diag.get("studio_launch_hints") or []
    assert hints  # workspace/monorepo guidance still surfaced


def test_prepare_happy_path_vite(tmp_path: Path):
    (tmp_path / "package.json").write_text(
        '{"scripts":{"dev":"vite"}}',
        encoding="utf-8",
    )
    (tmp_path / "vite.config.ts").write_text("export default {}", encoding="utf-8")
    prep, err = slp.prepare_studio_docker_launch(
        tmp_path,
        {"framework": "vite", "dev_cmd": "npm run dev"},
        {},
        _INTERNAL,
    )
    assert err is None and prep is not None
    assert prep.adapter.name == "vite"
    assert prep.container_workdir == "/workspace"
    assert prep.phase_cmds["preview_strategy"] == "live_preview"
    assert "npm run dev" in (prep.phase_cmds.get("start") or "").lower()
    assert prep.healthcheck_path.startswith("/")
    assert "npm run dev" in prep.shell_command or "vite" in prep.shell_command.lower()


def test_install_command_not_treated_as_long_running_server():
    assert not slp.looks_like_long_running_server("npm install")
    assert slp.looks_like_long_running_server("npm run dev")


def test_prepare_implicit_classic_split_from_layout(monkeypatch, tmp_path: Path):
    """Docker launch plan synthesizes ``preview_processes`` for backend+frontend trees."""
    monkeypatch.setenv("STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK", "true")
    get_settings.cache_clear()
    try:
        backend = tmp_path / "backend"
        frontend = tmp_path / "frontend"
        backend.mkdir()
        frontend.mkdir()
        (backend / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
        (frontend / "package.json").write_text(
            '{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}',
            encoding="utf-8",
        )
        prep, err = slp.prepare_studio_docker_launch(
            tmp_path,
            {"framework": "vite"},
            {},
            _INTERNAL,
        )
        assert err is None and prep is not None
        assert prep.phase_cmds.get("studio_split_preview_mode") is True
        diag = prep.phase_cmds.get("studio_launch_diagnostics") or {}
        assert diag.get("mode") == "studio_split_preview"
        sch = prep.shell_command
        strat = prep.phase_cmds.get("studio_split_toolchain_strategy")
        assert strat == "embed_node_fallback"
        assert "studio_embed_node" in sch or "/opt/studio-node" in sch
        low = sch.lower()
        assert "pip install" in low
        assert "npm install" in low or "pnpm install" in low
        assert "/workspace/backend" in low or "/backend" in prep.shell_command.replace("\\", "/")
        assert "/workspace/frontend" in low or "/frontend" in prep.shell_command.replace("\\", "/")
    finally:
        monkeypatch.delenv("STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK", raising=False)
        get_settings.cache_clear()


def test_prepare_split_predetermined_stack_image_skips_embed_node(monkeypatch, tmp_path: Path):
    """When STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE is set, do not bootstrap Node at runtime."""
    monkeypatch.setenv("STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE", "corp/studio-py-node:7")
    get_settings.cache_clear()
    try:
        backend = tmp_path / "backend"
        frontend = tmp_path / "frontend"
        backend.mkdir()
        frontend.mkdir()
        (backend / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
        (frontend / "package.json").write_text(
            '{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}',
            encoding="utf-8",
        )
        prep, err = slp.prepare_studio_docker_launch(
            tmp_path,
            {"framework": "vite"},
            {},
            _INTERNAL,
        )
        assert err is None and prep is not None
        assert prep.phase_cmds.get("studio_split_toolchain_strategy") == "predetermined_image"
        assert prep.phase_cmds.get("studio_split_toolchain_image") == "corp/studio-py-node:7"
        assert prep.phase_cmds.get("studio_split_toolchain_image_source") == "split_stack_image"
        assert "studio_embed_node" not in prep.shell_command
        assert "/opt/studio-node" not in prep.shell_command
    finally:
        monkeypatch.delenv("STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE", raising=False)
        get_settings.cache_clear()


def test_prepare_split_python_hybrid_prefers_specific_image_over_generic(
    monkeypatch, tmp_path: Path
):
    monkeypatch.setenv("STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE", "generic/fullstack:1")
    monkeypatch.setenv(
        "STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE",
        "corp/fe-py-node:2",
    )
    get_settings.cache_clear()
    try:
        backend = tmp_path / "backend"
        frontend = tmp_path / "frontend"
        backend.mkdir()
        frontend.mkdir()
        (backend / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
        (frontend / "package.json").write_text(
            '{"scripts":{"dev":"vite"}}',
            encoding="utf-8",
        )
        prep, err = slp.prepare_studio_docker_launch(
            tmp_path, {"framework": "vite"}, {}, _INTERNAL
        )
        assert err is None and prep is not None
        assert prep.phase_cmds.get("studio_split_toolchain_image") == "corp/fe-py-node:2"
        assert prep.phase_cmds.get("studio_split_toolchain_image_source") == (
            "split_node_python_image"
        )
    finally:
        monkeypatch.delenv("STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE", raising=False)
        monkeypatch.delenv(
            "STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE",
            raising=False,
        )
        get_settings.cache_clear()


def test_resolve_split_dual_backend_markers_prefers_generic_stack_image():
    img, src = slp.resolve_split_hybrid_toolchain_image(
        needs_embedded_node=True,
        be_has_py=True,
        be_has_go=True,
        split_py="only-py-img",
        split_go="only-go-img",
        split_any="ambiguous:latest",
    )
    assert img == "ambiguous:latest"
    assert src == "split_stack_image"


def test_resolve_split_dual_markers_without_generic_falls_back_to_python_hybrid():
    img, src = slp.resolve_split_hybrid_toolchain_image(
        needs_embedded_node=True,
        be_has_py=True,
        be_has_go=True,
        split_py="py-hybrid",
        split_go="go-hybrid",
        split_any="",
    )
    assert img == "py-hybrid"
    assert src == "split_node_python_image"


def test_resolve_split_go_backend_uses_go_hybrid():
    img, src = slp.resolve_split_hybrid_toolchain_image(
        needs_embedded_node=True,
        be_has_py=False,
        be_has_go=True,
        split_py="",
        split_go="corp/fe-go-node:3",
        split_any="fallback:x",
    )
    assert img == "corp/fe-go-node:3"
    assert src == "split_node_go_image"


def test_derive_exit_hint_go_backend_embed_explains_python_image_ignored():
    h = slp.derive_studio_docker_exit_hint(
        exit_code_normalized=2,
        log_tail="",
        phase_cmds={
            "studio_split_toolchain_strategy": "embed_node_fallback",
            "studio_split_backend_has_go": True,
            "studio_split_backend_has_python": False,
        },
        command_metadata={},
    )
    assert "STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE" in h
    assert "STUDIO_RUNTIME_DOCKER_SPLIT_NODE_GO_IMAGE" in h


def test_derive_exit_hint_embed_generic_when_python_backend():
    h = slp.derive_studio_docker_exit_hint(
        exit_code_normalized=2,
        log_tail="",
        phase_cmds={
            "studio_split_toolchain_strategy": "embed_node_fallback",
            "studio_split_backend_has_go": False,
            "studio_split_backend_has_python": True,
        },
        command_metadata={},
    )
    assert "Use hybrid images" in h


def test_prepare_split_rejects_without_hybrid_when_embed_disallowed(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK", "false")
    monkeypatch.delenv("STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE", raising=False)
    monkeypatch.delenv("STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE", raising=False)
    monkeypatch.delenv("STUDIO_RUNTIME_DOCKER_SPLIT_NODE_GO_IMAGE", raising=False)
    get_settings.cache_clear()
    try:
        backend = tmp_path / "backend"
        frontend = tmp_path / "frontend"
        backend.mkdir()
        frontend.mkdir()
        (backend / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
        (frontend / "package.json").write_text(
            '{"scripts":{"dev":"next dev"}}',
            encoding="utf-8",
        )
        (frontend / "next.config.js").write_text("module.exports = {}", encoding="utf-8")
        prep, err = slp.prepare_studio_docker_launch(
            tmp_path,
            {"framework": "nextjs"},
            {},
            _INTERNAL,
        )
        assert prep is None and err is not None
        assert err[1] == "MISSING_REQUIRED_TOOLCHAIN"
        assert (
            "STUDIO_RUNTIME_DOCKER_SPLIT" in err[2].upper()
            or "split" in err[2].lower()
        )
    finally:
        monkeypatch.delenv("STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK", raising=False)
        get_settings.cache_clear()


def test_split_preview_infers_next_backend_api_url_when_required(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK", "true")
    get_settings.cache_clear()
    try:
        backend = tmp_path / "backend"
        frontend = tmp_path / "frontend"
        backend.mkdir()
        frontend.mkdir()
        (backend / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
        (frontend / "package.json").write_text(
            '{"scripts":{"dev":"next dev"}}',
            encoding="utf-8",
        )
        (frontend / "next.config.js").write_text("module.exports = {}", encoding="utf-8")
        plan = {
            "framework": "nextjs",
            "env_keys_required": ["NEXT_BACKEND_API_URL"],
            "preview_processes": [
                {
                    "primary": True,
                    "cwd_rel": "frontend",
                    "cmd": "npm run dev -- --hostname 0.0.0.0 --port 3000",
                },
                {
                    "primary": False,
                    "cwd_rel": "backend",
                    "cmd": "uvicorn app:app --host 0.0.0.0 --port $PORT",
                },
            ],
        }
        prep, err = slp.prepare_studio_docker_launch(tmp_path, plan, {}, _INTERNAL)
        assert err is None and prep is not None
        assert prep.phase_cmds.get("studio_split_preview_mode") is True
        assert 'NEXT_BACKEND_API_URL="http://127.0.0.1:8787"' in prep.shell_command
    finally:
        monkeypatch.delenv("STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK", raising=False)
        get_settings.cache_clear()
