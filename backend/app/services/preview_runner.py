"""
App Studio — Full-Stack Preview Runner

Manages child processes that run the generated Next.js applications.
Writes fullstack_files to disk, installs dependencies, and starts
the dev server for live full-stack preview.
"""

import asyncio
import logging
import os
import json
import re
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

from app.monorepo_paths import default_workspace_dir

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# npm / npx binary resolution
# ---------------------------------------------------------------------------
# shutil.which() walks PATH at import time. On AWS App Runner the gunicorn
# process may not inherit /usr/local/bin, so we list explicit fallbacks in
# the order: Dockerfile COPY destination → nvm → system package manager.
_NPM_CANDIDATES = [
    shutil.which("npm"),
    "/usr/local/bin/npm",
    "/usr/bin/npm",
]
_NPX_CANDIDATES = [
    shutil.which("npx"),
    "/usr/local/bin/npx",
    "/usr/bin/npx",
]

def _first_existing(candidates: list) -> str:
    """Return the first candidate that exists on disk, else the last entry."""
    for c in candidates:
        if c and __import__('os').path.isfile(c):
            return c
    # Fall back to bare name so error messages stay readable
    return candidates[-1] or "npm"

_NPM_BIN: str = _first_existing(_NPM_CANDIDATES)
_NPX_BIN: str = _first_existing(_NPX_CANDIDATES)

# Directories to prepend to PATH so node/npm are always resolvable inside
# subprocess environments spawned by gunicorn on App Runner / Linux containers.
_NODE_PATH_DIRS = ["/usr/local/bin", "/usr/bin"]

logger.info("[preview_runner] npm=%s  npx=%s", _NPM_BIN, _NPX_BIN)


def nextjs_file_watch_env_for_studio() -> Dict[str, str]:
    """Env defaults so Next/webpack see file changes in Studio.

    Docker bind mounts (especially macOS/Windows → Linux VM) and some Windows
    host setups do not deliver reliable native fs events to the dev server,
    so edits land on disk but HMR/full reload still serve stale bundles.
    """
    return {
        "WATCHPACK_POLLING": "true",
        "CHOKIDAR_USEPOLLING": "true",
    }


def _apply_nextjs_watch_env(child_env: Dict[str, str], framework: str) -> None:
    if str(framework or "").lower() != "nextjs":
        return
    for k, v in nextjs_file_watch_env_for_studio().items():
        child_env.setdefault(k, v)


# URLs returned to the **browser** (iframe / open-in-tab). Some setups show
# ERR_EMPTY_RESPONSE for ``127.0.0.1`` while ``localhost`` works (often Windows /
# Docker). Others fix ``localhost -> ::1`` with IPv4-only servers using
# ``PREVIEW_BROWSER_HOST=127.0.0.1``. Override explicitly for tunnels, etc.
PREVIEW_BROWSER_HOST = (os.environ.get("PREVIEW_BROWSER_HOST") or "localhost").strip() or "localhost"


def _preview_iframe_url_for_port(port: int) -> str:
    return f"http://{PREVIEW_BROWSER_HOST}:{int(port)}"


def preview_loopback_base(port: int) -> str:
    """Public helper: upstream rootURL for streaming proxy (scheme+host+port, no slash)."""
    return _preview_iframe_url_for_port(int(port)).rstrip("/")


def _normalize_preview_iframe_url(url: str, fallback_port: int) -> str:
    """Use PREVIEW_BROWSER_HOST for loopback URLs so iframes match the bound address."""
    try:
        u = urlparse((url or "").strip())
        if u.scheme not in ("http", "https"):
            return _preview_iframe_url_for_port(fallback_port)
        host = (u.hostname or "").lower()
        if host not in ("localhost", "127.0.0.1", "::1"):
            return url.strip()
        port = u.port if u.port is not None else int(fallback_port)
        netloc = f"{PREVIEW_BROWSER_HOST}:{port}"
        return urlunparse((u.scheme, netloc, u.path, u.params, u.query, u.fragment))
    except Exception:
        return _preview_iframe_url_for_port(fallback_port)

# Workspace root for generated projects
WORKSPACE_ROOT = Path(os.environ.get(
    "PREVIEW_WORKSPACE",
    default_workspace_dir(),
))

# Track running preview servers
_running_previews: Dict[str, Dict[str, Any]] = {}

# Port range for preview servers
_PORT_START = 4000
_PORT_END = 4100

# Windows needs shell=True for npm/npx commands
_IS_WINDOWS = sys.platform == "win32"

# ── Locks (C1: atomic port allocation, C2: per-project file writes) ──────────
_port_lock = asyncio.Lock()
_reserved_ports: set = set()          # ports currently in use or reserved
_project_write_locks: Dict[str, asyncio.Lock] = {}


def _get_project_lock(project_id: str) -> asyncio.Lock:
    if project_id not in _project_write_locks:
        _project_write_locks[project_id] = asyncio.Lock()
    return _project_write_locks[project_id]


async def _reserve_port() -> int:
    """Atomically reserve the next available port in [_PORT_START, _PORT_END).

    C1 fix: replaces the racy read-then-pick pattern with an async lock so
    concurrent launch requests never alias to the same port.
    """
    async with _port_lock:
        used = _reserved_ports | {p["port"] for p in _running_previews.values()}
        for port in range(_PORT_START, _PORT_END):
            if port not in used:
                _reserved_ports.add(port)
                return port
        raise RuntimeError("No available ports for preview server (pool exhausted)")


def _release_port(port: int) -> None:
    _reserved_ports.discard(port)


def _is_preview_pool_port(port: int) -> bool:
    """Only touch ports DocuVerse allocates for previews (avoid killing random apps)."""
    try:
        p = int(port)
    except (TypeError, ValueError):
        return False
    return _PORT_START <= p < _PORT_END


def _kill_listen_pids_on_preview_port_sync(port: int) -> None:
    """Best-effort: terminate processes still LISTEN-ing on ``port``."""
    if not _is_preview_pool_port(port):
        return
    if _IS_WINDOWS:
        script = (
            f"$pidList = @(Get-NetTCPConnection -LocalPort {int(port)} "
            "-State Listen -ErrorAction SilentlyContinue | "
            "Select-Object -ExpandProperty OwningProcess -Unique); "
            "foreach ($x in $pidList) "
            "{ if ($x -gt 0) "
            "{ taskkill /F /T /PID $x 2>$null | Out-Null } }"
        )
        try:
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    script,
                ],
                capture_output=True,
                timeout=30,
                check=False,
            )
        except Exception as e:
            logger.debug("preview port kill (Win): %s", e)
        return

    try:
        subprocess.run(
            ["fuser", "-k", f"{int(port)}/tcp"],
            capture_output=True,
            timeout=15,
            check=False,
        )
    except Exception:
        pass


def vacate_preview_port(port: Optional[int]) -> None:
    """Always release bookkeeping + try to kill listeners (orphan-safe)."""
    if port is None:
        return
    try:
        p = int(port)
    except (TypeError, ValueError):
        return
    _release_port(p)
    try:
        _kill_listen_pids_on_preview_port_sync(p)
    except Exception as e:
        logger.warning("vacate_preview_port kill phase: %s", e)


# ── Port-probe based readiness (C6) ─────────────────────────────────────────

def _port_open(host: str, port: int) -> bool:
    """Return True if the TCP port accepts a connection."""
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


# Keep legacy hint list for log-line augmentation only (not for readiness gating)
_READY_HINTS = (
    "ready", "started", "listening", "localhost", "127.0.0.1",
    "running on", "available at", "server running",
)


def get_project_dir(project_id: str) -> Path:
    """Get the workspace directory for a project."""
    return WORKSPACE_ROOT / project_id


async def write_project_files(
    project_id: str,
    files: Dict[str, str],
    env_config: Optional[Dict[str, str]] = None,
) -> Path:
    """Write all fullstack_files to disk under a per-project async lock (C2 fix).

    Returns the project directory path.
    """
    project_lock = _get_project_lock(project_id)
    async with project_lock:
        return await _write_project_files_locked(project_id, files, env_config)


