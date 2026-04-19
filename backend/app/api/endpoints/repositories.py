"""
Repository Management Endpoints
"""

import os
import shutil
import tarfile
import io
from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
import httpx

from app.config import get_settings
from app.models.schemas import (
    Repository,
    RepositoryCreate,
    RepositoryResponse,
    APIResponse,
    FileNode,
)
from app.api.endpoints.auth import get_current_user, users_db
from app.services.persistence import save_repositories, load_repositories, delete_repository

router = APIRouter()
settings = get_settings()

# Load repositories from persistence on startup
repositories_db: dict[str, Repository] = load_repositories()

# Directories to ignore when indexing
IGNORE_PATTERNS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".pytest_cache",
    "venv",
    "env",
    ".env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".nyc_output",
    ".idea",
    ".vscode",
    ".DS_Store",
    "*.pyc",
    "*.pyo",
    "*.egg-info",
}


def should_ignore(path: str) -> bool:
    """Check if path should be ignored"""
    parts = path.split(os.sep)
    return any(part in IGNORE_PATTERNS for part in parts)


async def get_github_repos(access_token: str) -> List[dict]:
    """Fetch user's GitHub repositories"""
    repos = []
    page = 1
    
    async with httpx.AsyncClient() as client:
        while True:
            response = await client.get(
                f"https://api.github.com/user/repos?page={page}&per_page=100&sort=updated",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                }
            )
            
            if response.status_code != 200:
                break
            
            page_repos = response.json()
            if not page_repos:
                break
            
            repos.extend(page_repos)
            page += 1
            
            if len(page_repos) < 100:
                break
    
    return repos


