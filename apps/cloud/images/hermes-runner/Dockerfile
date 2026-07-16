# syntax=docker/dockerfile:1.7

# ─── Hermes Runner ────────────────────────────────────────────────────────
# Native Hermes gateway runner with ShadowOB connector prepared in the image.
#
# Build from the repository root:
#   docker build -t ghcr.io/buggyblues/hermes-runner:latest \
#     -f apps/cloud/images/hermes-runner/Dockerfile .
# ──────────────────────────────────────────────────────────────────────────

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
    pnpm install --frozen-lockfile --ignore-scripts --prod=false \
      --filter @shadowob/shared... \
      --filter @shadowob/sdk... \
      --filter @shadowob/cli... \
      --filter @shadowob/connector...

COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY packages/cli packages/cli
COPY packages/connector packages/connector

RUN find packages/connector/hermes-shadowob-plugin -type d -name __pycache__ -prune \
      -exec rm -rf {} + && \
    find packages/connector/hermes-shadowob-plugin -name "*.pyc" -delete

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

# Keep the upstream Hermes base pinned. The `latest` tag moved during local
# runner verification, which invalidated build cache and changed runtime bits.
FROM nousresearch/hermes-agent@sha256:cd2f5af16a8095101c6ce22c88a1d66dd8a5b5d1f97589aa3858e3329bcf949d AS runner

LABEL org.opencontainers.image.source="https://github.com/nicepkg/shadow"
LABEL org.opencontainers.image.description="Shadow Cloud Hermes Runner"

ARG NODE_VERSION=22.21.1
ARG PLAYWRIGHT_VERSION=1.59.1

USER root

WORKDIR /app

COPY --from=shadow-packages /shadow-pkgs /tmp/shadow-pkgs
COPY apps/cloud/images/install-browser-runtime.sh /usr/local/bin/install-browser-runtime
COPY apps/cloud/images/shared/shadow-persistent-apt.sh /usr/local/bin/shadow-persistent-apt

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      fontconfig \
      fonts-dejavu-core \
      python-is-python3 \
      python3 \
      python3-pip \
      python3-venv \
      tini \
      xz-utils && \
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
    node --version && \
    chmod +x /usr/local/bin/install-browser-runtime && \
    PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION}" install-browser-runtime

RUN npm init -y && \
    npm install --no-audit --fund=false \
      /tmp/shadow-pkgs/shadowob-shared-*.tgz \
      /tmp/shadow-pkgs/shadowob-sdk-*.tgz \
      /tmp/shadow-pkgs/shadowob-cli-*.tgz \
      /tmp/shadow-pkgs/shadowob-connector-*.tgz && \
    rm -rf /tmp/shadow-pkgs && \
    ln -sf /opt/hermes/.venv/bin/hermes /usr/local/bin/hermes && \
    ln -s /app/node_modules/.bin/shadowob /usr/local/bin/shadowob && \
    ln -s /app/node_modules/.bin/shadowob-connector /usr/local/bin/shadowob-connector && \
    chmod +x /usr/local/bin/shadow-persistent-apt && \
    ln -sf /usr/local/bin/shadow-persistent-apt /usr/local/bin/apt && \
    ln -sf /usr/local/bin/shadow-persistent-apt /usr/local/bin/apt-get && \
    if command -v pip3 >/dev/null 2>&1 && ! command -v pip >/dev/null 2>&1; then ln -sf /usr/bin/pip3 /usr/local/bin/pip; fi

RUN existing_user="$(getent passwd 1000 | cut -d: -f1 || true)" && \
    if [ -n "$existing_user" ]; then \
      if command -v groupmod >/dev/null 2>&1; then groupmod -n shadow "$existing_user" 2>/dev/null || true; fi; \
      usermod -l shadow -d /home/shadow -m "$existing_user" 2>/dev/null || true; \
    else \
      groupadd -g 1000 shadow 2>/dev/null || groupadd shadow; \
      useradd -u 1000 -g shadow -m -d /home/shadow -s /usr/sbin/nologin shadow; \
    fi && \
    mkdir -p /home/shadow/.hermes /home/shadow/.local/bin \
             /home/shadow/.cache/npm /home/shadow/.cache/pip /home/shadow/.config \
             /home/shadow/.local/share /home/shadow/.local/state /home/shadow/.shadow-tools/apt \
             /etc/openclaw /etc/shadowob /var/log/shadowob \
             /workspace && \
    if [ ! -e /home/openclaw ]; then ln -s /home/shadow /home/openclaw; fi && \
    chown -R 1000:1000 /home/shadow /etc/shadowob /var/log/shadowob \
      /workspace /app

