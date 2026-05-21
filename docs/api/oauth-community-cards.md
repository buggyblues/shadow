# OAuth Community Cards

Community website cards should be limited to registered Shadow OAuth Apps.

## Registration Model

An OAuth App that wants to render inside Shadow should declare:

- exact redirect URI
- allowed card origins
- card manifest URL
- required OAuth scopes

The card origin must match the registered origin before Shadow launches an iframe.
Until a dedicated `allowedCardOrigins` field ships, Shadow derives allowed card origins
from the OAuth App `homepageUrl` and `redirectUris`. Card URLs must be HTTPS, except
for loopback HTTP origins during local development.

## Card Manifest

The sample manifest shape is:

```json
{
  "schemaVersion": 1,
  "name": "Example App",
  "origin": "https://app.example.com",
  "entry": "https://app.example.com/card",
  "permissions": ["user:read", "servers:read"],
  "fallbackUrl": "https://app.example.com"
}
```

## Iframe Launch

The host should:

- use an iframe sandbox and CSP allowlist for the registered origin
- perform a `postMessage` handshake before sending launch context
- exchange only app-scoped launch credentials, not the user's full Shadow token
- show an open-external fallback if the site blocks embedding

See the [`shadow-oauth-app`](https://github.com/buggyblues/shadow/tree/main/skills/shadow-oauth-app) Skill and its `references/shadow-oauth-card-app` sample for a minimal developer implementation.

## Channel Link Card Messages

OAuth Apps can attach link cards when posting channel messages with an OAuth access
token that has `messages:write`.

```http
POST /api/oauth/channels/{channelId}/messages
Authorization: Bearer oat_...
Content-Type: application/json
```

```json
{
  "content": "Open this app",
  "metadata": {
    "oauthLinkCards": [
      {
        "kind": "oauth_link",
        "appId": "11111111-1111-4111-8111-111111111111",
        "title": "Example App",
        "description": "Embedded app preview",
        "meta": {
          "appName": "Example App",
          "avatarUrl": "https://app.example.com/avatar.png",
          "coverUrl": "https://app.example.com/cover.png"
        },
        "url": "https://app.example.com/card",
        "embedUrl": "https://app.example.com/card",
        "fallbackUrl": "https://app.example.com",
        "action": { "mode": "open_iframe" }
      }
    ]
  }
}
```

Shadow validates that each card `appId` matches the token's OAuth App, and that
`url`, `embedUrl`, `fallbackUrl`, and any image URLs in `meta` all use an origin
registered by that app. Shadow also enriches the card metadata from the OAuth App
record (`name`, `logoUrl`, `homepageUrl`) so clients can render it as an external
application card with avatar/app metadata.

The channel UI renders the card inline as a preview entry. Clicking the card opens
`embedUrl` in the same right-side preview panel used by chat attachment previews,
waits for `shadow.card.ready`, and then posts `shadow.card.launch` with only card
and channel context. The external fallback link lives inside the preview panel.
