# syntax=docker/dockerfile:1.7

# ─── Claude Runner ────────────────────────────────────────────────────────
# Native cc-connect runner for Claude Code.
#
# Build from the repository root:
#   docker build -t ghcr.io/buggyblues/claude-runner:latest \
#     -f apps/cloud/images/claude-runner/Dockerfile .
# ──────────────────────────────────────────────────────────────────────────

FROM golang:1.25-alpine AS cc-builder

ARG CC_CONNECT_REF=9d0e7f8b951d12ab61173302149fbb09115f5523
ARG CC_CONNECT_REPO=https://github.com/buggyblues/cc-connect.git

WORKDIR /build

RUN apk add --no-cache ca-certificates git

RUN --mount=type=cache,id=go-build,target=/root/.cache/go-build,sharing=locked \
    --mount=type=cache,id=go-mod,target=/go/pkg/mod,sharing=locked \
    git clone --depth 1 "${CC_CONNECT_REPO}" /tmp/cc-connect && \
    cd /tmp/cc-connect && \
    git fetch --depth 1 origin "${CC_CONNECT_REF}" && \
    git checkout "${CC_CONNECT_REF}" && \
    CGO_ENABLED=0 go build \
      -tags "no_web no_acp no_cursor no_devin no_iflow no_kimi no_qoder no_feishu no_telegram no_discord no_slack no_dingtalk no_wecom no_weixin no_qq no_qqbot no_line no_weibo" \
      -ldflags "-s -w" \
      -o /build/cc-connect ./cmd/cc-connect

FROM node:22-bookworm-slim AS shadow-packages

WORKDIR /workspace

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .npmrc ./
COPY patches patches
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/connector/package.json packages/connector/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter @shadowob/shared... \
      --filter @shadowob/sdk... \
      --filter @shadowob/cli... \
      --filter @shadowob/connector...

COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY packages/cli packages/cli
COPY packages/connector packages/connector

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm --filter @shadowob/shared build && \
    pnpm --filter @shadowob/sdk build && \
    pnpm --filter @shadowob/cli build && \
    pnpm --filter @shadowob/connector build

RUN mkdir -p /shadow-pkgs && \
    pnpm --filter @shadowob/shared pack --pack-destination /shadow-pkgs && \
    pnpm --filter @shadowob/sdk pack --pack-destination /shadow-pkgs && \
    pnpm --filter @shadowob/cli pack --pack-destination /shadow-pkgs && \
    pnpm --filter @shadowob/connector pack --pack-destination /shadow-pkgs

FROM node:22-bookworm-slim AS node-deps

WORKDIR /build

ARG CLAUDE_CODE_VERSION=2.1.162

COPY --from=shadow-packages /shadow-pkgs /tmp/shadow-pkgs

RUN npm init -y && \
    npm install --no-audit --fund=false \
      @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
      /tmp/shadow-pkgs/shadowob-shared-*.tgz \
      /tmp/shadow-pkgs/shadowob-sdk-*.tgz \
      /tmp/shadow-pkgs/shadowob-cli-*.tgz \
      /tmp/shadow-pkgs/shadowob-connector-*.tgz && \
    rm -rf /tmp/shadow-pkgs

FROM node:22-bookworm-slim AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud Claude Runner (cc-connect + Claude Code)"

ARG PLAYWRIGHT_VERSION=1.59.1

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY apps/cloud/images/install-browser-runtime.sh /usr/local/bin/install-browser-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl git tini && \
    rm -rf /var/lib/apt/lists/* && \
    chmod +x /usr/local/bin/install-browser-runtime && \
    PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION}" install-browser-runtime

RUN userdel -r node 2>/dev/null || true; \
    groupdel node 2>/dev/null || true; \
    groupadd -g 1000 shadow; \
    useradd -u 1000 -g shadow -m -d /home/shadow -s /usr/sbin/nologin shadow

WORKDIR /app
RUN mkdir -p /home/shadow/.cc-connect /home/shadow/.claude /etc/openclaw /etc/shadowob \
             /var/log/shadowob /workspace /tmp/npm-cache && \
    ln -s /home/shadow /home/openclaw && \
    chown -R shadow:shadow /home/shadow /etc/shadowob /var/log/shadowob \
      /workspace /tmp/npm-cache /app

COPY --from=node-deps --chown=shadow:shadow /build/node_modules ./node_modules
COPY --from=node-deps --chown=shadow:shadow /build/package.json ./package.json
COPY --from=cc-builder /build/cc-connect /usr/local/bin/cc-connect

RUN ln -s /app/node_modules/.bin/claude /usr/local/bin/claude && \
    ln -s /app/node_modules/.bin/shadowob /usr/local/bin/shadowob && \
    ln -s /app/node_modules/.bin/shadowob-connector /usr/local/bin/shadowob-connector

COPY --chown=shadow:shadow apps/cloud/images/cc-connect-runner/entrypoint.mjs /app/entrypoint.mjs

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENV NODE_ENV=production
ENV HOME=/home/shadow
ENV SHADOW_RUNNER_HEALTH_PORT=3100
ENV OPENCLAW_NO_RESPAWN=1
ENV SHADOW_RUNNER_NAME=claude-runner
ENV CLAUDE_CONFIG_DIR=/home/shadow/.claude
ENV npm_config_cache=/tmp/npm-cache
ENV CHROME_BIN=/usr/bin/chromium-headless-shell
ENV CHROMIUM_PATH=/usr/bin/chromium-headless-shell
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell
ENV CHROME_FLAGS="--no-sandbox --disable-gpu --disable-software-rasterizer --single-process --disable-dev-shm-usage"
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-software-rasterizer --single-process --disable-dev-shm-usage"
ENV PUPPETEER_ARGS='["--no-sandbox","--disable-gpu","--disable-software-rasterizer","--single-process","--disable-dev-shm-usage"]'

USER shadow

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/entrypoint.mjs"]
