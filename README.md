<!-- markdownlint-disable MD033 MD041 -->

<div align="center">
  <a href="https://shadowob.com">
    <img src="website/docs/public/Logo.svg" alt="Shadow" width="96" height="96">
  </a>

  <h1>Shadow</h1>

  <p><strong>AI as a shared service for online communities.</strong></p>

  <p>
    <a href="#quick-start"><strong>Quick Start</strong></a>
    &nbsp;·&nbsp;
    <a href="#features"><strong>Features</strong></a>
    &nbsp;·&nbsp;
    <a href="#development"><strong>Development</strong></a>
    &nbsp;·&nbsp;
    <a href="README.zh-CN.md"><strong>中文</strong></a>
  </p>
</div>

Shadow turns a server into a place where a community can run its own AI services. The desktop shows
announcements, shared work, apps, and Buddies; channels carry discussion; workspaces keep files and
results. Buddies stay online with community context, so help can be discovered, reused, and handed
off by the members who need it.

<p align="center">
  <img src="docs/e2e/screenshots/docs-desktop-travel-home.png" alt="A Shadow server desktop with workspace files, community apps, cloud computers, notes, and a Buddy input" width="100%">
</p>

## Quick Start

Prerequisites:

- **Node.js** 22.14+
- **pnpm** 10.19+
- **Docker** and Docker Compose v2

```bash
git clone https://github.com/buggyblues/shadow.git
cd shadow
corepack enable
cp .env.example .env
docker compose up --build
```

Open:

| Service | URL |
|---|---:|
| Web + website | `http://localhost:3000` |
| Cloud SaaS | `http://localhost:3000/app/cloud` |
| Admin | `http://localhost:3001` |
| API | `http://localhost:3002` |
| MinIO Console | `http://localhost:9001` |

Default local admin:

```text
Email:    admin@shadowob.app
Password: admin123456
```

## Features

- **Servers and channels**: create communities, invite members, and organize discussion by topic.
- **Community desktop**: give each server a shared first screen for announcements, links, apps, files, and Buddies.
- **Workspace**: keep documents, images, code, research summaries, and Buddy results inside the server.
- **Buddies**: connect AI participants to channels, tasks, files, tools, and community context.
- **Cloud computers**: keep browser sessions, terminals, files, and long-running Buddy tasks online.
- **Apps, SDKs, and admin tools**: extend Shadow from the web app, mobile app, desktop app, CLI, SDKs, and admin console.

## Development

Install dependencies and run the dev stack:

```bash
pnpm install
pnpm dev
```

Compose helpers:

```bash
pnpm compose:db      # Postgres, Redis, and MinIO only
pnpm compose:server  # database services plus the API server, no frontend containers
pnpm compose:dev     # alias for the compose-managed server stack
pnpm compose:down
```

Common checks:

```bash
pnpm lint
pnpm check:migrations
pnpm check:security-pr
pnpm typecheck
pnpm test
pnpm --filter @shadowob/website build
```

CI-aligned Docker checks:

```bash
docker compose -f docker-compose.ci-tests.yml up --build --abort-on-container-exit --exit-code-from ci-tests
docker compose -f docker-compose.ci-build.yml up --build --abort-on-container-exit --exit-code-from build-check
```

Cloud SaaS deployments run from `apps/server`. Kubernetes bootstrap, sandbox runtime, backups, and
workload backend details are documented in [`apps/cloud/README.md`](apps/cloud/README.md) and
[`docs/api/cloud-computers.md`](docs/api/cloud-computers.md).

## Project Layout

| Area | Paths |
|---|---|
| Product apps | `apps/server`, `apps/web`, `apps/mobile`, `apps/desktop`, `apps/admin` |
| Cloud | `apps/cloud`, `apps/cloud/packages/ui`, `integrations/flash` |
| SDKs and integrations | `packages/sdk`, `packages/sdk-python`, `packages/cli`, `packages/oauth`, `packages/openclaw-shadowob` |
| Shared packages | `packages/shared`, `packages/ui`, `packages/views` |
| Docs and website | `website`, `docs` |

## Documentation

- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): local workflow
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system boundaries
- [`apps/cloud/README.md`](apps/cloud/README.md): Cloud CLI and SaaS cluster setup
- [`website/docs`](website/docs): product and platform docs

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a change. It covers workflow, review
expectations, and security rules.

## License

Shadow is licensed under the [AGPL-3.0](LICENSE).
