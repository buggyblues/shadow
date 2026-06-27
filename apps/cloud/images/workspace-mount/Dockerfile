# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS builder

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json .npmrc ./
COPY patches patches
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts --filter @shadowob/cli...

COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY packages/cli packages/cli

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm --filter @shadowob/shared build && \
    pnpm --filter @shadowob/sdk build && \
    pnpm --filter @shadowob/cli build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

RUN if ! getent group shadow >/dev/null; then groupadd --system shadow; fi && \
    useradd --gid shadow --create-home --home-dir /home/shadow --shell /usr/sbin/nologin shadow

COPY --from=builder /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=builder /workspace/node_modules node_modules
COPY --from=builder /workspace/packages/shared packages/shared
COPY --from=builder /workspace/packages/sdk packages/sdk
COPY --from=builder /workspace/packages/cli packages/cli

RUN ln -s /app/packages/cli/dist/index.js /usr/local/bin/shadowob && \
    chown -R shadow:shadow /home/shadow

USER shadow
WORKDIR /home/shadow

ENTRYPOINT ["shadowob"]
