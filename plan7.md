# Feature Plan: DocuVerse Compass

## One-line idea

Build **DocuVerse Compass**, a personalized **developer re-entry and handoff copilot** that automatically generates:

- morning focus briefs
- "what changed in my area" summaries
- review priority lists
- post-weekend / post-leave catch-up digests
- ownership-based risk alerts
- optional 2-minute audio briefings

This is one of the best "easy cloud" features for DocuVerse because it solves a daily developer pain point while reusing the product's strongest existing systems.

## What problem this solves

Developers lose time every day because of context switching.

Typical situations:

- starting the morning with 40 notifications
- coming back after a weekend
- returning after a vacation
- switching between 3 repositories
- inheriting another engineer's area for a day

The real question is not:

- "What notifications do I have?"

The real question is:

- "What matters to me right now, in the code I own, and what should I do first?"

That is exactly what Compass should answer.

## Why this is better than generic notifications

GitHub and Linear already provide:

- inboxes
- notifications
- scheduled reminders
- review queues

But those are still mostly **raw event feeds**.

Compass would be different because it is:

- ownership-aware
- code-aware
- risk-aware
- personalized
- optionally audio-delivered

So instead of a list of alerts, the developer gets a **briefing**.

## Why this is easy to implement under cloud service

This feature is much easier than `Guard`, `Pulse`, `Signal`, or `Provenance` because MVP can be built using:

- data DocuVerse already has
- GitHub repository metadata it already accesses
- scheduled jobs
- generated summaries

It does **not** require:

- incident platform integrations
- support-system integrations
- full local git history
- GitHub App rollout for the first version

## Best AWS-native implementation path

### Core AWS services

- **Amazon Bedrock**
  - generate personalized focus briefs and summaries
- **Amazon DynamoDB**
  - store user preferences, subscriptions, and generated briefs
- **Amazon S3**
  - store audio briefing files and archived brief payloads
- **Amazon EventBridge Scheduler**
  - trigger daily / weekly brief generation
- **Amazon SES**
  - deliver email briefs
- **AWS App Runner**
  - keep the FastAPI backend as the runtime surface

### Reuse from the existing repo

- audio generation pipeline already exists
- documentation and impact analysis already exist
- GitHub repository access already exists

That makes this very cloud-friendly and practical.

## What the repo already has

DocuVerse already has the right base capabilities:

- repository connect/index
- file tree and code parsing
- impact analysis
- documentation generation
- walkthrough and audio generation
- GitHub integration

Relevant current files:

