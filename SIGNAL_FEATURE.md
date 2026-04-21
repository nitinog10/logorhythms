# ⚡ DocuVerse Signal — Customer Voice-to-Code Copilot

> **Signal** transforms raw customer support tickets into structured, code-aware engineering fix packets — powered by AWS Bedrock Nova AI.

---

## 🎯 What It Does

Signal bridges the gap between **customer pain** and **engineering action**. When a customer reports an issue, Signal automatically:

1. **Classifies** the ticket (bug, feature request, performance, security, UX, etc.)
2. **Determines business urgency** (critical → low)
3. **Detects duplicates** by clustering similar tickets together
4. **Maps the issue to code** — pinpointing the likely files and functions involved
5. **Generates a fix plan** with root cause hypothesis and step-by-step remediation
6. **Drafts a customer response** — professional, empathetic, ready to send
7. **Creates GitHub Issues** with structured bodies directly from the analysis

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                              │
│  Manual Import │ Linear Webhook (stub) │ Zendesk │ Intercom    │
└───────────┬─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTELLIGENCE LAYER                            │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Ticket Classifier │  │ Signal Clusterer  │  │ Code Mapper  │  │
│  │ (Bedrock Nova     │  │ (Jaccard          │  │ (Vector      │  │
│  │  Lite — classify  │  │  Similarity —     │  │  Store —     │  │
│  │  type + urgency)  │  │  dedup detection) │  │  semantic    │  │
│  └────────┬─────────┘  └────────┬─────────┘  │  code search) │  │
│           │                     │             └──────┬───────┘  │
│           └─────────┬───────────┘                    │          │
│                     ▼                                │          │
│           ┌──────────────────┐                       │          │
│           │ Packet Generator │◄──────────────────────┘          │
│           │ (Bedrock Nova    │                                  │
│           │  Pro — fix plan, │                                  │
│           │  root cause,     │                                  │
│           │  customer draft) │                                  │
│           └────────┬─────────┘                                  │
└────────────────────┼────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT LAYER                               │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Signal     │  │ GitHub Issue  │  │ Customer Response    │    │
│  │ Packet     │  │ (auto-create  │  │ Draft (copy-paste    │    │
│  │ (dashboard)│  │  with labels) │  │  ready for support)  │    │
│  └────────────┘  └──────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Signal Packet — The Core Output

Every imported ticket produces a **Signal Packet** containing:

| Field | Description |
|-------|-------------|
| `issue_type` | `bug` · `feature_request` · `question` · `performance` · `ux` · `security` · `other` |
| `business_urgency` | `critical` · `high` · `medium` · `low` |
| `duplicate_count` | Number of similar tickets in the cluster |
| `likely_files` | Code files most likely related to the issue |
| `code_matches` | Detailed matches with file path, symbol, confidence %, and code snippet |
| `root_cause_hypothesis` | AI-generated hypothesis of what's going wrong |
| `fix_summary` | Step-by-step fix plan for engineers |
| `owner_suggestions` | Teams or roles best suited to own the fix |
| `docs_update_suggestions` | Documentation/FAQ entries to update post-fix |
| `customer_response_draft` | Professional, empathetic draft reply for the customer |
| `confidence_score` | Overall confidence in the analysis (0–100%) |
| `github_issue_url` | Link to the created GitHub issue (if created) |

---

## 🔧 How Each Component Works

### 1. Ticket Classifier (`ticket_classifier.py`)

Uses **AWS Bedrock Nova Lite** to classify tickets via structured JSON prompts.

```
Input:  "Billing page shows wrong currency for EU users"
Output: {
  issue_type: "bug",
  urgency: "high",
  technical_terms: ["billing", "currency", "EU", "localization"],
  domain_area: "billing",
  summary: "Currency display incorrect for EU region users on billing page"
}
```

**Fallback**: When Bedrock is unavailable, a keyword-based heuristic classifier takes over — checking for words like "crash", "error", "slow", "feature request", etc.

### 2. Signal Clusterer (`signal_clusterer.py`)

Groups related tickets using **Jaccard text similarity**:

- Extracts word fingerprints from ticket title + body
- Compares new tickets against all existing cluster members
- If similarity ≥ threshold (configurable, default 70%), merges into the cluster
- Otherwise creates a new cluster
- Automatically escalates cluster urgency to the highest member's urgency

### 3. Code Mapper (via `vector_store.py`)

Leverages the existing DocuVerse code chunk index:

- Builds search queries from: ticket title, technical terms, quoted strings in body
- Runs up to 10 semantic searches against the repository's indexed code chunks
- Returns top matched files with symbol names and confidence scores

### 4. Packet Generator (`signal_service.py`)

Orchestrates everything and uses **AWS Bedrock Nova Pro** for the heavy lifting:

- Feeds the classification + code matches into a structured prompt
- Generates: root cause hypothesis, fix plan, owner suggestions, docs updates, and customer draft
- Computes an overall confidence score based on code match count, technical terms, and classification quality

---

## 🖥️ Where It Lives

### Web Dashboard

Navigate to any repository → **Signal (Customer Voice)** in Quick Actions.

The dashboard has three tabs:

