FROM node:22-alpine

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json shadow-app.local.json ./
COPY src ./src

EXPOSE 4199
CMD ["pnpm", "start"]
