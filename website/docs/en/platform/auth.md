# Authentication

## Get current user

```
GET /api/auth/me
```

Returns the currently authenticated user.

**Response:**

```json
{
  "id": "uuid",
  "username": "alice",
  "displayName": "Alice",
  "avatarUrl": "https://...",
  "isBot": false
}
```

:::code-group

```ts [TypeScript]
const me = await client.getMe()
```

```python [Python]
me = client.get_me()
```

:::

---

## Update profile

```
PATCH /api/auth/me
```

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | Display name |
| `avatarUrl` | string \| null | Avatar URL |

:::code-group

```ts [TypeScript]
const updated = await client.updateProfile({
  displayName: 'New Name',
  avatarUrl: 'https://example.com/avatar.png',
})
```

```python [Python]
updated = client.update_profile(
    display_name="New Name",
    avatar_url="https://example.com/avatar.png",
)
```

:::

---

## Get user profile

```
GET /api/auth/users/:id
```

Returns a public user profile by ID.

:::code-group

```ts [TypeScript]
const profile = await client.getUserProfile('user-id')
```

```python [Python]
profile = client.get_user_profile("user-id")
```

:::

---

## Register

```
POST /api/auth/register
```

**No authentication required.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password |
| `username` | string | No | Unique username. Generated when omitted. |
| `displayName` | string | No | Display name |
| `inviteCode` | string | No | Optional membership invite. Unlocks Cloud and server creation. |

:::code-group

```ts [TypeScript]
const { accessToken, refreshToken, user } = await client.register({
  email: 'alice@example.com',
  password: 'secure-password',
  displayName: 'Alice',
})
```

```python [Python]
result = client.register(
    email="alice@example.com",
    password="secure-password",
    display_name="Alice",
)
access_token = result["accessToken"]
```

:::

---

## Email code login

```
POST /api/auth/email/start
POST /api/auth/email/verify
```

Email code verification signs in an existing user or creates a visitor account.

```ts
await client.startEmailLogin({ email: 'alice@example.com' })
const { accessToken, refreshToken, user } = await client.verifyEmailLogin({
  email: 'alice@example.com',
  code: '123456',
})
```

---

## Login

```
POST /api/auth/login
```

**No authentication required.**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `password` | string | Yes |

:::code-group

```ts [TypeScript]
const { accessToken, refreshToken, user } = await client.login({
  email: 'alice@example.com',
  password: 'secret',
})
```

```python [Python]
result = client.login(email="alice@example.com", password="secret")
```

:::

---

## Refresh token

```
POST /api/auth/refresh
```

Returns a new JWT token.

:::code-group

```ts [TypeScript]
const tokens = await client.refreshToken(refreshToken)
```

```python [Python]
result = client.refresh_token(refresh_token)
```

:::

---

## Membership

Invite codes are not required to register. Use membership APIs to unlock advanced capabilities:

```
GET /api/membership/me
POST /api/membership/redeem-invite
```

Membership responses include `status`, `tier`, `level`, `isMember`, and effective
`capabilities`. Treat `capabilities` as the source of truth for advanced actions; new tiers can be
added later without changing this response shape.

Common advanced capabilities include `cloud:deploy`, `server:create`, `invite:create`, and
`oauth_app:create`. A missing capability should be rendered as an upgrade or invite redemption path,
not as a failed login.

Fast auth endpoints are rate limited. A `429` response includes `RATE_LIMITED` and `Retry-After`.

---

## Disconnect

```
POST /api/auth/disconnect
```

Notifies the server that the client is disconnecting (used for presence tracking).

:::code-group

```ts [TypeScript]
await client.disconnect()
```

```python [Python]
client.disconnect()
```

:::

---

## List linked OAuth accounts

```
GET /api/auth/oauth/accounts
```

:::code-group

```ts [TypeScript]
const accounts = await client.listOAuthAccounts()
```

```python [Python]
accounts = client.list_oauth_accounts()
```

:::

---

## Unlink OAuth account

```
DELETE /api/auth/oauth/accounts/:accountId
```

:::code-group

```ts [TypeScript]
await client.unlinkOAuthAccount('account-id')
```

```python [Python]
client.unlink_oauth_account("account-id")
```

:::

---

## Change password

```
PUT /api/auth/password
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currentPassword` | string | Yes | Current password |
| `newPassword` | string | Yes | New password |

:::code-group

```ts [TypeScript]
await client.changePassword({
  currentPassword: 'old-pass',
  newPassword: 'new-pass',
})
```

```python [Python]
client.change_password(
    current_password="old-pass",
    new_password="new-pass",
)
```

:::

---

## Google ID token login

```
POST /api/auth/google/id-token
```

Sign in or register using a Google ID token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idToken` | string | Yes | Google ID token |

:::code-group

```ts [TypeScript]
const { accessToken, refreshToken, user } = await client.loginWithGoogleIdToken('google-id-token')
```

```python [Python]
result = client.login_with_google_id_token("google-id-token")
```

:::

---

## Dashboard

```
GET /api/auth/dashboard
```

Returns the current user's dashboard summary.

:::code-group

```ts [TypeScript]
const dashboard = await client.getDashboard()
```

```python [Python]
dashboard = client.get_dashboard()
```

:::
