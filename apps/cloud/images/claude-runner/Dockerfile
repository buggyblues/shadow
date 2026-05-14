# syntax=docker/dockerfile:1.7

# ─── Claude Runner ────────────────────────────────────────────────────────
# Native cc-connect runner for Claude Code.
#
# Build from the repository root:
#   docker build -t ghcr.io/buggyblues/claude-runner:latest \
#     -f apps/cloud/images/claude-runner/Dockerfile .
# ──────────────────────────────────────────────────────────────────────────

FROM golang:1.25-bookworm AS cc-builder

ARG CC_CONNECT_REF=63b5d59127b3004bc7002f2d51892b1f2a91ea83
ARG CC_CONNECT_REPO=https://github.com/buggyblues/cc-connect.git

WORKDIR /build

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 "${CC_CONNECT_REPO}" /tmp/cc-connect && \
    cd /tmp/cc-connect && \
    git fetch --depth 1 origin "${CC_CONNECT_REF}" && \
    git checkout "${CC_CONNECT_REF}" && \
    CGO_ENABLED=0 go build \
      -tags "no_web no_acp no_cursor no_devin no_iflow no_kimi no_qoder no_feishu no_telegram no_discord no_slack no_dingtalk no_wecom no_weixin no_qq no_qqbot no_line no_weibo" \
      -ldflags "-s -w" \
      -o /build/cc-connect ./cmd/cc-connect

FROM node:22-bookworm-slim AS node-deps

WORKDIR /build

RUN npm init -y && \
    npm install --no-audit --fund=false \
      @anthropic-ai/claude-code@latest \
      @shadowob/cli@latest \
      @shadowob/connector@latest

FROM node:22-bookworm-slim AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud Claude Runner (cc-connect + Claude Code)"

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl git tini && \
    rm -rf /var/lib/apt/lists/*

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

USER shadow

ENTRYPOINT ["tini", "--"]
CMD ["node", "/app/entrypoint.mjs"]
