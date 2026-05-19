FROM node:22-alpine

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY integrations/kanban ./integrations/kanban

RUN corepack enable \
  && corepack prepare pnpm@10.19.0 --activate \
  && pnpm install --filter @shadowob/kanban-app... --prod=false --ignore-scripts \
  && pnpm --filter @shadowob/shared build \
  && pnpm --filter @shadowob/sdk build

WORKDIR /repo/integrations/kanban

EXPOSE 4201

CMD ["pnpm", "start"]
