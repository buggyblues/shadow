# Architecture Overview

Shadow is a monorepo comprising **5 deployable applications** and **6 shared packages**, backed by PostgreSQL, Redis, and MinIO.

## System Architecture

```
                         ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                         │   Web App    │    │ Admin Panel  │    │  Mobile App  │
                         │  (React SPA) │    │ (React SPA)  │    │   (Expo)     │
                         │  :3000       │    │  :3001       │    │              │
                         └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
                                │ HTTP / WS         │ HTTP              │ HTTP / WS
                                └───────────────────┼──────────────────┘
                                                    ▼
┌─────────────┐        ┌───────────────────────────────────────────────────────────┐
│  OpenClaw   │───────▶│                  API Server (Hono)                        │
│  Agents     │  WS    │                     :3002                                 │
│  (MCP)      │        │                                                           │
└─────────────┘        │  ┌─────────┐    ┌──────────┐    ┌──────┐                  │
                       │  │Handlers │ →  │ Services │ →  │ DAOs │                  │
                       │  └─────────┘    └──────────┘    └──┬───┘                  │
┌─────────────┐        │  ┌──────────────┐  ┌────────┐     │                       │
│  Desktop    │───────▶│  │ Socket.IO WS │  │Awilix  │     │                       │
│ (Electron)  │  WS    │  │  Gateways    │  │  DI    │     │                       │
└─────────────┘        │  └──────────────┘  └────────┘     │                       │
                       └───────────────────────────────────┼───────────────────────┘
                                                           │
                                  ┌────────────────────────┼────────────────┐
                                  ▼                        ▼                ▼
                           ┌───────────┐           ┌───────────┐    ┌───────────┐
                           │PostgreSQL │           │   Redis   │    │   MinIO   │
                           │  (Data)   │           │  (Cache)  │    │   (S3)    │
                           └───────────┘           └───────────┘    └───────────┘
```

## Design Principles

1. **Layered Architecture** — Handler → Service → DAO → Database (strict dependency direction)
2. **Dependency Injection** — Awilix container manages all singletons; never import services directly
3. **Type Safety End-to-End** — Shared types between frontend/backend via `@shadowob/shared`
4. **Monorepo with Workspace Packages** — `apps/*` for deployables, `packages/*` for shared code

## Applications

| App | Path | Description | Tech |
|-----|------|-------------|------|
| **Web** | `apps/web` | Main React SPA | React 19, TanStack Router, Rsbuild |
| **Admin** | `apps/admin` | Admin dashboard | React 19, Rsbuild |
| **Server** | `apps/server` | REST API + WebSocket | Hono, Drizzle, Socket.IO |
| **Desktop** | `apps/desktop` | Native desktop client | Electron 36, Electron Forge |
| **Mobile** | `apps/mobile` | iOS & Android app | Expo 54, React Native |

## Shared Packages

| Package | Path | Description |
|---------|------|-------------|
| `@shadowob/shared` | `packages/shared` | Types, constants, utilities shared across all apps |
| `@shadowob/ui` | `packages/ui` | Reusable UI component library (Radix-based) |
| `@shadowob/sdk` | `packages/sdk` | Typed REST client + Socket.IO event listener |
| `@shadowob/openclaw-shadowob` | `packages/openclaw-shadowob` | OpenClaw agent channel plugin |
| `@shadowob/oauth` | `packages/oauth` | OAuth SDK for third-party apps |
| `shadowob-sdk` (Python) | `packages/sdk-python` | Python client for Shadow API |

## Package Dependency Graph

```
@shadowob/web       ──→ @shadowob/shared, @shadowob/ui
@shadowob/admin     ──→ @shadowob/shared, @shadowob/ui
@shadowob/server    ──→ @shadowob/shared
@shadowob/desktop   ──→ @shadowob/shared
@shadowob/mobile    ──→ @shadowob/shared
@shadowob/sdk       ──→ @shadowob/shared
@shadowob/openclaw-shadowob  ──→ @shadowob/sdk
@shadowob/ui        ──→ (no internal deps)
@shadowob/shared    ──→ (no internal deps)
```

## Backend Architecture

### Layered Design

```
HTTP Request
    │
    ▼
┌──────────────────┐
│    Middleware     │  ← Auth, CORS, logging, error handling
├──────────────────┤
│    Handlers      │  ← Parse request, call service, return response
├──────────────────┤
│    Services      │  ← Business logic, orchestration
├──────────────────┤
│      DAOs        │  ← Data access, Drizzle queries
├──────────────────┤
│    Database      │  ← PostgreSQL + Redis + MinIO
└──────────────────┘
```

### Key Backend Components

- **Hono** — Lightweight web framework for HTTP routing
- **Socket.IO** — WebSocket gateways for chat, presence, notifications
- **Drizzle ORM** — Type-safe SQL with auto-migrations
- **Awilix** — Dependency injection container
- **Zod** — Runtime request validation
- **Pino** — Structured JSON logging

## Frontend Architecture

### State Management

- **TanStack Query** — Server state (API data fetching, caching, invalidation)
- **Zustand** — Client state (auth, UI preferences)

### Routing

- **TanStack Router** — Type-safe file-based routing (web/desktop)
- **Expo Router** — File-based routing (mobile)

### Styling

- **Tailwind CSS v4** — Utility-first CSS (web/desktop)
- **React Native StyleSheet** — Platform-native styling (mobile)

## Data Flow: Real-Time Messaging

```
User types message
    │
    ▼
Client sends HTTP POST /api/channels/:id/messages
    │
    ▼
Server validates → stores in PostgreSQL
    │
    ▼
Server broadcasts via Socket.IO (channel:message)
    │
    ▼
All connected clients in the channel receive the message
    │
    ▼
UI updates reactively via TanStack Query invalidation
```

## Further Reading

- [Tech Stack](Tech-Stack.md) — Detailed technology choices
- [Database Schema](Database-Schema.md) — Table definitions
- [API Reference](API-Reference.md) — Endpoint documentation
