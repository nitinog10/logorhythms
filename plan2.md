# Feature Plan: DocuVerse Guard

## One-line idea

Build **DocuVerse Guard**, a cloud feature that watches GitHub pull requests and automatically produces:

- blast-radius analysis
- PR risk scores
- doc drift warnings
- reviewer suggestions
- release notes and rollback notes
- post-merge documentation refresh

This is the most natural paid upgrade for the current DocuVerse product because the repo already does strong **on-demand** code understanding, but it does not yet do **continuous workflow automation** around real team delivery.

## What the repo already has

From scanning the current codebase, DocuVerse already supports:

- repository connect/index flows
- file tree, file content, AST parsing, dependency graphs, and impact analysis
- walkthrough generation with audio
- diagram generation
- repository and file documentation generation
- sandbox execution
- GitHub issue/README/fix automation
- VS Code and MCP surfaces for the same on-demand workflows

Key places that show the current product scope:

- `backend/app/api/routes.py`
- `backend/app/models/schemas.py`
- `backend/app/api/endpoints/files.py`
- `backend/app/api/endpoints/documentation.py`
- `backend/app/api/endpoints/github.py`
- `frontend/src/lib/api.ts`
- `frontend/src/app/repository/[id]/page.tsx`
- `frontend/src/app/repository/[id]/walkthrough/page.tsx`
- `docuverse-vscode/src/extension.ts`
- `mcp-server/src/index.ts`

## What is missing today

The platform is still mostly **pull-based**:

- a user opens DocuVerse
- selects a repo or file
- manually asks for walkthroughs, docs, diagrams, or impact analysis

What is missing is the workflow teams pay for in production:

- automatic PR analysis
- GitHub webhook ingestion
- GitHub App installation model
- check-runs / PR comments / merge gates
- doc drift detection after code changes
- reviewer routing and approval suggestions
- team-level analytics and usage controls

## Proposed feature

### Name

**DocuVerse Guard: Continuous PR Risk + Documentation Drift Gate**

### Core value

Whenever a pull request is opened, updated, or merged, DocuVerse Guard should automatically:

1. fetch the changed files and diff
2. compute impact using the existing dependency graph and AST context
3. assign a risk score with reasons
4. identify stale docs, diagrams, walkthroughs, and README sections
5. generate a PR summary comment and a GitHub check result
6. suggest reviewers based on impacted modules
7. generate rollout notes, test focus areas, and rollback notes
8. after merge, trigger targeted re-indexing and doc refresh

## Why this is the right feature

### Strategic fit

This uses the strongest parts of the existing stack instead of fighting it:

- `files.py` already computes impact and dependency-based risk
- `documentation_generator.py` already creates repo/file docs
- `diagram_generator.py` already creates architecture artifacts
- `parser.py` and `indexer.py` already provide structure-aware repo analysis
- GitHub automation already exists, so PR comments/checks are a logical extension

### Why people would pay

Teams usually do not pay for "nice documentation". They do pay for:

- fewer production regressions
- faster PR review cycles
- less stale documentation after merges
- clearer ownership and reviewer routing
- better release readiness

This feature sits directly in the path of engineering delivery, so it is easier to justify as a paid product than pure passive documentation.

## Market validation

As of **March 25, 2026**, the market already proves that teams pay for both halves of this problem:

- **GitHub Copilot code review** already reviews pull requests inside GitHub.
- **Graphite** sells AI review capability in paid plans.
- **Mintlify Workflows** launched automated documentation-maintenance workflows on **February 27, 2026**.

That means the market already values:

- AI PR review
- automated documentation upkeep

The opening for DocuVerse is to combine both with **repo-aware blast-radius intelligence**, which generic PR reviewers usually do not do well.

### Sources

