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
| `inviteCode` | string | No | Optional membership invite. Unlocks Cloud and space creation. |

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

## Password reset by email

```
POST /api/auth/password-reset/start
POST /api/auth/password-reset/complete
```

`start` always returns the same success shape so callers cannot discover whether an email address is registered. The reset email contains a single-use link to `/app/reset-password`; the token expires after 30 minutes and is stored server-side only as a hash. Completing the reset updates the password and revokes existing sessions.

```ts
await client.startPasswordReset({ email: 'alice@example.com' })
await client.completePasswordReset({
  token: 'token-from-email-link',
  newPassword: 'new-secure-password',
  confirmPassword: 'new-secure-password',
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

Authentication failures return `401` with a stable `code` when the space can identify the cause:

| Code | Meaning |
|------|---------|
| `AUTH_TOKEN_MISSING` | The protected request did not include a bearer token. |
| `ACCESS_TOKEN_INVALID` | The access token is invalid or expired; clients may try `/api/auth/refresh`. |
| `SESSION_REVOKED` | The user session was explicitly revoked and local credentials should be cleared. |
| `REFRESH_TOKEN_INVALID` | The refresh token is invalid, revoked, expired, or no longer matches the session. |
| `PAT_TOKEN_INVALID` | A personal access token is invalid or revoked. |
| `PAT_TOKEN_EXPIRED` | A personal access token has expired. |

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

Notifies the space that the client is disconnecting (used for presence tracking).

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
| `oldPassword` | string | Yes | Current password |
| `newPassword` | string | Yes | New password |
| `confirmPassword` | string | No | New password confirmation |

:::code-group

```ts [TypeScript]
await client.changePassword({
  oldPassword: 'old-pass',
  newPassword: 'new-pass',
  confirmPassword: 'new-pass',
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
