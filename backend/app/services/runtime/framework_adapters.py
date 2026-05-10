from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FrameworkAdapter:
    name: str
    launch_strategy: str
    readiness_strategy: str
    probe_behavior: str
    hmr_expectation: str
    topology_assumption: str
    common_failure_patterns: tuple[str, ...]
    port_binding_behavior: str
    env_expectations: tuple[str, ...]


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
    ),
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
        env_expectations=("PORT", "HOST"),
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
    ),
}


def get_framework_adapter(framework: str) -> FrameworkAdapter:
    return _ADAPTERS.get(str(framework or "").lower(), _DEFAULT)

