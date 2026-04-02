# Feature Plan: DocuVerse Pulse

## One-line idea

Build **DocuVerse Pulse**, a cloud feature that connects runtime incidents back to code and automatically generates:

- root-cause maps
- blast-radius analysis
- suspect file and function rankings
- rollback guidance
- hotfix plans
- stakeholder incident summaries
- post-incident documentation updates

This turns DocuVerse from a code-understanding tool into a real **runtime-to-code response platform**.

## What the repo already has

DocuVerse already has strong code intelligence primitives:

- repository indexing
- AST parsing
- dependency graph analysis
- file-level impact analysis
- walkthrough generation
- diagram generation
- documentation generation
- GitHub issue and fix automation

Important existing building blocks:

- `backend/app/api/endpoints/files.py`
- `backend/app/services/dependency_analyzer.py`
- `backend/app/services/parser.py`
- `backend/app/services/documentation_generator.py`
- `backend/app/services/diagram_generator.py`
- `backend/app/api/endpoints/github.py`
- `frontend/src/lib/api.ts`
- `docuverse-vscode/src/extension.ts`
- `mcp-server/src/index.ts`

## What is missing today

After scanning the top-level product code, there are no real product integrations yet for:

- Sentry
- Datadog
- PagerDuty
- incident webhooks
- runtime traces or logs
- post-incident workflows

That means DocuVerse understands code statically, but it does not yet understand **what is breaking in production right now**.

## Proposed feature

### Name

**DocuVerse Pulse: Runtime-to-Code Incident Copilot**

### Core value

When an incident happens, DocuVerse Pulse should:

1. ingest the incident from Sentry, Datadog, PagerDuty, or OpenTelemetry sources
2. normalize stack traces, spans, service names, release tags, and error metadata
3. map the runtime signal to the repo, files, functions, and dependency graph
4. compute probable root causes and secondary blast radius
5. generate an incident brief for engineers and stakeholders
6. generate rollback guidance and test focus areas
7. create a GitHub issue or hotfix branch if the team chooses
8. refresh docs and runbooks after the incident is resolved

## Why this is a wow-factor feature

Most tools stop at one layer:

- observability tools tell you what failed
- code tools tell you what the code looks like

DocuVerse Pulse joins them together.

The unique experience is:

**"Production is on fire. Show me the most likely code path, what else it can break, how to roll it back, and what docs now became stale."**

That is a real high-value moment for engineering teams.

## Why teams would pay

Incident response already has budget.

Teams pay to reduce:

- MTTR
- escalation noise
- bad rollbacks
- repeated incidents
- engineering time wasted on triage calls

Pulse would directly support:

- platform teams
- backend teams
- SRE teams
- engineering managers
- support escalation teams

## Market validation

As of **March 25, 2026**, the market clearly shows that runtime incident workflow automation is paid territory:

- **Sentry** exposes issue details with stack traces, traces, related events, and suspect commits.
- **Sentry Seer** already markets AI issue scanning and issue fixing workflows using telemetry plus code context.
- **Datadog Software Catalog** ties telemetry back to software entities and ownership metadata.
- **PagerDuty Incident Workflows** is a paid automation surface for incident response.

The market signal is clear:

- teams already pay for incident intelligence
- teams already pay for incident automation

DocuVerse can occupy a differentiated layer by combining:

- runtime telemetry
- repo dependency intelligence
- docs and diagram intelligence
- GitHub fix automation

### Sources

- Sentry Issue Details: https://docs.sentry.io/product/issues/issue-details/
- Sentry Seer: https://docs.sentry.io/product/ai-in-sentry/seer
- Sentry Trace Explorer: https://docs.sentry.io/product/explore/traces/
- Datadog Software Catalog: https://docs.datadoghq.com/internal_developer_portal/software_catalog/set_up
- PagerDuty Incident Workflows: https://support.pagerduty.com/main/docs/incident-workflows
- PagerDuty Incidents: https://support.pagerduty.com/main/docs/incidents

## Why DocuVerse can win

Sentry and Datadog are strong on telemetry. PagerDuty is strong on response orchestration. DocuVerse can win by being stronger on:

