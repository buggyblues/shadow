# syntax=docker/dockerfile:1.7

FROM node:22-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY .npmrc ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/sdk/bin ./packages/sdk/bin
COPY integrations/runtime/package.json ./integrations/runtime/
COPY integrations/kanban/package.json ./integrations/kanban/
COPY integrations/qna/package.json ./integrations/qna/
COPY integrations/quiz/package.json ./integrations/quiz/
COPY integrations/trainer/package.json ./integrations/trainer/
COPY integrations/skills/package.json ./integrations/skills/
COPY integrations/warbuddy/package.json ./integrations/warbuddy/

RUN --mount=type=cache,id=shadow-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install \
    --filter @shadowob/integrations-runtime... \
    --prod=false \
    --frozen-lockfile \
    --ignore-scripts \
    --package-import-method=copy

COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY integrations/runtime ./integrations/runtime
COPY integrations/kanban ./integrations/kanban
COPY integrations/qna ./integrations/qna
COPY integrations/quiz ./integrations/quiz
COPY integrations/trainer ./integrations/trainer
COPY integrations/skills ./integrations/skills
COPY integrations/warbuddy ./integrations/warbuddy

RUN pnpm --filter @shadowob/shared build \
  && pnpm --filter @shadowob/sdk build \
  && pnpm --filter @shadowob/kanban-app build \
  && pnpm --filter @shadowob/qna-app build \
  && pnpm --filter @shadowob/quiz-app build \
  && pnpm --filter @shadowob/trainer-app build \
  && pnpm --filter @shadowob/skills-app build \
  && pnpm --filter @shadowob/warbuddy-app build \
  && pnpm --filter @shadowob/integrations-runtime build

WORKDIR /repo/integrations/runtime

EXPOSE 4200

CMD ["node", "--import", "tsx", "src/server.ts"]
