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

## Flow

1. Redirect users to `/oauth/authorize` with `response_type=code`, `client_id`, exact `redirect_uri`, scopes, and `state`.
2. Exchange `code` at `/api/oauth/token` using `grant_type=authorization_code`.
3. Store access and refresh tokens in a server-side session.
4. Use `Authorization: Bearer <access_token>` for `/api/oauth/userinfo`, `/api/oauth/servers`, `/api/oauth/servers/:id/channels`, and other scoped OAuth APIs.
5. Refresh via `/api/oauth/token` with `grant_type=refresh_token` before expiry or after a 401.
6. For community cards, serve a manifest from a registered allowed origin and perform a `postMessage` handshake with the Shadow iframe wrapper.

## Sample

The repo sample at `examples/shadow-oauth-card-app` demonstrates:

- Login with Shadow
- Authorization-code callback
- Token refresh
- User/server/channel API reads
- A minimal iframe card manifest and card page

Run it with:

```bash
SHADOW_BASE_URL=http://localhost:3002 \
SHADOW_CLIENT_ID=... \
SHADOW_CLIENT_SECRET=... \
SHADOW_REDIRECT_URI=http://localhost:4178/callback \
node examples/shadow-oauth-card-app/server.mjs
```

Register `http://localhost:4178` as the card origin and `http://localhost:4178/callback` as the redirect URI.
