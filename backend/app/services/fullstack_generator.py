"""
App Studio — Full-Stack Code Generator (Magic Build)

Analyzes Stitch-generated HTML screens and produces a complete, deployable
Next.js full-stack application:

  - React pages with real state management
  - API route handlers (CRUD)
  - Prisma database schema
  - Shared layout with routing
  - Authentication boilerplate
  - Working form submissions, modals, data tables
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional

from app.services.bedrock_client import call_nova_pro

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────

ANALYZE_PROMPT = """You are a senior full-stack architect. Analyze these HTML screens
from a SaaS application and produce a JSON specification for the full-stack code.

SCREENS:
{screens_summary}

Return ONLY valid JSON (no markdown fences) with this structure:
{{
  "app_name": "slug-name",
  "description": "one line",
  "data_models": [
    {{
      "name": "User",
      "fields": [
        {{"name": "id", "type": "String", "primary": true}},
        {{"name": "email", "type": "String", "unique": true}},
        {{"name": "name", "type": "String"}},
        {{"name": "createdAt", "type": "DateTime"}}
      ]
    }}
  ],
  "api_routes": [
    {{"path": "/api/users", "methods": ["GET","POST"], "model": "User"}},
    {{"path": "/api/users/[id]", "methods": ["GET","PUT","DELETE"], "model": "User"}}
  ],
  "pages": [
    {{
      "route": "/dashboard",
      "name": "Dashboard",
      "screen_id": "...",
      "components": ["StatsCards", "RecentTable", "Chart"],
      "data_dependencies": ["User", "Order"]
    }}
  ],
  "auth_required": true,
  "nav_items": [
    {{"label": "Dashboard", "route": "/dashboard", "icon": "LayoutDashboard"}}
  ]
}}"""

PAGE_PROMPT = """You are a senior React/Next.js engineer. Generate a COMPLETE
Next.js 14 App Router page component for this screen.

SCREEN: {screen_name}
ROUTE: {route}

ORIGINAL STITCH DESIGN (this is the AUTHORITATIVE design — replicate it exactly):
```html
{stitch_html}
```

{css_context}

APP SPEC:
{spec_json}

DATA MODELS AVAILABLE: {models}

CRITICAL RULES:
1. Use 'use client' directive
2. REPLICATE THE EXACT VISUAL DESIGN from the Stitch HTML above:
   - Same colors, gradients, shadows, border-radius
   - Same layout structure (flex, grid, spacing, positioning)
   - Same typography (font sizes, weights, line heights)
   - Same component structure (cards, tables, forms, sidebars)
   - Convert inline CSS to Tailwind classes
3. Use React hooks (useState, useEffect, useCallback) for state
4. Fetch data from the API routes defined in the spec
5. Include FULL working CRUD operations (create, read, update, delete)
6. Make ALL buttons functional — onClick handlers that actually do something
7. Include working modals for create/edit forms with real form state
8. Include working delete confirmations
9. Include real form validation
10. Include loading states and error handling
11. Include search/filter functionality where tables/lists exist
12. Use realistic mock data shapes matching the Prisma models
13. Export default the page component
14. Include TypeScript types for all data
15. If the Stitch HTML has images, keep their src URLs exactly

Return ONLY the TypeScript/React code, no markdown fences."""

API_ROUTE_PROMPT = """You are a senior Next.js API engineer. Generate a COMPLETE
Next.js 14 App Router API route handler.

ROUTE: {route_path}
METHODS: {methods}
MODEL: {model_name}
MODEL FIELDS: {model_fields}

RULES:
1. Use Next.js App Router route handler format (export async function GET/POST/PUT/DELETE)
2. Use the Prisma client from '@/lib/db'
3. Include proper error handling with try/catch
4. Validate request bodies
5. Return proper HTTP status codes
6. Include pagination for GET list endpoints
7. Include search/filter query params where useful
8. Use NextResponse for responses

Return ONLY the TypeScript code, no markdown fences."""


def _clean_code(raw: str) -> str:
    """Strip markdown fences from AI output."""
    c = raw.strip()
    for prefix in ["```typescript", "```tsx", "```ts", "```json", "```prisma", "```"]:
        if c.startswith(prefix):
            c = c[len(prefix):]
    if c.endswith("```"):
        c = c[:-3]
    return c.strip()


def _summarize_screens(screens: List[Dict[str, Any]]) -> str:
    """Create a compact summary of all screens for the analyzer."""
    parts = []
    for s in screens:
        html = s.get("generated_html", "")
        # Extract text content and key HTML elements for analysis
        text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()[:600]

        # Detect key UI patterns
        has_table = '<table' in html.lower()
        has_form = '<form' in html.lower() or '<input' in html.lower()
        has_chart = 'chart' in html.lower() or 'graph' in html.lower()
        has_cards = 'card' in html.lower()
        has_modal = 'modal' in html.lower() or 'dialog' in html.lower()

        patterns = []
        if has_table: patterns.append("data_table")
        if has_form: patterns.append("form")
        if has_chart: patterns.append("chart")
        if has_cards: patterns.append("cards")
        if has_modal: patterns.append("modal")

        parts.append(
            f"Screen: {s['name']} (id={s['id']}, type={s.get('screen_type', 'page')})\n"
            f"  UI patterns: {', '.join(patterns) or 'basic'}\n"
            f"  Text content: {text[:800]}"
        )
    return "\n\n".join(parts)


async def analyze_app_structure(
    project: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Analyze all screens and produce a full-stack app specification.

    Returns a JSON spec with data models, API routes, pages, and nav.
    """
    screens = [s for s in project.get("screens", []) if s.get("generated_html")]
    if not screens:
        return {"error": "No generated screens to analyze"}

    summary = _summarize_screens(screens)
    prompt = ANALYZE_PROMPT.format(screens_summary=summary)

    raw = await call_nova_pro(prompt, max_tokens=4096, temperature=0.2)
    cleaned = _clean_code(raw)

    try:
        spec = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            spec = json.loads(match.group())
        else:
            logger.error(f"Failed to parse app spec: {cleaned[:200]}")
            spec = _fallback_spec(project, screens)

    return spec


