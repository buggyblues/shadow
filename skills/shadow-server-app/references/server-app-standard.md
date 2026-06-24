# Server App Standard

Use this reference to design or review a Shadow Server App. Keep the App domain-specific behavior outside the skill instructions; the skill should only enforce the platform contract.

## Architecture Boundary

- Shadow server is the control plane: installation, authorization, OAuth, Buddy grants, command policy, audit, and entry routing.
- The App backend is the data plane: business logic, iframe launch handling, command execution, event streaming, and App-owned state.
- Buddies operate Apps through the Shadow Server App protocol and the `shadowob app` CLI. Do not expose backend routes, App tokens, shared secrets, or container ports to Buddies.
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
- Set `api.baseUrl` to the App backend HTTPS base URL.
- Use `api.auth.type: "oauth2-bearer"`.
- Keep commands small and stable. Each command must declare JSON Schema, `permission`, `action`, `dataClass`, and approval behavior when applicable.
- Keep manifest `skills` short and actionable. Do not put full API documentation in the manifest.

## SDK And Protocol

Use `@shadowob/sdk` Server App helpers:

- `defineShadowServerApp` to define and rewrite the manifest.
- `shadow-server-app typegen` to generate typed command input from the manifest.
- `shadowApp.defineCommands`, `shadowApp.executeCommand`, `shadowApp.executeLocal`, and `shadowApp.error` for command protocol handling.
- `createShadowServerAppJsonStore` for environment-configured JSON persistence.

Do not hand-roll Bearer token parsing, token introspection, manifest rewriting, command JSON Schema validation, actor display labels, or command error envelopes.

## Authorization

- Treat authentication and authorization as separate concerns.
- OAuth or PAT scope is not enough. A command must also satisfy App grant, server access, command permission, resource rule, and action policy.
- Use `server-private` or `channel-private` for ordinary server data.
- Do not use `financial`, `secret`, or `cloud-secret` unless the Shadow server policy explicitly supports the use case.
- Do not load Shadow OAuth inside the iframe. Use a top-level popup or navigation and include `allow-popups-to-escape-sandbox` in the iframe sandbox.

## Runtime Behavior

- Keep iframe launch URLs stable; avoid query strings that force remounts on every launch refresh.
- Cache launch context until close to expiry.
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

Call a command:

```bash
shadowob app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --channel-id "$SHADOWOB_CHANNEL_ID" \
  --json-input '{"key":"value"}' \
  --json
```

Attach binary input through the command protocol only:

```bash
shadowob app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"purpose":"import"}' \
  --file ./input.bin \
  --json
```
