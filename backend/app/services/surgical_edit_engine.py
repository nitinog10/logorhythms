"""
DocuVerse Studio — Surgical Edit Engine  (Phase 2)

Pipeline:  Classifier → Planner → Patcher → Validator → Applier

Replaces App Studio's regex hacks (``_apply_css_edit``) and the screen-level
Stitch round-trip with one engine that can edit *any* framework using:

  * The session ``route_index`` (built by ``dv_id_injector.build_route_index``)
    to resolve a clicked dv-id back to an exact ``file:line:col``.
  * Tree-sitter to locate / mutate the specific JSX opening element.
  * The existing ``edit_classifier`` to decide tier and risk.
  * The existing ``checkpoint_engine`` to record undoable file deltas.

Edit op types (deterministic, no LLM round-trip required):

  * ``set_class_token``  — replace one Tailwind class on the anchor element.
                          e.g. ``bg-blue-500 -> bg-purple-500``
  * ``set_style_decl``    — set / override an inline ``style`` declaration
                          on the anchor element.
  * ``set_text``          — replace the text content of the anchor element
                          (only works on simple text-only children).
  * ``append_tailwind``   — merge extra utility classes onto ``className`` when
                          the user asks for rounding, shadows, size, etc.
  * ``replace_in_file``   — anchored regex replace inside a file (surgical
                          last-resort; used when LLM proposes structural
                          edits).

LLM-assisted ops (Phase 2.1):

  * ``llm_plan`` / Nova Lite — when heuristics are empty but the click anchor
    resolves in ``route_index``; JSX AST outline + file snippet are sent for context.

This module is intentionally synchronous (called via asyncio.to_thread).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.services import checkpoint_engine
from app.services.studio_session_service import load_session, record_edit
from app.config import get_settings

logger = logging.getLogger(__name__)


def _sync_generated_fullstack_manifest(
    session: Dict[str, Any],
    workspace: str,
    deltas: Dict[str, Tuple[Optional[str], Optional[str]]],
) -> None:
    """Keep builder ``fullstack_files`` in sync with disk so the next Launch
    does not wipe AI edits via ``write_project_files`` (which rewrites from DB)."""
    if session.get("kind") != "generated":
        return
    source_id = session.get("source_id")
    if not source_id or not deltas:
        return
    from app.services.builder_persistence import load_builder_project, save_builder_project

    project = load_builder_project(str(source_id))
    if not project:
        return
    fs: Dict[str, str] = dict(project.get("fullstack_files") or {})
    for rel, (_before, after) in deltas.items():
        key = rel.replace("\\", "/")
        if after is None:
            fs.pop(key, None)
        else:
            fs[key] = after
    project["fullstack_files"] = fs
    save_builder_project(project)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class EditOp:
    op: str                                   # set_class_token | append_tailwind | set_style_decl | set_text | replace_in_file
    dv_id: Optional[str] = None              # element anchor (for element ops)
    file: Optional[str] = None               # file anchor (for replace_in_file)
    args: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EditPlan:
    summary: str
    ops: List[EditOp] = field(default_factory=list)
    needs_confirmation: bool = False
    notes: List[str] = field(default_factory=list)


@dataclass
class EditResult:
    success: bool
    summary: str
    files_changed: List[str] = field(default_factory=list)
    checkpoint_id: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def execute(
    *,
    session_id: str,
    prompt: str,
    anchor_dv_id: Optional[str] = None,
    extra_context: Optional[Dict[str, Any]] = None,
) -> EditResult:
    """End-to-end: take a prompt + anchor, produce + apply file deltas."""
    session = load_session(session_id)
    if not session:
        return EditResult(success=False, summary="Session not found", errors=["session.not_found"])

    workspace = session.get("workspace_path")
    if not workspace or not Path(workspace).is_dir():
        return EditResult(
            success=False,
            summary="Session has no workspace on disk",
            errors=["workspace.missing"],
        )

    route_index: Dict[str, Any] = session.get("route_index") or {}

    # 1) Classifier — already exists; just call it for shape
    from app.services.edit_classifier import classify_edit
    cls = classify_edit(prompt, repo_kind=session.get("kind", "imported"))
    cls_dict = cls.to_dict()

    # 2) Planner — for now we use a deterministic planner that only handles
    #    the "single anchor, single attribute" case. The LLM-assisted branch
    #    will fold in here as we layer it.
    plan = _plan_from_prompt(
        prompt=prompt,
        anchor_dv_id=anchor_dv_id,
        route_index=route_index,
        workspace=workspace,
        classification=cls_dict,
    )

    llm_planner_hint: Optional[str] = None
    if _should_try_llm_fallback(plan, anchor_dv_id, route_index) and get_settings().studio_surgical_llm_planner:
        m = route_index.get(anchor_dv_id or "")
        if isinstance(m, dict):
            llm_plan = _llm_plan_from_nova(
                user_prompt=_canonical_plan_prompt(prompt.strip()),
                anchor_dv_id=anchor_dv_id or "",
                mapping=m,
                workspace=workspace,
            )
            if llm_plan and llm_plan.ops:
                plan = llm_plan
            else:
                llm_planner_hint = (
                    "The anchored Nova Lite planner did not return an applicable edit. "
                    "Confirm AWS Bedrock access, try simpler wording, or use **Pick for AI** "
                    "on a more specific element."
                )

    if not plan.ops:
        final_notes = list(plan.notes)
        if llm_planner_hint:
            final_notes.append(llm_planner_hint)
        return EditResult(
            success=False,
            summary=plan.summary or "No actionable change derived from the prompt.",
            errors=["plan.empty"],
            notes=final_notes,
        )

    # 3) Patcher — convert ops to file-level deltas (path -> {before, after})
    deltas: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
    op_errors: List[str] = []
    for op in plan.ops:
        try:
            apply_op(op, workspace=workspace, route_index=route_index, deltas=deltas)
        except Exception as e:
            logger.warning(f"surgical_edit: op {op.op} failed: {e}")
            op_errors.append(f"{op.op}: {e}")

    if not deltas:
        return EditResult(
            success=False,
            summary="Edit could not be applied",
            errors=op_errors or ["patcher.no_change"],
            notes=plan.notes,
        )

    # 4) Validator — re-parse each modified file and ensure it's still valid.
    validation_errors = _validate(deltas)
    if validation_errors:
        return EditResult(
            success=False,
            summary="Edit produced invalid code; rolled back",
            errors=validation_errors,
            notes=plan.notes,
        )

    # 5) Applier — write to disk + record checkpoint
    workspace_path = Path(workspace)
    files_for_checkpoint: List[Dict[str, Optional[str]]] = []
    files_changed: List[str] = []
    for rel, (before, after) in deltas.items():
        abs_p = workspace_path / rel
        abs_p.parent.mkdir(parents=True, exist_ok=True)
        if after is None:
            try:
                abs_p.unlink()
            except OSError:
                pass
        else:
            abs_p.write_text(after, encoding="utf-8")
        files_for_checkpoint.append({"path": rel, "before": before, "after": after})
        files_changed.append(rel)

    _sync_generated_fullstack_manifest(session, workspace, deltas)

    cp = checkpoint_engine.record_checkpoint(
        session_id,
        label=plan.summary or "AI edit",
        files=files_for_checkpoint,
    )

    # Record edit history
    record_edit(
        session_id,
        prompt=prompt,
        classification=cls_dict,
        files_touched=files_changed,
        result="applied",
    )

    return EditResult(
        success=True,
        summary=plan.summary,
        files_changed=files_changed,
        checkpoint_id=(cp or {}).get("id"),
        notes=plan.notes,
    )


# ---------------------------------------------------------------------------
# Planner — deterministic for now, LLM hook-point clearly marked
# ---------------------------------------------------------------------------

# Common color name -> tailwind 500 class
_COLOR_NAMES = {
    "red": "red", "orange": "orange", "amber": "amber", "yellow": "yellow",
    "lime": "lime", "green": "green", "emerald": "emerald", "teal": "teal",
    "cyan": "cyan", "sky": "sky", "blue": "blue", "indigo": "indigo",
    "violet": "violet", "purple": "purple", "fuchsia": "fuchsia", "pink": "pink",
    "rose": "rose", "slate": "slate", "gray": "gray", "grey": "gray",
    "zinc": "zinc", "neutral": "neutral", "stone": "stone",
    "black": "black", "white": "white",
}

_BG_VERBS = ("background", "bg", "fill")

def _canonical_plan_prompt(prompt: str) -> str:
    """Strip Studio slash intents so backend matches heuristics even if the raw
    message still carries a prefix (or a non-chat client omitted parsing)."""
    p = prompt.strip()
    if not p.startswith("/"):
        return p
    rest = p[1:].lstrip()
    m = re.match(r"^(\w+)\s*", rest)
    if not m:
        return prompt.strip()
    cmd = m.group(1).lower()
    tail = rest[m.end() :].strip()
    # Common ChatPanel intents — keep trailing natural-language instruction only.
    if cmd in {"edit", "e", "theme", "t", "explain", "component", "deploy", "studio", "msg", "message"}:
        return tail or prompt.strip()
    return tail or rest


def _plan_from_prompt(
    *,
    prompt: str,
    anchor_dv_id: Optional[str],
    route_index: Dict[str, Any],
    workspace: str,
    classification: Dict[str, Any],
) -> EditPlan:
    """Produce an EditPlan from a free-form prompt.

    Current heuristics (deterministic, no LLM):
      * "make X purple"          -> set_class_token / set_style_decl
      * "change text to Y"       -> set_text
      * "rename Z to Y in file"  -> replace_in_file (anchor required)

    Otherwise returns an empty plan with a note that an LLM round-trip is
    needed (Phase 2.1 hook).
    """
    raw = prompt.strip()
    plan_src = _canonical_plan_prompt(raw)
    p = plan_src.lower().strip()
    notes: List[str] = []

    # ── Color change ────────────────────────────────────────────────────────
    color = _detect_color(p)
    if color:
        if not anchor_dv_id:
            notes.append(
                "A color change was detected, but no element was anchored. "
                "Use **Pick for AI**, click the target, then send the message again."
            )
            return EditPlan(
                summary="Color change needs a selected element",
                ops=[],
                needs_confirmation=classification.get("requires_user_confirmation", False),
                notes=notes,
            )
        if anchor_dv_id not in route_index:
            notes.append(
                "The selection is not in the current **Source map** index. "
                "Run **Source map** again, reload the preview, re-pick the element, then retry."
            )
            return EditPlan(
                summary="Selection not mapped to source",
                ops=[],
                needs_confirmation=classification.get("requires_user_confirmation", False),
                notes=notes,
            )
        target = "background" if any(v in p for v in _BG_VERBS) else "text"
        token = f"bg-{color}-500" if target == "background" else f"text-{color}-500"
        return EditPlan(
            summary=f"Change {target} of selected element to {color}",
            ops=[
                EditOp(
                    op="set_class_token",
                    dv_id=anchor_dv_id,
                    args={"category": target, "value": token},
                )
            ],
            notes=notes,
        )

    # ── Text change: "change text to <X>" / "rename <X> to <Y>" ───────────
    text_change = _detect_text_change(plan_src)
    if text_change:
        if not anchor_dv_id:
            notes.append(
                "A text change was parsed, but no element was anchored. "
                "Pick the element in the preview, then send again."
            )
            return EditPlan(
                summary="Text change needs a selected element",
                ops=[],
                needs_confirmation=classification.get("requires_user_confirmation", False),
                notes=notes,
            )
        if anchor_dv_id not in route_index:
            notes.append(
                "The selection is not in the **Source map** index. Rebuild the map, reload, and re-pick."
            )
            return EditPlan(
                summary="Selection not mapped to source",
                ops=[],
                needs_confirmation=classification.get("requires_user_confirmation", False),
                notes=notes,
            )
        return EditPlan(
            summary=f"Change text to: {text_change[:60]}",
            ops=[
                EditOp(
                    op="set_text",
                    dv_id=anchor_dv_id,
                    args={"text": text_change},
                )
            ],
        )

    # ── Simple layout / utility phrases (append Tailwind) ─────────────────
    tw = _detect_misc_tailwind(p)
    if tw:
        if not anchor_dv_id:
            notes.append(
                "Layout and class tweaks need a picked element. "
                "Use **Pick for AI**, click the target, then repeat the request."
            )
            return EditPlan(
                summary="Class tweak needs a selected element",
                ops=[],
                needs_confirmation=classification.get("requires_user_confirmation", False),
                notes=notes,
            )
        if anchor_dv_id not in route_index:
            notes.append(
                "The selection is not in the **Source map** index. Rebuild the map, reload, and re-pick."
            )
            return EditPlan(
                summary="Selection not mapped to source",
                ops=[],
                needs_confirmation=classification.get("requires_user_confirmation", False),
                notes=notes,
            )
        return EditPlan(
            summary=f"Add classes: {' '.join(tw)}",
            ops=[EditOp(op="append_tailwind", dv_id=anchor_dv_id, args={"tokens": tw})],
            notes=notes,
        )

    # ── Fall-through: heuristic miss (Nova may still plan if anchored) ─────
    notes.append(
        "No short-form rule matched this wording. With **Pick for AI** and a **Source map**, "
        "the Nova Lite planner (Phase 2.1) can suggest class, text, or same-file replacements."
    )
    return EditPlan(
        summary=plan_src[:80] or raw[:80],
        ops=[],
        needs_confirmation=classification.get("requires_user_confirmation", False),
        notes=notes,
    )


def _detect_color(p: str) -> Optional[str]:
    """Pick the rightmost color token so phrases like "from blue to purple"
    resolve to the destination color."""
    best: Optional[Tuple[int, str]] = None
    for word, palette in _COLOR_NAMES.items():
        for m in re.finditer(rf"\b{re.escape(word)}\b", p, flags=re.I):
            if best is None or m.start() >= best[0]:
                best = (m.start(), palette)
    return best[1] if best else None


_TEXT_CHANGE_PATTERNS = [
    re.compile(r'(?:change|set|update|make)\s+(?:the\s+)?text\s+(?:to|=)\s*["“](.+?)["”]', re.I),
    re.compile(r"(?:change|set|update|make)\s+(?:the\s+)?text\s+(?:to|=)\s*'(.+?)'", re.I),
    re.compile(r'(?:rename|relabel)\s+(?:it\s+)?to\s+["“](.+?)["”]', re.I),
    re.compile(r"(?:rename|relabel)\s+(?:it\s+)?to\s+'(.+?)'", re.I),
]

_UNQUOTED_TEXT_CHANGE = re.compile(
    r"(?:change|set|update|make)\s+(?:the\s+)?text\s+(?:to|=)\s+(.+)$",
    re.I,
)


def _scrub_unquoted_text_value(s: str) -> str:
    s = s.strip()
    s = re.split(r"[\n\r]", s, maxsplit=1)[0]
    s = s.strip().rstrip(".,!?;:")
    # Drop trailing parentheticals / "and also ..."
    s = re.split(r"\s+(?:and|but)\s+", s, maxsplit=1)[0].strip()
    return s[:500]


def _detect_text_change(prompt: str) -> Optional[str]:
    for pat in _TEXT_CHANGE_PATTERNS:
        m = pat.search(prompt)
        if m:
            return m.group(1).strip()
    m2 = _UNQUOTED_TEXT_CHANGE.search(prompt.strip())
    if m2:
        inner = _scrub_unquoted_text_value(m2.group(1))
        if inner and not re.match(r'^["\']', inner):
            return inner
    return None


def _detect_misc_tailwind(p: str) -> List[str]:
    """Heuristic Tailwind tokens for very short natural phrases (no LLM)."""
    out: List[str] = []

    def negated(pattern: str) -> bool:
        return bool(re.search(pattern, p))

    if negated(r"\b(no|without|remove)\s+shadow\b") or negated(r"\bdrop\s+shadow\s+off\b"):
        out.append("shadow-none")
    elif re.search(r"\bshadow\b", p):
        out.append("shadow-md")

    if negated(r"\b(not|no)\s+rounded\b"):
        out.append("rounded-none")
    elif re.search(r"\b(rounded|round\s+corners?|radius)\b", p):
        out.append("rounded-lg")

    if re.search(r"\b(bigger|larger)\b", p) and not negated(r"\b(not|no)\s+(bigger|larger)\b"):
        out.append("text-lg")
    elif re.search(r"\b(smaller|reduce\s+text)\b", p) and not negated(r"\b(not|no)\s+smaller\b"):
        out.append("text-sm")

    if re.search(r"\b(bold|bolder)\b", p):
        out.append("font-bold")
    if re.search(r"\bunderline(d)?\b", p) and not negated(r"\b(no|without)\s+underline\b"):
        out.append("underline")

    if re.search(r"\b(more\s+padding|extra\s+padding|increase\s+padding)\b", p):
        out.append("p-6")
    elif re.search(r"\bpadding\b", p) and not negated(r"\b(no|less)\s+padding\b"):
        out.append("p-4")

    if re.search(r"\b(more\s+margin|extra\s+margin)\b", p):
        out.append("m-6")
    elif re.search(r"\bmargin\b", p) and not negated(r"\b(no|less)\s+margin\b"):
        out.append("m-4")

    if re.search(r"\b(gap|spacing\s+between)\b", p):
        out.append("gap-4")

    if re.search(r"\b(center|centre)\s+(the\s+)?text\b", p) or re.search(
        r"\btext\s+(center|centre)(ed)?\b", p
    ):
        out.append("text-center")

    if re.search(r"\bborder\b", p) and not negated(r"\b(no|without|remove)\s+border\b"):
        out.append("border")
        out.append("border-gray-200")

    # De-dupe while keeping order
    seen: set[str] = set()
    uniq: List[str] = []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


_LLM_ALLOWED_OPS = frozenset(
    {"set_class_token", "append_tailwind", "set_text", "set_style_decl", "replace_in_file"}
)


def _should_try_llm_fallback(
    plan: EditPlan,
    anchor_dv_id: Optional[str],
    route_index: Dict[str, Any],
) -> bool:
    """Nova fallback only when heuristics returned nothing *and* we can resolve the anchor."""
    if plan.ops:
        return False
    if not anchor_dv_id or anchor_dv_id not in route_index:
        return False
    for n in plan.notes:
        low = n.lower()
        if "pick for ai" in low:
            return False
        if "not anchored" in low:
            return False
        if "not in" in low and "source map" in low:
            return False
        if "not mapped" in low and "source" in low:
            return False
    return True


def _anchor_file_snippet(workspace: str, mapping: Dict[str, Any], margin: int = 22) -> str:
    rel = mapping.get("file")
    if not rel:
        return ""
    p = Path(workspace) / rel
    if not p.is_file():
        return ""
    lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
    line = int(mapping.get("line") or 1)
    i = max(0, line - 1 - margin)
    j = min(len(lines), line + margin)
    return "\n".join(f"{k + 1:4d} | {lines[k]}" for k in range(i, j))


def _anchor_jsx_ast_outline(workspace: str, mapping: Dict[str, Any]) -> str:
    """Short JSX hierarchy from tree-sitter for Nova (Phase 2.1 context)."""
    rel = mapping.get("file")
    if not rel:
        return ""
    if Path(str(rel)).suffix.lower() not in (".tsx", ".jsx", ".ts", ".js"):
        return ""
    path = Path(workspace) / str(rel)
    if not path.is_file():
        return ""
    try:
        from app.services.dv_id_injector import (
            _byte_to_line_col,
            _extract_tag_name_and_after,
            _get_jsx_parser,
            _walk_tree,
        )
    except Exception:
        return ""
    parser = _get_jsx_parser()
    if not parser:
        return ""
    try:
        raw = path.read_bytes()
    except OSError:
        return ""
    if len(raw) > 1_500_000:
        return ""

    tree = parser.parse(raw)
    nodes: List[Any] = []
    _walk_tree(tree.root_node, nodes)
    target_line = int(mapping.get("line") or 1)
    target_col = int(mapping.get("col") or 1)

    def at_anchor(n: Any) -> bool:
        ln, co = _byte_to_line_col(raw, n.start_byte)
        return ln == target_line and co == target_col

    chosen: Any = None
    for n in nodes:
        if at_anchor(n):
            chosen = n
            break
    if chosen is None:
        for n in nodes:
            ln, _co = _byte_to_line_col(raw, n.start_byte)
            if ln == target_line:
                chosen = n
                break
    if chosen is None:
        return ""

    tags: List[str] = []
    cur: Any = chosen
    steps = 0
    while cur is not None and steps < 32:
        t = getattr(cur, "type", "")
        if t in ("jsx_opening_element", "jsx_self_closing_element"):
            info = _extract_tag_name_and_after(raw, cur)
            if info:
                tags.append(info[0])
        cur = getattr(cur, "parent", None)
        steps += 1
    if not tags:
        return ""
    outer_to_inner = " > ".join(reversed(tags))
    return f"- JSX nesting (outer → inner): {outer_to_inner}"


def _strip_llm_json_blob(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```"):
        chunks = s.split("```")
        if len(chunks) >= 2:
            inner = chunks[1]
            if inner.lstrip().lower().startswith("json"):
                inner = inner.split("\n", 1)[-1] if "\n" in inner else ""
            return inner.strip()
    return s


def _parse_llm_plan_json(raw: str) -> Optional[Dict[str, Any]]:
    text = _strip_llm_json_blob(raw)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        a, b = text.find("{"), text.rfind("}")
        if a >= 0 and b > a:
            try:
                data = json.loads(text[a : b + 1])
                return data if isinstance(data, dict) else None
            except json.JSONDecodeError:
                return None
        return None


def _llm_plan_from_nova(
    *,
    user_prompt: str,
    anchor_dv_id: str,
    mapping: Dict[str, Any],
    workspace: str,
) -> Optional[EditPlan]:
    snippet = _anchor_file_snippet(workspace, mapping)
    if not snippet.strip():
        return None
    ast_hint = _anchor_jsx_ast_outline(workspace, mapping)
    tag = mapping.get("tag") or "?"
    system_prompt = (
        "You are a surgical UI editor for Next.js + React + Tailwind. "
        "Reply with ONE JSON object only — no markdown, no prose. "
        'Shape: {"summary":"string","ops":[{"op":"...","args":{}}]}. '
        "For replace_in_file also include top-level key \"file\" equal to the anchor file path when using that op. "
        f"Allowed op names: {sorted(_LLM_ALLOWED_OPS)}. "
        "At most 2 ops. Prefer Tailwind utility tokens. "
        "replace_in_file is ONLY for the same file as the anchored element; args: find (short literal snippet), "
        "replace (string), optional regex (false unless necessary). "
        "For set_text, args.text must be human-visible copy only — no < or > characters, "
        "no tags, never start the string with '>'."
    )
    ast_block = f"\n## JSX structure (tree-sitter)\n{ast_hint}\n" if ast_hint else ""
    payload = f"""## Resolved element