ENV NODE_ENV=production
ENV HOME=/home/shadow
ENV PATH=/home/shadow/.local/bin:$PATH
ENV SHADOWOB_RUNNER_HEALTH_PORT=3100
ENV OPENCLAW_NO_RESPAWN=1
ENV HERMES_HOME=/home/shadow/.hermes
ENV HERMES_HOME_MODE=2770
ENV NPM_CONFIG_PREFIX=/home/shadow/.local
ENV npm_config_prefix=/home/shadow/.local
ENV NPM_CONFIG_CACHE=/home/shadow/.cache/npm
ENV npm_config_cache=/home/shadow/.cache/npm
ENV PIP_CACHE_DIR=/home/shadow/.cache/pip
ENV PIP_BREAK_SYSTEM_PACKAGES=1
ENV PYTHONUSERBASE=/home/shadow/.local
ENV XDG_CONFIG_HOME=/home/shadow/.config
ENV XDG_CACHE_HOME=/home/shadow/.cache
ENV XDG_DATA_HOME=/home/shadow/.local/share
ENV XDG_STATE_HOME=/home/shadow/.local/state
ENV SHADOWOB_PERSISTENT_TOOLS_DIR=/home/shadow/.shadow-tools
ENV SHADOWOB_PERSISTENT_APT_ROOT=/home/shadow/.shadow-tools/apt
ENV SHADOWOB_RUNNER_PERSISTENT_DIRS=/home/shadow:/home/shadow/.hermes:/home/shadow/.local:/home/shadow/.cache:/home/shadow/.config:/home/shadow/.local/share:/home/shadow/.local/state:/home/shadow/.shadow-tools
ENV SHADOWOB_RUNNER_EPHEMERAL_DIRS=/tmp:/workspace/.agents:/var/log/shadowob
ENV SHADOWOB_RUNNER_TEMP_DIR=/tmp
ENV SHADOWOB_CLI_DISABLE_CHANNEL_SEND=1
ENV CHROME_BIN=/usr/bin/chromium-headless-shell
ENV CHROMIUM_PATH=/usr/bin/chromium-headless-shell
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell
ENV CHROME_FLAGS="--no-sandbox --disable-gpu --disable-software-rasterizer --single-process --disable-dev-shm-usage"
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-software-rasterizer --single-process --disable-dev-shm-usage"
ENV PUPPETEER_ARGS='["--no-sandbox","--disable-gpu","--disable-software-rasterizer","--single-process","--disable-dev-shm-usage"]'

COPY --from=shadow-packages --chown=1000:1000 /workspace/packages/connector/hermes-shadowob-plugin /opt/shadowob/hermes-shadowob-plugin
COPY --chown=1000:1000 apps/cloud/images/hermes-runner/entrypoint.mjs /app/entrypoint.mjs
COPY apps/cloud/images/hermes-runner/shadow-video-render.mjs /usr/local/bin/shadow-video-render

# Hermes discovers platform plugins dynamically, but it only creates an
# adapter when every dependency from the plugin manifest is importable from
# the Hermes virtualenv. Installing into the system interpreter is not enough.
RUN /opt/hermes/.venv/bin/python -m ensurepip --upgrade && \
    /opt/hermes/.venv/bin/python -m pip install --no-cache-dir \
      -r /opt/shadowob/hermes-shadowob-plugin/requirements.txt && \
    /opt/hermes/.venv/bin/python -c "import httpx, socketio" && \
    find /opt/shadowob/hermes-shadowob-plugin -type d \
      \( -name __pycache__ -o -name .pytest_cache \) -prune -exec rm -rf {} + && \
    find /opt/shadowob/hermes-shadowob-plugin -name "*.pyc" -delete

RUN shadowob-connector connect \
      --target hermes \
      --server-url http://shadow.invalid \
      --token shadow-build-placeholder \
      --hermes-home /home/shadow/.hermes \
      --project-name shadow-buddy \
      --force && \
    chmod +x /usr/local/bin/shadow-video-render && \
    chown -R 1000:1000 /home/shadow /etc/shadowob /var/log/shadowob \
      /workspace /app

USER shadow

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

EXPOSE 3100

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/entrypoint.mjs"]
