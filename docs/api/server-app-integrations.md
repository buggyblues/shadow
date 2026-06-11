# Server App Integrations

Shadow Server Apps are installed into a specific server. They provide an app-owned UI/API for people and a server-origin tool surface for Buddies. This document is the platform API reference: manifest shape, installation endpoints, launch endpoints, command protocol, SDK helpers, security model, and runtime events.

This is intentionally not MCP. The contract is a small manifest plus Shadow OAuth/REST context, app-owned API authorization, Shadow Inbox task delivery, webhooks, and optional server-origin `shadowob app` commands for Buddy tooling.

## Document Map

| Need | Document |
| --- | --- |
| Build a new App end to end | [Server App 开发手册](../development/server-app-development-guide.zh-CN.md) |
| Architecture decision and long-term integration contract | [独立应用集成契约](../decisions/server-app-independent-integration-contract.zh-CN.md) |
| Run demo Apps and deploy the combined integrations runtime | [integrations README](../../integrations/README.md) |
| OAuth UX inside Shadow host | [Bridge OAuth 最佳实践](../development/server-app-bridge-oauth-best-practices.zh-CN.md) |
| Send work to Buddy Inbox | [Buddy 派任务最佳实践](../development/server-app-buddy-task-dispatch-best-practices.zh-CN.md) |
| App UI/UX | [Server App UI/UX 设计规范](../design-system/server-app-ui-ux-guidelines.zh-CN.md) |
| Inbox claim/update/retry/admission semantics | [Buddy Inbox Protocol](./buddy-inbox.md) |

## Platform Shape

```txt
Server
  Channels
  Buddy memberships/routes
  Apps
    Demo Desk
      iframe UI
      app-owned API
      optional Buddy tool commands
```

The `Buddy memberships/routes` entry is a server-scoped access and routing projection. Buddy identity and runtime capability are not owned by the Server; each Shadow REST request, bridge request, server-origin command, or Inbox delivery injects the current server context before Shadow resolves usable Buddy routes.

Server Apps are independent services. Shadow must not package, launch, or depend on a Server App through `docker-compose` or any other server-side process manager. The long-term contract between Shadow and an App is the manifest, iframe URL, app-owned API, Shadow OAuth/REST calls, event/webhook delivery, Inbox task delivery, and optional server-origin command token introspection for Buddy tooling. The iframe bridge is an embedded-host enhancement, not the foundation for app authentication, persistent storage, media display, business commands, or background dispatch. The `integrations/docker-compose.yaml` file is a local developer harness for running demo Apps together; it is not part of the Shadow server runtime.

Shadow stores the manifest snapshot, validates origins, manages Shadow-side grants, and provides platform APIs. App UI requests go to the App backend directly. For Buddy/CLI server-origin commands, Buddies never receive App credentials; Shadow signs a short-lived OAuth-style Bearer token for each server-origin command call.

## Contract Boundaries

Server Apps should run inside or outside Shadow with the same backend contract:

- Use Shadow OAuth and REST APIs for identity, server context, subject lookup, avatar/media resolve, Inbox delivery, and platform authorization.
- Use the App's own API for app data and synchronous business operations.
- Use iframe bridge only when embedded in Shadow, for host UX such as opening Shadow authorization surfaces, opening Copilot, opening workspace resources, Buddy creation, and route synchronization. Do not use bridge for app business commands or Buddy task dispatch.
- Store durable display assets as app-owned snapshots. Do not persist `/api/media/signed/...` URLs as long-lived data; those URLs are compatibility output and may expire.
- Treat dispatch as two different paths: synchronous App API calls for quick app operations, and asynchronous Inbox task delivery for "ask a Buddy to do work" flows.
- Keep permissions layered: OAuth scope, server resource access, app command permission, Buddy grant, and runtime approval each answer a different security question.

Current compatibility note: OAuth `userinfo.avatarUrl` may return a signed absolute media URL so existing integrations do not render private `/shadow/uploads/...` paths directly. New integrations should use the planned avatar descriptor and snapshot flow instead of storing that URL.

## Manifest

