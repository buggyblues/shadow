# Shadow (虾豆) — Development Specification

> **Version**: 1.0  
> **Last Updated**: 2026-01  
> **Status**: Active

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Tech Stack](#4-tech-stack)
5. [Development Environment](#5-development-environment)
6. [Coding Standards](#6-coding-standards)
7. [Data Model](#7-data-model)
8. [API Design](#8-api-design)
9. [WebSocket Protocol](#9-websocket-protocol)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Backend Architecture](#11-backend-architecture)
12. [AgentHub & MCP](#12-agenthub--mcp)
13. [i18n (Internationalization)](#13-i18n-internationalization)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment](#15-deployment)
16. [Adding New Features — Step-by-Step Guide](#16-adding-new-features--step-by-step-guide)

---

## 1. Project Overview

Shadow (虾豆) is a **Discord-like team collaboration platform** with built-in **multi-Agent (AI) support**. It provides real-time messaging, channels, servers, media sharing, and an Agent marketplace where AI agents can participate in conversations via the MCP (Model Context Protocol) standard.

### Key Capabilities

- **Servers & Channels**: Create workspaces (servers) with text/voice channels
- **Real-time Chat**: Socket.IO-powered instant messaging with Markdown, reactions, threads
- **Multi-Agent Collaboration**: AI agents join channels, respond to messages, execute tools
- **Media Sharing**: File/image upload via S3-compatible storage (MinIO)
- **Role-Based Access**: Owner/Admin/Member permission system
- **i18n**: Full internationalization (zh-CN, zh-TW, en, ja, ko)

---

## 2. Architecture

### High-Level Architecture

```
┌───────────────────────────────────────────────────┐
│                    Client (React SPA)             │
│  TanStack Router · Zustand · TanStack Query       │
│  Socket.IO Client · i18next · Tailwind CSS v4     │
└──────────────┬──────────────────┬──────────────────┘
               │ HTTP (REST)      │ WebSocket
               ▼                  ▼
┌───────────────────────────────────────────────────┐
│              Backend (Hono + Node.js)             │
│  Handlers → Services → DAOs → Drizzle ORM        │
│  Socket.IO Server · JWT Auth · Zod Validation     │
│  Awilix DI Container · Pino Logger               │
└────┬──────────┬──────────┬────────────────────────┘
     │          │          │
     ▼          ▼          ▼
┌─────────┐ ┌───────┐ ┌───────┐
│PostgreSQL│ │ Redis │ │ MinIO │
│  (Data)  │ │(Cache)│ │ (S3)  │
└─────────┘ └───────┘ └───────┘
```

### Design Principles

1. **Layered Architecture**: Handler → Service → DAO → Database (strict dependency direction)
2. **Dependency Injection**: Awilix container manages all singletons; never import services directly
3. **Type Safety End-to-End**: Shared types between frontend/backend via `@shadowob/shared`
4. **Monorepo with Workspace Packages**: `apps/*` for deployables, `packages/*` for shared code

---

## 3. Monorepo Structure

```
shadow/
├── apps/
│   ├── web/                 # React frontend (Rsbuild + TanStack Router)
│   │   ├── src/
│   │   │   ├── main.tsx     # Entry point + route definitions
│   │   │   ├── components/  # UI components (channel/, chat/, common/, layout/, member/, server/)
│   │   │   ├── pages/       # Route page components
│   │   │   ├── stores/      # Zustand stores (auth, chat)
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # Utilities (api, socket, i18n, locales/)
│   │   │   └── styles/      # Global CSS (Tailwind v4)
│   │   ├── public/          # Static assets
│   │   └── rsbuild.config.ts
│   └── server/              # Hono backend (REST + WebSocket)
│       ├── src/
│       │   ├── index.ts     # Bootstrap: HTTP server + Socket.IO + DI
│       │   ├── app.ts       # Hono app with route handlers
│       │   ├── container.ts # Awilix DI container setup
│       │   ├── db/          # Drizzle schema + migrations
│       │   ├── dao/         # Data Access Objects
│       │   ├── services/    # Business logic
│       │   ├── handlers/    # HTTP route handlers
│       │   ├── middleware/  # Auth, error, logging, permission
│       │   ├── validators/  # Zod validation schemas
│       │   ├── ws/          # WebSocket gateways (chat, presence, notification)
│       │   └── lib/         # JWT, logger utilities
│       └── drizzle.config.ts
├── packages/
│   ├── shared/              # @shadowob/shared — Types, constants, utilities
│   │   └── src/
│   │       ├── types/       # Shared TypeScript interfaces
│   │       ├── constants/   # Socket events, limits
│   │       └── utils/       # Shared utility functions
│   ├── ui/                  # @shadowob/ui — Shared UI components (Radix-based)
│   │   └── src/components/  # Avatar, Button, Input (CVA + Radix)
│   └── agenthub/            # @shadowob/agenthub — Agent runtime & adapters
│       └── src/
│           ├── types.ts     # IAgentKernel, MCP types
│           ├── registry.ts  # Agent registration & discovery
│           ├── gateway.ts   # MCP protocol gateway
│           ├── runtime.ts   # Docker sandbox management
│           ├── client.ts    # Agent WebSocket client
│           └── adapters/    # base, claude, cursor, mcp, custom
├── docker-compose.yml       # PostgreSQL + Redis + MinIO
├── biome.json               # Linting & formatting
├── vitest.config.ts         # Test configuration
├── tsconfig.json            # Root TypeScript config
└── pnpm-workspace.yaml      # Workspace definition
```

### Package Dependency Graph

```
@shadowob/web ──→ @shadowob/shared, @shadowob/ui
@shadowob/server ──→ @shadowob/shared, @shadowob/agenthub
@shadowob/agenthub ──→ @shadowob/shared
@shadowob/ui ──→ (no internal deps)
@shadowob/shared ──→ (no internal deps)
```

---

## 4. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 19 | UI framework |
| | TanStack Router | latest | Type-safe file-based routing |
| | TanStack Query | latest | Server state management |
| | Zustand | latest | Client state management |
| | Tailwind CSS | 4 | Utility-first styling |
| | Rsbuild (Rspack) | latest | Build tool (fast Rust-based) |
| | i18next + react-i18next | latest | Internationalization |
| | Socket.IO Client | latest | Real-time communication |
| | Lucide React | latest | Icon library |
| **Backend** | Hono | latest | Lightweight web framework |
| | Drizzle ORM | latest | Type-safe SQL ORM |
| | Socket.IO | latest | WebSocket server |
| | Awilix | latest | Dependency injection container |
| | Zod | latest | Runtime schema validation |
| | Pino | latest | Structured logging |
| | bcryptjs + jsonwebtoken | latest | Authentication |
| **Database** | PostgreSQL | 16 | Primary data store |
| | Redis | 7 | Caching, sessions, presence |
| | MinIO | latest | S3-compatible object storage |
| **DevTools** | Biome | 2.0 | Lint + format (replaces ESLint/Prettier) |
| | Vitest | 4 | Unit/integration testing |
| | Husky + lint-staged | latest | Git hooks |
| | Commitlint | latest | Conventional commit enforcement |
| | TypeScript | 5.9 | Type checking |

---

## 5. Development Environment

### Prerequisites

- Node.js >= 22
- pnpm >= 10
- Docker & Docker Compose

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/shadow.git && cd shadow

# 2. Install dependencies
pnpm install

# 3. Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# 4. Push database schema
pnpm db:push

# 5. Start all development servers
pnpm dev
```

### Development URLs

| Service | URL | Notes |
|---------|-----|-------|
| Web Frontend | http://localhost:3000 | Rsbuild dev server |
| Backend API | http://localhost:3002 | Hono HTTP + Socket.IO |
| MinIO Console | http://localhost:9001 | File storage admin |
| Drizzle Studio | `pnpm db:studio` | Database viewer |

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in dev mode (parallel) |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Check code with Biome |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Format code with Biome |
| `pnpm test` | Run all tests with Vitest |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:push` | Push schema directly (dev) |
| `pnpm db:studio` | Open Drizzle Studio GUI |

### Dev Server Proxy

The Rsbuild dev server proxies these paths to the backend (port 3002):
- `/api/*` → `http://localhost:3002` (REST API)
- `/socket.io/*` → `http://localhost:3002` (WebSocket, with `ws: true`)

---

## 6. Coding Standards

### File Naming

- **kebab-case** for all filenames: `user.dao.ts`, `auth.service.ts`, `message-bubble.tsx`
- Component files: `component-name.tsx`
- Store files: `domain.store.ts`
- Type files: `domain.ts` (in `shared/types/`)

### TypeScript

- **Strict mode** enabled (`strict: true`, `noUncheckedIndexedAccess: true`)
- ESM modules (`"type": "module"`)
- Target: ES2022
- Module resolution: `bundler`
- No `any` — use `unknown` and narrow with type guards
- Prefer interfaces over type aliases for object shapes

### Code Style (Biome)

- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: None (ASI)
- **Trailing commas**: Everywhere
- **Line width**: 100 characters
- **Unused imports**: Warning
- **Unused variables**: Warning

### Git Conventions

- **Branching**: `main` → `feat/xxx`, `fix/xxx`, `docs/xxx`
- **Commits**: Conventional Commits format
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
  - Example: `feat(chat): add emoji reactions to messages`
- **Pre-commit**: Biome check + lint-staged via Husky

### Import Order

1. External packages (`react`, `hono`, `drizzle-orm`)
2. Workspace packages (`@shadowob/shared`, `@shadowob/ui`)
3. Internal aliases (`@/components/...`, `../../lib/...`)
4. Styles

---

## 7. Data Model

### Entity Relationship

```
users ─────┐
            ├──< members >──┤
servers ───┘                 │
  │                          │
  └──< channels              │
        │                    │
        └──< messages ──────┘
              │
              ├──< reactions
              ├──< attachments
              └──< threads
                    └──< messages (thread replies)

users ──< dm_channels >── users
agents ──< (registered in channels)
notifications ──< (per user)
```

### Core Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `users` | id, email, username, displayName, avatarUrl, status, passwordHash | status: online/idle/dnd/offline |
| `servers` | id, name, iconUrl, ownerId, inviteCode | Auto-generated invite code |
| `channels` | id, serverId, name, type, topic, position | type: text/voice/announcement |
| `messages` | id, channelId, userId, content, threadId, editedAt | Soft reference to threads |
| `members` | id, userId, serverId, role, nickname | role: owner/admin/member |
| `threads` | id, messageId, channelId, title | Threads attached to parent messages |
| `attachments` | id, messageId, fileName, fileUrl, fileSize, mimeType | S3 storage references |
| `reactions` | id, messageId, userId, emoji | Unique per user+message+emoji |
| `agents` | id, name, description, avatarUrl, status, capabilities | AI agents metadata |
| `dm_channels` | id, user1Id, user2Id | Direct message channels |
| `notifications` | id, userId, type, title, body, read | In-app notifications |

### Schema Location

All Drizzle schemas: `apps/server/src/db/schema/*.ts`

Drizzle config: `apps/server/drizzle.config.ts`

---

## 8. API Design

### Authentication

All authenticated endpoints require: `Authorization: Bearer <token>`

#### Auth Routes (`/api/auth/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | No | Register new user |
| POST | `/login` | No | Login, returns tokens |
| GET | `/me` | Yes | Get current user profile |
| PATCH | `/me` | Yes | Update profile (displayName, avatarUrl) |

#### Server Routes (`/api/servers/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Yes | List user's servers |
| POST | `/` | Yes | Create a server |
| PATCH | `/:id` | Yes | Update server (name, icon) |
| DELETE | `/:id` | Yes | Delete server (owner only) |
| POST | `/join` | Yes | Join via invite code |
| GET | `/:id/members` | Yes | List server members |

#### Channel Routes (`/api/servers/:serverId/channels/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Yes | List channels in server |
| POST | `/` | Yes | Create channel |
| PATCH | `/:channelId` | Yes | Update channel |
| DELETE | `/:channelId` | Yes | Delete channel |

#### Message Routes (`/api/channels/:channelId/messages/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Yes | Get messages (cursor pagination) |
| POST | `/` | Yes | Send message |
| PATCH | `/:messageId` | Yes | Edit message |
| DELETE | `/:messageId` | Yes | Delete message |
| POST | `/:messageId/reactions` | Yes | Add reaction |
| DELETE | `/:messageId/reactions/:emoji` | Yes | Remove reaction |

#### Media Routes (`/api/media/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/upload` | Yes | Upload file (multipart) |

### Request/Response Format

- Content-Type: `application/json`
- Validation: Zod schemas in `apps/server/src/validators/`
- Error format: `{ error: string, details?: unknown }`

### Validation Files

Each domain has a corresponding validator:
- `apps/server/src/validators/auth.validator.ts`
- `apps/server/src/validators/server.validator.ts`
- `apps/server/src/validators/channel.validator.ts`
- `apps/server/src/validators/message.validator.ts`

---

## 9. WebSocket Protocol

### Connection

```typescript
import { io } from 'socket.io-client'

const socket = io('http://localhost:3002', {
  auth: { token: '<JWT>' },
})
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `channel:join` | `{ channelId }` | Join a channel room |
| `channel:leave` | `{ channelId }` | Leave a channel room |
| `message:send` | `{ channelId, content, threadId? }` | Send a message |
| `typing:start` | `{ channelId }` | Start typing indicator |
| `typing:stop` | `{ channelId }` | Stop typing indicator |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `Message` object | New message received |
| `message:update` | `Message` object | Message edited |
| `message:delete` | `{ messageId, channelId }` | Message deleted |
| `reaction:add` | `{ messageId, emoji, userId }` | Reaction added |
| `reaction:remove` | `{ messageId, emoji, userId }` | Reaction removed |
| `typing:update` | `{ channelId, users[] }` | Typing users update |
| `presence:update` | `{ userId, status }` | User status change |
| `member:join` | `{ member, serverId }` | New member joined |
| `member:leave` | `{ userId, serverId }` | Member left |
| `notification:new` | `Notification` object | New notification |
| `server:update` | `Server` object | Server details changed |

### Gateway Files

- `apps/server/src/ws/chat.gateway.ts` — message & typing events
- `apps/server/src/ws/presence.gateway.ts` — online status
- `apps/server/src/ws/notification.gateway.ts` — push notifications
- `apps/server/src/ws/index.ts` — gateway registration

---

## 10. Frontend Architecture

### Routing (TanStack Router)

Routes are defined in `apps/web/src/main.tsx`:

```typescript
// Root layout with auth check
const appRoute = createRoute({ ... })

// Public routes
'/' → HomePage
'/login' → LoginPage
'/register' → RegisterPage
'/features' → FeaturesPage
'/agents' → AgentMarketPage
'/pricing' → PricingPage
'/docs' → DocsPage

// Authenticated routes
'/app' → AppLayout (server list + main content)
'/app/servers/$serverId' → ServerPage
'/settings' → SettingsPage
```

### State Management

| Store | Location | Purpose |
|-------|----------|---------|
| `useAuthStore` | `stores/auth.store.ts` | User auth state, tokens, login/logout |
| `useChatStore` | `stores/chat.store.ts` | Active server/channel, messages, members |

**Zustand patterns**:
- Use `persist` middleware for auth store (localStorage)
- Keep stores flat and focused
- Derive state in components, not in stores

### Component Organization

```
components/
├── channel/
│   └── channel-sidebar.tsx    # Channel list + creation dialog
├── chat/
│   ├── chat-area.tsx          # Message list + scroll management
│   ├── message-bubble.tsx     # Individual message with reactions
│   └── message-input.tsx      # Input with file upload + emoji
├── common/
│   ├── avatar.tsx             # User avatar with fallback
│   └── language-switcher.tsx  # i18n language dropdown
├── layout/
│   └── app-layout.tsx         # Main app shell (3-column)
├── member/
│   └── member-list.tsx        # Online/offline member sidebar
└── server/
    └── server-sidebar.tsx     # Server icon list + create dialog
```

### API Client

```typescript
// apps/web/src/lib/api.ts
import { hc } from 'hono/client'

// Type-safe RPC client for backend endpoints
export const fetchApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  // Automatically adds auth token, handles errors
}
```

### CSS Architecture

- **Tailwind CSS v4** with PostCSS plugin (`@tailwindcss/postcss`)
- No `tailwind.config.js` — uses CSS-native `@theme` block in `globals.css`
- Custom theme variables defined in `@theme { ... }` block
- Global reset styles in `@layer base { ... }`
- Component-specific styles should use Tailwind utilities inline

---

## 11. Backend Architecture

### Layered Architecture

```
HTTP Request
    │
    ▼
┌───────────────┐
│   Middleware   │  auth.middleware.ts — JWT verification
│                │  error.middleware.ts — global error handler
│                │  logger.middleware.ts — request logging
└───────┬───────┘
        ▼
┌───────────────┐
│   Handlers    │  Route handlers — parse request, call service, return response
│   (9 files)   │  Location: apps/server/src/handlers/
└───────┬───────┘
        ▼
┌───────────────┐
│   Services    │  Business logic — validation, authorization, orchestration
│   (10 files)  │  Location: apps/server/src/services/
└───────┬───────┘
        ▼
┌───────────────┐
│     DAOs      │  Data Access — SQL queries via Drizzle ORM
│   (6 files)   │  Location: apps/server/src/dao/
└───────┬───────┘
        ▼
┌───────────────┐
│   Database    │  PostgreSQL via Drizzle ORM + postgres.js driver
└───────────────┘
```

### Dependency Injection (Awilix)

```typescript
// apps/server/src/container.ts
import { createContainer, asClass, asValue } from 'awilix'

const container = createContainer({ injectionMode: 'PROXY' })

container.register({
  // Infrastructure
  db: asValue(db),
  
  // DAOs
  userDao: asClass(UserDao).singleton(),
  serverDao: asClass(ServerDao).singleton(),
  // ...
  
  // Services
  authService: asClass(AuthService).singleton(),
  serverService: asClass(ServerService).singleton(),
  // ...
})
```

**Rules:**
- All classes receive dependencies via constructor injection
- Register everything as singletons
- DAOs depend on `db` only
- Services depend on DAOs and other services
- Handlers depend on services
- Never import service instances directly — always through the container

### Adding a New Handler

```typescript
// apps/server/src/handlers/example.handler.ts
import type { Context } from 'hono'
import type { AwilixContainer } from 'awilix'

export function createExampleHandlers(container: AwilixContainer) {
  return {
    getAll: async (c: Context) => {
      const service = container.resolve('exampleService')
      const result = await service.getAll()
      return c.json(result)
    },
    create: async (c: Context) => {
      const service = container.resolve('exampleService')
      const body = await c.req.json()
      const result = await service.create(body)
      return c.json(result, 201)
    },
  }
}
```

---

## 12. AgentHub & MCP

### Overview

AgentHub (`@shadowob/agenthub`) provides the runtime for AI agents to participate in Shadow conversations via the MCP (Model Context Protocol) standard.

### Architecture

```
┌──────────────────┐
│  Agent Adapters  │  claude, cursor, mcp, custom
│  (LLM Providers) │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Agent Registry  │  Registration, discovery, lifecycle
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Agent Gateway   │  MCP protocol handling, message routing
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Agent Runtime   │  Docker sandbox (isolation, resource limits)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Shadow Backend  │  WebSocket client for real-time chat
└──────────────────┘
```

### Available Adapters

| Adapter | File | Purpose |
|---------|------|---------|
| `BaseAdapter` | `base.adapter.ts` | Abstract base class for all adapters |
| `ClaudeAdapter` | `claude.adapter.ts` | Anthropic Claude integration |
| `CursorAdapter` | `cursor.adapter.ts` | Cursor AI integration |
| `McpAdapter` | `mcp.adapter.ts` | Generic MCP-compatible server |
| `CustomAdapter` | `custom.adapter.ts` | Custom agent implementation |

### Creating a New Agent Adapter

```typescript
import { BaseAdapter } from '@shadowob/agenthub'

export class MyAdapter extends BaseAdapter {
  name = 'my-agent'
  description = 'Description of what this agent does'

  async handleMessage(message: {
    content: string
    channelId: string
    userId: string
  }) {
    const reply = await this.callLLM(message.content)
    return { content: reply }
  }
}
```

---

## 13. i18n (Internationalization)

### Supported Languages

| Code | Language | Flag |
|------|----------|------|
| `zh-CN` | 简体中文 (Simplified Chinese) | 🇨🇳 |
| `zh-TW` | 繁體中文 (Traditional Chinese) | 🇹🇼 |
| `en` | English | 🇺🇸 |
| `ja` | 日本語 (Japanese) | 🇯🇵 |
| `ko` | 한국어 (Korean) | 🇰🇷 |

### Configuration

- **Config file**: `apps/web/src/lib/i18n.ts`
- **Translation files**: `apps/web/src/lib/locales/{lang}.json`
- **Detection order**: localStorage (`shadow-lang`) → browser navigator
- **Fallback**: `zh-CN`

### Translation Namespaces

| Namespace | Description |
|-----------|-------------|
| `common` | Shared UI strings (buttons, labels, brand) |
| `nav` | Navigation bar |
| `home` | Homepage (hero, features, CTA) |
| `auth` | Login/register forms |
| `settings` | Settings page |
| `server` | Server sidebar & creation |
| `channel` | Channel sidebar & creation |
| `chat` | Chat area, messages, input |
| `member` | Member list |
| `features` | Features page |
| `agents` | Agent marketplace page |
| `pricing` | Pricing page |
| `docs` | Documentation page |

### Usage in Components

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  
  return (
    <div>
      <h1>{t('namespace.key')}</h1>
      <p>{t('chat.welcomeChannel', { channelName: 'general' })}</p>
    </div>
  )
}
```

### Adding a New Language

1. Create `apps/web/src/lib/locales/{code}.json` (copy from `zh-CN.json`)
2. Translate all keys
3. Add to `supportedLanguages` array in `apps/web/src/lib/i18n.ts`
4. Import and register in `i18n.init({ resources: { ... } })`

### Adding New Translation Keys

1. Add key to **all** JSON files in `apps/web/src/lib/locales/`
2. Use consistent namespace prefixes
3. Use `{{variable}}` for interpolation: `"greeting": "Hello, {{name}}!"`

---

## 14. Testing Strategy

### Configuration

- **Framework**: Vitest 4
- **Config**: `vitest.config.ts` (root)
- **Globals**: Enabled (`test`, `expect`, `describe`, `it` without imports)
- **Coverage**: V8 provider, reporters: text, json, html

### Test Locations

| Package | Path | Focus |
|---------|------|-------|
| `@shadowob/server` | `apps/server/__tests__/` | DI container, E2E, validators |
| `@shadowob/shared` | `packages/shared/__tests__/` | Constants, utility functions |
| `@shadowob/agenthub` | `packages/agenthub/__tests__/` | Agent registry |

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @shadowob/server test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage
```

### Test File Naming

- Unit tests: `*.test.ts` or `*.spec.ts`
- Located alongside source or in `__tests__/` directory

---

## 15. Deployment

### Docker Compose (Production)

```bash
# Build and start
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose exec server pnpm db:push
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://shadow:shadow@localhost:5432/shadow` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET` | (required) | Secret for JWT signing |
| `MINIO_ENDPOINT` | `localhost` | MinIO/S3 endpoint |
| `MINIO_PORT` | `9000` | MinIO/S3 port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO/S3 access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO/S3 secret key |
| `PORT` | `3002` | Backend server port |

### Production Checklist

- [ ] Configure HTTPS via reverse proxy (Nginx/Caddy)
- [ ] Set strong `JWT_SECRET`
- [ ] Enable PostgreSQL connection pooling (PgBouncer)
- [ ] Configure Redis Sentinel/Cluster for HA
- [ ] Use external S3 instead of MinIO for production
- [ ] Set up log collection (ELK/Loki)
- [ ] Configure monitoring (Prometheus + Grafana)

---

## 16. Adding New Features — Step-by-Step Guide

This section provides a concrete workflow for implementing a new feature end-to-end. Follow these steps to ensure consistency with the existing codebase.

### Example: Adding a "Bookmarks" Feature

#### Step 1: Define Shared Types

```typescript
// packages/shared/src/types/bookmark.ts
export interface Bookmark {
  id: string
  userId: string
  messageId: string
  note?: string
  createdAt: string
}
```

Export from `packages/shared/src/types/index.ts`:
```typescript
export * from './bookmark'
```

#### Step 2: Create Database Schema

```typescript
// apps/server/src/db/schema/bookmarks.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { messages } from './messages'

export const bookmarks = pgTable('bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  messageId: uuid('message_id').notNull().references(() => messages.id),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

Export from `apps/server/src/db/schema/index.ts`.

Run: `pnpm db:generate && pnpm db:push`

#### Step 3: Create DAO

```typescript
// apps/server/src/dao/bookmark.dao.ts
import { eq, and } from 'drizzle-orm'
import { bookmarks } from '../db/schema'

export class BookmarkDao {
  constructor(private db: any) {}

  async findByUser(userId: string) {
    return this.db.select().from(bookmarks).where(eq(bookmarks.userId, userId))
  }

  async create(data: { userId: string; messageId: string; note?: string }) {
    const [result] = await this.db.insert(bookmarks).values(data).returning()
    return result
  }

  async delete(id: string, userId: string) {
    await this.db.delete(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
  }
}
```

#### Step 4: Create Service

```typescript
// apps/server/src/services/bookmark.service.ts
import type { BookmarkDao } from '../dao/bookmark.dao'

export class BookmarkService {
  constructor(private bookmarkDao: BookmarkDao) {}

  async getUserBookmarks(userId: string) {
    return this.bookmarkDao.findByUser(userId)
  }

  async addBookmark(userId: string, messageId: string, note?: string) {
    return this.bookmarkDao.create({ userId, messageId, note })
  }

  async removeBookmark(id: string, userId: string) {
    return this.bookmarkDao.delete(id, userId)
  }
}
```

#### Step 5: Create Validator

```typescript
// apps/server/src/validators/bookmark.validator.ts
import { z } from 'zod'

export const createBookmarkSchema = z.object({
  messageId: z.string().uuid(),
  note: z.string().max(500).optional(),
})
```

#### Step 6: Create Handler

```typescript
// apps/server/src/handlers/bookmark.handler.ts
import type { Context } from 'hono'
import type { AwilixContainer } from 'awilix'

export function createBookmarkHandlers(container: AwilixContainer) {
  return {
    list: async (c: Context) => {
      const userId = c.get('userId')
      const service = container.resolve('bookmarkService')
      return c.json(await service.getUserBookmarks(userId))
    },
    create: async (c: Context) => {
      const userId = c.get('userId')
      const body = await c.req.json()
      const service = container.resolve('bookmarkService')
      return c.json(await service.addBookmark(userId, body.messageId, body.note), 201)
    },
    delete: async (c: Context) => {
      const userId = c.get('userId')
      const id = c.req.param('id')
      const service = container.resolve('bookmarkService')
      await service.removeBookmark(id, userId)
      return c.json({ success: true })
    },
  }
}
```

#### Step 7: Register in DI Container

```typescript
// apps/server/src/container.ts — add:
import { BookmarkDao } from './dao/bookmark.dao'
import { BookmarkService } from './services/bookmark.service'

container.register({
  // ... existing registrations
  bookmarkDao: asClass(BookmarkDao).singleton(),
  bookmarkService: asClass(BookmarkService).singleton(),
})
```

#### Step 8: Add Routes

```typescript
// apps/server/src/app.ts — add:
const bookmarkHandlers = createBookmarkHandlers(container)

app.get('/api/bookmarks', authMiddleware, bookmarkHandlers.list)
app.post('/api/bookmarks', authMiddleware, bookmarkHandlers.create)
app.delete('/api/bookmarks/:id', authMiddleware, bookmarkHandlers.delete)
```

#### Step 9: Frontend — Add API Call + Store

```typescript
// apps/web/src/lib/api.ts — or create a new hook
export function useBookmarks() {
  return useQuery({
    queryKey: ['bookmarks'],
    queryFn: () => fetchApi<Bookmark[]>('/api/bookmarks'),
  })
}
```

#### Step 10: Frontend — Create Component

```tsx
// apps/web/src/components/chat/bookmark-button.tsx
import { useTranslation } from 'react-i18next'
import { Bookmark } from 'lucide-react'

export function BookmarkButton({ messageId }: { messageId: string }) {
  const { t } = useTranslation()
  // ... implement with useMutation for add/remove
}
```

#### Step 11: Add i18n Keys

Add to all 5 locale files:
```json
{
  "bookmark": {
    "add": "Add Bookmark",
    "remove": "Remove Bookmark",
    "title": "My Bookmarks",
    "empty": "No bookmarks yet"
  }
}
```

#### Step 12: Write Tests

```typescript
// apps/server/__tests__/bookmark.test.ts
describe('BookmarkService', () => {
  it('should create a bookmark', async () => { ... })
  it('should list user bookmarks', async () => { ... })
  it('should delete own bookmark', async () => { ... })
})
```

### Feature Implementation Checklist

- [ ] Types in `@shadowob/shared`
- [ ] Database schema in `apps/server/src/db/schema/`
- [ ] DAO in `apps/server/src/dao/`
- [ ] Service in `apps/server/src/services/`
- [ ] Validator in `apps/server/src/validators/`
- [ ] Handler in `apps/server/src/handlers/`
- [ ] Register in DI container (`container.ts`)
- [ ] Add routes (`app.ts`)
- [ ] Frontend API hook / TanStack Query
- [ ] Frontend component(s)
- [ ] i18n keys in all 5 locale files
- [ ] Tests
- [ ] Any WebSocket events (if real-time needed)
