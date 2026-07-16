# Space Apps

Space Apps are independent web applications installed into a Shadow server. The Space App owns its UI, API, users, sessions, business data, and persistence. Shadow owns installation, server context, command gateway authorization, Buddy grants, approvals, audit, and platform delivery.

For Space App-originated user notifications, see [Space App Notifications](./space-app-notifications.md). Topics use the generic manifest contract and stay isolated per Space App installation; Shadow does not import domain models from a Space App.

This reference follows the simplified Shadow gateway contract in [Space App Shadow Gateway 契约简化](../decisions/space-app-shadow-gateway-contract.zh-CN.md). Space App `/api/*` belongs only to the Space App.

## Boundary

```text
Browser / iframe UI
  -> Space App origin /api/*
  -> Space App session / OAuth / RBAC

Buddy / CLI / automation
  -> Shadow /api/servers/:serverId/space-apps/:appKey/commands/:commandName
  -> Shadow checks authorization and forwards to Space App /.shadow/commands/:commandName
```

The Space App never exposes Shadow protocol routes under `/api`. Shadow platform ingress routes live under `/.shadow/*`.

## Required Space App Routes

A minimal installable Space App exposes:

- `GET /.well-known/space-app.json`: manifest.
- `GET /shadow/server`: iframe or WebView entry.
- `GET /assets/*`: icon, cover image, and client assets.
- `POST /api/shadow/session`: one-time launch credential exchange for an opaque Space App session.
- `GET /api/shadow/events`: Space App-session event stream proxy; the browser never connects to a tokenized platform URL.
- `/api/*`: Space App-owned business API.
- `POST /.shadow/commands/:commandName`: Shadow gateway ingress for Buddy/CLI commands.
- `/auth/shadow/start` and `/auth/shadow/callback` when the Space App supports Shadow OAuth account linking.

`/.shadow/commands/*` is not a browser API. It accepts only Shadow gateway calls with a short-lived Shadow command token.

## Manifest

Example:

```json
{
  "schemaVersion": "shadow.space-app/1",
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
    },
    {
      "name": "tickets.summary",
      "description": "Return ticket counts for the host-rendered widget.",
      "ingress": {
        "path": "/.shadow/commands/tickets.summary",
        "auth": "shadow-command-jwt"
      },
      "permission": "ticket_desk.tickets:read",
      "action": "read",
      "dataClass": "server-private",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false
      }
    }
  ],
  "widgets": [
    {
      "key": "ticket-count",
      "title": "Open tickets",
      "surfaces": ["desktop", "mobile"],
      "size": { "default": { "widthCells": 4, "heightCells": 3 } },
      "data": { "command": "tickets.summary", "refreshIntervalSeconds": 300 },
      "view": {
        "type": "metric",
        "label": { "literal": "Open" },
        "value": { "path": "openCount" }
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

`api.baseUrl` is the Space App origin. `commands[].ingress.path` is only the Shadow gateway target on that origin. Browser code must never fetch `commands[].ingress.path`.

`widgets` is optional. It registers safe, responsive host-rendered views backed
by a command in the same manifest. Widget data commands must be read-only. See
[Widgets](./widgets.md) for the view AST, option model, endpoints, and security
boundary. The Space App supplies no widget HTML, CSS, JavaScript, or layout gestures;
the host renders the definition and provides the shared **Change layout** mode.

Each command declares:

- `name`
- `ingress.path`
- `ingress.auth`
- `permission`
- `action`: `read`, `write`, `manage`, `delete`, or `generate`
- `dataClass`: `public`, `server-private`, `channel-private`, `financial`, `secret`, or `cloud-secret`
- `inputSchema`
- optional binary input limits

## Browser And Space App API

The Space App UI calls Space App-owned APIs directly:

```ts
const response = await fetch('/api/tickets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Prepare launch review', priority: 'high' }),
})

