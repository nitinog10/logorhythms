from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


@dataclass(frozen=True)
class FrameworkAdapter:
    """Source of truth for Studio preview semantics (strategy, health probes, manifests)."""

    name: str
    launch_strategy: str
    readiness_strategy: str
    probe_behavior: str
    hmr_expectation: str
    topology_assumption: str
    common_failure_patterns: Tuple[str, ...]
    port_binding_behavior: str
    env_expectations: Tuple[str, ...]
    # Studio Docker: default HTTP probe path (override via BootstrapPlan.healthcheck_path).
    healthcheck_path: str
    # Declared listener port hints (Studio Docker binds internal 3000; Python stacks still probed via PATH).
    expected_internal_listen_port: int
    # At least one path must exist relative to resolved package_root before launch.
    package_root_markers: Tuple[str, ...]
    # Maps this adapter to a Studio Docker base image tier (single-process previews).
    studio_docker_primary_toolchain: str = "node"


_DEFAULT = FrameworkAdapter(
    name="default",
    launch_strategy="live_preview",
    readiness_strategy="http_any_response",
    probe_behavior="HEAD_then_GET",
    hmr_expectation="optional",
    topology_assumption="unknown",
    common_failure_patterns=(),
    port_binding_behavior="bind_0.0.0.0",
    env_expectations=("PORT", "HOST"),
    healthcheck_path="/",
    expected_internal_listen_port=3000,
    package_root_markers=("package.json",),
)


