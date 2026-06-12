# syntax=docker/dockerfile:1.7

# ─── OpenClaw Runner ──────────────────────────────────────────────────────
# Container image for OpenClaw gateway runtime.
#
# User:   shadow:1000
# Home:   /home/shadow
# State:  /home/shadow/.openclaw   (emptyDir mount)
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

ARG OPENCLAW_VERSION=2026.6.5
ARG SHADOWOB_OPENCLAW_PLUGIN_VERSION=latest
ARG PLAYWRIGHT_VERSION=1.59.1

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
COPY patches patches
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/connector/package.json packages/connector/package.json
COPY packages/openclaw-shadowob/package.json packages/openclaw-shadowob/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter @shadowob/openclaw-shadowob... \
      --filter @shadowob/cli... \
      --filter @shadowob/connector...

# Build local packages in-container. This makes the image reproducible in CI and
# keeps it independent from whatever dist/ happens to exist on the host.
COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY packages/cli packages/cli
COPY packages/connector packages/connector
COPY packages/openclaw-shadowob packages/openclaw-shadowob
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm --filter @shadowob/shared build && \
    pnpm --filter @shadowob/sdk build && \
    pnpm --filter @shadowob/cli build && \
    pnpm --filter @shadowob/connector build && \
    pnpm --filter @shadowob/openclaw-shadowob build

RUN mkdir -p /workspace/shadow-pkgs && \
    pnpm --filter @shadowob/shared pack --pack-destination /workspace/shadow-pkgs && \
    pnpm --filter @shadowob/sdk pack --pack-destination /workspace/shadow-pkgs && \
    pnpm --filter @shadowob/cli pack --pack-destination /workspace/shadow-pkgs && \
    pnpm --filter @shadowob/connector pack --pack-destination /workspace/shadow-pkgs

# Overlay the freshly built local Shadow packages into the runtime dependency
# tree, preventing the bundled extension from resolving older published code.
WORKDIR /build
RUN npm install --no-audit --fund=false \
      /workspace/shadow-pkgs/shadowob-shared-*.tgz \
      /workspace/shadow-pkgs/shadowob-sdk-*.tgz \
      /workspace/shadow-pkgs/shadowob-cli-*.tgz \
      /workspace/shadow-pkgs/shadowob-connector-*.tgz && \
    rm -rf /workspace/shadow-pkgs
RUN for pkg in shared sdk cli; do \
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

ARG PLAYWRIGHT_VERSION=1.59.1

# Install runtime dependencies (rarely changes → good cache layer). Chromium
# and Playwright browsers are intentionally baked into the image so OpenClaw
# browser/canvas tools do not try to bootstrap them after the gateway is live.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY apps/cloud/images/install-browser-runtime.sh /usr/local/bin/install-browser-runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      python-is-python3 \
      python3 \
      python3-pip \
      python3-venv \
      tini && \
    rm -rf /var/lib/apt/lists/* && \
    chmod +x /usr/local/bin/install-browser-runtime && \
    PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION}" install-browser-runtime

# Create non-root user shadow:1000
# node images ship with node:node at UID/GID 1000 — remove it first
RUN userdel -r node 2>/dev/null || true; \
    groupdel node 2>/dev/null || true; \
    groupadd -g 1000 shadow; \
    useradd -u 1000 -g shadow -m -d /home/shadow -s /usr/sbin/nologin shadow

# Setup directories
WORKDIR /app
RUN mkdir -p /home/shadow/.openclaw /etc/openclaw /etc/shadowob /var/log/openclaw \
      /workspace /tmp/openclaw /tmp/npm-cache && \
    ln -s /home/shadow /home/openclaw && \
    chown -R shadow:shadow /home/shadow /etc/shadowob /var/log/openclaw \
      /workspace /tmp/openclaw /tmp/npm-cache /app

# Copy stable OpenClaw runtime deps first.
COPY --from=builder --chown=shadow:shadow /build/node_modules ./node_modules
COPY --from=builder --chown=shadow:shadow /build/package.json ./package.json

# Symlink openclaw to PATH (local install only, no global npm install)
RUN ln -s /app/node_modules/.bin/openclaw /usr/local/bin/openclaw && \
    ln -s /app/node_modules/.bin/shadowob /usr/local/bin/shadowob && \
    ln -s /app/node_modules/.bin/shadowob-connector /usr/local/bin/shadowob-connector

# Precompute OpenClaw's default workspace bootstrap during image build. The
# entrypoint copies these files into the writable state volume instead of paying
# the `openclaw setup` cost on every Pod cold start.
RUN mkdir -p /opt/openclaw/bootstrap-workspace /tmp/openclaw-bootstrap && \
    printf '{"gateway":{"mode":"local","auth":{"mode":"none"}}}\n' \
      > /tmp/openclaw-bootstrap/config.json && \
    HOME=/home/shadow \
    OPENCLAW_STATE_DIR=/tmp/openclaw-bootstrap/state \
    OPENCLAW_CONFIG_PATH=/tmp/openclaw-bootstrap/config.json \
    openclaw setup --workspace /opt/openclaw/bootstrap-workspace && \
    rm -rf /tmp/openclaw-bootstrap && \
    chown -R shadow:shadow /opt/openclaw

# Copy local extensions before dependency warmup so the image carries the exact
# plugin runtime dependency set used at startup. The extension layer is still
# after node_modules, so ordinary plugin edits do not invalidate the large
# pnpm install/build layers.
COPY --from=builder --chown=shadow:shadow /build/extensions ./extensions

# The OpenClaw plugin loader falls back to jiti source transforms when a plugin
# entry imports openclaw/plugin-sdk by package subpath. Cloud images already know
# the host package layout, so rewrite the built plugin artifacts to import the
# baked OpenClaw SDK files directly and keep startup on Node's native loader.
RUN node -e "const fs=require('fs'); const path=require('path'); const dir='/app/extensions/shadowob/dist'; const replacements=new Map([['openclaw/plugin-sdk/core','../../../node_modules/openclaw/dist/plugin-sdk/core.js'],['openclaw/plugin-sdk/runtime-store','../../../node_modules/openclaw/dist/plugin-sdk/runtime-store.js'],['openclaw/plugin-sdk/channel-reply-pipeline','../../../node_modules/openclaw/dist/plugin-sdk/channel-reply-pipeline.js'],['openclaw/plugin-sdk','../../../node_modules/openclaw/dist/plugin-sdk/index.js']]); for (const name of fs.readdirSync(dir)) { if (!name.endsWith('.js')) continue; const file=path.join(dir,name); let source=fs.readFileSync(file,'utf8'); for (const [from,to] of replacements) { source=source.replaceAll('from \"'+from+'\"','from \"'+to+'\"').replaceAll(\"from '\"+from+\"'\",\"from '\"+to+\"'\"); } fs.writeFileSync(file,source); }"

# Copy entrypoint (small, changes often → last COPY for cache)
COPY --chown=shadow:shadow apps/cloud/images/openclaw-runner/entrypoint.mjs ./entrypoint.mjs

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENV NODE_ENV=production
ENV HOME=/home/shadow
ENV OPENCLAW_HEALTH_PORT=3100
ENV OPENCLAW_GATEWAY_PORT=3101
ENV OPENCLAW_NO_RESPAWN=1
ENV OPENCLAW_SKIP_STARTUP_MODEL_PREWARM=1
ENV CHROME_BIN=/usr/bin/chromium-headless-shell
ENV CHROMIUM_PATH=/usr/bin/chromium-headless-shell
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell

# Run as non-root
USER shadow

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "entrypoint.mjs"]
