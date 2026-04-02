"""Tests for provenance evidence ranking."""

import unittest

from app.services.history_miner import MinedHistory, RawCommitInfo, RawPullInfo
from app.services.evidence_ranker import rank_and_build_links


class TestEvidenceRanker(unittest.TestCase):
    def test_orders_pulls_above_commits(self):
        h = MinedHistory()
        h.commits.append(
            RawCommitInfo(
                sha="abc",
                message="fix: thing",
                html_url="https://github.com/o/r/commit/abc",
                date="2024-01-01T00:00:00Z",
                author_login="a",
            )
        )
        h.pulls.append(
            RawPullInfo(
                number=1,
                title="Add feature",
                body="Desc",
                html_url="https://github.com/o/r/pull/1",
                merged_at="2024-01-02T00:00:00Z",
                state="closed",
            )
        )
        links = rank_and_build_links(h, max_links=10)
        self.assertGreaterEqual(len(links), 2)
        self.assertEqual(links[0].source_type.value, "pull_request")

    def test_placeholder_when_empty(self):
        h = MinedHistory()
        links = rank_and_build_links(h, max_links=5)
        self.assertTrue(len(links) >= 1)
        self.assertIn("No Git history", links[0].title)


if __name__ == "__main__":
    unittest.main()
