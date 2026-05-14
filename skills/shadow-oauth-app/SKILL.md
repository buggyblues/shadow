---
name: shadow-oauth-app
description: Build or review third-party Shadow OAuth apps, including authorization-code login, token refresh, scoped user/server/channel access, and community iframe card manifests.
metadata:
  short-description: Build Shadow OAuth apps and community cards
---

# Shadow OAuth App

Use this skill when integrating a third-party app with Shadow OAuth or preparing a community card that opens inside Shadow.

## Core Rules

- Use Authorization Code flow only. Keep `client_secret` server-side.
- Register exact redirect URIs and card origins in the Shadow OAuth App before testing.
- Request the narrowest scopes needed: start with `user:read`, then add `servers:read`, `channels:read`, `messages:*`, `workspaces:*`, or `buddies:*` as needed.
- Treat iframe card access as app-scoped. The card page should not receive a full Shadow user token.
- Validate `state` on callback and rotate refresh tokens when the token endpoint returns a new one.

## Shadow Platform URLs

All OAuth interactions use the Shadow production platform at `https://shadowob.com`:

| Endpoint | URL |
|----------|-----|
| Authorization | `https://shadowob.com/oauth/authorize` |
| Token Exchange | `https://shadowob.com/api/oauth/token` |
| Userinfo | `https://shadowob.com/api/oauth/userinfo` |
| Server List | `https://shadowob.com/api/oauth/servers` |
| Server Channels | `https://shadowob.com/api/oauth/servers/:id/channels` |
| Token Revoke | `https://shadowob.com/api/oauth/revoke` |

## Flow

1. Redirect users to `https://shadowob.com/oauth/authorize` with `response_type=code`, `client_id`, exact `redirect_uri`, scopes, and `state`.
2. Exchange `code` at `https://shadowob.com/api/oauth/token` using `grant_type=authorization_code`.
3. Store access and refresh tokens in a server-side session.
4. Use `Authorization: Bearer <access_token>` for `/api/oauth/userinfo`, `/api/oauth/servers`, `/api/oauth/servers/:id/channels`, and other scoped OAuth APIs.
5. Refresh via `https://shadowob.com/api/oauth/token` with `grant_type=refresh_token` before expiry or after a 401.
6. For community cards, serve a manifest from a registered allowed origin and perform a `postMessage` handshake with the Shadow iframe wrapper.

## Managing OAuth Apps

### Via CLI

Use `shadowob oauth` commands to manage OAuth apps:

```bash
# Create an OAuth app
shadowob oauth create --name "My App" --description "App description" --redirect-uri https://myapp.com/callback --homepage https://myapp.com --json

# List your OAuth apps
shadowob oauth list --json

# Update an OAuth app
shadowob oauth update <app-id> --name "New Name" --redirect-uri https://myapp.com/new-callback --json

# Reset client secret
shadowob oauth reset-secret <app-id> --json

# Delete an OAuth app
shadowob oauth delete <app-id>

# Manage consents
shadowob oauth consents --json
shadowob oauth revoke <app-id>
```

### Via Web

Manage OAuth apps in the Shadow web app at `https://shadowob.com/settings/oauth-apps`.

## Sample

The repo sample at `examples/shadow-oauth-card-app` demonstrates:

- Login with Shadow
- Authorization-code callback
- Token refresh
- User/server/channel API reads
- A minimal iframe card manifest and card page

Run it with:

```bash
SHADOW_BASE_URL=https://shadowob.com \
SHADOW_CLIENT_ID=<your-client-id> \
SHADOW_CLIENT_SECRET=<your-client-secret> \
SHADOW_REDIRECT_URI=https://myapp.com/callback \
node examples/shadow-oauth-card-app/server.mjs
```

For local development, you can set `SHADOW_BASE_URL=http://localhost:3002` and register `http://localhost:4178` as the card origin and `http://localhost:4178/callback` as the redirect URI in your OAuth App settings.
