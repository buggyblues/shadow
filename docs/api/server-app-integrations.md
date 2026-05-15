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

`iconUrl` is required and should be a square app icon. Production manifest and command URLs should be public `https` URLs. Local loopback command URLs are accepted only outside production to support demo development. In production-like Docker demos, private App hosts must be explicitly allowlisted with `SHADOW_SERVER_APP_ALLOW_PRIVATE_HOSTS`.

## OAuth-style Authorization Flow

The server management modal uses a two-step Apps flow similar to OAuth consent:

1. Admin enters a manifest URL and clicks review.
2. Shadow fetches and validates the manifest through `POST /api/servers/:serverId/apps/discover`.
3. The UI shows the App icon, name, description, requested permissions, and whether the App is already installed.
4. Admin authorizes installation.
5. Admin grants selected permissions to one or more Buddy agents.

The discovery response does not persist anything. Installation stores a manifest snapshot. The default command auth mode is `oauth2-bearer`, which does not require a static shared secret.

Admins can also publish manifests into the global App catalog. Server admins can install from that catalog without pasting a manifest URL each time. `hmac-sha256` exists only for legacy Apps and requires an encrypted shared secret.

## Channel @App Mentions

Installed Apps are mentionable in server channels as `@AppName`. The message normalizer stores them as canonical `<@app:{serverAppIntegrationId}>` mentions with `appKey`, `appId`, server identity, and icon metadata.

For Buddy routing, an App mention is treated as an explicit trigger. The Shadowob plugin loads `GET /skills` for the mentioned App, injects that Skill markdown into the Buddy prompt, and instructs the Buddy to discover and operate it through:

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
  --manifest-file examples/shadow-server-app-demo/shadow-app.local.json
```

Grant a Buddy permission:

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions demo.tickets:read,demo.tickets:write
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
- `client.getServerAppSkills(serverIdOrSlug, appKey)`
- `client.introspectServerAppToken(serverIdOrSlug, appKey, token)`
- `client.callServerAppCommand(serverIdOrSlug, appKey, commandName, { input, channelId })`
- `client.callServerAppCommandMultipart(...)`

Python SDK mirrors these as snake_case, including `introspect_server_app_token(...)`.

## Security Model

Each command declares:

- `permission`
- `action`: `read`, `write`, `manage`, `delete`, or `generate`
- `dataClass`: `public`, `server-private`, `channel-private`, `financial`, `secret`, or `cloud-secret`
- optional binary limits

Shadow checks:

1. The caller is authenticated as a `user`, `pat`, or `agent` Actor.
2. The actor is a member of the target server.
3. If the actor is a Buddy, it has a `server_app_buddy_grant` for the app and command permission.
4. The command URL passes SSRF checks in production.
5. JSON payloads stay within byte/depth/key/array limits.

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

Legacy `hmac-sha256` Apps receive `X-Shadow-Signature: v1=<hmac_sha256(timestamp + "." + body)>` for JSON command calls. New Apps should use `oauth2-bearer`.

Binary is supported at the protocol layer through multipart commands. A command can set `input: "multipart"` and `binary.supported: true`; the CLI sends `input` as JSON plus a file field.

## iframe Launch and Refresh

`POST /launch` returns a short-lived `launchToken` and `eventStreamPath`. Shadow appends them to the iframe URL as:

- `shadow_launch`
- `shadow_event_stream`

The App iframe can open `new EventSource(shadow_event_stream)`. Shadow emits:

- `ready`: stream established.
- `server_app.command.completed`: a Buddy or user completed a CLI/API command through Shadow.
- `ping`: heartbeat.

Apps should reload their local data when `server_app.command.completed` arrives. The launch token is HMAC signed by Shadow and scoped to the server App.

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

See `examples/shadow-server-app-demo`. It is a TypeScript Hono app with:

- `/.well-known/shadow-app.json`
- `/shadow/server` iframe UI
- `/assets/icon.svg` app icon
- OAuth Bearer introspection for JSON and multipart command endpoints
- in-memory ticket data
- a multipart file command for binary protocol testing
- SSE consumption so the iframe refreshes after CLI resource operations
