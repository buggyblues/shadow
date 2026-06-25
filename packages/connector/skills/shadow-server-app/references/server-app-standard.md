# App Standard

Use this reference to design or review a Shadow App. Keep domain-specific behavior outside the skill instructions; the skill should only enforce the platform contract.

## Architecture Boundary

- Shadow server is the control plane: installation, authorization, Buddy grants, command policy, approvals, audit, and gateway routing.
- The App backend is the data plane: business logic, App-owned API, App users, App sessions, command handlers, and App-owned state.
- App UI calls only App-owned `/api/*`.
- Shadow platform ingress in the App lives only under `/.shadow/*`.
- Buddies and CLI operate Apps through `shadowob app discover`, `shadowob app skills`, and `shadowob app call`. Do not expose backend routes, App tokens, shared secrets, or container ports to Buddies.
- Agents may develop and run Apps, but publishing, domain mounting, grants, and backups must go through the Shadow CLI or Cloud control plane.

## Standard Layout

Generate the baseline with:

```bash
shadowob app generate <app-key> --dir <output-directory>
```

The generated layout is intentionally domain-neutral:

```text
<output-directory>/
  shadow-app.local.json
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    manifest.ts
    server.ts
    data.ts
    ui.ts
    shadow-app.generated.ts
```

`shadow-app.local.json` is the local source manifest. Production publish flows must rewrite public manifest URL, iframe URL, API base URL, icon URL, and OAuth redirect URI to stable HTTPS origins.

## Manifest Requirements

- Use `schemaVersion: "shadow.app/1"`.
- Keep `appKey` lowercase, stable, and suitable as a long-lived route and authorization key.
- Update `version` and `updatedAt` whenever commands, permissions, iframe behavior, API routes, OAuth behavior, events, or Buddy skill text changes.
- Provide a real square `iconUrl`.
- Set `iframe.entry` to the user-facing entry URL and `iframe.allowedOrigins` to exact origins.
- Set `api.baseUrl` to the App backend HTTPS origin. This is the App origin, not a Shadow protocol namespace.
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

- `/api/*` is App-owned. Use it for browser UI and synchronous business operations.
- `/.shadow/commands/*` is Shadow gateway ingress. It accepts only Shadow-signed command requests.
- `/.shadow/backup/*` and `/.shadow/restore/*` are platform lifecycle ingress when the App supports backup/restore hooks.
- Keep platform ingress outside App-owned `/api/*`.
- Do not read manifest command ingress paths from browser code.
- Treat `avatarUrl` fields in Shadow identity snapshots as stable public image URLs. Render user avatars, server icons, and Buddy avatars directly; private media delivery is for attachments and workspace files.

## SDK And Protocol

Use `@shadowob/sdk` App helpers:

- `defineShadowServerApp` to define and rewrite the manifest.
- `shadow-server-app typegen` to generate typed command input from the manifest.
- `shadowApp.defineCommands` and the Shadow command ingress helpers for command handling.
- `createShadowServerAppJsonStore` for environment-configured JSON persistence.

Do not hand-roll manifest rewriting, Shadow command token validation, command JSON Schema validation, actor display labels, or command error envelopes.

## Authorization

- Treat authentication and authorization as separate concerns.
- App UI authentication is App-owned: App session, App OAuth account link, or explicit anonymous policy.
- Shadow OAuth or PAT scope is not enough for command execution. Shadow gateway must also satisfy server access, command permission, resource rule, action policy, approval, and Buddy grant.
- Use `server-private` or `channel-private` for ordinary server data.
- Do not use `financial`, `secret`, or `cloud-secret` unless the Shadow server policy explicitly supports the use case.
- Do not load Shadow OAuth inside the iframe. Use a top-level popup or navigation and include `allow-popups-to-escape-sandbox` in the iframe sandbox.

## Runtime Behavior

- Keep iframe URLs stable.
- Keep global navigation data warm while refetching.
- Prefer event streams or App-local patches over iframe remounts.
- Store mutable state only in declared App-owned paths so Cloud backup and restore can capture it.

## CLI Operations

Discover installed Apps:

```bash
shadowob app discover --server <active-server-id-or-slug> --json
shadowob app inspect <app-key> --server <active-server-id-or-slug> --json
shadowob app skills <app-key> --server <active-server-id-or-slug>
```

Call a command through Shadow gateway:

```bash
shadowob app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --channel-id "$SHADOWOB_CHANNEL_ID" \
  --json-input '{"key":"value"}' \
  --json
```

Attach binary input through Shadow gateway only:

```bash
shadowob app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"purpose":"import"}' \
  --file ./input.bin \
  --json
```

Never call App `/.shadow/*` directly from Buddy or CLI.