- Tag: {tag}
- File: `{mapping.get("file")}`  line {mapping.get("line")}  col {mapping.get("col")}
{ast_block}
## Numbered source (prefix is line number)
```
{snippet}
```

## Instruction
{user_prompt}

If unsafe or unclear, return {{"summary":"Cannot apply safely","ops":[]}}.
"""
    try:
        from app.services.bedrock_client import call_nova_lite_sync

        raw = call_nova_lite_sync(
            payload,
            max_tokens=900,
            temperature=0.15,
            system_prompt=system_prompt,
        )
    except Exception as e:
        logger.warning("Nova surgical planner failed: %s", e)
        return None
    data = _parse_llm_plan_json(raw)
    if not data:
        logger.warning("Nova surgical planner returned unparseable JSON")
        return None
    ops_raw = data.get("ops")
    if not isinstance(ops_raw, list):
        return None
    summary = str(data.get("summary") or "Planned edit")[:220]
    edit_ops: List[EditOp] = []
    for item in ops_raw[:2]:
        if not isinstance(item, dict):
            continue
        opn = str(item.get("op") or "").strip()
        if opn not in _LLM_ALLOWED_OPS:
            continue
        args = item.get("args")
        if not isinstance(args, dict):
            continue
        if opn == "replace_in_file":
            anchor_rel = str(mapping.get("file") or "").replace("\\", "/")
            file_arg = str(item.get("file") or args.get("file") or "").strip().replace("\\", "/")
            if not anchor_rel or file_arg != anchor_rel:
                continue
            find = str(args.get("find") or "")
            replace = str(args.get("replace") if args.get("replace") is not None else "")
            if not find or len(find) > 4000:
                continue
            is_regex = bool(args.get("regex"))
            flags = int(args.get("regex_flags") or 0)
            edit_ops.append(
                EditOp(
                    op=opn,
                    file=file_arg,
                    args={"find": find, "replace": replace, "regex": is_regex, "regex_flags": flags},
                )
            )
            continue
        if opn == "set_class_token":
            cat = args.get("category", "text")
            if cat not in ("background", "text"):
                cat = "text"
            val = str(args.get("value") or "").strip()
            if not val:
                continue
            edit_ops.append(
                EditOp(op=opn, dv_id=anchor_dv_id, args={"category": cat, "value": val})
            )
        elif opn == "append_tailwind":
            tks = args.get("tokens")
            if isinstance(tks, list):
                toks = [str(x).strip() for x in tks if str(x).strip()]
            elif isinstance(tks, str) and tks.strip():
                toks = tks.split()
            else:
                continue
            if not toks:
                continue
            edit_ops.append(EditOp(op=opn, dv_id=anchor_dv_id, args={"tokens": toks}))
        elif opn == "set_text":
            tx = _sanitize_set_text_value(str(args.get("text") or ""))
            if not tx:
                continue
            edit_ops.append(EditOp(op=opn, dv_id=anchor_dv_id, args={"text": tx}))
        elif opn == "set_style_decl":
            prop = str(args.get("property") or "").strip()
            val = str(args.get("value") if args.get("value") is not None else "")
            if not prop:
                continue
            edit_ops.append(
                EditOp(op=opn, dv_id=anchor_dv_id, args={"property": prop, "value": val})
            )
    if not edit_ops:
        return None
    return EditPlan(
        summary=summary,
        ops=edit_ops,
        notes=["Applied via Nova Lite planner (anchored edit)."],
    )


# ---------------------------------------------------------------------------
# Patcher — turn ops into file deltas
# ---------------------------------------------------------------------------

def apply_op(
    op: EditOp,
    *,
    workspace: str,
    route_index: Dict[str, Any],
    deltas: Dict[str, Tuple[Optional[str], Optional[str]]],
) -> None:
    """Mutate ``deltas`` in-place to apply a single op."""
    if op.op in ("set_class_token", "set_style_decl", "set_text", "append_tailwind"):
        if not op.dv_id or op.dv_id not in route_index:
            raise ValueError(f"unknown dv_id: {op.dv_id}")
        mapping = route_index[op.dv_id]
        rel = mapping["file"]
        line = mapping["line"]
        col = mapping["col"]
        before, after = _read_with_delta(workspace, rel, deltas)

        if op.op == "set_class_token":
            new_after = _apply_class_token(after, line, col, op.args)
        elif op.op == "append_tailwind":
            new_after = _apply_append_tailwind(after, line, col, op.args)
        elif op.op == "set_style_decl":
            new_after = _apply_style_decl(after, line, col, op.args)
        else:  # set_text
            new_after = _apply_set_text(after, line, col, op.args)
        if new_after != after:
            deltas[rel] = (before, new_after)
        return

    if op.op == "replace_in_file":
        if not op.file:
            raise ValueError("replace_in_file requires file")
        rel = op.file
        before, after = _read_with_delta(workspace, rel, deltas)
        find = op.args.get("find")
        replace = op.args.get("replace", "")
        if not find:
            raise ValueError("replace_in_file requires find")
        flags = op.args.get("regex_flags", 0)
        is_regex = bool(op.args.get("regex"))
        if is_regex:
            new_after, n = re.subn(find, replace, after, flags=flags)
        else:
            n = after.count(find)
            new_after = after.replace(find, replace) if n else after
        if n == 0:
            raise ValueError("anchor 'find' not present in file")
        if new_after != after:
            deltas[rel] = (before, new_after)
        return

    raise ValueError(f"Unknown op: {op.op}")


def _read_with_delta(
    workspace: str,
    rel: str,
    deltas: Dict[str, Tuple[Optional[str], Optional[str]]],
) -> Tuple[Optional[str], str]:
    """Read the current logical content of a file given pending deltas.

    Returns (original_before, current_working_content).
    """
    if rel in deltas:
        before, after = deltas[rel]
        return before, (after or "")
    abs_p = Path(workspace) / rel
    if not abs_p.is_file():
        raise FileNotFoundError(f"file not found: {rel}")
    txt = abs_p.read_text(encoding="utf-8", errors="replace")
    return txt, txt


# ── Element-level patchers ────────────────────────────────────────────────

_OPENING_TAG_RE = re.compile(r"<(?P<tag>[A-Za-z][\w.-]*)(?P<rest>[^>]*?)(?P<self>/?)>")


def _find_opening_tag_at(content: str, line: int, col: int) -> Optional[Tuple[int, int]]:
    """Locate the JSX opening tag that starts at (line, col).

    Returns (match_start, match_end) byte indices into ``content``. Falls
    back to the tag whose start line matches if column is slightly off.
    """
    lines = content.splitlines(keepends=True)
    if line - 1 >= len(lines):
        return None
    # Compute byte offset of the start of the target line
    offset = sum(len(l) for l in lines[: line - 1])
    line_text = lines[line - 1]

    # Try exact column first
    target_col = max(0, col - 1)
    candidate_start = offset + target_col
    m = _OPENING_TAG_RE.match(content, candidate_start)
    if m:
        return m.start(), m.end()

    # Otherwise find the first opening tag on this line
    m = _OPENING_TAG_RE.search(line_text)
    if m:
        return offset + m.start(), offset + m.end()
    return None


def _apply_class_token(content: str, line: int, col: int, args: Dict[str, Any]) -> str:
    """Replace a tailwind class token in the className attribute of the
    opening tag at (line, col)."""
    span = _find_opening_tag_at(content, line, col)
    if not span:
        raise ValueError("could not locate opening tag")
    start, end = span
    tag_text = content[start:end]
    category = args.get("category", "background")
    new_token = args["value"]
    prefix = "bg-" if category == "background" else "text-"

    # Find className/class attribute
    cls_match = re.search(
        r'className\s*=\s*"([^"]*)"|class\s*=\s*"([^"]*)"', tag_text
    )
    if cls_match:
        existing = cls_match.group(1) or cls_match.group(2)
        tokens = existing.split()
        # Remove any token in the same prefix family, then add the new one
        tokens = [t for t in tokens if not t.startswith(prefix)]
        tokens.append(new_token)
        new_value = " ".join(tokens)
        new_tag = (
            tag_text[: cls_match.start()]
            + f'className="{new_value}"'
            + tag_text[cls_match.end():]
        )
    else:
        # Inject a className attribute right after the tag name
        m = re.match(r"<([A-Za-z][\w.-]*)", tag_text)
        if not m:
            raise ValueError("could not find tag name")
        insert_at = m.end()
        new_tag = (
            tag_text[:insert_at]
            + f' className="{new_token}"'
            + tag_text[insert_at:]
        )
    return content[:start] + new_tag + content[end:]


def _merge_append_tokens(existing_parts: List[str], add_parts: List[str]) -> List[str]:
    tokens = list(existing_parts)
    if any(t == "shadow-none" for t in add_parts):
        tokens = [t for t in tokens if not (t.startswith("shadow-") or t == "shadow")]
    if any(t == "rounded-none" for t in add_parts):
        tokens = [t for t in tokens if not t.startswith("rounded")]

    seen = set(t for t in tokens if t)
    for a in add_parts:
        if a and a not in seen:
            tokens.append(a)
            seen.add(a)
    return tokens


def _apply_append_tailwind(content: str, line: int, col: int, args: Dict[str, Any]) -> str:
    """Append utility classes onto the opening tag's className at (line, col)."""
    extras = args.get("tokens") or []
    extras = [str(x).strip() for x in extras if str(x).strip()]
    if not extras:
        return content
    span = _find_opening_tag_at(content, line, col)
    if not span:
        raise ValueError("could not locate opening tag")
    start, end = span
    tag_text = content[start:end]
    cls_match = re.search(
        r"className\s*=\s*\"([^\"]*)\"|class\s*=\s*\"([^\"]*)\"", tag_text
    )
    if cls_match:
        existing = cls_match.group(1) or cls_match.group(2)
        merged = _merge_append_tokens(existing.split(), extras)
        new_value = " ".join(merged)
        new_tag = (
            tag_text[: cls_match.start()]
            + f'className="{new_value}"'
            + tag_text[cls_match.end() :]
        )
    else:
        m = re.match(r"<([A-Za-z][\w.-]*)", tag_text)
        if not m:
            raise ValueError("could not find tag name")
        insert_at = m.end()
        new_value = " ".join(extras)
        new_tag = (
            tag_text[:insert_at]
            + f' className="{new_value}"'
            + tag_text[insert_at:]
        )
    return content[:start] + new_tag + content[end:]


