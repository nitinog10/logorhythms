"""
GitHub Integration Endpoints
— Create repo, push README, create issue, implement codebase-wide fix + PR + merge + README
"""

import asyncio
import base64
import json
import logging
import os
import shutil
import time
import uuid
import zipfile
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Header, UploadFile, File, Form

from app.services.bedrock_client import call_nova_pro, call_nova_lite

from app.config import get_settings
from app.models.schemas import (
    CreateRepoRequest,
    CreateRepoResponse,
    CreateRepoWithUploadResponse,
    PushReadmeRequest,
    PushReadmeResponse,
    CreateIssueRequest,
    CreateIssueResponse,
    ImplementFixRequest,
    ImplementFixResponse,
    AutomationHistory,
    Repository,
    RepositoryResponse,
    User,
)
from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import repositories_db
from app.services.github_service import GitHubService, GitHubAPIError
from app.services.persistence import save_automation_history, load_automation_history, save_repositories

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# Source code file extensions the AI should analyse
_SOURCE_EXTS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs", ".rb",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".scala",
    ".vue", ".svelte", ".html", ".css", ".scss",
}
_SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", "dist", "build",
    "venv", ".venv", ".tox", "vendor", "target", ".idea", ".vscode",
}
_MAX_FILES_TO_FIX = 10  # safety cap per request


async def _require_user(authorization: Optional[str]) -> User:
    """Extract authenticated user or raise 401."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ─────────────────────────────────────────────
# Feature 1 — Create Repository
# ─────────────────────────────────────────────

@router.post("/create-repo", response_model=CreateRepoResponse)
async def create_repo(
    body: CreateRepoRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Create a new GitHub repository under the authenticated user."""
    user = await _require_user(authorization)
    gh = GitHubService(user.access_token)

    try:
        data = await gh.create_repo(
            name=body.name,
            description=body.description,
            private=body.private,
        )
    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    return CreateRepoResponse(
        url=data["html_url"],
        full_name=data["full_name"],
        github_id=data["id"],
        default_branch=data.get("default_branch", "main"),
    )


# ─────────────────────────────────────────────
# Feature 1b — Create Repository + Upload Files
# ─────────────────────────────────────────────

_MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

_LANG_EXTENSIONS: dict[str, str] = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
    ".tsx": "TypeScript", ".jsx": "JavaScript", ".java": "Java",
    ".go": "Go", ".rs": "Rust", ".rb": "Ruby", ".cpp": "C++",
    ".c": "C", ".cs": "C#", ".swift": "Swift", ".kt": "Kotlin",
}


def _guess_language(root_path: str) -> Optional[str]:
    """Walk the extracted tree and return the most common source language."""
    counts: dict[str, int] = {}
    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            lang = _LANG_EXTENSIONS.get(ext)
            if lang:
                counts[lang] = counts.get(lang, 0) + 1
    if not counts:
        return None
    return max(counts, key=counts.get)  # type: ignore[arg-type]


async def _index_repo_background(repo: Repository):
    """Run indexer on a repository (background task)."""
    try:
        from app.services.indexer import IndexerService
        indexer = IndexerService()
        await indexer.index_repository(repo)
        logger.info("Auto-indexed repository %s", repo.name)
    except Exception as e:
        logger.warning("Auto-indexing failed for %s: %s", repo.name, e)


