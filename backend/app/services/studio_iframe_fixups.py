"""
Allow Studio to embed live previews in an iframe (parent on another port / origin).

Many frameworks send ``X-Frame-Options: SAMEORIGIN`` (or equivalent), which blocks
``http://localhost:3000`` from framing ``http://localhost:4000``. The browser
then shows a blank / error document with origin ``null``, and postMessage with a
concrete targetOrigin fails.

These patches are idempotent (marker comments) and only touch preview workspaces.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MARKER_NEXT = "DOCUVERSE_STUDIO_IFRAME"
MARKER_FLASK = "DOCUVERSE_STUDIO_IFRAME"
MARKER_DJANGO = "DOCUVERSE_STUDIO_IFRAME"


def _has_next_dep(app_root: Path) -> bool:
    pkg = app_root / "package.json"
    if not pkg.is_file():
        return False
    try:
        import json

        data = json.loads(pkg.read_text(encoding="utf-8"))
    except Exception:
        return False
    deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
    return "next" in deps


def _next_middleware_path(app_root: Path) -> Path:
    if (app_root / "src").is_dir():
        return app_root / "src" / "middleware.ts"
    return app_root / "middleware.ts"


CONFIG_XFO_MARKER = "DOCUVERSE_STUDIO_NO_XFO_CONFIG"
MW_WRAP_MARKER = "DOCUVERSE_STUDIO_IFRAME_MW"
WRAP_FN_MARKER = "DOCUVERSE_STUDIO_IFRAME_FNWRAP"

_MW_EXPORT_FN_RE = re.compile(
    r"export\s+(?:async\s+)?function\s+middleware\s*(\([^)]*\))\s*\{",
    re.MULTILINE,
)


def _closing_brace_index(source: str, open_brace_idx: int) -> int:
    """Return index of ``}`` matching ``{`` at open_brace_idx, or -1."""
    if open_brace_idx >= len(source) or source[open_brace_idx] != "{":
        return -1
    depth = 1
    i = open_brace_idx + 1
    while i < len(source) and depth:
        c = source[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return i - 1 if depth == 0 else -1


def _middleware_invocation_args(params_with_parens: str) -> str:
    """``(request: NextRequest, ev: NextFetchEvent)`` → ``request, ev``."""
    inner = params_with_parens.strip()
    if inner.startswith("(") and inner.endswith(")"):
        inner = inner[1:-1].strip()
    if not inner:
        return ""
    names: list[str] = []
    for part in inner.split(","):
        p = part.strip()
        if not p:
            continue
        name = p.split(":", 1)[0].strip()
        if name.endswith("?"):
            name = name[:-1].strip()
        name = name.split("=", 1)[0].strip()
        names.append(name)
    return ", ".join(names)


def patch_next_config_iframe_allow(app_root: Path) -> bool:
    """Remove X-Frame-Options from next.config headers (it overrides middleware)."""
    root = Path(app_root).resolve()
    if not _has_next_dep(root):
        return False

    for name in ("next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"):
        path = root / name
        if not path.is_file():
            continue
        try:
            txt = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if CONFIG_XFO_MARKER in txt:
            continue
        if re.search(r"X-Frame-Options", txt, re.IGNORECASE) is None:
            continue

        # Drop { key: 'X-Frame-Options', value: '...' } blocks (TS/JS)
        new_txt = re.sub(
            r"\{\s*key:\s*['\"]X-Frame-Options['\"]\s*,\s*value:\s*['\"][^'\"]*['\"]\s*\}\s*,?\s*",
            "",
            txt,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        if new_txt == txt:
            continue

        if CONFIG_XFO_MARKER not in new_txt:
            new_txt = new_txt.rstrip() + f"\n\n// {CONFIG_XFO_MARKER}\n"
        path.write_text(new_txt, encoding="utf-8")
        logger.info("Studio iframe: removed X-Frame-Options from %s", path.name)
        return True
    return False


def patch_next_middleware_response_strip_xfo(app_root: Path) -> bool:
    """If next-intl middleware exists, strip XFO on the response it returns."""
    root = Path(app_root).resolve()
    if not _has_next_dep(root):
        return False

    path = _next_middleware_path(root)
    if not path.is_file():
        return False
    try:
        txt = path.read_text(encoding="utf-8")
    except OSError:
        return False
    if MW_WRAP_MARKER in txt or MARKER_NEXT in txt:
        return False
    # Only rewrite the common next-intl wrapper pattern
    if "intlMiddleware" not in txt:
        return False

    pat = re.compile(
        r"^(\s*)return\s+intlMiddleware\s*\(\s*request\s*\)\s*;\s*$",
        re.MULTILINE,
    )
    if not pat.search(txt):
        return False

    def _repl(m: re.Match[str]) -> str:
        ind = m.group(1)
        return (
            f"{ind}const _dvStudioRes = intlMiddleware(request);  // {MW_WRAP_MARKER}\n"
            f"{ind}_dvStudioRes.headers.delete('X-Frame-Options');\n"
            f"{ind}_dvStudioRes.headers.delete('x-frame-options');\n"
            f"{ind}{{\n"
            f"{ind}  const _csp = _dvStudioRes.headers.get('Content-Security-Policy');\n"
            f"{ind}  if (_csp) {{\n"
            f"{ind}    const _parts = _csp.split(';').map((s) => s.trim()).filter(Boolean);\n"
            f"{ind}    const _rest = _parts.filter((p) => !/^frame-ancestors\\b/i.test(p));\n"
            f"{ind}    _dvStudioRes.headers.set('Content-Security-Policy', [..._rest, 'frame-ancestors *'].join('; '));\n"
            f"{ind}  }}\n"
            f"{ind}}}\n"
            f"{ind}return _dvStudioRes;"
        )

    new_txt = pat.sub(_repl, txt, count=1)
    if new_txt == txt:
        return False

    path.write_text(new_txt, encoding="utf-8")
    logger.info("Studio iframe: wrapped intlMiddleware return in %s", path.name)
    return True


def patch_next_middleware_wrap_export_function(app_root: Path) -> bool:
    """Wrap ``export function middleware`` so responses allow Studio cross-port iframes.

    Repos that already define middleware skipped ``patch_next_iframe_allow``; many
    set X-Frame-Options or CSP frame-ancestors, which yields a blank Studio preview.
    """
    root = Path(app_root).resolve()
    if not _has_next_dep(root):
        return False

    path = _next_middleware_path(root)
    if not path.is_file():
        return False
    try:
        txt = path.read_text(encoding="utf-8")
    except OSError:
        return False
    if WRAP_FN_MARKER in txt or MARKER_NEXT in txt or MW_WRAP_MARKER in txt:
        return False
    if re.search(r"export\s+const\s+middleware\b", txt):
        return False

    m = _MW_EXPORT_FN_RE.search(txt)
    if not m:
        return False

    open_idx = m.end() - 1
    if open_idx < 0 or txt[open_idx] != "{":
        return False
    close_idx = _closing_brace_index(txt, open_idx)
    if close_idx < 0:
        return False

    sig = txt[m.start() : m.end()]
    params = m.group(1)
    call_args = _middleware_invocation_args(params)

    body = txt[m.end() : close_idx]
    is_async = bool(re.match(r"\s*export\s+async\s+function\s+middleware\b", sig))
    async_kw = "async " if is_async else ""

    strip_fn = f"""function _docuverseStudioStripForIframe(response: unknown) {{
  // {WRAP_FN_MARKER}
  if (!response || typeof response !== 'object') return response
  const r = response as {{
    headers?: {{
      delete?: (n: string) => void
      get?: (n: string) => string | null
      set?: (n: string, v: string) => void
    }}
  }}
  const h = r.headers
  if (!h || typeof h.delete !== 'function') return response
  try {{
    h.delete('x-frame-options')
    h.delete('X-Frame-Options')
    const csp = h.get?.('Content-Security-Policy') ?? null
    if (csp && typeof csp === 'string') {{
      const parts = csp.split(';').map((s) => s.trim()).filter(Boolean)
      const rest = parts.filter((p) => !/^frame-ancestors\\b/i.test(p))
      const nextCsp = [...rest, 'frame-ancestors *'].join('; ')
      if (typeof h.set === 'function') h.set('Content-Security-Policy', nextCsp)
    }}
  }} catch {{
    /* ignore */
  }}
  return response
}}

"""

    inner_fn = f"{async_kw}function _docuverseStudioUserMw{params} {{\n{body}\n}}\n\n"
    export_fn = (
        f"export function middleware{params} {{\n"
        f"  return Promise.resolve(_docuverseStudioUserMw({call_args})).then(_docuverseStudioStripForIframe)\n"
        f"}}\n"
    )

    new_txt = txt[: m.start()] + inner_fn + strip_fn + export_fn + txt[close_idx + 1 :]
    path.write_text(new_txt, encoding="utf-8")
    logger.info("Studio iframe: wrapped middleware export in %s", path.name)
    return True


def patch_next_iframe_allow(app_root: Path) -> bool:
    """Inject Next.js middleware that removes X-Frame-Options for Studio embedding."""
    root = Path(app_root).resolve()
    if not _has_next_dep(root):
        return False

    path = _next_middleware_path(root)
    if path.is_file():
        try:
            existing = path.read_text(encoding="utf-8")
        except OSError:
            return False
        if MARKER_NEXT in existing:
            return False
        logger.info(
            "Studio iframe: %s exists without %s — skipping Next patch",
            path.name,
            MARKER_NEXT,
        )
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    body = f"""import {{ NextResponse }} from 'next/server'
import type {{ NextRequest }} from 'next/server'

// {MARKER_NEXT} — DocuVerse Studio needs cross-port iframe embedding
export function middleware(_request: NextRequest) {{
  const response = NextResponse.next()
  response.headers.delete('X-Frame-Options')
  response.headers.delete('x-frame-options')
  return response
}}

export const config = {{
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}}
"""
    path.write_text(body, encoding="utf-8")
    logger.info("Studio iframe: wrote %s for cross-origin preview", path)
    return True


def patch_flask_iframe_allow(app_root: Path) -> bool:
    """Remove X-Frame-Options on each Flask response (Studio preview)."""
    root = Path(app_root).resolve()
    app_py = root / "app.py"
    if not app_py.is_file():
        return False
    try:
        txt = app_py.read_text(encoding="utf-8")
    except OSError:
        return False
    if MARKER_FLASK in txt:
        return False

    mo = re.search(r"^(\w+)\s*=\s*Flask\s*\(\s*__name__", txt, re.MULTILINE)
    if not mo:
        return False

    app_var = mo.group(1)
    hook = f"""

@{app_var}.after_request
def _docuverse_studio_iframe_headers(response):  # {MARKER_FLASK}
    for _h in ("X-Frame-Options", "x-frame-options"):
        response.headers.pop(_h, None)
    return response
"""
    new_txt = txt + hook
    app_py.write_text(new_txt, encoding="utf-8")
    logger.info("Studio iframe: appended after_request hook to %s", app_py)
    return True


def _find_django_settings(root: Path) -> Optional[Path]:
    manage = root / "manage.py"
    if not manage.is_file():
        return None
    for rel in (
        root / "settings.py",
        root / "config" / "settings.py",
        root / "project" / "settings.py",
    ):
        if rel.is_file():
            return rel
    # Common package layout: <name>/settings.py
    for child in root.iterdir():
        if child.is_dir() and not child.name.startswith("."):
            cand = child / "settings.py"
            if cand.is_file():
                return cand
    return None


def patch_django_iframe_allow(app_root: Path) -> bool:
    """Drop XFrameOptionsMiddleware so Studio can iframe the dev server."""
    root = Path(app_root).resolve()
    settings_path = _find_django_settings(root)
    if not settings_path:
        return False
    try:
        txt = settings_path.read_text(encoding="utf-8")
    except OSError:
        return False
    if MARKER_DJANGO in txt:
        return False

    snippet = f"""

# {MARKER_DJANGO} — allow DocuVerse Studio to embed this dev server in an iframe
try:
    _mw = globals().get("MIDDLEWARE")
    if _mw is not None:
        _filtered = [
            m
            for m in _mw
            if "clickjacking.XFrameOptionsMiddleware" not in str(m)
        ]
        globals()["MIDDLEWARE"] = type(_mw)(_filtered)
except Exception:
    pass
"""
    settings_path.write_text(txt + snippet, encoding="utf-8")
    logger.info("Studio iframe: patched %s (XFrameOptionsMiddleware filtered)", settings_path)
    return True


def apply_studio_iframe_fixes(app_root: Path, framework: str) -> None:
    """Best-effort patches before starting the dev server."""
    root = Path(app_root).resolve()
    try:
        if framework == "nextjs":
            patch_next_config_iframe_allow(root)
            patch_next_middleware_response_strip_xfo(root)
            patch_next_middleware_wrap_export_function(root)
            patch_next_iframe_allow(root)
        elif framework == "flask":
            patch_flask_iframe_allow(root)
        elif framework == "django":
            patch_django_iframe_allow(root)
        else:
            # Heuristic: generated builder apps are Next even if mis-tagged
            if _has_next_dep(root):
                patch_next_config_iframe_allow(root)
                patch_next_middleware_response_strip_xfo(root)
                patch_next_middleware_wrap_export_function(root)
                patch_next_iframe_allow(root)
    except Exception as e:
        logger.warning("Studio iframe fixups skipped: %s", e)
