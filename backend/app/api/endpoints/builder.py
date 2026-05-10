"""
App Studio — Builder API Endpoints

All endpoints for the App Studio SaaS builder feature:
  - Template browsing
  - Project CRUD
  - Screen generation (via Stitch AI)
  - Screen editing (natural language)
  - Design system management
  - Push to GitHub
"""

import json
import uuid
import logging
import base64
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Header, Body
from pydantic import BaseModel, Field

from fastapi import Depends
from app.config import get_settings
from app.api.endpoints.auth import get_current_user
from app.services.templates import get_all_templates, get_template
from app.services.app_generator import AppGenerator
from app.services.builder_persistence import (
    save_builder_project,
    load_builder_project,
    load_user_builder_projects,
    delete_builder_project,
    count_user_builder_projects,
)
from app.services.billing_service import PLAN_LIMITS
# B3 fix: canonical classifier lives in edit_classifier.py
from app.services.edit_classifier import classify_edit_legacy as _canonical_classify_edit
# Rate limiter for expensive endpoints
from app.middleware.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

# Tier limits for App Studio projects
APP_STUDIO_LIMITS = {
    "free": 1,
    "pro": 5,
    "team": 10,
}


# ---------------------------------------------------------------------------
# Click-to-Edit Overlay Injection
# ---------------------------------------------------------------------------

CLICK_TO_EDIT_SCRIPT = """
<style>
.__cte-overlay {
  position: fixed;
  pointer-events: none;
  border: 2px solid #6366f1;
  border-radius: 4px;
  background: rgba(99,102,241,0.08);
  z-index: 99999;
  transition: all 0.1s ease;
  display: none;
}
.__cte-overlay.visible { display: block; }
.__cte-tooltip {
  position: fixed;
  background: #6366f1;
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  font-family: Inter, system-ui, sans-serif;
  z-index: 100000;
  display: none;
  pointer-events: none;
}
.__cte-tooltip.visible { display: block; }
</style>
<div class="__cte-overlay" id="__cte-overlay"></div>
<div class="__cte-tooltip" id="__cte-tooltip">Click to edit</div>
<script>
(function() {
  var overlay = document.getElementById('__cte-overlay');
  var tooltip = document.getElementById('__cte-tooltip');
  var lastEl = null;
  var SCREEN_ID = '__SCREEN_ID__';
  var SKIP = ['html','body','script','style','link','meta','__cte-overlay','__cte-tooltip'];

  function isSkip(el) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName.toLowerCase();
    if (SKIP.indexOf(tag) >= 0) return true;
    if (el.id && el.id.indexOf('__cte') === 0) return true;
    if (el.className && typeof el.className === 'string' && el.className.indexOf('__cte') >= 0) return true;
    return false;
  }

  document.addEventListener('mousemove', function(e) {
    var el = e.target;
    if (isSkip(el)) { overlay.classList.remove('visible'); tooltip.classList.remove('visible'); lastEl = null; return; }
    if (el === lastEl) return;
    lastEl = el;
    var rect = el.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.classList.add('visible');
    var tag = el.tagName.toLowerCase();
    var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    tooltip.textContent = 'Click to edit: ' + tag + cls;
    tooltip.style.top = Math.max(0, rect.top - 28) + 'px';
    tooltip.style.left = rect.left + 'px';
    tooltip.classList.add('visible');
  });

  document.addEventListener('mouseleave', function() {
    overlay.classList.remove('visible');
    tooltip.classList.remove('visible');
    lastEl = null;
  });

  document.addEventListener('click', function(e) {
    var el = e.target;
    if (isSkip(el)) return;
    e.preventDefault();
    e.stopPropagation();
    var tag = el.tagName.toLowerCase();
    // A8 fix: send only tag/class/id — no raw textContent that may contain PII.
    var cs = window.getComputedStyle(el);
    window.parent.postMessage({
      type: 'element-click',
      screenId: SCREEN_ID,
      tag: tag,
      className: (typeof el.className === 'string') ? el.className.trim().slice(0, 120) : '',
      id: (el.id || '').slice(0, 80),
      parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : '',
      computedStyle: {
        color: cs.color,
        background: cs.backgroundColor,
        fontSize: cs.fontSize
      }
    }, window.location.origin);
    el.style.outline = '2px solid #6366f1';
    el.style.outlineOffset = '2px';
    setTimeout(function() { el.style.outline = ''; el.style.outlineOffset = ''; }, 1500);
  }, true);
})();
</script>
"""


def _inject_click_to_edit(html_content: str, screen_id: str) -> str:
    """Inject click-to-edit overlay CSS + JS into HTML before </body>."""
    script = CLICK_TO_EDIT_SCRIPT.replace("__SCREEN_ID__", screen_id)

    # Try to inject before </body>
    lower = html_content.lower()
    body_close = lower.rfind("</body>")
    if body_close != -1:
        return html_content[:body_close] + script + html_content[body_close:]

    # Try before </html>
    html_close = lower.rfind("</html>")
    if html_close != -1:
        return html_content[:html_close] + script + html_content[html_close:]

    # Append at the end
    return html_content + script


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class CreateProjectFromTemplateRequest(BaseModel):
    """Create a builder project from a pre-built template."""
    template_id: str = Field(..., max_length=64)
    brand_name: Optional[str] = Field(None, max_length=120)
    color_scheme: Optional[str] = Field(None, max_length=120)
    style: Optional[str] = Field(None, max_length=120)
    additional_notes: Optional[str] = Field(None, max_length=1000)


class CreateProjectFromRequirementsRequest(BaseModel):
    """Create a builder project from raw requirements."""
    raw_input: str = Field(..., min_length=10, max_length=4000)
    app_type: Optional[str] = Field(None, max_length=80)


class EditScreenRequest(BaseModel):
    """Edit a screen using natural language."""
    prompt: str = Field(..., min_length=3, max_length=2000)


class UpdateDesignSystemRequest(BaseModel):
    """Update the design system for a project."""
    primary_color: Optional[str] = Field(None, max_length=30)
    font_family: Optional[str] = Field(None, max_length=80)
    corner_roundness: Optional[str] = Field(None, max_length=20)
    appearance: Optional[str] = Field(None, max_length=20)
    style_notes: Optional[str] = Field(None, max_length=500)