def _apply_style_decl(content: str, line: int, col: int, args: Dict[str, Any]) -> str:
    """Set an inline ``style={{ ... }}`` declaration on the opening tag."""
    span = _find_opening_tag_at(content, line, col)
    if not span:
        raise ValueError("could not locate opening tag")
    start, end = span
    tag_text = content[start:end]
    prop = args["property"]
    val = args["value"]

    style_match = re.search(r"style\s*=\s*\{\{([^}]*)\}\}", tag_text)
    if style_match:
        body = style_match.group(1)
        # Drop any existing key with same name
        body_clean = re.sub(
            rf"(?:^|,)\s*{re.escape(_camel(prop))}\s*:\s*[^,}}]+",
            "",
            body,
        ).strip().rstrip(",")
        new_body = (body_clean + ", " if body_clean else "") + f"{_camel(prop)}: '{val}'"
        new_tag = (
            tag_text[: style_match.start()]
            + f"style={{{{ {new_body} }}}}"
            + tag_text[style_match.end():]
        )
    else:
        m = re.match(r"<([A-Za-z][\w.-]*)", tag_text)
        if not m:
            raise ValueError("could not find tag name")
        insert_at = m.end()
        new_tag = (
            tag_text[:insert_at]
            + f" style={{{{ {_camel(prop)}: '{val}' }}}}"
            + tag_text[insert_at:]
        )
    return content[:start] + new_tag + content[end:]


