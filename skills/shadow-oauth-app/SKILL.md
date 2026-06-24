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
- For commerce integrations, add `commerce:read` only when checking a user's purchased app
  entitlement and `commerce:write` only when redeeming or consuming one.
- Treat iframe card access as app-scoped. The card page should not receive a full Shadow user token.
- Validate `state` on callback and rotate refresh tokens when the token endpoint returns a new one.
- Use `/app/oauth/authorize` as the browser-facing authorize entry. Do not depend on `/oauth/authorize`.
- Do not iframe the Shadow authorize page. Shadow sends `frame-ancestors 'none'`; embedded cards and Server Apps must open OAuth in a top-level popup or navigation, then refresh their app-local session after callback.
- Commerce apps must use Shadow purchases as the source of truth. Do not build a parallel billing or
  entitlement model unless the Shadow order is still linked and visible to the buyer.

## Shadow Platform URLs

All OAuth interactions use the Shadow production platform at `https://shadowob.com`:

| Endpoint | URL |
|----------|-----|
| Authorization | `https://shadowob.com/app/oauth/authorize` |
| Token Exchange | `https://shadowob.com/api/oauth/token` |
| Userinfo | `https://shadowob.com/api/oauth/userinfo` |
| Server List | `https://shadowob.com/api/oauth/servers` |
| Server Channels | `https://shadowob.com/api/oauth/servers/:id/channels` |
| Token Revoke | `https://shadowob.com/api/oauth/revoke` |
| Commerce Entitlement Check | `https://shadowob.com/api/oauth/commerce/entitlements` |
| Commerce Entitlement Redeem | `https://shadowob.com/api/oauth/commerce/entitlements/redeem` |

## Flow

1. Redirect users to `https://shadowob.com/app/oauth/authorize` with `response_type=code`, `client_id`, exact `redirect_uri`, scopes, and `state`.
2. Exchange `code` at `https://shadowob.com/api/oauth/token` using `grant_type=authorization_code`.
3. Store access and refresh tokens in a server-side session.
4. Use `Authorization: Bearer <access_token>` for `/api/oauth/userinfo`, `/api/oauth/servers`, `/api/oauth/servers/:id/channels`, and other scoped OAuth APIs.
5. Refresh via `https://shadowob.com/api/oauth/token` with `grant_type=refresh_token` before expiry or after a 401.
6. For embedded cards and Server Apps, open the authorize URL in a popup with a signed `state`; the callback can `postMessage` the opener and close, and the iframe should then reload only its session query.
7. For community cards, serve a manifest from a registered allowed origin and perform a `postMessage` handshake with the Shadow iframe wrapper.

## Commerce Entitlements

Use Shadow commerce endpoints when an external app sells a service, credit pack, subscription, or
feature through a Shadow shop.

- App-backed products should use `resourceType = "external_app"`.
- `resourceId` must equal the OAuth app id or start with `<appId>:` for a feature/SKU namespace.
- `GET /api/oauth/commerce/entitlements` checks whether the token user owns the requested right.
- `POST /api/oauth/commerce/entitlements/redeem` consumes or fulfills one eligible right with an
  `idempotencyKey`.
- A repeated redemption with the same `idempotencyKey` must return the same result.
- The app may not query or redeem another app's resource namespace.

Browser validation still starts from a Shadow purchase: buy the app entitlement in Shadow, complete
OAuth login in the provider app, check access, redeem, then confirm the Shadow order still shows the
purchase and support route.

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

# Check and redeem app-scoped Shadow commerce purchases with a user OAuth token
shadowob oauth commerce check --access-token <oauth-access-token> --resource-id <app-id>:premium --json
shadowob oauth commerce redeem --access-token <oauth-access-token> --resource-id <app-id>:premium --idempotency-key <provider-operation-id> --json
```

### Via Web

Manage OAuth apps in the Shadow web app at `https://shadowob.com/settings/oauth-apps`.

## Sample

The bundled reference app at `references/shadow-oauth-card-app` demonstrates:

- Login with Shadow
- Authorization-code callback
- Token refresh
- User/server/channel API reads
- Commerce entitlement check and idempotent redemption
- A minimal iframe card manifest and card page

Run it with:

```bash
SHADOWOB_SERVER_URL=https://shadowob.com \
SHADOWOB_CLIENT_ID=<your-client-id> \
SHADOWOB_CLIENT_SECRET=<your-client-secret> \
SHADOWOB_REDIRECT_URI=https://myapp.com/callback \
node skills/shadow-oauth-app/references/shadow-oauth-card-app/server.mjs
```

For local development, you can set `SHADOWOB_SERVER_URL=http://localhost:3002` and register `http://localhost:4178` as the card origin and `http://localhost:4178/callback` as the redirect URI in your OAuth App settings.
