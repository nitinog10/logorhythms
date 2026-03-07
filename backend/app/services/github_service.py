"""
GitHub API Service — centralised helper for all GitHub REST API calls.
Instantiate per-request with the authenticated user's GitHub access token.
"""

import base64
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
        async with httpx.AsyncClient(timeout=30) as client:
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
