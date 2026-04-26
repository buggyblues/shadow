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

# git is required by some npm packages during install
RUN apk add --no-cache git
COPY packages/openclaw-shadowob /tmp/openclaw-shadowob

# Install OpenClaw and shadowob plugin
RUN npm init -y && \
    npm install openclaw@latest @shadowob/openclaw-shadowob@latest && \
    # Setup extensions directory
    mkdir -p extensions/shadowob && \
    cp -r /tmp/openclaw-shadowob/* extensions/shadowob/ && \
    test -f extensions/shadowob/dist/index.js || \
      (echo "Missing packages/openclaw-shadowob/dist/index.js; build the local package before building this image." && exit 1) && \
    find extensions/shadowob -type d \( -name "src" -o -name "__tests__" \) \
      -exec rm -rf {} + 2>/dev/null || true && \
    # Cleanup dev artifacts to reduce image size
    # NOTE: preserve openclaw/docs/reference/templates — OpenClaw needs these at runtime
    find node_modules -type d \( -name ".github" -o -name "test" -o -name "tests" \
      -o -name "__tests__" -o -name "examples" \) \
      -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "docs" ! -path "*/openclaw/docs*" \
      -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules \( -name "*.d.ts" -o -name "*.d.ts.map" -o -name "*.js.map" \
      -o -name "CHANGELOG.md" -o -name "README.md" \) \
      -delete 2>/dev/null || true

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
RUN mkdir -p /home/openclaw/.openclaw /etc/openclaw /var/log/openclaw /tmp/openclaw && \
    chown -R openclaw:openclaw /home/openclaw /var/log/openclaw /tmp/openclaw /app

# Copy from builder (large layer, changes when deps update)
COPY --from=builder --chown=openclaw:openclaw /build/node_modules ./node_modules
COPY --from=builder --chown=openclaw:openclaw /build/extensions ./extensions
COPY --from=builder --chown=openclaw:openclaw /build/package.json ./package.json

# Symlink openclaw to PATH (local install only, no global npm install)
RUN ln -s /app/node_modules/.bin/openclaw /usr/local/bin/openclaw

# Stage bundled plugin runtime deps in the image so the first real Buddy reply
# does not spend minutes installing optional tool/provider packages.
COPY --chown=openclaw:openclaw apps/cloud/images/openclaw-runner/warm-runtime-deps.mjs ./warm-runtime-deps.mjs
ENV OPENCLAW_PLUGIN_STAGE_DIR=/opt/openclaw-runtime-deps
RUN mkdir -p /opt/openclaw-runtime-deps /tmp/npm-cache && \
    node /app/warm-runtime-deps.mjs && \
    chown -R openclaw:openclaw /opt/openclaw-runtime-deps /tmp/npm-cache

# Copy entrypoint (small, changes often → last COPY for cache)
COPY --chown=openclaw:openclaw apps/cloud/images/openclaw-runner/entrypoint.mjs ./entrypoint.mjs

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENV NODE_ENV=production
ENV OPENCLAW_GATEWAY_PORT=3100
ENV OPENCLAW_NO_RESPAWN=1
ENV OPENCLAW_PLUGIN_STAGE_DIR=/opt/openclaw-runtime-deps

# Run as non-root
USER openclaw

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "entrypoint.mjs"]
