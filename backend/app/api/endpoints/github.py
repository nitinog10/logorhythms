"""
GitHub Integration Endpoints
— Create repo, push README, create issue, implement codebase-wide fix + PR + merge + README
"""

import asyncio
import base64
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from openai import AsyncOpenAI

from app.config import get_settings
from app.models.schemas import (
    CreateRepoRequest,
    CreateRepoResponse,
    PushReadmeRequest,
    PushReadmeResponse,
    CreateIssueRequest,
    CreateIssueResponse,
    ImplementFixRequest,
    ImplementFixResponse,
    User,
)
from app.api.endpoints.auth import get_current_user
from app.services.github_service import GitHubService, GitHubAPIError

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

    return PushReadmeResponse(success=True, commit_sha=commit_sha, url=html_url)


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

    return CreateIssueResponse(
        issue_number=data["number"],
        url=data["html_url"],
        title=data["title"],
    )


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
        openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

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
        plan_resp = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior software engineer analysing a codebase. "
                        "Given the repository file list and improvement suggestions, "
                        "identify which files need modification. "
                        "Return ONLY valid JSON: {\"files\": [\"path/to/file1.py\", ...]}"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Repository files:\n{json.dumps(source_files[:200])}\n\n"
                        f"Improvement suggestions:\n{suggestions_text}"
                        + (f"\n\nAdditional context:\n{body.impact_summary}" if body.impact_summary else "")
                    ),
                },
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        plan_raw = plan_resp.choices[0].message.content or '{"files":[]}'
        plan_data = json.loads(plan_raw)
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

            fix_resp = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a senior software engineer. "
                            "Apply the suggested improvements to the given source code. "
                            "Return ONLY the complete improved source code — "
                            "no explanation, no markdown fences, no commentary."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"## File: {file_path}\n\n"
                            f"```\n{original}\n```\n\n"
                            f"Suggestions to apply:\n{suggestions_text}\n\n"
                            "Return the full improved file content."
                        ),
                    },
                ],
                temperature=0.2,
            )
            improved = fix_resp.choices[0].message.content or original
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
                readme_section_resp = await openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a technical writer. Write a concise, professional "
                                "markdown section (heading + bullet points) summarising code "
                                "improvements that were just applied to a repository. "
                                "Use heading level ##. Keep it under 15 lines. "
                                "Do NOT include markdown fences around the output."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                f"Suggestions applied:\n{suggestions_text}\n\n"
                                f"Files changed:\n{changed_list}"
                            ),
                        },
                    ],
                    temperature=0.3,
                )
                changelog = readme_section_resp.choices[0].message.content or ""

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

        return ImplementFixResponse(
            branch=branch_name,
            pr_number=pr["number"],
            pr_url=pr["html_url"],
            files_changed=len(file_changes),
            merged=merged,
            readme_updated=readme_updated,
        )

    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("implement-fix failed unexpectedly")
        raise HTTPException(status_code=500, detail=str(exc))
