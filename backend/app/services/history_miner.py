"""
GitHub API–backed history mining for DocuVerse Provenance.

Collects commits touching a path, linked pull requests, and issue references
without requiring a full local git clone.
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from typing import Any

from app.services.github_service import GitHubService, GitHubAPIError

logger = logging.getLogger(__name__)

_ISSUE_RE = re.compile(r"(?:fixes|fix|close|closes|closed|resolve|resolves|resolved)\s+#(\d+)", re.I)
_BARE_ISSUE_RE = re.compile(r"#(\d+)")


@dataclass
class RawCommitInfo:
    sha: str
    message: str
    html_url: str
    date: str | None
    author_login: str | None


@dataclass
class RawPullInfo:
    number: int
    title: str
    body: str
    html_url: str
    merged_at: str | None
    state: str


@dataclass
class RawIssueRef:
    number: int
    title: str
    html_url: str


@dataclass
class MinedHistory:
    commits: list[RawCommitInfo] = field(default_factory=list)
    pulls: list[RawPullInfo] = field(default_factory=list)
    issues: list[RawIssueRef] = field(default_factory=list)
    commit_to_pr_numbers: dict[str, list[int]] = field(default_factory=dict)


def _issue_numbers_from_text(text: str, cap: int = 20) -> list[int]:
    if not text:
        return []
    nums: list[int] = []
    for m in _ISSUE_RE.finditer(text):
        nums.append(int(m.group(1)))
    if not nums:
        for m in _BARE_ISSUE_RE.finditer(text):
            nums.append(int(m.group(1)))
    seen: set[int] = set()
    out: list[int] = []
    for n in nums:
        if n not in seen:
            seen.add(n)
            out.append(n)
        if len(out) >= cap:
            break
    return out


async def mine_file_history(
    gh: GitHubService,
    owner: str,
    repo: str,
    file_path: str,
    *,
    branch: str,
    max_commits: int,
    max_prs: int,
    max_issue_fetches: int = 12,
) -> MinedHistory:
    """
    Fetch commits for *file_path* and expand into PRs and issue references.
    """
    result = MinedHistory()
    try:
        raw_commits = await gh.list_commits_for_path(
            owner, repo, file_path, sha=branch, per_page=max_commits
        )
    except GitHubAPIError as e:
        logger.warning("list_commits_for_path failed: %s", e)
        return result

    if not isinstance(raw_commits, list):
        return result

    seen_shas: set[str] = set()
    for c in raw_commits[:max_commits]:
        sha = (c or {}).get("sha") or ""
        if not sha or sha in seen_shas:
            continue
        seen_shas.add(sha)
        commit_obj = (c or {}).get("commit") or {}
        msg = (commit_obj.get("message") or "").strip()
        author = ((c or {}).get("author") or {}) or {}
        login = author.get("login")
        date = (author.get("date") or (commit_obj.get("author") or {}).get("date"))
        html_url = (c or {}).get("html_url") or f"https://github.com/{owner}/{repo}/commit/{sha}"
        result.commits.append(
            RawCommitInfo(
                sha=sha,
                message=msg,
                html_url=html_url,
                date=date,
                author_login=login,
            )
        )

        pr_numbers: list[int] = []
        try:
            pr_list = await gh.list_pull_requests_for_commit(owner, repo, sha)
        except GitHubAPIError:
            pr_list = []
        for pr in pr_list or []:
            num = pr.get("number")
            if isinstance(num, int):
                pr_numbers.append(num)
        result.commit_to_pr_numbers[sha] = pr_numbers

    # Unique PR numbers in commit order
    ordered_pr: list[int] = []
    seen_pr: set[int] = set()
    for commit in result.commits:
        for n in result.commit_to_pr_numbers.get(commit.sha, []):
            if n not in seen_pr:
                seen_pr.add(n)
                ordered_pr.append(n)

    pulls_by_num: dict[int, RawPullInfo] = {}
    for num in ordered_pr[:max_prs]:
        try:
            pr_data = await gh.get_pull_request(owner, repo, num)
        except GitHubAPIError:
            continue
        pulls_by_num[num] = RawPullInfo(
            number=num,
            title=pr_data.get("title") or f"PR #{num}",
            body=pr_data.get("body") or "",
            html_url=pr_data.get("html_url") or f"https://github.com/{owner}/{repo}/pull/{num}",
            merged_at=pr_data.get("merged_at"),
            state=pr_data.get("state") or "unknown",
        )

    result.pulls = list(pulls_by_num.values())

    issue_nums: list[int] = []
    seen_iss: set[int] = set()
    for commit in result.commits:
        for n in _issue_numbers_from_text(commit.message):
            if n not in seen_iss:
                seen_iss.add(n)
                issue_nums.append(n)
    for pr in result.pulls:
        for n in _issue_numbers_from_text(pr.body):
            if n not in seen_iss and n not in pulls_by_num:
                seen_iss.add(n)
                issue_nums.append(n)
        for n in _issue_numbers_from_text(pr.title):
            if n not in seen_iss and n not in pulls_by_num:
                seen_iss.add(n)
                issue_nums.append(n)

    for n in issue_nums[:max_issue_fetches]:
        try:
            iss = await gh.get_issue(owner, repo, n)
        except GitHubAPIError:
            continue
        if "pull_request" in iss:
            continue
        result.issues.append(
            RawIssueRef(
                number=n,
                title=iss.get("title") or f"Issue #{n}",
                html_url=iss.get("html_url") or f"https://github.com/{owner}/{repo}/issues/{n}",
            )
        )

    return result