- code-path understanding
- dependency-based blast radius
- documentation drift after incidents
- AI-generated narrated incident explainers
- fast conversion from incident to fix PR

That is a more opinionated and code-aware incident workflow than generic observability dashboards.

## MVP scope

### User-facing MVP

For one connected repository and one observability integration:

- ingest a Sentry issue or webhook
- map stack frames to repo files
- compute impact via dependency graph
- generate a Pulse report
- show it in a new frontend page
- optionally create:
  - GitHub issue
  - hotfix brief
  - rollback checklist

### Pulse report contents

- incident title and severity
- affected service and release
- suspect files and functions
- probable root-cause explanation
- blast radius
- regression risk if patched quickly
- rollback path
- suggested owner/reviewer
- stale docs and runbooks likely affected

### Phase-2 upgrades

- Datadog and OpenTelemetry ingest
- PagerDuty deep link
- Slack notifications
- auto-created postmortem draft
- hotfix branch generation

## Suggested packaging

### Free

- manual incident import
- 5 Pulse analyses per month
- one repo

### Pro

- live Sentry integration
- incident summary reports
- rollback checklists
- 100 analyses per month

### Team

- Datadog + PagerDuty integrations
- Slack alerts
- shared incident dashboard
- postmortem drafts
- ownership routing

### Enterprise

- org-wide multi-repo service map
- retention controls
- audit logs
- private deployment

## Architecture plan

### Core architecture decision

DocuVerse Pulse should treat runtime events as first-class inputs, not just text blobs.

So the platform needs a normalized runtime event model with:

- incident source
- service name
- release/version
- stack trace frames
- trace ids
- tags and environment
- severity and frequency

### End-to-end flow

1. Sentry or another provider sends a webhook, or DocuVerse polls the provider API.
2. Backend verifies the source and stores a normalized event record.
3. Runtime mapper resolves service and release metadata to one or more connected repos.
4. Stack-trace resolver maps frames to files and symbols where possible.
5. Existing parser and dependency graph services compute likely impact.
6. Pulse service scores suspect files and constructs a root-cause narrative.
7. GitHub automation can optionally create an issue or hotfix plan.
8. Frontend, VS Code, and MCP expose the report.
9. After resolution, documentation/runbook refresh can be suggested or automated.

### Recommended implementation shape

- start with Sentry-first support
- accept both webhook and manual incident import
- persist normalized events and generated Pulse reports
- use background jobs for heavy analysis
- use existing GitHub automation for downstream actions

## Data model additions

Add to `backend/app/models/schemas.py`:

- `IncidentSourceConfig`
- `RuntimeIncident`
- `RuntimeStackFrame`
- `PulseRun`
- `PulseFinding`
- `RollbackPlan`
- `PostmortemDraft`

### Minimum fields

`IncidentSourceConfig`

- `repo_id`
- `provider`
- `project_key`
- `enabled`
- `webhook_secret`
- `environment_filters`

`PulseRun`

- `id`
- `repo_id`
- `provider`
- `incident_id`
- `incident_title`
- `severity`
- `status`
- `suspect_files`
- `suspect_symbols`
- `root_cause_summary`
- `blast_radius`
- `rollback_steps`
- `stale_artifacts`
- `owner_suggestions`
- `created_at`
- `updated_at`

## Backend file plan

### Files to add

- `backend/app/api/endpoints/pulse.py`
  - incident ingest
  - integration config
  - run list/detail endpoints
- `backend/app/services/pulse_service.py`
  - full runtime-to-code orchestration
- `backend/app/services/runtime_mapper.py`
  - map services, releases, and traces to repos/files
- `backend/app/services/sentry_service.py`
  - webhook verification and API integration
- `backend/app/services/incident_summary_generator.py`
  - engineering and stakeholder summaries
- `backend/tests/test_pulse_service.py`
- `backend/tests/test_runtime_mapper.py`
- `backend/tests/test_sentry_service.py`

### Files to modify

- `backend/app/api/routes.py`
  - register Pulse router
- `backend/app/models/schemas.py`
  - add Pulse models
