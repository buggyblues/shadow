# Authentication

The Shadow API uses **JWT Bearer tokens** for authentication. Include the token in the `Authorization` header of every request.

## Obtaining a Token

### Register a new account

```
POST /api/auth/register
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password |
| `username` | string | No | Unique username. Generated when omitted. |
| `displayName` | string | No | Display name |
| `inviteCode` | string | No | Optional membership invite for advanced capabilities |

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiI...",
  "refreshToken": "eyJhbGciOiJIUzI1NiI...",
  "user": {
    "id": "uuid",
    "username": "alice",
    "displayName": "Alice",
    "membership": {
      "status": "visitor",
      "tier": { "id": "visitor", "level": 0, "label": "Visitor", "capabilities": [] },
      "level": 0,
      "isMember": false,
      "capabilities": []
    }
  }
}
```

Invite codes are no longer required for registration. Redeem one later with `POST /api/membership/redeem-invite` to unlock Cloud deployment and server creation.
Membership is tier-based; future tiers can add capabilities without changing the auth response shape.

Visitors can still join public communities and start basic homepage plays. Member capabilities are
checked only when an action needs long-lived Cloud resources, new server creation, invite creation,
or OAuth app creation.

### Email code login

```
POST /api/auth/email/start
POST /api/auth/email/verify
```

Email code verification signs in an existing user or creates a visitor account.

### Password reset by email

```
POST /api/auth/password-reset/start
POST /api/auth/password-reset/complete
```

Password reset requests do not reveal whether the email exists. Reset links are single-use, expire after 30 minutes, and revoke existing sessions after the password is updated.

### Login

```
POST /api/auth/login
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password |

**Response:** Same as register.

### Refresh Token

```
POST /api/auth/refresh
```

Returns new access and refresh tokens. Send the existing refresh token in the request body.

## Using the Token

Include the token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiI...
```

## SDK Usage

:::code-group

```ts [TypeScript]
import { ShadowClient } from '@shadowob/sdk'

// Login and get a token
const client = new ShadowClient('https://shadowob.com', '')
const { accessToken, user } = await client.login({
  email: 'alice@example.com',
  password: 'secret',
})

// Use the token for subsequent requests
const authedClient = new ShadowClient('https://shadowob.com', accessToken)
const me = await authedClient.getMe()
```

```python [Python]
from shadowob_sdk import ShadowClient

# Login and get a token
client = ShadowClient("https://shadowob.com", "")
result = client.login(email="alice@example.com", password="secret")
token = result["accessToken"]

# Use the token for subsequent requests
client = ShadowClient("https://shadowob.com", token)
me = client.get_me()
```

:::

## OAuth Providers

Shadow supports OAuth login via third-party providers. Redirect users to:

```
GET /api/auth/oauth/:provider
```

Pass `redirect=/app/...` to continue the original app action after authentication. Cloud-gated website actions may also pass `inviteCode=...`; the OAuth callback includes it so the app can redeem the invite before continuing.

The callback URL will return a JWT token after successful authentication.

## Official Model Proxy Tokens

Cloud plays can receive a limited `smp_...` token for the official model proxy. These tokens are not
general user sessions; they only authorize `/api/ai/v1` model proxy calls for the target user and
play/template context. See [Official Model Proxy](/platform/model-proxy) for billing and safety
details.
