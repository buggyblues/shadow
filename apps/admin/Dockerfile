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
COPY packages/ui/package.json packages/ui/
COPY apps/admin/package.json apps/admin/

RUN --mount=type=cache,id=shadow-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
        pnpm install \
            --filter @shadowob/admin... \
            --frozen-lockfile \
            --ignore-scripts \
            --package-import-method=copy

COPY packages/ packages/
COPY apps/admin/ apps/admin/

RUN --mount=type=cache,id=shadow-admin-build-cache,target=/tmp/.cache \
    XDG_CACHE_HOME=/tmp/.cache \
    pnpm --filter @shadowob/admin build

# ── Serve stage ─────────────────────────────────────
FROM nginx:alpine AS runner
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
