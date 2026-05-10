"""
DocuVerse Studio — DOM ↔ Source dv-id Injector  (Phase 2)

Walks a project tree, parses every JSX/TSX/JS/HTML file, and injects a
``data-dv-id="<file>:<line>:<col>"`` attribute on every opening element tag.
Returns:

  1. A modified-files map (path -> new content) so the caller can write atomically.
  2. A ``route_index`` ({ dv_id -> { file, line, col, tag, component? } }) which
     becomes the bidirectional DOM ↔ source bridge consumed by the Surgical
     Edit Engine and the Studio inspector.

Design:
  - Uses tree-sitter (already a project dep via ParserService) for JSX parsing.
    Tree-sitter gives us exact byte ranges for ``jsx_opening_element`` and
    ``jsx_self_closing_element`` nodes; we mutate in **reverse byte order** so
    earlier offsets stay valid.
  - For ``.html``: uses a tag-aware regex restricted to known void/non-void
    HTML5 tags so we don't accidentally rewrite text content.
  - Idempotent: skips elements that already have ``data-dv-id``.
  - Skips ``node_modules``, ``.next``, ``dist``, ``build``, ``.git``, etc.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Files we touch
_JSX_EXTS = {".jsx", ".tsx"}
_HTML_EXTS = {".html", ".htm"}
_ALL_EXTS = _JSX_EXTS | _HTML_EXTS

# Directories we skip wholesale
_SKIP_DIRS = {
    "node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build",
    ".git", "__pycache__", ".turbo", ".vercel", ".cache", "out",
    "coverage", ".docusaurus", "venv", ".venv", "env",
}

# Skip files larger than this — almost always generated bundles
_MAX_FILE_BYTES = 1_500_000  # 1.5 MB

# HTML tags we will inject into. Limited to the common set to avoid false
# positives on text that happens to contain "<word>".
_HTML_TAG_RE = re.compile(
    r"<(?P<tag>"
    r"div|span|button|a|nav|main|section|article|aside|header|footer|"
    r"form|input|label|select|option|textarea|"
    r"h1|h2|h3|h4|h5|h6|p|ul|ol|li|"
    r"table|thead|tbody|tr|td|th|"
    r"img|video|audio|canvas|svg|path|"
    r"figure|figcaption|details|summary|dialog|"
    r"strong|em|code|pre|blockquote|hr|br"
    r")(?P<rest>\s[^>]*)?>",
    re.IGNORECASE,
)


def _is_skip_dir(name: str) -> bool:
    return name in _SKIP_DIRS or name.startswith(".") and name not in {".storybook"}


def _project_relative(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _make_dv_id(rel_path: str, line: int, col: int) -> str:
    return f"{rel_path}:{line}:{col}"


# ---------------------------------------------------------------------------
# JSX/TSX injection (tree-sitter)
# ---------------------------------------------------------------------------

def _get_jsx_parser():
    """Lazily get a tree-sitter parser for TSX (handles plain JSX too)."""
    try:
        import tree_sitter_typescript  # type: ignore
        from tree_sitter import Language, Parser  # type: ignore

        try:
            tsx_lang = Language(tree_sitter_typescript.language_tsx())
        except TypeError:
            # Older tree-sitter API needs a name argument
            tsx_lang = Language(tree_sitter_typescript.language_tsx(), "tsx")
        parser = Parser()
        try:
            parser.language = tsx_lang
        except Exception:
            parser.set_language(tsx_lang)
        return parser
    except Exception as e:
        logger.warning(f"dv_id_injector: tree-sitter TSX parser unavailable ({e})")
        return None


def _walk_tree(node, results: List[Any]) -> None:
    """Collect every JSX opening / self-closing element node."""
    t = node.type
    if t in ("jsx_opening_element", "jsx_self_closing_element"):
        results.append(node)
    for c in node.children:
        _walk_tree(c, results)


def _extract_tag_name_and_after(content: bytes, node: Any) -> Optional[Tuple[str, int]]:
    """For a JSX opening node return (tag_name, byte_index_to_insert_at).

    Insertion point: immediately after the tag name (and any namespace) —
    i.e. between ``<TagName`` and the next char (a space or ``>``).

    Returns None if the structure looks unusual (fragment, member expr, etc.)
    """
    # First child is the JSX tag name node. We only inject on plain identifiers
    # and member expressions like Foo.Bar; fragments (<>) get no children here.
    name_node = None
    for c in node.children:
        if c.type in ("identifier", "jsx_identifier", "nested_identifier",
                      "member_expression", "jsx_member_expression"):
            name_node = c
            break
    if name_node is None:
        return None

    tag_text = content[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
    # Skip non-DOM exotic tags (fragments, generics syntax)
    if not tag_text or tag_text.startswith("<"):
        return None

    return tag_text, name_node.end_byte


def _has_existing_dv_id(content: bytes, node: Any) -> bool:
    raw = content[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
    return "data-dv-id" in raw


def _byte_to_line_col(content: bytes, byte_idx: int) -> Tuple[int, int]:
    """1-indexed line, 1-indexed column at the given byte offset."""
    head = content[:byte_idx]
    line = head.count(b"\n") + 1
    last_nl = head.rfind(b"\n")
    col = byte_idx - (last_nl + 1) + 1
    return line, col


def inject_jsx_file(
    file_path: Path, project_root: Path, parser
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """Inject dv-id attributes into a single JSX/TSX file.

    Returns (new_content_or_None_if_unchanged, mappings).
    Each mapping: {"dv_id": str, "file": str, "line": int, "col": int, "tag": str}
    """
    try:
        raw = file_path.read_bytes()
    except OSError as e:
        logger.debug(f"dv_id_injector: could not read {file_path}: {e}")
        return None, []
    if len(raw) > _MAX_FILE_BYTES:
        return None, []
    if b"data-dv-id" in raw and raw.count(b"data-dv-id") > 5:
        # Already heavily injected — assume up-to-date so we don't double-tag.
        # (We still re-extract mappings below.)
        pass

    tree = parser.parse(raw)
    nodes: List[Any] = []
    _walk_tree(tree.root_node, nodes)
    if not nodes:
        return None, []

    rel = _project_relative(file_path, project_root)
    mappings: List[Dict[str, Any]] = []
    edits: List[Tuple[int, bytes]] = []  # (byte_offset, bytes_to_insert)

    for node in nodes:
        info = _extract_tag_name_and_after(raw, node)
        if info is None:
            continue
        tag_name, insert_at = info
        line, col = _byte_to_line_col(raw, node.start_byte)
        dv_id = _make_dv_id(rel, line, col)
        mappings.append({
            "dv_id": dv_id,
            "file": rel,
            "line": line,
            "col": col,
            "tag": tag_name,
        })
        if _has_existing_dv_id(raw, node):
            continue  # don't double-inject
        edits.append((insert_at, f' data-dv-id="{dv_id}"'.encode("utf-8")))

    if not edits:
        return None, mappings

    # Apply edits in reverse so earlier offsets remain valid.
    edits.sort(key=lambda x: x[0], reverse=True)
    out = raw
    for offset, payload in edits:
        out = out[:offset] + payload + out[offset:]

    return out.decode("utf-8", errors="replace"), mappings


# ---------------------------------------------------------------------------
# HTML injection (regex)
# ---------------------------------------------------------------------------

def inject_html_file(
    file_path: Path, project_root: Path
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    try:
        raw = file_path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        logger.debug(f"dv_id_injector: could not read {file_path}: {e}")
        return None, []
    if len(raw) > _MAX_FILE_BYTES:
        return None, []

    rel = _project_relative(file_path, project_root)
    mappings: List[Dict[str, Any]] = []

    def _replace(m: re.Match) -> str:
        full = m.group(0)
        if "data-dv-id" in full:
            return full
        tag = m.group("tag")
        rest = m.group("rest") or ""
        # Compute line/col from match start
        prefix = raw[:m.start()]
        line = prefix.count("\n") + 1
        col = m.start() - prefix.rfind("\n")
        dv_id = _make_dv_id(rel, line, col)
        mappings.append({
            "dv_id": dv_id,
            "file": rel,
            "line": line,
            "col": col,
            "tag": tag.lower(),
        })
        return f'<{tag} data-dv-id="{dv_id}"{rest}>'

    new_content = _HTML_TAG_RE.sub(_replace, raw)
    if new_content == raw:
        return None, mappings
    return new_content, mappings


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_route_index(
    project_root: str | Path,
    *,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Walk the project, inject dv-ids, return summary + the route_index.

    Args:
        project_root: absolute path to the project root.
        dry_run: when True, only build the mapping; do not write changes.

    Returns:
        {
          "files_visited": int,
          "files_modified": int,
          "elements_indexed": int,
          "route_index": { dv_id -> mapping },
          "errors": [ {file, error} ],
        }
    """
    root = Path(project_root)
    if not root.is_dir():
        raise FileNotFoundError(f"project_root does not exist: {root}")

    parser = _get_jsx_parser()
    route_index: Dict[str, Dict[str, Any]] = {}
    errors: List[Dict[str, str]] = []
    visited = 0
    modified = 0

    for path in _iter_files(root):
        ext = path.suffix.lower()
        if ext not in _ALL_EXTS:
            continue
        visited += 1
        try:
            if ext in _JSX_EXTS:
                if parser is None:
                    continue
                new_content, mappings = inject_jsx_file(path, root, parser)
            else:
                new_content, mappings = inject_html_file(path, root)
        except Exception as e:
            errors.append({"file": _project_relative(path, root), "error": str(e)})
            continue

        for m in mappings:
            route_index[m["dv_id"]] = m

        if new_content is not None and not dry_run:
            try:
                path.write_text(new_content, encoding="utf-8")
                modified += 1
            except OSError as e:
                errors.append({"file": _project_relative(path, root), "error": str(e)})

    return {
        "files_visited": visited,
        "files_modified": modified,
        "elements_indexed": len(route_index),
        "route_index": route_index,
        "errors": errors,
    }


def _iter_files(root: Path):
    """Yield every regular file under root, skipping junk dirs."""
    stack: List[Path] = [root]
    while stack:
        d = stack.pop()
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        for entry in entries:
            name = entry.name
            if entry.is_dir():
                if _is_skip_dir(name):
                    continue
                stack.append(entry)
            elif entry.is_file():
                yield entry


def lookup(route_index: Dict[str, Any], dv_id: str) -> Optional[Dict[str, Any]]:
    """Resolve a dv-id back to its source location."""
    return route_index.get(dv_id)