if (!response.ok) throw new Error('Failed to create ticket')
const ticket = await response.json()
```

The Space App backend authenticates this request with its own session, OAuth account link, or explicit anonymous policy. Shadow launch tokens and Shadow command tokens are not the Space App's business session.

The iframe bridge is limited to host UX: open OAuth or Copilot, open a channel or Workspace resource, synchronize routes, and open the host share surface. It does not read or mutate community data and does not carry Space App business commands. Channel provisioning, member and Inbox lookup, polls, Buddy grants, messages, and outbox delivery use the launch-scoped HTTP API from the Space App backend. Space Apps persist only returned platform references such as `channelId` and `messageId`; their domain state remains in the Space App API.

An embedded Space App exchanges the in-memory launch token with its own backend exactly once. The Space App backend validates it and issues an opaque `HttpOnly` Space App session. The launch token is never placed in the iframe URL, local storage, session storage, or normal Space App API requests. State-changing Space App requests also carry the per-session CSRF token returned by the exchange.

Event streams follow the same boundary. Browser `EventSource` connects to the Space App-owned `GET /api/shadow/events` route with the opaque `HttpOnly` session cookie. The Space App backend forwards the stream to `GET /api/servers/:serverId/space-apps/:appKey/events` using `Authorization: Bearer <launch-token>`. Query-string credentials are rejected by contract because URLs are commonly retained by browser history, proxies, observability tools, and access logs.

`@shadowob/sdk` remains one package. Browser code uses `createShadowSpaceAppClient()`; Node Space App backends use `createShadowSpaceAppSessionManager()` from the package's `space-app/node` entrypoint. These are runtime surfaces of the same SDK, not separately versioned packages. The browser client coalesces concurrent exchange attempts and retries one rejected session without forwarding the launch token to business routes.

Generic launch-scoped platform endpoints include:

- `GET /api/servers/:serverId/space-apps/:appKey/launch/members`
- `GET /api/servers/:serverId/space-apps/:appKey/launch/inboxes`
- `GET /api/servers/:serverId/space-apps/:appKey/launch/channels`
- `GET /api/servers/:serverId/space-apps/:appKey/launch/messages/:messageId`
- `POST /api/servers/:serverId/space-apps/:appKey/launch/channels/ensure`
- `POST /api/servers/:serverId/space-apps/:appKey/launch/polls`
- `POST /api/servers/:serverId/space-apps/:appKey/launch/buddy-grants/ensure`
- `POST /api/servers/:serverId/space-apps/:appKey/launch/outbox`

Every endpoint validates the signed launch scope, installed Space App, actor, current Space membership, and target resource. The channel and message endpoints also enforce channel visibility; cross-Space member, channel, poll, and message references are rejected.

## Shadow OAuth Account Linking

Standard Space Apps maintain their own user and session model. Shadow OAuth is one identity provider for linking a Shadow user to a Space App user.

Recommended flow:

```text
Browser -> Space App /auth/shadow/start
Space App -> Shadow OAuth authorize
Shadow -> Space App /auth/shadow/callback
Space App -> create or link local user
Space App -> set Space App session cookie
Browser -> Space App /api/*
```

When the Space App runs inside the Shadow host, it may invoke the OAuth bridge as soon as it detects a valid launch context but no Space App session. The host first attempts silent authorization from existing consent; if consent is missing it opens one host approval surface. Interactive authorization requests must keep a user-interaction timeout rather than a short network timeout, so the first approval is not reported as a failed attempt.

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

When the Space App backend needs Shadow data or delivery, it calls Shadow REST with the appropriate user authorization, Space App installation credential, or Shadow gateway context.

## Shadow Command Gateway

Buddy, CLI, and automation call Shadow:

```http
POST /api/servers/:serverId/space-apps/:appKey/commands/:commandName
Content-Type: application/json

{"input":{"title":"Prepare launch review"},"channelId":"channel-1"}
```

Shadow then:

1. Authenticates the Actor.
2. Resolves and authorizes the server.
3. Loads the installed Space App manifest.
4. Finds the command by name.
5. Checks default permissions, explicit Buddy grant, approval policy, action, data class, and task binding.
6. Validates JSON or multipart input limits.
7. Verifies the Space App ingress target passes SSRF policy.
8. Mints a short-lived Shadow command token.
9. Forwards the request to `api.baseUrl + commands[].ingress.path`.
10. Records audit and command events.

Forwarded request:

```http
POST /.shadow/commands/tickets.create
Authorization: Bearer <short-lived-shadow-command-token>
Content-Type: application/json

{
  "input": { "title": "Prepare launch review" }
}
```

The Space App validates the Shadow command token before running the handler. SDK command helpers introspect it through `POST /api/space-apps/commands/introspect`; that response is the only authoritative source for server, Space App, command, Actor, permission, and task context. Routing headers and request-body identity fields are not part of the protocol. A naked browser or curl request to `/.shadow/commands/*` must fail.

## Why Buddy And CLI Go Through Shadow

Buddy and CLI are not Space App users. They need Shadow to answer platform authorization questions before a Space App command runs:

- Is the caller a valid Shadow Actor?
- Is the Actor in this server?
- Is this Space App installed in this server?
- Is this command allowed by default permissions, approval, or Buddy grant?
- Does the active task claim allow this command?
- Can command side effects deliver Inbox tasks or channel messages?
- How should this call be audited, rate-limited, revoked, or retried?

Putting Shadow in front keeps these checks in one control plane. Space Apps implement their domain action once behind `/.shadow/commands/*`; they do not reimplement Shadow authorization policy.

## Inbox And Buddy Work

For user-driven synchronous work, UI calls Space App `/api/*`.

For "ask a Buddy to do work", the Space App backend calls Shadow REST to create an Inbox task or returns a Shadow command result that the gateway can consume. The browser does not post Shadow outbox payloads directly.

Recommended Space App-owned route:

```text
POST /api/tickets/:ticketId/dispatch
```

The Space App backend:

1. Authenticates the Space App session.
2. Verifies the local user's access to the ticket.
3. Calls Shadow REST to deliver an Inbox task to the selected Buddy.
4. Returns the delivery receipt to the browser.

Buddy Inbox semantics are documented in [Buddy Inbox Protocol](./buddy-inbox.md).

## Shadow Platform API

Server-scoped endpoints:

- `GET /api/servers/:serverId/space-apps`: list installed Space Apps visible to a server member.
- `GET /api/servers/:serverId/space-apps/catalog`: list active Space App catalog entries.
- `POST /api/servers/:serverId/space-apps/discover`: validate a manifest and return an install-review payload.
- `POST /api/servers/:serverId/space-apps`: install or refresh a Space App manifest.
- `POST /api/servers/:serverId/space-apps/catalog/:catalogEntryId/install`: install a catalog Space App.
- `GET /api/servers/:serverId/space-apps/:appKey`: read manifest, iframe, and grants.
- `DELETE /api/servers/:serverId/space-apps/:appKey`: uninstall from the server.
- `POST /api/servers/:serverId/space-apps/:appKey/grants`: grant Buddy command permissions and Shadow platform permissions.
- `PATCH /api/servers/:serverId/space-apps/:appKey/access-policy`: update default permissions and approval mode.
- `POST /api/servers/:serverId/space-apps/:appKey/approvals`: approve a command for a person or Buddy subject.
- `POST /api/servers/:serverId/space-apps/:appKey/commands/:commandName`: command gateway for Buddy/CLI/automation.
- `GET /api/servers/:serverId/space-apps/:appKey/skills`: generate Skill text for Buddies.
- `GET /api/discover/space-apps`: list the public Space App directory.
- `GET /api/discover/space-apps/:appKey`: read a public Space App directory entry.

Global admin endpoints:

- `GET /api/admin/space-apps`: audit all Space App installations.
- `DELETE /api/admin/space-apps/:id`: globally uninstall a Space App.
- `GET /api/admin/space-app-catalog`: list catalog entries.
- `POST /api/admin/space-app-catalog`: add or update a catalog entry.
- `DELETE /api/admin/space-app-catalog/:id`: remove a catalog entry.

## CLI Flow

Install:

```bash
shadowob space-app install \
  --server <server-id-or-slug> \
  --manifest-url https://tickets.example.com/.well-known/space-app.json
```

Grant a Buddy:

```bash
shadowob space-app grant ticket-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions ticket_desk.tickets:read,ticket_desk.tickets:write,buddy_inbox:deliver
```

Call through Shadow gateway:

```bash
shadowob space-app call ticket-desk tickets.create \
  --server <server-id-or-slug> \
  --json-input '{"title":"Prepare launch review","priority":"high"}' \
  --json
```

The CLI never calls the Space App origin directly.

## SDK Direction

The Shadow SDK contains only platform-owned protocols and resources. It must not export a Space App's
domain entities, Space App-owned REST routes, client-state schemas, or generated business client. For
example, a Travel Space App keeps trips, itineraries, reservations, expenses, packing items, planning
drafts, and its `/api/*` client inside the Travel repository. The SDK may expose the generic launch,
command, outbox, Inbox receipt, OAuth, Workspace, and bridge primitives used by that Space App.

Adding or changing a Space App-owned `/api/*` endpoint does not require a Shadow TypeScript or Python SDK
change. SDK synchronization is required only when the platform protocol itself changes.

The SDK remains one `@shadowob/sdk` package. It exposes coherent surfaces and optional entry points, not one package per capability:

- Space App browser helpers for host UX only.
- Space App backend helpers for Shadow OAuth account linking and Shadow REST calls.
- Space App ingress helpers for validating Shadow command tokens and executing command handlers.
- Shadow client helpers for CLI, Buddy runtime, and server-side command gateway calls.

Platform protocol changes are synchronized in this single TypeScript SDK and the Python SDK. Space App-specific domain clients remain inside their Space App and never become SDK modules or packages.

The browser SDK must not default to command routes. Space App UI command-like workflows are ordinary Space App `/api/*` requests.

## Security Requirements

- Space App `/api/*` is protected by Space App auth and Space App authorization.
- Space App `/.shadow/*` is protected by Shadow command token validation and must reject naked browser requests.
- Shadow validates server membership, command permission, approval policy, Buddy grant, task binding, input limits, and target SSRF before forwarding.
- Shadow command tokens are short-lived and audience-bound to the Space App, server, Space App installation, and command.
- Buddy/CLI never receive Space App secrets, Space App sessions, or direct Space App private URLs.
- Space App logs must redact Shadow command tokens and user OAuth tokens.

## Reference Shape

A new reference Space App should have this shape:

```text
src/
  server.ts          # Hono/Express app
  app-api.ts         # Space App-owned /api/* routes
  auth-shadow.ts     # /auth/shadow/start and /auth/shadow/callback
  shadow-ingress.ts  # /.shadow/commands/*
  commands.ts        # domain command handlers reused by Shadow ingress if useful
  manifest.ts        # manifest generation
  ui.tsx             # browser UI using /api/*
```

Generated Space App UI must call Space App-owned endpoints and must not read manifest ingress paths from browser code.
