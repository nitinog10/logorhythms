"""
App Studio — App Assembler

Combines individually generated screen HTML sections into a single unified
SPA (Single Page Application) with:
  - Shared sidebar navigation
  - Hash-based page routing (show/hide sections)
  - Consolidated design system CSS variables
  - Click-to-edit overlay script (postMessage to parent)
"""

import html
import re
import logging
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)


def assemble_app(
    project_title: str,
    screens: List[Dict[str, Any]],
    design_system: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Assemble all screen sections into a unified SPA.

    Each screen must have:
      - id: unique screen ID
      - name: display name
      - generated_html: the HTML content for that screen

    Returns a complete HTML document string.
    """
    ds = design_system or {}
    primary = ds.get("primaryColor", "#6366f1")
    font = ds.get("fontFamily", "Inter")
    appearance = ds.get("appearance", "light").lower()
    is_dark = "dark" in appearance

    # Build screen sections and nav items
    nav_items = []
    screen_sections = []
    extra_styles = []  # Collect styles from Stitch HTML heads
    ready_screens = [s for s in screens if s.get("generated_html")]

    if not ready_screens:
        return _empty_app(project_title, primary, font)

    for i, screen in enumerate(ready_screens):
        sid = screen["id"]
        name = html.escape(screen.get("name", f"Screen {i+1}"))
        active_class = "active" if i == 0 else ""
        display = "block" if i == 0 else "none"

        nav_items.append(
            f'<button class="nav-item {active_class}" data-screen="{sid}" '
            f'onclick="navigateTo(\'{sid}\')">'
            f'<span class="nav-dot"></span>{name}</button>'
        )

        screen_html = screen.get("generated_html", "")

        # Handle Stitch full HTML documents — extract body + head styles
        screen_html, head_styles = _extract_body_content(screen_html)

        if head_styles:
            extra_styles.append(head_styles)

        screen_sections.append(
            f'<section id="screen-{sid}" class="screen-section" '
            f'style="display:{display}">\n{screen_html}\n</section>'
        )

    nav_html = "\n".join(nav_items)
    sections_html = "\n".join(screen_sections)

    bg = "#0a0a0f" if is_dark else "#f8f9fa"
    card_bg = "#13131a" if is_dark else "#ffffff"
    text = "#e4e4e7" if is_dark else "#1a1a2e"
    text_muted = "#71717a" if is_dark else "#6b7280"
    sidebar_bg = "#0f0f15" if is_dark else "#ffffff"
    border = "#1e1e2e" if is_dark else "#e5e7eb"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(project_title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family={font}:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

  :root {{
    --primary: {primary};
    --primary-light: {primary}22;
    --bg: {bg};
    --card-bg: {card_bg};
    --text: {text};
    --text-muted: {text_muted};
    --sidebar-bg: {sidebar_bg};
    --border: {border};
    --font: '{font}', -apple-system, BlinkMacSystemFont, sans-serif;
  }}

  body {{
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    display: flex;
    height: 100vh;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }}

  /* ── Sidebar Navigation ── */
  .app-sidebar {{
    width: 220px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }}

  .sidebar-header {{
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--border);
  }}

  .sidebar-title {{
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 8px;
  }}

  .sidebar-title::before {{
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary);
  }}

  .sidebar-nav {{
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }}

  .nav-item {{
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: 2px;
  }}

  .nav-item:hover {{
    background: var(--primary-light);
    color: var(--text);
  }}

  .nav-item.active {{
    background: var(--primary-light);
    color: var(--primary);
    font-weight: 600;
  }}

  .nav-dot {{
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.5;
    flex-shrink: 0;
  }}

  .nav-item.active .nav-dot {{
    opacity: 1;
    background: var(--primary);
  }}

  /* ── Main Content ── */
  .app-content {{
    flex: 1;
    overflow-y: auto;
    position: relative;
  }}

  .screen-section {{
    min-height: 100%;
    animation: fadeIn 0.25s ease;
  }}

  @keyframes fadeIn {{
    from {{ opacity: 0; }}
    to {{ opacity: 1; }}
  }}

  /* ── Click-to-Edit Overlay ── */
  .edit-overlay {{
    position: absolute;
    pointer-events: none;
    border: 2px solid var(--primary);
    border-radius: 4px;
    background: var(--primary-light);
    z-index: 9999;
    transition: all 0.1s ease;
    display: none;
  }}

  .edit-overlay.visible {{
    display: block;
  }}

  .edit-tooltip {{
    position: absolute;
    top: -28px;
    left: 0;
    background: var(--primary);
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    font-family: var(--font);
  }}
</style>
{chr(10).join(extra_styles)}
</head>
<body>

<aside class="app-sidebar">
  <div class="sidebar-header">
    <div class="sidebar-title">{html.escape(project_title)}</div>
  </div>
  <nav class="sidebar-nav">
    {nav_html}
  </nav>
</aside>

<main class="app-content" id="app-content">
  {sections_html}
  <div class="edit-overlay" id="edit-overlay">
    <div class="edit-tooltip" id="edit-tooltip">Click to edit</div>
  </div>
</main>

<script>
// ── Page Navigation ──
function navigateTo(screenId) {{
  document.querySelectorAll('.screen-section').forEach(s => {{
    s.style.display = 'none';
  }});
  document.querySelectorAll('.nav-item').forEach(n => {{
    n.classList.remove('active');
  }});

  const target = document.getElementById('screen-' + screenId);
  if (target) {{
    target.style.display = 'block';
    target.style.animation = 'none';
    target.offsetHeight; // trigger reflow
    target.style.animation = 'fadeIn 0.25s ease';
  }}

  const nav = document.querySelector('[data-screen="' + screenId + '"]');
  if (nav) nav.classList.add('active');

  // Notify parent about navigation
  window.parent.postMessage({{
    type: 'screen-navigate',
    screenId: screenId
  }}, '*');
}}

// ── Click-to-Edit ──
const overlay = document.getElementById('edit-overlay');
const tooltip = document.getElementById('edit-tooltip');
let lastTarget = null;

document.querySelector('.app-content').addEventListener('mousemove', (e) => {{
  const el = e.target;
  if (el === overlay || el === tooltip || el.closest('.edit-overlay')) return;
  if (el.closest('.app-sidebar')) return;
  if (el === lastTarget) return;
  lastTarget = el;

  const tag = el.tagName.toLowerCase();
  const skip = ['html', 'body', 'main', 'section', 'script', 'style'];
  if (skip.includes(tag)) {{
    overlay.classList.remove('visible');
    return;
  }}

  const rect = el.getBoundingClientRect();
  const content = document.getElementById('app-content');
  const cRect = content.getBoundingClientRect();

  overlay.style.top = (rect.top - cRect.top + content.scrollTop) + 'px';
  overlay.style.left = (rect.left - cRect.left) + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.classList.add('visible');

  const label = tag + (el.className ? '.' + el.className.split(' ')[0] : '');
  tooltip.textContent = 'Click to edit: ' + label;
}});

document.querySelector('.app-content').addEventListener('mouseleave', () => {{
  overlay.classList.remove('visible');
  lastTarget = null;
}});

document.querySelector('.app-content').addEventListener('click', (e) => {{
  const el = e.target;
  if (el === overlay || el === tooltip || el.closest('.edit-overlay')) return;
  if (el.closest('.app-sidebar')) return;

  const tag = el.tagName.toLowerCase();
  const skip = ['html', 'body', 'main', 'section', 'script', 'style'];
  if (skip.includes(tag)) return;

  // Find which screen this element belongs to
  const section = el.closest('.screen-section');
  const screenId = section ? section.id.replace('screen-', '') : null;

  // Build context about the clicked element
  const context = {{
    type: 'element-click',
    screenId: screenId,
    tag: tag,
    text: (el.textContent || '').trim().slice(0, 100),
    className: el.className || '',
    id: el.id || '',
    parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : '',
    computedStyle: {{
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
      fontSize: getComputedStyle(el).fontSize,
    }}
  }};

  window.parent.postMessage(context, '*');

  // Visual feedback
  el.style.outline = '2px solid var(--primary)';
  el.style.outlineOffset = '2px';
  setTimeout(() => {{
    el.style.outline = '';
    el.style.outlineOffset = '';
  }}, 1500);
}});

// Listen for navigation commands from parent
window.addEventListener('message', (e) => {{
  if (e.data && e.data.type === 'navigate') {{
    navigateTo(e.data.screenId);
  }}
}});

// Hash-based routing
if (window.location.hash) {{
  const id = window.location.hash.replace('#', '');
  navigateTo(id);
}}
</script>
</body>
</html>"""


def _empty_app(title: str, primary: str, font: str) -> str:
    """Return a placeholder app when no screens are generated yet."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{html.escape(title)}</title>
<link href="https://fonts.googleapis.com/css2?family={font}:wght@400;600&display=swap" rel="stylesheet">
<style>
  body {{
    font-family: '{font}', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    margin: 0;
    background: #0a0a0f;
    color: #e4e4e7;
  }}
  .placeholder {{
    text-align: center;
  }}
  .placeholder h2 {{
    font-size: 20px;
    margin-bottom: 8px;
  }}
  .placeholder p {{
    color: #71717a;
    font-size: 14px;
  }}
</style>
</head>
<body>
<div class="placeholder">
  <h2>{html.escape(title)}</h2>
  <p>Click "Generate All" to build your application</p>
</div>
</body>
</html>"""
def _extract_body_content(raw_html: str) -> Tuple[str, str]:
    """
    Extract body content from a full HTML document (e.g., from Stitch AI).

    If the HTML is a complete document (with DOCTYPE/html/body), extracts:
      - Body inner content (returned as first element)
      - Head styles, links, and scripts (returned as second element)

    If the HTML is already a section/div, returns it unchanged.

    Returns:
        (body_content, head_styles_and_links)
    """
    stripped = raw_html.strip().lower()

    # Check if this is a full HTML document
    if not (stripped.startswith("<!doctype") or stripped.startswith("<html")):
        return raw_html, ""

    head_extras = []

    # Extract <style> tags from <head>
    for m in re.finditer(
        r'<style[^>]*>(.*?)</style>',
        raw_html,
        re.DOTALL | re.IGNORECASE,
    ):
        head_extras.append(m.group(0))

    # Extract <link> tags (fonts, stylesheets, icons)
    for m in re.finditer(
        r'<link[^>]*>',
        raw_html,
        re.IGNORECASE,
    ):
        tag = m.group(0)
        # Keep stylesheet and icon links
        if 'rel="stylesheet"' in tag or 'rel="icon"' in tag or 'fonts' in tag:
            head_extras.append(tag)

    # Extract body content
    body_match = re.search(
        r'<body[^>]*>(.*)</body>',
        raw_html,
        re.DOTALL | re.IGNORECASE,
    )
    if body_match:
        body_content = body_match.group(1).strip()
    else:
        # No body tag found — use as-is but strip html/head wrappers
        body_content = raw_html
        # Remove DOCTYPE, html, head
        body_content = re.sub(
            r'<!DOCTYPE[^>]*>',
            '',
            body_content,
            flags=re.IGNORECASE,
        )
        body_content = re.sub(
            r'</?html[^>]*>',
            '',
            body_content,
            flags=re.IGNORECASE,
        )
        body_content = re.sub(
            r'<head[^>]*>.*?</head>',
            '',
            body_content,
            flags=re.DOTALL | re.IGNORECASE,
        )
        body_content = body_content.strip()

    return body_content, "\n".join(head_extras)
