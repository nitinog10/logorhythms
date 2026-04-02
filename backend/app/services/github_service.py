"""
GitHub API Service — centralised helper for all GitHub REST API calls.
Instantiate per-request with the authenticated user's GitHub access token.
"""

import asyncio
import base64
import os
import time
from typing import Optional

import httpx

GITHUB_API = "https://api.github.com"


class GitHubAPIError(Exception):
    """Raised when a GitHub API call fails."""

    def __init__(self, status: int, message: str, response_body: dict | None = None):
        self.status = status
        self.response_body = response_body or {}
        super().__init__(message)


class GitHubService:
    """Thin async wrapper around the GitHub REST API."""

    def __init__(self, access_token: str):
        self._token = access_token
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    # ── helpers ────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        url: str,
        *,
        json: dict | None = None,
        expected: set[int] | None = None,
    ) -> dict:
        expected = expected or {200, 201}        
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.request(method, url, headers=self._headers, json=json)
            if resp.status_code not in expected:
                body = resp.json() if resp.content else {}
                msg = body.get("message", resp.text[:300])
                raise GitHubAPIError(resp.status_code, msg, body)
            if resp.status_code == 204:
                return {}
            return resp.json()

    # ── Feature 1: Create Repository ──────────────────────────

    async def create_repo(
        self,
        name: str,
        description: str = "",
        private: bool = False,
    ) -> dict:
        """POST /user/repos — create a new repo under the authenticated user."""
        return await self._request(
            "POST",
            f"{GITHUB_API}/user/repos",
            json={"name": name, "description": description, "private": private},
        )

    # ── Feature 3: Push / update a file (README) ─────────────

    async def get_file_sha(
        self,
        owner: str,
        repo: str,
        path: str,
        branch: str = "main",
    ) -> Optional[str]:
        """Return the blob SHA of *path* on *branch*, or None if missing."""
        try:
            data = await self._request(
                "GET",
                f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}?ref={branch}",
            )
            return data.get("sha")
        except GitHubAPIError as exc:
            if exc.status == 404:
                return None
            raise

    async def push_file(
        self,
        owner: str,
        repo: str,
        path: str,
        content_b64: str,
        message: str,
        branch: str = "main",
        sha: Optional[str] = None,
    ) -> dict:
        """PUT /repos/{owner}/{repo}/contents/{path}"""
        payload: dict = {
            "message": message,
            "content": content_b64,
            "branch": branch,
        }
        if sha:
            payload["sha"] = sha
        return await self._request(
            "PUT",
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
            json=payload,
        )

    # ── Feature 4: Create Issue ───────────────────────────────

    async def create_issue(
        self,
        owner: str,
        repo: str,
        title: str,
        body: str,
        labels: list[str] | None = None,
    ) -> dict:
        """POST /repos/{owner}/{repo}/issues"""
        payload: dict = {"title": title, "body": body}
        if labels:
            payload["labels"] = labels
        return await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/issues",
            json=payload,
        )

    # ── Feature 5: Branch + PR helpers ────────────────────────

    async def get_branch_sha(self, owner: str, repo: str, branch: str) -> str:
        """Return the HEAD commit SHA of *branch*."""
        data = await self._request(
            "GET",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/ref/heads/{branch}",
        )
        return data["object"]["sha"]

    async def create_branch(
        self,
        owner: str,
        repo: str,
        new_branch: str,
        from_sha: str,
    ) -> dict:
        """POST /repos/{owner}/{repo}/git/refs — create a new branch."""
        return await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/refs",
            json={"ref": f"refs/heads/{new_branch}", "sha": from_sha},
        )

    async def create_pull_request(
        self,
        owner: str,
        repo: str,
        title: str,
        body: str,
        head: str,
        base: str = "main",
    ) -> dict:
        """POST /repos/{owner}/{repo}/pulls"""
        return await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls",
            json={"title": title, "body": body, "head": head, "base": base},
        )

    async def get_file_content(
        self,
        owner: str,
        repo: str,
        path: str,
        branch: str = "main",
    ) -> str:
        """Return the decoded text content of a file."""
        data = await self._request(
            "GET",
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}?ref={branch}",
        )
        return base64.b64decode(data["content"]).decode()

    # ── Provenance: commits, PRs, issues ────────────────────────

    async def list_commits_for_path(
        self,
        owner: str,
        repo: str,
        path: str,
        *,
        sha: str = "main",
        per_page: int = 30,
    ) -> list[dict]:
        """List commits that touched *path* on *sha* (branch or tag)."""
        from urllib.parse import quote

        enc_path = quote(path, safe="/")
        url = (
            f"{GITHUB_API}/repos/{owner}/{repo}/commits"
            f"?sha={quote(sha, safe='')}&path={enc_path}&per_page={per_page}"
        )
        data = await self._request("GET", url)
        return data if isinstance(data, list) else []

    async def get_commit(self, owner: str, repo: str, commit_sha: str) -> dict:
        """GET /repos/{owner}/{repo}/commits/{sha}"""
        return await self._request(
            "GET",
            f"{GITHUB_API}/repos/{owner}/{repo}/commits/{commit_sha}",
        )

    async def list_pull_requests_for_commit(
        self,
        owner: str,
        repo: str,
        commit_sha: str,
    ) -> list[dict]:
        """
        GET /repos/{owner}/{repo}/commits/{sha}/pulls
        Requires preview media type for some API versions.
        """
        headers = {
            **self._headers,
            "Accept": "application/vnd.github.groot-preview+json",
        }
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.request(
                "GET",
                f"{GITHUB_API}/repos/{owner}/{repo}/commits/{commit_sha}/pulls",
                headers=headers,
            )
            if resp.status_code not in (200, 404):
                body = resp.json() if resp.content else {}
                msg = body.get("message", resp.text[:300])
                raise GitHubAPIError(resp.status_code, msg, body)
            if resp.status_code == 404:
                return []
            data = resp.json()
            return data if isinstance(data, list) else []

    async def get_pull_request(self, owner: str, repo: str, number: int) -> dict:
        """GET /repos/{owner}/{repo}/pulls/{number}"""
        return await self._request(
            "GET",
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{number}",
        )

    async def get_issue(self, owner: str, repo: str, number: int) -> dict:
        """GET /repos/{owner}/{repo}/issues/{number}"""
        return await self._request(
            "GET",
            f"{GITHUB_API}/repos/{owner}/{repo}/issues/{number}",
        )

    # ── Full-codebase helpers ─────────────────────────────────

    async def list_tree(
        self,
        owner: str,
        repo: str,
        branch: str = "main",
    ) -> list[dict]:
        """GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1 — list all files."""
        data = await self._request(
            "GET",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1",
        )
        return data.get("tree", [])

    async def merge_pull_request(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        merge_method: str = "squash",
    ) -> dict:
        """PUT /repos/{owner}/{repo}/pulls/{pr_number}/merge"""
        return await self._request(
            "PUT",
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{pr_number}/merge",
            json={"merge_method": merge_method},
        )

    # ── Git Data API (bulk push) ──────────────────────────────

    async def create_blob(
        self, owner: str, repo: str, content_b64: str, encoding: str = "base64",
    ) -> str:
        """POST /repos/{owner}/{repo}/git/blobs — returns blob SHA."""
        data = await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/blobs",
            json={"content": content_b64, "encoding": encoding},
        )
        return data["sha"]

    async def create_tree(
        self,
        owner: str,
        repo: str,
        tree_items: list[dict],
        base_tree: str | None = None,
    ) -> str:
        """POST /repos/{owner}/{repo}/git/trees — returns tree SHA."""
        payload: dict = {"tree": tree_items}
        if base_tree:
            payload["base_tree"] = base_tree
        data = await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/trees",
            json=payload,
        )
        return data["sha"]

    async def create_commit(
        self,
        owner: str,
        repo: str,
        message: str,
        tree_sha: str,
        parent_shas: list[str] | None = None,
    ) -> str:
        """POST /repos/{owner}/{repo}/git/commits — returns commit SHA."""
        payload: dict = {"message": message, "tree": tree_sha}
        if parent_shas:
            payload["parents"] = parent_shas
        else:
            payload["parents"] = []
        data = await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/commits",
            json=payload,
        )
        return data["sha"]

    async def create_ref(
        self, owner: str, repo: str, ref: str, sha: str,
    ) -> dict:
        """POST /repos/{owner}/{repo}/git/refs — create a new ref (e.g. heads/main)."""
        return await self._request(
            "POST",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/refs",
            json={"ref": ref, "sha": sha},
        )

    async def update_ref(
        self, owner: str, repo: str, ref: str, sha: str, force: bool = False,
    ) -> dict:
        """PATCH /repos/{owner}/{repo}/git/refs/{ref}"""
        return await self._request(
            "PATCH",
            f"{GITHUB_API}/repos/{owner}/{repo}/git/refs/{ref}",
            json={"sha": sha, "force": force},
        )

    # ── Bulk push helper ──────────────────────────────────────

    _SKIP_DIRS = {
        "node_modules", ".git", "__pycache__", ".next", "dist", "build",
        "venv", ".venv", ".tox", "vendor", "target", ".idea", ".vscode",
    }
    _MAX_AGGREGATE_BYTES = 80 * 1024 * 1024  # 80 MB safety cap

    async def push_directory(
        self,
        owner: str,
        repo: str,
        local_path: str,
        branch: str = "main",
        message: str = "Initial commit via DocuVerse",
    ) -> dict:
        """
        Push the entire contents of *local_path* to *owner/repo* in a
        single commit using the Git Data API (blobs → tree → commit → ref).

        Works on empty repos (no existing commits).
        Returns ``{"commit_sha": ..., "files_pushed": int}``.
        """
        # ── Collect files ──────────────────────────────────────
        file_entries: list[tuple[str, str]] = []  # (repo_relative_path, abs_path)
        total_bytes = 0
        for dirpath, dirnames, filenames in os.walk(local_path):
            dirnames[:] = [d for d in dirnames if d not in self._SKIP_DIRS]
            for fname in filenames:
                abs_fp = os.path.join(dirpath, fname)
                size = os.path.getsize(abs_fp)
                total_bytes += size
                if total_bytes > self._MAX_AGGREGATE_BYTES:
                    raise GitHubAPIError(
                        413, f"Total upload exceeds {self._MAX_AGGREGATE_BYTES // (1024*1024)} MB limit"
                    )
                rel = os.path.relpath(abs_fp, local_path).replace("\\", "/")
                file_entries.append((rel, abs_fp))

        if not file_entries:
            raise GitHubAPIError(400, "No files found to push")

        # ── Check if repo is empty (no commits) ───────────────
        repo_is_empty = False
        try:
            await self.get_branch_sha(owner, repo, branch)
        except GitHubAPIError:
            repo_is_empty = True

        if repo_is_empty:
            # GitHub's Git Data API (blobs/trees/commits) doesn't work
            # on repos with zero commits.  Bootstrap with a single file
            # via the Contents API, which handles empty repos.
            first_rel, first_abs = file_entries[0]
            with open(first_abs, "rb") as fh:
                first_b64 = base64.b64encode(fh.read()).decode()
            await self.push_file(
                owner, repo, first_rel, first_b64,
                message="Initial commit — uploaded via DocuVerse",
                branch=branch,
            )
            # Remove the bootstrapped file from the list
            file_entries = file_entries[1:]
            if not file_entries:
                # Only had one file — we're done
                head = await self.get_branch_sha(owner, repo, branch)
                return {"commit_sha": head, "files_pushed": 1}

        # ── Create blobs (parallelised in batches of 10) ──────
        BATCH = 10
        blob_shas: dict[str, str] = {}   # rel_path → blob SHA

        for i in range(0, len(file_entries), BATCH):
            batch = file_entries[i : i + BATCH]

            async def _create_one(rel: str, absp: str) -> tuple[str, str]:
                with open(absp, "rb") as fh:
                    raw = fh.read()
                b64 = base64.b64encode(raw).decode()
                sha = await self.create_blob(owner, repo, b64)
                return (rel, sha)

            results = await asyncio.gather(
                *[_create_one(rel, absp) for rel, absp in batch]
            )
            for rel, sha in results:
                blob_shas[rel] = sha

        # ── Build tree ─────────────────────────────────────────
        tree_items = [
            {"path": rel, "mode": "100644", "type": "blob", "sha": sha}
            for rel, sha in blob_shas.items()
        ]
        parent_sha = await self.get_branch_sha(owner, repo, branch)
        tree_sha = await self.create_tree(owner, repo, tree_items, base_tree=None)

        # ── Create commit ──────────────────────────────────────
        commit_sha = await self.create_commit(
            owner, repo, message, tree_sha, [parent_sha],
        )

        # ── Point branch at the new commit ─────────────────────
        await self.update_ref(owner, repo, f"heads/{branch}", commit_sha)

        total_pushed = len(blob_shas) + (1 if repo_is_empty else 0)
        return {"commit_sha": commit_sha, "files_pushed": total_pushed}
