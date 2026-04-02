# Feature Plan: DocuVerse Relay

## One-line idea

Build **DocuVerse Relay**, an AI release-notes and change-digest feature that automatically creates:

- internal engineering release summaries
- support-ready update notes
- customer-safe changelog entries
- weekly product update emails
- repo-specific release pages

This is a strong paid feature because release communication is always needed, usually messy, and much easier to implement than incident or ticket intelligence.

## Why this is simpler than the earlier ideas

Compared with `Guard`, `Pulse`, and `Signal`, Relay is easier because it can run mostly from:

- existing repo docs
- existing GitHub integration
- existing walkthrough/documentation context
- scheduled AWS jobs

It does **not** need:

- real-time incident parsing
- third-party support ingestion
- complex reviewer routing
- org-level GitHub App rollout for MVP

## Best AWS-first implementation path

### Core AWS services

- **Amazon Bedrock**
  - generate audience-specific summaries from repo changes
- **Amazon DynamoDB**
  - store digest history, templates, and subscribers
- **Amazon S3**
  - store published HTML/Markdown release pages
- **Amazon EventBridge Scheduler**
  - trigger weekly or release-day digest jobs
- **Amazon SES**
  - send internal and customer-facing digests
- **AWS App Runner**
  - run the backend and expose publish endpoints

### Optional later

- **AWS Step Functions**
  - if publishing becomes a multi-step workflow

## What the repo already has

DocuVerse already contains most of the raw ingredients:

- repository indexing
- repository and file documentation generation
- diagram generation
- GitHub integration
- automation history storage

Relevant files:

- `backend/app/api/endpoints/documentation.py`
- `backend/app/api/endpoints/github.py`
- `backend/app/services/documentation_generator.py`
- `backend/app/services/github_service.py`
- `backend/app/services/persistence.py`
- `frontend/src/lib/api.ts`
- `frontend/src/app/settings/page.tsx`

## What is missing today

The current product does not yet provide:

- release notes generation as a product surface
- scheduled change digests
- stakeholder-specific summaries
- customer-facing changelog pages
- automated email delivery for updates

That is a real product gap, especially for teams shipping frequently.

## Proposed feature

### Name

**DocuVerse Relay: AI Release Notes + Change Digest**

### Core value

Relay should automatically answer:

1. what changed this week?
2. what should engineers know?
3. what should support know?
4. what can customers safely see?
5. what is the shortest useful release summary for leadership?

## Why teams would pay

Release communication is painful across almost every team.

Product, support, success, and engineering all need different versions of the same update. Relay reduces the work of:

- manually writing release notes
- converting technical changes into customer language
- sending weekly updates
- keeping stakeholders aligned

This is easy to sell because it saves repeated operational work every week.

## Market validation

As of **March 26, 2026**, current products already prove that release-note automation and product communication are paid categories:

- **GitHub** already supports automatically generated release notes and even provides an API to generate release-note content.
- **LaunchNotes** markets release communication, digests, and changelog workflows as a product category.
- **Atlassian** explicitly offers weekly release notes and change-management controls for cloud updates.

The market signal is clear:

- teams need changelogs
- teams need digest emails
- teams need different audiences aligned

DocuVerse can differentiate by using repo intelligence to make the summaries more accurate and more useful than generic release-note generation.

### Sources

- GitHub automatically generated release notes: https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes
- GitHub releases API: https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28
- LaunchNotes overview: https://www.launchnotes.com/
- LaunchNotes features: https://www.launchnotes.com/features
- Atlassian change management and weekly release notes: https://www.atlassian.com/software/premium/manage-change-in-cloud
- Amazon EventBridge Scheduler: https://docs.aws.amazon.com/eventbridge/latest/userguide/using-eventbridge-scheduler.html
- Amazon SES SendEmail: https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html
- Amazon Bedrock overview: https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html

## Why DocuVerse can win

GitHub can generate baseline release notes. LaunchNotes can publish updates. DocuVerse can win by being stronger on:

- code-aware impact explanation
- using repo docs as context
- generating different summaries for different audiences
- linking release notes back to diagrams, docs, and walkthroughs

That makes Relay more useful to engineering-heavy teams than a plain changelog tool.

## MVP scope

### User-facing MVP

Relay should let a user:

- choose a repo
- choose a cadence: weekly or manual
- choose audiences:
  - engineering
  - support
  - customer
  - leadership
- generate or schedule a digest
- email the digest
- publish a changelog page

### Relay output variants

`Engineering`

- changed modules
- risk notes
- follow-up tasks

`Support`

- bug fixes
- known caveats
- customer-facing wording

`Customer`

- polished changelog summary
- no internal jargon

`Leadership`

- short impact summary
- value delivered
- risk or rollout notes

## Suggested packaging

### Free

- manual release-note generation
- one audience variant
- one repo

### Pro

- scheduled weekly digests
- multiple audience variants
- email sending
- up to 10 repos

### Team

- unlimited repos
- reusable templates
- role-based subscribers
- public changelog pages

### Enterprise