Apps expose a `shadow.app/1` manifest:

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "description": "A small ticket desk for Shadow server App integration demos.",
  "version": "1.0.0",
  "updatedAt": "2026-05-21T00:00:00.000Z",
  "iconUrl": "https://demo.example.com/assets/icon.svg",
  "iframe": {
    "entry": "http://localhost:4199/shadow/server",
    "allowedOrigins": ["http://localhost:4199"]
  },
  "api": {
    "baseUrl": "http://localhost:4199",
    "auth": { "type": "oauth2-bearer" }
  },
  "access": {
    "defaultPermissions": ["demo.tickets:read"],
    "defaultApprovalMode": "none"
  },
  "commands": [
    {
      "name": "tickets.list",
      "description": "List tickets in the connected server desk.",
      "path": "/api/shadow/commands/tickets.list",
      "permission": "demo.tickets:read",
      "action": "read",
      "dataClass": "server-private"
    }
  ],
  "skills": [
    {
      "name": "demo-desk-ticket-ops",
      "description": "Use when a Buddy needs to list, create, or update Demo Desk tickets.",
      "commandHints": ["demo-desk tickets.list", "demo-desk tickets.create"]
    }
  ]
}
```

Installed apps keep the manifest snapshot plus `manifestVersion`, `manifestUpdatedAt`, `manifestFetchedAt`, and a manifest hash. If the app was installed from `manifestUrl`, Shadow refreshes that manifest before command lookup, grant validation, approval, launch, and Skill generation. New deployments should bump `version` and `updatedAt`; the hash is a fallback for local/dev manifests that forgot to bump either field.

`iconUrl` is required and should be a square app icon. Production manifest and command URLs should be public `https` URLs. Local loopback command URLs are accepted only outside production to support demo development. Private App hosts must be explicitly allowlisted with `SHADOW_SERVER_APP_ALLOW_PRIVATE_HOSTS`.

For local development, run the App independently and install it by manifest URL, for example:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
```

For the shared integrations runtime, the manifest URL must include the app slug so Shadow stores a command API base URL that routes back to that app:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4200/kanban/.well-known/shadow-app.json
```

When an App moves from local development to a published domain, the App should set its browser-facing public base URL and Shadow-facing API base URL from its own `.env` or deployment environment. Shadow should not need a code or compose change. In local Docker/Lima setups, this often means the manifest is installed from `host.lima.internal`, the iframe points at `localhost`, and the command API points at `host.lima.internal`.

`access.defaultPermissions` is the ToC-friendly default allowlist. Server members and Buddies can use those permissions without a prompt. If `access` is omitted, Shadow defaults to safe read permissions only; write/manage/delete/generate commands require first-use confirmation unless an admin explicitly adds them to the default allowlist. `defaultApprovalMode` can be `none`, `first_time`, `every_time`, or `policy`.

## OAuth-style Authorization Flow

The server management modal uses a two-step Apps flow similar to OAuth consent:

1. Admin enters a manifest URL and clicks review.
2. Shadow fetches and validates the manifest through `POST /api/servers/:serverId/apps/discover`.
3. The UI shows the App icon, name, description, requested permissions, and whether the App is already installed.
4. Admin authorizes installation.
5. Admin reviews the default allowlist and grants selected extra permissions to Buddy agents.

The discovery response does not persist anything. Installation stores a manifest snapshot. Command auth is `oauth2-bearer`; Shadow sends an opaque bearer token that the App must introspect, so the App never receives a user JWT or a shared secret.

Admins can also publish manifests into the global App catalog. Server admins can install from that catalog without pasting a manifest URL each time.

Access grants are Buddy-only. People are not grant targets; people use the server App through server membership plus the App default allowlist and command approval prompts.

When a member or Buddy first invokes a command that is not default-allowed, has `approvalMode: "first_time"`, or touches a restricted data class, Shadow creates a `SERVER_APP_COMMAND_APPROVAL_REQUIRED` approval request, notifies the owning person, and keeps the command request open for up to 60 seconds. The server polls authorization state every 5 seconds. If a person confirms through Web/Mobile (`POST /approvals`) during that window, Shadow continues the original command; otherwise it returns the structured approval error. `approvalMode: "every_time"` creates a short retry-window consent and consumes it after the command succeeds.

## Buddy Runtime Context

Installed Apps are server-scoped and dynamic: Shadow Plays can have a different App list than another server. The Buddy runtime must therefore inject the current server's installed App metadata into every server-channel turn, not only when a user explicitly mentions an App. The injected context includes app key, name, description, default permissions, approval mode, command summaries, and the generated `GET /skills` markdown for the installed Apps.

Cloud-deployed Buddies must have the Shadow CLI available in the runtime as `shadowob`, the corresponding Shadow [Skills](https://github.com/buggyblues/shadow/tree/main/skills) mounted for the target agent runtime, and `~/.shadowob/shadowob.config.json` configured with the Buddy token/server URL. Runtime packages may write environment placeholders such as `${SHADOW_TOKEN_BUDDY_1}` in that config, and the CLI resolves them at read time inside the container. Connector-based local installs must perform the same setup: CLI bin/shim, Shadow [Skills](https://github.com/buggyblues/shadow/tree/main/skills), and a Buddy CLI profile before starting OpenClaw, Hermes, or cc-connect.

## Channel @App Mentions

Installed Apps are mentionable in server channels as `@AppName`. The message normalizer stores them as canonical `<@app:{serverAppIntegrationId}>` mentions with `appKey`, `appId`, server identity, and icon metadata.

For Buddy routing, an App mention is treated as an explicit trigger. Even without an explicit mention, the Shadowob plugin lists installed Apps for the current server, loads `GET /skills` for the relevant Apps, injects that Skill markdown into the Buddy prompt, and instructs the Buddy to discover and operate Apps through:

```bash
shadowob app discover --server <server-id-or-slug> --json
shadowob app call <app-key> <command> --server <server-id-or-slug> --json-input '{}'
```

This means users can say `@Demo Desk create a high priority ticket` in a channel. They do not need to mention the CLI path; the Buddy runtime carries the App target into the CLI flow.

## CLI Flow

Install an App into a server:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-file integrations/kanban/shadow-app.local.json
```

