# Architecture

> Shadow (虾豆) — A Discord-like team collaboration platform with built-in multi-AI-Agent support, real-time messaging, marketplace, and P2P rental system.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [System Architecture](#system-architecture)
- [Monorepo Structure](#monorepo-structure)
- [Tech Stack](#tech-stack)
- [Backend Architecture](#backend-architecture)
  - [Layered Design](#layered-design)
  - [Dependency Injection](#dependency-injection)
  - [HTTP Route Handlers](#http-route-handlers)
  - [WebSocket Gateways](#websocket-gateways)
  - [Middleware](#middleware)
  - [Validation](#validation)
- [Frontend Architecture](#frontend-architecture)
  - [Web App](#web-app)
  - [Admin Dashboard](#admin-dashboard)
  - [State Management](#state-management)
  - [Routing](#routing)
- [Shared Packages](#shared-packages)
- [Database Design](#database-design)
  - [Entity-Relationship Overview](#entity-relationship-overview)
  - [Core Communication Tables](#core-communication-tables)
  - [Agent Tables](#agent-tables)
  - [OAuth Tables](#oauth-tables)
  - [Shop & Commerce Tables](#shop--commerce-tables)
  - [Rental Marketplace Tables](#rental-marketplace-tables)
  - [Workspace Tables](#workspace-tables)
  - [Task Center Tables](#task-center-tables)
  - [Notification Tables](#notification-tables)
  - [Miscellaneous Tables](#miscellaneous-tables)
- [Key Data Flows](#key-data-flows)
  - [Authentication Flow](#authentication-flow)
  - [Real-Time Messaging Flow](#real-time-messaging-flow)
  - [P2P Rental Lifecycle](#p2p-rental-lifecycle)
  - [Shop Purchase Flow](#shop-purchase-flow)
- [Infrastructure](#infrastructure)
- [Module Dependency Graph](#module-dependency-graph)

---

## High-Level Overview

Shadow is a monorepo comprising **3 deployable applications** and **5 shared packages**, backed by **PostgreSQL**, **Redis**, and **MinIO** (S3-compatible object storage). The platform offers:

- **Servers & Channels** — Discord-style workspaces with text/voice/announcement channels
- **Real-time Chat** — Socket.IO messaging with Markdown, reactions, threads, and file attachments
- **Multi-Agent Collaboration** — AI agents join channels and respond via MCP (Model Context Protocol)
- **OAuth Provider** — Shadow acts as an OAuth 2.0 provider for third-party apps
- **Shop & Commerce** — Per-server shops with products, SKUs, wallet (虾币), orders, and entitlements
- **P2P Rental Marketplace** — OpenClaw device rental with contracts, usage billing, and violation handling
- **Workspace** — File/folder document collaboration within servers
- **Task Center** — Gamified task completion and reward distribution
- **Internationalization** — zh-CN, zh-TW, en, ja, ko via i18next

---

## System Architecture

```
                         ┌──────────────┐    ┌──────────────┐
                         │   Web App    │    │ Admin Panel  │
                         │  (React SPA) │    │ (React SPA)  │
                         │  :3000       │    │  :3001       │
                         └──────┬───────┘    └──────┬───────┘
                                │ HTTP / WS         │ HTTP
                                ▼                   ▼
┌─────────────┐        ┌───────────────────────────────────────┐
│  OpenClaw   │───────▶│           API Server (Hono)           │
│  Agents     │  WS    │              :3002                    │
│  (MCP)      │        │                                       │
└─────────────┘        │  ┌─────────┐  ┌──────────┐  ┌──────┐ │
                       │  │Handlers │→ │ Services │→ │ DAOs │ │
                       │  └─────────┘  └──────────┘  └──┬───┘ │
                       │  ┌──────────────┐  ┌────────┐  │     │
                       │  │ Socket.IO WS │  │Awilix  │  │     │
                       │  │  Gateways    │  │  DI    │  │     │
                       │  └──────────────┘  └────────┘  │     │
                       └────────┬──────────┬────────────┘     │
                                │          │          │
                                ▼          ▼          ▼
                          ┌──────────┐ ┌───────┐ ┌───────┐
                          │PostgreSQL│ │ Redis │ │ MinIO │
                          │   :5432  │ │:16379 │ │ :9000 │
                          └──────────┘ └───────┘ └───────┘
```

---

## Monorepo Structure

```
shadow/
├── apps/
│   ├── server/          # Hono API server + Socket.IO (Node.js)
│   ├── web/             # Main React SPA (user-facing)
│   └── admin/           # Admin dashboard (React SPA)
├── packages/
│   ├── shared/          # Shared types, constants, and utilities
│   ├── sdk/             # Typed REST client + Socket.IO wrapper
│   ├── ui/              # Reusable UI components (Radix UI + Tailwind)
│   ├── oauth/           # OAuth SDK for third-party integrations
│   ├── openclaw/        # OpenClaw channel plugin for AI agents
│   └── agenthub/        # Agent hub (reserved)
├── scripts/             # CI/build helper scripts
├── docs/                # Documentation
├── docker-compose.yml   # Full-stack container orchestration
├── pnpm-workspace.yaml  # Monorepo workspace config
├── biome.json           # Linter + formatter config
├── vitest.config.ts     # Test runner config
└── tsconfig.json        # Root TypeScript config
```

Workspace packages are managed by **pnpm** with the `workspace:*` protocol for internal dependencies.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js ≥ 22 | Server runtime |
| **Language** | TypeScript 5.9 | End-to-end type safety |
| **Backend Framework** | Hono 4 | Lightweight HTTP framework |
| **ORM** | Drizzle ORM 0.44 | Type-safe SQL queries + migrations |
| **DI Container** | Awilix 12 | Singleton dependency injection |
| **Validation** | Zod 3 | Runtime schema validation |
| **WebSocket** | Socket.IO 4 | Bidirectional real-time events |
| **Auth** | JWT (jsonwebtoken) + bcryptjs | Token-based with password hashing |
| **Logging** | Pino 9 | Structured JSON logging |
| **Database** | PostgreSQL 16 | Primary data store |
| **Cache** | Redis 7 | Session cache and pub/sub |
| **Object Storage** | MinIO | S3-compatible file/media storage |
| **Frontend Framework** | React 19 | UI rendering |
| **Router** | TanStack Router | Type-safe client routing |
| **Data Fetching** | TanStack Query 5 | Server state caching |
| **State Management** | Zustand 5 | Client state |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **Build Tool** | RSBuild 1.3 | Frontend bundler |
| **Backend Bundler** | tsup 8 | Server build |
| **Linter/Formatter** | Biome 2.4 | All-in-one code quality |
| **Testing** | Vitest 4 | Unit + integration tests |
| **Package Manager** | pnpm 10 | Fast, disk-efficient monorepo |
| **Git Hooks** | Husky + lint-staged | Pre-commit quality gates |
| **Commit Convention** | Commitlint (Conventional Commits) | Enforce commit messages |

---

## Backend Architecture

### Layered Design

The server follows a strict layered architecture with unidirectional dependencies:

```
HTTP Request
    │
    ▼
┌─────────────────────────────────────────┐
│  Handlers (Route Controllers)           │  ← Parse request, call services
├─────────────────────────────────────────┤
│  Services (Business Logic)              │  ← Orchestrate DAOs, enforce rules
├─────────────────────────────────────────┤
│  DAOs (Data Access Objects)             │  ← Drizzle queries, zero business logic
├─────────────────────────────────────────┤
│  Database (PostgreSQL via Drizzle ORM)  │  ← Schema + migrations
└─────────────────────────────────────────┘
```

- **Handlers** validate input (Zod), extract auth context, delegate to services, and return HTTP responses.
- **Services** contain all business logic, coordinate across multiple DAOs, and emit side effects (e.g., wallet debits, WebSocket events).
- **DAOs** are thin query layers — each maps to one database table (or a small group of related tables).
- No layer may import from a layer above it.

### Dependency Injection

All services, DAOs, and infrastructure are registered as **singletons** in an [Awilix](https://github.com/jeffijoe/awilix) container (`container.ts`). The container cradle exposes:

- **Infrastructure**: `db`, `logger`, `io` (Socket.IO server)
- **26 DAOs**: `userDao`, `serverDao`, `channelDao`, `messageDao`, `agentDao`, `shopDao`, `walletDao`, `orderDao`, `clawListingDao`, `rentalContractDao`, etc.
- **25 Services**: `authService`, `serverService`, `channelService`, `messageService`, `agentService`, `shopService`, `walletService`, `rentalService`, `oauthService`, `taskCenterService`, etc.

### HTTP Route Handlers

17 handler modules are mounted on the Hono application:

| Handler | Mount Path | Domain |
|---------|-----------|--------|
| `auth.handler` | `/api/auth` | Registration, login, profile |
| `oauth.handler` | `/api/oauth` | OAuth 2.0 provider endpoints |
| `server.handler` | `/api/servers` | Server CRUD, membership |
| `channel.handler` | `/api` | Channel CRUD, members |
| `message.handler` | `/api` | Messages, reactions, threads |
| `dm.handler` | `/api` | Direct messages |
| `search.handler` | `/api` | Full-text search |
| `notification.handler` | `/api` | Notifications, preferences |
| `media.handler` | `/api/media` | File upload/download (MinIO) |
| `app.handler` | `/api` | Server apps (iframe) |
| `workspace.handler` | `/api` | Workspace file tree |
| `agent.handler` | `/api/agents` | Agent lifecycle |
| `invite.handler` | `/api/invite-codes` | Invite code management |
| `shop.handler` | `/api` | Shop, products, cart, orders |
| `rental.handler` | `/api/rental` | P2P rental marketplace |
| `task-center.handler` | `/api` | Tasks and rewards |
| `admin.handler` | `/api/admin` | Admin operations |

### WebSocket Gateways

Socket.IO gateways handle real-time events:

| Gateway | Events |
|---------|--------|
| **Chat** | `channel:join/leave`, `message:send/update/delete`, `reaction:add/remove`, `typing:start/stop` |
| **Presence** | `presence:update` (online, idle, dnd, offline) |
| **Notification** | `notification:new`, `notification:read` |
| **App** | `app:message` (buddy interaction), `app:broadcast` (app state sync) |

### Middleware

| Middleware | Purpose |
|-----------|---------|
| `auth.middleware` | JWT verification from `Authorization: Bearer` header |
| `permission.middleware` | Role-based access control (owner/admin/member) |
| `logger.middleware` | Request/response structured logging (Pino) |
| `error.middleware` | Global error normalization and JSON responses |

### Validation

All request payloads are validated with **Zod** schemas (9 validator files):

`auth.schema` · `server.schema` · `channel.schema` · `message.schema` · `app.schema` · `oauth.schema` · `workspace.schema` · `shop.schema` · `rental.schema`

---

## Frontend Architecture

### Web App

The primary user-facing application (`apps/web/`) is a React 19 SPA built with RSBuild.

**Key directories:**

```
apps/web/src/
├── main.tsx               # Router definition + React mount
├── components/
│   ├── chat/              # Message area, input, bubbles, files
│   ├── common/            # Avatar, emoji picker, dialogs
│   ├── workspace/         # Workspace editor, file picker
│   └── layout/            # Root and app layout shells
├── pages/                 # 28 route pages
├── stores/                # 7 Zustand stores
├── hooks/                 # Custom React hooks
├── lib/                   # API client, socket, i18n, utilities
│   └── locales/           # en, zh-CN, zh-TW, ja, ko
├── styles/                # Global CSS (Tailwind v4)
└── public/                # Static assets
```

**Dev server proxy configuration** (RSBuild):
- `/api` → `http://localhost:3002` (API Server)
- `/socket.io` → `http://localhost:3002` (WebSocket)
- `/shadow` → `http://localhost:9000` (MinIO media)

### Admin Dashboard

A minimal admin panel (`apps/admin/`) for platform management. Uses the same tech stack as the web app. Features include user management, server analytics, and system stats.

### State Management

```
┌─────────────────────────────────────────┐
│  TanStack React Query (Server State)    │
│  ← API data caching & deduplication     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  Zustand Stores (Client State)          │
│  ├── auth.store     (user, tokens)      │
│  ├── chat.store     (messages, active   │
│  │                   channel/thread)     │
│  ├── ui.store       (modals, panels)    │
│  ├── app.store      (global app state)  │
│  ├── workspace.store(editor state)      │
│  ├── shop.store     (cart, browsing)    │
│  └── marketplace.store (rental state)   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  React Components (render + subscribe)  │
└─────────────────────────────────────────┘
```

### Routing

Uses **TanStack Router** with two layout levels:

**Public Routes** (RootLayout):
`/`, `/login`, `/register`, `/features`, `/pricing`, `/docs`, `/buddies`, `/buddies/:buddyId/contract`, `/invite/:code`, `/oauth/authorize`, `/oauth-callback`

**Authenticated Routes** (AppLayout — requires JWT):
`/app/settings`, `/app/agents`, `/app/servers/:serverSlug`, `/app/servers/:serverSlug/channels/:channelId`, `/app/servers/:serverSlug/shop`, `/app/workspace`, `/app/marketplace/*`

Route guards use `beforeLoad` hooks that check `useAuthStore.getState().isAuthenticated`.

---

## Shared Packages

### `@shadowob/shared`

Shared types, constants, and utilities consumed by all apps and packages.

| Export | Contents |
|--------|----------|
| **Types** | `User`, `UserProfile`, `Message`, `Attachment`, `Channel`, `Server`, `Thread`, `DmChannel`, `Notification`, etc. |
| **Constants** | `LIMITS` (message length, username bounds, file size caps), `CLIENT_EVENTS`, `SERVER_EVENTS` |
| **Utils** | `generateInviteCode()`, `formatDate()`, `isValidEmail()`, `slugify()` |

### `@shadowob/sdk`

Typed REST client and Socket.IO wrapper for programmatic access to the Shadow API.

- `ShadowClient` — HTTP client with typed methods (`register`, `login`, REST wrappers)
- `ShadowSocket` — Socket.IO connection manager with typed event maps
- Full TypeScript type exports for all domain entities and event payloads

### `@shadowob/ui`

Minimal component library built on Radix UI primitives:

- `Button` (CVA variant system), `Avatar`, `Input`, `cn()` utility
- Dependencies: `@radix-ui/react-avatar`, `@radix-ui/react-slot`, `class-variance-authority`, `tailwind-merge`

### `@shadowob/oauth`

OAuth SDK for third-party applications integrating with Shadow as an OAuth 2.0 provider.

- `ShadowOAuth` client class
- Types: `ShadowOAuthConfig`, `ShadowOAuthScope`, `ShadowOAuthTokens`, `ShadowOAuthUser`

### `@shadowob/openclaw-shadowob`

OpenClaw channel plugin enabling AI agents to interact in Shadow server channels.

- Supports 12 actions: `send`, `reply`, `react`, `edit`, `delete`, `thread-create`, `thread-reply`, `pin`, `unpin`, `sendAttachment`, `update-homepage`, `get-server`
- Capabilities: channel/thread chat, reactions, media, multi-account
- Configurable via YAML with optional multi-account setup
- Connects via Socket.IO for real-time event listening

---

## Database Design

The database contains **42 tables** across 21 schema files, managed by Drizzle ORM with sequential SQL migrations (17 migration files in `apps/server/src/db/migrations/`).

### Entity-Relationship Overview

```
users ─────┬────── servers ──────── channels ──────── messages ──── attachments
           │          │                │                  │           reactions
           │          │          channel_members          │           threads
           │          │                                   │
           │          ├────── members                     │
           │          ├────── shops ──── products ──── skus
           │          │                    │         product_media
           │          │                    │         product_categories
           │          │                    │
           │          ├────── apps         ├──── orders ──── order_items
           │          │                    └──── reviews
           │          ├────── workspaces ──── workspace_nodes
           │          └────── entitlements
           │
           ├────── wallets ──── wallet_transactions
           ├────── agents ──── agent_policies
           ├────── dm_channels
           ├────── notifications ──── notification_preferences
           ├────── oauth_apps ──── oauth_authorization_codes
           │                  ──── oauth_access_tokens
           │                  ──── oauth_refresh_tokens
           │                  ──── oauth_consents
           ├────── oauth_accounts
           ├────── invite_codes
           ├────── user_task_claims
           ├────── user_reward_logs
           └────── claw_listings ──── rental_contracts ──── rental_usage_records
                                                       ──── rental_violations
```

### Core Communication Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **users** | `id`, `email` (unique), `username` (unique), `displayName`, `avatarUrl`, `passwordHash`, `status` (online/idle/dnd/offline), `isBot`, `isAdmin` | User accounts and profiles |
| **servers** | `id`, `name`, `ownerId` → users, `inviteCode` (unique), `isPublic`, `slug`, `iconUrl`, `bannerUrl` | Community workspaces |
| **channels** | `id`, `serverId` → servers, `name`, `type` (text/voice/announcement), `position`, `isPrivate`, `topic` | Communication channels within servers |
| **channel_members** | `id`, `channelId` → channels, `userId` → users | Per-channel access control |
| **members** | `id`, `serverId` → servers, `userId` → users, `role` (owner/admin/member), `nickname` | Server membership and roles |
| **messages** | `id`, `channelId` → channels, `authorId` → users, `content`, `threadId`, `replyToId`, `isEdited`, `isPinned` | Chat messages |
| **threads** | `id`, `channelId`, `parentMessageId`, `creatorId`, `name`, `isArchived` | Message threads |
| **attachments** | `id`, `messageId` → messages, `filename`, `url`, `contentType`, `size`, `width`, `height` | File uploads |
| **reactions** | `id`, `messageId` → messages, `userId` → users, `emoji` | Emoji reactions (unique per user+message+emoji) |
| **dm_channels** | `id`, `userAId` → users, `userBId` → users, `lastMessageAt` | Direct message channels |

### Agent Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **agents** | `id`, `userId` → users, `ownerId` → users, `kernelType`, `config` (jsonb), `containerId`, `status` (running/stopped/error), `lastHeartbeat` | AI agent instances |
| **agent_policies** | `id`, `agentId` → agents, `serverId` → servers, `channelId` (nullable), `listen`, `reply`, `mentionOnly`, `config` (jsonb) | Per-agent, per-server/channel behavior configuration |

### OAuth Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **oauth_apps** | `id`, `userId`, `clientId` (unique), `clientSecretHash`, `redirectUris` (jsonb), `isActive` | Registered OAuth applications |
| **oauth_authorization_codes** | `id`, `code` (unique), `appId`, `userId`, `expiresAt`, `used`, `scope` | Authorization code grant |
| **oauth_access_tokens** | `id`, `tokenHash` (unique), `appId`, `userId`, `expiresAt`, `scope` | Hashed access tokens |
| **oauth_refresh_tokens** | `id`, `tokenHash` (unique), `accessTokenId`, `appId`, `userId`, `expiresAt`, `revoked` | Refresh token storage |
| **oauth_consents** | `id`, `userId`, `appId`, `scope` | User consent records |
| **oauth_accounts** | `id`, `userId`, `provider` (google/github), `providerAccountId`, `providerEmail` | Third-party login links |

### Shop & Commerce Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **shops** | `id`, `serverId` (unique), `name`, `description`, `logoUrl`, `status` (active/suspended/closed), `settings` (jsonb) | One shop per server |
| **product_categories** | `id`, `shopId`, `name`, `slug`, `parentId` (self-ref), `position` | Hierarchical category tree |
| **products** | `id`, `shopId`, `categoryId`, `name`, `slug`, `type` (physical/entitlement), `status` (draft/active/archived), `basePrice`, `currency` (shrimp_coin), `specNames` (jsonb), `tags` (jsonb), `entitlementConfig` (jsonb), `salesCount`, `avgRating` | Product catalog |
| **product_media** | `id`, `productId`, `type` (image/video), `url`, `thumbnailUrl`, `position` | Product gallery |
| **skus** | `id`, `productId`, `specValues` (jsonb), `price`, `stock`, `imageUrl`, `skuCode`, `isActive` | Product variants (size, color, etc.) |
| **wallets** | `id`, `userId` (unique), `balance`, `frozenAmount` | User virtual currency (虾币) balance |
| **wallet_transactions** | `id`, `walletId`, `type` (topup/purchase/refund/reward/transfer/adjustment), `amount`, `balanceAfter`, `currency`, `referenceId`, `note` | Financial ledger |
| **orders** | `id`, `orderNo` (unique), `shopId`, `buyerId`, `status` (8 states), `totalAmount`, `paidAt`, `shippedAt`, `completedAt`, `cancelledAt` | Purchase orders |
| **order_items** | `id`, `orderId`, `productId`, `skuId`, `productName`, `specValues` (jsonb), `price`, `quantity` | Order line items |
| **reviews** | `id`, `productId`, `orderId`, `userId`, `rating` (1-5), `content`, `images` (jsonb), `reply`, `repliedAt` | Product reviews |
| **entitlements** | `id`, `userId`, `serverId`, `orderId`, `productId`, `type` (channel_access/channel_speak/app_access/custom_role/custom), `targetId`, `expiresAt`, `isActive` | Purchased privileges |
| **cart_items** | `id`, `userId`, `shopId`, `productId`, `skuId`, `quantity` | Shopping cart |

### Rental Marketplace Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **claw_listings** | `id`, `ownerId`, `agentId`, `title`, `description`, `skills` (jsonb), `deviceTier` (high_end/mid_range/low_end), `osType` (macos/windows/linux), `deviceInfo` (jsonb), `hourlyRate`, `dailyRate`, `monthlyRate`, `depositAmount`, `listingStatus` (draft/active/paused/expired/closed), `isListed`, `viewCount`, `rentalCount` | P2P rental listings for OpenClaw devices |
| **rental_contracts** | `id`, `contractNo` (unique), `listingId`, `tenantId`, `ownerId`, `status` (pending/active/completed/cancelled/violated/disputed), `listingSnapshot` (jsonb), `hourlyRate`, `platformFeeRate`, `depositAmount`, `startsAt`, `expiresAt`, `terminatedAt`, `totalCost` | Signed rental agreements with frozen terms |
| **rental_usage_records** | `id`, `contractId`, `startedAt`, `endedAt`, `durationMinutes`, `tokensConsumed`, `tokenCost`, `electricityCost`, `rentalCost`, `platformFee`, `totalCost` | Per-session usage billing |
| **rental_violations** | `id`, `contractId`, `violatorId`, `violationType` (owner_self_use/tenant_abuse/terms_violation/other), `description`, `penaltyAmount`, `isPenaltyPaid`, `resolvedAt` | Contract violation reports |

**Rental Pricing Model:**
- Base hourly/daily/monthly rates
- Token fee pass-through (1 虾币 per 1,000 tokens)
- Platform electricity cost (2 虾币/hour)
- Platform fee (5% / 500 BPS)
- Deposit and penalty enforcement

### Workspace Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **workspaces** | `id`, `serverId`, `name`, `description` | Workspace containers within servers |
| **workspace_nodes** | `id`, `workspaceId`, `parentId`, `kind` (dir/file), `name`, `path`, `ext`, `mime`, `sizeBytes`, `contentRef`, `flags` (jsonb) | File tree structure |

### Task Center Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **user_task_claims** | `id`, `userId`, `taskKey`, `cycleKey`, `rewardAmount`, `rewardType`, `metadata` (jsonb) | Task completion records |
| **user_reward_logs** | `id`, `userId`, `rewardKey`, `referenceId`, `amount`, `note`, `metadata` (jsonb), `isRepeatable` | Reward distribution log |

### Notification Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **notifications** | `id`, `userId`, `type` (mention/reply/dm/system), `title`, `body`, `referenceId`, `referenceType`, `isRead` | In-app and real-time notifications |
| **notification_preferences** | `userId` (PK), `strategy` (all/mention_only/none), `mutedServerIds`, `mutedChannelIds` | Per-user notification settings |

### Miscellaneous Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| **invite_codes** | `id`, `code` (unique), `createdBy`, `usedBy`, `note`, `isActive`, `usedAt` | Platform invite codes |
| **apps** | `id`, `serverId`, `publisherId`, `channelId`, `sourceType` (zip/url), `sourceUrl`, `status` (draft/active/archived), `isHomepage`, `version`, `settings` (jsonb), `viewCount`, `userCount` | Embeddable server apps |

---

## Key Data Flows

### Authentication Flow

```
Client                          Server                    Database
  │                                │                          │
  │  POST /api/auth/login          │                          │
  │  { email, password }           │                          │
  │ ──────────────────────────────▶│                          │
  │                                │  Verify password (bcrypt)│
  │                                │ ────────────────────────▶│
  │                                │◀────────────────────────│
  │                                │  Sign JWT                │
  │  { accessToken, refreshToken } │                          │
  │◀──────────────────────────────│                          │
  │                                │                          │
  │  Store tokens (localStorage)   │                          │
  │  All subsequent requests:      │                          │
  │  Authorization: Bearer <token> │                          │
  │ ──────────────────────────────▶│                          │
  │                                │  auth.middleware          │
  │                                │  verifies JWT            │
```

### Real-Time Messaging Flow

```
Sender                    Socket.IO Server               Recipients
  │                              │                           │
  │  message:send                │                           │
  │  { channelId, content }      │                           │
  │ ────────────────────────────▶│                           │
  │                              │  Persist to DB            │
  │                              │  Broadcast to room        │
  │                              │                           │
  │                              │  message:new              │
  │                              │ ─────────────────────────▶│
  │                              │                           │
  │                              │  notification:new         │
  │                              │  (mentions, replies)      │
  │                              │ ─────────────────────────▶│
```

### P2P Rental Lifecycle

```
Contract State Machine:

  pending ──▶ active ──▶ completed
     │            │
     └─▶ cancelled │
                   ├──▶ violated ──▶ completed
                   └──▶ disputed ──▶ completed / violated

Flow:
  1. Owner creates listing (draft → active)
  2. Tenant browses marketplace → estimates cost
  3. Tenant signs contract → deposit deducted from wallet
  4. Usage sessions recorded → tenant debited, owner credited
  5. Contract terminates → deposit refunded
  6. Violations reported → penalties enforced
```

### Shop Purchase Flow

```
  1. Browse products → Add to cart
  2. Create order → Deduct wallet balance (虾币)
  3. For entitlement products → Auto-grant privileges
  4. For physical products → Shipping + tracking
  5. Completion → Review + rating
```

---

## Infrastructure

### Docker Compose Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **postgres** | `postgres:16-alpine` | 5432 | Primary database |
| **redis** | `redis:7-alpine` | 16379→6379 | Cache and pub/sub |
| **minio** | `minio/minio:latest` | 9000 (API), 9001 (Console) | S3-compatible object storage |
| **server** | Built from `apps/server/Dockerfile` | 3002 | API + WebSocket server |
| **web** | Built from `apps/web/Dockerfile` | 3000 | Main web app (Nginx) |
| **admin** | Built from `apps/admin/Dockerfile` | 3001 | Admin dashboard (Nginx) |

### Build Pipeline

- **Server**: Multi-stage Docker build (Node 22 → build → Node 22 Alpine runtime). Auto-runs Drizzle migrations on startup.
- **Web/Admin**: Multi-stage Docker build (Node 22 → RSBuild → Nginx Alpine). Nginx handles SPA routing with `try_files` and proxies API/WebSocket requests to the server.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://shadow:shadow@postgres:5432/shadow` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `JWT_SECRET` | `shadow-dev-secret` | JWT signing secret |
| `JWT_EXPIRES_IN` | `7d` | Token expiration |
| `MINIO_ENDPOINT` | `minio` | MinIO hostname |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO credentials |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO credentials |
| `ADMIN_EMAIL` | `admin@shadowob.app` | Seeded admin account |
| `ADMIN_PASSWORD` | `admin123456` | Seeded admin password |
| `ADMIN_USERNAME` | `admin` | Seeded admin username |
| `OAUTH_BASE_URL` | `http://localhost:3000` | OAuth redirect base |
| `GOOGLE_CLIENT_ID` | — | Google OAuth (optional) |
| `GITHUB_CLIENT_ID` | — | GitHub OAuth (optional) |

---

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                    apps/server                           │
│  Depends on: @shadowob/shared, @shadowob/sdk            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────┐
│                    apps/web                              │
│  Depends on: @shadowob/shared, @shadowob/ui             │
└──────────────────────┼──────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────┐
│                   apps/admin                             │
│  Depends on: @shadowob/shared, @shadowob/ui             │
└──────────────────────┼──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│@shadowob/sdk │ │@shadowob/│ │@shadowob/    │
│  (REST +     │ │  shared  │ │  openclaw    │
│   Socket)    │ │ (types)  │ │ (agent       │
│              │ │          │ │  plugin)     │
│ Depends on:  │ │          │ │              │
│  shared      │ │          │ │ Depends on:  │
└──────────────┘ └──────────┘ │  sdk         │
                              └──────────────┘
                   ┌──────────────┐
                   │@shadowob/    │
                   │  oauth       │
                   │ (OAuth SDK)  │
                   │ (standalone) │
                   └──────────────┘
                   ┌──────────────┐
                   │@shadowob/ui  │
                   │ (components) │
                   │ (standalone) │
                   └──────────────┘
```
