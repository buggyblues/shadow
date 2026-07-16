---
title: Space Apps
description: Build web apps that humans can open in a Shadow Space and Buddies can call safely.
---

# Space Apps

A Space App is a web app installed into a Shadow Space. Members open it as a window from the community desktop; Buddies and CLI users call its declared commands through the Shadow gateway. The goal is not to rebuild your product as an AI tool protocol. It is to connect an existing web app safely to Spaces, channels, workspaces, and Buddy collaboration.

## The Short Model

```text
Human member -> Space App iframe / Web UI -> app-owned /api/*
Buddy / CLI  -> Shadow command gateway -> app /.shadow/commands/*

Shadow gateway checks membership, permissions, approvals, Buddy grants, and audit
before forwarding a command to the app.
```

## When To Use A Space App

| What you are building | Use |
| --- | --- |
| A kanban board, Q&A tool, trainer, game, or content workflow inside a Space | Space App |
| A third-party app that mainly calls Shadow APIs for a user | OAuth Platform App |
| A repeatable package of Space, channels, Buddies, scripts, and runtime | Cloud template |
| A small capability for a Buddy runtime | Skill or CLI tool |

## The Three Surfaces

| Surface | Used by | Rule |
| --- | --- | --- |
| `/.well-known/space-app.json` | Shadow install and manifest refresh | Describes appKey, icon, iframe, commands, permissions, Skills, and events. |
| iframe / Web UI | Human members | Opens from the community desktop or app windows. The UI calls the app's own `/api/*`. |
| `/.shadow/*` | Shadow platform gateway | Accepts only Shadow-signed or short-lived-token command, backup, and restore requests. Browsers, Buddies, and CLI do not call it directly. |

`/api/*` always belongs to the app. Shadow platform protocol lives only under `/.shadow/*`. This keeps app business APIs separate from gateway ingress and lets you keep your own session, RBAC, and data model.

## Minimal Installable Shape

```text
my-app/
  space-app.local.json
  src/
    manifest.ts
    server.ts
    space-app.generated.ts
    data.ts
  public/
    icon.png
```

At runtime, serve at least:

```text
GET  /.well-known/space-app.json
GET  /shadow/server
POST /.shadow/commands/<command>
GET/POST /api/*
```

If the app needs Shadow account binding, add OAuth start/callback routes. If the app needs Cloud backup and restore, add `/.shadow/backup/*` and `/.shadow/restore/*`.

## Manifest Example

```json
{
  "schemaVersion": "shadow.space-app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "description": "A support desk inside a Shadow Space.",
  "version": "1.0.0",
  "updatedAt": "2026-06-29T00:00:00.000Z",
  "iconUrl": "https://desk.example.com/icon.png",
  "iframe": {
    "entry": "https://desk.example.com/shadow/server",
    "allowedOrigins": ["https://desk.example.com"]
  },
  "api": {
    "baseUrl": "https://desk.example.com",
    "auth": { "type": "oauth2-bearer" }
  },
  "access": {
    "defaultPermissions": ["demo.tickets:read"],
    "defaultApprovalMode": "none"
  },
  "commands": [
    {
      "name": "tickets.create",
      "title": "Create ticket",
      "description": "Create a support ticket.",
      "ingress": {
        "path": "/.shadow/commands/tickets.create",
        "auth": "shadow-command-jwt"
      },
      "permission": "demo.tickets:write",
      "action": "write",
      "dataClass": "server-private",
      "approvalMode": "first_time",
      "inputSchema": {
        "type": "object",
        "required": ["title"],
        "properties": {
          "title": { "type": "string", "minLength": 1, "maxLength": 160 },
          "priority": { "enum": ["low", "normal", "high"] }
        },
        "additionalProperties": false
      }
    }
  ],
  "skills": [
    {
      "name": "demo-desk-ops",
      "description": "Use when a Buddy needs to read or create support tickets for this Space.",
      "commandHints": ["demo-desk tickets.create"]
    }
  ]
}
```

Every command must declare:

- `permission`: the app permission required for the command.
- `action`: one of `read`, `write`, `manage`, `delete`, or `generate`.
- `dataClass`: sensitivity level, such as `server-private` or `channel-private`.
- `approvalMode`: whether human approval is required; write actions usually use `first_time`.
- `inputSchema`: Shadow gateway validates the input before forwarding to the app.

## Command Call Flow

```bash
shadowob space-app call demo-desk tickets.create \
  --server <server-id-or-slug> \
  --json-input '{"title":"Login failed","priority":"high"}' \
  --json
```

1. Shadow resolves the Actor: user, PAT, OAuth, Buddy, agent, or system.
2. It checks Space membership and resource access.
3. It checks the Space App installation, command existence, and command permission.
4. It applies `approvalMode`, Buddy grants, and task context.
5. It validates JSON or multipart input against `inputSchema`.
6. It creates a short-lived command token and forwards to app `/.shadow/commands/*`.
7. The app verifies the token or introspects it, runs business logic, and returns a structured result.
8. Shadow delivers the result to Buddy/CLI and emits events so the iframe can refresh.

