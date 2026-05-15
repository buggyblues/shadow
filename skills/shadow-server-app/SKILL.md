---
name: shadow-server-app
description: Build or operate Shadow Server Apps that are installed into a server, render an iframe UI, and expose Buddy-callable commands through the shadowob CLI.
metadata:
  short-description: Build Shadow server App integrations
---

# Shadow Server App

Use this skill when integrating a third-party App with a Shadow server or when teaching a Buddy how to operate an installed App.

## Rules

- Apps are installed into a specific Shadow server, not globally.
- Buddies must call App backends through `shadowob app call`; never hand a Buddy raw HTTP routes, App tokens, or legacy shared secrets.
- Use the `shadow.app/1` manifest and keep command names stable.
- Provide a real `iconUrl`; Shadow shows it during OAuth-style install review and in the App list.
- Every command must declare `permission`, `action`, and `dataClass`.
- Use `server-private` or `channel-private` for ordinary server data. Do not use `financial`, `secret`, or `cloud-secret` unless the Shadow server policy explicitly supports that use case.
- For local development, install with `--manifest-file`; production manifests should be hosted on HTTPS.

## Discovery

```bash
shadowob app list --server "$SHADOWOB_SERVER_ID"
shadowob app preview --server "$SHADOWOB_SERVER_ID" --manifest-url "<manifest-url>"
shadowob app discover --server "$SHADOWOB_SERVER_ID" --json
shadowob app inspect <app-key> --server "$SHADOWOB_SERVER_ID" --json
shadowob app skills <app-key> --server "$SHADOWOB_SERVER_ID"
```

Server owners manage App installation and Buddy grants from the server Apps page. Global Shadow admins use the Admin App 集成 tab only for fleet-wide audit and emergency uninstall.

## Calling Commands

```bash
shadowob app call <app-key> <command> \
  --server "$SHADOWOB_SERVER_ID" \
  --json-input '{"key":"value"}'
```

For binary input:

```bash
shadowob app call <app-key> <command> \
  --server "$SHADOWOB_SERVER_ID" \
  --json-input '{"purpose":"import"}' \
  --file ./input.pdf
```

## Manifest Checklist

- `schemaVersion`: `shadow.app/1`
- `appKey`: lowercase stable key
- `iconUrl`: square app icon URL
- `iframe.entry`: user-facing server App UI
- `iframe.allowedOrigins`: exact iframe origins
- `api.baseUrl`: App backend base URL
- `api.auth.type`: use `oauth2-bearer`; `hmac-sha256` is legacy-only
- `commands`: small command surface with JSON schemas and permissions
- `skills`: concise Buddy instructions, not full API docs

## Recommended Buddy Behavior

1. Run `shadowob app discover --server "$SHADOWOB_SERVER_ID"` if the available Apps are unknown.
2. Run `shadowob app inspect <app-key> --server "$SHADOWOB_SERVER_ID" --json` before using a new command.
3. When the channel message mentions a server App, use that app key and server id directly; do not ask the user to restate the CLI path.
4. Use the narrowest command that satisfies the user request.
5. For writes, echo the intended target/resource in the channel unless the App Skill says the operation is safe and routine.
6. Expect the App iframe to refresh from Shadow's event stream after successful CLI commands; do not invent separate refresh webhooks unless the App needs external events.

## App Backend Auth

Server App command requests use `Authorization: Bearer <short-lived-token>` by default. The App backend should call Shadow's introspection endpoint:

```bash
POST /api/servers/<server-id>/apps/<app-key>/oauth/introspect
Authorization: Bearer <short-lived-token>
```

Use the returned `shadow.actor` and command fields as the authoritative identity context.
