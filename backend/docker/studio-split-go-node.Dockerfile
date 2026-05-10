# Go + Node 20 companion for Studio *split* previews (Next/Vite frontend + Go API workspace).
#
# Build from the backend directory:
#   docker build -f docker/studio-split-go-node.Dockerfile -t gitforge-studio-split-go-node:local docker
#
# backend/.env:
#   STUDIO_RUNTIME_DOCKER_SPLIT_NODE_GO_IMAGE=gitforge-studio-split-go-node:local

FROM golang:1.22-bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; \
    apt-get install -y --no-install-recommends nodejs; \
    rm -rf /var/lib/apt/lists/*
