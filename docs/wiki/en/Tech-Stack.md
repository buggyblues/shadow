# Tech Stack

Comprehensive list of technologies and frameworks used in Shadow.

## Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| TanStack Router | latest | Type-safe file-based routing |
| TanStack Query | latest | Server state management |
| Zustand | latest | Client state management |
| Tailwind CSS | 4 | Utility-first styling |
| Rsbuild (Rspack) | latest | Build tool (Rust-based, fast) |
| i18next + react-i18next | latest | Internationalization |
| Socket.IO Client | latest | Real-time communication |
| Lucide React | latest | Icon library |
| Radix UI | latest | Accessible UI primitives |

## Desktop

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 36 | Cross-platform desktop framework |
| Electron Forge | 7 | Build, package, and publish |
| Rspack | latest | Main/preload process bundling |
| Playwright | latest | E2E testing |

## Mobile

| Technology | Version | Purpose |
|------------|---------|---------|
| Expo | 54 | React Native framework |
| React Native | 0.81 | Cross-platform mobile UI |
| Expo Router | 6 | File-based navigation |
| FlashList | 2 | High-performance lists |

## Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | latest | Lightweight web framework |
| Drizzle ORM | latest | Type-safe SQL ORM |
| Socket.IO | latest | WebSocket server |
| Awilix | latest | Dependency injection container |
| Zod | latest | Runtime schema validation |
| Pino | latest | Structured JSON logging |
| bcryptjs | latest | Password hashing |
| jsonwebtoken | latest | JWT authentication |

## Database & Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 16 | Primary relational database |
| Redis | 7 | Caching, sessions, pub/sub |
| MinIO | latest | S3-compatible object storage |
| Docker Compose | latest | Container orchestration |

## Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | 5.9 | Static type checking |
| Biome | 2 | Linting + formatting (replaces ESLint/Prettier) |
| Vitest | 4 | Unit / integration testing |
| Playwright | latest | E2E testing (desktop) |
| pnpm | 10 | Package manager (workspaces) |
| Husky | latest | Git hooks |
| lint-staged | latest | Pre-commit checks |
| Commitlint | latest | Conventional commit enforcement |

## SDKs

| SDK | Language | Package |
|-----|----------|---------|
| TypeScript SDK | TypeScript | `@shadowob/sdk` |
| Python SDK | Python | `shadow-sdk` |
| OAuth SDK | TypeScript | `@shadowob/oauth` |
| OpenClaw Plugin | TypeScript | `@shadowob/openclaw-shadowob` |