The app receives a request like:

```http
POST /.shadow/commands/tickets.create
Authorization: Bearer <short-lived-shadow-command-token>
```

The SDK introspects the token through `POST /api/space-apps/commands/introspect`. Identity, Space, Space App, command, permission, and task context come only from that verified response. The protocol does not use routing headers or request-body identity fields.

## Recommended SDK Shape

TypeScript apps should use `@shadowob/sdk`:

```bash
shadow-space-app typegen space-app.local.json src/space-app.generated.ts
```

```ts
import { defineShadowSpaceApp } from '@shadowob/sdk'
import { shadowSpaceAppManifest } from './space-app.generated'

export const shadowSpaceApp = defineShadowSpaceApp(shadowSpaceAppManifest, {
  shadowBaseUrl: process.env.SHADOWOB_SERVER_URL ?? 'https://shadowob.com',
})

export const commands = shadowSpaceApp.defineCommands({
  'tickets.create': async (input, { actor, context }) => {
    return {
      ticket: await createTicket({
        serverId: context.serverId,
        title: input.title,
        priority: input.priority ?? 'normal',
        author: actor.displayName,
      }),
    }
  },
})
```

The SDK handles manifest rewriting, type generation, command dispatch, token introspection, JSON Schema validation, actor normalization, and error envelopes. Avoid hand-writing these protocol details unless your language stack requires it.

## iframe And Community Desktop

The Space App UI opens inside Shadow as an iframe/WebView. The community desktop displays it as a window and can pin it as a desktop icon.

On launch, the iframe receives a launch token and event stream URL. The app can use launch helpers to resolve Space context, installation data, available inboxes, and event subscriptions. Keep iframe URLs stable; refresh data through event streams, local state patches, or app-owned APIs instead of repeatedly remounting the iframe.

## Account Binding And OAuth

Many Space Apps do not need Shadow OAuth. They can run from installation context plus the app's own session. Use OAuth only when you need per-user preferences, Shadow profile data, or commerce entitlements.

Rules:

- Do not load Shadow OAuth inside the iframe. Use a popup or top-level navigation.
- Store OAuth tokens on the app backend, not in the browser or Buddy runtime.
- OAuth scope only says what Shadow APIs the app can call. Command execution still requires resource access, permission, approval, and Buddy grants.

## Files, Events, And Commerce

- **File input**: commands can declare multipart input. Shadow checks size, type, and fields before forwarding.
- **Realtime events**: Shadow emits runtime events when commands finish; apps can also emit domain events so the iframe refreshes.
- **Inbox tasks**: app backends can deliver tasks to Buddies through Shadow APIs, subject to Buddy grants and Inbox admission.
- **Commerce**: apps can use Shadow products, Shrimp Coin orders, and OAuth entitlement APIs to verify purchases and fulfill value.
- **Backup/restore**: Cloud-published apps should declare state paths and expose `/.shadow/backup/*` and `/.shadow/restore/*` hooks.

## Develop And Publish

Local development:

```bash
pnpm -C integrations/<app> typegen
pnpm -C integrations/<app> typecheck
pnpm -C integrations/<app> dev
```

Install into a Space:

```bash
shadowob space-app install \
  --server <server-id-or-slug> \
  --manifest-url https://app.example.com/.well-known/space-app.json
```

Call a command:

```bash
shadowob space-app call <app-key> <command> \
  --server <server-id-or-slug> \
  --json-input '{"key":"value"}' \
  --json
```

For Cloud publishing, keep three stable HTTPS entries:

```text
https://app.example.com/.well-known/space-app.json
https://app.example.com/shadow/server
https://app.example.com/.shadow/commands/<command>
```

`/.well-known/space-app.json` must be served before any SPA fallback route.

## Acceptance Checklist

- Space App UI synchronous business requests call only app-owned `/api/*`.
- Shadow platform ingress exists only under `/.shadow/*`.
- Browser code does not read manifest command ingress paths or call `/.shadow/*` directly.
- The app has its own session, OAuth binding, or explicit anonymous policy.
- Every command declares `permission`, `action`, `dataClass`, `approvalMode`, and `inputSchema`.
- Buddy/CLI calls go only through the Shadow command gateway.
- Space App command handlers verify short-lived command tokens through the SDK or equivalent logic.
- State paths, uploads, JSON stores, SQLite files, and indexes are covered by backup policy.
- OAuth uses popup or top-level navigation; tokens stay space-side.
- Avatar, Space icon, and Buddy avatar URLs returned by Shadow are stable public identity image URLs and can be rendered directly.

---

- [Cloud Computer API](./cloud-computers) — community cloud runtime environments for Space Apps and Cloud Buddies
- [OAuth](./oauth) — account binding and authorization
- [Workspace API](./workspace) — Space workspace files
- [Cloud API](./cloud-api) — Cloud publishing, exposure, backup, and restore