- branded release pages
- advanced approval flows
- private deployment
- long retention

## Architecture plan

### Simplest implementation path

1. EventBridge Scheduler triggers a protected backend endpoint weekly.
2. Backend loads recent repo changes and available documentation context.
3. Relay service prepares structured release data.
4. Bedrock generates audience-specific summaries.
5. DynamoDB stores the digest and metadata.
6. S3 stores a rendered changelog page if publishing is enabled.
7. SES sends the digest to subscribers.

This is a much simpler AWS-native workflow than the earlier feature ideas.

### How to define "what changed"

For MVP, keep it simple:

- use recent documentation generation results
- use recent automation history
- optionally accept a manual date range

Later, add deeper GitHub commit and release integration.

## Data model additions

Add to `backend/app/models/schemas.py`:

- `RelayConfig`
- `ReleaseDigest`
- `DigestAudienceVariant`
- `DigestSubscriber`
- `DigestPublishRecord`

### Minimum fields

`RelayConfig`

- `repo_id`
- `enabled`
- `cadence`
- `audiences`
- `publish_to_s3`
- `email_recipients`

`ReleaseDigest`

- `id`
- `repo_id`
- `date_from`
- `date_to`
- `title`
- `summary`
- `audience_variants`
- `published_url`
- `created_at`

## Backend file plan

### Files to add

- `backend/app/api/endpoints/relay.py`
  - config endpoints
  - run-now endpoint
  - digest list/detail endpoints
- `backend/app/services/relay_service.py`
  - orchestrates digest generation
- `backend/app/services/release_digest_service.py`
  - collects structured change data
- `backend/app/services/audience_formatter.py`
  - turns one digest into multiple audience variants
- `backend/app/services/publish_service.py`
  - uploads rendered release pages to S3
- `backend/tests/test_relay_service.py`
- `backend/tests/test_release_digest_service.py`
- `backend/tests/test_audience_formatter.py`

### Files to modify

- `backend/app/api/routes.py`
  - register Relay router
- `backend/app/models/schemas.py`
  - add Relay models
- `backend/app/config.py`
  - add:
    - `relay_schedule_secret`
    - `ses_from_email`
    - `relay_default_cadence`
    - `s3_release_bucket`
- `backend/app/services/persistence.py`
  - save/load Relay configs and digests

## Frontend file plan

### Files to add

- `frontend/src/app/repository/[id]/relay/page.tsx`
- `frontend/src/components/relay/DigestCard.tsx`
- `frontend/src/components/relay/AudienceTabs.tsx`
- `frontend/src/components/relay/RelayConfigForm.tsx`
- `frontend/src/components/relay/PublishPanel.tsx`

### Files to modify

- `frontend/src/lib/api.ts`
  - add Relay endpoints
- `frontend/src/app/repository/[id]/page.tsx`
  - add a `Relay` quick action
- `frontend/src/app/settings/page.tsx`
  - add digest and subscriber settings

## VS Code extension plan

### Files to add

- `docuverse-vscode/src/relay/relayPanel.ts`

### Files to modify

- `docuverse-vscode/src/api/types.ts`
  - add Relay types
- `docuverse-vscode/src/api/client.ts`
  - add Relay methods
- `docuverse-vscode/src/extension.ts`
  - add `docuverse.openRelay`

## MCP server plan

### Files to modify

- `mcp-server/src/index.ts`

### New MCP tools

- `generate_release_digest`
- `list_release_digests`
- `publish_release_digest`

## API plan

### New endpoints

- `POST /api/relay/jobs/run`
- `GET /api/relay/{repo_id}/config`
- `PUT /api/relay/{repo_id}/config`
- `GET /api/relay/{repo_id}/digests`
- `GET /api/relay/{repo_id}/digests/{digest_id}`
- `POST /api/relay/{repo_id}/digests/{digest_id}/publish`

## Rollout plan

### Phase 1

- manual digest generation
- audience variants
- persistence

### Phase 2

- scheduled runs
- SES delivery
- S3 publish

### Phase 3

- frontend Relay page
- reusable templates
- VS Code and MCP support

### Phase 4

- deeper GitHub release integration
- approval flows
- branded public changelog pages

## Success metrics

Track:

- number of generated digests per week
- number of scheduled digests delivered
- open rate on SES digests
- time saved on release communication
- paid conversion from enabling scheduled Relay

## Main risks

### 1. Summaries can become repetitive

Template quality and audience prompts must stay sharp.

### 2. Public-facing notes must be safe

The customer version should avoid internal or sensitive details.

### 3. If change collection is weak, the summaries will be weak

The release data inputs should stay structured and reviewable.

## Recommended build order

1. structured digest builder
2. audience variants
3. persistence
4. scheduled jobs
5. SES and S3 publishing
6. frontend page

## Final recommendation

If you want an easier premium feature that still feels production-grade and useful, **DocuVerse Relay** is a very strong option.

It is:

- genuinely needed
- easy to explain to customers
- much easier than the previous feature ideas
- highly compatible with the current AWS direction
