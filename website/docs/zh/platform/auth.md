# 认证

## 获取当前用户

```
GET /api/auth/me
```

返回当前已认证的用户信息。

**响应：**

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

## 更新个人资料

```
PATCH /api/auth/me
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `displayName` | string | 显示名称 |
| `avatarUrl` | string \| null | 头像 URL |

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

## 获取用户资料

```
GET /api/auth/users/:id
```

通过 ID 获取公开的用户资料。

:::code-group

```ts [TypeScript]
const profile = await client.getUserProfile('user-id')
```

```python [Python]
profile = client.get_user_profile("user-id")
```

:::

---

## 注册

```
POST /api/auth/register
```

**无需认证。**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 邮箱地址 |
| `password` | string | 是 | 密码 |
| `username` | string | 否 | 唯一用户名，未填写时自动生成 |
| `displayName` | string | 否 | 显示名称 |
| `inviteCode` | string | 否 | 可选会员邀请码，用于解锁 Cloud 和创建空间等能力 |

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

## 邮箱验证码登录

```
POST /api/auth/email/start
POST /api/auth/email/verify
```

邮箱验证码会登录已有用户，或创建一个普通游客账号。

```ts
await client.startEmailLogin({ email: 'alice@example.com' })
const { accessToken, refreshToken, user } = await client.verifyEmailLogin({
  email: 'alice@example.com',
  code: '123456',
})
```

---

## 邮件重设密码

```
POST /api/auth/password-reset/start
POST /api/auth/password-reset/complete
```

`start` 始终返回相同的成功结构，调用方无法判断邮箱是否已注册。重设邮件会包含一个跳转到 `/app/reset-password` 的一次性链接；token 30 分钟后过期，服务端只保存哈希。完成重设后会更新密码并撤销已有会话。

```ts
await client.startPasswordReset({ email: 'alice@example.com' })
await client.completePasswordReset({
  token: 'token-from-email-link',
  newPassword: 'new-secure-password',
  confirmPassword: 'new-secure-password',
})
```

---

## 登录

```
POST /api/auth/login
```

**无需认证。**

| 字段 | 类型 | 必填 |
|------|------|------|
| `email` | string | 是 |
| `password` | string | 是 |

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

## 刷新令牌

```
POST /api/auth/refresh
```

返回新的访问令牌和刷新令牌。

认证失败时，如果服务端能明确原因，会返回带稳定 `code` 的 `401`：

| Code | 含义 |
|------|------|
| `AUTH_TOKEN_MISSING` | 受保护请求没有携带 bearer token。 |
| `ACCESS_TOKEN_INVALID` | 访问令牌无效或已过期；客户端可以尝试 `/api/auth/refresh`。 |
| `SESSION_REVOKED` | 用户会话已被明确撤销，本地凭据应清理。 |
| `REFRESH_TOKEN_INVALID` | 刷新令牌无效、已撤销、已过期，或不再匹配当前会话。 |
| `PAT_TOKEN_INVALID` | 个人访问令牌无效或已撤销。 |
| `PAT_TOKEN_EXPIRED` | 个人访问令牌已过期。 |

:::code-group

```ts [TypeScript]
const tokens = await client.refreshToken(refreshToken)
```

```python [Python]
result = client.refresh_token(refresh_token)
```

:::

---

## 会员能力

注册不再需要邀请码。邀请码通过会员 API 兑换，用于解锁高阶能力：

```
GET /api/membership/me
POST /api/membership/redeem-invite
```

会员响应包含 `status`、`tier`、`level`、`isMember` 和最终生效的 `capabilities`。
高阶操作应以 `capabilities` 为准；后续新增更多等级时无需改变这个响应结构。

常见高阶能力包括 `cloud:deploy`、`server:create`、`invite:create` 和 `oauth_app:create`。
缺少能力时应展示升级或兑换邀请码路径，而不是把它当成登录失败。

快速认证接口有频控保护。`429` 响应会包含 `RATE_LIMITED` 和 `Retry-After`。

---

## 断开连接

```
POST /api/auth/disconnect
```

通知客户端正在断开连接（用于在线状态跟踪）。

:::code-group

```ts [TypeScript]
await client.disconnect()
```

```python [Python]
client.disconnect()
```

:::
