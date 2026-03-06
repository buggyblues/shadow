# ── Build stage ──────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/agenthub/package.json packages/agenthub/
COPY apps/admin/package.json apps/admin/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/admin/ apps/admin/

RUN pnpm --filter @shadowob/admin build

# ── Serve stage ─────────────────────────────────────
FROM nginx:alpine AS runner
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
