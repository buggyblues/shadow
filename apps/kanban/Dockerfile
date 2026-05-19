FROM node:22-alpine

WORKDIR /app

COPY apps/kanban/package.json ./package.json
COPY apps/kanban/tsconfig.json ./tsconfig.json
COPY apps/kanban/shadow-app.local.json ./shadow-app.local.json
COPY apps/kanban/src ./src

RUN corepack enable \
  && corepack prepare pnpm@10.19.0 --activate \
  && pnpm install --prod=false --config.dangerouslyAllowAllBuilds=true

EXPOSE 4201

CMD ["pnpm", "start"]