@router.post("/create-repo-with-upload", response_model=CreateRepoWithUploadResponse)
async def create_repo_with_upload(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    description: str = Form(""),
    private: str = Form("false"),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Create a new GitHub repository and push uploaded ZIP contents into it
    in a single atomic operation.  The repo is also auto-connected to
    DocuVerse for indexing.
    """
    user = await _require_user(authorization)
    is_private = private.lower() in ("true", "1", "yes")
    gh = GitHubService(user.access_token)

    # ── Validate ZIP ───────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")
    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size of {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )

    # ── Create the GitHub repo (or use existing if 409) ──────
    try:
        repo_data = await gh.create_repo(
            name=name.strip(),
            description=description.strip(),
            private=is_private,
        )
    except GitHubAPIError as exc:
        if exc.status == 422 or exc.status == 409:
            # Repo already exists — fetch it and continue with the push
            try:
                repo_data = await gh._request(
                    "GET", f"https://api.github.com/repos/{user.username}/{name.strip()}",
                )
            except GitHubAPIError:
                raise HTTPException(
                    status_code=exc.status,
                    detail=f"Repository '{name.strip()}' already exists and could not be accessed",
                )
        else:
            raise HTTPException(status_code=exc.status, detail=str(exc))

    full_name = repo_data["full_name"]
    owner, repo_name = full_name.split("/", 1)
    default_branch = repo_data.get("default_branch", "main")
    logger.info("✅ Repo ready: %s (branch: %s)", full_name, default_branch)

    # ── Extract ZIP to temp dir ────────────────────────────────
    tmp_id = uuid.uuid4().hex[:12]
    repos_dir = settings.repos_directory
    os.makedirs(repos_dir, exist_ok=True)
    local_path = os.path.join(repos_dir, f"tmp_{tmp_id}")

    try:
        zip_path = os.path.join(repos_dir, f"tmp_{tmp_id}.zip")
        with open(zip_path, "wb") as f:
            f.write(contents)

        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                resolved = os.path.realpath(os.path.join(local_path, member))
                if not resolved.startswith(os.path.realpath(local_path)):
                    raise HTTPException(status_code=400, detail="ZIP contains unsafe path entries")
            zf.extractall(local_path)

        os.remove(zip_path)

        # Flatten single top-level directory
        entries = os.listdir(local_path)
        logger.info("📦 Extracted %d top-level entries to %s", len(entries), local_path)
        if len(entries) == 1:
            single = os.path.join(local_path, entries[0])
            if os.path.isdir(single):
                temp_name = local_path + "_flatten"
                os.rename(single, temp_name)
                shutil.rmtree(local_path)
                os.rename(temp_name, local_path)

    except zipfile.BadZipFile:
        if os.path.exists(local_path):
            shutil.rmtree(local_path)
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")
    except HTTPException:
        raise
    except Exception as exc:
        if os.path.exists(local_path):
            shutil.rmtree(local_path)
        raise HTTPException(status_code=500, detail=f"Failed to extract ZIP: {exc}")

    # ── Push files to GitHub via Git Data API ──────────────────
    try:
        logger.info("🚀 Pushing files from %s to %s/%s ...", local_path, owner, repo_name)
        push_result = await gh.push_directory(
            owner=owner,
            repo=repo_name,
            local_path=local_path,
            branch=default_branch,
            message=f"Initial commit — uploaded via DocuVerse",
        )
    except GitHubAPIError as exc:
        shutil.rmtree(local_path, ignore_errors=True)
        logger.error("❌ Push failed (GitHubAPIError): %s", exc)
        raise HTTPException(status_code=exc.status, detail=str(exc))
    except Exception as exc:
        shutil.rmtree(local_path, ignore_errors=True)
        logger.error("❌ Push failed (Exception): %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to push files: {exc}")

    logger.info("✅ Pushed %d files, commit: %s", push_result["files_pushed"], push_result["commit_sha"])

    # ── Create DocuVerse Repository record ─────────────────────
    language = _guess_language(local_path)
    repo_id = f"repo_{uuid.uuid4().hex[:12]}"

    # Rename the temp extraction directory to the final repo_id-based
    # path so that the local_path is consistent with other repo types
    # and can be reliably located by documentation / walkthrough
    # endpoints.
    final_path = os.path.join(repos_dir, repo_id)
    try:
        if os.path.exists(final_path):
            shutil.rmtree(final_path)
        os.rename(local_path, final_path)
        local_path = final_path
    except Exception as rename_err:
        logger.warning("Could not rename %s → %s: %s", local_path, final_path, rename_err)
        # Continue with the original temp path — it still works

    repo = Repository(
        id=repo_id,
        user_id=user.id,
        github_repo_id=repo_data["id"],
        name=repo_data["name"],
        full_name=full_name,
        description=repo_data.get("description"),
        default_branch=default_branch,
        language=language,
        clone_url=repo_data["clone_url"],
        local_path=local_path,
        source="github",
    )
    repositories_db[repo_id] = repo
    save_repositories(repositories_db)

    # Index in background
    background_tasks.add_task(_index_repo_background, repo)

    return CreateRepoWithUploadResponse(
        url=repo_data["html_url"],
        full_name=full_name,
        github_id=repo_data["id"],
        default_branch=default_branch,
        files_pushed=push_result["files_pushed"],
        commit_sha=push_result["commit_sha"],
        repository_id=repo_id,
    )


# ─────────────────────────────────────────────
# Feature 3 — Push Documentation to README
# ─────────────────────────────────────────────

@router.post("/push-readme", response_model=PushReadmeResponse)
async def push_readme(
    body: PushReadmeRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Push (create or update) README.md in a GitHub repository."""
    user = await _require_user(authorization)
    gh = GitHubService(user.access_token)

    try:
        sha = await gh.get_file_sha(body.owner, body.repo, "README.md", body.branch)
        content_b64 = base64.b64encode(body.content.encode()).decode()
        result = await gh.push_file(
            owner=body.owner,
            repo=body.repo,
            path="README.md",
            content_b64=content_b64,
            message=body.message,
            branch=body.branch,
            sha=sha,
        )
    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    commit_sha = result.get("commit", {}).get("sha", "")
    html_url = result.get("content", {}).get("html_url", "")

    response = PushReadmeResponse(success=True, commit_sha=commit_sha, url=html_url)

    # Persist automation state
    full_name = f"{body.owner}/{body.repo}"
    history = load_automation_history(full_name)
    history.update({
        "docs_url": html_url,
        "docs_commit_sha": commit_sha,
        "docs_pushed_at": time.time(),
    })
    save_automation_history(full_name, history)

    return response


# ─────────────────────────────────────────────
# Feature 4 — Create Issue from Impact Analysis
# ─────────────────────────────────────────────

@router.post("/create-issue", response_model=CreateIssueResponse)
async def create_issue(
    body: CreateIssueRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Create a GitHub issue (typically from impact analysis data)."""
    user = await _require_user(authorization)
    gh = GitHubService(user.access_token)

    try:
        data = await gh.create_issue(
            owner=body.owner,
            repo=body.repo,
            title=body.title,
            body=body.body,
            labels=body.labels or None,
        )
    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    response = CreateIssueResponse(
        issue_number=data["number"],
        url=data["html_url"],
        title=data["title"],
    )

    # Persist automation state
    full_name = f"{body.owner}/{body.repo}"
    history = load_automation_history(full_name)
    history.update({
        "issue_url": data["html_url"],
        "issue_number": data["number"],
        "issue_title": data["title"],
        "issue_created_at": time.time(),
    })
    save_automation_history(full_name, history)

    return response


# ─────────────────────────────────────────────
# Feature 5 — Codebase-wide Fix + PR + Merge + README
# ─────────────────────────────────────────────


def _is_source_file(path: str) -> bool:
    """Return True if *path* looks like an editable source file."""
    parts = path.split("/")
    for part in parts[:-1]:
        if part in _SKIP_DIRS:
            return False
    ext = ""
    if "." in path:
        ext = "." + path.rsplit(".", 1)[-1]
    return ext.lower() in _SOURCE_EXTS


@router.post("/implement-fix", response_model=ImplementFixResponse)
async def implement_fix(
    body: ImplementFixRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Full codebase-wide auto-fix pipeline:
    1. Fetch repo file tree from GitHub.
    2. Ask GPT-4o which files need modification based on the suggestions.
    3. For each identified file, fetch its content and generate the improved version.
    4. Create a new branch, push all changes.
    5. Open a Pull Request.
    6. Merge the PR.
    7. Update README.md with a changelog section.
    """
    user = await _require_user(authorization)
    gh = GitHubService(user.access_token)

    if not body.suggestions:
        raise HTTPException(status_code=400, detail="No suggestions provided")

    try:
        # ── Step 1 — Get the full file tree ───────────────────
        tree = await gh.list_tree(body.owner, body.repo, body.base_branch)
        source_files = [
            f["path"] for f in tree
            if f.get("type") == "blob" and _is_source_file(f["path"])
        ]

        if not source_files:
            raise HTTPException(status_code=400, detail="No source files found in repository")

        suggestions_text = "\n".join(f"- {s}" for s in body.suggestions)

        # ── Step 2 — Ask AI which files to modify ─────────────
        _plan_system = (
            "You are a senior software engineer analysing a codebase. "
            "Given the repository file list and improvement suggestions, "
            "identify which files need modification. "
            'Return ONLY valid JSON: {"files": ["path/to/file1.py", ...]}'
        )
        _plan_user = (
            f"Repository files:\n{json.dumps(source_files[:200])}\n\n"
            f"Improvement suggestions:\n{suggestions_text}"
            + (f"\n\nAdditional context:\n{body.impact_summary}" if body.impact_summary else "")
        )
        try:
            plan_raw = await call_nova_pro(
                _plan_user, max_tokens=1024, temperature=0.1, system_prompt=_plan_system,
            )
        except Exception as _e:
            logger.warning("Nova Pro file-selection failed (%s), falling back to Nova Lite", _e)
            plan_raw = await call_nova_lite(
                _plan_user, max_tokens=1024, temperature=0.1, system_prompt=_plan_system,
            )
        plan_raw = (plan_raw or "").strip()
        # Strip markdown fences the model may wrap around the JSON
        if plan_raw.startswith("```"):
            plan_raw = "\n".join(plan_raw.split("\n")[1:])
            if plan_raw.endswith("```"):
                plan_raw = plan_raw[:-3].strip()
        if not plan_raw:
            plan_raw = '{"files":[]}'
        try:
            plan_data = json.loads(plan_raw)
        except json.JSONDecodeError:
            logger.error("AI returned invalid JSON for file selection: %s", plan_raw[:200])
            plan_data = {"files": []}
        files_to_fix: list[str] = plan_data.get("files", [])

        # Only keep files that actually exist in the tree
        files_to_fix = [f for f in files_to_fix if f in source_files][:_MAX_FILES_TO_FIX]

        if not files_to_fix:
            raise HTTPException(
                status_code=400,
                detail="AI could not identify files to modify for the given suggestions",
            )

        # ── Step 3 — Fetch content & generate fixes (parallel) ─
        async def _fix_one_file(file_path: str) -> tuple[str, str | None]:
            """Return (file_path, improved_code) or (file_path, None) if unchanged."""
            try:
                original = await gh.get_file_content(
                    body.owner, body.repo, file_path, body.base_branch,
                )
            except GitHubAPIError:
                return (file_path, None)

            fix_system = (
                "You are a senior software engineer. "
                "Apply the suggested improvements to the given source code. "
                "Return ONLY the complete improved source code — "
                "no explanation, no markdown fences, no commentary."
            )
            fix_user = (
                f"## File: {file_path}\n\n"
                f"```\n{original}\n```\n\n"
                f"Suggestions to apply:\n{suggestions_text}\n\n"
                "Return the full improved file content."
            )
            try:
                improved = await call_nova_pro(
                    fix_user, temperature=0.2, system_prompt=fix_system,
                )
            except Exception as _e:
                logger.warning("Nova Pro fix failed for %s (%s), falling back", file_path, _e)
                improved = await call_nova_lite(
                    fix_user, temperature=0.2, system_prompt=fix_system,
                )
            improved = improved or original
            # Only count as a change if code actually differs
            if improved.strip() == original.strip():
                return (file_path, None)
            return (file_path, improved)

        results = await asyncio.gather(
            *[_fix_one_file(fp) for fp in files_to_fix],
            return_exceptions=True,
        )

        file_changes: dict[str, str] = {}
        for res in results:
            if isinstance(res, Exception):
                logger.warning("File fix failed: %s", res)
                continue
            path, improved = res
            if improved is not None:
                file_changes[path] = improved

        if not file_changes:
            raise HTTPException(
                status_code=400,
                detail="No effective changes were generated by the AI",
            )

        # ── Step 4 — Create branch & push all changes ─────────
        branch_name = f"docuverse-fix-{int(time.time())}"
        base_sha = await gh.get_branch_sha(body.owner, body.repo, body.base_branch)
        await gh.create_branch(body.owner, body.repo, branch_name, base_sha)

        for file_path, improved_code in file_changes.items():
            sha = await gh.get_file_sha(body.owner, body.repo, file_path, branch_name)
            content_b64 = base64.b64encode(improved_code.encode()).decode()
            await gh.push_file(
                owner=body.owner,
                repo=body.repo,
                path=file_path,
                content_b64=content_b64,
                message=f"fix: DocuVerse auto-fix for {file_path}",
                branch=branch_name,
                sha=sha,
            )

        # ── Step 5 — Open Pull Request ────────────────────────
        changed_list = "\n".join(f"- `{p}`" for p in file_changes)
        pr_body = (
            "## DocuVerse Codebase Auto-Fix\n\n"
            "### Suggestions Applied\n"
            f"{suggestions_text}\n\n"
            f"### Files Changed ({len(file_changes)})\n"
            f"{changed_list}\n\n"
            "---\n"
            "*This PR was automatically generated by DocuVerse impact analysis.*"
        )
        pr = await gh.create_pull_request(
            owner=body.owner,
            repo=body.repo,
            title=f"DocuVerse Auto-Fix: {len(file_changes)} file(s) improved",
            body=pr_body,
            head=branch_name,
            base=body.base_branch,
        )

        # ── Step 6 — Merge the PR ─────────────────────────────
        merged = False
        try:
            await gh.merge_pull_request(body.owner, body.repo, pr["number"])
            merged = True
        except GitHubAPIError as merge_err:
            logger.warning("Auto-merge failed (may have conflicts): %s", merge_err)

        # ── Step 7 — Update README with changelog ─────────────
        readme_updated = False
        if merged:
            try:
                _cl_system = (
                    "You are a technical writer. Write a concise, professional "
                    "markdown section (heading + bullet points) summarising code "
                    "improvements that were just applied to a repository. "
                    "Use heading level ##. Keep it under 15 lines. "
                    "Do NOT include markdown fences around the output."
                )
                _cl_user = (
                    f"Suggestions applied:\n{suggestions_text}\n\n"
                    f"Files changed:\n{changed_list}"
                )
                try:
                    changelog = await call_nova_lite(
                        _cl_user, temperature=0.3, system_prompt=_cl_system,
                    )
                except Exception as _e:
                    logger.warning("Nova Lite changelog failed (%s), falling back to Nova Micro", _e)
                    from app.services.bedrock_client import call_nova_micro
                    changelog = await call_nova_micro(
                        _cl_user, temperature=0.3, system_prompt=_cl_system,
                    )
                changelog = changelog or ""

                # Fetch current README (may not exist)
                existing_readme = ""
                try:
                    existing_readme = await gh.get_file_content(
                        body.owner, body.repo, "README.md", body.base_branch,
                    )
                except GitHubAPIError:
                    pass

                updated_readme = existing_readme.rstrip() + "\n\n" + changelog.strip() + "\n"
                readme_sha = await gh.get_file_sha(
                    body.owner, body.repo, "README.md", body.base_branch,
                )
                readme_b64 = base64.b64encode(updated_readme.encode()).decode()
                await gh.push_file(
                    owner=body.owner,
                    repo=body.repo,
                    path="README.md",
                    content_b64=readme_b64,
                    message="docs: update README with DocuVerse auto-fix changelog",
                    branch=body.base_branch,
                    sha=readme_sha,
                )
                readme_updated = True
            except Exception as readme_err:
                logger.warning("README update failed: %s", readme_err)

        response = ImplementFixResponse(
            branch=branch_name,
            pr_number=pr["number"],
            pr_url=pr["html_url"],
            files_changed=len(file_changes),
            merged=merged,
            readme_updated=readme_updated,
        )

        # Persist automation state
        full_name = f"{body.owner}/{body.repo}"
        history = load_automation_history(full_name)
        history.update({
            "fix_pr_url": pr["html_url"],
            "fix_pr_number": pr["number"],
            "fix_branch": branch_name,
            "fix_files_changed": len(file_changes),
            "fix_merged": merged,
            "fix_readme_updated": readme_updated,
            "fix_suggestions": body.suggestions,
            "fix_created_at": time.time(),
        })
        save_automation_history(full_name, history)

        return response

    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("implement-fix failed unexpectedly")
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────────
# Automation Status — saved state for all actions
# ─────────────────────────────────────────────

@router.get("/status/{owner}/{repo}")
async def get_automation_status(
    owner: str,
    repo: str,
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Return persisted automation history for a repository."""
    await _require_user(authorization)
    full_name = f"{owner}/{repo}"
    return load_automation_history(full_name)