- `backend/app/api/endpoints/repositories.py`
- `backend/app/api/endpoints/files.py`
- `backend/app/api/endpoints/documentation.py`
- `backend/app/services/audio_generator.py`
- `backend/app/services/script_generator.py`
- `backend/app/services/dependency_analyzer.py`
- `backend/app/services/github_service.py`
- `backend/app/services/persistence.py`
- `frontend/src/lib/api.ts`
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/app/settings/page.tsx`

## What is missing today

DocuVerse currently explains code well when a user asks.

It does not yet provide:

- personalized daily briefings
- owner-specific focus queues
- catch-up summaries after time away
- developer handoff packets
- startup briefings inside VS Code

That is a very real gap.

## Proposed feature

### Name

**DocuVerse Compass: Personal Context Re-entry + Handoff Copilot**

### Core value

Compass should automatically tell a developer:

1. what changed in the code areas I own or care about
2. what is risky and needs my attention first
3. what reviews or follow-ups are important
4. what docs or walkthroughs in my area became stale
5. what I can safely ignore for now

## Why developers would pay for this

Developers and teams pay indirectly for this problem every day:

- wasted time triaging notifications
- delayed review response
- slower onboarding into unfamiliar repos
- context loss after switching tasks
- missed changes in owned modules

Compass creates value for:

- individual developers
- tech leads
- managers
- agencies with many repos
- distributed teams working across time zones

## Market validation

As of **March 26, 2026**, current tools already show the demand for notification triage, ownership, and reminders:

- **GitHub Notifications** exists because activity overload is real.
- **GitHub Scheduled Reminders** exists because teams need periodic review focus.
- **GitHub CODEOWNERS** exists because code ownership matters.
- **Linear Inbox** exists because people need a focused view of updates.
- **Backstage ownership views** exist because teams need to see what they own.

The market signal is clear:

- developers need focus
- ownership matters
- reminders help

But those products still mostly stop at event feeds and ownership metadata. Compass would turn that into a **code-aware, personalized briefing layer**.

### Sources

- GitHub notifications: https://docs.github.com/github/managing-subscriptions-and-notifications-on-github/setting-up-notifications/about-notifications
- GitHub notification inbox management: https://docs.github.com/articles/saving-notifications-for-later
- GitHub scheduled reminders: https://docs.github.com/en/subscriptions-and-notifications/concepts/scheduled-reminders
- GitHub managing scheduled reminders: https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-your-scheduled-reminders
- GitHub CODEOWNERS: https://docs.github.com/articles/about-code-owners
- Linear Inbox: https://linear.app/docs/inbox
- Linear notifications: https://linear.app/docs/notifications
- Backstage viewing what you own: https://backstage.io/docs/next/getting-started/view-what-you-own
- Amazon EventBridge Scheduler: https://docs.aws.amazon.com/eventbridge/latest/userguide/using-eventbridge-scheduler.html
- Amazon SES SendEmail: https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
- Amazon Bedrock overview: https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html

## Why DocuVerse can win

GitHub and Linear tell users that something happened.

DocuVerse Compass can tell users:

- why it matters
- how risky it is
- where in the code it landed
- what to do next

And because DocuVerse already supports audio generation, Compass can make that re-entry flow even stronger with:

- a short narrated daily brief

That is a differentiated and memorable workflow.

## MVP scope

### User-facing MVP

For a user with connected repos, Compass should support:

- daily morning brief
- weekly catch-up brief
- manual "catch me up" run
- owner-aware or watchlist-aware filtering
- text brief in web app
- optional email delivery
- optional audio brief

### How relevance should be computed

MVP relevance can be based on:

- repos the user connected
- files matched from `CODEOWNERS` if present
- manually watched files/directories
- recent walkthrough and docs activity
- impact-analysis hotspots
- GitHub PRs likely requiring attention

### Brief output should include

- `Top 3 things to look at today`
- `Changed files in your area`
- `High-risk changes`
- `Reviews waiting on you`
- `Docs that may be stale`
- `Recommended next action`

### Audio variant

Use the existing audio generation stack to create:

- 60-120 second spoken brief

This is a strong wow factor and a natural fit for DocuVerse.

## Suggested packaging

### Free

- manual catch-up brief
- one repo
- text only

### Pro

- scheduled daily and weekly briefs
- email delivery
- audio briefing
- up to 10 repos

### Team

- team handoff mode
- shared watchlists
- owner mapping
- team digest routing

### Enterprise

- org-wide role-aware delivery
- advanced routing rules
- retention and audit controls
- private deployment

## Architecture plan

### Simplest implementation path

1. EventBridge Scheduler triggers a protected backend endpoint each morning.
2. Backend loads the user's subscriptions and watched repos.
3. Compass service computes relevant changes from:
   - repo metadata
   - documentation freshness
   - impact hotspots
   - review-related GitHub signals
4. Bedrock writes the personalized briefing.
5. Optional audio is generated and stored in S3.
6. Brief metadata is stored in DynamoDB.
7. SES sends the email version.
8. Web app and VS Code show the latest brief on demand.

This is a simple and highly AWS-native path.

### Ownership model for MVP

Keep ownership simple:

- if `CODEOWNERS` exists, parse it
- if it does not, let users create watchlists:
  - repo
  - directory
  - file

That avoids waiting on perfect ownership infrastructure.

## Data model additions

Add to `backend/app/models/schemas.py`:

- `CompassSubscription`
- `CompassWatchTarget`
- `CompassBrief`
- `FocusItem`
- `BriefDeliveryRecord`

### Minimum fields

`CompassSubscription`

- `user_id`
- `repo_id`
- `cadence`
- `email_enabled`
- `audio_enabled`
- `watch_targets`

`FocusItem`

- `id`
- `repo_id`
- `file_path`
- `title`
- `reason`
- `risk_level`
- `action_type`
- `source_type`

`CompassBrief`

- `id`
- `user_id`
- `date_for`
- `title`
- `summary`
- `focus_items`
- `audio_url`
- `created_at`

## Backend file plan

### Files to add

- `backend/app/api/endpoints/compass.py`
  - config endpoints
  - run-now endpoint
  - latest brief endpoints
- `backend/app/services/compass_service.py`
  - main orchestration for brief generation
- `backend/app/services/ownership_service.py`
  - parses CODEOWNERS and merges manual watchlists
- `backend/app/services/brief_generator.py`
  - builds personalized briefing payloads
- `backend/app/services/brief_delivery_service.py`
  - SES + audio delivery
- `backend/tests/test_compass_service.py`
- `backend/tests/test_ownership_service.py`
- `backend/tests/test_brief_generator.py`

### Files to modify

- `backend/app/api/routes.py`
  - register Compass router
- `backend/app/models/schemas.py`
  - add Compass models
- `backend/app/config.py`
  - add:
    - `compass_schedule_secret`
    - `ses_from_email`
    - `compass_default_cadence`
    - `s3_brief_bucket`
- `backend/app/services/github_service.py`
  - add lightweight helpers for:
    - review requests
    - open PR summaries
    - changed files metadata
- `backend/app/services/persistence.py`
  - save/load Compass subscriptions and briefs

## Frontend file plan

### Files to add

- `frontend/src/app/compass/page.tsx`
- `frontend/src/components/compass/BriefCard.tsx`
- `frontend/src/components/compass/FocusList.tsx`
- `frontend/src/components/compass/CompassSettingsForm.tsx`
- `frontend/src/components/compass/WatchTargetsEditor.tsx`

### Files to modify

- `frontend/src/lib/api.ts`
  - add Compass endpoints
- `frontend/src/app/dashboard/page.tsx`
  - add today's brief card
- `frontend/src/app/settings/page.tsx`
  - add brief preferences

## VS Code extension plan

### Files to add

- `docuverse-vscode/src/compass/compassPanel.ts`

### Files to modify

- `docuverse-vscode/src/api/types.ts`
  - add Compass brief types
- `docuverse-vscode/src/api/client.ts`
  - add Compass methods
- `docuverse-vscode/src/extension.ts`
  - add:
    - `docuverse.openCompass`
    - `docuverse.catchMeUp`

### Extension use case

On VS Code startup, a developer can open a short brief:

- what changed
- what needs review
- what looks risky
- what to inspect first

That is a very strong daily workflow.

## MCP server plan

### Files to modify

- `mcp-server/src/index.ts`

### New MCP tools

- `get_my_daily_brief`
- `catch_me_up_on_repo`
- `list_focus_items`

## API plan

### New endpoints

- `POST /api/compass/jobs/run`
- `GET /api/compass/me/config`
- `PUT /api/compass/me/config`
- `GET /api/compass/me/latest`
- `GET /api/compass/me/briefs`
- `POST /api/compass/me/run-now`

## Rollout plan

### Phase 1

- subscriptions and watchlists
- text-only manual briefs
- dashboard surface

### Phase 2

- scheduled briefs
- SES delivery
- CODEOWNERS parsing

### Phase 3

- audio brief generation
- VS Code startup panel
- MCP support

### Phase 4

- team handoff mode
- richer prioritization
- org-level delivery rules

## Success metrics

Track:

- daily brief open rate
- email brief open rate
- audio brief play rate
- reduction in manual triage time
- review response time improvement
- paid conversion from enabling scheduled Compass

## Main risks

### 1. Relevance quality must be high

If the brief feels generic, users will ignore it.

### 2. Ownership mapping may be incomplete

That is why watchlists should exist from day one.

### 3. Too much content defeats the purpose

Compass should stay short and prioritized.

## Recommended build order

1. watchlists and subscriptions
2. text brief generation
3. dashboard and settings UI
4. scheduled jobs
5. SES delivery
6. audio brief generation

## Final recommendation

If you want one more feature that is:

- highly useful
- easy to implement under cloud
- clearly different from the other ideas
- and memorable for developers

then **DocuVerse Compass** is a very strong choice.

It turns raw repo activity into a personalized daily briefing, which is something developers genuinely need and still do not get well from existing tools.
