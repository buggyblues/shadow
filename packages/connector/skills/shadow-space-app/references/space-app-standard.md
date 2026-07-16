# Space App Standard

Use this reference to design or review a Space App. Keep domain-specific behavior outside the skill instructions; the skill should only enforce the platform contract.

## Architecture Boundary

- Shadow server is the control plane: installation, authorization, Buddy grants, command policy, approvals, audit, and gateway routing.
- The Space App backend is the data plane: business logic, Space App-owned API, Space App users, Space App sessions, command handlers, and Space App-owned state.
- Space App UI calls only Space App-owned `/api/*`.
- Shadow platform ingress in the Space App lives only under `/.shadow/*`.
- Buddies and CLI operate Space Apps through `shadowob space-app discover`, `shadowob space-app skills`, and `shadowob space-app call`. Do not expose backend routes, Space App tokens, shared secrets, or container ports to Buddies.
- Agents may develop and run Space Apps, but publishing, domain mounting, grants, and backups must go through the Shadow CLI or Cloud control plane.

## Standard Layout

Generate the baseline with:

```bash
shadowob space-app generate <app-key> --dir <output-directory>
```

The generated layout is intentionally domain-neutral:

```text
<output-directory>/
  space-app.local.json
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    manifest.ts
    server.ts
    data.ts
    ui.ts
    space-app.generated.ts
```

`space-app.local.json` is the local source manifest. Production publish flows must rewrite public manifest URL, iframe URL, API base URL, icon URL, and OAuth redirect URI to stable HTTPS origins.

## Manifest Requirements

- Use `schemaVersion: "shadow.space-app/1"`.
- Keep `appKey` lowercase, stable, and suitable as a long-lived route and authorization key.
- Update `version` and `updatedAt` whenever commands, permissions, iframe behavior, API routes, OAuth behavior, events, or Buddy skill text changes.
- Provide a real square `iconUrl`.
- Set `iframe.entry` to the user-facing entry URL and `iframe.allowedOrigins` to exact origins.
- Set `api.baseUrl` to the Space App backend HTTPS origin. This is the Space App origin, not a Shadow protocol namespace.
- Keep commands small and stable. Each command must declare `ingress.path`, `ingress.auth`, JSON Schema, `permission`, `action`, `dataClass`, and approval behavior when applicable.
- Command ingress paths must live under `/.shadow/commands/*`.
- Keep manifest `skills` short and actionable. Do not put full API documentation in the manifest.

Example command entry:

```json
{
  "name": "tickets.create",
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
      "title": { "type": "string", "minLength": 1 }
    },
    "required": ["title"],
    "additionalProperties": false
  }
}
```

## API Rules

- `/api/*` is Space App-owned. Use it for browser UI and synchronous business operations.
- `/.shadow/commands/*` is Shadow gateway ingress. It accepts only Shadow-signed command requests.
- Command ingress receives only the short-lived Bearer command token plus business input. Use the SDK to introspect it through `POST /api/space-apps/commands/introspect`; do not depend on `X-Shadow-*` routing headers or identity fields in the request body.
- `/.shadow/backup/*` and `/.shadow/restore/*` are platform lifecycle ingress when the Space App supports backup/restore hooks.
- Keep platform ingress outside Space App-owned `/api/*`.
- Do not read manifest command ingress paths from browser code.
- Treat `avatarUrl` fields in Shadow identity snapshots as stable public image URLs. Render user avatars, server icons, and Buddy avatars directly; private media delivery is for attachments and workspace files.

## SDK And Protocol

Use `@shadowob/sdk` Space App helpers:

- `defineShadowSpaceApp` to define and rewrite the manifest.
- `shadow-space-app typegen` to generate typed command input from the manifest.
- `shadowSpaceApp.defineCommands` and the Shadow command ingress helpers for command handling.
- `createShadowSpaceAppClient` from `@shadowob/sdk/bridge` for embedded browser session setup and host UX actions.
- `createShadowSpaceAppSessionManager` from `@shadowob/sdk/space-app/node` for opaque Space App sessions and the Space App-owned event stream proxy.
- `createShadowSpaceAppJsonStore` for environment-configured JSON persistence.

These imports are runtime entrypoints of the single `@shadowob/sdk` package. Do not create or publish per-capability SDK packages.

Do not hand-roll manifest rewriting, Shadow command token validation, command JSON Schema validation, actor display labels, or command error envelopes.

## Authorization

- Treat authentication and authorization as separate concerns.
- Space App UI authentication is Space App-owned: Space App session, Space App OAuth account link, or explicit anonymous policy.
- In an embedded launch, exchange the in-memory launch credential once at `POST /api/shadow/session`. Keep the credential server-side and use an opaque `HttpOnly` Space App cookie plus CSRF for subsequent Space App API requests.
- Browser event streams connect only to the Space App-owned `GET /api/shadow/events`. The Space App backend proxies to Shadow with a Bearer launch credential; never put a launch credential in a URL, browser storage, or ordinary business request header.
- Shadow OAuth or PAT scope is not enough for command execution. Shadow gateway must also satisfy server access, command permission, resource rule, action policy, approval, and Buddy grant.
- Use `server-private` or `channel-private` for ordinary server data.
- Do not use `financial`, `secret`, or `cloud-secret` unless the Shadow server policy explicitly supports the use case.
- Do not load Shadow OAuth inside the iframe. Use a top-level popup or navigation and include `allow-popups-to-escape-sandbox` in the iframe sandbox.

## Runtime Behavior

- Keep iframe URLs stable.
- Keep global navigation data warm while refetching.
- Prefer event streams or Space App-local patches over iframe remounts.
- Store mutable state only in declared Space App-owned paths so Cloud backup and restore can capture it.

## CLI Operations

Discover installed Space Apps:

```bash
shadowob space-app discover --server <active-server-id-or-slug> --json
shadowob space-app inspect <app-key> --server <active-server-id-or-slug> --json
shadowob space-app skills <app-key> --server <active-server-id-or-slug>
```

Call a command through Shadow gateway:

```bash
shadowob space-app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --channel-id "$SHADOWOB_CHANNEL_ID" \
  --json-input '{"key":"value"}' \
  --json
```

Attach binary input through Shadow gateway only:

```bash
shadowob space-app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"purpose":"import"}' \
  --file ./input.bin \
  --json
```

Never call Space App `/.shadow/*` directly from Buddy or CLI.