def _camel(s: str) -> str:
    parts = s.split("-")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


_TEXT_BETWEEN_RE = re.compile(r">([^<]*)<")


def _sanitize_set_text_value(raw: str) -> str:
    """Remove accidental JSX/copy-paste noise from model or user input."""
    t = str(raw).strip()
    # Models often echo a stray ``>`` from ``<motion.h2 ...>`` snippet context.
    if t.startswith(">"):
        t = t[1:].lstrip()
    # Trailing pasted closing tag
    t = re.sub(r"</[a-zA-Z][\w.]*\s*/?\s*>\s*$", "", t).strip()
    return t


def _apply_set_text(content: str, line: int, col: int, args: Dict[str, Any]) -> str:
    """Replace the immediate text node inside the opening tag at (line, col).

    Only safe for tags whose body is a single text node.  We refuse to apply
    if multiple non-text children are detected.
    """
    span = _find_opening_tag_at(content, line, col)
    if not span:
        raise ValueError("could not locate opening tag")
    _, tag_end = span
    # Look for the next "<" — anything between tag_end and that "<" is the
    # text body.
    next_lt = content.find("<", tag_end)
    if next_lt == -1:
        raise ValueError("malformed tag")
    body = content[tag_end:next_lt]
    if "{" in body or "}" in body:
        raise ValueError("text body contains JSX expressions; refusing to overwrite")
    new_text = _sanitize_set_text_value(args["text"])
    return content[:tag_end] + new_text + content[next_lt:]


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

def _validate(deltas: Dict[str, Tuple[Optional[str], Optional[str]]]) -> List[str]:
    """Re-parse each modified file using tree-sitter to ensure validity."""
    errors: List[str] = []
    parser = _try_get_parser()
    for rel, (_, after) in deltas.items():
        if after is None:
            continue
        if rel.endswith((".tsx", ".jsx", ".ts", ".js")):
            if parser is None:
                continue
            try:
                tree = parser.parse(after.encode("utf-8"))
                if tree.root_node.has_error:
                    errors.append(f"syntax error after edit: {rel}")
            except Exception as e:
                errors.append(f"parse failed for {rel}: {e}")
    return errors


def _try_get_parser():
    try:
        from app.services.dv_id_injector import _get_jsx_parser  # type: ignore
        return _get_jsx_parser()
    except Exception:
        return None
