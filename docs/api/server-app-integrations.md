# Server App Integrations

Shadow Server Apps are installed into a specific server. They provide an iframe UI for people and a CLI command surface for Buddies.

This is intentionally not MCP. The integration contract is a small manifest plus Shadow-controlled OAuth/Actor/Policy checks and `shadowob app` commands.

## Shape

```txt
Server
  Channels
  Buddies
  Apps
    Demo Desk
      iframe UI
      commands exposed through shadowob app call
```

Server Apps are independent services. Shadow must not package, launch, or depend on a Server App through `docker-compose` or any other server-side process manager. The only contract between Shadow and an App is the manifest, iframe URL, command URLs, event stream, and OAuth-style command token introspection protocol.

Shadow stores the manifest snapshot, validates origins, grants Buddies explicit permissions, and proxies command calls to the App backend. Buddies never receive App credentials; Shadow signs a short-lived OAuth-style Bearer token for each command call.

## Manifest

Apps expose a `shadow.app/1` manifest:

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "description": "A small ticket desk for Shadow server App integration demos.",
  "version": "1.0.0",
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

`iconUrl` is required and should be a square app icon. Production manifest and command URLs should be public `https` URLs. Local loopback command URLs are accepted only outside production to support demo development. Private App hosts must be explicitly allowlisted with `SHADOW_SERVER_APP_ALLOW_PRIVATE_HOSTS`.

For local development, run the App independently and install it by manifest URL, for example:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
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

When a member or Buddy first invokes a command that is not default-allowed, has `approvalMode: "first_time"`, or touches a restricted data class, Shadow returns `428 SERVER_APP_COMMAND_APPROVAL_REQUIRED` with an `approval` payload. Web and mobile iframe hosts turn that response into an authorization dialog, call `POST /approvals` on confirmation, then retry the command. `approvalMode: "every_time"` creates a short retry-window consent and consumes it after the command succeeds.

## Buddy Runtime Context

Installed Apps are server-scoped and dynamic: Shadow Plays can have a different App list than another server. The Buddy runtime must therefore inject the current server's installed App metadata into every server-channel turn, not only when a user explicitly mentions an App. The injected context includes app key, name, description, default permissions, approval mode, command summaries, and the generated `GET /skills` markdown for the installed Apps.

Cloud-deployed Buddies must have the Shadow CLI available in the runtime as `shadowob`, the official Shadow skill mounted for the target agent runtime, and `~/.shadowob/shadowob.config.json` configured with the Buddy token/server URL. Runtime packages may write environment placeholders such as `${SHADOW_TOKEN_BUDDY_1}` in that config, and the CLI resolves them at read time inside the container. Connector-based local installs must perform the same setup: CLI bin/shim, skill files, and a Buddy CLI profile before starting OpenClaw, Hermes, or cc-connect.

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
  --manifest-file skills/shadow-server-app/example-app/shadow-app.local.json
```

Grant a Buddy permission:

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions demo.tickets:read,demo.tickets:write
```

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

Call as a Buddy:

```bash
SHADOWOB_SERVER_ID=<server-id-or-slug> \
shadowob app call demo-desk tickets.list --server "$SHADOWOB_SERVER_ID" --json-input '{}'
```

## API Surface

Server-scoped endpoints:

