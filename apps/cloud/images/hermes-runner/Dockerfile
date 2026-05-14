# syntax=docker/dockerfile:1.7

# ─── Hermes Runner ────────────────────────────────────────────────────────
# Native Hermes gateway runner with ShadowOB plugin materialized by Cloud.
#
# Build from the repository root:
#   docker build -t ghcr.io/buggyblues/hermes-runner:latest \
#     -f apps/cloud/images/hermes-runner/Dockerfile .
# ──────────────────────────────────────────────────────────────────────────

FROM nousresearch/hermes-agent:latest AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud Hermes Runner"

ARG NODE_VERSION=22.21.1

USER root

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl xz-utils && \
    rm -rf /var/lib/apt/lists/* && \
    arch="$(dpkg --print-architecture)" && \
    case "$arch" in \
      amd64) node_arch="x64" ;; \
      arm64) node_arch="arm64" ;; \
      *) echo "Unsupported architecture for Node.js: $arch" >&2; exit 1 ;; \
    esac && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
      -o /tmp/node.tar.xz && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && \
    rm -f /tmp/node.tar.xz && \
    node --version

RUN npm init -y && \
    npm install --no-audit --fund=false @shadowob/cli@latest @shadowob/connector@latest && \
    ln -sf /opt/hermes/.venv/bin/hermes /usr/local/bin/hermes && \
    ln -s /app/node_modules/.bin/shadowob /usr/local/bin/shadowob && \
    ln -s /app/node_modules/.bin/shadowob-connector /usr/local/bin/shadowob-connector

RUN existing_user="$(getent passwd 1000 | cut -d: -f1 || true)" && \
    if [ -n "$existing_user" ]; then \
      if command -v groupmod >/dev/null 2>&1; then groupmod -n shadow "$existing_user" 2>/dev/null || true; fi; \
      usermod -l shadow -d /home/shadow -m "$existing_user" 2>/dev/null || true; \
    else \
      groupadd -g 1000 shadow 2>/dev/null || groupadd shadow; \
      useradd -u 1000 -g shadow -m -d /home/shadow -s /usr/sbin/nologin shadow; \
    fi && \
    mkdir -p /home/shadow/.hermes /etc/openclaw /etc/shadowob /var/log/shadowob \
             /workspace /tmp/npm-cache && \
    if [ ! -e /home/openclaw ]; then ln -s /home/shadow /home/openclaw; fi && \
    chown -R 1000:1000 /home/shadow /etc/shadowob /var/log/shadowob \
      /workspace /tmp/npm-cache /app

COPY --chown=1000:1000 apps/cloud/images/hermes-runner/entrypoint.mjs /app/entrypoint.mjs

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENV NODE_ENV=production
ENV HOME=/home/shadow
ENV SHADOW_RUNNER_HEALTH_PORT=3100
ENV OPENCLAW_NO_RESPAWN=1
ENV HERMES_HOME=/home/shadow/.hermes
ENV npm_config_cache=/tmp/npm-cache

USER shadow

ENTRYPOINT ["tini", "--"]
CMD ["node", "/app/entrypoint.mjs"]