def _fallback_spec(
    project: Dict[str, Any],
    screens: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate a basic spec when AI analysis fails."""
    title = project.get("title", "My App")
    slug = re.sub(r'[^a-z0-9-]', '-', title.lower()).strip('-')

    return {
        "app_name": slug,
        "description": title,
        "data_models": [
            {
                "name": "Item",
                "fields": [
                    {"name": "id", "type": "String", "primary": True},
                    {"name": "title", "type": "String"},
                    {"name": "description", "type": "String"},
                    {"name": "status", "type": "String"},
                    {"name": "createdAt", "type": "DateTime"},
                    {"name": "updatedAt", "type": "DateTime"},
                ],
            }
        ],
        "api_routes": [
            {"path": "/api/items", "methods": ["GET", "POST"], "model": "Item"},
            {"path": "/api/items/[id]", "methods": ["GET", "PUT", "DELETE"], "model": "Item"},
        ],
        "pages": [
            {
                "route": f"/{s['name'].lower().replace(' ', '-')}",
                "name": s["name"],
                "screen_id": s["id"],
                "components": ["DataView"],
                "data_dependencies": ["Item"],
            }
            for s in screens
        ],
        "auth_required": False,
        "nav_items": [
            {
                "label": s["name"],
                "route": f"/{s['name'].lower().replace(' ', '-')}",
                "icon": "Layout",
            }
            for s in screens
        ],
    }


async def generate_page_code(
    screen: Dict[str, Any],
    route: str,
    spec: Dict[str, Any],
) -> str:
    """Generate a full Next.js page component using the Stitch HTML as design source."""
    html = screen.get("generated_html", "")

    # Extract CSS from the Stitch HTML for extra context
    css_parts = []
    for m in re.finditer(r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE):
        css_parts.append(m.group(1).strip())
    css_context = ""
    if css_parts:
        css_context = "STITCH CSS (use these exact colors/styles):\n```css\n" + "\n".join(css_parts)[:3000] + "\n```"

    models = ", ".join(m["name"] for m in spec.get("data_models", []))

    prompt = PAGE_PROMPT.format(
        screen_name=screen["name"],
        route=route,
        stitch_html=html,
        css_context=css_context,
        spec_json=json.dumps(spec, indent=2)[:2000],
        models=models,
    )

    raw = await call_nova_pro(prompt, max_tokens=8192, temperature=0.3)
    return _clean_code(raw)


async def generate_api_route(
    route_spec: Dict[str, Any],
    spec: Dict[str, Any],
) -> str:
    """Generate a Next.js API route handler."""
    model_name = route_spec.get("model", "Item")
    model = next(
        (m for m in spec.get("data_models", []) if m["name"] == model_name),
        {"name": model_name, "fields": []},
    )

    prompt = API_ROUTE_PROMPT.format(
        route_path=route_spec["path"],
        methods=", ".join(route_spec.get("methods", ["GET"])),
        model_name=model_name,
        model_fields=json.dumps(model.get("fields", []), indent=2),
    )

    raw = await call_nova_pro(prompt, max_tokens=4096, temperature=0.3)
    return _clean_code(raw)


def generate_prisma_schema(spec: Dict[str, Any]) -> str:
    """Generate a Prisma schema from the app spec."""
    lines = [
        'generator client {',
        '  provider = "prisma-client-js"',
        '}',
        '',
        'datasource db {',
        '  provider = "sqlite"',
        '  url      = env("DATABASE_URL")',
        '}',
        '',
    ]

    for model in spec.get("data_models", []):
        lines.append(f'model {model["name"]} {{')
        for field in model.get("fields", []):
            fname = field["name"]
            ftype = field["type"]
            attrs = []
            if field.get("primary"):
                attrs.append("@id @default(cuid())")
            if field.get("unique"):
                attrs.append("@unique")
            if ftype == "DateTime" and fname in ("createdAt",):
                attrs.append("@default(now())")
            if ftype == "DateTime" and fname in ("updatedAt",):
                attrs.append("@updatedAt")
            optional = "?" if field.get("optional") else ""
            lines.append(f'  {fname} {ftype}{optional} {" ".join(attrs)}'.rstrip())
        lines.append('}')
        lines.append('')

    return '\n'.join(lines)


def generate_db_client() -> str:
    """Generate the Prisma client helper."""
    return """import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
"""


def generate_layout(spec: Dict[str, Any], title: str) -> str:
    """Generate the root layout with navigation."""
    nav_items = spec.get("nav_items", [])
    nav_links = "\n".join(
        f'            <Link href="{n["route"]}" '
        f'className={{pathname === "{n["route"]}" ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}} '
        f'+ " flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"}}>'
        f'{n["label"]}</Link>'
        for n in nav_items
    )

    return f"""'use client'

import Link from 'next/link'
import {{ usePathname }} from 'next/navigation'

export default function AppLayout({{ children }}: {{ children: React.ReactNode }}) {{
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            {title}
          </h1>
        </div>
        <nav className="flex-1 p-3 space-y-1">
{nav_links}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold">U</div>
            <div>
              <p className="text-sm font-medium text-gray-900">User</p>
              <p className="text-xs text-gray-500">user@example.com</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {{children}}
      </main>
    </div>
  )
}}
"""


def generate_package_json(spec: Dict[str, Any]) -> str:
    """Generate package.json for the full-stack app."""
    return json.dumps({
        "name": spec.get("app_name", "my-app"),
        "version": "1.0.0",
        "private": True,
        "scripts": {
            "dev": "next dev",
            "build": "next build",
            "start": "next start",
            "db:push": "prisma db push",
            "db:studio": "prisma studio",
            "db:seed": "tsx prisma/seed.ts",
            "postinstall": "prisma generate",
        },
        "dependencies": {
            "next": "^14.2.0",
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "@prisma/client": "^5.10.0",
            "lucide-react": "^0.344.0",
        },
        "devDependencies": {
            "typescript": "^5.3.0",
            "@types/node": "^20.0.0",
            "@types/react": "^18.2.0",
            "prisma": "^5.10.0",
            "tsx": "^4.7.0",
            "tailwindcss": "^3.4.0",
            "autoprefixer": "^10.4.0",
            "postcss": "^8.4.0",
        },
    }, indent=2)


def generate_env() -> str:
    """Generate .env file."""
    return 'DATABASE_URL="file:./dev.db"\n'


def generate_tailwind_config() -> str:
    """Generate tailwind.config.ts."""
    return """import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [],
}

