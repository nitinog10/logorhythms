"""Assumption extractor fallback behavior (no Bedrock)."""

import unittest

from app.services.assumption_extractor import _fallback, map_extraction_to_models


class TestAssumptionExtractor(unittest.TestCase):
    def test_fallback_shape(self):
        d = _fallback("fn", "path/to/x.py")
        self.assertIn("current_purpose", d)
        self.assertLessEqual(d["confidence_score"], 0.2)

    def test_map_extraction(self):
        data = {
            "current_purpose": "x",
            "origin_summary": "y",
            "decision_summary": "z",
            "assumptions": [{"statement": "async only", "confidence": 0.6, "evidence_nums": [1]}],
            "superseded": [],
            "safe_change_notes": [],
            "stale_hints": [],
            "decision_threads": [],
            "confidence_score": 0.7,
        }
        cur, origin, dec, asm, stale, safe, thr, conf = map_extraction_to_models(
            data, ["e1", "e2"], "f.py", None
        )
        self.assertEqual(cur, "x")
        self.assertEqual(len(asm), 1)
        self.assertEqual(asm[0][3], 0.6)
        self.assertEqual(asm[0][4], ["e1"])


if __name__ == "__main__":
    unittest.main()