Grant a Buddy permission:

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions demo.tickets:read,demo.tickets:write,buddy_inbox:deliver
```

`buddy_inbox:deliver` is a Shadow platform permission, not a manifest command permission. Add it to a Buddy grant when the App is allowed to deliver `shadow.outbox.inboxTasks` to that Buddy. `*` also includes this permission.

Set default permissions that members and Buddies can use without a prompt:

```bash
shadowob app defaults demo-desk \
  --server <server-id-or-slug> \
  --permissions demo.tickets:read
```

Approve a first-use command for yourself or for a Buddy:

```bash
shadowob app approve demo-desk tickets.create \
  --server <server-id-or-slug>

shadowob app approve demo-desk tickets.create \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id>
```

Discover Skill text:

```bash
shadowob app preview --server <server-id-or-slug> --manifest-url https://demo.example.com/.well-known/shadow-app.json
shadowob app discover --server <server-id-or-slug>
shadowob app skills demo-desk --server <server-id-or-slug>
```

Call as a Buddy. In a live server App command, use the injected command context `serverId`;
outside a live context, pass the server explicitly:

```bash
shadowob app call demo-desk tickets.list --server <server-id-or-slug> --json-input '{}'
```

## API Surface

Server-scoped endpoints:

- `GET /api/servers/:serverId/apps`: list installed Apps visible to a server member. Add `?summary=1` for lightweight sidebar/navigation summaries (`id`, `serverId`, `appKey`, `name`, `iconUrl`, `status`) without manifest payloads.
- `GET /api/servers/:serverId/apps/catalog`: list active App catalog entries plus whether each App is already installed in the server.
- `POST /api/servers/:serverId/apps/discover`: validate a manifest and return an install-review payload; requires server admin.
- `POST /api/servers/:serverId/apps`: install or refresh an App manifest; requires server admin.
- `POST /api/servers/:serverId/apps/catalog/:catalogEntryId/install`: install a catalog App into the server; requires server admin.
- `GET /api/servers/:serverId/apps/:appKey`: read manifest, iframe, and Buddy grants.
- `DELETE /api/servers/:serverId/apps/:appKey`: uninstall from the server; requires server admin.
- `POST /api/servers/:serverId/apps/:appKey/grants`: grant Buddy command permissions and Shadow platform permissions such as `buddy_inbox:deliver`; requires server admin.
- `PATCH /api/servers/:serverId/apps/:appKey/access-policy`: update default allowed permissions and default approval mode; requires server admin.
- `POST /api/servers/:serverId/apps/:appKey/approvals`: approve a first-use or every-time command for a person or Buddy subject.
- `POST /api/servers/:serverId/apps/:appKey/launch`: mint iframe launch metadata.
- `GET /api/servers/:serverId/apps/:appKey/events?token=<launchToken>`: SSE stream for iframe refresh and runtime events.
- `POST /api/servers/:serverId/apps/:appKey/launch/introspect`: validate a short-lived iframe launch token for app-owned realtime streams.
- `GET /api/servers/:serverId/apps/:appKey/launch/inboxes`: list visible Buddy Inbox targets for the launch actor; called by the App backend with `Authorization: Bearer <launchToken>`.
- `POST /api/servers/:serverId/apps/:appKey/launch/outbox`: consume `shadow.outbox` work produced by an App backend command and return delivery receipts; called by the App backend with `Authorization: Bearer <launchToken>`.
- `GET /api/servers/:serverId/apps/:appKey/skills`: generate Skill text for Buddies.
- `POST /api/servers/:serverId/apps/:appKey/oauth/introspect`: validate a command Bearer token and return actor/server/app context; this route is called by the App backend and does not require a user session.
- `POST /api/servers/:serverId/apps/:appKey/commands/:commandName`: server-origin JSON or multipart command calls for Buddy/CLI tooling. App UIs should call the App API directly.

Global admin endpoints:

- `GET /api/admin/server-apps`: audit all server App integrations, command counts, and Buddy grant counts.
- `DELETE /api/admin/server-apps/:id`: globally uninstall a server App integration.
- `GET /api/admin/server-app-catalog`: list App catalog entries, including inactive entries.
- `POST /api/admin/server-app-catalog`: add or update a catalog entry from a manifest URL or manifest JSON.
- `DELETE /api/admin/server-app-catalog/:id`: remove a catalog entry without uninstalling existing server integrations.

## SDK Helpers

TypeScript SDK methods:

- `client.listServerApps(serverIdOrSlug)`
- `client.listServerAppSummaries(serverIdOrSlug)`
- `client.listServerAppCatalog(serverIdOrSlug)`
- `client.discoverServerApp(serverIdOrSlug, { manifestUrl | manifest })`
- `client.installServerApp(serverIdOrSlug, { manifestUrl | manifest })`
- `client.grantServerAppToBuddy(serverIdOrSlug, appKey, grant)`
- `client.updateServerAppAccessPolicy(serverIdOrSlug, appKey, { defaultPermissions, defaultApprovalMode })`
- `client.approveServerAppCommand(serverIdOrSlug, appKey, { commandName, buddyAgentId?, remember? })`
- `client.getServerAppSkills(serverIdOrSlug, appKey)`
- `client.introspectServerAppToken(serverIdOrSlug, appKey, token)`
- `client.callServerAppCommand(serverIdOrSlug, appKey, commandName, { input, channelId })`
- `client.callServerAppCommandMultipart(...)`

Python SDK mirrors these as snake_case, including `update_server_app_access_policy(...)`, `approve_server_app_command(...)`, and `introspect_server_app_token(...)`.

Server App backends should use the modeled runtime instead of wiring raw parser helpers in every route:

```ts
import { createShadowServerAppRuntime } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { shadowServerAppManifest } from './shadow-app.generated.js'

