---
name: oauth-open-platform
description: >
  Develop, test, debug, or extend the Shadow OAuth Open Platform — the OAuth 2.0
  Authorization Code flow, App management, Resource APIs (servers, channels,
  messages, workspaces, buddies), SDK packages, and CLI commands.
  USE FOR: adding new OAuth scopes or resource endpoints; debugging token
  exchange or scope enforcement; writing E2E integration tests for the OAuth
  flow; extending the ShadowOAuth SDK or CLI oauth commands.
  NOT FOR: external OAuth login (GitHub/Google SSO — that's external-oauth);
  general REST API endpoints; WebSocket events.
---

# OAuth Open Platform — AI Skill Guide

Shadow exposes a standards-based **OAuth 2.0 Authorization Code** flow so
third-party apps can access Shadow resources on behalf of users.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Third-Party App                                    │
│  (uses @shadowob/oauth SDK)                         │
│                                                     │
│  1. Redirect → /oauth/authorize?client_id=…         │
│  2. Receive callback with ?code=…                   │
│  3. POST /api/oauth/token  →  { access_token, … }  │
│  4. GET  /api/oauth/servers (Bearer oat_…)          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Shadow Developer (logged-in user)                  │
│  (uses @shadowob/sdk ShadowClient or CLI)           │
│                                                     │
│  - POST /api/oauth/apps         → create app        │
│  - GET  /api/oauth/apps         → list my apps      │
│  - PATCH /api/oauth/apps/:id    → update app        │
│  - DELETE /api/oauth/apps/:id   → delete app        │
│  - POST /api/oauth/apps/:id/reset-secret            │
│  - GET  /api/oauth/consents     → list consents     │
│  - POST /api/oauth/revoke       → revoke consent    │
└─────────────────────────────────────────────────────┘
```

## Key Files

```
apps/server/
├── src/
│   ├── handlers/oauth.handler.ts       # All HTTP routes (21 endpoints)
│   ├── services/oauth.service.ts       # Business logic (app mgmt, auth flow, resources)
│   ├── dao/oauth.dao.ts                # Database access (apps, codes, tokens, consents)
│   ├── middleware/oauth-auth.middleware.ts  # Bearer token validation + scope check
│   └── validators/oauth.schema.ts      # Zod request validation schemas
├── __tests__/
│   ├── oauth-service.test.ts           # Unit tests (mock DAO, ~50 cases)
│   ├── oauth-middleware.test.ts         # Middleware unit tests
│   └── oauth-e2e.test.ts              # Integration tests (real DB, ~39 cases)

packages/
├── oauth/                             # Third-party SDK (@shadowob/oauth)
│   └── src/
│       ├── client.ts                  # ShadowOAuth class (14 methods)
│       └── types.ts                   # OAuth types + scope literals
├── sdk/                               # First-party SDK (@shadowob/sdk)
│   └── src/client.ts                  # ShadowClient – OAuth app CRUD + auth flow
└── cli/                               # CLI (@shadowob/cli)
    └── src/commands/oauth.ts          # `shadowob oauth` subcommands

apps/web/src/pages/settings/developer.tsx   # Developer Settings UI
```

## Scopes (16 total)

| Scope              | Description                        |
| ------------------ | ---------------------------------- |
| `user:read`        | Read user profile                  |
| `user:email`       | Read user email address            |
| `servers:read`     | List user's servers                |
| `servers:write`    | Create servers, invite members     |
| `channels:read`    | List channels in a server          |
| `channels:write`   | Create channels                    |
| `messages:read`    | Read message history               |
| `messages:write`   | Send messages                      |
| `attachments:read` | Read attachments                   |
| `attachments:write`| Upload attachments                 |
| `workspaces:read`  | Read workspace info                |
| `workspaces:write` | Modify workspaces                  |
| `buddies:create`   | Create Buddy bot sub-accounts      |
| `buddies:manage`   | Send messages as a Buddy           |
| `commerce:read`    | Check token-user app entitlements  |
| `commerce:write`   | Redeem token-user app entitlements |

## API Endpoints

### App Management (JWT-authenticated)

| Method   | Path                              | Auth     |
| -------- | --------------------------------- | -------- |
| `POST`   | `/api/oauth/apps`                 | JWT      |
| `GET`    | `/api/oauth/apps`                 | JWT      |
| `PATCH`  | `/api/oauth/apps/:appId`          | JWT      |
| `DELETE` | `/api/oauth/apps/:appId`          | JWT      |
| `POST`   | `/api/oauth/apps/:appId/reset-secret` | JWT  |

### Authorization Flow

| Method   | Path                              | Auth     |
| -------- | --------------------------------- | -------- |
| `GET`    | `/api/oauth/authorize`            | JWT      |
| `POST`   | `/api/oauth/authorize`            | JWT      |
| `POST`   | `/api/oauth/token`                | None     |
| `GET`    | `/api/oauth/userinfo`             | Bearer   |

### Consent Management (JWT-authenticated)

| Method   | Path                              | Auth     |
| -------- | --------------------------------- | -------- |
| `GET`    | `/api/oauth/consents`             | JWT      |
| `POST`   | `/api/oauth/revoke`               | JWT      |

### Resource API (OAuth Bearer token)

| Method   | Path                                    | Required Scope     |
| -------- | --------------------------------------- | ------------------ |
| `GET`    | `/api/oauth/servers`                    | `servers:read`     |
| `POST`   | `/api/oauth/servers`                    | `servers:write`    |
| `POST`   | `/api/oauth/servers/:id/invite`         | `servers:write`    |
| `GET`    | `/api/oauth/servers/:id/channels`       | `channels:read`    |
| `POST`   | `/api/oauth/channels`                   | `channels:write`   |
| `GET`    | `/api/oauth/channels/:id/messages`      | `messages:read`    |
| `POST`   | `/api/oauth/channels/:id/messages`      | `messages:write`   |
| `GET`    | `/api/oauth/workspaces/:id`             | `workspaces:read`  |
| `POST`   | `/api/oauth/buddies`                    | `buddies:create`   |
| `POST`   | `/api/oauth/buddies/:id/messages`       | `buddies:manage`   |
| `GET`    | `/api/oauth/commerce/entitlements`      | `commerce:read`    |
| `POST`   | `/api/oauth/commerce/entitlements/redeem` | `commerce:write` |

Commerce endpoints only support `resourceType = "external_app"` and enforce that `resourceId`
equals the caller OAuth app id or starts with `<appId>:`. Scope alone is not enough.

## Token Formats

- **Client ID**: `shadow_<32-hex-chars>` (public)
- **Client Secret**: `shsec_<64-hex-chars>` (server-only, returned once on create)
- **Access Token**: `oat_<64-hex-chars>` (1 hour TTL)
- **Refresh Token**: `ort_<64-hex-chars>` (30 day TTL, single-use rotation)

## CLI Commands

```bash
shadowob oauth list                           # List your OAuth apps
shadowob oauth create --name "My App" --redirect-uris https://myapp.com/cb
shadowob oauth update <app-id> --name "New Name"
shadowob oauth delete <app-id>
shadowob oauth reset-secret <app-id>          # Generate new client secret
shadowob oauth consents                       # List authorized apps
shadowob oauth revoke <app-id>                # Revoke consent
```

## SDK Usage — Third-Party Apps (`@shadowob/oauth`)

```ts
import { ShadowOAuth } from '@shadowob/oauth'

const oauth = new ShadowOAuth({
  clientId: 'shadow_xxx',
  clientSecret: 'shsec_xxx',
  redirectUri: 'https://myapp.com/callback',
})

// 1. Redirect user to authorize
const url = oauth.getAuthorizeUrl({ scope: ['user:read', 'servers:read'] })

// 2. Exchange code for tokens
const tokens = await oauth.getToken(code)

// 3. Access resources
const servers = await oauth.getServers(tokens.accessToken)
const channels = await oauth.getChannels(tokens.accessToken, serverId)
await oauth.sendMessage(tokens.accessToken, channelId, { content: 'Hello!' })
```

## SDK Usage — Developer App Management (`@shadowob/sdk`)

```ts
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', jwtToken)

const app = await client.createOAuthApp({
  name: 'My App',
  redirectUris: ['https://myapp.com/callback'],
})

const apps = await client.listOAuthApps()
await client.resetOAuthAppSecret(appId)
await client.deleteOAuthApp(appId)
```

## Testing

```bash
# Unit tests (mock DAOs)
pnpm --filter @shadowob/server test oauth-service
pnpm --filter @shadowob/server test oauth-middleware

# Integration tests (requires PostgreSQL)
pnpm --filter @shadowob/server test oauth-e2e

# All server tests
pnpm --filter @shadowob/server test
```

## Design Decisions

See `docs/decisions/oauth-platform-design.md` (DEC-001) for the full design
rationale, including scope hierarchy, Buddy system architecture, and security
considerations.