async def _write_project_files_locked(
    project_id: str,
    files: Dict[str, str],
    env_config: Optional[Dict[str, str]] = None,
) -> Path:
    project_dir = get_project_dir(project_id)

    # Create fresh directory while preserving node_modules cache
    if project_dir.exists():
        node_modules = project_dir / "node_modules"
        has_nm = node_modules.exists()
        nm_backup = None
        if has_nm:
            nm_backup = project_dir.parent / f".nm_{project_id}"
            if nm_backup.exists():
                shutil.rmtree(nm_backup)
            node_modules.rename(nm_backup)

        shutil.rmtree(project_dir)
        project_dir.mkdir(parents=True, exist_ok=True)

        # Restore node_modules
        if nm_backup and nm_backup.exists():
            nm_backup.rename(project_dir / "node_modules")
    else:
        project_dir.mkdir(parents=True, exist_ok=True)

    # Write all files
    for path, content in files.items():
        file_path = project_dir / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")
        logger.debug(f"Wrote: {path}")

    # Override .env with user config
    if env_config:
        env_lines = []
        for key, value in env_config.items():
            if value:
                env_lines.append(f'{key}="{value}"')
        env_path = project_dir / ".env"
        env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    logger.info(f"Wrote {len(files)} files to {project_dir}")
    return project_dir


def _npm_command_error_message(
    returncode: Optional[int],
    stdout: Optional[bytes],
    stderr: Optional[bytes],
) -> str:
    """Build a useful error string. npm often writes failures to stdout on Windows."""
    err_t = (stderr or b"").decode(errors="replace").strip()
    out_t = (stdout or b"").decode(errors="replace").strip()
    rc = returncode if returncode is not None else -1
    lines: list[str] = [f"exit code {rc}"]
    if err_t:
        lines.append(err_t)
    if out_t and out_t != err_t:
        tail = out_t[-8000:] if len(out_t) > 8000 else out_t
        lines.append(f"[npm stdout]\n{tail}")
    if len(lines) == 1:
        lines.append(
            "(no npm output — check that Node.js is installed and on the server PATH)"
        )
    return "\n".join(lines)


def _merge_path_with_node_bin(app_root: Path, env: Dict[str, str]) -> Dict[str, str]:
    """Prepend ``app_root/node_modules/.bin`` so ``next``, ``vite``, etc. resolve
    on Windows/cmd even when PATH handling from nested shells is flaky.
    """
    out = dict(env)
    nm_bin = (app_root / "node_modules" / ".bin").resolve()
    if not nm_bin.is_dir():
        return out
    prefix = str(nm_bin) + os.pathsep
    path_val = str(out.get("PATH", "") or "")
    os_path = os.environ.get("PATH", "") or ""
    if not path_val:
        path_val = os_path
    bin_str = str(nm_bin)
    if path_val.startswith(bin_str + os.pathsep) or path_val == bin_str:
        return out
    out["PATH"] = prefix + path_val
    return out


def _prepend_gopath_bin_to_env(env: Dict[str, str]) -> Dict[str, str]:
    """Ensure ``$(go env GOPATH)/bin`` (default ``~/go/bin``) is on PATH for ``air``, etc."""
    out = dict(env)
    gopath = (os.environ.get("GOPATH") or "").strip()
    if not gopath:
        try:
            home_go = Path.home() / "go"
            if (home_go / "bin").is_dir():
                gopath = str(home_go)
        except Exception:
            gopath = ""
    if not gopath:
        return out
    bin_dir = Path(gopath) / "bin"
    if not bin_dir.is_dir():
        return out
    bd = str(bin_dir)
    p = str(out.get("PATH", "") or "")
    if bd in p:
        return out
    os_path = os.environ.get("PATH", "") or ""
    if not p:
        p = os_path
    out["PATH"] = bd + os.pathsep + p
    return out


def _command_needs_go_toolchain(port_cmd: str) -> bool:
    c = (port_cmd or "").strip().lower()
    return bool(c.startswith("go ") or c == "go" or c.startswith("air") or c == "air")


def _needs_node_dependency_install(app_root: Path, framework: str) -> bool:
    """Whether JS dependencies must be installed before ``npm run dev``.

    Clone-only repos sometimes include an empty ``node_modules`` directory
    so a naive ``exists()`` check wrongly skips ``npm install``, which yields
    Windows errors like ``'next' is not recognized``.
    """
    if framework in ("static", "fastapi", "django", "flask", "go"):
        return False

    pkg_path = app_root / "package.json"
    if not pkg_path.is_file():
        return False

    nm = app_root / "node_modules"
    if not nm.is_dir():
        return True

    bin_dir = nm / ".bin"
    if not bin_dir.is_dir():
        return True
    try:
        if not any(bin_dir.iterdir()):
            return True
    except OSError:
        return True

    fw = (framework or "").strip().lower()
    deps: Dict[str, Any] = {}
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    except Exception:
        pass

    uses_next = fw == "nextjs" or bool(deps.get("next"))
    if uses_next:
        if not (nm / "next" / "package.json").is_file():
            return True
        # Local CLI must exist — this is exactly what npm puts on PATH for scripts.
        if _IS_WINDOWS:
            if not (bin_dir / "next.cmd").is_file() and not (
                bin_dir / "next"
            ).is_file():
                return True
        elif not list(bin_dir.glob("next*")):
            return True

    return False


async def _run_npm_command(
    args: list,
    cwd: str,
    timeout: int = 120,
    env: Optional[dict] = None,
) -> tuple:
    """
    Run an npm/npx command safely on all platforms.

    On Windows, npm is a batch script (.cmd), so we need shell=True
    or the full .cmd path. Using shell=True is simpler and more reliable.

    On Linux/App Runner we enrich PATH so that /usr/local/bin (where the
    Dockerfile COPY places node + npm) is always resolvable by the child
    process even when gunicorn strips it from os.environ.
    """
    cmd_env = {**os.environ, **(env or {})}

    # Ensure node binary directories are on PATH for Linux subprocesses
    if not _IS_WINDOWS:
        existing_path = cmd_env.get("PATH", "")
        extra = ":".join(d for d in _NODE_PATH_DIRS if d not in existing_path)
        if extra:
            cmd_env["PATH"] = extra + (":" + existing_path if existing_path else "")

    try:
        if _IS_WINDOWS:
            # On Windows, use shell=True for npm/npx commands
            cmd_str = " ".join(args)
            proc = await asyncio.create_subprocess_shell(
                cmd_str,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=cmd_env,
            )
        else:
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=cmd_env,
            )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
        return proc.returncode, stdout, stderr

    except asyncio.TimeoutError:
        logger.error(f"Command timed out after {timeout}s: {args}")
        try:
            proc.kill()
        except Exception:
            pass
        return -1, b"", b"Command timed out"

    except asyncio.CancelledError:
        # CancelledError is a BaseException in Python 3.9+ and will
        # crash the server if not caught explicitly.
        logger.warning(f"Command cancelled: {args}")
        try:
            proc.kill()
        except Exception:
            pass
        return -1, b"", b"Command cancelled"

    except Exception as e:
        logger.error(f"Failed to run command {args}: {e}")
        return -1, b"", str(e).encode()


def _trusted_preview_local_url(candidate: str, expected_port: int) -> Optional[str]:
    """Accept only loopback URLs on the allocated dev port.

    Framework logs often advertise docs (nextjs.org, etc.); blindly taking the
    first ``http(s)`` match breaks Studio iframes with "refused to connect".
    """
    raw = (candidate or "").strip().rstrip(".)")
    if not raw:
        return None
    try:
        u = urlparse(raw)
    except ValueError:
        return None
    if u.scheme not in ("http", "https"):
        return None
    host = (u.hostname or "").lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        return None
    if u.port != expected_port:
        return None
    return _normalize_preview_iframe_url(raw, expected_port)


def _trusted_preview_from_log_line(text: str, expected_port: int) -> Optional[str]:
    for m in re.finditer(r"(https?://[^\s,<>\"\']+)", text):
        hit = _trusted_preview_local_url(m.group(1), expected_port)
        if hit:
            return hit
    return None


