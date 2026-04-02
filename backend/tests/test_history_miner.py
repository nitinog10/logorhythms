"""Tests for GitHub history mining helpers."""

import unittest

from app.services.history_miner import _issue_numbers_from_text


class TestHistoryMiner(unittest.TestCase):
    def test_finds_fixes_keyword(self):
        text = "This Fixes #12 and closes #34 for good"
        nums = _issue_numbers_from_text(text)
        self.assertIn(12, nums)
        self.assertIn(34, nums)

    def test_dedupes(self):
        text = "Fixes #1 see also #1"
        nums = _issue_numbers_from_text(text)
        self.assertEqual(nums, [1])


if __name__ == "__main__":
    unittest.main()
