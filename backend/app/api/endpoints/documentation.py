"""
Documentation Endpoints

Generate and retrieve structured MNC-standard documentation for repositories.
"""

import logging
import os
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel

from app.services.documentation_generator import DocumentationGenerator
from app.services.persistence import save_documentation_cache, load_documentation_cache
from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import repositories_db, _ensure_repo_cloned

logger = logging.getLogger(__name__)
router = APIRouter()

# Load persisted documentation cache (survives server restarts)
docs_cache: dict = load_documentation_cache()
docs_generating: dict = {}     # repo_id -> bool
print(f"[docs] Loaded documentation cache for {len(docs_cache)} repositories from disk")

doc_generator = DocumentationGenerator()


def _get_repo_local_path(repo_id: str) -> str | None:
    """Return the actual local_path from the repo record (works for both
    GitHub-cloned and upload-created repositories)."""
    repo = repositories_db.get(repo_id)
    return repo.local_path if repo else None


async def _generate_task(repo_id: str):
    """Background task that generates documentation and caches it."""
    try:
        path = _get_repo_local_path(repo_id)
        if not path or not os.path.exists(path):
            raise FileNotFoundError(
                f"Repository files not found (repo_id={repo_id}). "
                "The server may have restarted. Please go back and re-open the repository to trigger a re-download."
            )
        result = await doc_generator.generate_repository_docs(path)
        docs_cache[repo_id] = result
        save_documentation_cache(docs_cache)  # persist to disk
        logger.info("Documentation generated & saved for repo %s", repo_id)
    except Exception as exc:
        logger.error("Documentation generation failed for %s: %s", repo_id, exc)
        docs_cache[repo_id] = {
            "overview": f"Generation failed: {exc}",
            "architecture": "",
            "folder_tree": "",
            "files": [],
            "dependencies": "",
        }
        save_documentation_cache(docs_cache)  # persist even failures
    finally:
        docs_generating.pop(repo_id, None)


@router.post("/{repo_id}/generate")
async def generate_docs(repo_id: str, background_tasks: BackgroundTasks, authorization: str = Header(None)):
    """Kick off documentation generation in the background."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    repo = repositories_db.get(repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Ensure repo files are on disk; re-clone from GitHub if needed
    path = repo.local_path
    if not path or not os.path.exists(path):
        if repo.source == "upload":
            raise HTTPException(
                status_code=400,
                detail="Uploaded project files are no longer available. Please re-upload the ZIP file.",
            )
        # Re-clone from GitHub (App Runner restart wiped local files)
        await _ensure_repo_cloned(repo, user.access_token)
        # Refresh path after re-clone (local_path may have been updated)
        repo = repositories_db.get(repo_id)
        path = repo.local_path if repo else None
        if not path or not os.path.exists(path):
            raise HTTPException(
                status_code=500,
                detail="Failed to re-download repository files. Please try reconnecting the repository.",
            )

    if docs_generating.get(repo_id):
        return {"status": "generating", "message": "Documentation is already being generated."}

    docs_generating[repo_id] = True
    docs_cache.pop(repo_id, None)  # clear stale cache
    background_tasks.add_task(_generate_task, repo_id)
    return {"status": "accepted", "message": "Documentation generation started."}


@router.get("/{repo_id}")
async def get_docs(repo_id: str):
    """
    Retrieve generated documentation.
    Returns 202 while generating, 404 if not yet requested, 200 with data.
    """
    if docs_generating.get(repo_id):
        return {"status": "generating"}

    if repo_id not in docs_cache:
        return {"status": "not_generated"}

    return {"status": "ready", "data": docs_cache[repo_id]}


@router.get("/{repo_id}/file")
async def get_file_docs(repo_id: str, path: str, authorization: str = Header(None)):
    """Generate documentation for a single file on demand."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    repo = repositories_db.get(repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo_path = repo.local_path
    if not repo_path or not os.path.exists(repo_path):
        if repo.source == "upload":
            raise HTTPException(
                status_code=400,
                detail="Uploaded project files are no longer available. Please re-upload the ZIP file.",
            )
        await _ensure_repo_cloned(repo, user.access_token)
        # Refresh after re-clone
        repo = repositories_db.get(repo_id)
        repo_path = repo.local_path if repo else None
        if not repo_path or not os.path.exists(repo_path):
            raise HTTPException(status_code=500, detail="Failed to re-download repository files.")

    try:
        result = await doc_generator.generate_file_docs(repo_path, path)
        return {"status": "ready", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ------------------------------------------------------------------
# Concise README generation (for GitHub push)
# ------------------------------------------------------------------

class GenerateReadmeRequest(BaseModel):
    """Request body for concise README generation."""
    project_description: Optional[str] = ""


@router.post("/{repo_id}/readme")
async def generate_readme(
    repo_id: str,
    body: GenerateReadmeRequest = GenerateReadmeRequest(),
    authorization: str = Header(None),
):
    """
    Generate a concise, developer-grade README from cached documentation.

    Optionally accepts a project_description to tailor the README to the
    user's intent (e.g. "This is an ERP for manufacturing").

    Returns {"status": "ready", "readme": "<markdown string>"}.
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    repo = repositories_db.get(repo_id)
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Require existing docs cache — don't generate full docs from scratch here
    if repo_id not in docs_cache:
        raise HTTPException(
            status_code=400,
            detail="Documentation has not been generated yet. Please generate documentation first.",
        )

    cached_docs = docs_cache[repo_id]
    repo_name = repo.full_name or repo.name

    try:
        readme_md = await doc_generator.generate_readme(
            docs=cached_docs,
            repo_name=repo_name,
            project_description=body.project_description or "",
        )
        return {"status": "ready", "readme": readme_md}
    except Exception as exc:
        logger.error("README generation failed for %s: %s", repo_id, exc)
        raise HTTPException(status_code=500, detail=f"README generation failed: {exc}")

