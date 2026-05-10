"""
App Studio — Design Extractor

Downloads Stitch AI's generated HTML and extracts design tokens:
  - Color palette (primary, secondary, accent, backgrounds, text)
  - Typography (font families, sizes, weights)
  - Layout structure (grid, flex patterns, spacing)
  - Component types (cards, tables, charts, buttons, forms)
  - Border radii, shadows, transitions

This extracted design context is passed to Bedrock so it generates
interactive code that visually matches the Stitch design.
"""

import re
import logging
from typing import Dict, Any, List, Optional
from html.parser import HTMLParser

import httpx

logger = logging.getLogger(__name__)


class _CSSExtractor(HTMLParser):
    """Extract inline styles and style tag content from HTML."""

    def __init__(self):
        super().__init__()
        self.styles: List[str] = []
        self.components: List[Dict[str, str]] = []
        self._in_style = False
        self._style_data = ""
        self._tag_stack: List[str] = []

    def handle_starttag(self, tag, attrs):
        self._tag_stack.append(tag)
        if tag == "style":
            self._in_style = True
            self._style_data = ""

        attrs_dict = dict(attrs)
        cls = attrs_dict.get("class", "")
        style = attrs_dict.get("style", "")

        # Track meaningful components
        if tag in ("div", "section", "article", "header", "nav", "table",
                    "form", "button", "input", "select", "ul", "ol"):
            self.components.append({
                "tag": tag,
                "class": cls,
                "style": style,
            })

    def handle_endtag(self, tag):
        if tag == "style" and self._in_style:
            self._in_style = False
            self.styles.append(self._style_data)
        if self._tag_stack:
            self._tag_stack.pop()

    def handle_data(self, data):
        if self._in_style:
            self._style_data += data


def _extract_colors(css: str) -> List[str]:
    """Pull all hex, rgb, rgba, hsl colors from CSS."""
    colors = set()
    # Hex colors
    for m in re.finditer(r'#[0-9a-fA-F]{3,8}\b', css):
        colors.add(m.group().lower())
    # rgb/rgba
    for m in re.finditer(r'rgba?\([^)]+\)', css):
        colors.add(m.group())
    # hsl/hsla
    for m in re.finditer(r'hsla?\([^)]+\)', css):
        colors.add(m.group())
    return sorted(colors)


def _extract_fonts(css: str) -> List[str]:
    """Pull font-family declarations from CSS."""
    fonts = set()
    for m in re.finditer(r'font-family:\s*([^;]+);', css, re.IGNORECASE):
        raw = m.group(1).strip().strip("'\"")
        # Take the first font in the stack
        primary = raw.split(",")[0].strip().strip("'\"")
        if primary and primary not in ("inherit", "initial", "unset"):
            fonts.add(primary)
    return sorted(fonts)


def _extract_sizes(css: str) -> Dict[str, List[str]]:
    """Pull font-size and spacing values."""
    font_sizes = set()
    for m in re.finditer(r'font-size:\s*([^;]+);', css, re.IGNORECASE):
        font_sizes.add(m.group(1).strip())

    border_radii = set()
    for m in re.finditer(r'border-radius:\s*([^;]+);', css, re.IGNORECASE):
        border_radii.add(m.group(1).strip())

    return {
        "font_sizes": sorted(font_sizes),
        "border_radii": sorted(border_radii),
    }


def _extract_shadows(css: str) -> List[str]:
    """Pull box-shadow declarations."""
    shadows = set()
    for m in re.finditer(r'box-shadow:\s*([^;]+);', css, re.IGNORECASE):
        shadows.add(m.group(1).strip())
    return sorted(shadows)


def _classify_components(components: List[Dict[str, str]]) -> Dict[str, int]:
    """Classify HTML components by type based on tag and class names."""
    counts: Dict[str, int] = {}
    for comp in components:
        tag = comp["tag"]
        cls = comp.get("class", "").lower()

        if tag == "table" or "table" in cls:
            key = "data_table"
        elif tag == "form" or "form" in cls:
            key = "form"
        elif tag == "nav" or "nav" in cls or "sidebar" in cls:
            key = "navigation"
        elif tag == "header" or "header" in cls:
            key = "header"
        elif "card" in cls:
            key = "card"
        elif "chart" in cls or "graph" in cls:
            key = "chart"
        elif "modal" in cls or "dialog" in cls:
            key = "modal"
        elif "btn" in cls or tag == "button":
            key = "button"
        elif tag in ("input", "select"):
            key = "input"
        else:
            key = tag

        counts[key] = counts.get(key, 0) + 1

    return counts