async def clone_repository(repo: Repository, access_token: str):
    """Download repository source code via GitHub API tarball, then auto-index."""
    repos_dir = settings.repos_directory
    os.makedirs(repos_dir, exist_ok=True)
    
    local_path = os.path.join(repos_dir, repo.id)
    
    # Remove existing directory if present
    if os.path.exists(local_path):
        shutil.rmtree(local_path)
    
    # Download tarball from GitHub API
    tarball_url = f"https://api.github.com/repos/{repo.full_name}/tarball/{repo.default_branch}"
    
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        response = await client.get(
            tarball_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        
        if response.status_code != 200:
            print(f"⚠️ Failed to download tarball for {repo.full_name}: {response.status_code}")
            return
        
        # Extract tarball
        tar_bytes = io.BytesIO(response.content)
        with tarfile.open(fileobj=tar_bytes, mode="r:gz") as tar:
            tar.extractall(path=repos_dir)
            # GitHub tarballs extract to a folder like "owner-repo-sha/"
            extracted_name = tar.getnames()[0].split("/")[0]
        
        # Rename extracted folder to our expected path
        extracted_path = os.path.join(repos_dir, extracted_name)
        if os.path.exists(extracted_path):
            # Use shutil.move with retry — on Windows, uvicorn's file watcher
            # can hold brief locks on newly extracted files, causing PermissionError.
            import time as _time
            for attempt in range(5):
                try:
                    shutil.move(extracted_path, local_path)
                    break
                except PermissionError:
                    if attempt < 4:
                        _time.sleep(1)
                    else:
                        raise
    
    # Update repository record
    repo.local_path = local_path
    repositories_db[repo.id] = repo
    
    # Save to persistence
    save_repositories(repositories_db)
    print(f"✅ Downloaded repository {repo.full_name} to {local_path}")
    
    # Auto-trigger indexing after clone
    try:
        from app.services.indexer import IndexerService
        indexer = IndexerService()
        await indexer.index_repository(repo)
        print(f"✅ Auto-indexed repository {repo.full_name}")
    except Exception as e:
        print(f"⚠️ Auto-indexing failed for {repo.full_name}: {e}")


async def _ensure_repo_cloned(repo: Repository, access_token: str) -> bool:
    """Check if repo files exist on disk; if not, re-clone from GitHub.
    
    App Runner instances are ephemeral — after a restart the local filesystem
    is wiped but DynamoDB still holds the repo record with a stale local_path.
    This helper transparently re-downloads when that happens.
    
    Returns True if the repo is available on disk after the call.
    """
    if repo.local_path and os.path.exists(repo.local_path):
        return True
    
    # Preserve original timestamps — re-clone should not reset them
    original_indexed_at = repo.indexed_at
    original_created_at = repo.created_at
    
    print(f"🔄 Re-cloning {repo.full_name} (local files missing)...")
    await clone_repository(repo, access_token)
    
    # Restore original timestamps after re-clone + auto-index
    if original_indexed_at:
        repo.indexed_at = original_indexed_at
    if original_created_at:
        repo.created_at = original_created_at
    repositories_db[repo.id] = repo
    save_repositories(repositories_db)
    
    return repo.local_path is not None and os.path.exists(repo.local_path)


@router.get("/github", response_model=List[dict])
async def list_github_repos(authorization: str = Header(None)):
    """List user's GitHub repositories"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repos = await get_github_repos(user.access_token)
    
    return [
        {
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "description": repo.get("description"),
            "language": repo.get("language"),
            "stars": repo.get("stargazers_count", 0),
            "updated_at": repo.get("updated_at"),
            "private": repo.get("private", False),
        }
        for repo in repos
    ]


@router.post("/connect", response_model=RepositoryResponse)
async def connect_repository(
    request: RepositoryCreate,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    """Connect and clone a GitHub repository"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Fetch repository info from GitHub
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.github.com/repos/{request.full_name}",
            headers={
                "Authorization": f"Bearer {user.access_token}",
                "Accept": "application/json"
            }
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Repository not found")
        
        github_repo = response.json()
    
    # Create repository record
    repo_id = f"repo_{uuid.uuid4().hex[:12]}"
    repo = Repository(
        id=repo_id,
        user_id=user.id,
        github_repo_id=github_repo["id"],
        name=github_repo["name"],
        full_name=github_repo["full_name"],
        description=github_repo.get("description"),
        default_branch=github_repo.get("default_branch", "main"),
        language=github_repo.get("language"),
        clone_url=github_repo["clone_url"],
    )
    
    repositories_db[repo_id] = repo
    
    # Save to persistence
    save_repositories(repositories_db)
    
    # Clone repository in background
    background_tasks.add_task(clone_repository, repo, user.access_token)
    
    return RepositoryResponse(
        id=repo.id,
        name=repo.name,
        full_name=repo.full_name,
        description=repo.description,
        language=repo.language,
        is_indexed=repo.is_indexed,
        indexed_at=repo.indexed_at,
        created_at=repo.created_at,
        source=repo.source,
    )


@router.get("/", response_model=List[RepositoryResponse])
async def list_repositories(
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    """List connected repositories"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_repos = [
        repo for repo in repositories_db.values()
        if repo.user_id == user.id
    ]
    
    return [
        RepositoryResponse(
            id=repo.id,
            name=repo.name,
            full_name=repo.full_name,
            description=repo.description,
            language=repo.language,
            is_indexed=repo.is_indexed,
            indexed_at=repo.indexed_at,
            created_at=repo.created_at,
            source=repo.source,
        )
        for repo in user_repos
    ]


@router.get("/{repo_id}/status")
async def get_repository_status(repo_id: str, authorization: str = Header(None)):
    """Get repository clone/index status (for frontend polling)"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(repo_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    has_local_files = bool(repo.local_path and os.path.exists(repo.local_path))
    
    if repo.is_indexed and has_local_files:
        status = "ready"
    elif has_local_files:
        status = "indexing"
    else:
        status = "cloning"
    
    return {
        "id": repo.id,
        "status": status,
        "is_indexed": repo.is_indexed,
        "indexed_at": repo.indexed_at.isoformat() if repo.indexed_at else None,
        "has_local_files": has_local_files,
    }


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: str,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None),
):
    """Get repository details"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(repo_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Trigger background re-clone if local files are missing (GitHub repos only)
    if repo.source != "upload" and repo.local_path and not os.path.exists(repo.local_path):
        background_tasks.add_task(_ensure_repo_cloned, repo, user.access_token)
    
    return RepositoryResponse(
        id=repo.id,
        name=repo.name,
        full_name=repo.full_name,
        description=repo.description,
        language=repo.language,
        is_indexed=repo.is_indexed,
        indexed_at=repo.indexed_at,
        created_at=repo.created_at,
        source=repo.source,
    )


@router.post("/{repo_id}/index")
async def index_repository(
    repo_id: str,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    """Index repository for AI documentation"""
    from app.services.indexer import IndexerService
    
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(repo_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    if not repo.local_path or not os.path.exists(repo.local_path):
        # For uploaded repos, files can't be recovered after server restart
        if repo.source == "upload":
            raise HTTPException(
                status_code=400,
                detail="Uploaded project files are no longer available. Please re-upload the ZIP file.",
            )
        raise HTTPException(status_code=400, detail="Repository not cloned yet")
    
    # Start indexing in background
    indexer = IndexerService()
    background_tasks.add_task(indexer.index_repository, repo)
    
    return APIResponse(
        success=True,
        message="Repository indexing started"
    )


@router.delete("/{repo_id}")
async def delete_repository(repo_id: str, authorization: str = Header(None)):
    """Delete a connected repository"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(repo_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Remove local files
    if repo.local_path and os.path.exists(repo.local_path):
        shutil.rmtree(repo.local_path)
    
    # Remove from database
    del repositories_db[repo_id]
    
    # Delete from DynamoDB
    delete_repository(repo_id)
    
    return APIResponse(success=True, message="Repository deleted")

