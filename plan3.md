# Feature Plan: DocuVerse Signal

## One-line idea

Build **DocuVerse Signal**, a cloud feature that converts customer tickets and product feedback into code-aware engineering actions by automatically generating:

- duplicate clusters
- ticket-to-code mappings
- revenue and urgency-based priority signals
- fix packets for engineers
- issue and PR drafts
- changelog and help-center updates
- customer-facing resolution summaries

This gives DocuVerse a new position: not just understanding code, but understanding **why customers are unhappy and exactly where engineering should act**.

## What the repo already has

DocuVerse already knows how to:

- index repositories
- inspect files and AST nodes
- compute impact analysis
- generate docs and diagrams
- create GitHub issues
- implement fix workflows
- create walkthroughs that explain code changes

Those primitives already cover most of the hard code side of the problem.

Useful existing files:

- `backend/app/api/endpoints/files.py`
- `backend/app/services/vector_store.py`
- `backend/app/services/documentation_generator.py`
- `backend/app/api/endpoints/github.py`
- `backend/app/services/github_service.py`
- `frontend/src/lib/api.ts`
- `frontend/src/app/dashboard/page.tsx`
- `docuverse-vscode/src/extension.ts`  `mcp-server/src/index.ts`

## What is missing today

After checking the top-level product code, there are no current integrations for:

- Zendesk
- Intercom
- Linear
- Jira
- customer-support ticket ingestion
- triage automation
- ticket clustering
- customer-signal analytics

So today DocuVerse understands the code, but not the **customer pain entering the business**.

## Proposed feature

### Name

**DocuVerse Signal: Customer Voice-to-Code Copilot**

### Core value

When a customer ticket, bug report, or support thread is created, DocuVerse Signal should:

1. ingest the ticket from Zendesk, Intercom, Linear, or Jira
2. classify the issue type and business urgency
3. detect duplicates and cluster similar complaints
4. map the issue to likely files, components, or services in the repo
5. generate a code-aware fix packet for engineering
6. create a GitHub issue or implementation brief
7. draft changelog/help-center updates
8. produce a customer-safe summary after the fix lands

## Why this is a wow-factor feature

Most support and ticket tools help you manage work. They do not explain the code path behind the problem.

Most dev tools help you inspect code. They do not tell you which incoming customer issue matters most to the business.

DocuVerse Signal merges those two worlds.

The wow moment is:

**"This complaint is the same root cause as 19 other tickets, affects premium users, likely lives in `billing/webhooks.py`, touches `invoice_summary.tsx`, and should generate both a fix issue and a help-center update."**

That is a high-leverage workflow for product, support, and engineering.

## Why teams would pay

Signal directly impacts:

- support cost
- engineering prioritization
- bug backlog quality
- time-to-resolution
- customer communication quality

It is easy to justify if it helps teams:

- reduce duplicate triage work
- escalate the right bugs faster
- attach business context to engineering work
- close the loop from support to fix to customer comms

## Market validation

As of **March 25, 2026**, there is clear market demand for AI support automation and AI issue triage:

- **Intercom Fin** positions AI as a frontline support and workflow automation layer, with automation rate as a KPI.
- **Linear** supports triage rules and delegation to agents, and exposes issue workflows where coding tools can pick up rich issue context.
- **Zendesk** exposes ticket metrics for measuring support operations, which shows how seriously teams track ticket resolution performance.

The market signal is:

- support leaders pay for automation and deflection
- product and engineering teams pay for better triage

DocuVerse can differentiate by being the layer that actually maps customer pain to code, docs, and fixes.

### Sources

