# Server App Integrations

Shadow Server Apps are independent web applications installed into a Shadow server. The App owns its UI, API, users, sessions, business data, and persistence. Shadow owns installation, server context, command gateway authorization, Buddy grants, approvals, audit, and platform delivery.

This reference follows the simplified Shadow gateway contract in [Server App Shadow Gateway 契约简化](../decisions/server-app-shadow-gateway-contract.zh-CN.md). App `/api/*` belongs only to the App.

## Boundary

```text
Browser / iframe UI
  -> App origin /api/*
  -> App session / OAuth / RBAC

Buddy / CLI / automation
  -> Shadow /api/servers/:serverId/apps/:appKey/commands/:commandName
  -> Shadow checks authorization and forwards to App /.shadow/commands/:commandName
```

The App never exposes Shadow protocol routes under `/api`. Shadow platform ingress routes live under `/.shadow/*`.

## Required App Routes

A minimal installable App exposes:

- `GET /.well-known/shadow-app.json`: manifest.
- `GET /shadow/server`: iframe or WebView entry.
- `GET /assets/*`: icon, cover image, and client assets.
- `/api/*`: App-owned business API.
- `POST /.shadow/commands/:commandName`: Shadow gateway ingress for Buddy/CLI commands.
- `/auth/shadow/start` and `/auth/shadow/callback` when the App supports Shadow OAuth account linking.

`/.shadow/commands/*` is not a browser API. It accepts only Shadow gateway calls with a short-lived Shadow command token.

## Manifest

Example:

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "ticket-desk",
  "name": "Ticket Desk",
  "description": "Ticket management for a Shadow server.",
  "version": "1.0.0",
  "updatedAt": "2026-06-25T00:00:00.000Z",
  "iconUrl": "https://tickets.example.com/assets/icon.svg",
  "iframe": {
    "entry": "https://tickets.example.com/shadow/server",
    "allowedOrigins": ["https://tickets.example.com"]
  },
  "api": {
    "baseUrl": "https://tickets.example.com"
  },
  "access": {
    "defaultPermissions": ["ticket_desk.tickets:read"],
    "defaultApprovalMode": "none"
  },
  "commands": [
    {
      "name": "tickets.create",
      "description": "Create a ticket in this server's Ticket Desk.",
      "ingress": {
        "path": "/.shadow/commands/tickets.create",
        "auth": "shadow-command-jwt"
      },
      "permission": "ticket_desk.tickets:write",
      "action": "write",
      "dataClass": "server-private",
      "inputSchema": {
        "type": "object",
        "properties": {
          "title": { "type": "string", "minLength": 1, "maxLength": 200 },
          "priority": { "enum": ["low", "normal", "high"] }
        },
        "required": ["title"],
        "additionalProperties": false
      }
    }
  ],
  "skills": [
    {
      "name": "ticket-desk-ticket-ops",
      "description": "Use when a Buddy needs to create or update Ticket Desk tickets.",
      "commandHints": ["ticket-desk tickets.create"]
    }
  ]
}
```

`api.baseUrl` is the App origin. `commands[].ingress.path` is only the Shadow gateway target on that origin. Browser code must never fetch `commands[].ingress.path`.

Each command declares:

- `name`
- `ingress.path`
- `ingress.auth`
- `permission`
- `action`: `read`, `write`, `manage`, `delete`, or `generate`
- `dataClass`: `public`, `server-private`, `channel-private`, `financial`, `secret`, or `cloud-secret`
- `inputSchema`
- optional binary input limits

## Browser And App API

The App UI calls App-owned APIs directly:

```ts
const response = await fetch('/api/tickets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Prepare launch review', priority: 'high' }),
})

