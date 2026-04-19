# ============================================================================
# Flash All-in-One
# Frontend UI + API Server + OpenClaw Gateway + workspace
#
# Architecture:
#   Port 8080 — Hono API server (serves static UI + proxies to OpenClaw)
#   Port 3100 — OpenClaw Gateway (internal, not exposed)
#
# Build:
#   docker build -t flash-aio -f docker/Dockerfile .
#
# Run:
#   docker run -p 8080:8080 \
#     -e OPENCLAW_LLM_API_KEY=sk-xxx \
#     -e OPENCLAW_LLM_MODEL=deepseek-chat \
#     -v /tmp/output:/output \
#     flash-aio
# ============================================================================

# ---- Stage 1: Build all packages ----
FROM node:22-bookworm-slim AS build
WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./

# Copy package.json files for all packages
COPY packages/types/package.json packages/types/tsconfig.json packages/types/
COPY packages/cards/package.json packages/cards/tsconfig.json packages/cards/
COPY packages/server/package.json packages/server/tsconfig.json packages/server/
COPY packages/ui/package.json packages/ui/tsconfig.json packages/ui/tsconfig.app.json packages/ui/vite.config.ts packages/ui/

# Install all dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/types/src/ packages/types/src/
COPY packages/cards/src/ packages/cards/src/
COPY packages/server/src/ packages/server/src/
COPY packages/ui/src/ packages/ui/src/
COPY packages/ui/index.html packages/ui/
COPY packages/ui/public/ packages/ui/public/

# Build types first, then cards, then server and UI
RUN cd packages/types && pnpm build
RUN cd packages/cards && pnpm build
RUN cd packages/server && pnpm build
RUN cd packages/ui && pnpm build

# Prune to production deps (kept in pnpm virtual store, installed fresh in runtime)

# ---- Stage 2: Runtime ----
FROM node:22-bookworm-slim

# Runtime native libs + fonts + utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libjpeg62-turbo \
    libpango-1.0-0 libpangocairo-1.0-0 \
    libgif7 libpixman-1-0 librsvg2-2 \
    fonts-noto-cjk fonts-noto-color-emoji \
    curl tini xxd git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- Install OpenClaw globally ----
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global url."https://".insteadOf "git://"
RUN npm install -g openclaw@latest && npm cache clean --force

WORKDIR /app

# ---- Frontend UI (from build stage) ----
COPY --from=build /build/packages/ui/dist /app/ui

# ---- API Server (compiled) ----
COPY --from=build /build/packages/server/dist /app/server/dist
COPY --from=build /build/packages/server/package.json /app/server/

# ---- Types package (placed in node_modules for Node resolution) ----
COPY --from=build /build/packages/types/dist /app/node_modules/@shadowob/flash-types/dist
COPY --from=build /build/packages/types/package.json /app/node_modules/@shadowob/flash-types/

# ---- Install server production deps (remove workspace dep first, then npm install) ----
RUN cd /app/server \
    && npm pkg delete dependencies["@shadowob/flash-types"] \
    && npm install --production --no-package-lock

# ---- Agent workspace ----
COPY packages/agent/ /app/workspace/

# ---- OpenClaw config ----
RUN mkdir -p /root/.openclaw && cat > /root/.openclaw/openclaw.json <<'OCJSON'
{
  "agents": {
    "defaults": {
      "workspace": "/app/workspace",
      "compaction": { "mode": "safeguard" },
      "timeoutSeconds": 600,
      "subagents": {
        "maxSpawnDepth": 2,
        "maxChildrenPerAgent": 5,
        "runTimeoutSeconds": 300
      }
    }
  },
  "tools": { "profile": "full" },
  "gateway": {
    "port": 3100,
    "mode": "local",
    "bind": "lan",
    "auth": { "mode": "token" },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  },
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": { "boot-md": { "enabled": true } }
    }
  }
}
OCJSON

# ---- Entrypoint ----
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /output /data/projects
VOLUME ["/output", "/data"]

WORKDIR /app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:8080/api/health || exit 1

ENTRYPOINT ["tini", "--", "/entrypoint.sh"]

LABEL org.opencontainers.image.title="Flash All-in-One"
LABEL org.opencontainers.image.description="Frontend UI + API Server + OpenClaw Gateway — AI-powered knowledge cards platform"
LABEL org.opencontainers.image.version="1.0.0"