const shadowApp = createShadowServerAppRuntime(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOW_SERVER_URL,
})

const commands = shadowApp.defineCommands({
  'tickets.create': (input, { actor }) => {
    return { ticket: createTicket({ ...input, author: actor }) }
  },
})
```

The command `input` type is inferred from the generated manifest's JSON Schema. Generate that typed manifest from the JSON source:

```bash
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts
```

Then route server-origin command calls through the runtime:

```ts
const result = await shadowApp.executeCommand(
  commandName,
  {
    authorizationHeader: c.req.header('authorization'),
    serverIdHeader: c.req.header('X-Shadow-Server-Id'),
    appKeyHeader: c.req.header('X-Shadow-App-Key'),
    requestBody: await c.req.text(),
  },
  commands,
)
return c.json(result.body, result.status)
```

Iframe clients that call app runtime commands should use `createShadowServerAppRuntimeClient()` from `@shadowob/sdk/bridge`. It attaches the launch token header, maps path-mounted apps to `/<slug>/api/runtime/...`, parses Shadow command envelopes, lists Buddy inboxes through bridge with backend fallback, requests Buddy delivery grants, and opens Copilot after dispatch delivery receipts:

```ts
import { createShadowServerAppRuntimeClient } from '@shadowob/sdk/bridge'

