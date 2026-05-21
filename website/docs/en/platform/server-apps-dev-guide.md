# Server App Development Guide

This guide walks through a Server App integration from zero to one. The canonical runnable demo lives in `integrations/kanban`; Q&A and quiz examples live in `integrations/qna` and `integrations/quiz`.

## 1. Publish a Manifest

Expose `/.well-known/shadow-app.json` from your App:

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "iconUrl": "https://app.example.com/icon.png",
  "iframe": {
    "entry": "https://app.example.com/shadow/server",
    "allowedOrigins": ["https://app.example.com"]
  },
  "api": {
    "baseUrl": "https://app.example.com",
    "auth": { "type": "oauth2-bearer" }
  },
  "commands": [
    {
      "name": "tickets.create",
      "path": "/api/shadow/commands/tickets.create",
      "permission": "tickets:write",
      "action": "write",
      "dataClass": "server-private"
    }
  ],
  "skills": [
    {
      "name": "ticket-ops",
      "description": "Use when a Buddy needs to create or update tickets."
    }
  ]
}
```

`appKey` is the stable identifier Buddies use with the CLI. Production iframe and API URLs should use HTTPS.

For production, publish a stable HTTPS origin. Do not publish manifests that point to public `http://<ip>:<port>` origins: Shadow pages are loaded over HTTPS, and browsers block mixed-content iframes, images, and frame navigations from IP-literal HTTP hosts.

If the reverse proxy is separate from the App host, DNS should point to the proxy while the proxy forwards to the App host by private or public IP. Keep the IP out of the manifest:

```dotenv
SHADOW_SERVER_URL=https://shadowob.com
SHADOW_WEB_BASE_URL=https://shadowob.com
FLASH_PUBLIC_BASE_URL=https://flash-app.shadowob.com
FLASH_API_BASE_URL=https://flash-app.shadowob.com
FLASH_OAUTH_REDIRECT_URI=https://flash-app.shadowob.com/shadow/oauth/callback
```

Generate a typed manifest module whenever the JSON manifest changes:

```bash
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts
```

The generated module preserves command names and JSON Schema literals so TypeScript can infer command input types.

Keep command schemas explicit but shallow enough for Shadow manifest limits. For flexible values such as quiz answer payloads, prefer a shallow object field plus app-side domain validation over deeply nested `oneOf` schemas.

## 2. Create the App Runtime

When Shadow proxies a command, it sends:

- `Authorization: Bearer <short-lived-token>`
- `X-Shadow-Server-Id`
- `X-Shadow-Server-App-Id`
- `X-Shadow-App-Key`
- `X-Shadow-Command`

Use the SDK runtime to rewrite manifest URLs, introspect tokens, validate command input, and resolve actor profile data:

```ts
import { defineShadowServerApp } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOW_SERVER_URL,
})

const store = createShadowServerAppJsonStore({
  filePath: process.env.DEMO_DATA_FILE ?? './data/demo.json',
  defaultValue: defaultState,
})
```

The runtime exposes the introspected actor to command handlers. It identifies whether the caller is a user, PAT, OAuth actor, or Buddy agent, and includes `userId`, `buddyAgentId`, `ownerId`, `permission`, `action`, and `dataClass`.

## 3. Implement Command Routes

Define commands with schema-derived input types:

```ts
const commands = shadowApp.defineCommands({
  'tickets.create': (input, { actor }) => {
    return { ticket: createTicket({ ...input, author: actor }) }
  },
})
```

Route Shadow command calls through the runtime:

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

Use the introspected context as the authoritative identity. Do not trust request body identity fields. Multipart commands keep `input` as a JSON string and use the file field declared by `binary.field`.

## 4. Refresh the iframe

Shadow appends `shadow_event_stream` when launching the iframe:

```ts
const params = new URLSearchParams(window.location.search)
const stream = params.get('shadow_event_stream')
if (stream) {
  const events = new EventSource(stream)
  events.addEventListener('server_app.command.completed', () => reloadData())
}
```

After a Buddy changes resources through the CLI, Shadow emits `server_app.command.completed` so the App can reload immediately.

Keep the iframe stable:

- Cache launch context until near expiry; do not refetch launch queries on window focus or tab switches.
- Keep global navigation data warm while refetching, and avoid route-level spinners when cached data already exists.
- Do not change iframe `src` query params or React `key` unless the installed App identity changes.
- Use `shadow_event_stream` or app-local event streams to patch data after command results; do not remount the iframe for routine refreshes.

If a Server App needs Shadow OAuth, open `/app/oauth/authorize` in a top-level popup or navigation. Shadow's OAuth page sends `frame-ancestors 'none'`, so it must not be loaded inside the Server App iframe. The Shadow iframe sandbox must include `allow-popups-to-escape-sandbox` for popup OAuth.

## 5. Install, Grant, and Call

Admins use the Apps page in server settings to choose a catalog App or review a custom manifest URL. The equivalent CLI flow is:

```bash
shadowob app preview --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app install --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app grant demo-desk --server <server-id-or-slug> --buddy <buddy-id> --permissions tickets:write
shadowob app uninstall demo-desk --server <server-id-or-slug>
```

For local Docker/Lima development, run the standard demos together and install the manifest URLs that the Shadow server container can reach:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up -d --build

shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4210/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4211/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4212/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4213/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4214/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4215/.well-known/shadow-app.json
```

For public installs, use the HTTPS manifest URL exposed by your reverse proxy:

```bash
shadowob app install --server shadow-plays --manifest-url https://flash-app.shadowob.com/.well-known/shadow-app.json
```

Route `/.well-known/shadow-app.json` before any website SPA fallback. If Shadow Web and the public website share one host, keep `/app/oauth/authorize` as the canonical OAuth browser entry, redirect legacy `/oauth/authorize` to it, and proxy `/.well-known/*` protocol files before docs or frontend fallback routes.

Grant all commands a Buddy should use, then approve `first_time` write commands once for that Buddy:

```bash
shadowob app grant shadow-kanban --server shadow-plays --buddy <buddy-id> --permissions kanban.boards:read,kanban.cards:write
shadowob app approve shadow-kanban cards.create --server shadow-plays --buddy <buddy-id>
```

When a Buddy is triggered in a channel, Shadow injects the mentioned App Skills and the Buddy calls through the unified CLI:

```bash
shadowob app discover --server <server-id-or-slug> --json
shadowob app call demo-desk tickets.create --server <server-id-or-slug> --json-input '{"title":"Example"}' --json
```

Channel users only need to say `@Demo Desk create a ticket`; they do not need to describe the CLI path.
