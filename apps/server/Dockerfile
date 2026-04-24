# syntax=docker/dockerfile:1.7

# ── Build stage ──────────────────────────────────────
FROM node:22-alpine AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsup.config.ts packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/sdk/tsup.config.ts packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY apps/server/package.json apps/server/
COPY apps/cloud/package.json apps/cloud/
COPY apps/cloud/packages/ui/package.json apps/cloud/packages/ui/

RUN --mount=type=cache,id=shadow-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
        pnpm install \
            --filter @shadowob/server... \
            --filter @shadowob/cloud... \
            --frozen-lockfile \
            --ignore-scripts \
            --package-import-method=copy

COPY packages/ packages/
COPY apps/server/ apps/server/
COPY apps/cloud/ apps/cloud/
COPY apps/web/src/styles/ apps/web/src/styles/

# Build dependencies first (need devDependencies for tsup)
ENV SHADOW_BUILD_DTS=0
RUN pnpm --filter @shadowob/shared build && \
    pnpm --filter @shadowob/sdk build && \
    pnpm --filter @shadowob/server build

# ── Run stage ───────────────────────────────────────
FROM node:22-alpine AS runner
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache curl kubectl && \
    corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY apps/server/package.json apps/server/
COPY apps/cloud/package.json apps/cloud/
COPY apps/cloud/packages/ui/package.json apps/cloud/packages/ui/

RUN --mount=type=cache,id=shadow-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
        pnpm install \
            --filter @shadowob/server... \
            --filter @shadowob/cloud... \
            --frozen-lockfile \
            --prod \
            --ignore-scripts \
            --package-import-method=copy

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/sdk/dist packages/sdk/dist
COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/cloud/dist apps/cloud/dist
COPY --from=builder /app/apps/cloud/templates apps/cloud/templates
COPY --from=builder /app/apps/cloud/images apps/cloud/images
COPY --from=builder /app/apps/server/src/db/migrations apps/server/migrations

EXPOSE 3002
ENV NODE_ENV=production
ENV CLOUD_TEMPLATES_DIR=/app/apps/cloud/templates
ENV PULUMI_HOME=/root/.shadowob/pulumi/home
ENV PULUMI_BACKEND_URL=file:///root/.shadowob/pulumi
ENV PATH=/root/.shadowob/pulumi/cli/bin:$PATH
CMD ["node", "apps/server/dist/index.js"]
