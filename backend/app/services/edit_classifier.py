"""
DocuVerse Studio — Edit Classifier

Multi-dimensional classifier for AI edit prompts, used by both:
  - the existing single-file App Studio (generated HTML screens), and
  - the new Studio multi-file pipeline (imported real repositories).

Backwards compatible with the original ``_classify_edit(prompt) -> str``
behaviour from ``backend/app/api/endpoints/builder.py``: the returned
``EditClassification.tier`` value matches the legacy strings
``"css" | "quick" | "structural"``.

The richer classification adds:
  - scope (single_node | single_file | multi_file | cross_cutting)
  - surfaces (ui_style, ui_logic, api, schema, state, tests, config)
  - backend_impacting / schema_changing flags
  - fanout_estimate (rough integer of touched files)
  - risk_class (low | med | high)
  - requires_user_confirmation
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Iterable, List, Optional, Set


# ---------------------------------------------------------------------------
# Keyword vocabularies
# ---------------------------------------------------------------------------

# Visual / CSS-only changes (regex patch tier)
_CSS_KEYWORDS: Set[str] = {
    "color", "background", "font", "size", "spacing", "padding", "margin",
    "border", "radius", "shadow", "opacity", "bold", "italic", "underline",
    "align", "center", "left", "right", "width", "height", "gap", "rounded",
    "dark", "light", "white", "black", "blue", "red", "green", "purple",
    "gradient", "transparent", "hidden", "visible", "hide", "show",
    "tailwind", "class", "classname",
}

# Structural / multi-file signals (force structural tier)
_STRUCTURAL_KEYWORDS: Set[str] = {
    "add", "remove", "delete", "create", "new", "section", "page", "table",
    "form", "modal", "sidebar", "navbar", "layout", "restructure", "redesign",
    "rebuild", "refactor", "rename", "extract", "move", "split", "merge",
    "introduce",
}

# Backend / API surface
_API_KEYWORDS: Set[str] = {
    "api", "endpoint", "route", "fetch", "request", "response", "rest",
    "graphql", "mutation", "query", "resolver", "handler", "controller",
    "post", "get", "put", "patch", "delete",
}

# Database / schema surface
_SCHEMA_KEYWORDS: Set[str] = {
    "schema", "model", "migration", "prisma", "drizzle", "sequelize",
    "table", "column", "field", "relation", "foreign", "primary", "index",
    "database", "db", "orm", "sqlite", "postgres", "mysql",
}

# State management surface
_STATE_KEYWORDS: Set[str] = {
    "store", "atom", "context", "provider", "reducer", "slice", "zustand",
    "redux", "jotai", "recoil", "mobx", "valtio", "useState", "useReducer",
    "state", "global",
}

# Test surface
_TEST_KEYWORDS: Set[str] = {
    "test", "tests", "spec", "vitest", "jest", "pytest", "playwright",
    "cypress", "e2e", "unit",
}

# Config surface
_CONFIG_KEYWORDS: Set[str] = {
    "config", "configuration", "tsconfig", "eslint", "prettier", "tailwind",
    "next.config", "vite.config", "package.json", "env", ".env",
}

# Filler tokens to ignore for ratio scoring (kept identical to legacy set
# in builder.py plus a few useful additions).
_FILLER_WORDS: Set[str] = {
    "the", "a", "an", "to", "of", "in", "and", "this", "that", "it", "is",
    "make", "change", "set", "update", "please", "can", "you", "i", "we",
    "should", "need", "want", "for", "with", "on", "from",
}


# ---------------------------------------------------------------------------
# Classification result
# ---------------------------------------------------------------------------

@dataclass
class EditClassification:
    """Structured classification of an edit prompt."""

    tier: str  # "css" | "quick" | "structural"
    scope: str  # "single_node" | "single_file" | "multi_file" | "cross_cutting"
    surfaces: List[str] = field(default_factory=list)
    backend_impacting: bool = False
    schema_changing: bool = False
    fanout_estimate: int = 1
    risk_class: str = "low"  # "low" | "med" | "high"
    requires_user_confirmation: bool = False
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _tokens(prompt: str) -> Set[str]:
    """Tokenize prompt to lowercase word set (simple split, robust enough)."""
    return set(re.findall(r"[A-Za-z][A-Za-z0-9_.-]+", prompt.lower()))


def _meaningful(tokens: Set[str]) -> Set[str]:
    return tokens - _FILLER_WORDS


def _hits(tokens: Set[str], vocab: Set[str]) -> Set[str]:
    return tokens & vocab


def _component_in_degree(symbol: Optional[str], component_in_degree_map: Optional[dict]) -> int:
    if not symbol or not component_in_degree_map:
        return 0
    return int(component_in_degree_map.get(symbol, 0))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def classify_edit(
    prompt: str,
    *,
    anchor_symbol: Optional[str] = None,
    anchor_file: Optional[str] = None,
    component_in_degree: Optional[dict] = None,
    repo_kind: str = "imported",  # "imported" | "generated"
    cross_cutting_threshold: int = 5,
) -> EditClassification:
    """Classify an edit prompt across multiple dimensions.

    ``component_in_degree`` is an optional mapping ``{component_symbol: int}``
    derived from the component graph (built by ``graph_builder_service`` in a
    later phase). When supplied, an anchor used in many places auto-promotes
    the edit to ``cross_cutting`` and structural tier.
    """

    tokens = _tokens(prompt)
    meaningful = _meaningful(tokens)
    reasons: List[str] = []

    # --- Surface detection ------------------------------------------------
    surfaces: List[str] = []
    css_hits = _hits(meaningful, _CSS_KEYWORDS)
    struct_hits = _hits(meaningful, _STRUCTURAL_KEYWORDS)
    api_hits = _hits(meaningful, _API_KEYWORDS)
    schema_hits = _hits(meaningful, _SCHEMA_KEYWORDS)
    state_hits = _hits(meaningful, _STATE_KEYWORDS)
    test_hits = _hits(meaningful, _TEST_KEYWORDS)
    config_hits = _hits(meaningful, _CONFIG_KEYWORDS)

    if css_hits:
        surfaces.append("ui_style")
    if struct_hits or (api_hits and {"call", "use"} & meaningful):
        surfaces.append("ui_logic")
    if api_hits:
        surfaces.append("api")
    if schema_hits:
        surfaces.append("schema")
    if state_hits:
        surfaces.append("state")
    if test_hits:
        surfaces.append("tests")
    if config_hits:
        surfaces.append("config")

    if not surfaces:
        surfaces.append("ui_logic")

    backend_impacting = "api" in surfaces or "schema" in surfaces
    schema_changing = "schema" in surfaces

    # --- Tier --------------------------------------------------------------
    # 1. legacy CSS-ratio rule (kept intact for builder.py back-compat)
    css_ratio = (len(css_hits) / len(meaningful)) if meaningful else 0.0
    legacy_css = css_ratio >= 0.4

    # 2. structural promotions
    forced_structural = bool(
        struct_hits
        or schema_changing
        or backend_impacting
        and {"add", "create", "remove"} & meaningful
    )

    if forced_structural:
        tier = "structural"
        if struct_hits:
            reasons.append(f"structural keywords: {sorted(struct_hits)}")
        if schema_changing:
            reasons.append("schema-changing edit detected")
    elif legacy_css and not (api_hits or schema_hits or state_hits):
        tier = "css"
        reasons.append(f"css keyword ratio={css_ratio:.2f}")
    else:
        tier = "quick"
        reasons.append("default quick tier")

    # --- Scope -------------------------------------------------------------
    # in-degree from component graph promotes scope
    in_deg = _component_in_degree(anchor_symbol, component_in_degree)
    cross_cutting = in_deg >= cross_cutting_threshold

    if cross_cutting:
        scope = "cross_cutting"
        tier = "structural"
        reasons.append(
            f"anchor '{anchor_symbol}' has in-degree={in_deg} "
            f">= threshold={cross_cutting_threshold}"
        )
    elif tier == "structural":
        scope = "multi_file"
    elif tier == "css":
        scope = "single_node"
    else:
        scope = "single_file" if anchor_file else "single_node"

    # --- Fanout estimate ---------------------------------------------------
    if scope == "single_node":
        fanout = 1
    elif scope == "single_file":
        fanout = 1
    elif scope == "multi_file":
        # heuristic: 2 (file + parent/import update) + 1 per extra surface
        fanout = 2 + max(0, len(surfaces) - 1)
    else:  # cross_cutting
        fanout = max(in_deg + 1, 5)

    # --- Risk --------------------------------------------------------------
    if cross_cutting or schema_changing:
        risk = "high"
    elif tier == "structural" or backend_impacting:
        risk = "med"
    else:
        risk = "low"

    requires_confirmation = risk == "high" or schema_changing

    # Generated-app overrides: in the existing single-file builder world there
    # is no multi-file scope. Cap to single_file/single_node so the legacy
    # builder.py call sites keep behaving identically.
    if repo_kind == "generated":
        if scope in ("multi_file", "cross_cutting"):
            scope = "single_file"
        # The legacy classifier has only css/quick/structural and never asks
        # for user confirmation; preserve that contract.
        requires_confirmation = False

    return EditClassification(
        tier=tier,
        scope=scope,
        surfaces=surfaces,
        backend_impacting=backend_impacting,
        schema_changing=schema_changing,
        fanout_estimate=fanout,
        risk_class=risk,
        requires_user_confirmation=requires_confirmation,
        reasons=reasons,
    )


def classify_edit_legacy(prompt: str) -> str:
    """Drop-in replacement for the original ``_classify_edit`` in builder.py.

    Returns ``"css" | "quick" | "structural"`` only.
    """
    return classify_edit(prompt, repo_kind="generated").tier


__all__ = [
    "EditClassification",
    "classify_edit",
    "classify_edit_legacy",
]
