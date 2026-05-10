"""Saved component blocks: route_index enrichment."""

from app.api.endpoints.studio import _enrich_component_block_from_route_index


def test_enrich_adds_source_from_route_index():
    session = {
        "route_index": {
            "dv_abc123": {
                "dv_id": "dv_abc123",
                "file": "src/app/page.tsx",
                "line": 42,
                "col": 10,
                "tag": "motion.span",
            }
        }
    }
    block = {"id": "blk_x", "label": "Hero", "dv_id": "dv_abc123", "tag": None}
    out = _enrich_component_block_from_route_index(block, session)
    assert out["source_file"] == "src/app/page.tsx"
    assert out["source_line"] == 42
    assert out["source_col"] == 10
    assert out["tag"] == "motion.span"


def test_enrich_noop_without_dv_id():
    session = {"route_index": {}}
    block = {"id": "blk_x", "label": "X"}
    out = _enrich_component_block_from_route_index(block, session)
    assert "source_file" not in out


def test_enrich_preserves_existing_source_file():
    session = {
        "route_index": {
            "dv_old": {
                "file": "new.tsx",
                "line": 99,
                "col": 1,
                "tag": "div",
            }
        }
    }
    block = {
        "dv_id": "dv_old",
        "source_file": "kept.tsx",
        "source_line": 1,
    }
    out = _enrich_component_block_from_route_index(block, session)
    assert out["source_file"] == "kept.tsx"
    assert out["source_line"] == 1
