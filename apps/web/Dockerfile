# ── Build stage ──────────────────────────────────────
FROM node:22-alpine AS builder
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
COPY website/package.json website/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/web/ apps/web/
COPY docs/e2e/screenshots/ /tmp/screenshots/
COPY website/ website/
RUN rm -rf website/docs/public/screenshots && cp -r /tmp/screenshots website/docs/public/screenshots

RUN pnpm --filter @shadowob/website build
RUN pnpm --filter @shadowob/web build

# ── Serve stage ─────────────────────────────────────
FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/website/doc_build /usr/share/nginx/html
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/app
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
