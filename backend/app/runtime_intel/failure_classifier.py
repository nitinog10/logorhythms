from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional


def classify_runtime_failure(
    *, phase: str, error_code: str, diagnostics: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    d = diagnostics or {}
    logs = str(d.get("recent_logs") or "").lower()
    runtime_cmd = str(d.get("detected_runtime_command") or "").lower()
    install_cmd = str(d.get("detected_install_command") or "").lower()
    pm = str(d.get("detected_package_manager") or "").lower()
    package_root = str(d.get("package_root") or "")
    package_root_exists = bool(d.get("package_root_exists"))
    package_json_exists = bool(d.get("package_json_exists"))
    node_hint_exists = bool(d.get("node_version_file_exists"))
    inspect = d.get("container_state") or {}
    exit_code = inspect.get("exit_code", d.get("last_exit_code"))
    probe = d.get("http_probe") or {}
    topology = d.get("topology_analysis") or {}

    def _lifecycle_default() -> str:
        if error_code.startswith("LAUNCH_PLAN_"):
            return "launch_plan_rejected"
        if error_code in {"MISSING_REQUIRED_TOOLCHAIN", "INVALID_RUNTIME_IMAGE_SELECTION"}:
            return "launch_plan_rejected"
        if error_code == "DOCKER_CONTAINER_REMOVED_BEFORE_DIAGNOSTICS":
            return "container_removed_before_diagnostics"
        if error_code == "DOCKER_RUNTIME_TRACKING_FAILURE":
            return "runtime_tracking_failure"

        if error_code in {"DOCKER_RUNTIME_EXITED", "DOCKER_RUN_FAILED", "DOCKERFILE_BUILD_FAILED"}:
            return "process_startup_failure"
        if error_code in {"DOCKER_START_TIMEOUT", "DOCKER_PORT_MAPPING_UNAVAILABLE", "DOCKER_PORT_PARSE_FAILED"}:
            return "http_readiness_failure"
        if str(topology.get("lifecycle_category_hint") or "").strip():
            return str(topology.get("lifecycle_category_hint"))
        return "runtime_failure"

    def _mk(code: str, reason: str, hint: str, confidence: str = "medium", lifecycle_category: Optional[str] = None) -> Dict[str, Any]:
        return {
            "code": code,
            "lifecycle_category": lifecycle_category or _lifecycle_default(),
            "reason": reason,
            "hint": hint,
            "confidence": confidence,
        }

    if error_code == "DOCKER_CONTAINER_REMOVED_BEFORE_DIAGNOSTICS":
        return _mk(
            error_code,
            "The preview container disappeared from Docker before diagnostics were fully captured.",
            "Studio keeps containers after exit for a short retention window; ensure studio_runtime_docker_autoremove is false. Check whether another process pruned the container.",
            "high",
            lifecycle_category="container_removed_before_diagnostics",
        )

    if error_code == "DOCKER_RUNTIME_TRACKING_FAILURE":
        return _mk(
            error_code,
            "Docker did not return usable container metadata (inspect/logs) for this preview.",
            "Verify Docker daemon health and permissions; see diagnostics.container_post_mortem_snapshot for captured fields.",
            "high",
            lifecycle_category="runtime_tracking_failure",
        )

    if error_code.startswith("LAUNCH_PLAN_"):
        hint_lp = str(d.get("hint") or "").strip()
        if not hint_lp:
            hint_lp = (
                "Inspect diagnostics for app root, scripts, manifests, framework adapter, "
                "and env_keys_required."
            )
        return _mk(
            error_code,
            "Studio launch planner rejected this configuration before Docker start.",
            hint_lp,
            "high",
            lifecycle_category="launch_plan_rejected",
        )

    if error_code == "MISSING_REQUIRED_TOOLCHAIN":
        return _mk(
            error_code,
            "Studio requires a hybrid Docker image for this split preview (Node frontend + Python/Go backend).",
            str(d.get("recovery") or "").strip()
            or (
                "Configure STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE, "
                "STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE, etc., or set "
                "STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK=true for dev-only fallback."
            ),
            "high",
            lifecycle_category="launch_plan_rejected",
        )

    if error_code == "INVALID_RUNTIME_IMAGE_SELECTION":
        return _mk(
            error_code,
            "Docker image selection contradicted the predetermined split hybrid runtime plan.",
            "This is an internal invariant failure; report diagnostics.picked_registry_image vs expected_studio_split_toolchain_image.",
            "high",
            lifecycle_category="launch_plan_rejected",
        )

    if not package_root_exists:
        return _mk("WRONG_PACKAGE_ROOT", "Detected app/package root does not exist on disk.", f"Verify bootstrap app root detection. Current package_root={package_root!r}.", "high")
    if (not package_json_exists and ("npm " in runtime_cmd or "pnpm " in runtime_cmd or "yarn " in runtime_cmd or "bun " in runtime_cmd)):
        return _mk("MISSING_PACKAGE_JSON", "Node runtime command selected but package.json is missing in detected root.", "Fix app_root_rel/monorepo package-root detection or select the correct workspace.", "high")
    if pm == "npm" and "pnpm-lock.yaml" in logs:
        return _mk("INCORRECT_PACKAGE_MANAGER_SELECTION", "npm selected while logs indicate pnpm lock/workspace.", "Use pnpm for this repo or align lockfile/packageManager field with launch command.", "high")
    if pm == "npm" and "yarn.lock" in logs:
        return _mk("INCORRECT_PACKAGE_MANAGER_SELECTION", "npm selected while logs indicate yarn usage.", "Use yarn for this repo or remove stale lockfile mismatch.", "high")
    if any(tok in logs for tok in ("unsupported engine", "not compatible with your version of node", "requires node", "ebadengine")):
        node_hint = " Node version file exists in repo." if node_hint_exists else ""
        return _mk("UNSUPPORTED_NODE_ENGINE", "Node engine requirement mismatch detected in logs.", "Pin runtime image/node version to the repo engine requirement." + node_hint, "high")
    if any(tok in logs for tok in ("missing env", "environment variable", "is not defined", "must be set", "process.env")):
        return _mk("MISSING_ENV_VARS", "Application reported missing required environment variables.", "Provide required env vars from repository docs/.env.example into session env_config.")
    if phase in {"install", "build", "start"} and any(tok in logs for tok in ("npm err!", "pnpm err", "yarn error", "command failed", "module not found", "cannot find module")):
        return _mk("DEPENDENCY_INSTALL_OR_BUILD_FAILURE", "Dependency install/build/start command failed according to container logs.", "Inspect recent logs and rerun detected install/build command in detected package root.")
    if isinstance(exit_code, int) and exit_code == 137:
        return _mk("PROCESS_KILLED_OOM_OR_SIGKILL", "Runtime process exited with code 137.", "Increase runtime memory or reduce startup memory footprint.")
    if error_code == "DOCKER_START_TIMEOUT" and not probe.get("success"):
        if bool(d.get("build_is_production_style")) and str(d.get("preview_strategy") or "").lower() in {"deployment_build", "build", "production"}:
            return _mk("PREVIEW_STRATEGY_MISMATCH", "Production build workflow blocked Studio preview readiness.", "Use live-preview strategy (dev server) for interactive sessions; reserve build pipelines for deployment workflows.", "high", lifecycle_category="http_readiness_failure")
        return _mk("HTTP_PROBE_FAILED", "Port opened but HTTP probe never succeeded before timeout.", "App likely binds early then crashes/blocks request handling; check startup logs and framework compile errors.", lifecycle_category="http_readiness_failure")
    if error_code == "DOCKER_RUNTIME_EXITED":
        try:
            root_path = Path(package_root)
            if not (root_path / "package.json").exists():
                nested = list(root_path.glob("*/package.json"))
                if nested:
                    return _mk("MONOREPO_DETECTION_FAILURE", "Detected root lacks package.json but nested package roots exist.", "Select the correct workspace package root (e.g. apps/web, frontend, packages/*).", lifecycle_category="process_startup_failure")
        except Exception:
            pass
        if "workspace" in install_cmd and pm in {"npm", "unknown"}:
            return _mk("WORKSPACE_LOCKFILE_MISMATCH", "Workspace-style repo detected with ambiguous package manager/command selection.", "Align package manager with lockfile and workspace config; ensure install/start run from correct package root.", lifecycle_category="process_startup_failure")
    return None