- `GET /api/servers/:serverId/apps`: list installed Apps visible to a server member.
- `GET /api/servers/:serverId/apps/catalog`: list active App catalog entries plus whether each App is already installed in the server.
- `POST /api/servers/:serverId/apps/discover`: validate a manifest and return an install-review payload; requires server admin.
- `POST /api/servers/:serverId/apps`: install or refresh an App manifest; requires server admin.
- `POST /api/servers/:serverId/apps/catalog/:catalogEntryId/install`: install a catalog App into the server; requires server admin.
- `GET /api/servers/:serverId/apps/:appKey`: read manifest, iframe, and Buddy grants.
- `DELETE /api/servers/:serverId/apps/:appKey`: uninstall from the server; requires server admin.
- `POST /api/servers/:serverId/apps/:appKey/grants`: grant Buddy permissions; requires server admin.
- `PATCH /api/servers/:serverId/apps/:appKey/access-policy`: update default allowed permissions and default approval mode; requires server admin.
- `POST /api/servers/:serverId/apps/:appKey/approvals`: approve a first-use or every-time command for a person or Buddy subject.
- `POST /api/servers/:serverId/apps/:appKey/launch`: mint iframe launch metadata.
- `GET /api/servers/:serverId/apps/:appKey/events?token=<launchToken>`: SSE stream for iframe refresh and runtime events.
- `GET /api/servers/:serverId/apps/:appKey/skills`: generate Skill text for Buddies.
- `POST /api/servers/:serverId/apps/:appKey/oauth/introspect`: validate a command Bearer token and return actor/server/app context; this route is called by the App backend and does not require a user session.
- `POST /api/servers/:serverId/apps/:appKey/commands/:commandName`: proxy JSON or multipart command calls.

Global admin endpoints:

- `GET /api/admin/server-apps`: audit all server App integrations, command counts, and Buddy grant counts.
- `DELETE /api/admin/server-apps/:id`: globally uninstall a server App integration.
- `GET /api/admin/server-app-catalog`: list App catalog entries, including inactive entries.
- `POST /api/admin/server-app-catalog`: add or update a catalog entry from a manifest URL or manifest JSON.
- `DELETE /api/admin/server-app-catalog/:id`: remove a catalog entry without uninstalling existing server integrations.

## SDK Helpers

TypeScript SDK methods:

- `client.listServerApps(serverIdOrSlug)`
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

Outgoing command calls include these Shadow context headers:

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
      "ownerId": "owner-user-1"
    },
    "permission": "demo.tickets:write",
    "action": "write",
    "dataClass": "server-private"
  }
}
```

The bearer token is opaque (`sat_cmd_v1_...`) and short-lived. App backends use the introspection endpoint to resolve the user or Buddy identity, scopes, command, channel, action, and data class.

Binary is supported at the protocol layer through multipart commands. A command can set `input: "multipart"` and `binary.supported: true`; the CLI sends `input` as JSON plus a file field.

## iframe Launch and Refresh

`POST /launch` returns a short-lived `launchToken` and `eventStreamPath`. Shadow appends them to the iframe URL as:

- `shadow_launch`
- `shadow_event_stream`

The App iframe can open `new EventSource(shadow_event_stream)`. Shadow emits:

- `ready`: stream established.
- `server_app.command.completed`: a Buddy or user completed a CLI/API command through Shadow.
- `ping`: heartbeat.

Apps should reload their local data when `server_app.command.completed` arrives. The launch token is short-lived and scoped to the server App.

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
          "permissions": ["demo.tickets:read", "demo.tickets:write"]
        }
      ]
    }
  ]
}
```

The provisioner installs/updates the App, grants the Buddy, and exports runtime env vars such as `SHADOW_SERVER_APP_KEY_DEMO_DESK_APP` and `SHADOW_SERVER_APP_SERVER_DEMO_DESK_APP`.

## Demo

See `skills/shadow-server-app/example-app`. It is a TypeScript Hono app with:

- `/.well-known/shadow-app.json`
- `/shadow/server` iframe UI
- `/assets/icon.svg` app icon
- OAuth Bearer introspection for JSON and multipart command endpoints
- in-memory ticket data
- a multipart file command for binary protocol testing
- SSE consumption so the iframe refreshes after CLI resource operations

See `apps/kanban` for a Trello-style board App. It is intentionally a standalone App process, not part of Shadow's `docker-compose` graph. It ships with:

- `.env`-driven public/API base URLs for local `host.lima.internal` installs or a later hosted domain
- file-backed board persistence through `KANBAN_DATA_FILE`
- decoupled Hono protocol/API routes and iframe UI module
- iframe board UI with drag-and-drop cards, quick add, comments, and live refresh
- commands for `boards.get`, `cards.create`, `cards.move`, `cards.assign`, and `cards.comment`
- default read access plus first-use approval for card writes