export default config
"""


async def magic_build(project: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point: convert static screens into a full-stack app.

    Returns a dict of file paths -> file contents.
    """
    title = project.get("title", "My App")
    screens = [s for s in project.get("screens", []) if s.get("generated_html")]

    if not screens:
        return {"error": "No generated screens", "files": {}}

    logger.info(f"Magic Build starting for '{title}' ({len(screens)} screens)")

    # Step 1: Analyze app structure
    spec = await analyze_app_structure(project)
    logger.info(f"App spec: {len(spec.get('data_models', []))} models, "
                f"{len(spec.get('api_routes', []))} routes, "
                f"{len(spec.get('pages', []))} pages")

    files: Dict[str, str] = {}

    # Step 2: Generate infrastructure files
    files["package.json"] = generate_package_json(spec)
    files[".env"] = generate_env()
    files["tailwind.config.ts"] = generate_tailwind_config()
    files["prisma/schema.prisma"] = generate_prisma_schema(spec)
    files["src/lib/db.ts"] = generate_db_client()
    files["src/app/layout.tsx"] = generate_layout(spec, title)

    # Step 3: Generate API routes
    for route in spec.get("api_routes", []):
        try:
            code = await generate_api_route(route, spec)
            route_path = route["path"].replace("/api/", "src/app/api/")
            files[f"{route_path}/route.ts"] = code
            logger.info(f"Generated API route: {route['path']}")
        except Exception as e:
            logger.error(f"API route generation failed for {route['path']}: {e}")

    # Step 4: Generate page components
    for page in spec.get("pages", []):
        screen = next(
            (s for s in screens if s["id"] == page.get("screen_id")),
            screens[0] if screens else None,
        )
        if not screen:
            continue

        try:
            code = await generate_page_code(screen, page["route"], spec)
            page_path = page["route"].strip("/") or "dashboard"
            files[f"src/app/(app)/{page_path}/page.tsx"] = code
            logger.info(f"Generated page: {page['route']}")
        except Exception as e:
            logger.error(f"Page generation failed for {page['route']}: {e}")

    # Step 5: Generate root page redirect
    first_route = spec.get("pages", [{}])[0].get("route", "/dashboard")
    files["src/app/page.tsx"] = f"""import {{ redirect }} from 'next/navigation'

export default function Home() {{
  redirect('{first_route}')
}}
"""

    logger.info(f"Magic Build complete: {len(files)} files generated")

    return {
        "spec": spec,
        "files": files,
        "file_count": len(files),
        "models": [m["name"] for m in spec.get("data_models", [])],
        "routes": [r["path"] for r in spec.get("api_routes", [])],
        "pages": [p["route"] for p in spec.get("pages", [])],
    }
