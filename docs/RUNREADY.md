# RunReady by DocuVerse

> **Clone any repo. DocuVerse makes it runnable.**

## Tagline

*Your repo should run before anyone has to understand it.*

DocuVerse tests your project in a fresh environment, fixes broken setup, generates verified run instructions, and keeps onboarding from breaking again.

---

## What It Does

1. User connects a GitHub repo
2. DocuVerse opens a **fresh sandbox** (AWS CodeBuild container)
3. It tries to: install dependencies → configure env → build → start services → seed DB → run tests
4. If it fails, it **diagnoses the exact reason** using AI (AWS Bedrock / Claude)
5. It **generates/fixes**:
   - `.env.example`
   - Setup guide (`SETUP.md`)
   - `devcontainer.json`
   - `docker-compose.yml`
   - Seed data scripts
   - Missing npm scripts
   - Test/run commands
6. It issues a **First Run Certificate**:
   - ✅ Install command verified
   - ✅ App start verified
   - ✅ Test command verified
   - 🔌 Ports detected
   - 🔑 Env vars listed
   - 🗄️ Database/service requirements mapped
7. On every PR, it checks: *"Can a new developer still run this project from zero?"*

---

## Why This Is Better

Codespaces and dev containers already exist, but they are **just infrastructure** — someone still has to configure them correctly.

