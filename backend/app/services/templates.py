"""
App Studio — Pre-built SaaS Templates

Each template defines:
- Structured prompt chains for Stitch AI screen generation
- Default design system configuration
- Feature map and component metadata
"""

from typing import List, Dict, Any


# ---------------------------------------------------------------------------
# Template Definitions
# ---------------------------------------------------------------------------

TEMPLATES: Dict[str, Dict[str, Any]] = {
    "crm_dashboard": {
        "id": "crm_dashboard",
        "name": "CRM Dashboard",
        "description": "Complete customer relationship management system with contact management, deal tracking, pipeline visualization, and analytics.",
        "category": "crm",
        "icon": "users",
        "preview_color": "#6366f1",
        "features": [
            "Contact management",
            "Deal pipeline",
            "Activity timeline",
            "Analytics dashboard",
            "Team collaboration",
            "Email integration",
        ],
        "screens": [
            {
                "name": "Dashboard Overview",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a modern CRM dashboard overview screen. Include: "
                    "1) Top stats row showing Total Contacts, Active Deals, Revenue This Month, Conversion Rate as metric cards. "
                    "2) A deal pipeline chart (horizontal bar or funnel). "
                    "3) Recent activity feed with timestamps. "
                    "4) A sidebar navigation with Dashboard, Contacts, Deals, Pipeline, Reports, Settings links. "
                    "Use a clean, professional design with a dark sidebar and light content area."
                ),
            },
            {
                "name": "Contacts List",
                "screen_type": "list",
                "prompt": (
                    "Design a CRM contacts list page. Include: "
                    "1) Search bar with filter dropdowns (status, company, date added). "
                    "2) Data table with columns: Avatar, Name, Email, Company, Phone, Status (Active/Inactive badge), Last Contact date. "
                    "3) Bulk action toolbar (Delete, Export, Tag). "
                    "4) Pagination controls at bottom. "
                    "5) 'Add Contact' button in top right. "
                    "Show 8-10 sample rows with realistic names and companies."
                ),
            },
            {
                "name": "Deal Pipeline",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a CRM deal pipeline view as a Kanban board. "
                    "Include columns: Lead, Qualified, Proposal, Negotiation, Closed Won, Closed Lost. "
                    "Each card should show: Deal name, Company, Amount ($), Owner avatar, Days in stage. "
                    "Include drag handles on cards. Add a 'New Deal' button. "
                    "Show summary totals at the top of each column."
                ),
            },
            {
                "name": "Contact Detail",
                "screen_type": "detail",
                "prompt": (
                    "Design a CRM contact detail page. Include: "
                    "1) Header with large avatar, name, title, company, and action buttons (Edit, Delete, Email). "
                    "2) Tabbed content area with tabs: Overview, Deals, Activity, Notes, Files. "
                    "3) Overview tab showing: contact info cards, associated deals list, recent notes. "
                    "4) Right sidebar with quick stats and tags."
                ),
            },
            {
                "name": "Settings",
                "screen_type": "form",
                "prompt": (
                    "Design a CRM settings page with sections: "
                    "1) Profile settings (name, email, avatar upload). "
                    "2) Team management (invite members, role assignment table). "
                    "3) Pipeline customization (stage names, colors, ordering). "
                    "4) Integration settings (email, calendar, Slack toggles). "
                    "5) Notification preferences (checkboxes). "
                    "Use a vertical sidebar for section navigation."
                ),
            },
        ],
        "design_system": {
            "primaryColor": "#6366f1",
            "fontFamily": "Inter",
            "cornerRoundness": "MEDIUM",
            "appearance": "LIGHT",
        },
    },

    "saas_dashboard": {
        "id": "saas_dashboard",
        "name": "SaaS Analytics Dashboard",
        "description": "Modern SaaS metrics dashboard with user management, subscription analytics, revenue tracking, and system health monitoring.",
        "category": "dashboard",
        "icon": "bar-chart-3",
        "preview_color": "#8b5cf6",
        "features": [
            "Real-time analytics",
            "User management",
            "Subscription tracking",
            "Revenue metrics",
            "System health",
            "API usage monitoring",
        ],
        "screens": [
            {
                "name": "Analytics Overview",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a SaaS analytics dashboard. Include: "
                    "1) Top metric cards: MRR ($), Active Users, Churn Rate (%), ARPU ($) with trend arrows. "
                    "2) Large line chart showing MRR growth over 12 months. "
                    "3) Two smaller charts side by side: User signups bar chart and Subscription distribution donut chart. "
                    "4) Recent events feed. "
                    "5) Dark sidebar with nav: Overview, Users, Subscriptions, Revenue, API, Settings. "
                    "Use a modern dark theme with purple/violet accent colors."
                ),
            },
            {
                "name": "User Management",
                "screen_type": "list",
                "prompt": (
                    "Design a SaaS user management page. Include: "
                    "1) Search and filter bar with status dropdown (Active, Trial, Churned, Suspended). "
                    "2) User table: Avatar, Name, Email, Plan (Free/Pro/Enterprise badge), MRR contribution, Last active, Status. "
                    "3) Bulk actions row. "
                    "4) User count summary at top. "
                    "Show realistic sample data with varied plan types."
                ),
            },
            {
                "name": "Revenue Dashboard",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a SaaS revenue analytics page. Include: "
                    "1) Revenue KPIs: Total MRR, Net New MRR, Expansion MRR, Churned MRR. "
                    "2) Large area chart showing revenue breakdown over time. "
                    "3) Plan distribution table showing subscriber counts and revenue per plan. "
                    "4) Cohort retention heatmap. "
                    "Use green for positive metrics, red for churn."
                ),
            },
            {
                "name": "API Usage",
                "screen_type": "dashboard",
                "prompt": (
                    "Design an API usage monitoring page for a SaaS product. Include: "
                    "1) API call volume chart (requests per hour, last 24h). "
                    "2) Endpoint breakdown table: Endpoint path, Method, Avg latency, Error rate, Call count. "
                    "3) Rate limit status per API key. "
                    "4) Error log feed with timestamps. "
                    "Use a technical, developer-focused design."
                ),
            },
            {
                "name": "Billing Settings",
                "screen_type": "form",
                "prompt": (
                    "Design a SaaS billing settings page. Include: "
                    "1) Current plan card with usage meters (API calls, Storage, Team members). "
                    "2) Plan comparison cards: Free, Pro, Enterprise with feature lists and pricing. "
                    "3) Payment method section with card on file. "
                    "4) Invoice history table. "
                    "5) Upgrade/downgrade CTA buttons."
                ),
            },
        ],
        "design_system": {
            "primaryColor": "#8b5cf6",
            "fontFamily": "Inter",
            "cornerRoundness": "MEDIUM",
            "appearance": "DARK",
        },
    },

    "ecommerce_store": {
        "id": "ecommerce_store",
        "name": "E-Commerce Store",
        "description": "Full-featured online store with product catalog, shopping cart, checkout flow, order management, and admin panel.",
        "category": "ecommerce",
        "icon": "shopping-bag",
        "preview_color": "#f59e0b",
        "features": [
            "Product catalog",
            "Shopping cart",
            "Checkout flow",
            "Order tracking",
            "Admin dashboard",
            "Inventory management",
        ],
        "screens": [
            {
                "name": "Storefront Home",
                "screen_type": "landing",
                "prompt": (
                    "Design an e-commerce storefront home page. Include: "
                    "1) Hero banner with featured product/sale and CTA button. "
                    "2) Category navigation bar (Electronics, Fashion, Home, Sports). "
                    "3) Featured products grid (3x2) with product cards showing: image placeholder, name, price, rating stars, 'Add to Cart' button. "
                    "4) 'New Arrivals' section. "
                    "5) Top navigation with logo, search bar, cart icon with badge, account icon. "
                    "Use a clean white design with warm amber accents."
                ),
            },
            {
                "name": "Product Detail",
                "screen_type": "detail",
                "prompt": (
                    "Design an e-commerce product detail page. Include: "
                    "1) Large product image gallery (main image + thumbnails). "
                    "2) Product info: Name, Price, Rating, Reviews count, Description. "
                    "3) Variant selectors: Size dropdown, Color swatches. "
                    "4) Quantity selector and 'Add to Cart' + 'Buy Now' buttons. "
                    "5) Tabs: Description, Specifications, Reviews. "
                    "6) 'Related Products' carousel at bottom."
                ),
            },
            {
                "name": "Shopping Cart",
                "screen_type": "form",
                "prompt": (
                    "Design a shopping cart page. Include: "
                    "1) Cart items list with: Product thumbnail, name, variant, unit price, quantity stepper, line total, remove button. "
                    "2) Order summary sidebar: Subtotal, Shipping estimate, Tax, Coupon code input, Total, 'Proceed to Checkout' button. "
                    "3) 'Continue Shopping' link. "
                    "Show 3 sample cart items."
                ),
            },
            {
                "name": "Checkout",
                "screen_type": "form",
                "prompt": (
                    "Design a multi-step checkout page. Include: "
                    "1) Step indicator: Shipping → Payment → Review. "
                    "2) Shipping form: Name, Address, City, State, ZIP, Phone. "
                    "3) Order summary sidebar (collapsed). "
                    "4) Payment section with card input fields. "
                    "5) 'Place Order' button. "
                    "Use a clean, trustworthy design with security badges."
                ),
            },
            {
                "name": "Admin Orders",
                "screen_type": "list",
                "prompt": (
                    "Design an e-commerce admin orders management page. Include: "
                    "1) Order stats: Total Orders, Pending, Shipped, Delivered (metric cards). "
                    "2) Orders table: Order ID, Customer, Items, Total, Status badge (Pending/Shipped/Delivered/Cancelled), Date. "
                    "3) Filter bar with status and date range. "
                    "4) Order detail drawer. "
                    "Use an admin-style dark sidebar layout."
                ),
            },
        ],
        "design_system": {
            "primaryColor": "#f59e0b",
            "fontFamily": "Inter",
            "cornerRoundness": "MEDIUM",
            "appearance": "LIGHT",
        },
    },

    "project_management": {
        "id": "project_management",
        "name": "Project Management",
        "description": "Complete project management tool with Kanban boards, timeline views, team management, task tracking, and progress reports.",
        "category": "productivity",
        "icon": "kanban",
        "preview_color": "#10b981",
        "features": [
            "Kanban boards",
            "Timeline / Gantt view",
            "Task management",
            "Team collaboration",
            "Progress reports",
            "File attachments",
        ],
        "screens": [
            {
                "name": "Board View",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a project management Kanban board view. Include: "
                    "1) Board header with project name, member avatars, filter/sort buttons. "
                    "2) Kanban columns: Backlog, To Do, In Progress, Review, Done. "
                    "3) Task cards with: Title, Priority tag (High/Medium/Low colored), assignee avatar, due date, subtask progress bar, comment count. "
                    "4) 'Add Task' button at bottom of each column. "
                    "5) Left sidebar with: Projects list, My Tasks, Calendar, Team, Reports. "
                    "Use a clean design with green accent."
                ),
            },
            {
                "name": "Timeline View",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a project timeline / Gantt chart view. Include: "
                    "1) Horizontal timeline header with month/week markers. "
                    "2) Task rows with: Task name (left), horizontal bar showing duration across timeline. "
                    "3) Color coding by status or assignee. "
                    "4) Dependencies shown as arrows between task bars. "
                    "5) Zoom controls (Day, Week, Month). "
                    "Show 10-12 sample tasks with overlapping timelines."
                ),
            },
            {
                "name": "Task Detail",
                "screen_type": "detail",
                "prompt": (
                    "Design a task detail modal/page. Include: "
                    "1) Task title (editable), status dropdown, priority selector. "
                    "2) Description rich text area. "
                    "3) Right sidebar: Assignee, Due date, Labels, Project, Sprint. "
                    "4) Subtasks checklist with progress bar. "
                    "5) Activity feed / comments section at bottom. "
                    "6) File attachments area."
                ),
            },
            {
                "name": "Team Overview",
                "screen_type": "list",
                "prompt": (
                    "Design a team management page. Include: "
                    "1) Team member cards in a grid: Avatar, Name, Role, Active tasks count, Workload bar. "
                    "2) Invite member button and form. "
                    "3) Role management dropdown (Admin, Member, Viewer). "
                    "4) Team activity feed. "
                    "Show 6-8 team members."
                ),
            },
            {
                "name": "Reports",
                "screen_type": "dashboard",
                "prompt": (
                    "Design a project reports page. Include: "
                    "1) Sprint burndown chart. "
                    "2) Task completion rate over time (line chart). "
                    "3) Team workload distribution (horizontal bar chart by member). "
                    "4) Status breakdown pie chart. "
                    "5) Date range selector. "
                    "Use data visualization best practices."
                ),
            },
        ],
        "design_system": {
            "primaryColor": "#10b981",
            "fontFamily": "Inter",
            "cornerRoundness": "MEDIUM",
            "appearance": "LIGHT",
        },
    },

    "landing_page": {
        "id": "landing_page",
        "name": "SaaS Landing Page",
        "description": "High-converting SaaS landing page with hero section, feature showcase, pricing tables, testimonials, and call-to-action.",
        "category": "marketing",
        "icon": "rocket",
        "preview_color": "#ec4899",
        "features": [
            "Hero section",
            "Feature showcase",
            "Pricing table",
            "Testimonials",
            "FAQ section",
            "CTA sections",
        ],
        "screens": [
            {
                "name": "Full Landing Page",
                "screen_type": "landing",
                "prompt": (
                    "Design a modern SaaS landing page. Include these sections from top to bottom: "
                    "1) NAVIGATION: Logo, nav links (Features, Pricing, About, Blog), 'Sign Up' and 'Login' buttons. "
                    "2) HERO: Large heading, subheading describing the product, email input + CTA button, hero image/mockup placeholder. "
                    "3) SOCIAL PROOF: Logos of companies using the product (5-6 placeholder logos). "
                    "4) FEATURES: 3-column grid of feature cards with icons, titles, and descriptions. "
                    "5) PRODUCT SHOWCASE: Large product screenshot with feature callouts. "
                    "Use a modern design with gradient backgrounds, rounded elements, and the primary brand color."
                ),
            },
            {
                "name": "Pricing Section",
                "screen_type": "landing",
                "prompt": (
                    "Design a SaaS pricing section. Include: "
                    "1) Section heading: 'Simple, transparent pricing'. "
                    "2) Monthly/Annual toggle switch. "
                    "3) Three pricing cards side by side: "
                    "   - Starter ($9/mo): 5 features listed, 'Get Started' button. "
                    "   - Pro ($29/mo, highlighted/recommended): 8 features, 'Start Free Trial' button. "
                    "   - Enterprise (Custom): All features + extras, 'Contact Sales' button. "
                    "4) Feature comparison table below. "
                    "Highlight the recommended plan with a border or badge."
                ),
            },
            {
                "name": "Testimonials",
                "screen_type": "landing",
                "prompt": (
                    "Design a testimonials section. Include: "
                    "1) Section heading: 'Loved by teams worldwide'. "
                    "2) Testimonial cards (3) with: Quote text, Author avatar, Name, Title, Company. "
                    "3) Star ratings on each. "
                    "4) Stats row below: '10,000+ Teams', '99.9% Uptime', '4.9/5 Rating', '150+ Countries'. "
                    "Use a clean white background with subtle shadows."
                ),
            },
            {
                "name": "FAQ Section",
                "screen_type": "landing",
                "prompt": (
                    "Design an FAQ section. Include: "
                    "1) Section heading: 'Frequently Asked Questions'. "
                    "2) Accordion-style FAQ items (6-8 questions) with expand/collapse. "
                    "3) Questions covering: pricing, features, security, support, integrations, free trial. "
                    "4) CTA at bottom: 'Still have questions? Contact us' with button. "
                    "Use clean typography and ample whitespace."
                ),
            },
            {
                "name": "Footer CTA",
                "screen_type": "landing",
                "prompt": (
                    "Design a combined CTA + Footer section. Include: "
                    "1) CTA BANNER: Dark background section with heading 'Ready to get started?', subtext, and large 'Start Free Trial' button. "
                    "2) FOOTER: Multi-column footer with: Product links, Company links, Resources links, Legal links. "
                    "3) Social media icons (Twitter, LinkedIn, GitHub). "
                    "4) Copyright line and newsletter signup input."
                ),
            },
        ],
        "design_system": {
            "primaryColor": "#ec4899",
            "fontFamily": "Inter",
            "cornerRoundness": "LARGE",
            "appearance": "LIGHT",
        },
    },
}


def get_all_templates() -> List[Dict[str, Any]]:
    """Return all templates as a list (without screen prompts for listing)."""
    result = []
    for template in TEMPLATES.values():
        result.append({
            "id": template["id"],
            "name": template["name"],
            "description": template["description"],
            "category": template["category"],
            "icon": template["icon"],
            "preview_color": template["preview_color"],
            "features": template["features"],
            "screen_count": len(template["screens"]),
        })
    return result


def get_template(template_id: str) -> Dict[str, Any] | None:
    """Get a full template definition by ID."""
    return TEMPLATES.get(template_id)
