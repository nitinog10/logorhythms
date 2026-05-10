"""Unit tests for the deterministic surgical edit planner and patch helpers."""

from app.services import surgical_edit_engine as see


def test_canonical_plan_prompt_strips_edit():
    assert see._canonical_plan_prompt("/edit make it purple") == "make it purple"
    assert see._canonical_plan_prompt("/e rounded corners") == "rounded corners"
    assert see._canonical_plan_prompt("plain text") == "plain text"


def test_detect_color_prefers_last_mentioned():
    assert see._detect_color("from blue to purple") == "purple"
    assert see._detect_color("swap red for green") == "green"


def test_detect_text_change_unquoted():
    assert see._detect_text_change("change text to Submit") == "Submit"
    assert see._detect_text_change('change text to "Hi"') == "Hi"


def test_detect_misc_tailwind_rounded_shadow():
    assert "rounded-lg" in see._detect_misc_tailwind("give it rounded corners")
    assert "shadow-md" in see._detect_misc_tailwind("add a shadow")


def test_plan_empty_note_when_color_but_no_anchor():
    plan = see._plan_from_prompt(
        prompt="make purple",
        anchor_dv_id=None,
        route_index={"x:1:1": {"file": "a.tsx", "line": 1, "col": 1}},
        workspace=".",
        classification={},
    )
    assert not plan.ops
    assert plan.notes and "anchored" in plan.notes[0].lower()


def test_plan_color_with_anchor_and_route():
    dv = "src/app/page.tsx:4:11"
    ridx = {dv: {"file": "src/app/page.tsx", "line": 4, "col": 11}}
    plan = see._plan_from_prompt(
        prompt="make label purple",
        anchor_dv_id=dv,
        route_index=ridx,
        workspace=".",
        classification={},
    )
    assert len(plan.ops) == 1
    assert plan.ops[0].op == "set_class_token"
    assert plan.ops[0].args.get("value") == "text-purple-500"


def test_apply_append_tailwind_merges_and_drops_shadow():
    src = '<div className="shadow-md p-2">\nhello\n</div>'
    out = see._apply_append_tailwind(src, 1, 1, {"tokens": ["shadow-none", "rounded-lg"]})
    assert "shadow-none" in out
    assert "rounded-lg" in out
    assert "shadow-md" not in out


def test_apply_append_tailwind_injects_classname():
    src = "<button>\nok\n</button>"
    out = see._apply_append_tailwind(src, 1, 1, {"tokens": ["font-bold"]})
    assert 'className="font-bold"' in out


def test_apply_style_decl_injects_style_object():
    src = '<div className="p-2">\nhello\n</div>'
    out = see._apply_style_decl(src, 1, 1, {"property": "margin-top", "value": "12px"})
    assert "12px" in out
    assert "style={{" in out


def test_should_try_llm_fallback_skips_when_pick_needed():
    plan = see.EditPlan(summary="", ops=[], notes=["Use **Pick for AI**"])
    assert not see._should_try_llm_fallback(plan, "a:1:1", {"a:1:1": {}})


def test_should_try_llm_fallback_when_heuristic_misses():
    plan = see.EditPlan(
        summary="",
        ops=[],
        notes=["Phase 2.1 will route"],
    )
    assert see._should_try_llm_fallback(plan, "a:1:1", {"a:1:1": {}})


def test_parse_llm_plan_json_fenced():
    raw = '```json\n{"summary":"ok","ops":[{"op":"set_text","args":{"text":"Hi"}}]}\n```'
    data = see._parse_llm_plan_json(raw)
    assert data and data.get("summary") == "ok"
    assert len(data.get("ops")) == 1


def test_sanitize_set_text_value_strips_noise():
    assert see._sanitize_set_text_value(">Features we provide") == "Features we provide"
    assert see._sanitize_set_text_value("Hello</motion.h2>") == "Hello"