const shadowApp = createShadowServerAppRuntimeClient()

await shadowApp.ensureBuddyTaskGrant({
  agentId: selectedBuddyId,
  reason: 'Kanban dispatch sends task cards to this Buddy Inbox.',
})

const result = await shadowApp.command('cards.dispatch', { cardId, agentId: selectedBuddyId })
for (const delivery of shadowApp.inboxDeliveries(result)) {
  await shadowApp.openCopilot(delivery)
}
```

`createShadowServerAppClient()` remains available for legacy local routes and standalone demos. New task dispatch flows should not enable browser outbox delivery; App backends deliver outbox through launch-token endpoints.

Do not hand-roll separate launch-token, bridge, path-prefix, or command-response parsing code in each app.

Use `@shadowob/sdk/server-app/node` for simple JSON persistence in Node demos:

```ts
const store = createShadowServerAppJsonStore({
  filePath: process.env.KANBAN_DATA_FILE ?? './data/kanban-board.json',
  defaultValue: defaultBoard,
})
```

## Command Response Protocol

Server App command responses use one protocol envelope. Apps should not invent top-level fields for Shadow side effects.

The app runtime returns:

```json
{
  "ok": true,
  "result": {
    "card": { "id": "card-1", "title": "Review launch" },
    "shadow": {
      "protocol": "shadow.app/1",
      "outbox": {
        "inboxTasks": [
          {
            "title": "Review launch",
            "body": "Inspect the Kanban card and reply with findings.",
            "assigneeLabel": "Strategy Buddy",
            "priority": "normal",
            "idempotencyKey": "kanban:card:card-1:dispatch:strategy-buddy",
            "resource": {
              "kind": "kanban.card",
              "id": "card-1",
              "label": "Review launch"
            },
            "data": {
              "cardId": "card-1"
            }
          }
        ]
      }
    }
  }
}
```

Shadow Server consumes `result.shadow.outbox.inboxTasks`, resolves each target Buddy in the current server, verifies the installed App has an active Buddy grant with `buddy_inbox:deliver` or `*`, publishes a Task Card to that Buddy's Inbox channel, and returns delivery receipts in the same protocol namespace. Required outbox tasks use the same authorization wait window as commands: if the Buddy delivery grant is missing, expired, or lacks `buddy_inbox:deliver`, Shadow polls every 5 seconds for up to 60 seconds before returning the structured grant error.

```json
{
  "ok": true,
  "result": {
    "card": { "id": "card-1", "title": "Review launch" },
    "shadow": {
      "protocol": "shadow.app/1",
      "outbox": {
        "inboxTasks": [],
        "deliveries": [
          {
            "agentId": "agent-1",
            "agentUserId": "user-1",
            "channelId": "channel-inbox-1",
            "messageId": "message-1",
            "cardId": "task-card-1",
            "idempotencyKey": "kanban:card:card-1:dispatch:strategy-buddy"
          }
        ]
      }
    }
  },
  "shadow": {
    "protocol": "shadow.app/1",
    "outbox": {
      "deliveries": [
        {
          "agentId": "agent-1",
          "channelId": "channel-inbox-1",
          "messageId": "message-1",
          "cardId": "task-card-1"
        }
      ]
    }
  }
}
```

App UIs call the App backend directly for synchronous business operations:

```ts
const response = await fetch('/api/cards', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Prepare launch review',
    description: 'Track the reusable launch review work as Kanban cards.',
    prompt: 'Identify missing owner, timing, and asset details.',
    labels: ['Review'],
  }),
})

if (!response.ok) throw new Error('Failed to create card')
const result = await response.json()
```

Iframe clients use `ShadowBridge` directly only for host-mediated UX capabilities:

```ts
import { ShadowBridge, createShadowServerAppRuntimeClient } from '@shadowob/sdk/bridge'

const shadowApp = createShadowServerAppRuntimeClient()
const bridge = shadowApp.bridge

const capabilities = await bridge.capabilities()
await bridge.openWorkspaceResource({
  resource: { workspaceNodeId: result.card.workspaceNodeId, title: result.card.title },
})
```

Buddy task dispatch goes through the App backend runtime command, even in an iframe:

```ts
const dispatchResult = await shadowApp.command('cards.dispatch', {
  cardId: result.card.id,
  agentId: selectedBuddyAgentId,
})

