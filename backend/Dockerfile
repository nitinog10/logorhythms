# ---- Node.js (Studio / App Studio live preview: npm install, next dev, tsx, etc.)
# Official image is multi-arch (amd64 + arm64) so App Runner / ECS / Graviton work.
FROM node:22-bookworm-slim AS nodejs

# ---- Python API ----
FROM python:3.11-slim AS base

# Prevent Python from buffering stdout/stderr (useful for logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    PREVIEW_WORKSPACE=/app/workspace \
    REPOS_DIRECTORY=/app/repos

# Node on PATH for subprocess previews (matches local dev behavior)
COPY --from=nodejs /usr/local/bin/node /usr/local/bin/node
COPY --from=nodejs /usr/local/bin/npm /usr/local/bin/npm
COPY --from=nodejs /usr/local/bin/npx /usr/local/bin/npx
COPY --from=nodejs /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN node --version && npm --version

# Install system dependencies:
#  - git: required by GitPython for cloning repos
#  - build-essential: C compiler for tree-sitter native extensions
#  - curl: health-checks
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Dependencies ----
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---- Application code ----
COPY . .

# Writable dirs: clones (empty in image — runtime population), Studio workspace,
# persisted Studio sessions when DynamoDB is not used
RUN mkdir -p repos workspace workspace/_studio_sessions \
    && chmod -R u+rwX repos workspace

# AWS App Runner / ECS injects PORT; default above is 8000
EXPOSE ${PORT}

# Production server: gunicorn with uvicorn workers
CMD gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT} \
    --workers 1 \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5
