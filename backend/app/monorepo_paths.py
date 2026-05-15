"""
Resolve machine-local directories for cloned repos.

Developer layout (Git forge monorepo): data lives at ``<repo-root>/docuverse_data``
as a sibling of ``backend/``. That keeps ``npm install`` trees out of ``backend/`` so
uvicorn ``--reload`` watching ``backend/app`` — or mistakenly watching ``backend`` —
does not churn on tens of thousands of node_modules writes.

Flat/container layout (WORKDIR is the backend root, e.g. ``/app``): data defaults to
``<backend>/docuverse_data``. Docker pins ``REPOS_DIRECTORY`` / ``PREVIEW_WORKSPACE``
to the legacy paths under ``/app``.
"""

from __future__ import annotations

from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def docuverse_data_root() -> Path:
    backend = _BACKEND_ROOT.resolve()
    if backend.name.lower() == "backend":
        parent = backend.parent
        candidate = parent / "docuverse_data"
        # Monorepo: …/Gitforge/backend → put data beside backend, not inside it.
        try:
            if (parent / "backend").resolve() == backend:
                return candidate.resolve()
        except OSError:
            pass
    return (backend / "docuverse_data").resolve()


def default_repos_dir() -> str:
    return str((docuverse_data_root() / "repos").resolve())


def default_workspace_dir() -> str:
    return str((docuverse_data_root() / "workspace").resolve())
