"""
DocuVerse Studio — Source-Aware Click Bridge  (Phase 2)

A small piece of JS that runs **inside the user's preview iframe** and provides:

  1. Hover overlay highlighting the element under the cursor (**inspect** mode).
  2. Optional click capture (same mode) posting ``element-click`` to the Studio parent.
  3. **Interact** mode (default): no overlay/click interception so the embedded app behaves normally.

  Parent sets mode via ``postMessage({ type: 'docuverse-studio-mode', mode: 'inspect'|'interact' }, previewOrigin)``.

  HMR re-anchor: when the iframe content reloads, re-fires the last anchor so the chat panel keeps its context.

This file is the **string** form of the bridge — generated at injection time
because we want to embed config (allowed origins) without an extra fetch.

The bridge script is dropped under ``public/__dv_bridge.js`` (or framework
equivalent) and referenced from the project's root HTML by ``inject_bridge_into_entry``.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Bridge script template
# ---------------------------------------------------------------------------

BRIDGE_JS_TEMPLATE = r"""// DocuVerse Studio source-aware click bridge.
// Auto-generated. Do not edit by hand.
(function () {
  if (window.__DV_BRIDGE__) return;
  window.__DV_BRIDGE__ = true;

  var ALLOWED_PARENTS = __ALLOWED_PARENTS__;
  var SKIP_TAGS = ['html','body','script','style','link','meta','noscript'];
  // Default: interact with the app. Parent sends docuverse-studio-mode to enable picking.
  var inspectMode = false;

  // Studio shell may be localhost:3000 while allowlist only has 127.0.0.1:3001, etc.
  function isTrustedStudioShellOrigin(origin) {
    if (!origin) return false;
    if (ALLOWED_PARENTS.indexOf(origin) >= 0) return true;
    try {
      var u = new URL(origin);
      var h = (u.hostname || '').toLowerCase();
      if (h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]' && h !== '::1') return false;
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  // ── Overlay (created early so message handler can toggle visibility) ─────
  var overlay = document.createElement('div');
  overlay.id = '__dv-overlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;pointer-events:none;' +
    'border:2px solid #6366f1;border-radius:4px;background:rgba(99,102,241,0.12);' +
    'box-shadow:0 0 0 1px rgba(99,102,241,0.25) inset;' +
    'z-index:2147483000;transition:opacity 0.08s ease,transform 0.08s ease;display:none;';
  var tooltip = document.createElement('div');
  tooltip.id = '__dv-tooltip';
  tooltip.style.cssText =
    'position:fixed;background:#4f46e5;color:#fff;font:600 11px Inter,system-ui,sans-serif;' +
    'padding:4px 10px;border-radius:4px;white-space:nowrap;z-index:2147483646;' +
    'display:none;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,0.25);';
  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(tooltip);

  var lastEl = null;

  window.addEventListener('message', function (ev) {
    if (!isTrustedStudioShellOrigin(ev.origin)) return;
    var d = ev.data || {};
    if (d.type !== 'docuverse-studio-mode') return;
    if (d.mode === 'inspect') inspectMode = true;
    else if (d.mode === 'interact') inspectMode = false;
    if (!inspectMode) {
      overlay.style.display = 'none';
      tooltip.style.display = 'none';
      lastEl = null;
    }
  });

  function postToParent(msg) {
    try {
      // Parent page validates preview origins; fixed targetOrigin lists miss host/port combos.
      window.parent.postMessage(msg, '*');
    } catch (e) {}
  }

  function nearestDvId(el) {
    while (el && el !== document) {
      if (el.dataset && el.dataset.dvId) return { dvId: el.dataset.dvId, el: el };
      el = el.parentElement;
    }
    return { dvId: null, el: null };
  }

  function isSkip(el) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.indexOf(tag) >= 0) return true;
    if (el.id === '__dv-overlay' || el.id === '__dv-tooltip') return true;
    return false;
  }

  document.addEventListener(
    'mousemove',
    function (e) {
    if (!inspectMode) {
      overlay.style.display = 'none';
      tooltip.style.display = 'none';
      lastEl = null;
      return;
    }
    var el = e.target;
    if (isSkip(el)) {
      overlay.style.display = 'none';
      tooltip.style.display = 'none';
      lastEl = null;
      return;
    }
    if (el === lastEl) return;
    lastEl = el;
    var rect = el.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
    var tag = el.tagName.toLowerCase();
    var dv = nearestDvId(el);
    var label = dv.dvId ? tag + '  ·  ' + dv.dvId.split('/').pop() : tag;
    tooltip.textContent = label;
    tooltip.style.top = Math.max(0, rect.top - 28) + 'px';
    tooltip.style.left = rect.left + 'px';
    tooltip.style.display = 'block';
    },
    true
  );

  document.documentElement.addEventListener('mouseleave', function () {
    overlay.style.display = 'none';
    tooltip.style.display = 'none';
    lastEl = null;
  });

  // ── Click capture ────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    if (!inspectMode) return;
    var el = e.target;
    if (isSkip(el)) return;
    var dv = nearestDvId(el);

    e.preventDefault();
    e.stopPropagation();

    var cs = window.getComputedStyle(el);
    var tag = el.tagName.toLowerCase();

    var payload = {
      type: 'element-click',
      dvId: dv.dvId,
      tag: tag,
      id: (el.id || '').slice(0, 80),
      className:
        typeof el.className === 'string'
          ? el.className.trim().slice(0, 200)
          : (el.className && el.className.baseVal) || '',
      parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : '',
      computedStyle: {
        color: cs.color,
        background: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        padding: cs.padding,
        margin: cs.margin,
        borderRadius: cs.borderRadius
      },
      framework: window.__DV_FRAMEWORK__ || null,
      ts: Date.now()
    };
    postToParent(payload);

    // Brief flash on the actually clicked element
    var prev = el.style.outline;
    el.style.outline = '2px solid #6366f1';
    el.style.outlineOffset = '2px';
    setTimeout(function () {
      el.style.outline = prev;
      el.style.outlineOffset = '';
    }, 900);
  }, true);

  // ── Ready signal ─────────────────────────────────────────────────────────
  postToParent({ type: 'dv-bridge-ready', ts: Date.now() });
})();
"""


def render_bridge_js(allowed_parent_origins: List[str]) -> str:
    """Materialise the bridge JS for the given parent origins."""
    import json
    parents = json.dumps(list(allowed_parent_origins))
    return BRIDGE_JS_TEMPLATE.replace("__ALLOWED_PARENTS__", parents)


# ---------------------------------------------------------------------------
# Entry-point detection / injection
# ---------------------------------------------------------------------------

# Prefer Next.js / Vite / generic public/ patterns
_PUBLIC_DIRS = ["public", "static", "assets/public", "src/static"]

_NEXT_LAYOUT_HINTS = [
    "src/app/layout.tsx", "src/app/layout.jsx",
    "app/layout.tsx", "app/layout.jsx",
    "src/pages/_document.tsx", "src/pages/_document.jsx",
    "pages/_document.tsx", "pages/_document.jsx",
]

_VITE_HINTS = ["index.html", "src/index.html", "public/index.html"]

_BRIDGE_TAG = '<script src="/__dv_bridge.js"></script>'
_BRIDGE_TAG_MARKER = "__dv_bridge.js"
_LOADER_MARKER = "// __DV_BRIDGE_LOADER__ DocuVerse Studio"
_BRIDGE_CLIENT_FILENAME = "__dv_studio_bridge.tsx"


def _bridge_client_component_ts() -> str:
    """Tiny client boundary: injects `/__dv_bridge.js` once at runtime."""

    return (
        f"{_LOADER_MARKER}\n'use client'\n\n"
        "import { useEffect } from 'react'\n\n"
        "export default function DvStudioBridgeInsert(): null {\n"
        "  useEffect(() => {\n"
        "    const id = 'dv-studio-bridge-script'\n"
        "    if (typeof document === 'undefined' || document.getElementById(id)) return\n"
        "    const s = document.createElement('script')\n"
        "    s.id = id\n"
        "    s.src = '/__dv_bridge.js'\n"
        "    s.defer = true\n"
        "    document.head.appendChild(s)\n"
        "  }, [])\n"
        "  return null\n"
        "}\n"
    )


def _consume_braced_block(text: str, brace_open_idx: int) -> int:

    n = len(text)
    i = brace_open_idx + 1
    depth = 1
    quote: Optional[str] = None
    while i < n and depth > 0:
        c = text[i]
        if quote:
            if c == "\\" and i + 1 < n:
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'":
            quote = c
            i += 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return i


def _opening_jsx_end(content: str, lt: int) -> Optional[int]:
    """Index immediately after ``<>`` or a non-closing ``<Tag ...>`` / ``<Tag .../>``."""

    n = len(content)
    if lt >= n or content[lt] != "<":
        return None
    if content.startswith("</", lt) or content.startswith("<!--", lt):
        return None
    if content.startswith("<>", lt):
        return lt + 2

    quote: Optional[str] = None
    i = lt + 1
    while i < n:
        c = content[i]
        if quote:
            if c == "\\" and i + 1 < n:
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in "\"'":
            quote = c
            i += 1
            continue
        if c == "{":
            i = _consume_braced_block(content, i)
            continue
        if c == "/" and i + 1 < n and content[i + 1] == ">":
            return i + 2
        if c == ">":
            return i + 1
        i += 1
    return None


def _inject_after_first_return_opening(content: str) -> Optional[str]:
    """Insert ``defer`` bridge script immediately after first JSX rooted under ``return (``."""

    if _LOADER_MARKER in content or "DvStudioBridgeInsert" in content:
        return None
    if '<script src="/__dv_bridge.js"' in content or "<script src='/__dv_bridge.js'" in content:
        return None
    bridge = '<script src="/__dv_bridge.js" defer />'
    m = re.search(r"\breturn\s*\(", content)
    if not m:
        return None
    i = m.end()
    while i < len(content) and content[i] in " \t\n\r":
        i += 1
    if i >= len(content) or content[i] != "<":
        return None
    end = _opening_jsx_end(content, i)
    if end is None:
        return None
    line_start = content.rfind("\n", 0, i) + 1
    line_indent = content[line_start:i]
    return content[:end] + "\n" + line_indent + "  " + bridge + content[end:]


def _insert_ts_import_after_directives(content: str, import_line: str) -> str:

    if import_line.strip() in content.replace('"', "'"):
        return content
    stripped = content.lstrip("\ufeff")
    lines = stripped.splitlines(keepends=True)
    idx = 0
    directive_end = 0
    while idx < len(lines):
        ln = lines[idx]
        ts = ln.strip()
        if ts.startswith("'use client'") or ts.startswith('"use client"'):
            directive_end = idx + 1
            idx += 1
            continue
        break
    if directive_end > 0:
        return "".join(lines[:directive_end]) + "\n" + import_line + "".join(lines[directive_end:])
    return import_line + stripped


def _fallback_inject_bridge_loader(layout_path: Path, content: str) -> Optional[str]:
    """When no safe ``<script />`` insertion site exists: add runtime loader + JSX hook."""
    if _LOADER_MARKER in content or "DvStudioBridgeInsert" in content:
        return None
    if '<script src="/__dv_bridge.js"' in content or "<script src='/__dv_bridge.js'" in content:
        return None
    if not re.search(r"\{\s*children\s*\}", content):
        return None

    loader_path = layout_path.parent / _BRIDGE_CLIENT_FILENAME
    loader_path.parent.mkdir(parents=True, exist_ok=True)
    loader_path.write_text(_bridge_client_component_ts(), encoding="utf-8")

    rel_mod = "./" + _BRIDGE_CLIENT_FILENAME.replace(".tsx", "")
    import_line = f"import DvStudioBridgeInsert from '{rel_mod}'\n"
    patched = _insert_ts_import_after_directives(content, import_line)

    m_ch2 = re.search(r"\{\s*children\s*\}", patched)
    if not m_ch2:
        return None
    line_start = patched.rfind("\n", 0, m_ch2.start()) + 1
    indent = patched[line_start : m_ch2.start()]
    snippet = indent + "<DvStudioBridgeInsert />\n"
    return patched[: m_ch2.start()] + snippet + patched[m_ch2.start() :]


def _find_public_dir(root: Path) -> Path:
    for candidate in _PUBLIC_DIRS:
        p = root / candidate
        if p.is_dir():
            return p
    # Default to public/
    return root / "public"


def _inject_into_html(html: str) -> Optional[str]:
    """Inject the bridge <script> tag right before </head> (or </body>)."""
    if _BRIDGE_TAG_MARKER in html:
        return None
    lower = html.lower()
    head_close = lower.rfind("</head>")
    if head_close != -1:
        return html[:head_close] + _BRIDGE_TAG + html[head_close:]
    body_close = lower.rfind("</body>")
    if body_close != -1:
        return html[:body_close] + _BRIDGE_TAG + html[body_close:]
    return None


_HEAD_JSX_RE = re.compile(r"</head>", re.IGNORECASE)
_BODY_JSX_RE = re.compile(r"</body>", re.IGNORECASE)
# Opening tags (layouts often have no literal </head>; body may be omitted in route layouts.)
_BODY_OPEN_RE = re.compile(r"(<body\b[^>]*>)", re.IGNORECASE)
_HTML_OPEN_RE = re.compile(r"(<html\b[^>]*>)", re.IGNORECASE)


def _inject_into_jsx_layout(content: str) -> Optional[str]:
    """Declarative ``<script src=/__dv_bridge.js`` injection when JSX structure matches."""
    if _LOADER_MARKER in content or "DvStudioBridgeInsert" in content:
        return None
    if '<script src="/__dv_bridge.js"' in content or "<script src='/__dv_bridge.js'" in content:
        return None
    bridge = '<script src="/__dv_bridge.js" defer />'

    def _prepend_after_body_or_html(regex: re.Pattern[str]) -> Optional[str]:
        m = regex.search(content)
        if not m:
            return None
        pos = m.end()
        nl = ""
        next_chunk = content[pos : pos + 1]
        if next_chunk and next_chunk != "\n":
            nl = "\n"
        return content[:pos] + nl + bridge + "\n" + content[pos:]

    m_head = _HEAD_JSX_RE.search(content)
    if m_head:
        return content[: m_head.start()] + bridge + content[m_head.start() :]

    m_body_close = _BODY_JSX_RE.search(content)
    if m_body_close:
        return (
            content[: m_body_close.start()] + bridge + "\n" + content[m_body_close.start() :]
        )

    for rx in (_BODY_OPEN_RE, _HTML_OPEN_RE):
        out = _prepend_after_body_or_html(rx)
        if out:
            return out

    return _inject_after_first_return_opening(content)


def _discover_app_router_layouts(root: Path) -> List[Path]:
    """Find ``.../app/layout.{tsx,jsx}`` (excluding obvious build/test paths)."""
    hits: List[Path] = []
    for pattern in ("**/app/layout.tsx", "**/app/layout.jsx"):
        for p in root.glob(pattern):
            if not p.is_file():
                continue
            rp = p.relative_to(root).as_posix().lower()
            if any(
                x in rp
                for x in (
                    "__tests__/",
                    "node_modules/",
                    ".next/",
                    "dist/",
                )
            ):
                continue
            hits.append(p)

    uniq = {str(p.resolve()): p for p in hits}
    return sorted(
        uniq.values(),
        key=lambda p: (len(p.relative_to(root).parts), str(p).lower()),
    )


def install_bridge(
    project_root: str | Path,
    *,
    allowed_parent_origins: List[str],
) -> Dict[str, object]:
    """Write public/__dv_bridge.js and inject the script tag into the entry.

    Returns:
        {
          "wrote_bridge_at": str | None,
          "patched_entry": str | None,
          "warning": str | None,
        }
    """
    root = Path(project_root)
    if not root.is_dir():
        raise FileNotFoundError(f"project_root does not exist: {root}")

    js = render_bridge_js(allowed_parent_origins)
    public_dir = _find_public_dir(root)
    public_dir.mkdir(parents=True, exist_ok=True)
    bridge_path = public_dir / "__dv_bridge.js"
    bridge_path.write_text(js, encoding="utf-8")
    rel_bridge = bridge_path.relative_to(root).as_posix()

    patched: Optional[str] = None
    warning: Optional[str] = None

    layout_candidates: List[Path] = [root / h for h in _NEXT_LAYOUT_HINTS]
    layout_candidates.extend(_discover_app_router_layouts(root))

    attempted: set[str] = set()
    # Try Next.js layout candidates, then Vite/HTML entry points.
    for p in layout_candidates:
        res = str(p.resolve())
        if res in attempted:
            continue
        attempted.add(res)
        if not p.is_file():
            continue
        try:
            content = p.read_text(encoding="utf-8", errors="replace")
            new_content = _inject_into_jsx_layout(content)
            if new_content:
                p.write_text(new_content, encoding="utf-8")
                patched = p.relative_to(root).as_posix().replace("\\", "/")
                break
        except OSError:
            continue

    if not patched:
        for hint in _VITE_HINTS:
            p = root / hint
            if not p.is_file():
                continue
            try:
                content = p.read_text(encoding="utf-8", errors="replace")
                new_content = _inject_into_html(content)
                if new_content:
                    p.write_text(new_content, encoding="utf-8")
                    patched = hint
                    break
            except OSError:
                continue

    if not patched:
        fb_attempted: set[str] = set()
        for p in layout_candidates:
            res = str(p.resolve())
            if res in fb_attempted:
                continue
            fb_attempted.add(res)
            if not p.is_file():
                continue
            try:
                raw = p.read_text(encoding="utf-8", errors="replace")
                fb = _fallback_inject_bridge_loader(p, raw)
                if fb is not None:
                    p.write_text(fb, encoding="utf-8")
                    rel_fp = p.relative_to(root).as_posix().replace("\\", "/")
                    rel_ld = (_BRIDGE_CLIENT_FILENAME)
                    patched = f"{rel_fp}+{rel_ld}"
                    break
            except OSError:
                continue

    if not patched:
        warning = (
            "Could not auto-inject the bridge tag. Add "
            f'<script src="/__dv_bridge.js" defer></script> to your root HTML '
            "or layout component manually."
        )

    return {
        "wrote_bridge_at": rel_bridge,
        "patched_entry": patched,
        "warning": warning,
    }