- Intercom Fin AI Agent explained: [https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)
- Intercom Fin automation rate: [https://www.intercom.com/help/en/articles/13533623-fin-ai-agent-automation-rate](https://www.intercom.com/help/en/articles/13533623-fin-ai-agent-automation-rate)
- Intercom Fin in workflows: [https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows)
- Linear issue assignment and triage rules: [https://linear.app/docs/assigning-issues](https://linear.app/docs/assigning-issues)
- Zendesk ticket metrics: [https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_metrics/](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_metrics/)

## Why DocuVerse can win

Intercom is strong at frontline support automation. Linear is strong at issue routing. Zendesk is strong at support operations. DocuVerse can win by being stronger on:

- ticket-to-code mapping
- code-aware fix planning
- impact analysis for customer-reported issues
- fix-to-doc-update workflows
- customer-safe engineering summaries after resolution

That combination is still rare.

## Product concept

### Short version

Every ticket should become a **Signal Packet**.

A Signal Packet includes:

- complaint type
- severity and business importance
- duplicate cluster size
- affected user segment
- likely code areas
- likely owner
- suggested engineering issue
- suggested docs/help-center updates
- resolution template for support

## MVP scope

### User-facing MVP

For one connected support source and one connected repo:

- ingest tickets from Linear or Zendesk first
- classify and cluster similar issues
- map tickets to probable code areas
- create a Signal Packet
- show Signals in a dashboard
- allow one-click:
  - create GitHub issue
  - create implementation brief
  - create customer-facing update draft

### MVP report output

- ticket title and source
- urgency
- confidence score
- duplicate count
- likely files and modules
- root-cause hypothesis
- recommended owner
- next engineering action
- suggested docs/FAQ update

### Strong phase-2 upgrade

- Intercom support
- revenue/plan-aware prioritization
- changelog generation after fix
- auto-close loop back to support

## Suggested packaging

### Free

- manual ticket import
- 20 Signal analyses per month
- one repository

### Pro

- Linear or Zendesk sync
- duplicate clustering
- GitHub issue generation
- 200 analyses per month

### Team

- multiple ticket sources
- customer segment weighting
- changelog/help-center drafts
- support resolution templates
- shared dashboard

### Enterprise

- org-wide triage policies
- CRM enrichment
- custom data retention
- private deployment

## Architecture plan

### Important architecture decision

Signal should separate three concerns:

1. ticket ingestion
2. ticket intelligence
3. code mapping and downstream action

That keeps the system explainable and allows teams to trust the output.

### End-to-end flow

1. Support platform sends a webhook or DocuVerse pulls new tickets.
2. Backend normalizes the ticket into a common model.
3. Signal classifier tags the issue type and urgency.
4. Similarity service clusters it with related tickets and feedback.
5. Repo mapper uses vector search, AST context, and dependency data to identify likely code areas.
6. Signal service generates a fix packet.
7. GitHub automation can create an issue or implementation prompt.
8. Docs service can queue a future help-center or README/changelog update.
9. Support-safe summary is stored for the team to send back to customers.

### Recommended implementation shape

- start with manual import plus Linear webhook support
- use the existing vector store for semantic ticket-to-code retrieval
- store cluster state and code-mapping confidence
- keep human approval in the loop for issue creation and outbound customer text

## Data model additions

Add to `backend/app/models/schemas.py`:

- `SignalSourceConfig`
- `CustomerSignal`
- `SignalCluster`
- `SignalPacket`
- `SignalCodeMatch`
- `ResolutionDraft`
- `TicketSourceMetadata`

### Minimum fields

`CustomerSignal`

- `id`
- `repo_id`
- `source`
- `external_ticket_id`
- `title`
- `body`
- `customer_segment`
- `priority`
- `status`
- `created_at`

`SignalPacket`

- `id`
- `repo_id`
- `signal_id`
- `cluster_id`
- `issue_type`
- `business_urgency`
- `duplicate_count`
- `likely_files`
- `likely_symbols`
- `owner_suggestions`
- `fix_summary`
- `docs_update_suggestions`
- `customer_response_draft`
- `confidence_score`
- `created_at`
- `updated_at`

## Backend file plan

### Files to add

- `backend/app/api/endpoints/signal.py`
  - source config
  - signal ingest
  - packet list/detail endpoints
- `backend/app/services/signal_service.py`
  - orchestration for packet generation
- `backend/app/services/ticket_classifier.py`
  - classify issue type, urgency, and domain
- `backend/app/services/signal_clusterer.py`
  - duplicate detection and clustering
- `backend/app/services/ticket_source_service.py`
  - Linear/Zendesk/Intercom adapters
- `backend/tests/test_signal_service.py`
- `backend/tests/test_signal_clusterer.py`
- `backend/tests/test_ticket_classifier.py`

### Files to modify

- `backend/app/api/routes.py`
  - register Signal router
- `backend/app/models/schemas.py`
  - add Signal models
- `backend/app/config.py`
  - add:
    - `linear_api_key`
    - `zendesk_subdomain`
    - `zendesk_api_token`
    - `intercom_access_token`
    - `signal_default_priority_threshold`
- `backend/app/services/persistence.py`
  - save/load Signal configs, signals, clusters, and packets
- `backend/app/services/vector_store.py`
  - support ticket text retrieval against indexed code chunks
- `backend/app/services/github_service.py`
  - add richer issue-creation helpers from Signal packets

## Frontend file plan

### Files to add

- `frontend/src/app/repository/[id]/signal/page.tsx`
- `frontend/src/components/signal/SignalFeed.tsx`
- `frontend/src/components/signal/SignalPacketCard.tsx`
- `frontend/src/components/signal/ClusterPanel.tsx`
- `frontend/src/components/signal/CustomerDraftPanel.tsx`
- `frontend/src/components/signal/SignalConfigForm.tsx`

### Files to modify

- `frontend/src/lib/api.ts`
  - add Signal API methods
- `frontend/src/app/repository/[id]/page.tsx`
  - add a `Signal` quick action
- `frontend/src/app/settings/page.tsx`
  - add support integration and usage controls

## VS Code extension plan

### Files to add

- `docuverse-vscode/src/signal/signalPanel.ts`

### Files to modify

- `docuverse-vscode/src/api/types.ts`
  - add Signal types
- `docuverse-vscode/src/api/client.ts`
  - add Signal APIs
- `docuverse-vscode/src/extension.ts`
  - add:
    - `docuverse.openSignal`
    - `docuverse.createIssueFromSignal`

### Extension use case

Inside VS Code, an engineer should be able to open a Signal Packet and see:

- why the ticket matters
- which code paths are likely involved
- what to fix first
- what customer response should be sent after the patch

## MCP server plan

### Files to modify

- `mcp-server/src/index.ts`

### New MCP tools

- `import_customer_signal`
- `list_signal_packets`
- `get_signal_packet`
- `create_issue_from_signal`
- `draft_customer_resolution_update`

## API plan

### New endpoints

- `POST /api/signal/webhooks/linear`
- `POST /api/signal/import`
- `GET /api/signal/{repo_id}/config`
- `PUT /api/signal/{repo_id}/config`
- `GET /api/signal/{repo_id}/packets`
- `GET /api/signal/{repo_id}/packets/{packet_id}`
- `POST /api/signal/{repo_id}/packets/{packet_id}/create-issue`

## Rollout plan

### Phase 1

- manual import
- Linear-first support
- signal normalization

### Phase 2

- clustering
- code mapping
- issue creation workflow

### Phase 3

- dashboard UI
- customer-response drafts
- docs/changelog suggestions

### Phase 4

- Zendesk and Intercom integrations
- revenue-aware prioritization
- auto-close the loop back into support

## Success metrics

Track:

- percentage of incoming tickets clustered successfully
- percentage of packets with actionable code matches
- time saved in manual support triage
- rate of Signal packets converted into GitHub issues
- time from ticket creation to engineering action
- reduction in duplicate bug reports staying ungrouped

## Main risks

### 1. Ticket text can be vague

Some tickets will not contain enough detail for reliable code mapping.

### 2. Wrong prioritization can erode trust

Business urgency should remain configurable and transparent.

### 3. Customer-safe drafts must be conservative

The system should not promise fixes or timelines automatically.

### 4. Support-system integrations are operational work

Webhooks, pagination, sync windows, and source-specific schemas must be handled carefully.

## Recommended build order

1. normalized signal storage
2. manual import and Linear support
3. ticket clustering
4. code mapping via vector + AST + impact
5. Signal Packet dashboard
6. GitHub issue and customer-resolution workflow

## Final recommendation

If `DocuVerse Guard` protects changes before merge, and `DocuVerse Pulse` explains failures after release, **DocuVerse Signal** helps decide what engineering should fix based on actual customer pain.

That makes it a strong USP because it connects:

- support systems
- product urgency
- code intelligence
- GitHub execution
- customer communication

