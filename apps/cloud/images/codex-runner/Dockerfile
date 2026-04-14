# ─── Codex Runner ─────────────────────────────────────────────────────────
# Container image for OpenAI Codex agent runtime.
# OpenClaw gateway → ACPX plugin → Codex CLI process.
#
# User:   openclaw:1000
# Home:   /home/openclaw
# State:  /home/openclaw/.openclaw   (emptyDir mount)
# Config: /etc/openclaw              (ConfigMap mount, read-only)
# Logs:   /var/log/openclaw          (emptyDir mount)
#
# Build: docker build -t ghcr.io/shadowob/codex-runner:latest .
# ──────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Install OpenClaw, Codex CLI, and Shadow plugin
RUN npm init -y && \
    npm install openclaw@latest @openai/codex@latest \
                @shadowob/openclaw-shadowob@latest && \
    # Setup extensions directories
    mkdir -p extensions/shadowob && \
    cp -r node_modules/@shadowob/openclaw-shadowob/* extensions/shadowob/ && \
    # Clean up dev artifacts
    # NOTE: preserve openclaw/docs/reference/templates — OpenClaw needs these at runtime
    find node_modules -type d \( -name ".github" -o -name "test" -o -name "tests" \
      -o -name "__tests__" -o -name "examples" \) \
      -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "docs" ! -path "*/openclaw/docs*" \
      -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules \( -name "CHANGELOG.md" -o -name "README.md" \) \
      -delete 2>/dev/null || true

# ── Stage 2: Runner ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud Codex Runner (OpenClaw + ACP + Codex)"

# Install runtime dependencies — git required for Codex
RUN apk add --no-cache curl tini git

# Create non-root user openclaw:1000
# node:22-alpine ships with node:node at UID/GID 1000 — remove it first
RUN deluser node && \
    addgroup -g 1000 openclaw && \
    adduser -u 1000 -G openclaw -D openclaw

# Setup directories
WORKDIR /app
RUN mkdir -p /home/openclaw/.openclaw /etc/openclaw /var/log/openclaw \
             /workspace /tmp/openclaw && \
    chown -R openclaw:openclaw /home/openclaw /var/log/openclaw /workspace /tmp/openclaw /app

# Copy from builder (large layer, changes when deps update)
COPY --from=builder --chown=openclaw:openclaw /build/node_modules ./node_modules
COPY --from=builder --chown=openclaw:openclaw /build/extensions ./extensions
COPY --from=builder --chown=openclaw:openclaw /build/package.json ./package.json

# Symlink CLIs to PATH (local install only, no global npm install)
RUN ln -s /app/node_modules/.bin/openclaw /usr/local/bin/openclaw && \
    ln -s /app/node_modules/.bin/codex /usr/local/bin/codex

# Copy entrypoint (small, changes often → last COPY for cache)
COPY --chown=openclaw:openclaw entrypoint.mjs /app/entrypoint.mjs

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENV NODE_ENV=production
ENV OPENCLAW_GATEWAY_PORT=3100
ENV OPENCLAW_NO_RESPAWN=1

# Run as non-root
USER openclaw

ENTRYPOINT ["tini", "--"]
CMD ["node", "/app/entrypoint.mjs"]
