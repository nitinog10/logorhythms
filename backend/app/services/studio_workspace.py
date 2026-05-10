"""
Studio workspace helpers shared by Studio endpoints/runtime layer.

This isolates file-materialization utilities from runtime process lifecycle calls.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from app.services.preview_runner import get_project_dir as _get_project_dir
from app.services.preview_runner import write_project_files as _write_project_files


def get_project_dir(project_id: str) -> Path:
    return _get_project_dir(project_id)


async def write_project_files(
    project_id: str,
    files: Dict[str, str],
    env_config: Optional[Dict[str, str]] = None,
) -> Path:
    return await _write_project_files(project_id, files, env_config)

