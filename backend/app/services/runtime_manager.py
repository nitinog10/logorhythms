"""
Studio Runtime Manager abstraction.

Runtime adapters:
- HostRuntimeManager: existing preview_runner subprocess model (stable fallback).
- DockerRuntimeManager: single-machine container lifecycle (Phase 1).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import socket
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Protocol, Sequence

from app.config import get_settings
from app.monorepo_paths import default_workspace_dir
from app import preview_gateway
from app.runtime_intel.readiness_engine import http_probe as readiness_http_probe
from app.runtime_intel.failure_classifier import classify_runtime_failure
from app.runtime_intel.repo_analyzer import analyze_repo_topology
from app.runtime_intel.framework_adapters import (
    get_framework_adapter,
    summarize_startup_failure,
)
from app.runtime_intel.studio_launch_plan import (
    STUDIO_SPLIT_BACKEND_INTERNAL_PORT,
    build_phase_commands_from_plan,
    compose_shell_launch_chain,
    derive_studio_docker_exit_hint,
    format_container_exit_failure_message,
    prepare_studio_docker_launch,
)
from app.runtime_intel.service_role_inference import rank_preview_bindings_with_diagnostics
from app.services.preview_runner import (
    nextjs_file_watch_env_for_studio,
    preview_loopback_base,
)

logger = logging.getLogger(__name__)

_INTERNAL_PORT = 3000
_RUNTIME_STATE_LOCK = threading.Lock()
_PHASE_ORDER = ("detect", "install", "build", "start", "ready", "error", "stopped")
_STARTUP_PHASES = {"detect", "install", "build", "start"}
_METRICS_LOCK = threading.Lock()
_RUNTIME_EVENT_LIMIT = 80
_RUNTIME_METRICS: Dict[str, Any] = {
    "launch_attempts": 0,
    "launch_success": 0,
    "launch_failures": 0,
    "stop_calls": 0,
    "status_calls": 0,
    "cleanup_runs": 0,
    "cleanup_removed": 0,
    "route_prune_runs": 0,
    "route_prune_removed": 0,
    "cleanup_duration_ms_last": 0,
    "events": [],
}


@dataclass
class RuntimeLaunchInput:
    runtime_key: str
    session_id: str
    session_kind: str
    source_id: str
    project_dir: Path
    env_config: Optional[Dict[str, str]]
    plan: Optional[Dict[str, Any]]
    proxy_public_base: Optional[str]
    studio_proxy_enabled: bool
    docker_install: bool
    trusted_runtime: bool = False


class RuntimeManager(Protocol):
    async def launch(self, payload: RuntimeLaunchInput) -> Dict[str, Any]:
        ...

    async def stop(self, runtime_key: str) -> bool:
        ...

    async def status(
        self, runtime_key: str, session_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        ...

    async def logs(self, runtime_key: str, tail: int = 200) -> str:
        ...

    async def cleanup(self) -> Dict[str, Any]:
        ...


def _runtime_state_path() -> Path:
    root = Path(default_workspace_dir()).resolve()
    path = root / "_studio_runtime_state" / "runtimes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("{}", encoding="utf-8")
    return path


def _read_state() -> Dict[str, Any]:
    p = _runtime_state_path()
    with _RUNTIME_STATE_LOCK:
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}


def _write_state(data: Dict[str, Any]) -> None:
    p = _runtime_state_path()
    with _RUNTIME_STATE_LOCK:
        tmp = p.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        tmp.replace(p)


def _state_get(runtime_key: str) -> Optional[Dict[str, Any]]:
    return _read_state().get(runtime_key)


def _state_put(runtime_key: str, value: Dict[str, Any]) -> None:
    d = _read_state()
    d[runtime_key] = value
    _write_state(d)


def _state_del(runtime_key: str) -> None:
    d = _read_state()
    if runtime_key in d:
        d.pop(runtime_key, None)
        _write_state(d)


def _update_phase(runtime_key: str, phase: str, **extra: Any) -> None:
    st = _state_get(runtime_key) or {}
    st["phase"] = phase if phase in _PHASE_ORDER else phase
    st["phase_ts"] = time.time()
    if extra:
        st.update(extra)
    _state_put(runtime_key, st)


def _metric_inc(key: str, amount: int = 1) -> None:
    with _METRICS_LOCK:
        _RUNTIME_METRICS[key] = int(_RUNTIME_METRICS.get(key, 0) or 0) + int(amount)


def _metric_set(key: str, value: Any) -> None:
    with _METRICS_LOCK:
        _RUNTIME_METRICS[key] = value


def _runtime_event(
    event: str,
    *,
    runtime_key: Optional[str] = None,
    session_id: Optional[str] = None,
    phase: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    row: Dict[str, Any] = {
        "ts": time.time(),
        "event": str(event),
    }
    if runtime_key:
        row["runtime_key"] = str(runtime_key)
    if session_id:
        row["session_id"] = str(session_id)
    if phase:
        row["phase"] = str(phase)
    if metadata:
        # Keep payload bounded and lightweight for operational debugging only.
        row["metadata"] = {str(k): v for k, v in metadata.items()}
    with _METRICS_LOCK:
        ev = list(_RUNTIME_METRICS.get("events") or [])
        ev.append(row)
        if len(ev) > _RUNTIME_EVENT_LIMIT:
            ev = ev[-_RUNTIME_EVENT_LIMIT:]
        _RUNTIME_METRICS["events"] = ev


def runtime_metrics_snapshot() -> Dict[str, Any]:
    state = _read_state()
    with _METRICS_LOCK:
        out = dict(_RUNTIME_METRICS)
    out["active_runtime_rows"] = len(state)
    out["active_container_rows"] = sum(
        1 for _, row in state.items() if str((row or {}).get("container_id") or "").strip()
    )
    return out


def reset_runtime_metrics_for_tests() -> None:
    with _METRICS_LOCK:
        for k in list(_RUNTIME_METRICS.keys()):
            _RUNTIME_METRICS[k] = [] if k == "events" else 0


def _apply_preview_surface(url: Optional[str], session_id: str) -> Optional[str]:
    if not url:
        return url
    cfg = get_settings()
    if cfg.studio_preview_gateway_mode != "preview_domain":
        return url
    if preview_gateway.gateway_enabled():
        return preview_gateway.public_url_for_session(session_id)
    host = (cfg.studio_preview_domain or "").strip().strip("/")
    return f"https://{host}/{session_id}/" if host else url


def _is_port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", int(port)), timeout=0.5):
            return True
    except OSError:
        return False


def _http_probe(url: str, timeout_s: float = 2.0, method: str = "HEAD") -> Dict[str, Any]:
    return readiness_http_probe(url=url, timeout_s=timeout_s, method=method)


def _probe_runtime_ready(
    base_url: str,
    health_path: Optional[str] = None,
    *,
    probe_timeout_s: float = 25.0,
) -> Dict[str, Any]:
    hp = str(health_path or "").strip()
    if hp and not hp.startswith("/"):
        hp = f"/{hp}"
    candidates: list[str] = []
    if hp:
        candidates.append(hp)
    candidates.extend(["/favicon.ico", "/"])
    seen: set[str] = set()
    attempts: list[Dict[str, Any]] = []
    for p in candidates:
        if p in seen:
            continue
        seen.add(p)
        probe_url = f"{base_url.rstrip('/')}{p}"
        for method in ("GET", "HEAD"):
            out = _http_probe(probe_url, probe_timeout_s, method=method)
            attempts.append(out)
            if out.get("success"):
                return {
                    "success": True,
                    "probe_url": out.get("probe_url"),
                    "probe_method": out.get("probe_method"),
                    "status_code": out.get("status_code"),
                    "reason": out.get("reason"),
                    "elapsed_ms": out.get("elapsed_ms"),
                    "attempts": attempts[-6:],
                }
    return {"success": False, "attempts": attempts[-8:], "error": "no_http_response"}


def _docker_cli_exists() -> bool:
    return shutil.which("docker") is not None


def _run_docker(args: list[str], timeout: int = 30) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            timeout=timeout,
            check=False,
            text=True,
        )
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except Exception as e:
        return -1, "", f"{type(e).__name__}: {e}"


def _docker_inspect_state(container_id: str) -> Dict[str, Any]:
    rc, out, err = _run_docker(["docker", "inspect", container_id], 20)
    if rc != 0 or not out:
        return {
            "inspect_ok": False,
            "running": False,
            "status": "missing",
            "exit_code": None,
            "error": (err or out or "")[:600],
        }
    try:
        rows = json.loads(out)
        row = rows[0] if isinstance(rows, list) and rows else {}
        st = row.get("State") or {}
        return {
            "inspect_ok": True,
            "running": bool(st.get("Running")),
            "status": str(st.get("Status") or ""),
            "exit_code": st.get("ExitCode"),
            "error": str(st.get("Error") or ""),
            "oom_killed": bool(st.get("OOMKilled")),
            "dead": bool(st.get("Dead")),
            "started_at": st.get("StartedAt"),
            "finished_at": st.get("FinishedAt"),
        }
    except Exception as e:
        return {
            "inspect_ok": False,
            "running": False,
            "status": "unknown",
            "exit_code": None,
            "error": f"inspect_parse_failed: {type(e).__name__}: {e}",
        }


def _docker_logs_tail(container_id: str, tail: int = 120) -> str:
    rc, out, err = _run_docker(
        ["docker", "logs", "--tail", str(max(10, int(tail))), container_id], 20
    )
    txt = out if rc == 0 else (err or out)
    merged = (txt or "").strip()
    if merged:
        return merged
    time.sleep(0.4)
    rc2, out2, err2 = _run_docker(
        ["docker", "logs", "--tail", str(max(10, int(tail))), container_id], 35
    )
    txt2 = out2 if rc2 == 0 else (err2 or out2)
    return ((txt2 or "") if (txt2 or "").strip() else merged).strip()


# Sentinel exit codes when Docker state is missing or unparsable.
_EXIT_CODE_UNAVAILABLE_REMOVED = -32767
_EXIT_CODE_UNAVAILABLE_INSPECT = -32766
_EXIT_CODE_UNKNOWN_EXITED = -32765


def _capture_docker_post_mortem_snapshot(
    container_id: str,
    *,
    host_port: Optional[int],
    publish_order: Sequence[int],
    command_metadata: Mapping[str, Any],
    log_tail_lines: int = 220,
) -> Dict[str, Any]:
    """
    Synchronous post-mortem: inspect, logs, port mappings, adapter metadata.
    Handles missing containers and inspect failures without raising.
    """
    ts = time.time()
    inspect = _docker_inspect_state(container_id)
    logs = _docker_logs_tail(container_id, log_tail_lines)
    err_low = str(inspect.get("error") or "").lower()
    port_sample: Dict[str, Any] = {}
    for p in publish_order:
        rc, out, err = _run_docker(
            ["docker", "port", container_id, f"{int(p)}/tcp"], 12
        )
        port_sample[str(p)] = {
            "rc": rc,
            "stdout": (out or "")[:500],
            "stderr": (err or "")[:500],
        }

    raw_exit = inspect.get("exit_code")
    classification = "container_exited"
    exit_norm: int

    if not inspect.get("inspect_ok"):
        if "no such container" in err_low:
            classification = "container_removed_before_diagnostics"
            exit_norm = _EXIT_CODE_UNAVAILABLE_REMOVED
        else:
            classification = "runtime_tracking_failure"
            exit_norm = _EXIT_CODE_UNAVAILABLE_INSPECT
    elif inspect.get("running"):
        classification = "container_running"
        exit_norm = int(raw_exit) if isinstance(raw_exit, int) else 0
    else:
        classification = "container_exited"
        if isinstance(raw_exit, int):
            exit_norm = int(raw_exit)
        else:
            exit_norm = _EXIT_CODE_UNKNOWN_EXITED

    meta_keys = (
        "detected_framework",
        "selected_framework_adapter",
        "app_root_rel",
        "package_root",
        "detected_runtime_command",
        "docker_publish_preview_ports",
        "expected_internal_port",
        "mapped_host_port",
        "preview_strategy",
    )
    adapter_meta = {k: command_metadata.get(k) for k in meta_keys}

    return {
        "captured_at_unix": ts,
        "container_id": container_id,
        "lifecycle_classification": classification,
        "inspect": inspect,
        "exit_code_normalized": exit_norm,
        "docker_raw_exit_code": raw_exit,
        "logs_tail": logs[-6000:],
        "port_mappings_sample": port_sample,
        "host_port_last_known": host_port,
        "adapter_runtime_metadata": adapter_meta,
    }


def _docker_error_code_from_snapshot(
    snapshot: Mapping[str, Any], default_code: str
) -> str:
    lc = str(snapshot.get("lifecycle_classification") or "")
    if lc == "container_removed_before_diagnostics":
        return "DOCKER_CONTAINER_REMOVED_BEFORE_DIAGNOSTICS"
    if lc == "runtime_tracking_failure":
        return "DOCKER_RUNTIME_TRACKING_FAILURE"
    return default_code


def _detect_package_manager(phase_cmds: Dict[str, str], package_root: Path) -> str:
    start = str(phase_cmds.get("start") or "").lower()
    install = str(phase_cmds.get("install") or "").lower()
    combined = f"{install} {start}"
    if "pnpm" in combined:
        return "pnpm"
    if "yarn" in combined:
        return "yarn"
    if "bun" in combined:
        return "bun"
    if "npm" in combined:
        return "npm"
    if (package_root / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (package_root / "yarn.lock").exists():
        return "yarn"
    if (package_root / "bun.lockb").exists() or (package_root / "bun.lock").exists():
        return "bun"
    if (package_root / "package-lock.json").exists():
        return "npm"
    return "unknown"


def _scan_text_files_for_patterns(
    root: Path, patterns: list[re.Pattern[str]], max_files: int = 120
) -> Dict[str, Any]:
    hits: dict[str, int] = {p.pattern: 0 for p in patterns}
    scanned = 0
    for p in root.rglob("*"):
        if scanned >= max_files:
            break
        if not p.is_file():
            continue
        parts = set(p.parts)
        if parts & {"node_modules", ".git", "dist", "build", ".next", ".turbo", ".cache"}:
            continue
        if p.suffix.lower() not in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".env"}:
            continue
        scanned += 1
        try:
            txt = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for pat in patterns:
            if pat.search(txt):
                hits[pat.pattern] = int(hits.get(pat.pattern, 0)) + 1
    return {"scanned_files": scanned, "hits": hits}


def _analyze_repo_topology(
    package_root: Path, plan: Optional[Dict[str, Any]], phase_cmds: Dict[str, Any]
) -> Dict[str, Any]:
    return analyze_repo_topology(package_root=package_root, plan=plan, phase_cmds=phase_cmds)


def _pick_image(plan: Dict[str, Any], phase_cmds: Optional[Dict[str, Any]] = None) -> str:
    cfg = get_settings()
    pcm = phase_cmds or {}
    split_img = str(pcm.get("studio_split_toolchain_image") or "").strip()
    if split_img:
        return split_img

    fw = str((plan or {}).get("framework") or "").lower()
    go_cmd_markers = ("go run", "go build", "./cmd/", "/cmd/", " air")
    py_cmd_markers = (
        "uvicorn",
        "gunicorn",
        "flask",
        "django",
        "manage.py",
        "python ",
        "python3 ",
        "poetry ",
        "pipenv ",
        "pdm ",
        "hypercorn",
        "daphne",
    )

    if pcm.get("studio_split_preview_mode"):
        bc = str(pcm.get("backend_dev_command_wired") or "").lower()
        shr_py = bool(pcm.get("studio_split_backend_has_python"))
        shr_go = bool(pcm.get("studio_split_backend_has_go"))

        if shr_go and shr_py:
            if any(tok in bc for tok in go_cmd_markers):
                return cfg.studio_runtime_docker_go_image
            if any(tok in bc for tok in py_cmd_markers):
                return cfg.studio_runtime_docker_python_image
            return cfg.studio_runtime_docker_python_image
        if shr_go:
            return cfg.studio_runtime_docker_go_image
        if shr_py:
            return cfg.studio_runtime_docker_python_image

        if any(tok in bc for tok in go_cmd_markers):
            return cfg.studio_runtime_docker_go_image
        if any(tok in bc for tok in py_cmd_markers):
            return cfg.studio_runtime_docker_python_image

    toolchain = str(get_framework_adapter(fw).studio_docker_primary_toolchain or "node")
    if toolchain == "python":
        return cfg.studio_runtime_docker_python_image
    if toolchain == "go":
        return cfg.studio_runtime_docker_go_image
    return cfg.studio_runtime_docker_node_image


def _build_runtime_image_resolution_record(
    *,
    plan: Dict[str, Any],
    phase_cmds: Mapping[str, Any],
    adapter: Any,
    cfg: Any,
    picked_registry_image: str,
    final_image: str,
    provenance: str,
    custom_dockerfile_rel: str,
) -> Dict[str, Any]:
    pcm = dict(phase_cmds or {})
    return {
        "final_docker_image": final_image,
        "registry_resolution_image_before_custom_dockerfile": picked_registry_image,
        "docker_image_provenance": provenance,
        "custom_dockerfile_rel": custom_dockerfile_rel or None,
        "framework_from_plan": str((plan or {}).get("framework") or "").strip().lower(),
        "selected_framework_adapter": getattr(adapter, "name", ""),
        "adapter_primary_toolchain": getattr(
            adapter, "studio_docker_primary_toolchain", ""
        ),
        "split_preview_mode": bool(pcm.get("studio_split_preview_mode")),
        "split_toolchain_strategy": pcm.get("studio_split_toolchain_strategy"),
        "split_toolchain_image": pcm.get("studio_split_toolchain_image"),
        "split_toolchain_image_source": pcm.get("studio_split_toolchain_image_source"),
        "split_backend_has_python_disk": pcm.get("studio_split_backend_has_python"),
        "split_backend_has_go_disk": pcm.get("studio_split_backend_has_go"),
        "split_needs_embedded_node": pcm.get("studio_split_needs_embedded_node"),
        "env_studio_runtime_allow_split_embed_node_fallback": getattr(
            cfg, "studio_runtime_allow_split_embed_node_fallback", False
        ),
        "env_hybrid_images_configured": {
            "split_node_python_image": bool(
                str(getattr(cfg, "studio_runtime_docker_split_node_python_image", "") or "").strip()
            ),
            "split_node_go_image": bool(
                str(getattr(cfg, "studio_runtime_docker_split_node_go_image", "") or "").strip()
            ),
            "split_stack_image": bool(
                str(getattr(cfg, "studio_runtime_docker_split_stack_image", "") or "").strip()
            ),
        },
        "base_registry_fallback_images": {
            "node": getattr(cfg, "studio_runtime_docker_node_image", ""),
            "python": getattr(cfg, "studio_runtime_docker_python_image", ""),
            "go": getattr(cfg, "studio_runtime_docker_go_image", ""),
        },
    }


def _derive_phase_commands(
    payload: RuntimeLaunchInput, internal_port: int
) -> Dict[str, Any]:
    return build_phase_commands_from_plan(payload.plan or {}, internal_port)


def _compose_launch_command(phase_cmds: Dict[str, Any]) -> str:
    return compose_shell_launch_chain(phase_cmds)


def _parse_host_port(port_output: str) -> Optional[int]:
    raw = (port_output or "").strip()
    # expected: "127.0.0.1:49153" or "::1:49153"
    if not raw:
        return None
    tail = raw.split(":")[-1].strip()
    try:
        return int(tail)
    except (TypeError, ValueError):
        return None


def _parse_host_port_from_mappings(
    port_output: str, preferred_internal_port: Optional[int] = None
) -> Optional[int]:
    raw = (port_output or "").strip()
    if not raw:
        return None
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return None

    preferred = (
        f"{int(preferred_internal_port)}/tcp"
        if preferred_internal_port is not None
        else ""
    )
    preferred_lines: list[str] = []
    fallback_lines: list[str] = []
    for ln in lines:
        if "->" in ln:
            left, right = ln.split("->", 1)
            candidate = left.strip()
            if preferred and right.strip().startswith(preferred):
                preferred_lines.append(candidate)
            else:
                fallback_lines.append(candidate)
        else:
            fallback_lines.append(ln)

    for ln in preferred_lines + fallback_lines:
        port = _parse_host_port(ln)
        if port is not None:
            return port
    return None


def _resolve_mapped_host_port(
    container_id: str, internal_port: int
) -> tuple[Optional[int], str, str]:
    rc, out, err = _run_docker(
        ["docker", "port", container_id, f"{int(internal_port)}/tcp"], 20
    )
    host_port = _parse_host_port(out) if rc == 0 else None
    if host_port is not None:
        return host_port, out, err

    rc_all, out_all, err_all = _run_docker(["docker", "port", container_id], 20)
    host_port_all = _parse_host_port_from_mappings(
        out_all, preferred_internal_port=internal_port
    ) if rc_all == 0 else None
    if host_port_all is not None:
        return host_port_all, out_all, err_all

    merged_err = (err or "") if (err or "").strip() else (err_all or "")
    merged_out = (out or "") if (out or "").strip() else (out_all or "")
    return None, merged_out, merged_err


def _gather_host_bindings_for_ports(
    container_id: str, internal_ports: Sequence[int]
) -> list[tuple[int, int]]:
    rows: list[tuple[int, int]] = []
    for ip in internal_ports:
        hp, *_ = _resolve_mapped_host_port(container_id, ip)
        if hp is not None:
            rows.append((int(ip), int(hp)))
    return rows


def _sort_publish_bindings(
    bindings: Sequence[tuple[int, int]],
    primary_listen: int,
    publish_order: Sequence[int],
) -> list[tuple[int, int]]:
    order = {int(p): i for i, p in enumerate(publish_order)}
    uniq: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for t in bindings:
        cinp = int(t[0])
        hhp = int(t[1])
        pair = (cinp, hhp)
        if pair in seen:
            continue
        seen.add(pair)
        uniq.append(pair)

    def key(p: tuple[int, int]) -> tuple[int, int]:
        cinp, _ = p
        return (0 if cinp == int(primary_listen) else 1, int(order.get(cinp, 999)))

    return sorted(uniq, key=key)


async def _probe_publish_bindings_sorted(
    sorted_bindings: Sequence[tuple[int, int]],
    health_path: str,
    *,
    probe_timeout_s: float,
) -> tuple[Optional[int], Optional[int], Dict[str, Any]]:
    last_probe: Dict[str, Any] = {
        "success": False,
        "error": "no_bindings_ready",
    }
    for cinp, hhp in sorted_bindings:
        if hhp <= 0:
            continue
        if not _is_port_open(hhp):
            continue
        direct = preview_loopback_base(int(hhp))
        probe = await asyncio.to_thread(
            partial(
                _probe_runtime_ready,
                direct,
                health_path,
                probe_timeout_s=probe_timeout_s,
            ),
        )
        last_probe = probe
        if probe.get("success"):
            return int(hhp), int(cinp), probe
    return None, None, last_probe


def _reserve_localhost_ports(count: int) -> list[int]:
    """Bind ephemeral localhost ports suitable for deterministic docker -p publishes."""
    if count <= 0:
        return []
    socks: list[socket.socket] = []
    try:
        ports: list[int] = []
        for _ in range(int(count)):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(("127.0.0.1", 0))
            socks.append(s)
            ports.append(int(s.getsockname()[1]))
        return ports
    finally:
        for sock in socks:
            try:
                sock.close()
            except Exception:
                pass


def _discover_container_listeners(container_id: str) -> list[Dict[str, Any]]:
    probes = [
        ["docker", "exec", container_id, "sh", "-lc", "ss -ltnH || true"],
        ["docker", "exec", container_id, "sh", "-lc", "netstat -ltn || true"],
    ]
    combined = ""
    for cmd in probes:
        rc, out, err = _run_docker(cmd, 10)
        txt = (out or err or "").strip()
        if rc == 0 and txt:
            combined += "\n" + txt
    listeners: list[Dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for line in combined.splitlines():
        ln = line.strip()
        if not ln:
            continue
        m = re.search(r"((?:\d{1,3}\.){3}\d{1,3}|::|::1|\*):(\d{2,5})\b", ln)
        if not m:
            continue
        host = m.group(1)
        try:
            port = int(m.group(2))
        except (TypeError, ValueError):
            continue
        key = (host, port)
        if key in seen:
            continue
        seen.add(key)
        listeners.append({"host": host, "port": port})
    return listeners


def _is_loopback_bind(host: str) -> bool:
    h = str(host or "").strip().lower()
    return h in {"127.0.0.1", "::1", "localhost"}


def _choose_runtime_port(
    listeners: list[Dict[str, Any]], expected_port: int
) -> tuple[Optional[int], Optional[str], bool]:
    """
    Returns: (port, host, expected_port_seen_on_loopback_only)
    """
    if not listeners:
        return None, None, False
    expected = [x for x in listeners if int(x.get("port") or 0) == int(expected_port)]
    if expected:
        non_loop = next((x for x in expected if not _is_loopback_bind(str(x.get("host") or ""))), None)
        if non_loop:
            return int(non_loop["port"]), str(non_loop["host"]), False
        # expected port exists but only on loopback inside container -> not reachable via docker publish
        only_loop = next((x for x in expected if _is_loopback_bind(str(x.get("host") or ""))), None)
        if only_loop:
            return int(only_loop["port"]), str(only_loop["host"]), True
    candidate = next(
        (
            x
            for x in listeners
            if int(x.get("port") or 0) > 0
            and not _is_loopback_bind(str(x.get("host") or ""))
            and int(x.get("port") or 0) not in {22}
        ),
        None,
    )
    if candidate:
        return int(candidate["port"]), str(candidate["host"]), False
    return None, None, False


def _structured_error(
    *,
    phase: str,
    code: str,
    message: str,
    diagnostics: Optional[Dict[str, Any]] = None,
    port: Optional[int] = None,
) -> Dict[str, Any]:
    diags = diagnostics or {}
    classification = _classify_runtime_failure(
        phase=phase,
        error_code=code,
        diagnostics=diags,
    )
    if classification:
        diags = dict(diags)
        diags["failure_classification"] = classification
    fw = str(diags.get("detected_framework") or "").strip().lower()
    adapter = get_framework_adapter(fw)
    summary = summarize_startup_failure(
        adapter=adapter,
        diagnostics=diags,
        classification=classification,
    )
    if summary:
        diags = dict(diags)
        diags["failure_summary"] = summary
    if isinstance(diags.get("startup_trace"), list):
        tr = list(diags.get("startup_trace") or [])
        tr.append(
            {
                "ts": time.time(),
                "step": "final_classification",
                "value": classification or {"code": "UNCLASSIFIED"},
            }
        )
        tr.append(
            {
                "ts": time.time(),
                "step": "failure_summary",
                "value": summary,
            }
        )
        diags = dict(diags)
        diags["startup_trace"] = tr[-120:]
    out: Dict[str, Any] = {
        "status": "error",
        "phase": phase,
        "error_code": code,
        "error": message,
        "diagnostics": diags,
    }
    if classification:
        out["failure_classification"] = classification
    if summary:
        out["failure_summary"] = summary
    if port is not None:
        out["port"] = port
    return out


def _startup_trace_add(trace: list[Dict[str, Any]], step: str, value: Any) -> None:
    trace.append({"ts": time.time(), "step": str(step), "value": value})


def _classify_runtime_failure(
    *, phase: str, error_code: str, diagnostics: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    return classify_runtime_failure(
        phase=phase, error_code=error_code, diagnostics=diagnostics
    )


def _validate_custom_dockerfile(path: Path, workspace_root: Path) -> tuple[bool, str]:
    try:
        rp = path.resolve()
        wr = workspace_root.resolve()
    except Exception:
        return False, "invalid Dockerfile path"
    if wr not in rp.parents and rp != wr:
        return False, "Dockerfile must be inside workspace root"
    if not rp.is_file():
        return False, "Dockerfile path does not exist"
    try:
        txt = rp.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return False, f"failed to read Dockerfile: {e}"
    # First constrained policy pass: reject obvious privilege/escape-oriented patterns.
    forbidden = (
        r"--privileged",
        r"/var/run/docker\.sock",
        r"--pid=host",
        r"--network=host",
        r"security-opt",
        r"cap-add",
        r"proc/self",
    )
    low = txt.lower()
    for pat in forbidden:
        if re.search(pat, low):
            return False, f"Dockerfile contains forbidden pattern: {pat}"
    return True, ""


def _cleanup_orphan_state_entries() -> None:
    """Drop runtime-state rows for containers that no longer exist."""
    state = _read_state()
    if not state:
        return
    changed = False
    for key, row in list(state.items()):
        cid = str((row or {}).get("container_id") or "").strip()
        if not cid:
            state.pop(key, None)
            changed = True
            continue
        rc, out, _ = _run_docker(
            ["docker", "inspect", "--format", "{{.State.Running}}", cid], 10
        )
        if rc != 0 or (out or "").strip().lower() != "true":
            state.pop(key, None)
            changed = True
    if changed:
        _write_state(state)
        _runtime_event(
            "cleanup",
            phase="stopped",
            metadata={"source": "orphan_state_prune"},
        )


class HostRuntimeManager:
    """Adapter that delegates to existing preview_runner host-process runtime."""

    async def launch(self, payload: RuntimeLaunchInput) -> Dict[str, Any]:
        cfg = get_settings()
        if str(cfg.studio_runtime_mode).strip().lower() == "docker":
            raise RuntimeError(
                "HostRuntimeManager.launch invoked while studio_runtime_mode=docker"
            )
        _metric_inc("launch_attempts")
        _runtime_event(
            "launch",
            runtime_key=payload.runtime_key,
            session_id=payload.session_id,
            phase="detect",
            metadata={"backend": "host"},
        )
        from app.services.preview_runner import start_preview, start_preview_with_plan

        if payload.session_kind == "generated":
            result = await start_preview(payload.source_id, payload.project_dir)
        else:
            result = await start_preview_with_plan(
                session_id=payload.session_id,
                project_dir=payload.project_dir,
                plan=payload.plan or {},
                env_config=payload.env_config or {},
                proxy_public_base=payload.proxy_public_base,
                studio_proxy_enabled=payload.studio_proxy_enabled,
                docker_install=payload.docker_install,
            )

        if isinstance(result, dict) and result.get("url"):
            if preview_gateway.gateway_enabled() and result.get("direct_url"):
                preview_gateway.upsert_session_route(
                    payload.session_id, str(result.get("direct_url"))
                )
            result["url"] = _apply_preview_surface(result.get("url"), payload.session_id)
            _metric_inc("launch_success")
            _runtime_event(
                "ready",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="ready",
                metadata={"backend": "host", "url": str(result.get("url") or "")[:240]},
            )
        elif isinstance(result, dict) and result.get("status") == "error":
            _metric_inc("launch_failures")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase=str(result.get("phase") or "error"),
                metadata={
                    "backend": "host",
                    "error_code": str(result.get("error_code") or ""),
                },
            )
        return result

    async def stop(self, runtime_key: str) -> bool:
        cfg = get_settings()
        if str(cfg.studio_runtime_mode).strip().lower() == "docker":
            raise RuntimeError(
                "HostRuntimeManager.stop invoked while studio_runtime_mode=docker"
            )
        _metric_inc("stop_calls")
        from app.services.preview_runner import stop_preview

        stopped = await stop_preview(runtime_key)
        if stopped:
            _runtime_event("cleanup", runtime_key=runtime_key, phase="stopped", metadata={"backend": "host", "source": "stop"})
        return stopped

    async def status(
        self, runtime_key: str, session_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        cfg = get_settings()
        if str(cfg.studio_runtime_mode).strip().lower() == "docker":
            raise RuntimeError(
                "HostRuntimeManager.status invoked while studio_runtime_mode=docker"
            )
        _metric_inc("status_calls")
        from app.services.preview_runner import get_preview_status

        st = get_preview_status(runtime_key)
        if st and st.get("url"):
            surf_key = (session_id or runtime_key).strip()
            st["url"] = _apply_preview_surface(st.get("url"), surf_key)
        return st

    async def logs(self, runtime_key: str, tail: int = 200) -> str:
        cfg = get_settings()
        if str(cfg.studio_runtime_mode).strip().lower() == "docker":
            raise RuntimeError(
                "HostRuntimeManager.logs invoked while studio_runtime_mode=docker"
            )
        st = await self.status(runtime_key)
        if not st:
            return ""
        # Host runner does not persist full logs yet; callers still get phase/status.
        return f"status={st.get('status')} port={st.get('port')} url={st.get('url') or ''}"

    async def cleanup(self) -> Dict[str, Any]:
        cfg = get_settings()
        if str(cfg.studio_runtime_mode).strip().lower() == "docker":
            raise RuntimeError(
                "HostRuntimeManager.cleanup invoked while studio_runtime_mode=docker"
            )
        t0 = time.time()
        _metric_inc("cleanup_runs")
        from app.services.preview_runner import cleanup_stale_previews

        timeout = max(120, int(get_settings().studio_runtime_idle_timeout_seconds))
        await cleanup_stale_previews(max_age_seconds=timeout)
        elapsed = int((time.time() - t0) * 1000)
        _metric_set("cleanup_duration_ms_last", elapsed)
        _runtime_event(
            "cleanup",
            phase="stopped",
            metadata={
                "backend": "host",
                "max_age_seconds": timeout,
                "duration_ms": elapsed,
            },
        )
        return {"adapter": "host", "cleaned": True, "max_age_seconds": timeout}


class DockerRuntimeManager:
    """Single-machine Docker runtime adapter (Phase 1)."""

    def __init__(self) -> None:
        self._docker_teardown_tasks: set = set()

    def _schedule_deferred_docker_teardown(
        self,
        *,
        runtime_key: str,
        container_id: str,
        session_id: str,
        build_tag: str,
        remove_state_after: bool = True,
        remove_gateway_route_immediately: bool = False,
    ) -> None:
        sid = str(session_id or "").strip()

        st_gate = _state_get(runtime_key)
        if str((st_gate or {}).get("pending_docker_teardown_id") or "") == container_id:
            if remove_gateway_route_immediately and sid and preview_gateway.gateway_enabled():
                preview_gateway.remove_session_route(sid)
            return

        st_mut = dict(st_gate or {})
        st_mut["pending_docker_teardown_id"] = container_id
        _state_put(runtime_key, st_mut)

        if remove_gateway_route_immediately and sid and preview_gateway.gateway_enabled():
            preview_gateway.remove_session_route(sid)

        async def _job() -> None:
            cfg = get_settings()
            delay = max(
                0,
                int(getattr(cfg, "studio_runtime_docker_post_mortem_retain_seconds", 120)),
            )
            await asyncio.sleep(delay)
            await asyncio.to_thread(_run_docker, ["docker", "rm", "-f", container_id], 45)
            st_after = _state_get(runtime_key)
            if (
                remove_state_after
                and st_after
                and str(st_after.get("container_id") or "") == container_id
            ):
                _state_del(runtime_key)
            else:
                if st_after and str(st_after.get("container_id") or "") == container_id:
                    st_after = dict(st_after)
                    st_after.pop("pending_docker_teardown_id", None)
                    st_after["lifecycle_state"] = "container_teardown_completed"
                    st_after["container_removed_at"] = time.time()
                    _state_put(runtime_key, st_after)

            tag = str(build_tag or "").strip()
            if tag:
                st_tag = _state_get(runtime_key)
                if (
                    st_tag
                    and str(st_tag.get("container_id") or "") == container_id
                    and str(st_tag.get("build_tag") or "").strip() == tag
                ):
                    await asyncio.to_thread(_run_docker, ["docker", "rmi", "-f", tag], 45)

        t = asyncio.create_task(_job())
        self._docker_teardown_tasks.add(t)
        t.add_done_callback(lambda _t: self._docker_teardown_tasks.discard(t))

    async def _persist_docker_post_mortem_snapshot(
        self,
        *,
        runtime_key: str,
        container_id: str,
        startup_trace: list[Dict[str, Any]],
        command_metadata: Dict[str, Any],
        host_port: Optional[int],
        publish_order: Sequence[int],
    ) -> Dict[str, Any]:
        snap = await asyncio.to_thread(
            _capture_docker_post_mortem_snapshot,
            container_id,
            host_port=host_port,
            publish_order=tuple(dict.fromkeys(publish_order)),
            command_metadata=command_metadata,
        )
        _startup_trace_add(
            startup_trace,
            "container_post_mortem_snapshot_brief",
            {
                "captured_at_unix": snap.get("captured_at_unix"),
                "lifecycle_classification": snap.get("lifecycle_classification"),
                "exit_code_normalized": snap.get("exit_code_normalized"),
                "docker_raw_exit_code": snap.get("docker_raw_exit_code"),
            },
        )
        _startup_trace_add(
            startup_trace,
            "container_post_mortem_logs_tail",
            (snap.get("logs_tail") or "")[-2200:],
        )
        st = _state_get(runtime_key) or {}
        merged_cmd = dict(st.get("command_metadata") or {})
        merged_cmd.update(command_metadata)
        st["startup_trace"] = startup_trace
        st["command_metadata"] = merged_cmd
        st["last_container_diagnostics_snapshot"] = snap
        st["exit_code_normalized"] = snap.get("exit_code_normalized")
        st["docker_lifecycle_classification"] = snap.get("lifecycle_classification")
        _state_put(runtime_key, st)
        return snap

    async def launch(self, payload: RuntimeLaunchInput) -> Dict[str, Any]:
        _metric_inc("launch_attempts")
        _runtime_event(
            "launch",
            runtime_key=payload.runtime_key,
            session_id=payload.session_id,
            phase="detect",
            metadata={"backend": "docker"},
        )
        _cleanup_orphan_state_entries()
        if not _docker_cli_exists():
            _metric_inc("launch_failures")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="detect",
                metadata={"backend": "docker", "error_code": "DOCKER_CLI_MISSING"},
            )
            return _structured_error(
                phase="detect",
                code="DOCKER_CLI_MISSING",
                message="Docker CLI not found on PATH. Install Docker Desktop and restart backend.",
            )

        existing = _state_get(payload.runtime_key)
        if existing:
            _runtime_event(
                "restart",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="start",
                metadata={"backend": "docker", "reason": "launch_replaces_existing_runtime"},
            )
        await self.stop(payload.runtime_key)
        cfg = get_settings()
        plan = payload.plan or {}
        startup_trace: list[Dict[str, Any]] = []
        _startup_trace_add(startup_trace, "phase", "detect")
        runtime_id = f"rt_{uuid.uuid4().hex[:12]}"
        name = f"dv-{payload.runtime_key}-{runtime_id}".replace("_", "-")[:62]
        provenance = "generated_spec"
        dockerfile_rel = ""
        build_tag = ""

        prep, plan_failure = prepare_studio_docker_launch(
            payload.project_dir.resolve(),
            plan,
            payload.env_config or {},
            _INTERNAL_PORT,
        )
        if plan_failure:
            ph, code, msg, diag = plan_failure
            merged = dict(diag or {})
            merged.setdefault("detected_framework", str(plan.get("framework") or "unknown"))
            if merged.get("resolved_start_command") and not merged.get(
                "detected_runtime_command"
            ):
                merged["detected_runtime_command"] = merged["resolved_start_command"]
            merged["startup_trace"] = startup_trace
            _startup_trace_add(
                startup_trace,
                "launch_plan_validation_failed",
                {"code": code, "message": msg[:500]},
            )
            _metric_inc("launch_failures")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase=str(ph or "detect"),
                metadata={"backend": "docker", "error_code": str(code)},
            )
            return _structured_error(
                phase=str(ph or "detect"),
                code=str(code),
                message=str(msg),
                diagnostics=merged,
            )

        app_rel = prep.app_root_rel
        workdir = prep.container_workdir
        package_root = prep.package_root
        phase_cmds = prep.phase_cmds
        adapter = prep.adapter
        framework = str(plan.get("framework") or "").lower()
        picked_registry_image = _pick_image(plan, phase_cmds)
        expected_hybrid = str(phase_cmds.get("studio_split_toolchain_image") or "").strip()
        if (
            str(phase_cmds.get("studio_split_toolchain_strategy")) == "predetermined_image"
            and expected_hybrid
            and picked_registry_image.strip() != expected_hybrid.strip()
        ):
            diag = {
                "picked_registry_image": picked_registry_image,
                "expected_studio_split_toolchain_image": expected_hybrid,
                "split_toolchain_image_source": phase_cmds.get(
                    "studio_split_toolchain_image_source"
                ),
            }
            diag["startup_trace"] = startup_trace
            _startup_trace_add(
                startup_trace,
                "runtime_image_selection_mismatch",
                diag,
            )
            _metric_inc("launch_failures")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="detect",
                metadata={"backend": "docker", "error_code": "INVALID_RUNTIME_IMAGE_SELECTION"},
            )
            return _structured_error(
                phase="detect",
                code="INVALID_RUNTIME_IMAGE_SELECTION",
                message=(
                    "Internal runtime image selection mismatch: launch plan expected a "
                    "predetermined split hybrid image that was not selected. "
                    "Check studio_split_toolchain_image and _pick_image wiring."
                ),
                diagnostics=diag,
            )
        image = picked_registry_image
        image_provenance = "registry_resolution"

        if bool(cfg.studio_runtime_allow_custom_dockerfile):
            custom_path = package_root / "Dockerfile"
            trusted_ok = (not bool(cfg.studio_runtime_custom_dockerfile_trusted_only)) or bool(payload.trusted_runtime)
            if custom_path.is_file() and trusted_ok:
                ok, msg = _validate_custom_dockerfile(custom_path, payload.project_dir)
                if not ok:
                    _metric_inc("launch_failures")
                    _runtime_event(
                        "error",
                        runtime_key=payload.runtime_key,
                        session_id=payload.session_id,
                        phase="detect",
                        metadata={"backend": "docker", "error_code": "DOCKERFILE_POLICY_REJECTED"},
                    )
                    return _structured_error(
                        phase="detect",
                        code="DOCKERFILE_POLICY_REJECTED",
                        message=f"Custom Dockerfile rejected: {msg}",
                        diagnostics={"dockerfile": str(custom_path)},
                    )
                build_tag = f"dv-runtime-{payload.runtime_key}-{runtime_id}".lower()
                b_rc, b_out, b_err = await asyncio.to_thread(
                    _run_docker,
                    ["docker", "build", "-t", build_tag, "-f", str(custom_path), str(payload.project_dir.resolve())],
                    600,
                )
                if b_rc != 0:
                    _metric_inc("launch_failures")
                    _runtime_event(
                        "error",
                        runtime_key=payload.runtime_key,
                        session_id=payload.session_id,
                        phase="build",
                        metadata={"backend": "docker", "error_code": "DOCKERFILE_BUILD_FAILED"},
                    )
                    return _structured_error(
                        phase="build",
                        code="DOCKERFILE_BUILD_FAILED",
                        message=f"Custom Dockerfile build failed: {(b_err or b_out or 'unknown')[:1500]}",
                        diagnostics={"dockerfile": str(custom_path)},
                    )
                image = build_tag
                provenance = "custom_dockerfile"
                image_provenance = "custom_dockerfile"
                try:
                    dockerfile_rel = str(custom_path.resolve().relative_to(payload.project_dir.resolve())).replace("\\", "/")
                except Exception:
                    dockerfile_rel = "Dockerfile"
        image_resolution = _build_runtime_image_resolution_record(
            plan=plan,
            phase_cmds=phase_cmds,
            adapter=adapter,
            cfg=cfg,
            picked_registry_image=picked_registry_image,
            final_image=image,
            provenance=image_provenance,
            custom_dockerfile_rel=str(dockerfile_rel or ""),
        )
        logger.info(
            "studio_runtime.image_resolution %s",
            json.dumps(image_resolution, default=str),
        )
        _startup_trace_add(
            startup_trace, "studio_runtime_image_resolution", image_resolution
        )
        publish_tpl = getattr(prep, "docker_publish_ports", None)
        publish_ports_eff = tuple(publish_tpl) if publish_tpl else (_INTERNAL_PORT,)
        primary_listen = int(
            getattr(prep, "frontend_internal_port_hint", None) or _INTERNAL_PORT
        )
        _startup_trace_add(startup_trace, "detected_framework", framework or "unknown")
        _startup_trace_add(startup_trace, "selected_framework_adapter", adapter.name)
        _startup_trace_add(startup_trace, "selected_preview_strategy", phase_cmds.get("preview_strategy"))
        command_metadata = {
            "detected_framework": framework or "unknown",
            "selected_framework_adapter": adapter.name,
            "app_root_rel": app_rel,
            "working_directory": workdir,
            "package_root": str(package_root),
            "package_root_exists": package_root.exists(),
            "package_json_exists": (package_root / "package.json").exists(),
            "node_version_file_exists": (package_root / ".nvmrc").exists()
            or (package_root / ".node-version").exists(),
            "detected_package_manager": _detect_package_manager(phase_cmds, package_root),
            "detected_runtime_command": str(phase_cmds.get("start") or "").strip(),
            "detected_install_command": str(phase_cmds.get("install") or "").strip(),
            "detected_build_command": str(phase_cmds.get("build") or "").strip(),
            "preview_strategy": str(phase_cmds.get("preview_strategy") or "live_preview"),
            "preview_strategy_reason": str(
                phase_cmds.get("preview_strategy_reason")
                or "default_studio_preview_strategy"
            ),
            "build_is_production_style": bool(
                phase_cmds.get("build_is_production_style")
            ),
            "expected_internal_port": primary_listen,
            "docker_publish_preview_ports": list(publish_ports_eff),
            "healthcheck_path_resolved": prep.healthcheck_path,
            "adapter_expected_listen_port": int(adapter.expected_internal_listen_port),
            "studio_launch_plan_validated": True,
            "studio_split_toolchain_strategy": phase_cmds.get(
                "studio_split_toolchain_strategy"
            ),
            "studio_split_toolchain_image": phase_cmds.get("studio_split_toolchain_image"),
            "studio_split_toolchain_image_source": phase_cmds.get(
                "studio_split_toolchain_image_source"
            ),
            "studio_runtime_image_resolution": image_resolution,
        }
        command_metadata["topology_analysis"] = _analyze_repo_topology(
            package_root, plan, phase_cmds
        )
        _startup_trace_add(startup_trace, "detected_package_manager", command_metadata.get("detected_package_manager"))
        _startup_trace_add(startup_trace, "detected_app_root", command_metadata.get("package_root"))
        _startup_trace_add(startup_trace, "install_command", command_metadata.get("detected_install_command"))
        _startup_trace_add(startup_trace, "build_command", command_metadata.get("detected_build_command"))
        _startup_trace_add(startup_trace, "start_command", command_metadata.get("detected_runtime_command"))
        _startup_trace_add(startup_trace, "internal_listen_port_expected", int(primary_listen))
        cmd = prep.shell_command
        split_ph = getattr(prep, "split_backend_origin_placeholder", None) or ""

        docker_port_host_map: Dict[int, Optional[int]] = {}
        publish_args_list: List[str] = []

        env_pairs_base = {k: v for k, v in (payload.env_config or {}).items() if v}
        if split_ph:
            internals_sorted = tuple(sorted(dict.fromkeys(publish_ports_eff)))
            hp_alloc = _reserve_localhost_ports(len(internals_sorted))
            cin_to_host: Dict[int, int] = {}
            for cinp, hh in zip(internals_sorted, hp_alloc):
                publish_args_list.extend(
                    ["-p", f"127.0.0.1:{hh}:{int(cinp)}/tcp"]
                )
                docker_port_host_map[int(cinp)] = int(hh)
            command_metadata["deterministic_split_host_bindings"] = {
                str(k): int(v) for k, v in docker_port_host_map.items()
            }
            backend_hp = docker_port_host_map.get(int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT))
            if backend_hp is not None:
                origin = f"http://127.0.0.1:{backend_hp}"
                cmd = str(cmd).replace(str(split_ph), origin)
                env_pairs_base.setdefault("NEXT_PUBLIC_API_URL", origin)
                env_pairs_base.setdefault("VITE_API_URL", origin)
                env_pairs_base.setdefault("REACT_APP_API_URL", origin)
                env_pairs_base.setdefault("PUBLIC_API_URL", origin)
                env_pairs_base.setdefault("STUDIO_PREVIEW_API_ORIGIN", origin)
                env_pairs_base.setdefault(
                    "NEXT_BACKEND_API_URL",
                    f"http://127.0.0.1:{STUDIO_SPLIT_BACKEND_INTERNAL_PORT}",
                )
                command_metadata["studio_preview_api_origin_injected"] = origin
        else:
            for cinp in dict.fromkeys(publish_ports_eff):
                publish_args_list.extend(["-p", f"127.0.0.1::{int(cinp)}/tcp"])
                docker_port_host_map[int(cinp)] = None

        env_pairs = dict(env_pairs_base)
        env_pairs.setdefault("PORT", str(primary_listen))
        env_pairs.setdefault("HOST", "0.0.0.0")
        if framework == "nextjs":
            for k, v in nextjs_file_watch_env_for_studio().items():
                env_pairs.setdefault(k, v)

        docker_user = str(getattr(cfg, "studio_runtime_docker_user", "") or "").strip()
        command_metadata["docker_user"] = docker_user or None

        args = ["docker", "run", "-d"]
        if bool(getattr(cfg, "studio_runtime_docker_autoremove", False)):
            args.append("--rm")
        args.extend(
            [
            "--init",
            "--name",
            name,
            "--cpus",
            str(cfg.studio_runtime_cpus),
            "--memory",
            cfg.studio_runtime_memory,
            "--pids-limit",
            str(int(cfg.studio_runtime_pids_limit)),
            "--security-opt",
            "no-new-privileges",
            "--cap-drop",
            "ALL",
        ]
        )
        if docker_user:
            args.extend(["--user", docker_user])
        args.extend(
            [
                "-v",
                f"{str(payload.project_dir.resolve())}:/workspace",
                "-w",
                workdir,
            ]
        )
        args.extend(publish_args_list)
        for k, v in env_pairs.items():
            args.extend(["-e", f"{k}={v}"])
        args.extend([image, "sh", "-lc", cmd])

        _state_put(
            payload.runtime_key,
            {
                "runtime_id": runtime_id,
                "runtime_key": payload.runtime_key,
                "session_id": payload.session_id,
                "phase": "detect",
                "runtime_backend": "docker",
                "runtime_provenance": provenance,
                "dockerfile_path": dockerfile_rel or None,
                "build_tag": build_tag or None,
                "command_metadata": command_metadata,
                "startup_trace": startup_trace,
                "created_at": time.time(),
                "project_dir": str(payload.project_dir.resolve()),
            },
        )
        rc, out, err = await asyncio.to_thread(
            _run_docker,
            args,
            max(
                30,
                int(
                    getattr(cfg, "studio_runtime_docker_run_timeout_seconds", 300) or 300
                ),
            ),
        )
        if rc != 0 or not out:
            _update_phase(payload.runtime_key, "error")
            _metric_inc("launch_failures")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="detect",
                metadata={"backend": "docker", "error_code": "DOCKER_RUN_FAILED"},
            )
            base_msg = (err or out or "unknown error")[:1200]
            extra = ""
            if "TimeoutExpired" in base_msg:
                extra = (
                    " First pulls of large images (e.g. golang:bookworm on Docker Desktop) can exceed "
                    "the default subprocess timeout — raise "
                    "`STUDIO_RUNTIME_DOCKER_RUN_TIMEOUT_SECONDS` or pre-pull with `docker pull "
                    + str(image).replace('"', "").replace("`", "")[:240]
                    + "`."
                )
            return _structured_error(
                phase="detect",
                code="DOCKER_RUN_FAILED",
                message=("Docker run failed: " + base_msg + extra)[:2000],
                diagnostics={
                    "image": image,
                    "workdir": workdir,
                    "runtime_key": payload.runtime_key,
                    "docker_run_timeout_seconds": int(
                        getattr(cfg, "studio_runtime_docker_run_timeout_seconds", 300) or 300
                    ),
                },
            )

        container_id = out.splitlines()[-1].strip()
        if not container_id:
            _update_phase(payload.runtime_key, "error")
            _metric_inc("launch_failures")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="detect",
                metadata={"backend": "docker", "error_code": "DOCKER_CONTAINER_ID_MISSING"},
            )
            return _structured_error(
                phase="detect",
                code="DOCKER_CONTAINER_ID_MISSING",
                message="Docker run returned no container id",
            )

        _state_put(
            payload.runtime_key,
            {
                "runtime_id": runtime_id,
                "runtime_key": payload.runtime_key,
                "session_id": payload.session_id,
                "container_id": container_id,
                "container_name": name,
                "internal_port": primary_listen,
                "project_dir": str(payload.project_dir.resolve()),
                "phase": "detect",
                "runtime_backend": "docker",
                "runtime_provenance": provenance,
                "dockerfile_path": dockerfile_rel or None,
                "build_tag": build_tag or None,
                "created_at": time.time(),
                "command_metadata": command_metadata,
                "startup_trace": startup_trace,
            },
        )

        if (phase_cmds.get("install") or "").strip():
            _update_phase(payload.runtime_key, "install")
        elif (phase_cmds.get("build") or "").strip():
            _update_phase(payload.runtime_key, "build")
        else:
            _update_phase(payload.runtime_key, "start")

        publish_order = tuple(dict.fromkeys(publish_ports_eff))
        initial_bindings = await asyncio.to_thread(
            _gather_host_bindings_for_ports,
            container_id,
            publish_order,
        )
        sorted_bindings_cached = _sort_publish_bindings(
            initial_bindings,
            primary_listen,
            publish_order,
        )
        topo_for_rank = command_metadata.get("topology_analysis") or {}
        split_mode = bool(phase_cmds.get("studio_split_preview_mode"))

        async def _rank_bindings_for_preview_surface(
            bindings: list[tuple[int, int]],
        ) -> list[tuple[int, int]]:
            if len(bindings) <= 1:
                return bindings
            ranked, trace = await asyncio.to_thread(
                rank_preview_bindings_with_diagnostics,
                bindings,
                primary_listen=primary_listen,
                publish_order=publish_order,
                framework=str(framework or ""),
                topology_analysis=topo_for_rank,
                split_preview_mode=split_mode,
            )
            command_metadata["preview_binding_role_ranking"] = trace[-28:]
            _startup_trace_add(
                startup_trace,
                "preview_binding_role_ranking",
                trace[-16:],
            )
            return ranked

        sorted_bindings_cached = await _rank_bindings_for_preview_surface(
            sorted_bindings_cached
        )
        host_port = sorted_bindings_cached[0][1] if sorted_bindings_cached else None
        port_diag = ""
        if not sorted_bindings_cached:
            _, port_out, port_err = await asyncio.to_thread(
                _resolve_mapped_host_port, container_id, primary_listen
            )
            port_diag = str(port_err or port_out or "")[:900]
            _startup_trace_add(
                startup_trace,
                "initial_port_mapping_unavailable",
                {"docker_port_error": port_diag},
            )

        timeout_s = max(20, int(cfg.studio_runtime_start_timeout_seconds))
        probe_http_s = max(
            1.0,
            float(getattr(cfg, "studio_runtime_http_probe_timeout_seconds", 25.0) or 25.0),
        )
        start = time.time()
        last_discovery = time.time()
        discovered_ports: set[int] = set()
        priority_binding: Optional[tuple[int, int]] = None
        _update_phase(payload.runtime_key, "start", host_port=host_port)
        command_metadata["mapped_host_port"] = int(host_port) if host_port else None
        command_metadata["docker_port_output"] = port_diag
        command_metadata["docker_publish_bindings_resolved"] = [
            {"container": c, "host": h} for c, h in sorted_bindings_cached
        ]
        if host_port:
            _startup_trace_add(
                startup_trace,
                "resolved_host_port_mapping",
                {
                    "host_port": int(host_port),
                    "bindings": command_metadata["docker_publish_bindings_resolved"],
                },
            )
        health_path = prep.healthcheck_path
        last_probe: Dict[str, Any] = {"success": False, "error": "probe_not_run"}
        while time.time() - start < timeout_s:
            now = time.time()
            inspect_state = await asyncio.to_thread(_docker_inspect_state, container_id)
            if not inspect_state.get("running"):
                snap = await self._persist_docker_post_mortem_snapshot(
                    runtime_key=payload.runtime_key,
                    container_id=container_id,
                    startup_trace=startup_trace,
                    command_metadata=command_metadata,
                    host_port=host_port,
                    publish_order=publish_order,
                )
                inspect_eff: Dict[str, Any] = dict(snap.get("inspect") or inspect_state)
                inspect_eff["exit_code_normalized"] = snap.get("exit_code_normalized")
                inspect_eff["docker_lifecycle_hint"] = snap.get("lifecycle_classification")
                tail_logs = str(snap.get("logs_tail") or "")
                eff_code = _docker_error_code_from_snapshot(snap, "DOCKER_RUNTIME_EXITED")
                _update_phase(
                    payload.runtime_key,
                    "error",
                    container_state=inspect_eff,
                    last_http_probe=last_probe,
                    startup_trace=startup_trace,
                )
                _startup_trace_add(
                    startup_trace,
                    "container_state_transition",
                    {
                        "running": False,
                        "lifecycle_classification": snap.get("lifecycle_classification"),
                        "exit_code_normalized": snap.get("exit_code_normalized"),
                        "docker_raw_exit_code": snap.get("docker_raw_exit_code"),
                        "inspect_ok": inspect_eff.get("inspect_ok"),
                        "status": inspect_eff.get("status"),
                    },
                )
                _exit_hint_early = derive_studio_docker_exit_hint(
                    exit_code_normalized=snap.get("exit_code_normalized"),
                    log_tail=tail_logs[-2200:],
                    phase_cmds=phase_cmds,
                    command_metadata=command_metadata,
                )
                exit_msg = format_container_exit_failure_message(
                    inspect_state=inspect_eff,
                    log_tail=tail_logs[-2200:],
                    adapter_name=str(
                        command_metadata.get("selected_framework_adapter") or ""
                    ),
                    container_workdir=workdir,
                    start_command=str(phase_cmds.get("start") or ""),
                    missing_hints={
                        "package_root_workspace": command_metadata.get("package_root"),
                        "topology_lifecycle_hint": (
                            (command_metadata.get("topology_analysis") or {}).get(
                                "lifecycle_category_hint"
                            )
                        ),
                    },
                    exit_hint=_exit_hint_early or None,
                )
                diag_exit = {
                    "container_id": container_id,
                    "container_state": inspect_eff,
                    "exit_code": snap.get("exit_code_normalized"),
                    "docker_raw_exit_code": snap.get("docker_raw_exit_code"),
                    "docker_lifecycle_classification": snap.get("lifecycle_classification"),
                    "recent_logs": tail_logs[-2200:],
                    "http_probe": last_probe,
                    "startup_trace": startup_trace,
                    "host_port": host_port,
                    "foreground_start_command": str(phase_cmds.get("start") or ""),
                    "container_post_mortem_snapshot": snap,
                    **command_metadata,
                }
                self._schedule_deferred_docker_teardown(
                    runtime_key=payload.runtime_key,
                    container_id=container_id,
                    session_id=payload.session_id,
                    build_tag=str(build_tag or ""),
                    remove_state_after=True,
                    remove_gateway_route_immediately=True,
                )
                _metric_inc("launch_failures")
                _runtime_event(
                    "error",
                    runtime_key=payload.runtime_key,
                    session_id=payload.session_id,
                    phase="start",
                    metadata={
                        "backend": "docker",
                        "error_code": eff_code,
                        "exit_code": snap.get("exit_code_normalized"),
                        "docker_lifecycle_classification": snap.get(
                            "lifecycle_classification"
                        ),
                    },
                )
                return _structured_error(
                    phase="start",
                    code=eff_code,
                    message=exit_msg,
                    diagnostics=diag_exit,
                    port=host_port,
                )

            probe_chain: list[tuple[int, int]] = []
            if priority_binding:
                probe_chain.append(
                    (int(priority_binding[0]), int(priority_binding[1]))
                )
            for row in sorted_bindings_cached:
                if priority_binding and row == priority_binding:
                    continue
                probe_chain.append((int(row[0]), int(row[1])))
            hp_ok, cinp_ok, probe = await _probe_publish_bindings_sorted(
                probe_chain,
                health_path,
                probe_timeout_s=probe_http_s,
            )
            last_probe = probe
            if hp_ok is not None and cinp_ok is not None:
                direct = preview_loopback_base(int(hp_ok))
                st = _state_get(payload.runtime_key) or {}
                ready_update: Dict[str, Any] = {
                    "phase": "ready",
                    "lifecycle_state": "http_alive",
                    "host_port": int(hp_ok),
                    "direct_url": direct,
                    "started_at": time.time(),
                    "last_http_probe": probe,
                    "startup_trace": startup_trace,
                }
                if int(cinp_ok) != int(primary_listen):
                    ready_update["detected_internal_port"] = int(cinp_ok)
                prr = command_metadata.get("preview_binding_role_ranking") or []
                role_row = next(
                    (
                        r
                        for r in prr
                        if int(r.get("host_port") or 0) == int(hp_ok)
                    ),
                    None,
                )
                if role_row:
                    ready_update["inferred_preview_service_role"] = role_row.get(
                        "service_role_inference"
                    )
                st.update(ready_update)
                _state_put(payload.runtime_key, st)
                host_port = int(hp_ok)
                command_metadata["mapped_host_port"] = host_port
                _startup_trace_add(
                    startup_trace,
                    "http_probe_success",
                    {
                        "url": probe.get("probe_url"),
                        "status_code": probe.get("status_code"),
                        "elapsed_ms": probe.get("elapsed_ms"),
                        "via_binding": {"container": cinp_ok, "host": hp_ok},
                    },
                )
                if preview_gateway.gateway_enabled():
                    preview_gateway.upsert_session_route(payload.session_id, direct)
                _metric_inc("launch_success")
                _runtime_event(
                    "ready",
                    runtime_key=payload.runtime_key,
                    session_id=payload.session_id,
                    phase="ready",
                    metadata={
                        "backend": "docker",
                        "host_port": host_port,
                        "detected_internal_port": ready_update.get(
                            "detected_internal_port"
                        ),
                    },
                )
                return {
                    "status": "running",
                    "runtime_id": runtime_id,
                    "runtime_backend": "docker",
                    "container_id": container_id,
                    "runtime_provenance": provenance,
                    "dockerfile_path": dockerfile_rel or None,
                    "port": host_port,
                    "direct_url": direct,
                    "url": _apply_preview_surface(direct, payload.session_id),
                    "started_at": st.get("started_at"),
                    "phase": "ready",
                    "lifecycle_state": "http_alive",
                    "http_probe": probe,
                    "startup_trace": startup_trace,
                }

            if now - last_discovery >= 2.0:
                last_discovery = now
                fresh = await asyncio.to_thread(
                    _gather_host_bindings_for_ports,
                    container_id,
                    publish_order,
                )
                sorted_bindings_cached = _sort_publish_bindings(
                    fresh, primary_listen, publish_order
                )
                sorted_bindings_cached = await _rank_bindings_for_preview_surface(
                    sorted_bindings_cached
                )
                command_metadata["docker_publish_bindings_resolved"] = [
                    {"container": c, "host": h} for c, h in sorted_bindings_cached
                ]
                if sorted_bindings_cached:
                    host_port = sorted_bindings_cached[0][1]
                    _update_phase(
                        payload.runtime_key, "start", host_port=host_port
                    )
                    command_metadata["mapped_host_port"] = host_port

                listeners = await asyncio.to_thread(
                    _discover_container_listeners, container_id
                )
                chosen_port, chosen_host, expected_loopback = _choose_runtime_port(
                    listeners, primary_listen
                )
                for row in listeners:
                    try:
                        discovered_ports.add(int(row.get("port") or 0))
                    except Exception:
                        continue
                if expected_loopback:
                    snap = await self._persist_docker_post_mortem_snapshot(
                        runtime_key=payload.runtime_key,
                        container_id=container_id,
                        startup_trace=startup_trace,
                        command_metadata=command_metadata,
                        host_port=host_port,
                        publish_order=publish_order,
                    )
                    _update_phase(
                        payload.runtime_key,
                        "error",
                        startup_trace=startup_trace,
                    )
                    self._schedule_deferred_docker_teardown(
                        runtime_key=payload.runtime_key,
                        container_id=container_id,
                        session_id=payload.session_id,
                        build_tag=str(build_tag or ""),
                        remove_state_after=True,
                        remove_gateway_route_immediately=True,
                    )
                    _metric_inc("launch_failures")
                    _runtime_event(
                        "error",
                        runtime_key=payload.runtime_key,
                        session_id=payload.session_id,
                        phase="start",
                        metadata={
                            "backend": "docker",
                            "error_code": "DOCKER_BIND_LOOPBACK",
                            "expected_port": primary_listen,
                            "bind_host": str(chosen_host or ""),
                        },
                    )
                    return _structured_error(
                        phase="start",
                        code="DOCKER_BIND_LOOPBACK",
                        message=(
                            "Runtime is listening only on loopback inside container. "
                            "Bind the dev server to 0.0.0.0 (not 127.0.0.1)."
                        ),
                        diagnostics={
                            "container_id": container_id,
                            "expected_internal_port": primary_listen,
                            "listeners": listeners[:20],
                            "container_post_mortem_snapshot": snap,
                            "startup_trace": startup_trace,
                            **command_metadata,
                        },
                    )
                if (
                    chosen_port
                    and int(chosen_port) != int(primary_listen)
                    and int(chosen_port) not in {0}
                ):
                    rc2, port_out2, port_err2 = await asyncio.to_thread(
                        _run_docker,
                        ["docker", "port", container_id, f"{int(chosen_port)}/tcp"],
                        20,
                    )
                    mapped2 = _parse_host_port(port_out2) if rc2 == 0 else None
                    if mapped2 and _is_port_open(mapped2):
                        priority_binding = (int(chosen_port), int(mapped2))
                        host_port = int(mapped2)
                        command_metadata["mapped_host_port"] = host_port
                        command_metadata["docker_port_output"] = str(
                            port_out2 or ""
                        ).strip()
                        _startup_trace_add(
                            startup_trace,
                            "listener_port_prioritized",
                            {
                                "detected_internal_port": int(chosen_port),
                                "host_port": host_port,
                            },
                        )
                    elif rc2 != 0 and now - start > 8:
                        snap = await self._persist_docker_post_mortem_snapshot(
                            runtime_key=payload.runtime_key,
                            container_id=container_id,
                            startup_trace=startup_trace,
                            command_metadata=command_metadata,
                            host_port=host_port,
                            publish_order=publish_order,
                        )
                        _update_phase(payload.runtime_key, "error")
                        self._schedule_deferred_docker_teardown(
                            runtime_key=payload.runtime_key,
                            container_id=container_id,
                            session_id=payload.session_id,
                            build_tag=str(build_tag or ""),
                            remove_state_after=True,
                            remove_gateway_route_immediately=True,
                        )
                        _metric_inc("launch_failures")
                        _runtime_event(
                            "error",
                            runtime_key=payload.runtime_key,
                            session_id=payload.session_id,
                            phase="start",
                            metadata={
                                "backend": "docker",
                                "error_code": "DOCKER_DYNAMIC_PORT_NOT_PUBLISHED",
                                "detected_internal_port": int(chosen_port),
                            },
                        )
                        return _structured_error(
                            phase="start",
                            code="DOCKER_DYNAMIC_PORT_NOT_PUBLISHED",
                            message=(
                                "Runtime opened a non-default internal port that is not published. "
                                "Ensure app binds to expected port or configure launch normalization."
                            ),
                            diagnostics={
                                "container_id": container_id,
                                "expected_internal_port": primary_listen,
                                "detected_internal_port": int(chosen_port),
                                "docker_port_error": (port_err2 or port_out2)[:900],
                                "listeners": listeners[:20],
                                "container_post_mortem_snapshot": snap,
                                "startup_trace": startup_trace,
                                **command_metadata,
                            },
                        )
            await asyncio.sleep(0.5)

        _startup_trace_add(startup_trace, "phase", "error")
        _startup_trace_add(startup_trace, "last_http_probe", last_probe)

        snap = await self._persist_docker_post_mortem_snapshot(
            runtime_key=payload.runtime_key,
            container_id=container_id,
            startup_trace=startup_trace,
            command_metadata=command_metadata,
            host_port=host_port,
            publish_order=publish_order,
        )
        inspect_eff = dict(snap.get("inspect") or {})
        inspect_eff["exit_code_normalized"] = snap.get("exit_code_normalized")
        inspect_eff["docker_lifecycle_hint"] = snap.get("lifecycle_classification")
        logs_tail = str(snap.get("logs_tail") or "")
        _startup_trace_add(startup_trace, "container_final_state", inspect_eff)
        _update_phase(
            payload.runtime_key,
            "error",
            container_state=inspect_eff,
            last_http_probe=last_probe,
            startup_trace=startup_trace,
        )
        self._schedule_deferred_docker_teardown(
            runtime_key=payload.runtime_key,
            container_id=container_id,
            session_id=payload.session_id,
            build_tag=str(build_tag or ""),
            remove_state_after=True,
            remove_gateway_route_immediately=True,
        )
        _metric_inc("launch_failures")

        lc = str(snap.get("lifecycle_classification") or "")
        container_running_at_deadline = lc == "container_running"

        if not container_running_at_deadline:
            exit_deadline_hint = derive_studio_docker_exit_hint(
                exit_code_normalized=snap.get("exit_code_normalized"),
                log_tail=logs_tail[-2200:],
                phase_cmds=phase_cmds,
                command_metadata=command_metadata,
            )
            exit_deadline_msg = format_container_exit_failure_message(
                inspect_state=inspect_eff,
                log_tail=logs_tail[-2200:],
                adapter_name=str(
                    command_metadata.get("selected_framework_adapter") or ""
                ),
                container_workdir=workdir,
                start_command=str(phase_cmds.get("start") or ""),
                missing_hints={
                    "package_root_workspace": command_metadata.get("package_root"),
                    "topology_lifecycle_hint": (
                        (command_metadata.get("topology_analysis") or {}).get(
                            "lifecycle_category_hint"
                        )
                    ),
                },
                exit_hint=exit_deadline_hint or None,
            )
            eff_code = _docker_error_code_from_snapshot(snap, "DOCKER_RUNTIME_EXITED")
            _runtime_event(
                "error",
                runtime_key=payload.runtime_key,
                session_id=payload.session_id,
                phase="start",
                metadata={
                    "backend": "docker",
                    "error_code": eff_code,
                    "exit_code": snap.get("exit_code_normalized"),
                    "docker_lifecycle_classification": lc,
                    "after_http_deadline": True,
                },
            )
            return _structured_error(
                phase="start",
                code=eff_code,
                message=(
                    exit_deadline_msg + "\n(HTTP readiness deadline expired while container "
                    "was already stopped.)"
                ),
                diagnostics={
                    "container_id": container_id,
                    "container_state": inspect_eff,
                    "exit_code": snap.get("exit_code_normalized"),
                    "docker_raw_exit_code": snap.get("docker_raw_exit_code"),
                    "docker_lifecycle_classification": lc,
                    "container_post_mortem_snapshot": snap,
                    "host_port": host_port,
                    "http_probe": last_probe,
                    "recent_logs": logs_tail[-2200:],
                    "startup_trace": startup_trace,
                    "timed_out_waiting_http": True,
                    **command_metadata,
                },
                port=host_port,
            )

        _runtime_event(
            "timeout",
            runtime_key=payload.runtime_key,
            session_id=payload.session_id,
            phase="start",
            metadata={
                "backend": "docker",
                "error_code": "DOCKER_START_TIMEOUT",
                "host_port": host_port,
                "exit_code": snap.get("exit_code_normalized"),
                "container_running_at_deadline": True,
            },
        )
        tail_snip = (logs_tail or "(no logs)")[-1800:]
        install_hint = ""
        low = tail_snip.lower()
        if "[runtime-phase] install" in tail_snip or "npm install" in low or "pnpm install" in low:
            install_hint = (
                " The container may still be installing dependencies or compiling — "
                "increase `STUDIO_RUNTIME_START_TIMEOUT_SECONDS` in the backend environment "
                "(e.g. 360) or retry after Docker/npm caches are warm."
            )
        return _structured_error(
            phase="start",
            code="DOCKER_START_TIMEOUT",
            message=(
                f"Docker runtime start timeout after {timeout_s}s.{install_hint} "
                f"Tail logs:\n{tail_snip}"
            ),
            diagnostics={
                "container_id": container_id,
                "container_state": inspect_eff,
                "host_port": host_port,
                "expected_internal_port": primary_listen,
                "discovered_listener_ports": sorted(p for p in discovered_ports if p > 0),
                "http_probe": last_probe,
                "recent_logs": logs_tail[-2200:],
                "startup_trace": startup_trace,
                "container_running_at_deadline": True,
                "container_post_mortem_snapshot": snap,
                **command_metadata,
            },
            port=host_port,
        )

    async def stop(self, runtime_key: str) -> bool:
        _metric_inc("stop_calls")
        st = _state_get(runtime_key)
        if not st:
            return False
        sid = str(st.get("session_id") or "").strip()
        cid = str(st.get("container_id") or "").strip()
        tag = str(st.get("build_tag") or "").strip()
        startup_trace = list(st.get("startup_trace") or [])
        cmd_meta = dict(st.get("command_metadata") or {})
        ports_tpl = tuple(cmd_meta.get("docker_publish_preview_ports") or ()) or (
            _INTERNAL_PORT,
        )
        hp_raw = st.get("host_port")
        hp_opt: Optional[int] = None
        if hp_raw is not None and str(hp_raw).strip() != "":
            try:
                hp_opt = int(hp_raw)
            except (TypeError, ValueError):
                hp_opt = None

        if cid:
            await self._persist_docker_post_mortem_snapshot(
                runtime_key=runtime_key,
                container_id=cid,
                startup_trace=startup_trace,
                command_metadata=cmd_meta,
                host_port=hp_opt,
                publish_order=ports_tpl,
            )
            self._schedule_deferred_docker_teardown(
                runtime_key=runtime_key,
                container_id=cid,
                session_id=sid,
                build_tag=tag,
                remove_state_after=True,
                remove_gateway_route_immediately=True,
            )
        else:
            if sid and preview_gateway.gateway_enabled():
                preview_gateway.remove_session_route(sid)
            if tag:
                await asyncio.to_thread(_run_docker, ["docker", "rmi", "-f", tag], 30)
            _state_del(runtime_key)

        _update_phase(runtime_key, "stopped")
        _runtime_event(
            "cleanup",
            runtime_key=runtime_key,
            session_id=sid or None,
            phase="stopped",
            metadata={
                "backend": "docker",
                "source": "stop",
                "docker_rm_deferred": bool(cid),
            },
        )
        return True

    async def status(
        self, runtime_key: str, session_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        _metric_inc("status_calls")
        st = _state_get(runtime_key)
        if not st:
            return None
        cid = str(st.get("container_id") or "").strip()
        if not cid:
            _state_del(runtime_key)
            return None

        rc, out, _ = await asyncio.to_thread(
            _run_docker,
            ["docker", "inspect", "--format", "{{.State.Running}}|{{.State.ExitCode}}|{{.State.Status}}", cid],
            15,
        )
        run_state = (out or "").strip()
        parts = run_state.split("|")
        running = parts[0].strip().lower() == "true" if parts else False
        exit_code = parts[1].strip() if len(parts) > 1 else ""
        container_status = parts[2].strip() if len(parts) > 2 else ""
        if rc != 0 or not running:
            out_low = str(out or "").lower()
            sid_gc = str(st.get("session_id") or "").strip()
            tag_gc = str(st.get("build_tag") or "").strip()
            startup_trace_gc = list(st.get("startup_trace") or [])
            cmd_meta_gc = dict(st.get("command_metadata") or {})
            ports_gc = tuple(cmd_meta_gc.get("docker_publish_preview_ports") or ()) or (
                _INTERNAL_PORT,
            )
            hp_raw_gc = st.get("host_port")
            hp_gc: Optional[int] = None
            if hp_raw_gc is not None and str(hp_raw_gc).strip() != "":
                try:
                    hp_gc = int(hp_raw_gc)
                except (TypeError, ValueError):
                    hp_gc = None

            exit_norm: Optional[int] = None
            lc_hint = ""
            if str(st.get("pending_docker_teardown_id") or "") != cid:
                snap_gc = await self._persist_docker_post_mortem_snapshot(
                    runtime_key=runtime_key,
                    container_id=cid,
                    startup_trace=startup_trace_gc,
                    command_metadata=cmd_meta_gc,
                    host_port=hp_gc,
                    publish_order=ports_gc,
                )
                en = snap_gc.get("exit_code_normalized")
                exit_norm = int(en) if isinstance(en, int) else None
                lc_hint = str(snap_gc.get("lifecycle_classification") or "")
                self._schedule_deferred_docker_teardown(
                    runtime_key=runtime_key,
                    container_id=cid,
                    session_id=sid_gc,
                    build_tag=tag_gc,
                    remove_state_after=True,
                    remove_gateway_route_immediately=True,
                )
            else:
                snap_prior = st.get("last_container_diagnostics_snapshot") or {}
                enp = snap_prior.get("exit_code_normalized")
                exit_norm = int(enp) if isinstance(enp, int) else None
                lc_hint = str(snap_prior.get("lifecycle_classification") or "")

            if not isinstance(exit_norm, int):
                if "no such container" in out_low:
                    exit_norm = _EXIT_CODE_UNAVAILABLE_REMOVED
                    lc_hint = lc_hint or "container_removed_before_diagnostics"
                elif rc != 0:
                    exit_norm = _EXIT_CODE_UNAVAILABLE_INSPECT
                    lc_hint = lc_hint or "runtime_tracking_failure"
                elif exit_code != "":
                    try:
                        exit_norm = int(exit_code)
                    except ValueError:
                        exit_norm = _EXIT_CODE_UNKNOWN_EXITED
                else:
                    exit_norm = _EXIT_CODE_UNKNOWN_EXITED

            _runtime_event(
                "cleanup",
                runtime_key=runtime_key,
                session_id=sid_gc or None,
                phase="stopped",
                metadata={
                    "backend": "docker",
                    "source": "status_gc",
                    "docker_lifecycle_classification": lc_hint or "container_exited",
                    "last_exit_code": exit_norm,
                },
            )
            return {
                "status": "stopped",
                "runtime_backend": "docker",
                "phase": "stopped",
                "lifecycle_state": "process_stopped",
                "container_status": container_status or "exited",
                "last_exit_code": exit_norm,
                "docker_lifecycle_classification": lc_hint,
            }

        host_port = st.get("host_port")
        direct = str(st.get("direct_url") or "")
        if not direct and host_port:
            direct = preview_loopback_base(int(host_port))
        surf_key = str(session_id or st.get("session_id") or runtime_key)
        return {
            "status": "running",
            "runtime_id": st.get("runtime_id"),
            "runtime_backend": "docker",
            "container_id": cid,
            "runtime_provenance": st.get("runtime_provenance"),
            "dockerfile_path": st.get("dockerfile_path"),
            "port": host_port,
            "direct_url": direct or None,
            "url": _apply_preview_surface(direct or None, surf_key),
            "started_at": st.get("started_at"),
            "phase": st.get("phase", "running"),
            "lifecycle_state": st.get("lifecycle_state") or "http_alive",
            "command_metadata": st.get("command_metadata") or {},
            "last_http_probe": st.get("last_http_probe"),
        }

    async def logs(self, runtime_key: str, tail: int = 200) -> str:
        st = _state_get(runtime_key)
        if not st:
            return ""
        cid = str(st.get("container_id") or "").strip()
        if not cid:
            return ""
        rc, out, err = await asyncio.to_thread(
            _run_docker, ["docker", "logs", "--tail", str(max(10, int(tail))), cid], 20
        )
        if rc != 0:
            return err or out
        return out

    async def cleanup(self) -> Dict[str, Any]:
        t0 = time.time()
        _metric_inc("cleanup_runs")
        _cleanup_orphan_state_entries()
        cfg = get_settings()
        max_age = max(120, int(cfg.studio_runtime_idle_timeout_seconds))
        now = time.time()
        removed = 0
        state = _read_state()
        active_sessions: set[str] = set()
        for _, row in state.items():
            sid = str((row or {}).get("session_id") or "").strip()
            if sid:
                active_sessions.add(sid)
        if preview_gateway.gateway_enabled():
            _metric_inc("route_prune_runs")
            removed_routes = int(preview_gateway.prune_routes(active_sessions) or 0)
            _metric_inc("route_prune_removed", removed_routes)
            if removed_routes > 0:
                _runtime_event(
                    "route_prune",
                    phase="stopped",
                    metadata={"backend": "docker", "removed_routes": removed_routes},
                )
        for key, row in list(state.items()):
            phase = str((row or {}).get("phase") or "").strip().lower()
            if phase in _STARTUP_PHASES:
                # Never reap runtimes actively progressing through launch phases.
                continue
            started = float((row or {}).get("started_at") or (row or {}).get("created_at") or now)
            if now - started <= max_age:
                continue
            try:
                await self.stop(key)
                removed += 1
                _runtime_event(
                    "timeout",
                    runtime_key=key,
                    session_id=str((row or {}).get("session_id") or "") or None,
                    phase="stopped",
                    metadata={"backend": "docker", "reason": "idle_timeout"},
                )
            except Exception:
                logger.exception("docker runtime cleanup stop failed: %s", key)
        _metric_inc("cleanup_removed", removed)
        elapsed = int((time.time() - t0) * 1000)
        _metric_set("cleanup_duration_ms_last", elapsed)
        _runtime_event(
            "cleanup",
            phase="stopped",
            metadata={
                "backend": "docker",
                "removed": removed,
                "max_age_seconds": max_age,
                "duration_ms": elapsed,
            },
        )
        return {"adapter": "docker", "removed": removed, "max_age_seconds": max_age}


def get_runtime_manager() -> RuntimeManager:
    cfg = get_settings()
    mode = str(cfg.studio_runtime_mode or "").strip().lower()
    if mode == "docker":
        return DockerRuntimeManager()
    if mode == "host":
        return HostRuntimeManager()
    raise RuntimeError(
        f"Invalid studio_runtime_mode={cfg.studio_runtime_mode!r}; expected 'host' or 'docker'"
    )

