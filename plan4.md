# Feature Plan: DocuVerse Radar

## One-line idea

Build **DocuVerse Radar**, a scheduled repository health and architecture drift feature that automatically generates:

- repo health scores
- documentation freshness scores
- architecture drift reports
- dependency-risk trends
- weekly engineering digests
- manager-friendly status summaries

This is a practical premium feature because teams need continuous visibility into repo quality, but the current product is still mostly on-demand.

## Why this is simpler than the earlier ideas

Compared with `Guard`, `Pulse`, and `Signal`, this is much easier to ship because it does **not** require:

- GitHub App installation flows
- third-party support platform integrations
- incident platform webhooks
- complex real-time workflows

It can run mostly on a timer against repos that DocuVerse already knows how to index.

## Best AWS-first implementation path

This feature fits naturally into the current AWS direction of the repo.

### Core AWS services

- **Amazon Bedrock**
  - summarize repo-health findings into readable reports
- **Amazon DynamoDB**
  - store health snapshots, trend history, and user subscriptions
- **Amazon S3**
  - store generated reports, JSON snapshots, and rendered diagram artifacts
- **Amazon EventBridge Scheduler**
  - trigger daily and weekly scans
- **Amazon SES**
  - send weekly health digests by email
- **AWS App Runner**
  - keep the FastAPI backend as the execution surface

### Optional later

- **AWS Step Functions**
  - if the job grows into a multi-step pipeline

## What the repo already has

DocuVerse already has the exact primitives needed for Radar:

- file tree and indexing
- AST parsing
- dependency graph analysis
- codebase impact scoring
- documentation generation
- diagram generation

Relevant existing files:

- `backend/app/api/endpoints/files.py`
- `backend/app/services/dependency_analyzer.py`
- `backend/app/services/indexer.py`
- `backend/app/services/documentation_generator.py`
- `backend/app/services/diagram_generator.py`
- `backend/app/services/persistence.py`
- `frontend/src/lib/api.ts`
- `frontend/src/app/repository/[id]/page.tsx`

## What is missing today

The product currently gives a user answers when they ask for them.

It does not yet provide:

- scheduled repo audits
- trend snapshots over time
- documentation freshness tracking
- management-friendly health digests
- an always-on repo scorecard

That is a genuine gap for production teams.

## Proposed feature

### Name

**DocuVerse Radar: Repo Health + Drift Monitor**

### Core value

Radar should run on a schedule and automatically answer:

1. did the architecture drift this week?
2. which modules became riskier?
3. which important files still lack fresh docs?
4. where are circular dependencies growing?
5. which repos are getting healthier or worse over time?

## Why teams would pay

Engineering managers and platform teams already pay for:

- scorecards
- standards tracking
- developer portal health views
- doc quality visibility

Radar is useful because it turns static code intelligence into a recurring operating signal.

It is easy to justify as a paid product for:

- engineering leads
- platform teams
- CTO dashboards
- agencies managing many codebases

## Market validation

As of **March 26, 2026**, the market already proves that software catalogs, scorecards, and docs-as-code visibility are valuable:

- **Backstage Software Catalog** positions centralized software ownership and metadata as a core need.
- **Backstage TechDocs** shows that teams care about docs living beside code and staying discoverable.
- **Cortex Scorecards** explicitly sells standards tracking and maturity scoring.
- **OpsLevel** markets standards, checks, and scorecards for engineering organizations.

The market signal is clear:

- teams want software health visibility
- teams want standards tracking
- teams want docs and ownership surfaced continuously

DocuVerse Radar can do this with less setup by reusing the code intelligence the product already has.

### Sources

- Backstage Software Catalog: https://backstage.io/docs/features/software-catalog/
- Backstage TechDocs: https://backstage.io/docs/next/features/techdocs/
- Cortex Scorecards: https://docs.cortex.io/standardize/scorecards
- OpsLevel overview: https://www.opslevel.com/
- Amazon EventBridge Scheduler: https://docs.aws.amazon.com/eventbridge/latest/userguide/using-eventbridge-scheduler.html
- Amazon SES SendEmail: https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
- Amazon Bedrock overview: https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html

## Why DocuVerse can win

Backstage, Cortex, and OpsLevel focus on portals, metadata, and standards.

DocuVerse can win by combining:

- codebase dependency intelligence
- documentation generation
- architecture diagrams
- AI-written weekly summaries

That means Radar is not just another scorecard. It becomes a **self-explaining scorecard**.

## MVP scope

### User-facing MVP

For each connected repo, Radar should generate on a daily or weekly schedule:

- overall health score
- docs freshness score
- dependency risk score
- biggest drift items
- top 5 modules needing attention
- short manager summary

### Health score inputs

- circular dependency count
- number of undocumented important files
- stale walkthrough/doc timestamps
- dependency hotspot concentration
- repo indexing freshness

### Weekly digest output

- overall score change from last week
- what got better
- what got worse
- top-risk modules
- recommended next actions

## Suggested packaging

### Free

- one repo
- manual health snapshot
- no scheduled emails

### Pro

- scheduled weekly scans
- health trends
- email digests
- up to 10 repos