const delivery = shadowApp.inboxDeliveries(dispatchResult)[0]
if (!delivery?.messageId || !delivery.cardId) throw new Error('Failed to dispatch card')

await bridge.openCopilot(delivery)
```

`ShadowBridge` covers host capability discovery, explicit Copilot opening, workspace opening, Buddy creation, server-context Buddy listing, Buddy grant confirmation, and route sync. It does not carry app business commands or Buddy task dispatch. Apps should call `bridge.capabilities()` before assuming optional host behavior; current target hosts expose `copilot.open`, `workspace.open`, `buddy.create.open`, `buddy.inboxes.list`, `buddy.grant.ensure`, and `route.navigate`. The SDK may expose separate protocol helpers for unwrapping server-origin command payloads and reading delivery/error receipts; those helpers are not bridge host capabilities.

The browser SDK derives the embedded app key and path-mounted runtime prefix from the launch frame. App UIs should normally construct one runtime client and avoid passing `appKey`, `commandBasePath`, or `inboxesPath`. When an app uses a path router instead of hash routing, derive its router base path from the same mounted prefix:

```ts
import { shadowServerAppMountedPath } from '@shadowob/sdk/bridge'

const router = createRouter({
  routeTree,
  basepath: shadowServerAppMountedPath('/shadow/server'),
})
```

This keeps `/skills/shadow/server`, `/warbuddy/shadow/server`, and standalone
`/shadow/server` launches on one contract and prevents embedded clients from
calling root `/api/local/...` routes under the shared runtime.

Buddy Inbox REST endpoints, admission policy, claim/update authorization, and retry semantics are documented in [Buddy Inbox Protocol](./buddy-inbox.md). Product flow and UI rules for sending work to Buddies are documented in [Buddy 派任务最佳实践](../development/server-app-buddy-task-dispatch-best-practices.zh-CN.md). This section only defines the protocol envelope.

Server App backends attach outbox work to command results with `ShadowServerAppOutbox`:

```ts
import { ShadowServerAppOutbox } from '@shadowob/sdk'

return new ShadowServerAppOutbox().enqueueInboxTask(task).attachTo({
  card,
})
```

The canonical namespace is `shadow.protocol === "shadow.app/1"` and `shadow.outbox`. New protocol extensions should be added under `shadow.outbox` or another documented `shadow.*` namespace, not as ad-hoc top-level response fields.

Inbox task delivery has two authorization gates:

1. Server App Buddy grant: `server_app_buddy_grants.permissions` must contain `buddy_inbox:deliver` or `*`, and the grant must not be expired.
2. Buddy Inbox admission: the target Inbox policy still decides whether the delivery is accepted immediately, denied, or held for admin approval.

Required outbox tasks use the same authorization wait window as commands: if the Buddy delivery grant is missing, expired, or lacks `buddy_inbox:deliver`, Shadow polls every 5 seconds for up to 60 seconds before returning the structured grant error.

## Security Model

Each command declares:

- `permission`
- `action`: `read`, `write`, `manage`, `delete`, or `generate`
- `dataClass`: `public`, `server-private`, `channel-private`, `financial`, `secret`, or `cloud-secret`
- optional binary limits

Shadow checks:

1. The caller is authenticated as a `user`, `pat`, or `agent` Actor.
2. The actor is a member of the target server.
3. The command permission is default-allowed for this App, or a person has approved the command for the current person/Buddy subject, or the Buddy has an explicit Buddy grant.
4. Restricted data classes always require at least a first-use approval from an authorized person.
5. The command URL passes SSRF checks in production.
6. JSON payloads stay within byte/depth/key/array limits.

Outgoing server-origin command calls include these Shadow context headers:

- `X-Shadow-Protocol: shadow.app/1`
- `X-Shadow-Server-Id`
- `X-Shadow-Server-App-Id`
- `X-Shadow-App-Key`
- `X-Shadow-Command`
- `X-Shadow-Actor-Kind`
- `X-Shadow-Timestamp`
- `Authorization: Bearer <short-lived-shadow-server-app-token>` for `oauth2-bearer` Apps.

The App backend validates the Bearer token by calling:

```http
POST /api/servers/:serverId/apps/:appKey/oauth/introspect
Authorization: Bearer <short-lived-shadow-server-app-token>
Content-Type: application/json