if (!response.ok) throw new Error('Failed to create ticket')
const ticket = await response.json()
```

The App backend authenticates this request with its own session, OAuth account link, or explicit anonymous policy. Shadow launch tokens and Shadow command tokens are not the App's business session.

The iframe bridge is limited to host UX: open OAuth popup, open Copilot, open Workspace resource, route sync, and similar shell capabilities. It does not carry App business commands.

## Shadow OAuth Account Linking

Standard Apps maintain their own user and session model. Shadow OAuth is one identity provider for linking a Shadow user to an App user.

Recommended flow:

```text
Browser -> App /auth/shadow/start
App -> Shadow OAuth authorize
Shadow -> App /auth/shadow/callback
App -> create or link local user
App -> set App session cookie
Browser -> App /api/*
```

Recommended local identity link fields:

```text
local_user_id
provider = "shadow"
shadow_user_id
shadow_username
shadow_server_id or installation_id
linked_at
last_seen_at
```

When the App backend needs Shadow data or delivery, it calls Shadow REST with the appropriate user authorization, App installation credential, or Shadow gateway context.

## Shadow Command Gateway

Buddy, CLI, and automation call Shadow:

```http
POST /api/servers/:serverId/apps/:appKey/commands/:commandName
Content-Type: application/json

{"input":{"title":"Prepare launch review"},"channelId":"channel-1"}
```

Shadow then:

1. Authenticates the Actor.
2. Resolves and authorizes the server.
3. Loads the installed App manifest.
4. Finds the command by name.
5. Checks default permissions, explicit Buddy grant, approval policy, action, data class, and task binding.
6. Validates JSON or multipart input limits.
7. Verifies the App ingress target passes SSRF policy.
8. Mints a short-lived Shadow command token.
9. Forwards the request to `api.baseUrl + commands[].ingress.path`.
10. Records audit and command events.

Forwarded request:

```http
POST /.shadow/commands/tickets.create
Authorization: Bearer <short-lived-shadow-command-token>
X-Shadow-Protocol: shadow.app/1
X-Shadow-Server-Id: <server-id>
X-Shadow-Server-App-Id: <server-app-id>
X-Shadow-App-Key: ticket-desk
X-Shadow-Command: tickets.create
X-Shadow-Actor-Kind: agent
Content-Type: application/json

{
  "input": { "title": "Prepare launch review" },
  "context": {
    "protocol": "shadow.app/1",
    "serverId": "<server-id>",
    "serverAppId": "<server-app-id>",
    "appKey": "ticket-desk",
    "command": "tickets.create",
    "actor": {
      "kind": "agent",
      "userId": "<agent-user-id>",
      "buddyAgentId": "<agent-id>",
      "ownerId": "<owner-user-id>"
    },
    "permission": "ticket_desk.tickets:write",
    "action": "write",
    "dataClass": "server-private"
  }
}
```

The App validates the Shadow command token before running the handler. A naked browser or curl request to `/.shadow/commands/*` must fail.

## Why Buddy And CLI Go Through Shadow

Buddy and CLI are not App users. They need Shadow to answer platform authorization questions before an App command runs:

- Is the caller a valid Shadow Actor?
- Is the Actor in this server?
- Is this App installed in this server?
- Is this command allowed by default permissions, approval, or Buddy grant?
- Does the active task claim allow this command?
- Can command side effects deliver Inbox tasks or channel messages?
- How should this call be audited, rate-limited, revoked, or retried?

Putting Shadow in front keeps these checks in one control plane. Apps implement their domain action once behind `/.shadow/commands/*`; they do not reimplement Shadow authorization policy.

## Inbox And Buddy Work

For user-driven synchronous work, UI calls App `/api/*`.

For "ask a Buddy to do work", the App backend calls Shadow REST to create an Inbox task or returns a Shadow command result that the gateway can consume. The browser does not post Shadow outbox payloads directly.

Recommended App-owned route:

```text
POST /api/tickets/:ticketId/dispatch
```

The App backend:

1. Authenticates the App session.
2. Verifies the local user's access to the ticket.
3. Calls Shadow REST to deliver an Inbox task to the selected Buddy.
4. Returns the delivery receipt to the browser.

Buddy Inbox semantics are documented in [Buddy Inbox Protocol](./buddy-inbox.md).

## Shadow Platform API

Server-scoped endpoints:

- `GET /api/servers/:serverId/apps`: list installed Apps visible to a server member.
- `GET /api/servers/:serverId/apps/catalog`: list active App catalog entries.
- `POST /api/servers/:serverId/apps/discover`: validate a manifest and return an install-review payload.
- `POST /api/servers/:serverId/apps`: install or refresh an App manifest.
- `POST /api/servers/:serverId/apps/catalog/:catalogEntryId/install`: install a catalog App.
- `GET /api/servers/:serverId/apps/:appKey`: read manifest, iframe, and grants.
- `DELETE /api/servers/:serverId/apps/:appKey`: uninstall from the server.
- `POST /api/servers/:serverId/apps/:appKey/grants`: grant Buddy command permissions and Shadow platform permissions.
- `PATCH /api/servers/:serverId/apps/:appKey/access-policy`: update default permissions and approval mode.
- `POST /api/servers/:serverId/apps/:appKey/approvals`: approve a command for a person or Buddy subject.
- `POST /api/servers/:serverId/apps/:appKey/commands/:commandName`: command gateway for Buddy/CLI/automation.
- `GET /api/servers/:serverId/apps/:appKey/skills`: generate Skill text for Buddies.

Global admin endpoints:

- `GET /api/admin/server-apps`: audit all Server App integrations.
- `DELETE /api/admin/server-apps/:id`: globally uninstall an integration.
- `GET /api/admin/server-app-catalog`: list catalog entries.
- `POST /api/admin/server-app-catalog`: add or update a catalog entry.
- `DELETE /api/admin/server-app-catalog/:id`: remove a catalog entry.

## CLI Flow

Install:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url https://tickets.example.com/.well-known/shadow-app.json
```

Grant a Buddy:

```bash
shadowob app grant ticket-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions ticket_desk.tickets:read,ticket_desk.tickets:write,buddy_inbox:deliver
```

Call through Shadow gateway:

```bash
shadowob app call ticket-desk tickets.create \
  --server <server-id-or-slug> \
  --json-input '{"title":"Prepare launch review","priority":"high"}' \
  --json
```

The CLI never calls the App origin directly.

## SDK Direction

The SDK should expose separate clients:

- App browser helpers for host UX only.
- App backend helpers for Shadow OAuth account linking and Shadow REST calls.
- App ingress helpers for validating Shadow command tokens and executing command handlers.
- Shadow client helpers for CLI, Buddy runtime, and server-side command gateway calls.

The browser SDK must not default to command routes. App UI command-like workflows are ordinary App `/api/*` requests.

## Security Requirements

- App `/api/*` is protected by App auth and App authorization.
- App `/.shadow/*` is protected by Shadow command token validation and must reject naked browser requests.
- Shadow validates server membership, command permission, approval policy, Buddy grant, task binding, input limits, and target SSRF before forwarding.
- Shadow command tokens are short-lived and audience-bound to the App, server, App installation, and command.
- Buddy/CLI never receive App secrets, App sessions, or direct App private URLs.
- App logs must redact Shadow command tokens and user OAuth tokens.

## Reference Shape

A new reference App should have this shape:

```text
src/
  server.ts          # Hono/Express app
  app-api.ts         # App-owned /api/* routes
  auth-shadow.ts     # /auth/shadow/start and /auth/shadow/callback
  shadow-ingress.ts  # /.shadow/commands/*
  commands.ts        # domain command handlers reused by Shadow ingress if useful
  manifest.ts        # manifest generation
  ui.tsx             # browser UI using /api/*
```

Generated App UI must call App-owned endpoints and must not read manifest ingress paths from browser code.
