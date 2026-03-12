# Shadow Open Platform — OAuth 2.0

## Overview

The Shadow Open Platform provides two core capabilities:

1. **OAuth Provider** — Shadow acts as an identity provider, allowing third-party apps to authenticate users via Shadow accounts.
2. **OAuth Consumer** — Shadow supports sign-in through Google, GitHub, and other major platforms.

---

## 1. OAuth Provider (Shadow as Identity Provider)

### 1.1 Developer App Management

Developers create OAuth apps in Shadow to obtain a `clientId` / `clientSecret` pair.

**Create an App**

```
POST /api/oauth/apps
Authorization: Bearer <user_token>

{
  "name": "My App",
  "description": "A cool app",
  "redirectUris": ["https://myapp.com/callback"],
  "homepageUrl": "https://myapp.com",
  "logoUrl": "https://myapp.com/logo.png"  // optional
}
```

Response:

```json
{
  "id": "uuid",
  "clientId": "shadow_xxxxxxxxxxxxxxxx",
  "clientSecret": "shsec_xxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "My App",
  "description": "A cool app",
  "redirectUris": ["https://myapp.com/callback"],
  "homepageUrl": "https://myapp.com",
  "logoUrl": null,
  "createdAt": "2026-03-12T00:00:00.000Z"
}
```

> ⚠️ `clientSecret` is returned **only once** at creation time.

**List My Apps**

```
GET /api/oauth/apps
Authorization: Bearer <user_token>
```

**Update an App**

```
PATCH /api/oauth/apps/:appId
Authorization: Bearer <user_token>

{
  "name": "Updated Name",
  "redirectUris": ["https://myapp.com/callback", "https://myapp.com/callback2"]
}
```

**Delete an App**

```
DELETE /api/oauth/apps/:appId
Authorization: Bearer <user_token>
```

**Reset Client Secret**

```
POST /api/oauth/apps/:appId/reset-secret
Authorization: Bearer <user_token>
```

### 1.2 Authorization Code Flow

#### Step 1: Redirect the User to Shadow's Authorization Page

```
GET /oauth/authorize?
  response_type=code&
  client_id=shadow_xxx&
  redirect_uri=https://myapp.com/callback&
  scope=user:read&
  state=random_state_string
```

Parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| response_type | Yes | Must be `code` |
| client_id | Yes | The app's Client ID |
| redirect_uri | Yes | Callback URL — must match one registered with the app |
| scope | No | Permission scope, defaults to `user:read` |
| state | Recommended | Random string for CSRF protection |

Supported Scopes:

| Scope | Description |
|-------|-------------|
| `user:read` | Read basic user info (id, username, displayName, avatarUrl) |
| `user:email` | Read user email address |

#### Step 2: User Grants Authorization

Shadow redirects the user to `redirect_uri`:

```
https://myapp.com/callback?code=AUTH_CODE&state=random_state_string
```

#### Step 3: Exchange the Authorization Code for Tokens

```
POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE",
  "client_id": "shadow_xxx",
  "client_secret": "shsec_xxx",
  "redirect_uri": "https://myapp.com/callback"
}
```

Response:

```json
{
  "access_token": "oat_xxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "ort_xxxxxxxx",
  "scope": "user:read"
}
```

#### Step 4: Refresh the Token

```
POST /api/oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "ort_xxxxxxxx",
  "client_id": "shadow_xxx",
  "client_secret": "shsec_xxx"
}
```

#### Step 5: Fetch User Info with the Access Token

```
GET /api/oauth/userinfo
Authorization: Bearer oat_xxxxxxxx
```

Response:

```json
{
  "id": "user-uuid",
  "username": "alice",
  "displayName": "Alice",
  "avatarUrl": "...",
  "email": "alice@example.com"
}
```

> The `email` field is only included when the scope contains `user:email`.

### 1.3 Revoke Authorization

Users can manage authorized apps from the Shadow settings page.

```
POST /api/oauth/revoke
Authorization: Bearer <user_token>

{
  "appId": "app-uuid"
}
```