{"token":"<short-lived-shadow-server-app-token>"}
```

Active responses include `active`, `token_type`, `sub`, `scope`, `exp`, `iat`, and a `shadow` object:

```json
{
  "active": true,
  "token_type": "Bearer",
  "sub": "agent:agent-1",
  "scope": "demo.tickets:write",
  "client_id": "demo-desk",
  "shadow": {
    "protocol": "shadow.app/1",
    "serverId": "srv-1",
    "serverAppId": "app-1",
    "appKey": "demo-desk",
    "command": "tickets.create",
    "actor": {
      "kind": "agent",
      "userId": "bot-user-1",
      "buddyAgentId": "agent-1",
      "ownerId": "owner-user-1",
      "profile": {
        "id": "bot-user-1",
        "username": "guide-buddy",
        "displayName": "Guide Buddy",
        "avatarUrl": "/api/media/signed/..."
      }
    },
    "permission": "demo.tickets:write",
    "action": "write",
    "dataClass": "server-private"
  }
}
```

The bearer token is opaque (`sat_cmd_v1_...`) and short-lived. App backends use the introspection endpoint to resolve the user or Buddy identity, display profile, scopes, command, channel, action, and data class.

Binary is supported at the protocol layer through multipart commands. A command can set `input: "multipart"` and `binary.supported: true`; the CLI sends `input` as JSON plus a file field.

## iframe Launch and Refresh

`POST /launch` returns a short-lived `launchToken` and `eventStreamPath`. Shadow appends them to the iframe URL as:

- `shadow_launch`
- `shadow_event_stream`

The App iframe can open `new EventSource(shadow_event_stream)`. Shadow emits:

- `ready`: stream established.
- `SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT` (`server_app.command.completed`): a Buddy or user completed a CLI/API command through Shadow.
- `SHADOW_SERVER_APP_COMMAND_FAILED_EVENT` (`server_app.command.failed`): a command failed before completion.
- `ping`: heartbeat.

Apps should import these constants from `@shadowob/sdk` or `@shadowob/sdk/bridge` and reload local data when the completed event arrives. The launch token is short-lived and scoped to the server App.

## Cloud Template

The `shadowob` Cloud plugin supports `serverApps` in template config:

```json
{
  "serverApps": [
    {
      "id": "demo-desk-app",
      "serverId": "demo-desk-server",
      "manifestUrl": "http://shadow-server-app-demo:4199/.well-known/shadow-app.json",
      "grants": [
        {
          "buddyId": "demo-desk-buddy",
          "permissions": ["demo.tickets:read", "demo.tickets:write", "buddy_inbox:deliver"]
        }
      ]
    }
  ]
}
```

The provisioner installs/updates the App, grants the Buddy, and exports runtime env vars such as `SHADOW_SERVER_APP_KEY_DEMO_DESK_APP` and `SHADOW_SERVER_APP_SERVER_DEMO_DESK_APP`.

## Demo

See `integrations/kanban`. It is the canonical copyable TypeScript Hono demo app with:

- `/.well-known/shadow-app.json`
- `/shadow/server` iframe UI
- `/assets/icon.svg` app icon
- `@shadowob/sdk` modeled runtime through `createShadowServerAppRuntime`, `defineCommands`, `executeCommand`, and actor profile display
- `shadow-server-app typegen` generated `src/shadow-app.generated.ts` so command input types are inferred from JSON Schema
- `@shadowob/sdk/server-app/node` JSON persistence through `KANBAN_DATA_FILE`
- `.env`-driven public/API base URLs for local `host.lima.internal` installs or a later hosted domain
- decoupled Hono protocol/API routes and iframe UI module
- iframe board UI with drag-and-drop cards, quick add, assignee avatars, card details, comments, and live refresh
- commands for `boards.get`, `cards.get`, `cards.create`, `cards.move`, `cards.assign`, and `cards.comment`
- default read access plus first-use approval for card writes

Run all standard demo Apps locally with dotenv overrides:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Additional demo apps live in `integrations/qna` and `integrations/quiz`. A smaller legacy protocol test app remains in the [`shadow-server-app`](https://github.com/buggyblues/shadow/tree/main/skills/shadow-server-app) Skill at `references/example-app` for multipart upload coverage.
