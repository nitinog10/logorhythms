"""
App Studio — Screen Content Generator (Stitch + Bedrock)

Two-stage generation pipeline:
  1. Stitch AI generates a visual design (screenshot + HTML)
  2. Design tokens are extracted from the Stitch HTML
  3. Bedrock generates interactive HTML/CSS/JS that matches
     the Stitch visual design but with full interactivity

Each screen is generated as a content section (not a full page) that gets
assembled into the unified SPA by app_assembler.py.
"""

import logging
from typing import Dict, Any, Optional

from app.services.bedrock_client import call_nova_pro

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert UI engineer building a production SaaS application.
Generate the INNER HTML content for one screen/page of the application.

CRITICAL RULES:
1. Return ONLY the HTML content — NO <!DOCTYPE>, NO <html>, NO <head>, NO <body> tags.
2. Return a single root <div> element containing all the screen content.
3. Include a <style> tag at the TOP of your output with all CSS for this screen.
4. Include a <script> tag at the BOTTOM with any interactive JavaScript.
5. Use these CSS variables (they're defined by the parent app):
   --primary, --primary-light, --bg, --card-bg, --text, --text-muted, --border, --font
6. Make ALL interactive elements functional:
   - Buttons should have click handlers (show alerts, toggle states)
   - Forms should validate inputs
   - Tabs/pills should switch content
   - Dropdown menus should open/close
   - Table rows should be hoverable
   - Modals should open/close when triggered
7. Use REALISTIC placeholder data (real names, dates, numbers, emails).
8. Make it visually polished: proper spacing, shadows, rounded corners, transitions.
9. Include hover effects on all interactive elements.
10. The design must look like a PRODUCTION application, not a prototype.
11. Use Google Fonts 'Inter' (already loaded by parent).
12. NO external dependencies — vanilla HTML/CSS/JS only.
13. Scope all CSS selectors and JS to avoid conflicts with other screens.
   Use a unique prefix based on the screen name."""


async def generate_screen_html(
    screen_name: str,
    screen_prompt: str,
    design_system: Optional[Dict[str, Any]] = None,
    stitch_design_context: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate interactive HTML content for a single screen section.

    Args:
        screen_name: Display name of the screen
        screen_prompt: What the screen should contain
        design_system: User-configured design system (colors, font, etc.)
        stitch_design_context: Extracted design tokens from Stitch AI
            (colors, fonts, layout structure, component types)

    Returns:
        {
            "html": str — HTML content (div, style, script),
            "title": str — screen title,
            "status": "ready" | "error",
            "error": str | None,
        }
    """
    ds_context = ""
    if design_system:
        ds_context = f"""
Design System Configuration:
- Primary Color: {design_system.get('primaryColor', '#6366f1')}
- Font: {design_system.get('fontFamily', 'Inter')}
- Corner Roundness: {design_system.get('cornerRoundness', 'medium')}
- Appearance: {design_system.get('appearance', 'dark')}
- Style Notes: {design_system.get('styleNotes', 'Modern, clean, professional SaaS aesthetic')}
"""

    # If we have Stitch design context, add it prominently
    stitch_section = ""
    if stitch_design_context:
        stitch_section = f"""

{stitch_design_context}

IMPORTANT: You MUST match the visual style described above as closely as possible.
Use the exact colors, fonts, border radii, and shadows from the Stitch design.
The layout and component structure should mirror what Stitch designed.
Your job is to make it INTERACTIVE while keeping the visual fidelity.
"""

    # Create a safe CSS/JS prefix from the screen name
    prefix = screen_name.lower().replace(" ", "-").replace("_", "-")
    prefix = "".join(c for c in prefix if c.isalnum() or c == "-")

    prompt = f"""{SYSTEM_PROMPT}

Screen Name: {screen_name}
CSS/JS Prefix: {prefix}
{ds_context}
{stitch_section}

Screen Requirements:
{screen_prompt}

Generate the complete screen content now (remember: NO full HTML document, just the content div with embedded style and script):"""

    try:
        raw = await call_nova_pro(prompt, max_tokens=8192, temperature=0.3)

        # Clean up response
        content = raw.strip()
        if content.startswith("```html"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        # Remove any accidental full document wrappers
        for tag in ["<!DOCTYPE html>", "<!doctype html>"]:
            if tag in content.lower()[:50]:
                body_start = content.lower().find("<body")
                if body_start != -1:
                    body_start = content.find(">", body_start) + 1
                    body_end = content.lower().rfind("</body>")
                    if body_end != -1:
                        content = content[body_start:body_end].strip()
                break

        # Ensure it's wrapped in a div
        if not content.strip().startswith("<style") and not content.strip().startswith("<div"):
            content = f"<div>{content}</div>"

        return {
            "html": content,
            "title": screen_name,
            "status": "ready",
            "error": None,
        }

    except Exception as e:
        logger.error(f"Screen generation failed for '{screen_name}': {e}")
        return {
            "html": None,
            "title": screen_name,
            "status": "error",
            "error": str(e),
        }