class RefineRequirementsRequest(BaseModel):
    """Refine raw requirements into structured spec."""
    raw_input: str = Field(..., min_length=10, max_length=4000)


class PushToGithubRequest(BaseModel):
    """Push generated project to GitHub."""
    repo_name: str = Field(..., max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    description: str = Field("", max_length=300)
    private: bool = False


class ProjectSummary(BaseModel):
    """Lightweight project info for listing."""
    id: str
    title: str
    template_id: Optional[str] = None
    status: str
    screen_count: int
    category: Optional[str] = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Helper: Auth guard + project limit
# ---------------------------------------------------------------------------

async def _guard(authorization: str | None):
    """Authenticate user via JWT header (same pattern as all other endpoints)."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _check_project_limit(user) -> None:
    """Check if user has reached their App Studio project limit."""
    tier = getattr(user, "subscription_tier", "free") or "free"
    limit = APP_STUDIO_LIMITS.get(tier, 1)
    count = count_user_builder_projects(user.id)
    if count >= limit:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "LIMIT_EXCEEDED",
                "feature": "app_studio_projects",
                "used": count,
                "limit": limit,
                "tier": tier,
                "upgrade_url": "/pricing",
            },
        )


# ---------------------------------------------------------------------------
# Template Endpoints
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates():
    """List all available SaaS templates."""
    return get_all_templates()


@router.get("/templates/{template_id}")
async def get_template_detail(template_id: str):
    """Get detailed template information."""
    template = get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Return template without raw prompts (those are internal)
    return {
        "id": template["id"],
        "name": template["name"],
        "description": template["description"],
        "category": template["category"],
        "icon": template["icon"],
        "preview_color": template["preview_color"],
        "features": template["features"],
        "screens": [
            {"name": s["name"], "screen_type": s["screen_type"]}
            for s in template["screens"]
        ],
        "design_system": template.get("design_system", {}),
    }


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@router.post("/projects")
async def create_project_from_template(
    body: CreateProjectFromTemplateRequest,
    authorization: str = Header(None),
):
    """Create a new builder project from a template."""
    user = await _guard(authorization)
    _check_project_limit(user)

    generator = AppGenerator()
    customizations = {
        "brand_name": body.brand_name,
        "color_scheme": body.color_scheme,
        "style": body.style,
        "additional_notes": body.additional_notes,
    }
    # Remove None values
    customizations = {k: v for k, v in customizations.items() if v is not None}

    try:
        project = await generator.generate_from_template(
            template_id=body.template_id,
            user_id=user.id,
            customizations=customizations,
        )
        save_builder_project(project)
        return project
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create project: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project")


@router.post("/projects/from-requirements")
async def create_project_from_requirements(
    body: CreateProjectFromRequirementsRequest,
    authorization: str = Header(None),
):
    """Create a new builder project from free-form requirements."""
    user = await _guard(authorization)
    _check_project_limit(user)

    generator = AppGenerator()

    try:
        project = await generator.generate_from_requirements(
            raw_input=body.raw_input,
            user_id=user.id,
        )
        save_builder_project(project)
        return project
    except Exception as e:
        logger.error(f"Failed to create project from requirements: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project")


@router.get("/projects")
async def list_projects(authorization: str = Header(None)):
    """List all builder projects for the current user."""
    user = await _guard(authorization)
    projects = load_user_builder_projects(user.id)

    # Return summaries
    tier = getattr(user, "subscription_tier", "free") or "free"
    limit = APP_STUDIO_LIMITS.get(tier, 1)

    return {
        "projects": [
            {
                "id": p["id"],
                "title": p.get("title", "Untitled"),
                "template_id": p.get("template_id"),
                "status": p.get("status", "draft"),
                "screen_count": len(p.get("screens", [])),
                "category": p.get("requirements", {}).get("app_type"),
                "created_at": p.get("created_at", ""),
                "updated_at": p.get("updated_at", ""),
            }
            for p in projects
        ],
        "limit": limit,
        "used": len(projects),
        "tier": tier,
    }


@router.get("/projects/{project_id}")
async def get_project(project_id: str, authorization: str = Header(None)):
    """Get full project details including all screens."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return project


@router.delete("/projects/{project_id}")
async def remove_project(project_id: str, authorization: str = Header(None)):
    """Delete a builder project."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    delete_builder_project(project_id)
    return {"success": True, "message": "Project deleted"}


# ---------------------------------------------------------------------------
# Screen Generation & Editing
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/generate")
async def generate_screens(
    project_id: str,
    authorization: str = Header(None),
    _rate: None = Depends(RateLimiter("generate")),
):
    """
    Generate all pending screens using Stitch AI directly.

    Pipeline:
      1. Stitch AI generates visual design + full HTML
      2. Stitch HTML used directly (superior quality)
      3. Falls back to Bedrock if Stitch is unavailable
      4. All screens assembled into a unified SPA with navigation
    """
    from app.services.screen_generator import generate_screen_html
    from app.services.app_assembler import assemble_app
    from app.services.stitch_service import get_stitch_client
    from app.services.design_extractor import download_stitch_html

    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    project["status"] = "generating"
    save_builder_project(project)

    # --- Phase 1: Stitch AI design generation ---
    stitch = get_stitch_client()
    stitch_project_id = project.get("stitch_project_id")

    # Create Stitch project if we don't have one
    if not stitch_project_id and stitch.api_key:
        try:
            stitch_result = await stitch.create_project(project.get("title", "My App"))
            stitch_project_id = stitch_result.get("project_id")
            project["stitch_project_id"] = stitch_project_id
            logger.info(f"Created Stitch project: {stitch_project_id}")
        except Exception as e:
            logger.warning(f"Stitch project creation failed (will use Bedrock only): {e}")

    try:
        for screen in project.get("screens", []):
            if screen.get("status") not in ("pending", "edited"):
                continue

            screen["status"] = "generating"
            save_builder_project(project)

            stitch_html_used = False

            # Primary: Use Stitch AI HTML directly
            if stitch_project_id:
                try:
                    logger.info(f"Stitch generating design for: {screen['name']}")
                    stitch_screen = await stitch.generate_screen(
                        project_id=stitch_project_id,
                        prompt=screen["prompt"],
                        device_type="DESKTOP",
                    )

                    screens_data = stitch_screen.get("screens", [])
                    if screens_data:
                        s = screens_data[0]
                        screen["stitch_screen_id"] = s.get("screen_id")
                        screen["screenshot_url"] = s.get("screenshot_url")
                        screen["stitch_html_url"] = s.get("html_url")

                        # Download Stitch HTML and use it directly
                        html_url = s.get("html_url")
                        if html_url:
                            stitch_html = await download_stitch_html(html_url)
                            if stitch_html:
                                # Use Stitch HTML as-is — it's superior quality
                                screen["generated_html"] = stitch_html
                                screen["generated_title"] = s.get("title", screen["name"])
                                screen["status"] = "ready"
                                screen["generation_method"] = "stitch"
                                stitch_html_used = True
                                logger.info(f"Using Stitch HTML directly for: {screen['name']}")

                except Exception as e:
                    logger.warning(
                        f"Stitch failed for {screen['name']}, "
                        f"falling back to Bedrock: {e}"
                    )

            # Fallback: Bedrock generates interactive code if Stitch failed
            if not stitch_html_used:
                try:
                    result = await generate_screen_html(
                        screen_name=screen["name"],
                        screen_prompt=screen["prompt"],
                        design_system=project.get("design_system"),
                    )

                    if result["status"] == "ready" and result.get("html"):
                        screen["generated_html"] = result["html"]
                        screen["generated_title"] = result.get("title", screen["name"])
                        screen["status"] = "ready"
                        screen["generation_method"] = "bedrock"
                    else:
                        screen["status"] = "error"
                        screen["error"] = result.get("error", "Generation failed")

                except Exception as e:
                    logger.error(f"Screen generation failed for {screen['name']}: {e}")
                    screen["status"] = "error"
                    screen["error"] = str(e)

        # --- Phase 3: Assemble unified SPA ---
        assembled = assemble_app(
            project_title=project.get("title", "My App"),
            screens=project.get("screens", []),
            design_system=project.get("design_system"),
        )
        project["assembled_app"] = assembled
        project["preview_url"] = f"/api/builder/projects/{project_id}/preview"

        # Update overall status
        all_statuses = [s.get("status") for s in project.get("screens", [])]
        if all(s == "ready" for s in all_statuses):
            project["status"] = "ready"
        elif any(s == "error" for s in all_statuses):
            project["status"] = "partial"
        else:
            project["status"] = "ready"

    except Exception as e:
        logger.error(f"Generation pipeline failed: {e}")
        project["status"] = "error"

    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return project


# ---------------------------------------------------------------------------
# Quick Edit — 3-Tier Instant Edit System
# ---------------------------------------------------------------------------

# Keywords that identify a visual-only CSS edit
_CSS_KEYWORDS = {
    "color", "background", "font", "size", "spacing", "padding", "margin",
    "border", "radius", "shadow", "opacity", "bold", "italic", "underline",
    "align", "center", "left", "right", "width", "height", "gap", "rounded",
    "dark", "light", "white", "black", "blue", "red", "green", "purple",
    "gradient", "transparent", "hidden", "visible", "hide", "show",
}

import re as _re


def _classify_edit(prompt: str) -> str:
    """B3 fix: thin shim — delegates to canonical edit_classifier.py."""
    return _canonical_classify_edit(prompt)


def _apply_css_edit(html: str, prompt: str) -> str:
    """Apply a CSS-level edit to HTML via regex patching."""
    prompt_lower = prompt.lower()

    # Color changes: "change X color to Y" or "make X Y"
    color_match = _re.search(
        r'(?:color|background|bg)\s*(?:to|=|:)?\s*(#[0-9a-fA-F]{3,8}|'
        r'rgb\([^)]+\)|[a-z]+)',
        prompt_lower,
    )
    if color_match:
        new_color = color_match.group(1)
        # Common color names to hex
        color_map = {
            "blue": "#3b82f6", "red": "#ef4444", "green": "#22c55e",
            "purple": "#8b5cf6", "orange": "#f97316", "pink": "#ec4899",
            "yellow": "#eab308", "white": "#ffffff", "black": "#000000",
            "gray": "#6b7280", "grey": "#6b7280", "indigo": "#6366f1",
            "teal": "#14b8a6", "cyan": "#06b6d4",
        }
        if new_color in color_map:
            new_color = color_map[new_color]

        # Determine if it's background or text color
        if any(w in prompt_lower for w in ["background", "bg"]):
            # Replace background colors in inline styles
            html = _re.sub(
                r'background(?:-color)?:\s*[^;]+',
                f'background-color: {new_color}',
                html,
                count=3,
            )
        elif "header" in prompt_lower or "heading" in prompt_lower or "title" in prompt_lower:
            # Target h1/h2/h3 colors
            html = _re.sub(
                r'(<h[1-3][^>]*style="[^"]*?)color:\s*[^;]+',
                f'\\1color: {new_color}',
                html,
            )
        else:
            html = _re.sub(
                r'(?<=color:\s)#[0-9a-fA-F]{3,8}',
                new_color,
                html,
                count=5,
            )

    # Font size: "make text bigger/smaller" or "font size 20px"
    size_match = _re.search(r'(?:font[- ]?size|text[- ]?size)\s*(?:to|:)?\s*(\d+)\s*px', prompt_lower)
    if size_match:
        new_size = size_match.group(1)
        html = _re.sub(r'font-size:\s*\d+px', f'font-size: {new_size}px', html, count=5)

    # Padding/margin changes
    for prop in ["padding", "margin"]:
        pat = _re.search(rf'{prop}\s*(?:to|:)?\s*(\d+)\s*px', prompt_lower)
        if pat:
            val = pat.group(1)
            html = _re.sub(rf'{prop}:\s*[^;]+', f'{prop}: {val}px', html, count=5)

    # Border-radius
    if "rounded" in prompt_lower or "border-radius" in prompt_lower:
        rad_match = _re.search(r'(\d+)\s*px', prompt_lower)
        if rad_match:
            html = _re.sub(r'border-radius:\s*[^;]+', f'border-radius: {rad_match.group(1)}px', html, count=10)
        elif "full" in prompt_lower or "circle" in prompt_lower:
            html = _re.sub(r'border-radius:\s*[^;]+', 'border-radius: 9999px', html, count=10)

    # Text replacement: "change 'X' to 'Y'"
    text_match = _re.search(r"(?:change|replace|rename)\s+['\"]([^'\"]+)['\"]\s+to\s+['\"]([^'\"]+)['\"]", prompt, _re.IGNORECASE)
    if text_match:
        old_text, new_text = text_match.group(1), text_match.group(2)
        html = html.replace(old_text, new_text)

    return html


class QuickEditRequest(BaseModel):
    """Quick edit request with optional type hint."""
    prompt: str = Field(..., min_length=3, max_length=2000)
    edit_type: Optional[str] = Field(None, pattern=r"^(css|quick|structural)$")


@router.post("/projects/{project_id}/screens/{screen_id}/quick-edit")
async def quick_edit_screen(
    project_id: str,
    screen_id: str,
    body: QuickEditRequest,
    authorization: str = Header(None),
):
    """
    3-tier instant edit system:
      - css: Regex-based CSS/text patching (instant, no AI)
      - quick: Nova Micro for simple changes (~5-10s)
      - structural: Full Stitch AI edit (~30-60s)
    """
    from app.services.bedrock_client import call_nova_micro
    from app.services.stitch_service import get_stitch_client
    from app.services.design_extractor import download_stitch_html
    from app.services.app_assembler import assemble_app

    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    screen = None
    for s in project.get("screens", []):
        if s["id"] == screen_id:
            screen = s
            break
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")

    edit_type = body.edit_type or _classify_edit(body.prompt)
    existing_html = screen.get("generated_html", "")

    logger.info(f"Quick edit [{edit_type}] for {screen['name']}: {body.prompt[:80]}")

    def _record_edit_to_history(applied_type: str) -> None:
        """B6 fix: append this edit to project edit history."""
        history = project.setdefault("edit_history", [])
        history.append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "screen_id": screen_id,
            "prompt": body.prompt[:500],
            "edit_type": applied_type,
            "user_id": user.id,
        })
        # Keep last 100 edits only
        if len(history) > 100:
            project["edit_history"] = history[-100:]

    if edit_type == "css":
        # ── Instant CSS/text patch (no AI call) ──
        patched = _apply_css_edit(existing_html, body.prompt)
        if patched != existing_html:
            screen["generated_html"] = patched
            screen["last_edit"] = body.prompt
            screen["edited_at"] = datetime.now(timezone.utc).isoformat()
            _record_edit_to_history("css")
            save_builder_project(project)
            return {
                "success": True,
                "edit_type": "css",
                "message": "Applied instantly",
                "project": project,
            }
        # If CSS patch didn't change anything, fall through to quick
        edit_type = "quick"

    if edit_type == "quick":
        # ── Nova Micro for fast simple changes ──
        quick_prompt = f"""Modify this HTML based on the instruction. Return ONLY the modified HTML, no explanations.

INSTRUCTION: {body.prompt}

HTML:
{existing_html}"""

        try:
            result = await call_nova_micro(quick_prompt, max_tokens=8192)
            cleaned = result.strip()
            for fence in ["```html", "```"]:
                if cleaned.startswith(fence):
                    cleaned = cleaned[len(fence):]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            if cleaned and len(cleaned) > 50:
                screen["generated_html"] = cleaned
                screen["last_edit"] = body.prompt
                screen["edited_at"] = datetime.now(timezone.utc).isoformat()
                _record_edit_to_history("quick")
                save_builder_project(project)
                return {
                    "success": True,
                    "edit_type": "quick",
                    "message": "Applied via quick edit",
                    "project": project,
                }
        except Exception as e:
            logger.warning(f"Quick edit failed, falling back to structural: {e}")

    # ── Structural: Full Stitch edit ──
    stitch_project_id = project.get("stitch_project_id")
    stitch_screen_id = screen.get("stitch_screen_id")

    if stitch_project_id and stitch_screen_id:
        try:
            stitch = get_stitch_client()
            stitch_result = await stitch.edit_screen(
                project_id=stitch_project_id,
                screen_id=stitch_screen_id,
                prompt=body.prompt,
                device_type="DESKTOP",
            )
            screens_data = stitch_result.get("screens", [])
            if screens_data:
                s = screens_data[0]
                new_id = s.get("screen_id")
                if new_id:
                    screen["stitch_screen_id"] = new_id
                html_url = s.get("html_url")
                if html_url:
                    updated = await download_stitch_html(html_url)
                    if updated:
                        screen["generated_html"] = updated
                        screen["last_edit"] = body.prompt
                        screen["edited_at"] = datetime.now(timezone.utc).isoformat()
                        save_builder_project(project)
                        return {
                            "success": True,
                            "edit_type": "structural",
                            "message": "Applied via Stitch AI",
                            "project": project,
                        }
        except Exception as e:
            logger.error(f"Stitch structural edit failed: {e}")

    # Last resort: Bedrock full edit
    from app.services.screen_generator import generate_screen_html
    edit_prompt = f"""{screen.get('prompt', '')}

EXISTING HTML:
{existing_html}

EDIT: {body.prompt}

Apply the edit. Keep everything else unchanged. Return complete HTML."""

    try:
        result = await generate_screen_html(
            screen_name=screen["name"],
            screen_prompt=edit_prompt,
            design_system=project.get("design_system"),
        )
        if result["status"] == "ready" and result.get("html"):
            screen["generated_html"] = result["html"]
            screen["last_edit"] = body.prompt
            screen["edited_at"] = datetime.now(timezone.utc).isoformat()
            save_builder_project(project)
    except Exception as e:
        logger.error(f"Bedrock edit also failed: {e}")

    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return {
        "success": True,
        "edit_type": "structural",
        "message": "Applied via full regeneration",
        "project": project,
    }


# ---------------------------------------------------------------------------
# Environment Variable Detection
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/detect-env")
async def detect_env_vars(
    project_id: str,
    authorization: str = Header(None),
):
    """
    Scan fullstack_files for process.env.* references.
    Returns a list of required environment variables.
    """
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    files = project.get("fullstack_files", {})
    env_vars = {}

    for path, content in files.items():
        # Find process.env.VAR_NAME patterns
        for m in _re.finditer(r'process\.env\.([A-Z_][A-Z0-9_]*)', content):
            var = m.group(1)
            if var not in env_vars:
                env_vars[var] = {"name": var, "found_in": [], "description": ""}
            if path not in env_vars[var]["found_in"]:
                env_vars[var]["found_in"].append(path)

        # Find env("VAR_NAME") patterns (Prisma)
        for m in _re.finditer(r'env\("([A-Z_][A-Z0-9_]*)"\)', content):
            var = m.group(1)
            if var not in env_vars:
                env_vars[var] = {"name": var, "found_in": [], "description": ""}
            if path not in env_vars[var]["found_in"]:
                env_vars[var]["found_in"].append(path)

    # Add descriptions for common vars
    descriptions = {
        "DATABASE_URL": "Database connection string (default: SQLite file:./dev.db)",
        "NEXTAUTH_SECRET": "Secret for NextAuth.js session encryption",
        "NEXTAUTH_URL": "Base URL for NextAuth.js (e.g., http://localhost:3000)",
        "NEXT_PUBLIC_API_URL": "Public API base URL",
        "STRIPE_SECRET_KEY": "Stripe API secret key for payments",
        "STRIPE_PUBLISHABLE_KEY": "Stripe publishable key for frontend",
        "RAZORPAY_KEY_ID": "Razorpay API key ID",
        "RAZORPAY_KEY_SECRET": "Razorpay API key secret",
        "GOOGLE_CLIENT_ID": "Google OAuth client ID",
        "GOOGLE_CLIENT_SECRET": "Google OAuth client secret",
        "GITHUB_CLIENT_ID": "GitHub OAuth client ID",
        "GITHUB_CLIENT_SECRET": "GitHub OAuth client secret",
        "SMTP_HOST": "SMTP server host for sending emails",
        "SMTP_USER": "SMTP username",
        "SMTP_PASS": "SMTP password",
        "AWS_ACCESS_KEY_ID": "AWS access key",
        "AWS_SECRET_ACCESS_KEY": "AWS secret key",
        "S3_BUCKET": "S3 bucket name for file storage",
        "REDIS_URL": "Redis connection URL",
    }
    for var in env_vars:
        if var in descriptions:
            env_vars[var]["description"] = descriptions[var]

    # Get current values from project's env config
    saved_env = project.get("env_config", {})
    for var in env_vars:
        env_vars[var]["value"] = saved_env.get(var, "")
        env_vars[var]["has_default"] = var == "DATABASE_URL"

    return {
        "env_vars": list(env_vars.values()),
        "total": len(env_vars),
    }


@router.post("/projects/{project_id}/save-env")
async def save_env_config(
    project_id: str,
    body: dict = Body(...),
    authorization: str = Header(None),
):
    """Save environment variable configuration for the project."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    env_config = body.get("env_vars", {})
    project["env_config"] = env_config

    # Update the .env file in fullstack_files
    if project.get("fullstack_files"):
        env_lines = []
        for key, value in env_config.items():
            if value:
                env_lines.append(f'{key}="{value}"')
        if env_lines:
            project["fullstack_files"][".env"] = "\n".join(env_lines) + "\n"

    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return {"success": True, "saved": len(env_config)}


@router.post("/projects/{project_id}/preview-token")
async def issue_project_preview_token(
    project_id: str,
    authorization: Optional[str] = Header(None),
):
    """Issue a short-lived preview token for a project (A4 fix).

    The frontend calls this once, then embeds ``?pt=<token>`` in the iframe src.
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    project = load_builder_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.services.preview_token import issue_preview_token
    token = issue_preview_token(user.id, project_id)
    return {"preview_token": token, "ttl_seconds": 14400}


@router.get("/projects/{project_id}/preview")
async def get_app_preview(project_id: str, pt: Optional[str] = None):
    """Serve the fully assembled SPA for live preview.

    A4 fix: requires a short-lived preview token (?pt=...) instead of being
    fully public.
    """
    from fastapi.responses import HTMLResponse
    from app.services.preview_token import validate_preview_token

    validate_preview_token(pt, project_id)

    project = load_builder_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    html = project.get("assembled_app")
    if not html:
        from app.services.app_assembler import assemble_app
        html = assemble_app(
            project_title=project.get("title", "My App"),
            screens=[],
            design_system=project.get("design_system"),
        )

    return HTMLResponse(content=html)


@router.post("/projects/{project_id}/screens/{screen_id}/preview-token")
async def issue_screen_preview_token(
    project_id: str,
    screen_id: str,
    authorization: Optional[str] = Header(None),
):
    """Issue a short-lived preview token for a specific screen (A4 fix)."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    project = load_builder_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    resource = f"{project_id}:{screen_id}"
    from app.services.preview_token import issue_preview_token
    token = issue_preview_token(user.id, resource)
    return {"preview_token": token, "ttl_seconds": 14400}


@router.get("/projects/{project_id}/screens/{screen_id}/preview")
async def get_screen_preview(project_id: str, screen_id: str, pt: Optional[str] = None):
    """Serve a single screen's HTML directly — no SPA wrapper.

    A4 fix: requires a short-lived preview token.
    """
    from fastapi.responses import HTMLResponse
    from app.services.preview_token import validate_preview_token

    validate_preview_token(pt, f"{project_id}:{screen_id}")

    project = load_builder_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    screen = None
    for s in project.get("screens", []):
        if s["id"] == screen_id:
            screen = s
            break

    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")

    raw_html = screen.get("generated_html", "")

    if not raw_html:
        # Return a placeholder
        raw_html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{{font-family:Inter,sans-serif;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;background:#0a0a0f;color:#e4e4e7}}
</style></head><body>
<div style="text-align:center">
<h2>{screen.get('name', 'Screen')}</h2>
<p style="color:#71717a">Click "Generate All" to build this screen</p>
</div></body></html>"""

    # If the HTML is NOT a full document, wrap it in one
    stripped = raw_html.strip().lower()
    if not (stripped.startswith("<!doctype") or stripped.startswith("<html")):
        raw_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: 'Inter', sans-serif; }}
</style>
</head>
<body>
{raw_html}
</body>
</html>"""
    # Suppress Tailwind CDN "should not be used in production" warning
    # (injected right after <head> so it runs before the CDN script)
    _tw_suppress = '<script>!function(){var w=console.warn;console.warn=function(){var a=[].join.call(arguments,"");if(a.indexOf("cdn.tailwindcss.com")>=0)return;w.apply(console,arguments)}}()</script>'
    head_pos = raw_html.lower().find("<head>")
    if head_pos != -1:
        insert_at = head_pos + len("<head>")
        raw_html = raw_html[:insert_at] + _tw_suppress + raw_html[insert_at:]

    # Inject click-to-edit overlay script into the HTML
    raw_html = _inject_click_to_edit(raw_html, screen_id)

    return HTMLResponse(content=raw_html)


@router.get("/projects/{project_id}/screens/{screen_id}/code")
async def get_screen_code(
    project_id: str,
    screen_id: str,
    authorization: str = Header(None),
):
    """
    Return the raw source code for a specific screen.

    Used by the frontend Code tab to display actual generated HTML/CSS/JS.
    """
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    screen = None
    for s in project.get("screens", []):
        if s["id"] == screen_id:
            screen = s
            break

    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")

    return {
        "screen_id": screen_id,
        "name": screen.get("name", ""),
        "code": screen.get("generated_html", "// Not generated yet"),
        "status": screen.get("status", "pending"),
    }


@router.post("/projects/{project_id}/screens/{screen_id}/edit")
async def edit_screen(
    project_id: str,
    screen_id: str,
    body: EditScreenRequest,
    authorization: str = Header(None),
):
    """
    Edit a specific screen using natural language.

    Pipeline:
      1. Try Stitch AI edit_screens (preserves original design fidelity)
      2. Download the updated HTML from Stitch
      3. Fall back to Bedrock only if Stitch edit fails
    """
    from app.services.stitch_service import get_stitch_client
    from app.services.design_extractor import download_stitch_html
    from app.services.screen_generator import generate_screen_html
    from app.services.app_assembler import assemble_app

    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Find the screen
    screen = None
    for s in project.get("screens", []):
        if s["id"] == screen_id:
            screen = s
            break

    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")

    edit_instruction = body.prompt
    screen["status"] = "generating"
    screen["last_edit"] = edit_instruction
    screen["edited_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    stitch_edit_succeeded = False
    stitch_project_id = project.get("stitch_project_id")
    stitch_screen_id = screen.get("stitch_screen_id")

    # --- Primary: Use Stitch AI to edit (preserves design) ---
    if stitch_project_id and stitch_screen_id:
        try:
            stitch = get_stitch_client()
            logger.info(
                f"Stitch editing screen '{screen['name']}' "
                f"(project={stitch_project_id}, screen={stitch_screen_id})"
            )

            stitch_result = await stitch.edit_screen(
                project_id=stitch_project_id,
                screen_id=stitch_screen_id,
                prompt=edit_instruction,
                device_type="DESKTOP",
            )

            screens_data = stitch_result.get("screens", [])
            if screens_data:
                s = screens_data[0]
                # Update Stitch metadata
                new_screen_id = s.get("screen_id")
                if new_screen_id:
                    screen["stitch_screen_id"] = new_screen_id
                screen["screenshot_url"] = s.get("screenshot_url", screen.get("screenshot_url"))

                # Download the updated HTML
                html_url = s.get("html_url")
                if html_url:
                    updated_html = await download_stitch_html(html_url)
                    if updated_html:
                        screen["generated_html"] = updated_html
                        screen["stitch_html_url"] = html_url
                        screen["status"] = "ready"
                        screen["generation_method"] = "stitch"
                        stitch_edit_succeeded = True
                        logger.info(f"Stitch edit succeeded for: {screen['name']}")

        except Exception as e:
            logger.warning(
                f"Stitch edit failed for {screen['name']}, "
                f"falling back to Bedrock: {e}"
            )

    # --- Fallback: Bedrock edit ---
    if not stitch_edit_succeeded:
        try:
            original_prompt = screen.get("prompt", "")
            existing_html = screen.get("generated_html", "")

            edit_prompt = f"""{original_prompt}

EXISTING IMPLEMENTATION (modify this based on the edit instruction below):
---
{existing_html if existing_html else 'No existing implementation'}
---

EDIT INSTRUCTION: {edit_instruction}

Apply the edit instruction to the existing implementation. Keep everything
that wasn't mentioned in the edit instruction unchanged. Preserve ALL images,
icons, and visual assets exactly as they are. Return the complete updated
screen content as a single HTML section."""

            result = await generate_screen_html(
                screen_name=screen["name"],
                screen_prompt=edit_prompt,
                design_system=project.get("design_system"),
            )

            if result["status"] == "ready" and result.get("html"):
                screen["generated_html"] = result["html"]
                screen["status"] = "ready"
                screen["generation_method"] = "bedrock"
            else:
                screen["status"] = "error"
                screen["error"] = result.get("error", "Edit generation failed")

        except Exception as e:
            logger.error(f"Bedrock edit also failed: {e}")
            screen["status"] = "error"
            screen["error"] = str(e)

    # Reassemble the SPA (for the assembled preview fallback)
    try:
        assembled = assemble_app(
            project_title=project.get("title", "My App"),
            screens=project.get("screens", []),
            design_system=project.get("design_system"),
        )
        project["assembled_app"] = assembled
    except Exception as e:
        logger.error(f"Reassembly failed: {e}")

    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return project


@router.post("/projects/{project_id}/screens")
async def add_screen(
    project_id: str,
    body: dict = Body(...),
    authorization: str = Header(None),
):
    """Add a new screen to an existing project."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    screen_name = body.get("name", "New Screen")
    screen_prompt = body.get("prompt", f"Design a {screen_name} screen")

    new_screen = {
        "id": f"screen_{uuid.uuid4().hex[:12]}",
        "name": screen_name,
        "screen_type": body.get("screen_type", "dashboard"),
        "prompt": screen_prompt,
        "order": len(project.get("screens", [])),
        "status": "pending",
        "stitch_screen_id": None,
        "preview_url": None,
        "components": [],
    }

    project.setdefault("screens", []).append(new_screen)
    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return new_screen


# ---------------------------------------------------------------------------
# Design System
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/design-system")
async def update_design_system(
    project_id: str,
    body: UpdateDesignSystemRequest,
    authorization: str = Header(None),
):
    """Update the design system for a project."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    ds = project.get("design_system", {})
    if body.primary_color:
        ds["primaryColor"] = body.primary_color
    if body.font_family:
        ds["fontFamily"] = body.font_family
    if body.corner_roundness:
        ds["cornerRoundness"] = body.corner_roundness
    if body.appearance:
        ds["appearance"] = body.appearance
    if body.style_notes:
        ds["styleNotes"] = body.style_notes

    project["design_system"] = ds
    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return {"success": True, "design_system": ds}


# ---------------------------------------------------------------------------
# Variant Generation
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/variants")
async def generate_variants(
    project_id: str,
    body: dict = Body(...),
    authorization: str = Header(None),
):
    """Generate design variants for a screen."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    screen_id = body.get("screen_id")
    prompt = body.get("prompt", "Generate alternative designs")
    count = body.get("count", 3)

    # Find the source screen
    source_screen = None
    for s in project.get("screens", []):
        if s["id"] == screen_id:
            source_screen = s
            break

    if not source_screen:
        raise HTTPException(status_code=404, detail="Screen not found")

    # Generate variant screens
    variants = []
    for i in range(count):
        variant = {
            "id": f"screen_{uuid.uuid4().hex[:12]}",
            "name": f"{source_screen['name']} — Variant {i + 1}",
            "screen_type": source_screen["screen_type"],
            "prompt": f"{source_screen['prompt']}\n\nVariant direction: {prompt} (variant {i + 1} of {count})",
            "order": len(project.get("screens", [])) + i,
            "status": "pending",
            "stitch_screen_id": None,
            "preview_url": None,
            "components": [],
            "is_variant_of": screen_id,
        }
        variants.append(variant)

    project.setdefault("screens", []).extend(variants)
    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return {"variants": variants}


# ---------------------------------------------------------------------------
# AI Refinement
# ---------------------------------------------------------------------------

@router.post("/refine")
async def refine_requirements(
    body: RefineRequirementsRequest,
    authorization: str = Header(None),
):
    """Use AI to refine raw requirements into a structured specification."""
    # This endpoint doesn't require a project — it's used during onboarding
    user = await _guard(authorization)

    generator = AppGenerator()
    refined = await generator.refine_requirements(body.raw_input)

    return {
        "refined_spec": refined,
        "suggestions": refined.get("clarifying_questions", []),
    }


# ---------------------------------------------------------------------------
# Magic Build — Convert Static HTML to Full-Stack App
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/magic-build")
async def magic_build_project(
    project_id: str,
    authorization: str = Header(None),
    _rate: None = Depends(RateLimiter("generate")),
):
    """
    Convert static Stitch/Bedrock screens into a full-stack Next.js application.

    Pipeline:
      1. Analyze all screens (detect data models, CRUD patterns, navigation)
      2. Generate Prisma schema, API routes, React pages with state management
      3. Generate shared layout with real routing
      4. Store all generated files on the project
    """
    from app.services.fullstack_generator import magic_build

    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    project["magic_build_status"] = "building"
    save_builder_project(project)

    try:
        result = await magic_build(project)

        if result.get("error"):
            project["magic_build_status"] = "error"
            project["magic_build_error"] = result["error"]
        else:
            project["fullstack_files"] = result.get("files", {})
            project["fullstack_spec"] = result.get("spec", {})
            project["magic_build_status"] = "ready"
            project["magic_build_summary"] = {
                "file_count": result.get("file_count", 0),
                "models": result.get("models", []),
                "routes": result.get("routes", []),
                "pages": result.get("pages", []),
            }

    except Exception as e:
        logger.error(f"Magic Build failed: {e}")
        project["magic_build_status"] = "error"
        project["magic_build_error"] = str(e)

    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_builder_project(project)

    return project


# ---------------------------------------------------------------------------
# Save Project
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/save")
async def save_project(
    project_id: str,
    authorization: str = Header(None),
):
    """
    Explicitly save the current project state.

    Projects are auto-saved on generate/edit, but this provides
    a user-facing save action with confirmation.
    """
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    project["updated_at"] = datetime.now(timezone.utc).isoformat()
    project["last_saved_at"] = project["updated_at"]
    save_builder_project(project)

    return {
        "success": True,
        "saved_at": project["updated_at"],
        "project_id": project_id,
    }


# ---------------------------------------------------------------------------
# Push to GitHub
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/push-to-github")
async def push_to_github(
    project_id: str,
    body: PushToGithubRequest,
    authorization: str = Header(None),
):
    """Create a new GitHub repository and push generated project files via the
    Contents API (Phase 3 — replaces stub)."""
    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    token = (user.access_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=400,
            detail="GitHub access token missing — sign out and sign in again with GitHub.",
        )

    from app.services.github_service import GitHubService, GitHubAPIError

    safe_name = body.repo_name.strip().lower().replace(" ", "-")
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in "-_")[:100]
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid repository name")

    gh = GitHubService(token)
    try:
        repo_data = await gh.create_repo(
            name=safe_name,
            description=(body.description or "")[:500],
            private=body.private,
        )
    except GitHubAPIError as e:
        raise HTTPException(status_code=400, detail=str(e))

    full_name = repo_data.get("full_name") or ""
    if "/" not in full_name:
        raise HTTPException(status_code=500, detail="GitHub returned unexpected repo payload")
    owner, repo = full_name.split("/", 1)
    branch = repo_data.get("default_branch") or "main"

    files = _build_project_files(project)
    # Prefer Magic Build output when present
    fs_files = project.get("fullstack_files")
    if isinstance(fs_files, dict) and fs_files:
        files = [{"path": k, "content": v} for k, v in fs_files.items() if isinstance(v, str)][:80]

    pushed: List[str] = []
    errors: List[str] = []

    for entry in files[:80]:
        path = entry.get("path") or ""
        content = entry.get("content", "")
        if isinstance(content, dict):
            content = json.dumps(content, indent=2)
        if not path:
            continue
        try:
            b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
            sha = await gh.get_file_sha(owner, repo, path, branch)
            await gh.push_file(
                owner,
                repo,
                path,
                b64,
                f"Add {path}",
                branch,
                sha=sha,
            )
            pushed.append(path)
        except GitHubAPIError as e:
            errors.append(f"{path}: {e}")

    return {
        "success": len(errors) == 0,
        "message": f"Pushed {len(pushed)} files to {full_name}",
        "project_id": project_id,
        "repo_url": repo_data.get("html_url"),
        "repo_full_name": full_name,
        "files_count": len(pushed),
        "files_pushed": pushed,
        "errors": errors or None,
    }


def _build_project_readme(project: Dict[str, Any]) -> str:
    """Generate a README.md for the project."""
    title = project.get("title", "My App")
    desc = project.get("requirements", {}).get("description", "")
    features = project.get("requirements", {}).get("features", [])
    screens = project.get("screens", [])

    readme = f"""# {title}

{desc}

## Features

{chr(10).join(f'- {f}' for f in features)}

## Screens

{chr(10).join(f'- **{s["name"]}** ({s["screen_type"]})' for s in screens)}

## Built with

- [DocuVerse App Studio](https://docuverse.ai) — AI-powered SaaS builder
- Generated using Stitch AI design system

## Getting Started

1. Clone this repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000)

---

*Generated by DocuVerse App Studio*
"""
    return readme


def _build_project_files(project: Dict[str, Any]) -> List[Dict[str, str]]:
    """Build a basic file structure for the generated project."""
    files = [
        {"path": "README.md", "content": _build_project_readme(project)},
        {"path": "package.json", "content": json.dumps({
            "name": project.get("title", "my-app").lower().replace(" ", "-"),
            "version": "1.0.0",
            "private": True,
            "scripts": {
                "dev": "next dev",
                "build": "next build",
                "start": "next start",
            },
            "dependencies": {
                "next": "^14.0.0",
                "react": "^18.2.0",
                "react-dom": "^18.2.0",
            },
        }, indent=2)},
    ]

    # Generate a page file for each screen
    for screen in project.get("screens", []):
        screen_slug = screen["name"].lower().replace(" ", "-")
        files.append({
            "path": f"src/app/{screen_slug}/page.tsx",
            "content": f"""'use client'

export default function {screen['name'].replace(' ', '')}Page() {{
  return (
    <div>
      <h1>{screen['name']}</h1>
      {{/* Generated by DocuVerse App Studio */}}
      {{/* Screen type: {screen['screen_type']} */}}
    </div>
  )
}}
""",
        })

    return files


# ---------------------------------------------------------------------------
# Full-Stack Preview Runner
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/fullstack-preview")
async def launch_fullstack_preview(
    project_id: str,
    authorization: str = Header(None),
):
    """
    Launch the generated full-stack app as a real Next.js dev server.

    Pipeline:
      1. Write fullstack_files to disk
      2. npm install (cached via node_modules reuse)
      3. npx prisma db push (SQLite — instant)
      4. npm run dev --port {dynamic_port}
      5. Return preview URL
    """
    from app.services.preview_runner import (
        write_project_files,
        start_preview,
        get_preview_status,
    )

    user = await _guard(authorization)
    project = load_builder_project(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    files = project.get("fullstack_files")
    if not files:
        raise HTTPException(
            status_code=400,
            detail="No full-stack files. Run Magic Build first.",
        )

    try:
        # Check if already running
        status = get_preview_status(project_id)
        if status and status.get("status") == "running":
            return {
                "status": "running",
                "url": status["url"],
                "port": status["port"],
                "message": "Preview already running",
            }

        # Write files to disk
        env_config = project.get("env_config", {})
        project_dir = await write_project_files(project_id, files, env_config)

        # Start dev server
        result = await start_preview(project_id, project_dir)

        return {
            "status": result.get("status", "error"),
            "url": result.get("url"),
            "port": result.get("port"),
            "error": result.get("error"),
            "message": "Full-stack preview launched" if result.get("status") != "error" else result.get("error"),
        }

    except Exception as e:
        logger.error(f"launch_fullstack_preview failed: {e}", exc_info=True)
        return {
            "status": "error",
            "url": None,
            "port": None,
            "error": str(e)[:500],
            "message": f"Preview launch failed: {str(e)[:200]}",
        }


@router.get("/projects/{project_id}/fullstack-preview/status")
async def get_fullstack_preview_status(
    project_id: str,
    authorization: str = Header(None),
):
    """Check the status of a running full-stack preview."""
    from app.services.preview_runner import get_preview_status

    user = await _guard(authorization)
    status = get_preview_status(project_id)

    if not status:
        return {"status": "stopped", "message": "No preview running"}

    return status


@router.post("/projects/{project_id}/fullstack-preview/stop")
async def stop_fullstack_preview(
    project_id: str,
    authorization: str = Header(None),
):
    """Stop a running full-stack preview."""
    from app.services.preview_runner import stop_preview

    user = await _guard(authorization)
    stopped = await stop_preview(project_id)

    return {
        "stopped": stopped,
        "message": "Preview stopped" if stopped else "No preview was running",
    }