| Tab | What it shows |
|-----|--------------|
| **Feed** | All Signal Packets as expandable cards with urgency badges, confidence bars, code matches, and action buttons |
| **Clusters** | Groups of related tickets with size badges and combined urgency |
| **Settings** | Enable/disable Signal, auto-create issues toggle, priority threshold slider, integration placeholders |

The **Import Ticket** button opens a modal where you paste a customer ticket title and body.

### VS Code Extension

**Command**: `DocuVerse: Signal (Customer Voice)` from the Quick Actions picker or via `docuverse.openSignal`.

Opens a webview panel showing all Signal Packets with:
- Urgency color coding
- Issue type icons
- Code file matches
- One-click GitHub issue creation

### MCP Server (AI Agent Tools)

Five new tools available to any MCP-compatible AI agent:

| Tool | What it does |
|------|-------------|
| `import_customer_signal` | Import a ticket and generate a Signal Packet |
| `list_signal_packets` | List all packets for a repository |
| `get_signal_packet` | Get full packet details by ID |
| `create_issue_from_signal` | Create a GitHub issue from a packet |
| `get_signal_resolution_draft` | Get just the customer response draft |

---

## 🔌 API Endpoints

All endpoints require authentication via `Authorization: Bearer <token>` header.

### Import a ticket
```http
POST /api/signal/import
Content-Type: application/json

{
  "repo_id": "repo_abc123",
  "title": "Dashboard crashes when filtering by date range",
  "body": "When I select a custom date range on the analytics dashboard, the page crashes with a white screen. Console shows 'TypeError: Cannot read properties of undefined'. This happens on Chrome and Firefox. Started happening after the last update.",
  "source": "manual",
  "customer_segment": "Enterprise",
  "tags": ["dashboard", "crash"]
}
```

**Response**: A full `SignalPacket` with classification, code matches, fix plan, and customer draft.

### List packets
```http
GET /api/signal/{repo_id}/packets
```

### Get single packet
```http
GET /api/signal/{repo_id}/packets/{packet_id}
```

### Create GitHub issue from packet
```http
POST /api/signal/{repo_id}/packets/{packet_id}/create-issue
Content-Type: application/json

{
  "owner": "myorg",
  "repo": "myrepo",
  "additional_labels": ["p0"]
}
```

### List clusters
```http
GET /api/signal/{repo_id}/clusters
```

### Get/Update config
```http
GET  /api/signal/{repo_id}/config
PUT  /api/signal/{repo_id}/config
```

---

## ⚙️ Configuration

Add these to your `.env` file (all optional):

```env
# Signal integration keys (for future use)
LINEAR_API_KEY=
ZENDESK_SUBDOMAIN=
ZENDESK_API_TOKEN=
INTERCOM_ACCESS_TOKEN=

# Signal behavior
SIGNAL_DEFAULT_PRIORITY_THRESHOLD=0.5
SIGNAL_MAX_CLUSTER_DISTANCE=0.3
```

| Setting | Default | Description |
|---------|---------|-------------|
| `SIGNAL_DEFAULT_PRIORITY_THRESHOLD` | `0.5` | Minimum confidence to flag a signal (0.0–1.0) |
| `SIGNAL_MAX_CLUSTER_DISTANCE` | `0.3` | Maximum distance for cluster grouping (lower = stricter matching) |

---

## 📁 Files Added / Modified

### New Files (10)
```
backend/app/services/ticket_classifier.py    — Bedrock Nova ticket classifier
backend/app/services/signal_clusterer.py     — Jaccard similarity duplicate detector
backend/app/services/signal_service.py       — Main orchestrator service
backend/app/api/endpoints/signal.py          — 9 FastAPI endpoints
frontend/src/app/repository/[id]/signal/page.tsx — Signal dashboard page
frontend/src/components/signal/SignalFeed.tsx      — Packet list component
frontend/src/components/signal/SignalPacketCard.tsx — Expandable packet card
frontend/src/components/signal/ClusterPanel.tsx    — Cluster view component
frontend/src/components/signal/SignalConfigForm.tsx — Settings form
docuverse-vscode/src/signal/signalPanel.ts         — VS Code webview panel
```

### Modified Files (10)
```
backend/app/models/schemas.py        — 13 new Pydantic models
backend/app/config.py                — 6 new settings
backend/app/services/persistence.py  — 10 new CRUD functions
backend/app/api/routes.py            — Signal router registration
frontend/src/lib/api.ts              — 8 interfaces + 7 API methods
frontend/src/app/repository/[id]/page.tsx — Signal quick action link
docuverse-vscode/src/api/types.ts    — Signal TypeScript interfaces
docuverse-vscode/src/api/client.ts   — 3 new API methods
docuverse-vscode/src/extension.ts    — Signal command + Quick Actions
mcp-server/src/index.ts              — 5 new MCP tools
```

---

## 🚀 Future Roadmap

- [ ] **Linear integration** — Live webhook processing for real-time ticket ingestion
- [ ] **Zendesk integration** — Pull tickets via Zendesk API
- [ ] **Intercom integration** — Conversation-to-signal pipeline
- [ ] **Embedding-based clustering** — Replace Jaccard with Bedrock Titan embeddings for semantic dedup
- [ ] **Auto-resolution detection** — Detect when a merged PR resolves a signal and auto-draft customer updates
- [ ] **Signal Analytics** — Track resolution velocity, cluster growth trends, and top pain areas over time