async def download_stitch_html(html_url: str) -> Optional[str]:
    """Download the HTML from a Stitch-generated URL."""
    if not html_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(html_url)
            resp.raise_for_status()
            return resp.text
    except Exception as e:
        logger.warning(f"Failed to download Stitch HTML: {e}")
        return None


def extract_design_tokens(html_content: str) -> Dict[str, Any]:
    """
    Extract design tokens from Stitch-generated HTML.

    Returns a structured dict of design information that can be passed
    to Bedrock for generating interactive code that matches the design.
    """
    parser = _CSSExtractor()
    try:
        parser.feed(html_content)
    except Exception as e:
        logger.warning(f"HTML parsing failed: {e}")
        return {}

    all_css = "\n".join(parser.styles)

    colors = _extract_colors(all_css)
    fonts = _extract_fonts(all_css)
    sizes = _extract_sizes(all_css)
    shadows = _extract_shadows(all_css)
    component_counts = _classify_components(parser.components)

    # Classify colors into roles (best guess)
    bg_colors = [c for c in colors if c in ('#fff', '#ffffff', '#000', '#000000')
                 or 'rgb(255' in c or 'rgb(0,' in c]
    accent_colors = [c for c in colors if c not in bg_colors]

    return {
        "colors": {
            "all": colors[:20],  # Cap at 20 most relevant
            "likely_primary": accent_colors[0] if accent_colors else "#6366f1",
            "likely_accents": accent_colors[:5],
            "likely_backgrounds": bg_colors[:5],
        },
        "typography": {
            "fonts": fonts,
            "primary_font": fonts[0] if fonts else "Inter",
            "font_sizes": sizes.get("font_sizes", []),
        },
        "spacing": {
            "border_radii": sizes.get("border_radii", []),
            "shadows": shadows[:5],
        },
        "components": component_counts,
        "layout_hints": _guess_layout(all_css),
    }


def _guess_layout(css: str) -> Dict[str, bool]:
    """Guess layout patterns from CSS."""
    return {
        "uses_grid": "display: grid" in css or "display:grid" in css,
        "uses_flexbox": "display: flex" in css or "display:flex" in css,
        "has_sidebar": "sidebar" in css.lower(),
        "has_cards": "card" in css.lower(),
        "has_tables": "table" in css.lower(),
        "dark_theme": ("#0" in css and "#f" in css) or "dark" in css.lower(),
    }


def format_design_context(
    tokens: Dict[str, Any],
    screenshot_url: Optional[str] = None,
) -> str:
    """
    Format extracted design tokens into a text prompt section
    that Bedrock can use to match the visual design.
    """
    if not tokens:
        return ""

    colors = tokens.get("colors", {})
    typo = tokens.get("typography", {})
    spacing = tokens.get("spacing", {})
    comps = tokens.get("components", {})
    layout = tokens.get("layout_hints", {})

    lines = [
        "STITCH AI DESIGN REFERENCE (match this visual style exactly):",
        "",
        f"Primary Color: {colors.get('likely_primary', '#6366f1')}",
        f"Accent Colors: {', '.join(colors.get('likely_accents', [])[:4])}",
        f"Primary Font: {typo.get('primary_font', 'Inter')}",
        f"Font Sizes Used: {', '.join(typo.get('font_sizes', [])[:6])}",
        f"Border Radii: {', '.join(spacing.get('border_radii', [])[:4])}",
        f"Box Shadows: {', '.join(spacing.get('shadows', [])[:2])}",
    ]

    if comps:
        lines.append(f"Components Detected: {', '.join(f'{k}({v})' for k, v in comps.items())}")

    layout_features = [k.replace('_', ' ') for k, v in layout.items() if v]
    if layout_features:
        lines.append(f"Layout: {', '.join(layout_features)}")

    if screenshot_url:
        lines.append(f"Screenshot Reference: {screenshot_url}")

    return "\n".join(lines)