### Team

- unlimited repos
- shared scoreboards
- org-wide filters
- custom thresholds

### Enterprise

- multi-team dashboards
- role-based access
- longer retention
- private deployment

## Architecture plan

### Simplest implementation path

1. EventBridge Scheduler triggers a protected backend endpoint once per day or week.
2. FastAPI backend loads repo metadata and current analysis state.
3. Radar service computes scores using existing dependency and docs services.
4. Bedrock turns the raw findings into a readable summary.
5. DynamoDB stores the snapshot.
6. S3 stores the rendered report if needed.
7. SES emails the digest to subscribed users.

This avoids building a complex new platform surface.

### Why EventBridge Scheduler is enough for MVP

AWS documents EventBridge Scheduler as a serverless scheduler for recurring or one-time invocations. That makes it a clean fit for recurring repo scans without introducing extra infrastructure on day one.

## Data model additions

Add to `backend/app/models/schemas.py`:

- `RadarConfig`
- `RadarSnapshot`
- `RadarMetric`
- `RadarDigest`
- `DriftFinding`
- `RepoHealthTrend`

### Minimum fields

`RadarConfig`

- `repo_id`
- `enabled`
- `cadence`
- `email_recipients`
- `health_thresholds`

`RadarSnapshot`

- `id`
- `repo_id`
- `overall_score`
- `docs_score`
- `dependency_score`
- `drift_score`
- `top_findings`
- `recommended_actions`
- `created_at`

## Backend file plan

### Files to add

- `backend/app/api/endpoints/radar.py`
  - schedule trigger
  - config endpoints
  - snapshot list/detail endpoints
- `backend/app/services/radar_service.py`
  - orchestrates score computation
- `backend/app/services/health_score_service.py`
  - computes score inputs from existing repo data
- `backend/app/services/drift_snapshot_service.py`
  - compares current snapshot to previous snapshot
- `backend/app/services/email_digest_service.py`
  - sends SES digests
- `backend/tests/test_radar_service.py`
- `backend/tests/test_health_score_service.py`
- `backend/tests/test_drift_snapshot_service.py`

### Files to modify

- `backend/app/api/routes.py`
  - register Radar router
- `backend/app/models/schemas.py`
  - add Radar models
- `backend/app/config.py`
  - add:
    - `radar_schedule_secret`
    - `ses_from_email`
    - `radar_default_cadence`
- `backend/app/services/persistence.py`
  - save/load Radar configs and snapshots

## Frontend file plan

### Files to add

- `frontend/src/app/repository/[id]/radar/page.tsx`
- `frontend/src/components/radar/HealthScoreCard.tsx`
- `frontend/src/components/radar/TrendChart.tsx`
- `frontend/src/components/radar/DriftFindingsPanel.tsx`
- `frontend/src/components/radar/RadarConfigForm.tsx`

### Files to modify

- `frontend/src/lib/api.ts`
  - add Radar endpoints
- `frontend/src/app/repository/[id]/page.tsx`
  - add a `Radar` quick action
- `frontend/src/app/settings/page.tsx`
  - add digest settings

## VS Code extension plan

### Files to add

- `docuverse-vscode/src/radar/radarPanel.ts`

### Files to modify

- `docuverse-vscode/src/api/types.ts`
  - add Radar types
- `docuverse-vscode/src/api/client.ts`
  - add Radar methods
- `docuverse-vscode/src/extension.ts`
  - add `docuverse.openRadar`

## MCP server plan

### Files to modify

- `mcp-server/src/index.ts`

### New MCP tools

- `get_repo_health_snapshot`
- `list_repo_health_trends`
- `run_repo_health_scan`

## API plan

### New endpoints

- `POST /api/radar/jobs/run`
- `GET /api/radar/{repo_id}/config`
- `PUT /api/radar/{repo_id}/config`
- `GET /api/radar/{repo_id}/snapshots`
- `GET /api/radar/{repo_id}/snapshots/{snapshot_id}`

## Rollout plan

### Phase 1

- snapshot model
- scheduled trigger
- health score computation

### Phase 2

- drift comparison
- Bedrock summaries
- SES digest delivery

### Phase 3

- frontend dashboard
- VS Code and MCP access

### Phase 4

- org-wide aggregation
- benchmark reports
- optional dashboards

## Success metrics

Track:

- number of scheduled scans per week
- number of active digest subscribers
- percentage of repos improving score over time
- time saved on manual repo audits
- paid conversion from enabling weekly Radar scans

## Main risks

### 1. Health scoring can feel arbitrary

The score must stay explainable and show its inputs.

### 2. Too many findings can create noise

The weekly digest should prioritize only the top issues.

### 3. Emails must remain useful

If the SES digest is too verbose, teams will ignore it.

## Recommended build order

1. score computation
2. snapshot persistence
3. scheduled trigger
4. weekly digest
5. frontend trend view

## Final recommendation

If you want a feature that is genuinely useful, monetizable, and much easier than the earlier proposals, **DocuVerse Radar** is one of the strongest options.

It is:

- needed by real teams
- highly AWS-native
- simple to operationalize
- strongly aligned with the current codebase
