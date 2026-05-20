FROM node:22-alpine

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY integrations/quiz ./integrations/quiz

RUN corepack enable \
  && corepack prepare pnpm@10.19.0 --activate \
  && pnpm install --filter @shadowob/quiz-app... --prod=false --ignore-scripts \
  && pnpm --filter @shadowob/shared build \
  && pnpm --filter @shadowob/sdk build \
  && pnpm --filter @shadowob/quiz-app build

WORKDIR /repo/integrations/quiz

EXPOSE 4211

CMD ["pnpm", "start"]