- GitHub says dev containers can create tailored dev environments ([GitHub Docs](https://docs.github.com/en/codespaces))
- Cursor background agents need setup commands in `.cursor/environment.json` ([Cursor docs](https://docs.cursor.com))
- Copilot cloud agent uses an ephemeral GitHub Actions environment ([GitHub Docs](https://docs.github.com/en/copilot))

**The missing product is:** *"Automatically make my repo runnable and keep it runnable."*

That is practical, sellable, and painful.

---

## MVP Scope

**Supported frameworks (Phase 1):**
- Node.js / npm / yarn / pnpm
- React (CRA, Vite)
- Next.js
- Express / Fastify / NestJS

**Phase 2 (future):** Python, Go, Rust, Java

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          USER FLOW                                   │
│  Connect GitHub Repo → Trigger Analysis → View Certificate           │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                                  │
│                                                                      │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │  Project         │   │  CodeBuild       │   │  RunReady        │  │
│  │  Detector        │──▶│  Service         │──▶│  Orchestrator    │  │
│  │                  │   │                  │   │                  │  │
│  │  - framework     │   │  - buildspec gen │   │  - poll results  │  │
│  │  - pkg manager   │   │  - S3 upload     │   │  - AI diagnosis  │  │
│  │  - node version  │   │  - start build   │   │  - fix generation│  │
│  │  - db needs      │   │  - fetch logs    │   │  - certificate   │  │
│  │  - env vars      │   │                  │   │                  │  │
│  │  - ports         │   │                  │   │                  │  │
│  └─────────────────┘   └──────────────────┘   └──────────────────┘  │
│                                                                      │
│  ┌─────────────────┐   ┌──────────────────┐                         │
│  │  GitHub Webhook  │   │  Persistence     │                         │
│  │  Handler         │   │  (DynamoDB + S3) │                         │
│  └─────────────────┘   └──────────────────┘                         │
└──────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    AWS CODEBUILD SANDBOX                              │
│                                                                      │
│  Fresh Ubuntu container with Node.js 20                              │
│  Steps: install → env setup → build → start (bg) → health check     │
│         → kill → test → write results JSON                           │
│                                                                      │
│  Output → S3 artifact + CloudWatch logs                              │
└──────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                                 │
│                                                                      │
│  /runready              → Dashboard with repo list + status badges   │
│  /runready/[repoId]     → Full report + certificate + fixes          │
│                                                                      │
│  Components:                                                         │
│  - RunReadyCertificate  → Visual pass/fail card                      │
│  - RunReadyDiagnosis    → Issue list with AI suggestions             │
│  - RunReadyFixCard      → Preview + one-click "Create Fix PR"        │
│  - RunReadyBuildLogs    → Collapsible log viewer                     │
│  - RunReadyTimeline     → History of past analyses                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## AWS Services Required

| Service | Resource Name | Purpose |
|---------|--------------|---------|
| **S3** | `docuverse-runready-artifacts` | Store repo source ZIPs + build output |
| **CodeBuild** | `docuverse-runready` | Ephemeral sandbox (Ubuntu + Node 20) |
| **DynamoDB** | `docusense_runready_reports` | Store analysis reports (PK: `repo_id`, SK: `report_id`) |
| **IAM Role** | `docuverse-runready-codebuild-role` | CodeBuild service role (S3, CloudWatch) |
| **IAM Policy** | `docuverse-runready-backend-policy` | Backend role additions (CodeBuild, S3, CW Logs) |
| **CloudWatch** | `/aws/codebuild/docuverse-runready` | Build logs |

> **Region:** `ap-south-1` (matching existing infra)
>
> **Cost estimate:** ~$0.005/min for `BUILD_GENERAL1_SMALL`. At 100 analyses/day × 5 min avg = ~$2.50/day.

---

## Backend — New Files

### 1. `backend/app/services/runready_detector.py`

Project detection engine. Scans repo to determine:

```python
class ProjectConfig:
    framework: str          # "nextjs" | "express" | "react-cra" | "vite" | "nestjs" | "fastify"
    package_manager: str    # "npm" | "yarn" | "pnpm"
    node_version: str       # from .nvmrc / .node-version / engines
    install_command: str    # "npm ci" | "yarn --frozen-lockfile" | "pnpm install --frozen-lockfile"
    build_command: str      # from package.json scripts.build
    start_command: str      # from package.json scripts.start / scripts.dev
    test_command: str       # from package.json scripts.test
    detected_port: int      # from scripts, PORT env, framework defaults
    env_vars: list[str]     # required env var names (from process.env.* references)
    db_services: list[str]  # ["postgresql", "redis", "mongodb"] from deps
    has_dockerfile: bool
    has_docker_compose: bool
    has_devcontainer: bool
```

**Detection heuristics:**

| Signal | Framework |
|--------|-----------|
| `next` in dependencies | Next.js |
| `express` in dependencies | Express |
| `react-scripts` in dependencies | React CRA |
| `vite` in devDependencies | Vite |
| `@nestjs/core` in dependencies | NestJS |
| `fastify` in dependencies | Fastify |

| Signal | Package Manager |
|--------|----------------|
| `package-lock.json` exists | npm |
| `yarn.lock` exists | yarn |
| `pnpm-lock.yaml` exists | pnpm |

| Signal | Database |
|--------|----------|
| `pg` / `@prisma/client` / `typeorm` + `pg` | PostgreSQL |
| `mongoose` / `mongodb` | MongoDB |
| `mysql2` / `typeorm` + `mysql` | MySQL |
| `redis` / `ioredis` | Redis |

### 2. `backend/app/services/runready_codebuild.py`

AWS CodeBuild integration:

```python
class CodeBuildService:
    def __init__(self):
        self.client = boto3.client('codebuild', region_name=settings.aws_region)
        self.s3 = boto3.client('s3', region_name=settings.aws_region)

    async def zip_and_upload(repo_path: str, repo_id: str) -> str:
        """Zip repo → upload to S3 → return S3 key"""

    def generate_buildspec(config: ProjectConfig) -> str:
        """Generate buildspec.yml tailored to detected framework"""

    async def start_build(s3_key: str, buildspec: str) -> str:
        """Start CodeBuild build, return build_id"""

    async def poll_build(build_id: str) -> BuildResult:
        """Poll until complete, return structured result"""

    async def fetch_logs(build_id: str) -> str:
        """Fetch CloudWatch logs for the build"""
```

**Dynamic buildspec template:**

```yaml
version: 0.2
env:
  variables:
    CI: "true"
    NODE_ENV: "development"
phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - node --version && npm --version
      - {install_command}
  pre_build:
    commands:
      - |
        if [ -f .env.example ]; then
          cp .env.example .env
        fi
      - echo "INSTALL_STATUS=passed" >> runready-results.env
  build:
    commands:
      - {build_command} && echo "BUILD_STATUS=passed" >> runready-results.env || echo "BUILD_STATUS=failed" >> runready-results.env
      - |
        timeout 30 {start_command} &
        APP_PID=$!
        sleep 8
        curl -sf http://localhost:{port} > /dev/null && echo "START_STATUS=passed" >> runready-results.env || echo "START_STATUS=failed" >> runready-results.env
        kill $APP_PID 2>/dev/null || true
  post_build:
    commands:
      - {test_command} && echo "TEST_STATUS=passed" >> runready-results.env || echo "TEST_STATUS=failed" >> runready-results.env
      - cat runready-results.env
artifacts:
  files:
    - runready-results.env
```

### 3. `backend/app/services/runready_service.py`

Main orchestrator:

```python
class RunReadyService:
    async def analyze_repo(repo_id, repo_path, full_name) -> RunReadyReport:
        """Full pipeline: detect → build → diagnose → fix → certify"""

    async def diagnose_failures(build_result, project_config) -> list[Diagnosis]:
        """Send failure logs to Bedrock for AI root-cause analysis"""

    async def generate_fixes(diagnoses, project_config, repo_path) -> list[FixArtifact]:
        """Auto-generate .env.example, SETUP.md, devcontainer.json, etc."""

    async def generate_certificate(build_result, project_config) -> FirstRunCertificate:
        """Produce the First Run Certificate"""

    async def check_pr(owner, repo, pr_number, branch) -> PRCheckResult:
        """Re-run analysis for a PR branch, post comment"""
```

**AI Diagnosis prompt (Bedrock):**

```
You are a DevOps expert. A fresh clone of a Node.js project failed during setup.

Framework: {framework}
Package Manager: {package_manager}
Step that failed: {step}
Error output:
{error_log}

package.json dependencies:
{deps}

Diagnose the root cause and suggest a fix. Return JSON:
{
  "error_type": "missing_dependency|env_var|port_conflict|build_error|...",
  "summary": "...",
  "suggestion": "...",
  "auto_fixable": true/false
}
```

**Fix generation templates:**

- `.env.example` → Scan all `process.env.X` references in code, generate template
- `SETUP.md` → Framework-specific setup guide with commands
- `devcontainer.json` → Based on detected framework + services
- `docker-compose.yml` → Based on detected DB/cache services

### 4. `backend/app/api/endpoints/runready.py`

API endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/runready/analyze/{repo_id}` | JWT | Trigger analysis |
| `GET` | `/api/runready/status/{repo_id}` | JWT | Poll status |
| `GET` | `/api/runready/report/{repo_id}` | JWT | Get full report |
| `GET` | `/api/runready/certificate/{repo_id}` | JWT | Certificate only |
| `POST` | `/api/runready/fix/{repo_id}` | JWT | Create fix PR |
| `POST` | `/api/runready/webhook` | HMAC | GitHub webhook |
| `GET` | `/api/runready/history/{repo_id}` | JWT | Past runs |

### 5. Modifications to existing files

**`backend/app/api/routes.py`** — Add:
```python
from app.api.endpoints import runready
router.include_router(runready.router, prefix="/runready", tags=["RunReady"])
```

**`backend/app/config.py`** — Add settings:
```python
# RunReady
runready_codebuild_project: str = "docuverse-runready"
runready_s3_bucket: str = "docuverse-runready-artifacts"
runready_build_timeout: int = 600  # 10 min
runready_codebuild_image: str = "aws/codebuild/amazonlinux-x86_64-standard:5.0"
runready_codebuild_compute: str = "BUILD_GENERAL1_SMALL"
runready_github_app_id: str = ""
runready_github_app_private_key: str = ""
runready_github_webhook_secret: str = ""
```

**`backend/app/models/schemas.py`** — Add all RunReady Pydantic models (see Data Models section below).

**`backend/app/services/persistence.py`** — Add:
```python
def save_runready_report(report: RunReadyReport) -> None
def load_runready_report(repo_id: str) -> Optional[RunReadyReport]
def load_runready_history(repo_id: str) -> list[RunReadyReport]
```

---

## Data Models

```python
class ProjectFramework(str, Enum):
    NEXTJS = "nextjs"
    EXPRESS = "express"
    REACT_CRA = "react-cra"
    VITE = "vite"
    NESTJS = "nestjs"
    FASTIFY = "fastify"
    REMIX = "remix"
    UNKNOWN = "unknown"

class PackageManager(str, Enum):
    NPM = "npm"
    YARN = "yarn"
    PNPM = "pnpm"

class RunReadyStepStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WARNING = "warning"

class RunReadyStep(BaseModel):
    name: str                    # "install", "build", "test", "start"
    status: RunReadyStepStatus
    command: str
    duration_ms: int
    output: Optional[str]
    error: Optional[str]

class ProjectConfig(BaseModel):
    framework: ProjectFramework
    package_manager: PackageManager
    node_version: Optional[str]
    install_command: str
    build_command: Optional[str]
    start_command: Optional[str]
    test_command: Optional[str]
    detected_port: int = 3000
    env_vars: list[str] = []
    db_services: list[str] = []
    has_dockerfile: bool = False
    has_docker_compose: bool = False
    has_devcontainer: bool = False

class Diagnosis(BaseModel):
    step: str
    error_type: str
    summary: str
    suggestion: str
    auto_fixable: bool = False

class FixArtifact(BaseModel):
    filename: str
    content: str
    description: str

class FirstRunCertificate(BaseModel):
    repo_id: str
    repo_full_name: str
    overall_status: RunReadyStepStatus
    steps: list[RunReadyStep]
    detected_port: int
    env_vars_required: list[str]
    db_services: list[str]
    framework: str
    package_manager: str
    generated_at: datetime
    valid: bool = True

class RunReadyReport(BaseModel):
    id: str
    repo_id: str
    repo_full_name: str
    status: str  # "running", "completed", "failed"
    project_config: Optional[ProjectConfig]
    certificate: Optional[FirstRunCertificate]
    diagnoses: list[Diagnosis] = []
    fix_artifacts: list[FixArtifact] = []
    build_id: Optional[str]
    build_logs: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
```

---

## Frontend — New Pages & Components

### Pages

| Route | File | Description |
|-------|------|-------------|
| `/runready` | `frontend/src/app/runready/page.tsx` | Dashboard — list repos + status badges |
| `/runready/[repoId]` | `frontend/src/app/runready/[repoId]/page.tsx` | Full report + certificate + fixes |

### Components

| Component | File | Description |
|-----------|------|-------------|
| `RunReadyCertificate` | `components/runready/RunReadyCertificate.tsx` | Visual certificate card with step checkmarks |
| `RunReadyDiagnosis` | `components/runready/RunReadyDiagnosis.tsx` | AI diagnosis list with severity badges |
| `RunReadyFixCard` | `components/runready/RunReadyFixCard.tsx` | Fix preview + "Create PR" button |
| `RunReadyStatusBadge` | `components/runready/RunReadyStatusBadge.tsx` | ✅ Passing / ❌ Failing / ⏳ Running badge |
| `RunReadyBuildLogs` | `components/runready/RunReadyBuildLogs.tsx` | Collapsible log viewer |
| `RunReadyTimeline` | `components/runready/RunReadyTimeline.tsx` | History of past analyses |

### API Client additions (`frontend/src/lib/api.ts`)

```typescript
export async function analyzeRunReady(repoId: string): Promise<RunReadyReport>
export async function getRunReadyStatus(repoId: string): Promise<RunReadyReport>
export async function getRunReadyReport(repoId: string): Promise<RunReadyReport>
export async function getCertificate(repoId: string): Promise<FirstRunCertificate>
export async function createFixPR(repoId: string, fixes?: string[]): Promise<{ pr_url: string }>
export async function getRunReadyHistory(repoId: string): Promise<RunReadyReport[]>
```

### Zustand store (`frontend/src/lib/store.ts`)

Add `useRunReadyStore` for managing active analyses, reports, and polling state.

---

## GitHub Webhook Flow (PR Checks)

```
1. User opens PR on connected repo
2. GitHub sends webhook event to POST /api/runready/webhook
3. Backend verifies HMAC signature
4. Backend clones PR branch into temp dir
5. Runs full RunReady analysis pipeline
6. Posts PR comment:

   ┌────────────────────────────────────────────────┐
   │ 🔬 RunReady — Fresh Clone Status: ✅ PASSING   │
   │                                                │
   │ ✅ npm ci                        2.3s          │
   │ ✅ npm run build                 8.1s          │
   │ ✅ App starts on :3000           1.2s          │
   │ ✅ npm test                      4.7s          │
   │                                                │
   │ 📋 Certificate: https://docuverse.ai/rr/xxx   │
   └────────────────────────────────────────────────┘

   OR if failing:

   ┌────────────────────────────────────────────────┐
   │ 🔬 RunReady — Fresh Clone Status: ❌ FAILING   │
   │                                                │
   │ ✅ npm ci                        2.3s          │
   │ ❌ npm run build                 FAILED        │
   │    → Missing env var: DATABASE_URL             │
   │ ⏭ App start                     SKIPPED       │
   │ ⏭ npm test                      SKIPPED       │
   │                                                │
   │ 🔧 Fix available — click to create PR          │
   └────────────────────────────────────────────────┘

7. Optional: auto-create fix PR with generated artifacts
```

**Requires GitHub App** with permissions:
- `pull_requests: write` (post comments)
- `checks: write` (create check runs)
- `contents: read` (clone repo)

---

## Implementation Phases

| Phase | What | Files | Est. Hours |
|-------|------|-------|-----------|
| **1** | Data models + Config + Project Detector | `schemas.py`, `config.py`, `runready_detector.py` | 4h |
| **2** | CodeBuild service + Orchestrator + Persistence | `runready_codebuild.py`, `runready_service.py`, `persistence.py` | 3h |
| **3** | API endpoints + Route registration | `runready.py`, `routes.py` | 2h |
| **4** | Frontend pages + components + API client | `runready/page.tsx`, components, `api.ts`, `store.ts` | 5h |
| **5** | GitHub webhook + PR comment flow | `runready.py` webhook handler, GitHub App setup | 3h |
| **6** | Polish, error handling, infra docs | Testing, edge cases, docs | 2h |

**Total: ~19 hours**

---

## AWS Setup Checklist

- [ ] Create S3 bucket: `docuverse-runready-artifacts`
- [ ] Create CodeBuild project: `docuverse-runready`
  - Source: S3
  - Image: `aws/codebuild/amazonlinux-x86_64-standard:5.0`
  - Compute: `BUILD_GENERAL1_SMALL` (3 GB RAM, 2 vCPU)
  - Timeout: 10 minutes
  - Artifacts: S3
- [ ] Create DynamoDB table: `docusense_runready_reports`
  - PK: `repo_id` (String)
  - SK: `report_id` (String)
- [ ] Create IAM role for CodeBuild with S3 + CloudWatch access
- [ ] Add CodeBuild + S3 + CloudWatch permissions to backend IAM role
- [ ] Register GitHub App with webhook URL + required permissions
- [ ] Add env vars to backend `.env`:
  ```
  RUNREADY_CODEBUILD_PROJECT=docuverse-runready
  RUNREADY_S3_BUCKET=docuverse-runready-artifacts
  RUNREADY_GITHUB_APP_ID=...
  RUNREADY_GITHUB_APP_PRIVATE_KEY=...
  RUNREADY_GITHUB_WEBHOOK_SECRET=...
  ```

---

## Key Design Decisions

1. **CodeBuild over ECS Fargate** — Cheaper for ephemeral build jobs, native runtime versions, auto-teardown, no cluster management
2. **Dynamic buildspec** — Generated per-repo based on detected framework, not a one-size-fits-all script
3. **AI diagnosis via Bedrock** — Reuses existing `bedrock_client.py` infrastructure
4. **Follows existing patterns** — Same DynamoDB persistence pattern, same Pydantic model style, same API endpoint structure as Signal/Provenance features
5. **GitHub App (not just OAuth)** — Required for webhook events + PR comments; coexists with existing OAuth flow
