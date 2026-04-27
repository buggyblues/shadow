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
FROM node:22-alpine AS builder

WORKDIR /build

ARG OPENCLAW_VERSION=latest
ARG SHADOWOB_OPENCLAW_PLUGIN_VERSION=latest

# git is required by some npm packages during install
RUN apk add --no-cache git

# Install OpenClaw and shadowob plugin
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm init -y && \
    npm install --prefer-offline --no-audit --fund=false \
      "openclaw@${OPENCLAW_VERSION}" \
      "@shadowob/openclaw-shadowob@${SHADOWOB_OPENCLAW_PLUGIN_VERSION}"

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

# Overlay local Shadow packages after dependency installation. This keeps the
# heavy npm install layer cached while smoke tests iterate on plugin/SDK code,
# and prevents the local plugin from accidentally resolving an older published
# SDK from /app/node_modules.
COPY packages/shared /tmp/shadowob-shared
COPY packages/sdk /tmp/shadowob-sdk
COPY packages/openclaw-shadowob /tmp/openclaw-shadowob
RUN for pkg in shared sdk; do \
      if [ ! -f "/tmp/shadowob-${pkg}/dist/index.js" ]; then \
        echo "Missing packages/${pkg}/dist/index.js; build local Shadow packages before building this image."; \
        exit 1; \
      fi; \
      rm -rf "node_modules/@shadowob/${pkg}" && \
      mkdir -p "node_modules/@shadowob/${pkg}" && \
      cp -r "/tmp/shadowob-${pkg}/package.json" "/tmp/shadowob-${pkg}/dist" "node_modules/@shadowob/${pkg}/"; \
    done
RUN mkdir -p extensions/shadowob && \
    cp -r /tmp/openclaw-shadowob/* extensions/shadowob/ && \
    test -f extensions/shadowob/dist/index.js || \
      (echo "Missing packages/openclaw-shadowob/dist/index.js; build the local package before building this image." && exit 1) && \
    find extensions/shadowob -type d \( -name "src" -o -name "__tests__" \) \
      -exec rm -rf {} + 2>/dev/null || true

# ── Stage 2: Runner ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud OpenClaw Runner"

# Install runtime dependencies (rarely changes → good cache layer)
RUN apk add --no-cache curl tini

# Create non-root user openclaw:1000
# node:22-alpine ships with node:node at UID/GID 1000 — remove it first
RUN deluser node && \
    addgroup -g 1000 openclaw && \
    adduser -u 1000 -G openclaw -D openclaw

# Setup directories
WORKDIR /app
RUN mkdir -p /home/openclaw/.openclaw /etc/openclaw /var/log/openclaw /tmp/openclaw /tmp/npm-cache && \
    chown -R openclaw:openclaw /home/openclaw /var/log/openclaw /tmp/openclaw /tmp/npm-cache /app

# Copy stable OpenClaw runtime deps first. Keep local extensions out of this
# section so plugin edits do not invalidate runtime dependency warmup.
COPY --from=builder --chown=openclaw:openclaw /build/node_modules ./node_modules
COPY --from=builder --chown=openclaw:openclaw /build/package.json ./package.json

# Symlink openclaw to PATH (local install only, no global npm install)
RUN ln -s /app/node_modules/.bin/openclaw /usr/local/bin/openclaw

# Stage bundled plugin runtime deps in the image so the first real Buddy reply
# does not spend minutes installing optional tool/provider packages.
COPY --chown=openclaw:openclaw apps/cloud/images/openclaw-runner/warm-runtime-deps.mjs ./warm-runtime-deps.mjs
ENV OPENCLAW_PLUGIN_STAGE_DIR=/opt/openclaw-runtime-deps
ENV npm_config_cache=/tmp/npm-cache
RUN --mount=type=cache,target=/tmp/npm-cache,sharing=locked \
    mkdir -p /opt/openclaw-runtime-deps && \
    node /app/warm-runtime-deps.mjs && \
    chown -R openclaw:openclaw /opt/openclaw-runtime-deps

# Copy local extensions after dependency warmup. This layer changes frequently
# during plugin development, but the heavy npm/runtime dependency layers do not.
COPY --from=builder --chown=openclaw:openclaw /build/extensions ./extensions

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

# Run as non-root
USER openclaw

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "entrypoint.mjs"]