async def start_preview(
    project_id: str,
    project_dir: Path,
) -> Dict[str, Any]:
    """Install dependencies and start the Next.js dev server.

    C1 fix: uses ``_reserve_port`` (atomic lock) instead of racy ``_next_port``.
    C3 fix: uses ``_kill_process_tree`` for proper child cleanup.
    C6 fix: readiness is determined by TCP port-probing, not string heuristics.

    Returns { port, status, url, pid }.
    """
    await stop_preview(project_id)

    port = await _reserve_port()

    try:
        # Step 1: Install dependencies (missing or incomplete — e.g. empty node_modules/)
        if _needs_node_dependency_install(project_dir, "nextjs"):
            logger.info(f"Installing dependencies for {project_id}...")
            returncode, stdout, stderr = await _run_npm_command(
                [_NPM_BIN, "install", "--no-audit", "--no-fund"],
                cwd=str(project_dir),
                timeout=120,
            )
            if returncode != 0:
                _release_port(port)
                error = _npm_command_error_message(returncode, stdout, stderr)
                logger.error(f"npm install failed for {project_dir}: {error[:2000]}")
                return {
                    "status": "error",
                    "error": f"npm install failed: {error[:1500]}",
                    "port": port,
                }
            logger.info("Dependencies installed")

        # Step 2: Run Prisma push (if schema exists)
        prisma_schema = project_dir / "prisma" / "schema.prisma"
        if prisma_schema.exists():
            try:
                returncode, stdout, stderr = await _run_npm_command(
                    [_NPX_BIN, "prisma", "db", "push", "--skip-generate"],
                    cwd=str(project_dir),
                    timeout=30,
                    env={"DATABASE_URL": "file:./dev.db"},
                )
                if returncode == 0:
                    logger.info("Prisma db push completed")
                else:
                    logger.warning(
                        f"Prisma push returned {returncode}: "
                        f"{stderr.decode(errors='replace') if stderr else 'unknown'}"
                    )
            except Exception as e:
                logger.warning(f"Prisma push failed (non-fatal): {e}")

        try:
            from app.services.studio_iframe_fixups import apply_studio_iframe_fixes

            apply_studio_iframe_fixes(project_dir, "nextjs")
        except Exception as e:
            logger.debug("studio iframe fixups (next preview): %s", e)

        # Step 3: Start dev server
        logger.info(f"Starting Next.js dev server on port {port}...")

        run_env = _merge_path_with_node_bin(project_dir, dict(os.environ))
        _apply_nextjs_watch_env(run_env, "nextjs")

        # Enrich PATH so the dev server child process finds node/npm
        if not _IS_WINDOWS:
            existing_path = run_env.get("PATH", "")
            extra = ":".join(d for d in _NODE_PATH_DIRS if d not in existing_path)
            if extra:
                run_env["PATH"] = extra + (":" + existing_path if existing_path else "")

        if _IS_WINDOWS:
            cmd_str = f"\"{_NPM_BIN}\" run dev -- --hostname 127.0.0.1 --port {port}"
            process = await asyncio.create_subprocess_shell(
                cmd_str,
                cwd=str(project_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=run_env,
            )
        else:
            process = await asyncio.create_subprocess_exec(
                _NPM_BIN, "run", "dev", "--", "--port", str(port),
                cwd=str(project_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=run_env,
                start_new_session=True,   # C3: puts process in its own session for group kill
            )

        # Wait for readiness via TCP port-probe (C6 fix).
        # Also drain stdout so the buffer doesn't stall the process.
        started_at = time.time()
        ready = False
        timeout_s = 60

        async def _drain_logs():
            """Background task: drain stdout so the pipe buffer never fills."""
            try:
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        break
                    logger.debug("dev-server: %s", line.decode(errors="replace").rstrip())
            except Exception:
                pass

        drain_task = asyncio.create_task(_drain_logs())

        while time.time() - started_at < timeout_s:
            rc = process.returncode
            if rc is not None:
                drain_task.cancel()
                _release_port(port)
                logger.error(f"Dev server exited prematurely with code {rc}")
                return {
                    "status": "error",
                    "error": f"dev server exited with code {rc}",
                    "port": port,
                }
            if _port_open("127.0.0.1", port):
                ready = True
                break
            await asyncio.sleep(0.5)

        if not ready:
            drain_task.cancel()

        info = {
            "status": "running" if ready else "starting",
            "port": port,
            "url": _preview_iframe_url_for_port(port),
            "pid": process.pid,
            "started_at": time.time(),
            "project_dir": str(project_dir),
        }

        _running_previews[project_id] = {
            **info,
            "process": process,
        }

        return info

    except asyncio.CancelledError:
        logger.warning(f"start_preview cancelled for {project_id}")
        return {
            "status": "error",
            "error": "Preview launch was cancelled",
            "port": port,
        }

    except Exception as e:
        logger.error(f"start_preview failed for {project_id}: {e}", exc_info=True)
        return {
            "status": "error",
            "error": f"Failed to start preview: {str(e)[:500]}",
            "port": port,
        }


def _kill_process_tree_sync(process: subprocess.Popen) -> None:
    """Kill a Popen process and all its children (C3 fix).

    On Windows ``terminate()`` only kills the parent shell, leaving the Node
    process alive. We use a Job Object wrapper via ``taskkill /F /T`` which
    kills the entire process tree. On POSIX we kill the session group.
    """
    if process.poll() is not None:
        return
    try:
        pid = process.pid
        if _IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                check=False, capture_output=True,
            )
        else:
            import signal
            import os as _os
            try:
                _os.killpg(_os.getpgid(pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    _os.killpg(_os.getpgid(pid), signal.SIGKILL)
                except ProcessLookupError:
                    pass
    except Exception as e:
        logger.warning(f"_kill_process_tree_sync: {e}")


async def _kill_async_process_tree(process: asyncio.subprocess.Process) -> None:
    """Kill an asyncio subprocess and its children (C3 fix)."""
    if process.returncode is not None:
        return
    pid = process.pid
    try:
        if _IS_WINDOWS:
            await asyncio.to_thread(
                lambda: subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    check=False, capture_output=True,
                )
            )
            await asyncio.wait_for(process.wait(), timeout=5)
        else:
            import signal
            import os as _os
            try:
                _os.killpg(_os.getpgid(pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                try:
                    _os.killpg(_os.getpgid(pid), signal.SIGKILL)
                except ProcessLookupError:
                    pass
    except Exception as e:
        logger.warning(f"_kill_async_process_tree: {e}")


async def stop_preview(project_id: str) -> bool:
    """Stop a running preview server and release its port.

    C3 fix: uses process-tree kill instead of single-process terminate.
    After that, best-effort frees the TCP port (handles stray node.exe on Windows).
    """
    info = _running_previews.pop(project_id, None)
    if not info:
        return False

    for t in info.get("stdout_tasks") or []:
        try:
            t.cancel()
        except Exception:
            pass

    port = info.get("port")
    process = info.get("process")
    aux = list(info.get("auxiliary_processes") or [])
    ports = list(info.get("all_ports") or ([] if port is None else [port]))

    stack = []
    if process is not None:
        stack.append(process)
    stack.extend(aux)

    try:
        for proc in stack:
            if proc is None:
                continue
            is_async = isinstance(proc, asyncio.subprocess.Process)
            if is_async:
                await _kill_async_process_tree(proc)
            else:
                await asyncio.to_thread(_kill_process_tree_sync, proc)
    except Exception as e:
        logger.warning(f"Error stopping preview process for {project_id}: {e}")
    finally:
        for p in ports:
            vacate_preview_port(p)

    logger.info(f"Stopped preview for {project_id}")
    return True


def get_preview_status(project_id: str) -> Optional[Dict[str, Any]]:
    """Get the status of a running preview."""
    info = _running_previews.get(project_id)
    if not info:
        return None

    process = info.get("process")
    if process is not None:
        # Asyncio subprocess vs. blocking Popen expose different APIs.
        is_async = isinstance(process, asyncio.subprocess.Process)
        exited = (
            (is_async and process.returncode is not None)
            or (not is_async and process.poll() is not None)
        )
        if exited:
            stale_port = info.get("port")
            all_p = info.get("all_ports")
            _running_previews.pop(project_id, None)
            if isinstance(all_p, list) and all_p:
                for p in all_p:
                    vacate_preview_port(p)
            else:
                vacate_preview_port(stale_port)
            return {"status": "stopped", "port": stale_port}

    out = {
        "status": info.get("status", "unknown"),
        "port": info.get("port"),
        "url": info.get("url"),
        "pid": info.get("pid"),
        "uptime": time.time() - info.get("started_at", time.time()),
    }
    du = info.get("direct_url")
    if isinstance(du, str) and du.strip():
        out["direct_url"] = du.strip()
    return out

async def cleanup_stale_previews(max_age_seconds: int = 1800):
    """Stop previews that have been running too long (default 30 min)."""
    now = time.time()
    stale = [
        pid for pid, info in _running_previews.items()
        if now - info.get("started_at", now) > max_age_seconds
    ]
    for pid in stale:
        await stop_preview(pid)
        logger.info(f"Cleaned up stale preview: {pid}")


# ---------------------------------------------------------------------------
# Generic plan-driven launcher (used by Studio for arbitrary repos)
# ---------------------------------------------------------------------------

# Phrases that indicate a dev server is up. Covers Next, Vite, Nuxt,
# SvelteKit, Astro, Remix, Express defaults, FastAPI/uvicorn, Django.
_READY_HINTS = (
    "ready", "compiled", "started server", "local:", "localhost:",
    "listening", "running on", "uvicorn running", "starting development",
    "watching for", "server started", "listening on",
)


def _split_cmd(cmd: str) -> list:
    import shlex
    try:
        return shlex.split(cmd, posix=not _IS_WINDOWS)
    except Exception:
        return cmd.split()


# First token after ``yarn X`` / ``pnpm X`` when X is not a package-manager builtin.
_PKG_SCRIPT_DENY = frozenset(
    {
        "install",
        "i",
        "add",
        "remove",
        "uninstall",
        "why",
        "list",
        "exec",
        "dlx",
        "publish",
        "init",
        "link",
        "unlink",
        "audit",
        "import",
        "outdated",
        "config",
        "info",
        "cache",
        "dedupe",
        "patch",
        "set",
        "version",
        "global",
        "workspace",
        "workspaces",
        "policies",
    }
)


def _inject_pkg_manager_script_port(cmd: str, port: int) -> Optional[str]:
    """Forward ``--port`` through npm/pnpm/yarn/bun CLI so inner Next/Vite sees it.

    ``npm run dev`` does not contain the substring ``next`` — without this, Studio
    probes e.g. ``127.0.0.1:4000`` while the dev server stays on default ``3000``
    (``PORT`` env is not reliable for ``next dev``), yielding connection refused.
    """
    s = (cmd or "").strip()
    if not s:
        return None
    p = int(port)

    def _npm_like_after_dashes(base: str) -> str:
        if " -- " in base:
            pre, post = base.split(" -- ", 1)
            return f"{pre} -- {post} --port {p}".rstrip()
        return f"{base} -- --port {p}"

    if re.match(r"npm\s+run\s+", s, re.I):
        return _npm_like_after_dashes(s)
    if re.match(r"pnpm\s+run\s+", s, re.I):
        return _npm_like_after_dashes(s)
    if re.match(r"bun\s+run\s+", s, re.I):
        if " -- " in s:
            pre, post = s.split(" -- ", 1)
            return f"{pre} -- {post} --port {p}".rstrip()
        return f"{s} --port {p}"

    m = re.match(r"^pnpm\s+([^\s]+)(\s.*)?$", s, re.I)
    if m:
        sub = m.group(1).lower()
        if sub == "run" or sub in _PKG_SCRIPT_DENY:
            return None
        return _npm_like_after_dashes(s)

    m = re.match(r"^yarn\s+([^\s]+)(\s.*)?$", s, re.I)
    if m:
        sub = m.group(1).lower()
        if sub in _PKG_SCRIPT_DENY:
            return None
        return f"{s} --port {p}".rstrip()

    return None


def _inject_port_into_cmd(cmd: str, port: int) -> str:
    """Best-effort: append a port flag if the dev command doesn't already
    pin one. Frameworks that don't accept the flag will simply ignore it
    (we still detect their port from log output)."""
    bind_addr = "127.0.0.1" if _IS_WINDOWS else "0.0.0.0"
    lower = cmd.lower()
    if any(tok in lower for tok in ("--port", "-p ", " p=", "port=")):
        return cmd
    via_pkg = _inject_pkg_manager_script_port(cmd, port)
    if via_pkg is not None:
        return via_pkg
    if "next" in lower or "vite" in lower or "nuxt" in lower or "astro" in lower or "remix" in lower:
        patched = cmd
        if _IS_WINDOWS and "vite" in lower and "--host" not in lower:
            patched = f"{patched} --host 127.0.0.1"
        if _IS_WINDOWS and "next" in lower and "--hostname" not in lower:
            patched = f"{patched} --hostname 127.0.0.1"
        return f"{patched} --port {port}"
    if "uvicorn" in lower or "gunicorn" in lower:
        if "uvicorn" in lower:
            return (
                f"{cmd} --port {port} --host {bind_addr}"
                if "--host" not in lower
                else f"{cmd} --port {port}"
            )
        return f"{cmd} --bind {bind_addr}:{port}"
    if "manage.py runserver" in lower:
        # Django: replace any address/port arg
        return f"python manage.py runserver {bind_addr}:{port}"
    # Flask CLI (``python -m flask ... run``)
    if "flask" in lower and "run" in lower:
        patched = cmd
        if "--port" not in lower and " -p" not in lower:
            patched = f"{patched} --port {port}"
        if "--host" not in lower:
            patched = f"{patched} --host {bind_addr}"
        return patched.strip()
    if "serve" in lower:
        return f"{cmd} -l {port}"
    return cmd


def _run_shell_blocking(
    cmd: str,
    cwd: str,
    timeout: int,
    env: Optional[dict] = None,
) -> tuple:
    """Synchronous fallback that uses :mod:`subprocess` directly.

    Used when ``asyncio.create_subprocess_shell`` raises
    ``NotImplementedError`` (Windows + SelectorEventLoop). Always returns
    ``(returncode, stdout_bytes, stderr_bytes)`` and never raises.
    """
    cmd_env = {**os.environ, **(env or {})}
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            env=cmd_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
        return proc.returncode, proc.stdout or b"", proc.stderr or b""
    except subprocess.TimeoutExpired:
        return -1, b"", b"Command timed out"
    except FileNotFoundError as e:
        return -1, b"", f"FileNotFoundError: {e}".encode()
    except Exception as e:
        return -1, b"", f"{type(e).__name__}: {e!s}".strip().encode() or repr(e).encode()


async def _run_shell(
    cmd: str,
    cwd: str,
    timeout: int,
    env: Optional[dict] = None,
) -> tuple:
    """Run a shell command and capture output.

    Returns ``(returncode, stdout_bytes, stderr_bytes)``. Never raises;
    failures are encoded into the tuple so callers can surface them.

    First tries the async pipeline (cheap, allows the event loop to keep
    serving other requests). If asyncio subprocess is unavailable on the
    current loop (Windows + SelectorEventLoop), falls back transparently
    to a synchronous ``subprocess.run`` executed in a worker thread.
    """
    cmd_env = {**os.environ, **(env or {})}
    proc = None

    # Sanity check the cwd before spawning. ``cmd.exe`` on Windows turns a
    # missing cwd into a totally silent failure (returncode != 0, empty
    # streams) which produces "no output captured" upstream.
    if not cwd or not os.path.isdir(cwd):
        msg = f"cwd does not exist or is not a directory: {cwd!r}"
        logger.error(f"_run_shell: {msg}")
        return -1, b"", msg.encode()

    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=cmd_env,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
        return proc.returncode, stdout, stderr
    except asyncio.TimeoutError:
        if proc is not None:
            try:
                proc.kill()
            except Exception:
                pass
        return -1, b"", b"Command timed out"
    except NotImplementedError:
        # Windows + SelectorEventLoop: async subprocess unsupported.
        # Transparent fallback to a synchronous run in a worker thread so
        # the install/launch can still proceed. Slightly less responsive
        # but functionally identical for our purposes.
        logger.warning(
            "_run_shell: asyncio subprocess unsupported on this event "
            "loop, falling back to threaded subprocess.run"
        )
        try:
            return await asyncio.to_thread(
                _run_shell_blocking, cmd, cwd, timeout, env
            )
        except Exception as e:
            msg = f"threaded subprocess fallback failed: {type(e).__name__}: {e!s}"
            logger.error(msg, exc_info=True)
            return -1, b"", msg.encode()
    except FileNotFoundError as e:
        msg = (
            f"Shell could not start the command. cwd={cwd!r}. "
            f"Original: {type(e).__name__}: {e}"
        )
        logger.error(f"_run_shell FileNotFoundError: {msg}")
        return -1, b"", msg.encode()
    except Exception as e:
        # Always include the exception type — bare str(e) was returning
        # empty strings for some Windows OSError instances, producing the
        # confusing "no output captured" message upstream.
        msg = f"{type(e).__name__}: {e!s}".strip() or repr(e)
        logger.error(f"_run_shell unhandled exception: {msg}", exc_info=True)
        return -1, b"", msg.encode()


def _looks_like_command_not_found(stdout: str, stderr: str) -> bool:
    """Detect that the package manager binary isn't installed."""
    blob = (stdout + "\n" + stderr).lower()
    return any(s in blob for s in (
        "is not recognized as an internal or external command",  # cmd.exe
        "command not found",                                       # bash
        "no such file or directory",
        "not found",
    ))


def _looks_like_missing_requirements_file(stdout: str, stderr: str) -> bool:
    """pip failed because requirements.txt is missing — not 'pip missing from PATH'."""
    blob = (stdout + "\n" + stderr).lower()
    return "could not open requirements file" in blob or (
        "requirements.txt" in blob and "no such file" in blob
    )


def _normalize_install_cmd(cmd: str) -> str:
    """Strip flags modern package managers reject (Yarn 2+ exits on ``--ignore-engines``, YN0050)."""
    s = (cmd or "").strip()
    if not s or "--ignore-engines" not in s:
        return s
    return re.sub(r"\s*--ignore-engines\b", "", s).strip()


async def _install_with_fallback(
    install_cmd: str,
    cwd: str,
    timeout: int = 600,
) -> tuple:
    """Run install and, if the package manager binary is missing on this
    machine (or the command failed to even start), transparently fall back
    to ``npm install``.

    Returns ``(rc, combined_output_str, used_cmd)``.
    """
    install_cmd = _normalize_install_cmd(install_cmd or "")
    rc, out, err = await _run_shell(install_cmd, cwd=cwd, timeout=timeout)
    out_s = (out or b"").decode(errors="replace")
    err_s = (err or b"").decode(errors="replace")
    combined = ((out_s + "\n" + err_s).strip()) or f"(rc={rc}, no output captured)"

    # Fall back to npm if (a) the binary couldn't be found, or (b) the
    # process never produced any output and exited abnormally — that
    # almost always indicates a missing executable on Windows.
    ic = (install_cmd or "").strip()
    should_fallback = (
        rc != 0
        and not ic.startswith("npm ")
        and not ic.startswith("go ")
        and (
            _looks_like_command_not_found(out_s, err_s)
            or (rc < 0 and not out_s and not err_s)
        )
    )

    # Don't run npm in the same (possibly wrong) directory when pip ran but
    # requirements.txt simply isn't there — that hides the real problem.
    if should_fallback and _looks_like_missing_requirements_file(out_s, err_s):
        return rc, combined, install_cmd

    if should_fallback:
        logger.warning(
            f"Primary install command failed (`{install_cmd}` rc={rc}), "
            f"falling back to npm install"
        )
        fallback = "npm install --no-audit --no-fund"
        rc2, out2, err2 = await _run_shell(fallback, cwd=cwd, timeout=timeout)
        out2_s = (out2 or b"").decode(errors="replace")
        err2_s = (err2 or b"").decode(errors="replace")
        combined = (
            f"[primary cmd `{install_cmd}` failed rc={rc}]\n{combined}\n\n"
            f"[fallback cmd `{fallback}` rc={rc2}]\n"
            f"{((out2_s + chr(10) + err2_s).strip()) or '(no output captured)'}"
        )
        return rc2, combined, fallback

    return rc, combined, install_cmd


def _which_first(*candidates: str) -> Optional[str]:
    """Return the first executable found in PATH from the given candidates."""
    import shutil as _sh
    for c in candidates:
        found = _sh.which(c)
        if found:
            return found
    return None


# Match Unix-style "KEY=value KEY2=value2 actual command ..." prefixes.
# Captures one assignment at a time so we can iterate.
_ENV_PREFIX_RE = re.compile(
    r'^\s*([A-Z_][A-Z0-9_]*)=("[^"]*"|\'[^\']*\'|\S+)\s+(.+)$'
)

# Detect "npm run X", "pnpm run X", "yarn run X", "pnpm X", "yarn X",
# "bun run X". Captures the script name.
_NPM_RUN_RE = re.compile(
    r'^\s*(npm|pnpm|yarn|bun)\s+(?:run\s+)?([A-Za-z0-9_:-]+)(?:\s+(.*))?$'
)


def _strip_unix_env_prefix(script: str) -> Tuple[Dict[str, str], str]:
    """Pull leading ``KEY=value KEY=value`` assignments off a command.

    Works for the common cross-platform pitfall in npm scripts on
    Windows. Returns ``(env_dict, remaining_command)``.
    """
    env: Dict[str, str] = {}
    rest = script.strip()
    while True:
        m = _ENV_PREFIX_RE.match(rest)
        if not m:
            break
        key = m.group(1)
        val = m.group(2)
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        env[key] = val
        rest = m.group(3)
    return env, rest


def _resolve_npm_script_for_windows(
    app_root: Path,
    dev_cmd: str,
) -> Optional[Tuple[Dict[str, str], str]]:
    """When ``dev_cmd`` is an npm/pnpm/yarn/bun script invocation and we're
    on Windows, look inside ``package.json`` for the underlying command.
    If it has a Unix-style env-var prefix (``NODE_ENV=development ...``),
    return the extracted env vars + a rewritten command we can execute
    directly via ``cmd.exe``.

    Returns ``None`` when no transformation is possible / needed.
    """
    if not _IS_WINDOWS:
        return None
    m = _NPM_RUN_RE.match(dev_cmd)
    if not m:
        return None
    script_name = m.group(2)
    extra_args = (m.group(3) or "").strip()

    pkg_path = app_root / "package.json"
    if not pkg_path.is_file():
        return None
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    script = (pkg.get("scripts") or {}).get(script_name)
    if not script or not isinstance(script, str):
        return None

    # Skip transformation if the script uses chained commands that we
    # can't safely rewrite (`&&`, `||`, `;`, `|`). cmd.exe handles those
    # operators differently and we'd risk corrupting the script.
    if any(tok in script for tok in ("&&", "||", " ; ")):
        return None

    extra_env, remaining = _strip_unix_env_prefix(script)
    if not extra_env:
        return None
    if not remaining:
        return None

    # Make node_modules/.bin available so plain "tsx", "vite", etc. run
    # without requiring a global install.
    nm_bin = (app_root / "node_modules" / ".bin").resolve()
    new_path = (
        f"{nm_bin}{os.pathsep}{os.environ.get('PATH', '')}"
        if nm_bin.is_dir()
        else os.environ.get("PATH", "")
    )

    final_cmd = remaining
    if extra_args:
        final_cmd = f"{remaining} {extra_args}"

    return {"PATH": new_path, **extra_env}, final_cmd


def plan_preview_proxy_default(plan_dict: Dict[str, Any]) -> bool:
    """Whether to prefer the authenticated HTTP proxy for iframe URLs."""
    explicit = plan_dict.get("preview_use_proxy")
    if explicit is True:
        return True
    if explicit is False:
        return False
    fw = (plan_dict.get("framework") or "unknown").strip().lower()
    if fw in (
        "nextjs", "vite", "remix", "nuxt", "sveltekit", "astro", "node-server", "unknown",
    ):
        return False
    if fw in ("fastapi", "django", "flask", "go"):
        return True
    if fw == "static":
        return True
    return False


def compose_studio_iframe_url(
    *,
    session_id: str,
    proxy_public_base: Optional[str],
    proxy_enabled_globally: bool,
    plan_dict: Dict[str, Any],
    direct_url: str,
) -> Tuple[str, bool]:
    """Return (url_for_iframe, proxy_active)."""
    use = bool(
        proxy_public_base
        and proxy_enabled_globally
        and plan_preview_proxy_default(plan_dict)
    )
    if not use:
        return direct_url, False
    base = proxy_public_base.strip().rstrip("/")
    iframe = f"{base}/api/studio/sessions/{session_id}/preview/"
    return iframe, True


def _guess_node_framework_for_dir(sub: Path) -> str:
    pj = sub / "package.json"
    if not pj.is_file():
        return "vite"
    try:
        pkg = json.loads(pj.read_text(encoding="utf-8"))
    except Exception:
        return "vite"
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    if deps.get("next"):
        return "nextjs"
    if deps.get("@remix-run/dev") or deps.get("remix"):
        return "remix"
    if deps.get("nuxt"):
        return "nuxt"
    if deps.get("@sveltejs/kit"):
        return "sveltekit"
    if deps.get("astro"):
        return "astro"
    return "vite"


async def _install_python_subdir(sub: Path, session_id: str) -> Optional[str]:
    """Ensure ``.venv`` + requirements in ``sub``. Returns error string or None."""
    if not sub.is_dir():
        return f"missing directory {sub}"
    req = sub / "requirements.txt"
    ppt = sub / "pyproject.toml"
    if not req.is_file() and not ppt.is_file():
        return None
    vm = sub / ".venv"
    py_exec = vm / ("Scripts" if _IS_WINDOWS else "bin") / ("python.exe" if _IS_WINDOWS else "python")
    try:
        if not py_exec.is_file():
            logger.info(f"[studio:{session_id}] creating venv under {sub}")
            rc, _, err = await _run_shell(
                f'"{sys.executable}" -m venv .venv',
                cwd=str(sub),
                timeout=120,
            )
            if rc != 0:
                return (err or b"").decode(errors="replace")[-1500:] or f"venv rc={rc}"
        if req.is_file():
            cmd = f'"{py_exec}" -m pip install -r requirements.txt'
        else:
            cmd = f'"{py_exec}" -m pip install .'
        rc, out, err = await _run_shell(cmd, cwd=str(sub), timeout=600)
        blob = ((out or b"") + (err or b"")).decode(errors="replace")
        if rc != 0:
            return blob[-2000:] or f"pip rc={rc}"
    except Exception as e:
        return f"python install failed: {e}"
    return None


async def _install_go_subdir(sub: Path, session_id: str) -> Optional[str]:
    """Run ``go mod download`` when ``go.mod`` is present."""
    if not (sub / "go.mod").is_file():
        return None
    logger.info("[studio:%s] go mod download in %s", session_id, sub)
    try:
        rc, out, err = await _run_shell("go mod download", cwd=str(sub), timeout=600)
        blob = ((out or b"") + (err or b"")).decode(errors="replace")
        if rc != 0:
            tail = blob[-2000:] if blob else "(no output)"
            return f"go mod download rc={rc}: {tail}"
    except Exception as e:
        return f"go mod download failed: {e}"
    return None


async def _npm_install_subdir(
    session_id: str,
    sub: Path,
    fw_guess: str,
    docker_install: bool,
) -> Optional[str]:
    if not _needs_node_dependency_install(sub, fw_guess):
        return None
    try:
        from app.config import get_settings
        from app.services import studio_docker_install as sdi

        if docker_install or get_settings().studio_preview_docker_install:
            if sdi.docker_cli_available():
                rc, tail = await asyncio.to_thread(
                    sdi.npm_install_via_docker, sub.resolve()
                )
                if rc != 0:
                    return f"docker npm install failed rc={rc}: {tail[-1800:]}"
                return None
    except Exception:
        pass
    rc, combined, used = await _install_with_fallback(
        "npm install --no-audit --no-fund",
        cwd=str(sub),
        timeout=600,
    )
    if rc != 0:
        return f"`{used}` exit {rc}: {combined[-2000:]}"
    return None


async def _install_split_workspace_deps(
    session_id: str,
    project_dir: Path,
    preview_processes: List[Dict[str, Any]],
    install_cmd_root: str,
    docker_install: bool,
) -> Optional[Dict[str, Any]]:
    ic = (install_cmd_root or "").strip()
    if ic:
        logger.info(f"[studio:{session_id}] split root install: {ic}")
        rc, combined, used = await _install_with_fallback(ic, cwd=str(project_dir), timeout=900)
        if rc != 0:
            return {"status": "error", "error": f"install failed (`{used}`): {combined[-2000:]}"}

    seen_dirs: set[str] = set()
    for pspec in preview_processes:
        rel = str(pspec.get("cwd_rel") or ".").replace("\\", "/")
        if rel in seen_dirs:
            continue
        seen_dirs.add(rel)
        sub = (project_dir / rel).resolve()
        if not sub.is_dir():
            return {"status": "error", "error": f"split cwd_rel missing: {rel}"}
        py_err = await _install_python_subdir(sub, session_id)
        if py_err:
            return {"status": "error", "error": f"python deps ({rel}): {py_err}"}
        go_err = await _install_go_subdir(sub, session_id)
        if go_err:
            return {"status": "error", "error": f"go deps ({rel}): {go_err}"}
        fw_guess = _guess_node_framework_for_dir(sub)
        nm_err = await _npm_install_subdir(session_id, sub, fw_guess, docker_install)
        if nm_err:
            return {"status": "error", "error": f"node deps ({rel}): {nm_err}"}
    return None


async def _start_multi_process_preview(
    session_id: str,
    project_dir: Path,
    plan: Dict[str, Any],
    env_config: Optional[Dict[str, str]],
    *,
    proxy_public_base: Optional[str],
    studio_proxy_enabled: bool,
    docker_install: bool,
) -> Dict[str, Any]:
    raw = plan.get("preview_processes")
    preview_processes = [dict(x) for x in (raw or []) if isinstance(x, dict)]
    if not preview_processes:
        return {"status": "error", "error": "empty preview_processes"}
    prim = [p for p in preview_processes if p.get("primary")]
    if len(prim) != 1:
        return {
            "status": "error",
            "error": "Bootstrap preview_processes requires exactly one entry with primary: true.",
            "port": None,
        }

    ordered = sorted(
        preview_processes,
        key=lambda p: 1 if bool(p.get("primary")) else 0,
    )

    needs_node = any(
        (project_dir / (str(p.get("cwd_rel") or ".")) / "package.json").is_file()
        for p in ordered
    )
    needs_go = any(
        (project_dir / (str(p.get("cwd_rel") or ".")) / "go.mod").is_file()
        for p in ordered
    )
    if needs_node and not _which_first(
        "npm", "npm.cmd", "pnpm", "pnpm.cmd", "yarn", "yarn.cmd", "bun", "bun.exe"
    ):
        return {
            "status": "error",
            "error": "No Node package manager on PATH (required for this split preview).",
            "port": None,
        }
    if needs_go and not _which_first("go", "go.exe"):
        return {
            "status": "error",
            "error": (
                "Go toolchain not found on PATH. Install Go and restart the DocuVerse backend."
            ),
            "port": None,
        }

    ports: List[int] = []
    try:
        for _ in ordered:
            ports.append(await _reserve_port())
    except Exception as e:
        for p in ports:
            vacate_preview_port(p)
        return {"status": "error", "error": str(e)[:500], "port": None}

    inst_err = await _install_split_workspace_deps(
        session_id,
        project_dir,
        preview_processes,
        (plan.get("install_cmd") or "") or "",
        docker_install,
    )
    if inst_err:
        for p in ports:
            vacate_preview_port(p)
        return {**inst_err, "port": ports[0] if ports else None}

    try:
        from app.services.studio_iframe_fixups import apply_studio_iframe_fixes

        primary_pspec = next(p for p in ordered if p.get("primary"))
        primary_root = (project_dir / (primary_pspec.get("cwd_rel") or ".")).resolve()
        apply_studio_iframe_fixes(primary_root, str(plan.get("framework") or "vite"))
    except Exception:
        pass

    backend_ports = [ports[i] for i, p in enumerate(ordered) if not p.get("primary")]
    api_origin = _preview_iframe_url_for_port(backend_ports[0]) if backend_ports else None

    spawned: List[Any] = []
    stdout_tasks: List[asyncio.Task] = []
    output_buffer: List[str] = []

    async def _drain(idx: int, p: Any, asp: bool) -> None:
        while True:
            try:
                if asp:
                    if p.returncode is not None:
                        return
                    line = await asyncio.wait_for(p.stdout.readline(), timeout=2)
                else:
                    if p.poll() is not None:
                        return
                    line = await asyncio.to_thread(p.stdout.readline)
                if line:
                    t = line.decode(errors="replace").rstrip()
                    output_buffer.append(t)
                    logger.debug(f"[studio:{session_id}][{idx}] {t}")
                else:
                    await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                return
            except asyncio.TimeoutError:
                await asyncio.sleep(0)
                continue
            except Exception:
                await asyncio.sleep(0.05)
                continue
    try:
        for i, pspec in enumerate(ordered):
            cwd_path = (project_dir / (pspec.get("cwd_rel") or ".")).resolve()
            port = ports[i]
            dev_raw = str(pspec.get("cmd") or "").strip()
            if not dev_raw:
                raise RuntimeError(f"preview_process[{i}] has empty cmd")

            cfg = {k: v for k, v in (env_config or {}).items() if v}
            child_env: Dict[str, str] = dict(cfg)
            pe_var = str(pspec.get("port_env") or "PORT")
            child_env[pe_var] = str(port)
            child_env.setdefault("PORT", str(port))
            if _IS_WINDOWS:
                child_env.setdefault("HOST", "127.0.0.1")
                child_env.setdefault("HOSTNAME", "127.0.0.1")
                child_env.setdefault("LISTEN_HOST", "127.0.0.1")

            if bool(pspec.get("primary")) and api_origin:
                for k in (
                    "NEXT_PUBLIC_API_URL",
                    "VITE_API_URL",
                    "REACT_APP_API_URL",
                    "PUBLIC_API_URL",
                ):
                    child_env.setdefault(k, api_origin)

            rewrite = _resolve_npm_script_for_windows(cwd_path, dev_raw)
            if rewrite is not None:
                extracted_env, rewritten_cmd = rewrite
                child_env.update(extracted_env)
                port_cmd = _inject_port_into_cmd(rewritten_cmd, port)
            else:
                port_cmd = _inject_port_into_cmd(dev_raw, port)

            _apply_nextjs_watch_env(child_env, str(plan.get("framework") or ""))

            logger.info("[studio:%s] multi[%s] cwd=%s: %s", session_id, i, cwd_path, port_cmd)
            spawn_env = _merge_path_with_node_bin(cwd_path, {**os.environ, **child_env})
            if _command_needs_go_toolchain(port_cmd):
                spawn_env = _prepend_gopath_bin_to_env(spawn_env)
            async_sup = True
            try:
                proc = await asyncio.create_subprocess_shell(
                    port_cmd,
                    cwd=str(cwd_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    env=spawn_env,
                )
            except NotImplementedError:
                async_sup = False
                proc = subprocess.Popen(
                    port_cmd,
                    shell=True,
                    cwd=str(cwd_path),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    env=spawn_env,
                    bufsize=1,
                    universal_newlines=False,
                )

            spawned.append(proc)
            stdout_tasks.append(asyncio.create_task(_drain(i, proc, async_sup)))

            deadline = time.time() + 90
            ready = False
            while time.time() < deadline:
                rc_now = proc.returncode if async_sup else proc.poll()
                if rc_now is not None:
                    raise RuntimeError(f"preview_process[{i}] exited rc={rc_now}")
                if _port_open("127.0.0.1", port):
                    ready = True
                    break
                await asyncio.sleep(0.35)
            if not ready:
                raise RuntimeError(f"preview_process[{i}] port {port} timeout")

        primary_i = next(i for i, p in enumerate(ordered) if p.get("primary"))
        primary_port = ports[primary_i]
        detected_url: Optional[str] = None
        for line in reversed(output_buffer[-120:]):
            hit = _trusted_preview_from_log_line(line, primary_port)
            if hit:
                detected_url = hit
                break
        direct_url = _normalize_preview_iframe_url(
            detected_url or _preview_iframe_url_for_port(primary_port),
            primary_port,
        )
        iframe_url, proxied = compose_studio_iframe_url(
            session_id=session_id,
            proxy_public_base=proxy_public_base,
            plan_dict=dict(plan),
            proxy_enabled_globally=studio_proxy_enabled,
            direct_url=direct_url,
        )

        primary_proc = spawned[primary_i]
        aux_procs = [spawned[j] for j in range(len(spawned)) if j != primary_i]

        info = {
            "status": "running",
            "port": primary_port,
            "url": iframe_url,
            "direct_url": direct_url,
            "proxy_surface": proxied,
            "pid": getattr(primary_proc, "pid", None),
            "started_at": time.time(),
            "project_dir": str(project_dir.resolve()),
            "framework": plan.get("framework"),
            "all_ports": ports,
            "auxiliary_processes": aux_procs,
            "process": primary_proc,
            "stdout_tasks": stdout_tasks,
        }
        _running_previews[session_id] = info
        return {
            "status": "running",
            "port": primary_port,
            "url": iframe_url,
            "direct_url": direct_url,
            "proxy_surface": proxied,
            "pid": info["pid"],
            "started_at": info["started_at"],
        }

    except Exception as e:
        for t in stdout_tasks:
            try:
                t.cancel()
            except Exception:
                pass
        for proc in spawned:
            try:
                if isinstance(proc, asyncio.subprocess.Process):
                    await _kill_async_process_tree(proc)
                elif proc:
                    await asyncio.to_thread(_kill_process_tree_sync, proc)
            except Exception:
                pass
        for p in ports:
            vacate_preview_port(p)
        logger.error("[studio:%s] multi-preview failed: %s", session_id, e, exc_info=True)
        return {
            "status": "error",
            "error": str(e)[:1200],
            "port": ports[0] if ports else None,
            "preview_log_tail": "\n".join(output_buffer[-30:]),
        }


async def start_preview_with_plan(
    session_id: str,
    project_dir: Path | str,
    plan: Dict[str, Any],
    env_config: Optional[Dict[str, str]] = None,
    *,
    proxy_public_base: Optional[str] = None,
    studio_proxy_enabled: bool = True,
    docker_install: bool = False,
) -> Dict[str, Any]:
    """Launch a preview for an arbitrary repo using a BootstrapPlan.

    The plan provides ``install_cmd``, ``dev_cmd``, ``app_root_rel``,
    ``framework``, ``ports_hint``. ``session_id`` is used as the unique
    handle in ``_running_previews`` (decoupled from builder project ids,
    so generated apps and Studio sessions can coexist).
    """
    await stop_preview(session_id)

    project_dir = Path(project_dir)
    raw_pp = plan.get("preview_processes")
    preview_processes = (
        [dict(x) for x in raw_pp if isinstance(x, dict)]
        if isinstance(raw_pp, list)
        else []
    )
    if preview_processes:
        return await _start_multi_process_preview(
            session_id,
            project_dir.resolve(),
            plan,
            env_config,
            proxy_public_base=proxy_public_base,
            studio_proxy_enabled=studio_proxy_enabled,
            docker_install=docker_install,
        )

    app_root = project_dir
    rel = (plan or {}).get("app_root_rel", ".")
    if rel and rel != ".":
        candidate = project_dir / rel
        if candidate.exists():
            app_root = candidate

    port = await _reserve_port()
    framework = (plan or {}).get("framework", "unknown")
    install_cmd = (plan or {}).get("install_cmd", "") or ""
    dev_cmd = (plan or {}).get("dev_cmd", "") or ""

    if not dev_cmd:
        return {
            "status": "error",
            "error": (
                "No dev command in BootstrapPlan. Re-run framework "
                "detection or configure manually."
            ),
            "port": port,
        }

    # Preflight: Node-based previews need npm/pnpm/yarn/bun on PATH.
    if framework not in ("static", "fastapi", "django", "flask", "go"):
        if not _which_first(
            "npm",
            "npm.cmd",
            "pnpm",
            "pnpm.cmd",
            "yarn",
            "yarn.cmd",
            "bun",
            "bun.exe",
        ):
            return {
                "status": "error",
                "error": (
                    "No Node package manager found on PATH (npm/pnpm/yarn/bun). "
                    "Install Node.js (https://nodejs.org) and restart the backend "
                    "so the new PATH is picked up."
                ),
                "port": port,
            }

    if framework == "go" and not _which_first("go", "go.exe"):
        return {
            "status": "error",
            "error": (
                "Go toolchain not found on PATH. Install Go (https://go.dev/dl/) "
                "and restart the DocuVerse backend."
            ),
            "port": port,
        }

    try:
        # ── Step 1: install (only if a marker is missing) ────────────────
        venv_marker = app_root / ".venv"
        needs_js_install = (
            framework not in ("static", "fastapi", "django", "flask", "go")
            and _needs_node_dependency_install(app_root, framework)
        )
        needs_py_install = (
            framework in ("fastapi", "django", "flask")
            and not venv_marker.exists()
        )
        needs_go_install = framework == "go" and (app_root / "go.mod").is_file()

        needs_install = needs_js_install or needs_py_install or needs_go_install

        install_cmd_eff = (install_cmd or "").strip()
        if needs_js_install and not install_cmd_eff:
            install_cmd_eff = "npm install --no-audit --no-fund"
        elif needs_go_install and not install_cmd_eff:
            install_cmd_eff = "go mod download"

        if needs_install:
            logger.info(
                f"[studio:{session_id}] Installing deps in {app_root}: {install_cmd_eff}"
            )
            if not install_cmd_eff:
                _release_port(port)
                return {
                    "status": "error",
                    "error": (
                        "Dependencies are missing but BootstrapPlan.install_cmd "
                        "is empty. Re-run framework detection."
                    ),
                    "port": port,
                }

            used_docker_install = False
            if needs_js_install:
                try:
                    from app.config import get_settings as _gs
                    from app.services import studio_docker_install as sdi

                    if docker_install or _gs().studio_preview_docker_install:
                        if sdi.docker_cli_available():
                            rc_d, tail_d = await asyncio.to_thread(
                                sdi.npm_install_via_docker,
                                app_root.resolve(),
                            )
                            if rc_d != 0:
                                logger.warning(
                                    "[studio:%s] docker npm failed rc=%s; host fallback: %s",
                                    session_id,
                                    rc_d,
                                    tail_d[:500],
                                )
                            else:
                                used_docker_install = True
                                logger.info(
                                    "[studio:%s] npm install completed inside Docker",
                                    session_id,
                                )
                except Exception as e:
                    logger.debug("[studio:%s] docker install skipped: %s", session_id, e)

            skip_host_install = bool(needs_js_install and used_docker_install)

            if not skip_host_install:
                rc, combined_output, used_cmd = await _install_with_fallback(
                    install_cmd_eff, cwd=str(app_root), timeout=600,
                )
                if rc != 0:
                    tail = combined_output[-1500:] if combined_output else "(no output captured)"
                    logger.error(
                        f"[studio:{session_id}] install failed (cmd=`{used_cmd}` rc={rc}):\n{tail}"
                    )
                    return {
                        "status": "error",
                        "error": (
                            f"install failed (`{used_cmd}` exit {rc}): {tail}"
                        ),
                        "port": port,
                    }
                logger.info(f"[studio:{session_id}] install succeeded via `{used_cmd}`")

        # ── Step 2: framework-specific best-effort prep ──────────────────
        if framework == "nextjs":
            prisma_schema = app_root / "prisma" / "schema.prisma"
            if prisma_schema.exists():
                try:
                    await _run_shell(
                        "npx prisma db push --skip-generate",
                        cwd=str(app_root),
                        timeout=60,
                        env={"DATABASE_URL": (env_config or {}).get(
                            "DATABASE_URL", "file:./dev.db")},
                    )
                except Exception as e:
                    logger.warning(f"[studio:{session_id}] prisma push: {e}")

        if framework == "flask":
            try:
                from app.services.flask_repo_fixups import (
                    patch_flask_root_index_template_folder,
                )

                patch_flask_root_index_template_folder(app_root)
            except Exception as e:
                logger.warning(
                    "[studio:%s] Flask template fixup skipped: %s",
                    session_id,
                    e,
                )

        try:
            from app.services.studio_iframe_fixups import apply_studio_iframe_fixes

            apply_studio_iframe_fixes(app_root, framework)
        except Exception as e:
            logger.debug("[studio:%s] iframe fixups: %s", session_id, e)

        # ── Step 3: build the dev command with our port ──────────────────
        # Provide env config to the child process
        child_env: Dict[str, str] = {}
        if env_config:
            child_env.update({k: v for k, v in env_config.items() if v})
        # Some frameworks read PORT
        child_env.setdefault("PORT", str(port))
        # Windows: binding 0.0.0.0 can raise ENOTSUP in some setups; Studio
        # only needs loopback (readiness probe uses 127.0.0.1). Many servers
        # honor HOST / LISTEN_HOST when choosing the listen address.
        if _IS_WINDOWS:
            child_env.setdefault("HOST", "127.0.0.1")
            child_env.setdefault("HOSTNAME", "127.0.0.1")
            child_env.setdefault("LISTEN_HOST", "127.0.0.1")

        # Windows fixup: if `npm run <script>` resolves to a Unix-style
        # `KEY=value cmd ...` script, cmd.exe will choke on the inline env
        # assignment. Rewrite it so we run the underlying command directly
        # with the env vars set in the child environment instead.
        rewrite = _resolve_npm_script_for_windows(app_root, dev_cmd)
        if rewrite is not None:
            extracted_env, rewritten_cmd = rewrite
            child_env.update(extracted_env)
            logger.info(
                f"[studio:{session_id}] Windows fixup: rewriting "
                f"`{dev_cmd}` -> `{rewritten_cmd}` with env "
                f"{ {k: v for k, v in extracted_env.items() if k != 'PATH'} }"
            )
            port_cmd = rewritten_cmd
        else:
            port_cmd = _inject_port_into_cmd(dev_cmd, port)
        logger.info(f"[studio:{session_id}] Launching: {port_cmd}")

        _apply_nextjs_watch_env(child_env, framework)
        spawn_env = _merge_path_with_node_bin(app_root, {**os.environ, **child_env})
        if framework == "go" or _command_needs_go_toolchain(port_cmd):
            spawn_env = _prepend_gopath_bin_to_env(spawn_env)

        async_subprocess_supported = True
        try:
            process = await asyncio.create_subprocess_shell(
                port_cmd,
                cwd=str(app_root),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=spawn_env,
            )
        except NotImplementedError:
            async_subprocess_supported = False
            logger.warning(
                f"[studio:{session_id}] asyncio subprocess unsupported, "
                f"launching dev server via blocking subprocess.Popen"
            )
            # Merge stderr into stdout in this path so the single readline
            # loop sees both streams (Popen.stderr can't be read non-
            # blockingly in the same thread without picking favourites).
            process = subprocess.Popen(
                port_cmd,
                shell=True,
                cwd=str(app_root),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=spawn_env,
                bufsize=1,
                universal_newlines=False,
            )

        # ── Step 4: wait for ready signal in stdout ──────────────────────
        started_at = time.time()
        ready = False
        detected_url: Optional[str] = None
        output_buffer: list = []  # all lines we've seen, used in error msgs

        async def _read_line_async() -> Optional[bytes]:
            try:
                return await asyncio.wait_for(
                    process.stdout.readline(), timeout=2
                )
            except asyncio.TimeoutError:
                return b""

        def _read_line_blocking() -> Optional[bytes]:
            return process.stdout.readline()

        async def _drain_remaining() -> str:
            """Drain whatever's left on stdout/stderr for richer errors."""
            extra = []
            try:
                if async_subprocess_supported:
                    try:
                        rest_out = await asyncio.wait_for(
                            process.stdout.read(8192), timeout=1
                        )
                        if rest_out:
                            extra.append(rest_out.decode(errors="replace"))
                    except Exception:
                        pass
                    try:
                        rest_err = await asyncio.wait_for(
                            process.stderr.read(8192), timeout=1
                        )
                        if rest_err:
                            extra.append(rest_err.decode(errors="replace"))
                    except Exception:
                        pass
                else:
                    # Blocking Popen — read remaining bytes in a thread.
                    def _drain_blocking() -> bytes:
                        try:
                            return process.stdout.read() or b""
                        except Exception:
                            return b""

                    rest = await asyncio.to_thread(_drain_blocking)
                    if rest:
                        extra.append(rest.decode(errors="replace"))
            except Exception:
                pass
            return "\n".join(extra)

        def _build_error_payload(rc: int) -> Dict[str, Any]:
            tail_lines = output_buffer[-40:]
            tail = "\n".join(tail_lines).strip() or "(no output captured)"
            return {
                "status": "error",
                "error": (
                    f"dev server exited with code {rc} "
                    f"(cmd=`{port_cmd}` cwd=`{app_root}`)\n"
                    f"--- last output ---\n{tail[-1800:]}"
                ),
                "port": port,
            }

        # ── Readiness: drain logs + TCP port-probe (C6 fix) ──────────────────
        # We continuously drain stdout/stderr into output_buffer (for error
        # reporting) while checking TCP port availability every 500ms.  This
        # is reliable across frameworks: no locale-sensitive string matching.
        async def _drain_logs_to_buffer():
            try:
                while True:
                    if async_subprocess_supported:
                        line = await asyncio.wait_for(
                            process.stdout.readline(), timeout=1
                        )
                    else:
                        line = await asyncio.to_thread(_read_line_blocking)
                    if line:
                        text = line.decode(errors="replace").rstrip()
                        output_buffer.append(text)
                        logger.debug(f"[studio:{session_id}] {text}")
                        # Capture URL hint from log line if present
                        nonlocal detected_url
                        if detected_url is None:
                            hit = _trusted_preview_from_log_line(text, port)
                            if hit:
                                detected_url = hit
                    else:
                        await asyncio.sleep(0.1)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
            except Exception:
                pass

        drain_task = asyncio.create_task(_drain_logs_to_buffer())

        while time.time() - started_at < 90:
            # Check if process has already died
            rc_now = (
                process.returncode
                if async_subprocess_supported
                else process.poll()
            )
            if rc_now is not None:
                drain_task.cancel()
                rest = await _drain_remaining()
                if rest:
                    output_buffer.extend(rest.splitlines())
                logger.error(
                    f"[studio:{session_id}] dev server exited rc={rc_now}; "
                    f"output tail:\n{chr(10).join(output_buffer[-40:])}"
                )
                _release_port(port)
                return _build_error_payload(rc_now)

            if _port_open("127.0.0.1", port):
                ready = True
                break

            await asyncio.sleep(0.5)

        drain_task.cancel()

        direct_url = _normalize_preview_iframe_url(
            detected_url or _preview_iframe_url_for_port(port),
            port,
        )
        iframe_url, proxied = compose_studio_iframe_url(
            session_id=session_id,
            proxy_public_base=proxy_public_base,
            proxy_enabled_globally=studio_proxy_enabled,
            plan_dict=dict(plan),
            direct_url=direct_url,
        )
        info = {
            "status": "running" if ready else "starting",
            "port": port,
            "url": iframe_url,
            "direct_url": direct_url,
            "proxy_surface": proxied,
            "pid": process.pid,
            "started_at": time.time(),
            "project_dir": str(app_root),
            "framework": framework,
        }
        _running_previews[session_id] = {**info, "process": process}
        return info

    except asyncio.CancelledError:
        _release_port(port)
        return {"status": "error", "error": "Preview launch cancelled", "port": port}
    except Exception as e:
        _release_port(port)
        logger.error(f"[studio:{session_id}] start_preview_with_plan failed: {e}", exc_info=True)
        return {"status": "error", "error": f"Failed to start preview: {str(e)[:500]}", "port": port}
