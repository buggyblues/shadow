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
COPY integrations/qna/package.json ./integrations/qna/

RUN --mount=type=cache,id=shadow-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install \
    --filter @shadowob/qna-app... \
    --prod=false \
    --frozen-lockfile \
    --ignore-scripts \
    --package-import-method=copy

COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY integrations/qna ./integrations/qna

RUN pnpm --filter @shadowob/shared build \
  && pnpm --filter @shadowob/sdk build \
  && pnpm --filter @shadowob/qna-app build

WORKDIR /repo/integrations/qna

EXPOSE 4210

CMD ["pnpm", "start"]