---

## 2. OAuth Consumer (Sign in to Shadow via Third-Party Providers)

### 2.1 Supported Providers

| Provider | Provider ID |
|----------|-------------|
| Google | `google` |
| GitHub | `github` |

### 2.2 Login Flow

#### Step 1: Initiate Third-Party Sign-In

```
GET /api/auth/oauth/:provider?redirect=/app
```

The server responds with a 302 redirect to the provider's OAuth authorization page.

#### Step 2: Provider Callback

```
GET /api/auth/oauth/:provider/callback?code=xxx&state=xxx
```

The server exchanges the authorization code for a provider token and fetches the user profile:
- If the third-party account is already linked to a Shadow user — sign in directly.
- If the email matches an existing user — automatically link and sign in.
- If the user is new — create a Shadow account, link, and sign in.

After sign-in, the user is redirected to the frontend with tokens passed via URL hash:

```
/oauth-callback#access_token=xxx&refresh_token=xxx
```

### 2.3 Environment Variables

```env
# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# General
OAUTH_BASE_URL=https://shadowob.com
```

---

## 3. OAuth SDK (@shadowob/oauth)

### 3.1 Installation

```bash
npm install @shadowob/oauth
```

### 3.2 Usage

```typescript
import { ShadowOAuth } from '@shadowob/oauth'

const oauth = new ShadowOAuth({
  clientId: 'shadow_xxx',
  clientSecret: 'shsec_xxx',
  redirectUri: 'https://myapp.com/callback',
})

// Generate the authorization URL
const authUrl = oauth.getAuthorizeUrl({
  scope: ['user:read', 'user:email'],
  state: 'random-state',
})

// Exchange the authorization code for tokens
const tokens = await oauth.getToken(code)
// => { accessToken, refreshToken, expiresIn, scope }

// Fetch user info
const user = await oauth.getUser(tokens.accessToken)
// => { id, username, displayName, avatarUrl, email? }

// Refresh the token
const newTokens = await oauth.refreshToken(tokens.refreshToken)
```

---

## 4. Data Models

### oauth_apps

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Creator (FK → users) |
| client_id | varchar(64) | Unique app identifier |
| client_secret_hash | text | Hashed client secret |
| name | varchar(128) | App name |
| description | text | App description |
| homepage_url | text | App homepage |
| logo_url | text | App logo |
| redirect_uris | jsonb | Allowed callback URLs |
| is_active | boolean | Whether the app is active |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |

### oauth_authorization_codes

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| code | varchar(128) | Authorization code |
| app_id | uuid | FK → oauth_apps |
| user_id | uuid | FK → users |
| redirect_uri | text | Callback URL |
| scope | varchar(255) | Granted scope |
| expires_at | timestamp | Expiration time |
| used | boolean | Whether the code has been used |
| created_at | timestamp | Creation time |

### oauth_access_tokens

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| token_hash | varchar(128) | Token value (stored as SHA-256 hash) |
| app_id | uuid | FK → oauth_apps |
| user_id | uuid | FK → users |
| scope | varchar(255) | Granted scope |
| expires_at | timestamp | Expiration time |
| created_at | timestamp | Creation time |

### oauth_refresh_tokens

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| token_hash | varchar(128) | Token value (stored as SHA-256 hash) |
| access_token_id | uuid | FK → oauth_access_tokens |
| app_id | uuid | FK → oauth_apps |
| user_id | uuid | FK → users |
| expires_at | timestamp | Expiration time |
| revoked | boolean | Whether the token has been revoked |
| created_at | timestamp | Creation time |

### oauth_accounts

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| provider | varchar(32) | Provider name (google, github) |
| provider_account_id | varchar(255) | Third-party account ID |
| provider_email | varchar(255) | Third-party email |
| access_token | text | Provider token (stored encrypted) |
| refresh_token | text | Provider refresh token |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |

### oauth_consents

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| app_id | uuid | FK → oauth_apps |
| scope | varchar(255) | Granted scope |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |
