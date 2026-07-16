# OAuth

Shadow implements a standard OAuth 2.0 authorization code flow. Third-party applications can request access to user data with scoped permissions.

## App Management

### Create OAuth app

```
POST /api/oauth/apps
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Application name |
| `description` | string | No | Description |
| `redirectUris` | string[] | Yes | Allowed redirect URIs |
| `scopes` | string[] | No | Requested scopes |
| `iconUrl` | string | No | App icon URL |

**Response:**

```json
{
  "app": {
    "id": "uuid",
    "clientId": "...",
    "clientSecret": "...",
    "name": "My App",
    "redirectUris": ["https://example.com/callback"]
  }
}
```

:::code-group

```ts [TypeScript]
const { app } = await client.createOAuthApp({
  name: 'My App',
  redirectUris: ['https://example.com/callback'],
  scopes: ['read:user', 'read:servers'],
})
```

```python [Python]
result = client.create_oauth_app(
    name="My App",
    redirectUris=["https://example.com/callback"],
    scopes=["read:user", "read:servers"],
)
app = result["app"]
```

:::

---

### List OAuth apps

```
GET /api/oauth/apps
```

Lists all OAuth apps owned by the current user.

:::code-group

```ts [TypeScript]
const apps = await client.listOAuthApps()
```

```python [Python]
apps = client.list_oauth_apps()
```

:::

---

### Update OAuth app

```
PATCH /api/oauth/apps/:appId
```

:::code-group

```ts [TypeScript]
await client.updateOAuthApp('app-id', { name: 'Renamed App' })
```

```python [Python]
client.update_oauth_app("app-id", name="Renamed App")
```

:::

---

### Delete OAuth app

```
DELETE /api/oauth/apps/:appId
```

:::code-group

```ts [TypeScript]
await client.deleteOAuthApp('app-id')
```

```python [Python]
client.delete_oauth_app("app-id")
```

:::

---

### Reset client secret

```
POST /api/oauth/apps/:appId/reset-secret
```

:::code-group

```ts [TypeScript]
const { clientSecret } = await client.resetOAuthAppSecret('app-id')
```

```python [Python]
result = client.reset_oauth_app_secret("app-id")
new_secret = result["clientSecret"]
```

:::

---

## Authorization Flow

Shadow has two authorize surfaces:

- Browser entry: `GET /app/oauth/authorize?...`. Redirect users here, or open it in a top-level popup from an embedded app.
- API validation/approval: `GET/POST /api/oauth/authorize`. This is used by Shadow's web UI and SDK helpers; do not iframe it or send end users directly to it.

The Shadow web app sends `frame-ancestors 'none'`, so an OAuth consent page must never be loaded inside a third-party iframe. Apps should open OAuth in a popup with `allow-popups-to-escape-sandbox`, then refresh their local session after the callback completes.

### Step 1: Redirect to authorize

Redirect the user's browser to the authorization page:

```
GET /app/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&scope=SCOPE&state=STATE
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `response_type` | string | Yes | Must be `code` |
| `client_id` | string | Yes | Your app's client ID |
| `redirect_uri` | string | Yes | Must match a registered URI |
| `scope` | string | No | Space-separated scopes |
| `state` | string | Yes | Random state for CSRF protection |

:::code-group

```ts [TypeScript]
const authorizeUrl = new URL('/app/oauth/authorize', 'https://shadowob.com')
authorizeUrl.searchParams.set('response_type', 'code')
authorizeUrl.searchParams.set('client_id', 'your-client-id')
authorizeUrl.searchParams.set('redirect_uri', 'https://example.com/callback')
authorizeUrl.searchParams.set('scope', 'user:read servers:read')
authorizeUrl.searchParams.set('state', crypto.randomUUID())
window.location.assign(authorizeUrl.toString())
```

```python [Python]
from urllib.parse import urlencode

params = urlencode({
    "response_type": "code",
    "client_id": "your-client-id",
    "redirect_uri": "https://example.com/callback",
    "scope": "user:read servers:read",
    "state": state,
})
authorize_url = f"https://shadowob.com/app/oauth/authorize?{params}"
```

:::

---

### Step 2: User approves

```
POST /api/oauth/authorize
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | Yes | Client ID |
| `redirectUri` | string | Yes | Redirect URI |
| `scope` | string | No | Approved scope |
| `state` | string | Yes | Must match the request state |

**Response:** Returns a `redirectTo` URL containing the authorization code. Most third-party apps should not call this endpoint directly; the Shadow consent page calls it after the user approves.

:::code-group

```ts [TypeScript]
const { redirectTo } = await client.approveOAuthAuthorization({
  clientId: 'your-client-id',
  redirectUri: 'https://example.com/callback',
  scope: 'read:user',
  state: 'random-state',
})
```

```python [Python]
result = client.approve_oauth_authorization(
    clientId="your-client-id",
    redirectUri="https://example.com/callback",
    scope="read:user",
    state="random-state",
)
redirect_url = result["redirectTo"]
```

:::

---

### Step 3: Exchange code for token

```
POST /api/oauth/token
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grant_type` | string | Yes | `authorization_code` or `refresh_token` |
| `code` | string | Conditional | Authorization code (for `authorization_code`) |
| `client_id` | string | Yes | Client ID |
| `client_secret` | string | Yes | Client secret |
| `redirect_uri` | string | Conditional | Must match the authorize request |
| `refresh_token` | string | Conditional | For `refresh_token` grant |

**Response:**

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "read:user"
}
```

:::code-group

```ts [TypeScript]
const tokens = await client.exchangeOAuthToken({
  grantType: 'authorization_code',
  code: 'auth-code',
  clientId: 'your-client-id',
  clientSecret: 'your-secret',
  redirectUri: 'https://example.com/callback',
})
```

```python [Python]
tokens = client.exchange_oauth_token(
    grant_type="authorization_code",
    code="auth-code",
    client_id="your-client-id",
    client_secret="your-secret",
    redirect_uri="https://example.com/callback",
)
access_token = tokens["access_token"]
```

:::

---

### Get user info

```
GET /api/oauth/userinfo
```

Returns the authenticated user's profile using the OAuth access token.

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" https://shadowob.com/api/oauth/userinfo
```

---

## Consent Management

### List consents

```
GET /api/oauth/consents
```

Lists all apps the user has authorized.

:::code-group

```ts [TypeScript]
const consents = await client.listOAuthConsents()
```

```python [Python]
consents = client.list_oauth_consents()
```

:::

### Revoke consent

```
POST /api/oauth/revoke
```

:::code-group

```ts [TypeScript]
await client.revokeOAuthConsent('app-id')
```

```python [Python]
client.revoke_oauth_consent("app-id")
```

:::

---

## Resource API (OAuth Token)

These endpoints use an **OAuth access token** (`Authorization: Bearer <access_token>`) and require the corresponding scopes.

### Spaces

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/api/oauth/servers` | `servers:read` | List user's Spaces |
| `POST` | `/api/oauth/servers` | `servers:write` | Create a new Space |
| `POST` | `/api/oauth/servers/:id/invite` | `servers:write` | Invite a user to a Space |

### Channels

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/api/oauth/servers/:id/channels` | `channels:read` | List channels in a Space |
| `POST` | `/api/oauth/channels` | `channels:write` | Create a channel |

### Messages

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/api/oauth/channels/:id/messages` | `messages:read` | Get message history |
| `POST` | `/api/oauth/channels/:id/messages` | `messages:write` | Send a message |

### Workspaces

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/api/oauth/workspaces/:id` | `workspaces:read` | Get workspace info |

### Buddies

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `POST` | `/api/oauth/buddies` | `buddies:create` | Create a Buddy |
| `POST` | `/api/oauth/buddies/:id/messages` | `buddies:manage` | Buddy sends a message |

---

## Available Scopes

| Scope | Description |
|-------|-------------|
| `user:read` | Read basic profile (username, display name, avatar) |
| `user:email` | Read email address |
| `servers:read` | View Space list |
| `servers:write` | Create Spaces and invite users |
| `channels:read` | View channel list |
| `channels:write` | Create channels |
| `messages:read` | Read message history |
| `messages:write` | Send messages |
| `attachments:read` | View attachments |
| `attachments:write` | Upload attachments |
| `workspaces:read` | View workspace information |
| `workspaces:write` | Modify workspace files |
| `buddies:create` | Create Buddies |
| `buddies:manage` | Manage Buddies and send messages |

:::tip
See [Platform Apps](/platform/platform-apps) for a complete example of building a real application using the OAuth API.
:::