def _node(fw: str) -> FrameworkAdapter:
    return FrameworkAdapter(
        name=fw,
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="websocket_expected",
        topology_assumption="frontend_may_need_api_proxy",
        common_failure_patterns=("proxy_target_unreachable", "localhost_api_misuse"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST", "NEXT_PUBLIC_*", "VITE_*"),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("package.json",),
    )


_ADAPTERS: dict[str, FrameworkAdapter] = {
    "vite": FrameworkAdapter(
        name="vite",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="websocket_expected",
        topology_assumption="frontend_may_need_api_proxy",
        common_failure_patterns=("proxy_target_unreachable", "localhost_api_misuse"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST", "VITE_*"),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("package.json", "vite.config.ts", "vite.config.js", "vite.config.mjs"),
    ),
    "cra": FrameworkAdapter(
        name="cra",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="websocket_expected",
        topology_assumption="frontend_may_need_api_proxy",
        common_failure_patterns=("missing_env", "engine_mismatch", "eslint_plugin_block"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST", "DISABLE_ESLINT_PLUGIN", "WDS_SOCKET_PORT"),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("package.json",),
    ),
    "nextjs": FrameworkAdapter(
        name="nextjs",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="websocket_expected",
        topology_assumption="frontend_with_api_routes_or_external_api",
        common_failure_patterns=("engine_mismatch", "env_missing"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST", "NEXT_PUBLIC_*"),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("package.json", "next.config.js", "next.config.mjs", "next.config.ts"),
    ),
    "remix": _node("remix"),
    "nuxt": _node("nuxt"),
    "sveltekit": _node("sveltekit"),
    "astro": _node("astro"),
    "express": FrameworkAdapter(
        name="express",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="GET_ok",
        hmr_expectation="optional",
        topology_assumption="backend_or_bff",
        common_failure_patterns=("missing_env", "port_conflict"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT",),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("package.json",),
    ),
    "node-server": FrameworkAdapter(
        name="node-server",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="backend_or_bff",
        common_failure_patterns=("missing_env", "port_conflict"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT",),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("package.json",),
    ),
    "fastapi": FrameworkAdapter(
        name="fastapi",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="backend_api",
        common_failure_patterns=("missing_env", "import_error"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST"),
        healthcheck_path="/docs",
        expected_internal_listen_port=3000,
        package_root_markers=(
            "pyproject.toml",
            "requirements.txt",
            "main.py",
            "app/main.py",
        ),
        studio_docker_primary_toolchain="python",
    ),
    "flask": FrameworkAdapter(
        name="flask",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="backend_api",
        common_failure_patterns=("missing_env", "flask_app_resolution"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST", "FLASK_APP"),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=(
            "pyproject.toml",
            "requirements.txt",
            "app.py",
            "wsgi.py",
        ),
        studio_docker_primary_toolchain="python",
    ),
    "django": FrameworkAdapter(
        name="django",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="backend_app",
        common_failure_patterns=("migrations_missing", "settings_env_missing"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT",),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("manage.py",),
        studio_docker_primary_toolchain="python",
    ),
    "go": FrameworkAdapter(
        name="go",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="backend_api",
        common_failure_patterns=("module_not_found", "port_conflict"),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT",),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("go.mod",),
        studio_docker_primary_toolchain="go",
    ),
    "static": FrameworkAdapter(
        name="static",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="static_assets",
        common_failure_patterns=(),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT",),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        package_root_markers=("index.html",),
    ),
    "unknown": FrameworkAdapter(
        name="unknown",
        launch_strategy="live_preview",
        readiness_strategy="http_any_response",
        probe_behavior="HEAD_then_GET",
        hmr_expectation="optional",
        topology_assumption="unknown",
        common_failure_patterns=(),
        port_binding_behavior="bind_0.0.0.0",
        env_expectations=("PORT", "HOST"),
        healthcheck_path="/",
        expected_internal_listen_port=3000,
        # Lenient marker set — launcher still rejects empty dev_cmd.
        package_root_markers=(
            "package.json",
            "pyproject.toml",
            "requirements.txt",
            "go.mod",
            "manage.py",
            "index.html",
        ),
    ),
}


def get_framework_adapter(framework: str) -> FrameworkAdapter:
    key = str(framework or "").lower().strip()
    return _ADAPTERS.get(key, _DEFAULT)


def summarize_startup_failure(
    *,
    adapter: FrameworkAdapter,
    diagnostics: Dict[str, Any],
    classification: Optional[Dict[str, Any]],
) -> str:
    logs = str((diagnostics or {}).get("recent_logs") or "").lower()
    exit_code = (
        (diagnostics or {}).get("container_state", {}) or {}
    ).get("exit_code", (diagnostics or {}).get("last_exit_code"))
    code = str((classification or {}).get("code") or "").strip()
    if code.startswith("LAUNCH_PLAN_"):
        hint = str((classification or {}).get("hint") or diagnostics.get("hint") or "").strip()
        if hint:
            return f"Launch plan rejected: {code}. {hint}"
        return f"Launch plan rejected: {code}. See diagnostics."
    if code == "UNSUPPORTED_NODE_ENGINE":
        return "Startup failed: unsupported Node engine for this repository/runtime image."
    if code == "MISSING_ENV_VARS":
        return "Startup failed: required environment variables appear missing."
    if code == "MONOREPO_DETECTION_FAILURE":
        return "Startup failed: likely monorepo app-root mismatch (try apps/web or frontend package root)."
    if "esm" in logs and ("commonjs" in logs or "require() of es module" in logs):
        return "Startup failed: ESM/CommonJS module resolution mismatch."
    if "tsx" in logs and ("cannot find module" in logs or "unknown file extension" in logs):
        return "Startup failed: tsx runtime/module-resolution mismatch."
    if adapter.name == "vite" and "optimiz" in logs:
        return "Vite startup failed before HTTP-ready; dependency optimization likely interrupted startup."
    if adapter.name == "nextjs" and ("compil" in logs or "wait - compiling" in logs):
        return "Next.js startup exited during compilation/bootstrap phase."
    if adapter.name == "express":
        return "Express process exited during startup before serving HTTP responses."
    if isinstance(exit_code, int):
        return f"Process exited during startup with exit code {exit_code}."
    return "Application process exited during startup before becoming HTTP-ready."
