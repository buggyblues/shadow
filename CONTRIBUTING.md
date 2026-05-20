# Contributing to Shadow

Thanks for contributing to Shadow. This guide covers the current monorepo layout, development
workflow, documentation ownership, and checks expected before opening a pull request.

## Prerequisites

| Tool | Version |
|---|---:|
| Node.js | 22.14+ |
| pnpm | 10+ |
| Docker | 24+ |
| Docker Compose | 2.20+ |
| Git | 2.30+ |

Enable the pinned package manager with Corepack:

```bash
corepack enable
corepack prepare pnpm@10.19.0 --activate
```

## Getting Started

```bash
git clone https://github.com/<your-username>/shadow.git
cd shadow
pnpm install
cp .env.example .env
```

Run the full stack with Docker:

```bash
docker compose up --build
```

Local services:

| Service | URL | Purpose |
|---|---:|---|
| Web + website | `http://localhost:3000` | Public website and product app under `/app` |
| Admin | `http://localhost:3001` | Admin dashboard |
| API | `http://localhost:3002` | REST API and Socket.IO |
| MinIO Console | `http://localhost:9001` | Local object storage console |

Seeded admin account:

```text
Email:    admin@shadowob.app
Password: admin123456
```

For hot reload:

```bash
pnpm dev
```

Split backend and frontend workflows:

```bash
pnpm dev:backend
pnpm dev:frontend
```

## Repository Map

| Path | Responsibility |
|---|---|
| `apps/server` | Hono API, Socket.IO, Drizzle schema/migrations, services, DAOs, security policy, Cloud SaaS bridge. |
| `apps/web` | Main React product app. |
| `apps/mobile` | Expo Router / React Native client. |
| `apps/desktop` | Electron client and Playwright visual/E2E suites. |
| `apps/admin` | Admin dashboard. |
| `apps/cloud` | Shadow Cloud CLI, HTTP server, dashboard, SaaS UI, templates, plugins, deployment services. |
| `integrations/flash` | Interactive Flash runtime and Server App integration. |
| `apps/promo` | Remotion promotional media source. |
| `apps/playground` | UI playground. |
| `packages/shared` | Shared types, constants, play catalog, utilities. |
| `packages/sdk` | TypeScript REST and Socket.IO SDK. |
| `packages/sdk-python` | Python REST and Socket.IO SDK. |
| `packages/cli` | `shadowob` CLI. |
| `packages/oauth` | OAuth integration helpers. |
| `packages/openclaw-shadowob` | OpenClaw channel plugin for Shadow Buddies. |
| `packages/ui` | Shared React UI primitives. |
| `website` | Rspress product, platform, legal, blog, and public asset docs site. |
| `docs` | Engineering docs, development plans, design-system notes, decision records, and E2E screenshots. |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing cross-cutting behavior.

## Documentation Ownership

Product and API documentation live in `website/docs`.

Use these locations:

- English product docs: `website/docs/en/product`
- English platform/API docs: `website/docs/en/platform`
- Chinese product docs: `website/docs/zh/product`
- Chinese platform/API docs: `website/docs/zh/platform`
- Website public assets: `website/docs/public`
- Reusable product screenshots: `docs/e2e/screenshots`, exposed through `website/docs/public/screenshots`
- README/marketing visuals: `website/docs/public/readme`
- Engineering docs and plans: `docs`

Do not recreate old wiki-style docs under `docs/wiki`. Do not add new product/API docs under root
`docs`; update the website docs instead.

## Development Workflow

1. Create a focused branch from `main`.
2. Read the surrounding code before editing.
3. Keep one logical change per PR.
4. Prefer existing local patterns and shared helpers.
5. Update tests, docs, SDKs, and clients with the behavior change.

Branch examples:

```bash
git checkout -b feat/my-feature main
git checkout -b fix/message-ordering main
git checkout -b docs/platform-oauth main
```

Use Conventional Commits:

```bash
git commit -m "feat(rental): add contract termination endpoint"
git commit -m "fix(chat): resolve message ordering in threads"
git commit -m "docs: update contributor guide"
```

Allowed types include `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`,
`build`, and `revert`.

## Code Style

Use Biome for formatting and linting. Do not use Prettier in this repository.

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm exec biome check --write <paths>
```

Keep user-facing UI copy in i18n files for web, mobile, admin, Cloud UI, and website pages.

## Backend Changes

Server code follows this dependency direction:

```text
handler -> service -> DAO -> database
```

For new or changed API behavior:

1. Add or update validators in `apps/server/src/validators`.
2. Add handler routes in `apps/server/src/handlers` and mount them in `apps/server/src/app.ts`.
3. Put business rules in `apps/server/src/services`.
4. Put database access in `apps/server/src/dao`.
5. Register services and DAOs in `apps/server/src/container.ts`.
6. Add or update Drizzle schema and migrations when storage changes.
7. Add unit and integration tests.
8. Update website platform docs, TypeScript SDK, Python SDK, CLI, and clients when exposed behavior changes.

Database commands:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm check:migrations
```

Always review generated migration SQL before applying it.

## Frontend And Product Changes

For user-facing product features, keep web and mobile behavior aligned when the feature applies to
both clients.

Common checks:

```bash
pnpm --filter @shadowob/web typecheck
pnpm --filter @shadowob/mobile typecheck
pnpm --filter @shadowob/admin typecheck
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/website build
```

For UI changes, include screenshots in the PR. Product screenshots used by website docs are captured
through the Playwright suites under `apps/desktop/e2e`.

## Security Requirements

Security-sensitive changes need explicit actor, resource, action, capability, and data-class review.

- Authentication middleware must populate an actor.
- Sensitive services should accept an actor or call `PolicyService`.
- Resource checks must combine scope/capability and resource access.
- Wallet mutations must flow through `LedgerService`.
- Media downloads must remain behind app authorization or signed grants.
- Cloud/provider URLs need SSRF guards and redirect protections.
- AI generation endpoints need capability checks, rate/budget controls, token estimates, and audit entries.
- Secrets and provision state must be redacted before logging or persistence.

Run this for security-sensitive changes:

```bash
pnpm check:security-pr
```

## Tests And CI Parity

Focused local checks are useful while iterating:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @shadowob/server test
pnpm --filter @shadowob/cloud test
```

Before relying on results for CI, run the matching Docker Compose stack:

```bash
docker compose -f docker-compose.ci-tests.yml up --build --abort-on-container-exit --exit-code-from ci-tests
docker compose -f docker-compose.ci-build.yml up --build --abort-on-container-exit --exit-code-from build-check
docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e-runner
```

## Pull Requests

Before opening a PR:

1. Keep the diff focused.
2. Run the relevant focused checks.
3. Run Docker Compose CI checks for broad or risky changes.
4. Update `website/docs` for product/API docs.
5. Update `docs/ARCHITECTURE.md` or `docs/DEVELOPMENT.md` for repository-level workflow changes.
6. Note migrations, breaking changes, screenshots, and security implications in the PR body.

## Reporting Issues

Include reproduction steps, expected behavior, actual behavior, environment details, and logs or
screenshots. Report security vulnerabilities privately to maintainers instead of opening a public
issue.

## License

By contributing, you agree that your contributions are licensed under the same license as the
project.
