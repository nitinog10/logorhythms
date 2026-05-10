"""
Optional npm/pip installs inside disposable Docker containers.

Reduces bare-metal exposure to hostile ``postinstall`` scripts when enabled via
``STUDIO_PREVIEW_DOCKER_INSTALL=1`` (and a working Docker CLI).
Mounts the real project directory; lockfiles still apply on the bind mount.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

NODE_IMG = os.environ.get("STUDIO_PREVIEW_DOCKER_NODE_IMAGE", "node:20-bookworm-slim")


def docker_cli_available() -> bool:
    return shutil.which("docker") is not None


def npm_install_via_docker(
    cwd: Path,
    *,
    timeout_sec: int = 600,
    extra_flags: Optional[list] = None,
) -> Tuple[int, str]:
    """Return (exit_code, combined_output)."""
    root = cwd.resolve()
    if not root.is_dir():
        return -1, f"cwd not a directory: {root}"

    docker_path = shutil.which("docker")
    if not docker_path:
        return -1, "docker CLI not found on PATH"

    vol = root.as_posix()
    cmd = [
        docker_path,
        "run",
        "--rm",
        "-v",
        f"{vol}:/app",
        "-w",
        "/app",
        NODE_IMG,
        "npm",
        "install",
        "--no-audit",
        "--no-fund",
    ]
    if extra_flags:
        cmd.extend(extra_flags)

    logger.info("[docker-install] %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout_sec,
            text=True,
            check=False,
        )
        tail = ""
        if proc.stdout:
            tail += proc.stdout
        if proc.stderr:
            tail += ("\n" if tail else "") + proc.stderr
        return proc.returncode, tail.strip()[:8000]
    except subprocess.TimeoutExpired:
        return -1, "docker npm install timed out"
    except Exception as e:
        return -1, f"{type(e).__name__}: {e}"

