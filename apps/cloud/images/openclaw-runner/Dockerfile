# syntax=docker/dockerfile:1.7

# ─── OpenClaw Runner ──────────────────────────────────────────────────────
# Container image for OpenClaw gateway runtime.
#
# User:   openclaw:1000
# Home:   /home/openclaw
# State:  /home/openclaw/.openclaw   (emptyDir mount)
# Config: /etc/openclaw              (ConfigMap mount, read-only)
# Logs:   /var/log/openclaw          (emptyDir mount)
#
# Build from the repository root so the image can include the local
# packages/openclaw-shadowob build:
#   docker build -t ghcr.io/buggyblues/openclaw-runner:latest \
#     -f apps/cloud/images/openclaw-runner/Dockerfile .
# ──────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /build

ARG OPENCLAW_VERSION=2026.4.24
ARG SHADOWOB_OPENCLAW_PLUGIN_VERSION=latest
ARG PLAYWRIGHT_VERSION=latest

# git is required by some npm packages during install. Enable pnpm here so the
# local Shadow workspace packages are built inside the image, not copied as
# host-generated dist artifacts.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack prepare pnpm@10.19.0 --activate

# Install OpenClaw and the published shadowob plugin first. This provides a
# stable runtime dependency layer; local package source changes below only
# invalidate the small workspace build and overlay layers.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm init -y && \
    npm install --prefer-offline --no-audit --fund=false \
      "openclaw@${OPENCLAW_VERSION}" \
      "@shadowob/openclaw-shadowob@${SHADOWOB_OPENCLAW_PLUGIN_VERSION}" \
      "playwright-core@${PLAYWRIGHT_VERSION}"

# Cleanup dev artifacts to reduce image size. This depends only on npm deps,
# so local plugin edits do not force the dependency install/cleanup layers.
RUN find node_modules -type d \( -name ".github" -o -name "test" -o -name "tests" \
      -o -name "__tests__" -o -name "examples" \) \
      -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "docs" ! -path "*/openclaw/docs*" \
      -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules \( -name "*.d.ts" -o -name "*.d.ts.map" -o -name "*.js.map" \
      -o -name "CHANGELOG.md" -o -name "README.md" \) \
      -delete 2>/dev/null || true

# Install the minimal workspace needed to build the local Shadow plugin. Copy
# only lockfiles and manifests first so dependency resolution stays cached while
# TypeScript source changes.
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/openclaw-shadowob/package.json packages/openclaw-shadowob/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts --filter @shadowob/openclaw-shadowob...

# Build local packages in-container. This makes the image reproducible in CI and
# keeps it independent from whatever dist/ happens to exist on the host.
COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY packages/openclaw-shadowob packages/openclaw-shadowob
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm --filter @shadowob/shared build && \
    pnpm --filter @shadowob/sdk build && \
    pnpm --filter @shadowob/openclaw-shadowob build

# Overlay the freshly built local Shadow packages into the runtime dependency
# tree, preventing the bundled extension from resolving older published code.
WORKDIR /build
RUN for pkg in shared sdk; do \
      rm -rf "node_modules/@shadowob/${pkg}" && \
      mkdir -p "node_modules/@shadowob/${pkg}" && \
      cp -r "/workspace/packages/${pkg}/package.json" "/workspace/packages/${pkg}/dist" "node_modules/@shadowob/${pkg}/"; \
    done
RUN mkdir -p extensions/shadowob && \
    cp -r /workspace/packages/openclaw-shadowob/package.json \
      /workspace/packages/openclaw-shadowob/openclaw.plugin.json \
      /workspace/packages/openclaw-shadowob/dist \
      /workspace/packages/openclaw-shadowob/skills \
      extensions/shadowob/

# ── Stage 2: Runner ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud OpenClaw Runner"

ARG PLAYWRIGHT_VERSION=latest

# Install runtime dependencies (rarely changes → good cache layer). Chromium
# and Playwright browsers are intentionally baked into the image so OpenClaw
# browser/canvas tools do not try to bootstrap them after the gateway is live.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      chromium-driver \
      curl \
      fonts-liberation \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      git \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      python-is-python3 \
      python3 \
      python3-pip \
      python3-venv \
      tini \
      xdg-utils && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /ms-playwright && \
    npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium && \
    chmod -R 755 /ms-playwright

# Create non-root user openclaw:1000
# node images ship with node:node at UID/GID 1000 — remove it first
RUN userdel -r node 2>/dev/null || true; \
    groupdel node 2>/dev/null || true; \
    groupadd -g 1000 openclaw; \
    useradd -u 1000 -g openclaw -m -d /home/openclaw -s /usr/sbin/nologin openclaw

# Setup directories
WORKDIR /app
RUN mkdir -p /home/openclaw/.openclaw /etc/openclaw /var/log/openclaw /tmp/openclaw /tmp/npm-cache && \
    chown -R openclaw:openclaw /home/openclaw /var/log/openclaw /tmp/openclaw /tmp/npm-cache /app

# Copy stable OpenClaw runtime deps first.
COPY --from=builder --chown=openclaw:openclaw /build/node_modules ./node_modules
COPY --from=builder --chown=openclaw:openclaw /build/package.json ./package.json

# Symlink openclaw to PATH (local install only, no global npm install)
RUN ln -s /app/node_modules/.bin/openclaw /usr/local/bin/openclaw

# Copy local extensions before dependency warmup so the image carries the exact
# plugin runtime dependency set used at startup. The extension layer is still
# after node_modules, so ordinary plugin edits do not invalidate the large
# pnpm install/build layers.
COPY --from=builder --chown=openclaw:openclaw /build/extensions ./extensions

# Stage bundled plugin runtime deps in the image so the first real Buddy reply
# does not spend minutes installing optional tool/provider packages.
COPY --chown=openclaw:openclaw apps/cloud/images/openclaw-runner/warm-runtime-deps.mjs ./warm-runtime-deps.mjs
ENV OPENCLAW_PLUGIN_STAGE_DIR=/opt/openclaw-runtime-deps
ENV npm_config_cache=/tmp/npm-cache
RUN --mount=type=cache,target=/tmp/npm-cache,sharing=locked \
    mkdir -p /opt/openclaw-runtime-deps && \
    node /app/warm-runtime-deps.mjs && \
    chown -R openclaw:openclaw /opt/openclaw-runtime-deps

# Copy entrypoint (small, changes often → last COPY for cache)
COPY --chown=openclaw:openclaw apps/cloud/images/openclaw-runner/entrypoint.mjs ./entrypoint.mjs

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENV NODE_ENV=production
ENV OPENCLAW_HEALTH_PORT=3100
ENV OPENCLAW_GATEWAY_PORT=3101
ENV OPENCLAW_NO_RESPAWN=1
ENV OPENCLAW_PLUGIN_STAGE_DIR=/opt/openclaw-runtime-deps
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run as non-root
USER openclaw

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "entrypoint.mjs"]
