# Development

This guide covers local development, documentation ownership, and CI-aligned checks for the current
Shadow monorepo.

## Prerequisites

- Node.js 22.14+
- pnpm 10+
- Docker and Docker Compose v2
- Optional for Cloud deployment work: `kubectl`, a reachable Kubernetes cluster, and kubeconfig

Install dependencies:

```bash
pnpm install
cp .env.example .env
```

The root `prepare` script also repairs local pnpm symlinks used by `apps/flash`.

## Local Startup

Run the full stack in Docker:

```bash
docker compose up --build
```

Run local hot reload against Docker infrastructure:

```bash
pnpm dev
```

Split backend/frontend work:

```bash
pnpm dev:backend
pnpm dev:frontend
```

`pnpm dev` starts PostgreSQL, Redis, MinIO, the server, the web app, and the admin app. The split
commands are useful when Cloud backend watchers or website/frontend watchers need separate terminals.

Local service ports:

| Service | URL |
|---|---:|
| Web + website | `http://localhost:3000` |
| Admin | `http://localhost:3001` |
| API | `http://localhost:3002` |
| MinIO Console | `http://localhost:9001` |

## Package Commands

| Package | Common commands |
|---|---|
| `@shadowob/server` | `pnpm --filter @shadowob/server test`, `pnpm --filter @shadowob/server db:migrate` |
| `@shadowob/web` | `pnpm --filter @shadowob/web dev`, `pnpm --filter @shadowob/web typecheck` |
| `@shadowob/mobile` | `pnpm --filter @shadowob/mobile start`, `pnpm --filter @shadowob/mobile test` |
| `@shadowob/desktop` | `pnpm --filter @shadowob/desktop dev`, `pnpm --filter @shadowob/desktop test:e2e` |
| `@shadowob/admin` | `pnpm --filter @shadowob/admin dev`, `pnpm --filter @shadowob/admin typecheck` |
| `@shadowob/cloud` | `pnpm --filter @shadowob/cloud test`, `pnpm --filter @shadowob/cloud console:dev` |
| `@shadowob/website` | `pnpm --filter @shadowob/website dev`, `pnpm --filter @shadowob/website build` |
| `@shadowob/sdk` | `pnpm --filter @shadowob/sdk build`, `pnpm --filter @shadowob/sdk test` |
| `@shadowob/cli` | `pnpm --filter @shadowob/cli build`, `pnpm --filter @shadowob/cli test` |
| `@shadowob/openclaw-shadowob` | `pnpm --filter @shadowob/openclaw-shadowob test` |
| `@shadowob/promo` | `pnpm promo:dev`, `pnpm promo:still`, `pnpm promo:render` |

## Formatting And Linting

Use Biome. Do not use Prettier in this repository.

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm exec biome check --write <paths>
```

For changed docs/code files, prefer targeted formatting while iterating:

```bash
pnpm biome format --write README.md docs/ARCHITECTURE.md docs/DEVELOPMENT.md
```

## Typecheck, Tests, And CI Parity

Focused local checks are useful during implementation:

```bash
pnpm typecheck
pnpm test
pnpm --filter @shadowob/server test
pnpm --filter @shadowob/web typecheck
pnpm --filter @shadowob/mobile test
pnpm --filter @shadowob/cloud test
```

Before relying on results for CI, run the Docker Compose stack that matches CI:

```bash
docker compose -f docker-compose.ci-tests.yml up --build --abort-on-container-exit --exit-code-from ci-tests
docker compose -f docker-compose.ci-build.yml up --build --abort-on-container-exit --exit-code-from build-check
docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e-runner
```

E2E session state defaults to `.tmp/e2e/session.json`. Reusable product screenshots live under
`docs/e2e/screenshots` and are exposed to the website through `website/docs/public/screenshots`.
Generated README visual assets live under `website/docs/public/readme`.

## Database

Server schema and migrations live in `apps/server/src/db`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

When changing schema or API behavior, update migrations, server tests, SDK types, CLI commands,
website platform docs, and web/mobile consumers.

## Documentation Ownership

`website/docs` is the only product/API documentation source:

- English product docs: `website/docs/en/product`
- English platform/API docs: `website/docs/en/platform`
- Chinese product docs: `website/docs/zh/product`
- Chinese platform/API docs: `website/docs/zh/platform`
- Public doc assets: `website/docs/public`

Root `docs` is for repository-level engineering material:

- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/development`
- `docs/design-system`
- `docs/decisions`
- `docs/e2e/screenshots`

Do not recreate wiki, onboarding, branding, PRD, research, or loose attachment directories under
root `docs`. Keep development plans, design-system notes, decision records, and reusable E2E
screenshot assets in their existing directories.

## API And SDK Sync

For API changes, update every affected surface:

1. Server handlers, validators, services, DAOs, and tests.
2. Website platform docs under `website/docs/*/platform`.
3. TypeScript SDK in `packages/sdk`.
4. Python SDK in `packages/sdk-python` when the endpoint is exposed there.
5. CLI commands in `packages/cli` when the endpoint is part of automation.
6. Web and mobile consumers when user-facing behavior changes.

## UI And i18n

All user-facing UI copy must go through the relevant i18n system. This applies to web, mobile,
admin, Cloud UI, and website pages.

For new product features, implement the behavior on both web and mobile when the feature applies to
both platforms. Keep UI consistent with the existing component systems and avoid hardcoded labels,
placeholders, errors, notifications, tooltips, and page titles.

## Security Checklist

Security-sensitive changes need explicit actor/resource/action/capability/data-class thinking.

- Auth middleware must populate an actor; services should not rely only on handler-level checks.
- Resource access must combine scope/capability and resource membership/access.
- Wallet mutations must flow through `LedgerService`.
- Media downloads must remain behind app authorization or signed grants.
- Cloud/provider URLs need SSRF guards and redirect protections.
- Cloud runtime env must reject reserved key collisions.
- User or AI-generated Cloud templates must be validated by server policy before storage/deploy.
- JSON/config inputs need size, depth, key, and array limits.
- AI generation endpoints need capability checks, rate/budget controls, token estimates, and audit entries.
- Secrets and provision state must be redacted before logging or persistence.

Run:

```bash
pnpm check:security-pr
```

## Cloud Development

Shadow Cloud lives in `apps/cloud` and is also embedded into the main product through Cloud SaaS
routes and UI adapters.

Useful commands:

```bash
pnpm dev:cloud
pnpm dev:cloud-dashboard
pnpm cloud:serve
pnpm --filter @shadowob/cloud test:e2e:cli
pnpm --filter @shadowob/cloud test:e2e:dashboard
```

Common deployment environment variables:

- `KMS_MASTER_KEY`
- `KUBECONFIG_HOST_PATH`
- `KUBECONFIG`
- `KUBECONFIG_CONTEXT`
- `KUBECONFIG_LOOPBACK_HOST`
- `SHADOW_SERVER_URL`
- `SHADOW_AGENT_SERVER_URL`
- `PULUMI_CONFIG_PASSPHRASE`

## Release-Oriented Checks

Use the aggregate checks before publishing or opening a high-risk PR:

```bash
pnpm check:all
pnpm build
pnpm check:security-pr
```

For package publication, keep versions aligned:

```bash
pnpm check:sdk-versions
pnpm publish:packages
```
