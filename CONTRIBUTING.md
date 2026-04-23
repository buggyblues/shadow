# Contributing to Shadow

Thank you for your interest in contributing to Shadow! This guide will help you set up the development environment, understand the workflow, and submit high-quality contributions.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Fork and Clone](#fork-and-clone)
  - [Running with Docker Compose](#running-with-docker-compose)
  - [Running for Local Development](#running-for-local-development)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
  - [Branching Strategy](#branching-strategy)
  - [Making Changes](#making-changes)
  - [Commit Convention](#commit-convention)
  - [Code Style](#code-style)
  - [Running Tests](#running-tests)
  - [Database Migrations](#database-migrations)
- [Adding a New Feature](#adding-a-new-feature)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)
- [License](#license)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

---

## Prerequisites

| Tool | Version | Installation |
|------|---------|-------------|
| **Node.js** | ≥ 22 | [nodejs.org](https://nodejs.org/) or via `nvm install 22` |
| **pnpm** | ≥ 10 | `corepack enable && corepack prepare pnpm@10.19.0 --activate` |
| **Docker** | ≥ 24 | [docker.com](https://www.docker.com/get-started/) |
| **Docker Compose** | ≥ 2.20 | Bundled with Docker Desktop |
| **Git** | ≥ 2.30 | [git-scm.com](https://git-scm.com/) |

---

## Getting Started

### Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/shadow.git
cd shadow
```

### Running with Docker Compose

The fastest way to verify the full stack is via Docker Compose. This builds all three applications (server, web, admin) along with the infrastructure (PostgreSQL, Redis, MinIO):

```bash
docker compose up --build
```

Once all services are healthy, the following endpoints are available:

| Service | URL | Description |
|---------|-----|-------------|
| **Web App** | http://localhost:3000 | Main user-facing application |
| **Admin Panel** | http://localhost:3001 | Admin dashboard |
| **API Server** | http://localhost:3002 | REST API + WebSocket |
| **MinIO Console** | http://localhost:9001 | Object storage admin (minioadmin / minioadmin) |

A default admin account is seeded automatically:
- **Email**: `admin@shadowob.app`
- **Password**: `admin123456`

To tear down and clean up:

```bash
# Stop and remove containers
docker compose down

# Stop and remove containers + volumes (full reset)
docker compose down -v
```

### Running for Local Development

For a faster development experience with hot-reloading, run infrastructure via Docker and applications natively:

**1. Install dependencies:**

```bash
pnpm install
```

**2. Run database migrations:**

```bash
pnpm db:migrate
```

**3. Start development environment (one command):**

```bash
pnpm dev
```

Alternative focused workflows:

```bash
pnpm dev:backend
pnpm dev:frontend
```

These scripts automatically start infrastructure (`postgres`, `redis`, `minio`) via Docker Compose.
`pnpm dev:frontend` also keeps the Docker `server` service running on `:3002` so the web/admin dev proxies have a live API target.
Set `SHADOW_DEV_API_BASE` if you need the frontend dev proxies to target a different API origin.

This starts:
- **Server** on `http://localhost:3002` (tsx watch mode)
- **Web** on `http://localhost:3000` (RSBuild dev server with HMR)
- **Admin** on `http://localhost:3001` (RSBuild dev server with HMR)

The web dev server automatically proxies `/api` and `/socket.io` requests to the server at `:3002`.

**Environment variables** can be customized via a `.env` file in the project root. See [ARCHITECTURE.md](ARCHITECTURE.md#environment-variables) for the full list.

---

## Project Structure

```
shadow/
├── apps/
│   ├── server/        # Hono API server + Socket.IO (TypeScript, Node.js)
│   ├── web/           # Main React SPA (RSBuild, Tailwind CSS)
│   └── admin/         # Admin React SPA
├── packages/
│   ├── shared/        # Shared types, constants, and utilities
│   ├── sdk/           # Typed REST client + Socket.IO wrapper
│   ├── ui/            # Reusable UI component library
│   ├── oauth/         # OAuth SDK for third-party apps
│   └── openclaw/      # OpenClaw agent channel plugin
├── scripts/           # CI and build helper scripts
├── docs/              # Additional documentation
└── docker-compose.yml # Container orchestration
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of each module, the database schema, and data flows.

---

## Development Workflow

### Branching Strategy

- `main` is the stable branch. **Never push directly** to `main`.
- Create feature branches from `main`:

```bash
git checkout -b feat/my-feature main
```

Branch naming conventions:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New features | `feat/voice-channels` |
| `fix/` | Bug fixes | `fix/message-ordering` |
| `docs/` | Documentation | `docs/api-reference` |
| `refactor/` | Code restructuring | `refactor/auth-middleware` |
| `test/` | Test additions | `test/rental-e2e` |
| `chore/` | Tooling, CI, deps | `chore/upgrade-drizzle` |

### Making Changes

1. **Read first.** Understand existing code before modifying it. See [ARCHITECTURE.md](ARCHITECTURE.md) for the layered design.
2. **Keep changes focused.** One logical change per commit/PR.
3. **Follow the layered architecture.** Server code flows: **Handler → Service → DAO → Database**. Never import a upper layer from a lower layer.
4. **Use dependency injection.** Access services via the Awilix container, never import them directly.
5. **Validate inputs.** Add Zod schemas in the appropriate `validators/` file for new endpoints.
6. **Share types.** If a type is used by both frontend and backend, add it to `@shadowob/shared`.

### Commit Convention

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via Commitlint + Husky:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Allowed types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

Examples:

```bash
git commit -m "feat(rental): add contract termination endpoint"
git commit -m "fix(chat): resolve message ordering in threads"
git commit -m "docs: update ARCHITECTURE.md with new tables"
git commit -m "test(shop): add order creation e2e tests"
```

### Code Style

Code formatting and linting are handled by **Biome** (replaces ESLint + Prettier):

```bash
# Check for lint and format issues
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Format only
pnpm format
```

Key rules:
- 2-space indentation, 100-character line width
- No unused imports or variables (warnings)
- Husky runs `lint-staged` on pre-commit automatically

### Running Tests

Tests use **Vitest** with Node.js environment:

```bash
# Run all tests
pnpm test

# Watch mode (re-runs on changes)
pnpm test:watch

# Coverage report
pnpm test:coverage
```

Test files follow the pattern `**/*.{test,spec}.{ts,tsx}` and are co-located in `__tests__/` directories within each app or package.

### Database Migrations

Schema changes are managed by **Drizzle Kit**:

```bash
# 1. Modify schema files in apps/server/src/db/schema/

# 2. Generate a new migration SQL file
pnpm db:generate

# 3. Review the generated SQL in apps/server/src/db/migrations/

# 4. Apply the migration
pnpm db:migrate

# 5. (Optional) Open Drizzle Studio to inspect data
pnpm db:studio
```

> **Important**: Always review generated migration SQL before applying. The server auto-runs migrations on startup, so new migrations will be applied when you restart the server or rebuild the Docker image.

To verify migration consistency:

```bash
pnpm check:migrations
```

---

## Adding a New Feature

Here is the typical checklist for adding a backend feature end-to-end:

1. **Schema** — Define tables in `apps/server/src/db/schema/` and generate a migration.
2. **DAO** — Create a DAO in `apps/server/src/dao/` for data access queries.
3. **Service** — Create a service in `apps/server/src/services/` for business logic.
4. **Validator** — Add Zod schemas in `apps/server/src/validators/`.
5. **Handler** — Create a handler in `apps/server/src/handlers/` and mount it in `app.ts`.
6. **Container** — Register the DAO and service in `container.ts`.
7. **Types** — If shared with frontend, add types to `packages/shared/`.
8. **Tests** — Add tests in `apps/server/__tests__/`.
9. **Frontend** — Build pages/components in `apps/web/src/` as needed.

---

## Submitting a Pull Request

1. Ensure all checks pass locally:

   ```bash
   pnpm lint
   pnpm test
   docker compose up --build  # Verify full-stack build
   ```

2. Push your branch and open a pull request against `main`.

3. In your PR description:
   - Summarize what changed and **why**.
   - Reference related issues (e.g., `Closes #42`).
   - Include screenshots for UI changes.
   - Note any migration or breaking changes.

4. Wait for code review. Address feedback promptly and keep commits clean.

---

## Reporting Issues

When filing an issue, please include:

- **Steps to reproduce** the problem.
- **Expected behavior** vs. **actual behavior**.
- **Environment details** (OS, Node.js version, browser).
- **Logs or screenshots** if applicable.

Use the appropriate issue template if available. For security vulnerabilities, please report them privately to the maintainers instead of opening a public issue.

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
