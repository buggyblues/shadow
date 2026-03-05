# ── Build stage ──────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/agenthub/package.json packages/agenthub/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/server/ apps/server/

RUN pnpm --filter @shadow/server build

# ── Run stage ───────────────────────────────────────
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/agenthub/package.json packages/agenthub/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/apps/server/dist apps/server/dist

EXPOSE 3002
ENV NODE_ENV=production
CMD ["node", "apps/server/dist/index.js"]
