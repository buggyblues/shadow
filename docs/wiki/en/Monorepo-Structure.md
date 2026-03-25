# Monorepo Structure

Shadow uses a **pnpm workspace** monorepo. All apps and packages live in a single repository.

## Top-Level Layout

```
shadow/
├── apps/                    # Deployable applications
│   ├── web/                 # Main React SPA (Rsbuild)
│   ├── admin/               # Admin dashboard (Rsbuild)
│   ├── server/              # Hono API server + Socket.IO
│   ├── desktop/             # Electron desktop client
│   └── mobile/              # Expo / React Native mobile app
├── packages/                # Shared libraries
│   ├── shared/              # @shadowob/shared — types, constants, utils
│   ├── ui/                  # @shadowob/ui — reusable UI components
│   ├── sdk/                 # @shadowob/sdk — typed REST + Socket.IO client
│   ├── sdk-python/          # shadowob-sdk — Python client
│   ├── openclaw/            # @shadowob/openclaw-shadowob — AI agent plugin
│   └── oauth/               # @shadowob/oauth — OAuth SDK
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # Detailed architecture doc
│   ├── wiki/                # Wiki documentation (en/zh)
│   └── development/         # Development guides
├── scripts/                 # CI/CD and build helper scripts
├── website/                 # Documentation website (RSPress)
├── docker-compose.yml       # Infrastructure orchestration
├── biome.json               # Linting & formatting config
├── vitest.config.ts         # Test configuration
├── tsconfig.json            # Root TypeScript config
└── pnpm-workspace.yaml      # Workspace package definitions
```

## App Details

### `apps/web` — Web Application

The main user-facing SPA. Uses Rsbuild for fast builds and HMR.

```
apps/web/src/
├── main.tsx              # Entry point + route definitions
├── components/           # UI components organized by feature
│   ├── channel/          # Channel sidebar, settings
│   ├── chat/             # Message list, input, file preview
│   ├── common/           # Shared components
│   ├── layout/           # App shell, navigation
│   ├── member/           # Member list, profiles
│   └── server/           # Server sidebar, settings
├── pages/                # Route page components
├── stores/               # Zustand stores (auth, chat)
├── hooks/                # Custom React hooks
├── lib/                  # Utilities (API client, socket, i18n)
└── styles/               # Global CSS (Tailwind v4)
```

### `apps/server` — API Server

Hono-based REST API with Socket.IO WebSocket gateways.

```
apps/server/src/
├── index.ts              # Bootstrap: HTTP + Socket.IO + DI
├── app.ts                # Hono app with route registration
├── container.ts          # Awilix DI container setup
├── db/                   # Drizzle schema + migrations
├── dao/                  # Data Access Objects
├── services/             # Business logic layer
├── handlers/             # HTTP route handlers
├── middleware/            # Auth, error, logging, permissions
├── validators/           # Zod validation schemas
├── ws/                   # WebSocket gateways
└── lib/                  # JWT, logger utilities
```

### `apps/desktop` — Desktop Application

Electron app with Rspack (main/preload) and Rsbuild (renderer).

```
apps/desktop/
├── src/
│   ├── main/             # Electron main process
│   ├── preload/          # Preload scripts (context bridge)
│   └── renderer/         # React renderer (shared with web)
├── scripts/              # Build, dev, release, icon generation
├── e2e/                  # Playwright E2E tests
└── forge.config.ts       # Electron Forge configuration
```

### `apps/mobile` — Mobile Application

Expo/React Native app with file-based routing.

```
apps/mobile/
├── app/                  # Expo Router file-based routes
│   ├── (auth)/           # Login, register screens
│   ├── (main)/           # Main app screens (tabs, chat, settings)
│   └── _layout.tsx       # Root layout
├── src/
│   ├── components/       # React Native components
│   ├── hooks/            # Custom hooks
│   ├── stores/           # Zustand stores
│   ├── lib/              # API client, socket, utilities
│   └── i18n/             # Locale files
└── assets/               # Images, fonts
```

## Package Details

### `packages/shared`

Shared TypeScript types, constants, and utility functions used by all apps.

### `packages/ui`

Reusable UI component library built with Radix UI primitives and CVA (Class Variance Authority).

### `packages/sdk`

Typed REST API client and Socket.IO real-time event listener for programmatic access to Shadow servers.

### `packages/sdk-python`

Python SDK providing REST API access and Socket.IO event subscriptions via `httpx` and `python-socketio`.

### `packages/openclaw-shadowob`

OpenClaw plugin that enables AI agents to monitor and interact in Shadow server channels.

### `packages/oauth`

OAuth SDK for third-party applications to integrate with Shadow as an OAuth 2.0 provider.
