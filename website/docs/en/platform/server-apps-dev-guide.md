# Server App Development Guide

This guide walks through a Server App integration from zero to one. A complete runnable example lives in `skills/shadow-server-app/example-app`.

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

## 2. Verify Shadow Bearer Tokens

When Shadow proxies a command, it sends:

- `Authorization: Bearer <short-lived-token>`
- `X-Shadow-Server-Id`
- `X-Shadow-Server-App-Id`
- `X-Shadow-App-Key`
- `X-Shadow-Command`

Your backend introspects that token with Shadow:

```ts
async function introspect(token: string, serverId: string, appKey: string) {
  const res = await fetch(
    `${process.env.SHADOW_SERVER_URL}/api/servers/${serverId}/apps/${appKey}/oauth/introspect`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
  )
  const result = await res.json()
  if (!result.active) throw new Error('invalid_token')
  return result.shadow
}
```

`result.shadow.actor` identifies whether the caller is a user, PAT, OAuth actor, or Buddy agent, and includes `userId`, `buddyAgentId`, `ownerId`, `permission`, `action`, and `dataClass`.

## 3. Implement Command Routes

JSON commands receive:

```json
{
  "input": { "title": "Example" },
  "context": {
    "protocol": "shadow.app/1",
    "serverId": "...",
    "appKey": "demo-desk",
    "command": "tickets.create"
  }
}
```

Use the `shadow` object returned by introspection as the authoritative context. Do not trust the request body context for identity. Multipart commands keep `input` as a JSON string and use the file field declared by `binary.field`.

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

## 5. Install, Grant, and Call

Admins use the Apps page in server settings to choose a catalog App or review a custom manifest URL. The equivalent CLI flow is:

```bash
shadowob app preview --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app install --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app grant demo-desk --server <server-id-or-slug> --buddy <buddy-agent-id> --permissions tickets:write
```

When a Buddy is triggered in a channel, Shadow injects the mentioned App Skills and the Buddy calls through the unified CLI:

```bash
shadowob app discover --server <server-id-or-slug> --json
shadowob app call demo-desk tickets.create --server <server-id-or-slug> --json-input '{"title":"Example"}' --json
```

Channel users only need to say `@Demo Desk create a ticket`; they do not need to describe the CLI path.