- GitHub Copilot code review: [https://docs.github.com/en/enterprise-cloud@latest/copilot/using-github-copilot/code-review/using-copilot-code-review](https://docs.github.com/en/enterprise-cloud@latest/copilot/using-github-copilot/code-review/using-copilot-code-review)
- GitHub webhooks: [https://docs.github.com/webhooks/webhook-events-and-payloads](https://docs.github.com/webhooks/webhook-events-and-payloads)
- Mintlify Workflows: [https://www.mintlify.com/blog/workflows](https://www.mintlify.com/blog/workflows)
- Graphite pricing FAQ: [https://www.stg.graphite.com/docs/pricing-faq](https://www.stg.graphite.com/docs/pricing-faq)
- Graphite AI review docs: [https://graphite.com/docs/ai-review-experimental-comments](https://graphite.com/docs/ai-review-experimental-comments)

## Why DocuVerse can win

GitHub Copilot and Graphite can review a PR, but DocuVerse can go deeper because it already understands:

- file structure
- AST-level code boundaries
- dependency relationships
- repository documentation
- generated diagrams
- walkthrough artifacts

So the differentiator is not "AI reviews PRs". The differentiator is:

**"DocuVerse understands what the change means for the whole codebase and for every knowledge artifact around it."**

## MVP scope

### User-facing MVP

For a connected repo, when a PR is opened or synchronized:

- DocuVerse receives the webhook
- analyzes the PR diff
- posts a PR summary comment
- publishes a GitHub check named `DocuVerse Guard`
- stores the analysis in DocuVerse
- shows the result on a new Guard dashboard

The PR result should include:

- overall risk score: `low`, `medium`, `high`, `critical`
- impacted files and modules
- likely stale docs
- recommended reviewers
- test focus checklist
- rollback checklist
- suggested follow-up docs update task

### Post-merge MVP

When the PR merges:

- re-index only changed files
- regenerate affected documentation sections
- mark old walkthroughs/diagrams as stale
- optionally queue fresh artifact generation

## Suggested product packaging

### Free

- manual PR analysis
- 10 PR analyses per month
- one repository

### Pro

- automatic GitHub checks
- doc drift detection
- 100 PR analyses per month
- PR summaries and reviewer suggestions

### Team

- unlimited repositories
- Slack / email alerts
- merge gate policies
- analytics dashboard
- audit log

### Enterprise

- GitHub App org-wide install
- SSO / SCIM later
- retention controls
- private deployment / VPC options

## Architecture plan

### Important architecture decision

For this feature to work as a real cloud product, DocuVerse should move beyond only user OAuth tokens and add a **GitHub App** path.

Why:

- webhook-driven analysis must work when the user is offline
- PR comments and checks should not depend on a temporary user token
- org-wide installations are easier to sell to teams than per-user OAuth

### End-to-end flow

1. GitHub sends `pull_request` webhook to DocuVerse.
2. Backend verifies signature with `GITHUB_WEBHOOK_SECRET`.
3. Event is stored as a `PRGuardRun` in pending state.
4. Background worker fetches changed files, PR metadata, and diff.
5. Diff analyzer maps changed hunks to files/symbols.
6. Existing impact-analysis services compute blast radius.
7. Guard service asks the LLM for:
  - PR summary
  - reviewer suggestions
  - test checklist
  - rollback notes
  - doc drift recommendations
8. Backend stores results.
9. GitHub check-run and PR comment are posted.
10. Frontend, VS Code, and MCP can all retrieve the stored result.

### Recommended implementation shape

- Use FastAPI endpoint for webhook ingestion.
- Use `BackgroundTasks` for the first cut.
- Move to Redis queue or AWS SQS in phase 2 for reliability and retries.
- Reuse current persistence patterns in `persistence.py`.

## Data model additions

Add the following models to `backend/app/models/schemas.py`:

- `PRGuardConfig`
- `PRGuardRun`
- `PRGuardFinding`
- `PRGuardReviewerSuggestion`
- `DocDriftItem`
- `PullRequestSnapshot`
- `PRGuardStatusResponse`

### Minimum fields

`PRGuardConfig`

- `repo_id`
- `enabled`
- `risk_threshold`
- `auto_post_comment`
- `auto_create_check`
- `auto_refresh_docs_on_merge`

`PRGuardRun`

- `id`
- `repo_id`
- `pr_number`
- `pr_title`
- `head_sha`
- `base_branch`
- `status`
- `risk_score`
- `risk_level`
- `summary`
- `blast_radius`
- `stale_artifacts`
- `reviewer_suggestions`
- `test_focus`
- `rollback_notes`
- `created_at`
- `updated_at`

## Backend file plan

### Files to add

- `backend/app/api/endpoints/pr_guard.py`
  - webhook ingest endpoint
  - repo settings endpoints
  - PR run list/detail endpoints
- `backend/app/services/pr_guard_service.py`
  - orchestration service for a full PR analysis run
- `backend/app/services/diff_analyzer.py`
  - map changed hunks to files, symbols, and probable module ownership
- `backend/app/services/github_app_service.py`
  - GitHub App auth, installation token handling, webhook signature verification
- `backend/app/services/doc_drift_service.py`
  - compare PR changes against existing docs, diagrams, walkthroughs, README cache
- `backend/tests/test_pr_guard.py`
- `backend/tests/test_diff_analyzer.py`
- `backend/tests/test_doc_drift_service.py`

### Files to modify

- `backend/app/api/routes.py`
  - register the new router
- `backend/app/models/schemas.py`
  - add PR Guard schemas
- `backend/app/config.py`
  - add:
    - `github_app_id`
    - `github_app_private_key`
    - `github_webhook_secret`
    - `docuverse_app_base_url`
    - `pr_guard_default_threshold`
- `backend/app/services/github_service.py`
  - add helpers for:
    - PR comments
    - check-runs or statuses
    - changed file retrieval
- `backend/app/services/persistence.py`
  - save/load PR Guard configs and runs
- `backend/app/services/indexer.py`
  - add targeted re-indexing for changed files after merge

## Frontend file plan

### Files to add

- `frontend/src/app/repository/[id]/guard/page.tsx`
  - repo-level Guard dashboard
- `frontend/src/components/guard/GuardSummaryCard.tsx`
- `frontend/src/components/guard/PRRunTable.tsx`
- `frontend/src/components/guard/RiskBadge.tsx`
- `frontend/src/components/guard/DocDriftPanel.tsx`
- `frontend/src/components/guard/ReviewerSuggestions.tsx`
- `frontend/src/components/guard/GuardSettingsForm.tsx`

### Files to modify

- `frontend/src/lib/api.ts`
  - add Guard endpoints:
    - get config
    - update config
    - list PR runs
    - get PR run
    - manual re-run
- `frontend/src/app/repository/[id]/page.tsx`
  - add a `Guard` quick action
- `frontend/src/components/layout/Sidebar.tsx`
  - add navigation entry if needed
- `frontend/src/app/settings/page.tsx`
  - add integration + billing hooks for Guard

## VS Code extension plan

### Files to add

- `docuverse-vscode/src/pr/prGuardPanel.ts`

### Files to modify

- `docuverse-vscode/src/api/types.ts`
  - add PR Guard result types
- `docuverse-vscode/src/api/client.ts`
  - add PR Guard API calls
- `docuverse-vscode/src/extension.ts`
  - add commands:
    - `docuverse.openPRGuard`
    - `docuverse.reviewActivePR`

### Extension use case

Inside VS Code, a developer should be able to open the Guard summary for the active branch/PR and immediately see:

- risk level
- impacted files
- stale docs
- recommended tests

## MCP server plan

### Files to modify

- `mcp-server/src/index.ts`

### New MCP tools

- `analyze_pull_request_risk`
- `get_pull_request_guard_result`
- `list_pull_request_guard_runs`
- `refresh_pull_request_docs`

This lets external AI clients use Guard as a real remote service, which increases platform stickiness.

## API plan

### New endpoints

- `POST /api/pr-guard/webhooks/github`
- `GET /api/pr-guard/{repo_id}/config`
- `PUT /api/pr-guard/{repo_id}/config`
- `GET /api/pr-guard/{repo_id}/runs`
- `GET /api/pr-guard/{repo_id}/runs/{run_id}`
- `POST /api/pr-guard/{repo_id}/runs/reanalyze`

### Event coverage for MVP

- `pull_request.opened`
- `pull_request.synchronize`
- `pull_request.reopened`
- `pull_request.closed` with merged state

## Rollout plan

### Phase 1: foundation

- add schemas
- add persistence
- add webhook ingestion
- support GitHub App auth

### Phase 2: intelligence

- build diff analyzer
- build risk scoring pipeline
- build doc drift detector
- generate PR summary and check result

### Phase 3: product surface

- add Guard dashboard in frontend
- add VS Code panel
- add MCP tools

### Phase 4: paid features

- Slack notifications
- policy thresholds
- analytics
- org-level controls

## Success metrics

Track:

- PRs analyzed per week
- % of analyzed PRs where a stale-doc warning was accepted
- average time from PR open to first review
- reduction in manual doc update work
- number of merged PRs with Guard comments/checks
- paid conversion from repo-level Guard activation

## Main risks

### 1. GitHub auth model is not strong enough yet

Current implementation is centered on user OAuth. Continuous automation should use GitHub App installation auth.

### 2. Webhook requests should not do heavy work inline

If analysis happens synchronously inside the webhook request, it will become slow and brittle.

### 3. False-positive doc drift can annoy users

Guard should explain *why* it marked something stale and allow teams to tune thresholds.

### 4. No test harness exists yet

This repo currently has no obvious automated test suite, so the feature should introduce backend tests as part of the implementation plan instead of bolting them on later.

## Recommended build order

If only one feature should be built next, build it in this order:

1. backend webhook + GitHub App auth
2. PR diff analysis + risk engine
3. PR comment/check output
4. frontend Guard dashboard
5. post-merge doc refresh
6. VS Code and MCP integration

## Final recommendation

If the goal is to make DocuVerse look like a product teams would actually buy, **DocuVerse Guard** is the best next feature.

It is:

- clearly missing from the current repo
- strongly aligned with existing architecture
- useful as a cloud service
- close to engineering budgets
- defensible because it combines code intelligence with documentation intelligence

