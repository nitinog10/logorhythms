"""
App Studio — App Generation Orchestrator

Coordinates the full app generation pipeline:
  1. Takes user requirements (raw or structured)
  2. Refines them via AWS Bedrock (Nova Pro)
  3. Generates screen prompts for Stitch AI
  4. Manages the generation lifecycle

This is the brain that connects user intent → Stitch AI screens → builder project.
"""

import json
import logging
import uuid
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

from app.services.stitch_service import StitchMCPClient
from app.services.templates import get_template, get_all_templates
from app.services.bedrock_client import call_nova_pro, call_nova_lite

logger = logging.getLogger(__name__)


class AppGenerator:
    """Orchestrates app generation from templates or free-form requirements."""

    def __init__(self):
        self.stitch = StitchMCPClient()

    async def generate_from_template(
        self,
        template_id: str,
        user_id: str,
        customizations: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a full app from a pre-built template.

        Returns a builder project dict with all screens ready for preview.
        """
        template = get_template(template_id)
        if not template:
            raise ValueError(f"Template '{template_id}' not found")

        project_id = f"builder_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        # Build screens from template definitions
        screens = []
        for i, screen_def in enumerate(template["screens"]):
            prompt = screen_def["prompt"]
            # Apply customizations to the prompt
            if customizations:
                extras = []
                if customizations.get("brand_name"):
                    extras.append(f"Brand name: {customizations['brand_name']}")
                if customizations.get("color_scheme"):
                    extras.append(f"Color scheme: {customizations['color_scheme']}")
                if customizations.get("style"):
                    extras.append(f"Style: {customizations['style']}")
                if customizations.get("additional_notes"):
                    extras.append(customizations["additional_notes"])
                if extras:
                    prompt = f"{prompt}\n\nCustomizations: {'; '.join(extras)}"
            screen = {
                "id": f"screen_{uuid.uuid4().hex[:12]}",
                "name": screen_def["name"],
                "screen_type": screen_def["screen_type"],
                "prompt": prompt,
                "order": i,
                "status": "pending",
                "stitch_screen_id": None,
                "preview_url": None,
                "components": [],
            }
            screens.append(screen)

        # Build the project
        brand_name = (customizations or {}).get("brand_name", template["name"])
        project = {
            "id": project_id,
            "user_id": user_id,
            "title": brand_name,
            "template_id": template_id,
            "stitch_project_id": None,
            "status": "draft",
            "screens": screens,
            "design_system": template.get("design_system", {}),
            "design_system_id": None,
            "customizations": customizations or {},
            "requirements": {
                "app_type": template["category"],
                "title": brand_name,
                "description": template["description"],
                "features": template["features"],
                "target_users": "General",
                "design_preferences": template.get("design_system", {}),
            },
            "created_at": now,
            "updated_at": now,
        }

        return project

    async def generate_from_requirements(
        self,
        raw_input: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """
        Generate an app from free-form natural language requirements.

        Uses Bedrock to refine requirements, then builds screen prompts.
        """
        # Step 1: Refine requirements via AI
        refined = await self.refine_requirements(raw_input)

        project_id = f"builder_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        # Step 2: Generate screen definitions from refined spec
        screens = []
        suggested_screens = refined.get("suggested_screens", [
            "Dashboard",
            "List View",
            "Detail View",
            "Settings",
        ])
        for i, screen_name in enumerate(suggested_screens):
            screen_prompt = await self._generate_screen_prompt(
                screen_name,
                refined,
            )
            screen = {
                "id": f"screen_{uuid.uuid4().hex[:12]}",
                "name": screen_name,
                "screen_type": self._infer_screen_type(screen_name),
                "prompt": screen_prompt,
                "order": i,
                "status": "pending",
                "stitch_screen_id": None,
                "preview_url": None,
                "components": [],
            }
            screens.append(screen)

        # Step 3: Determine design system
        design_prefs = refined.get("design_preferences", {})
        design_system = {
            "primaryColor": design_prefs.get("color_scheme", "#6366f1"),
            "fontFamily": "Inter",
            "cornerRoundness": "MEDIUM",
            "appearance": "LIGHT" if "light" in design_prefs.get("style", "").lower() else "DARK",
        }

        project = {
            "id": project_id,
            "user_id": user_id,
            "title": refined.get("title", "My App"),
            "template_id": None,
            "stitch_project_id": None,
            "status": "draft",
            "screens": screens,
            "design_system": design_system,
            "design_system_id": None,
            "customizations": {},
            "requirements": refined,
            "created_at": now,
            "updated_at": now,
        }

        return project

    async def refine_requirements(self, raw_input: str) -> Dict[str, Any]:
        """
        Use Bedrock Nova Pro to refine raw user input into a structured spec.
        """
        prompt = f"""You are an expert software architect and product designer.
A user wants to build a SaaS application and has provided this description:

\"\"\"
{raw_input}
\"\"\"

Analyze their requirements and return a structured JSON specification with these fields:
{{
  "app_type": "string (e.g. crm, ecommerce, project-management, saas-dashboard, landing-page)",
  "title": "string — suggested app name",
  "description": "string — refined one-paragraph description",
  "features": ["list of key features"],
  "target_users": "string — who will use this",
  "design_preferences": {{"style": "modern/minimal/corporate", "color_scheme": "hex color or description"}},
  "suggested_screens": ["list of 4-6 screen names the app needs"],
  "integrations": ["any third-party integrations needed"],
  "clarifying_questions": ["any questions to refine further"]
}}

Return ONLY valid JSON. No markdown, no explanation."""

        try:
            response = await call_nova_pro(prompt, max_tokens=2048, temperature=0.3)

            # Parse JSON from response (handle potential markdown wrapping)
            text = response.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]  # Remove first line
                text = text.rsplit("```", 1)[0]  # Remove last ```
            text = text.strip()

            refined = json.loads(text)
            return refined
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI response as JSON, using defaults")
            return {
                "app_type": "custom",
                "title": "My App",
                "description": raw_input[:200],
                "features": [raw_input],
                "target_users": "General users",
                "design_preferences": {"style": "modern", "color_scheme": "dark"},
                "suggested_screens": ["Dashboard", "List View", "Detail View", "Settings"],
                "integrations": [],
                "clarifying_questions": [],
            }
        except Exception as e:
            logger.error(f"Bedrock call failed: {e}")
            return {
                "app_type": "custom",
                "title": "My App",
                "description": raw_input[:200],
                "features": [raw_input],
                "target_users": "General users",
                "design_preferences": {"style": "modern", "color_scheme": "dark"},
                "suggested_screens": ["Dashboard", "List View", "Detail View", "Settings"],
                "integrations": [],
                "clarifying_questions": [],
            }

    async def _generate_screen_prompt(
        self,
        screen_name: str,
        requirements: Dict[str, Any],
    ) -> str:
        """Generate a detailed screen prompt based on the app requirements."""
        prompt = f"""Generate a detailed UI design prompt for a screen called "{screen_name}" 
in a {requirements.get('app_type', 'SaaS')} application called "{requirements.get('title', 'My App')}".

App description: {requirements.get('description', '')}
Key features: {', '.join(requirements.get('features', []))}
Target users: {requirements.get('target_users', 'General')}
Design style: {requirements.get('design_preferences', {}).get('style', 'modern')}

Write a detailed design prompt (3-5 sentences) describing exactly what UI elements, 
layout, and content this screen should contain. Be specific about components, 
data to display, and interactions. Return ONLY the prompt text, no explanation."""

        try:
            return await call_nova_lite(prompt, max_tokens=512, temperature=0.4)
        except Exception as e:
            logger.error(f"Screen prompt generation failed: {e}")
            return f"Design a {screen_name} screen for a {requirements.get('app_type', 'SaaS')} application with a clean, modern layout."

    @staticmethod
    def _infer_screen_type(screen_name: str) -> str:
        """Infer screen type from its name."""
        name_lower = screen_name.lower()
        if any(k in name_lower for k in ["dashboard", "overview", "analytics", "report"]):
            return "dashboard"
        elif any(k in name_lower for k in ["list", "table", "management", "orders", "contacts"]):
            return "list"
        elif any(k in name_lower for k in ["detail", "profile", "view"]):
            return "detail"
        elif any(k in name_lower for k in ["form", "settings", "checkout", "edit", "create"]):
            return "form"
        elif any(k in name_lower for k in ["landing", "home", "hero", "pricing", "testimonial", "faq", "footer"]):
            return "landing"
        elif any(k in name_lower for k in ["login", "signup", "auth", "register"]):
            return "auth"
        else:
            return "dashboard"