- `backend/app/config.py`
  - add:
    - `sentry_webhook_secret`
    - `sentry_api_token`
    - `datadog_api_key`
    - `pagerduty_api_token`
    - `pulse_default_severity_threshold`
- `backend/app/services/persistence.py`
  - save/load incident configs and Pulse runs
- `backend/app/services/github_service.py`
  - add helpers for issue creation from Pulse reports
- `backend/app/services/indexer.py`
  - support targeted re-analysis after incident-driven fixes

## Frontend file plan

### Files to add

- `frontend/src/app/repository/[id]/pulse/page.tsx`
- `frontend/src/components/pulse/IncidentFeed.tsx`
- `frontend/src/components/pulse/PulseSummaryCard.tsx`
- `frontend/src/components/pulse/SuspectFilesPanel.tsx`
- `frontend/src/components/pulse/RollbackPanel.tsx`
- `frontend/src/components/pulse/IntegrationConfigForm.tsx`

### Files to modify

- `frontend/src/lib/api.ts`
  - add Pulse APIs
- `frontend/src/app/repository/[id]/page.tsx`
  - add a `Pulse` quick action
- `frontend/src/app/settings/page.tsx`
  - add integration credentials and usage surface

## VS Code extension plan

### Files to add

- `docuverse-vscode/src/incidents/pulsePanel.ts`

### Files to modify

- `docuverse-vscode/src/api/types.ts`
  - add Pulse types
- `docuverse-vscode/src/api/client.ts`
  - add Pulse methods
- `docuverse-vscode/src/extension.ts`
  - add:
    - `docuverse.openPulse`
    - `docuverse.importIncident`

### Extension use case

From VS Code, an engineer should be able to open the active incident report and immediately see:

- most likely culprit files
- surrounding code context
- blast radius
- rollback checklist

## MCP server plan

### Files to modify

- `mcp-server/src/index.ts`

### New MCP tools

- `import_runtime_incident`
- `get_incident_root_cause`
- `list_pulse_runs`
- `create_hotfix_issue_from_incident`

## API plan

### New endpoints

- `POST /api/pulse/webhooks/sentry`
- `POST /api/pulse/incidents/import`
- `GET /api/pulse/{repo_id}/config`
- `PUT /api/pulse/{repo_id}/config`
- `GET /api/pulse/{repo_id}/runs`
- `GET /api/pulse/{repo_id}/runs/{run_id}`
- `POST /api/pulse/{repo_id}/runs/{run_id}/create-issue`

## Rollout plan

### Phase 1

- Sentry-first integration
- manual import path
- normalized runtime event storage

### Phase 2

- stack-trace to file mapping
- root-cause narrative
- rollback generator

### Phase 3

- frontend Pulse dashboard
- GitHub issue/hotfix workflows
- VS Code and MCP support

### Phase 4

- Datadog and PagerDuty support
- Slack and postmortem automation
- multi-repo service topology

## Success metrics

Track:

- median time from incident ingest to first useful code recommendation
- percentage of incidents with at least one mapped suspect file
- reduction in MTTR for teams using Pulse
- conversion from Pulse reports to GitHub issues or hotfix tasks
- number of incidents that trigger doc/runbook updates

## Main risks

### 1. Frame-to-file mapping can be noisy

Compiled stacks, minified bundles, and partial traces will reduce accuracy.

### 2. Multi-repo ownership mapping is hard

Service names and repo names often do not align cleanly.

### 3. Over-automation is dangerous in incidents

DocuVerse should recommend and draft before it auto-fixes.

### 4. Runtime integrations increase operational complexity

Webhook verification, rate limits, retries, and provider outages must be handled properly.

## Recommended build order

1. normalized incident storage
2. Sentry webhook and manual import
3. stack-trace to repo/file resolver
4. Pulse report generator
5. frontend incident dashboard
6. GitHub issue and hotfix workflow

## Final recommendation

If `DocuVerse Guard` makes DocuVerse valuable before code merges, **DocuVerse Pulse** makes it valuable when production breaks.

That is a strong USP because it connects:

- live incidents
- code intelligence
- documentation intelligence
- action-taking automation
