# OAuth

Shadow 实现了标准的 OAuth 2.0 授权码流程。第三方应用可以通过范围化权限请求访问用户数据。

## 应用管理

### 创建 OAuth 应用

```
POST /api/oauth/apps
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 应用名称 |
| `description` | string | 否 | 描述 |
| `redirectUris` | string[] | 是 | 允许的重定向 URI |
| `scopes` | string[] | 否 | 请求的权限范围 |
| `iconUrl` | string | 否 | 应用图标 URL |

**响应：**

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

### 列出 OAuth 应用

```
GET /api/oauth/apps
```

列出当前用户拥有的所有 OAuth 应用。

:::code-group

```ts [TypeScript]
const apps = await client.listOAuthApps()
```

```python [Python]
apps = client.list_oauth_apps()
```

:::

---

### 更新 OAuth 应用

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

### 删除 OAuth 应用

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

### 重置客户端密钥

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

## 授权流程

### 第一步：重定向到授权页面

将用户浏览器重定向到授权页面：

```
GET /api/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&scope=SCOPE&state=STATE
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `response_type` | string | 是 | 必须为 `code` |
| `client_id` | string | 是 | 你的应用客户端 ID |
| `redirect_uri` | string | 是 | 必须匹配已注册的 URI |
| `scope` | string | 否 | 空格分隔的权限范围 |
| `state` | string | 是 | 随机状态用于 CSRF 保护 |

:::code-group

```ts [TypeScript]
const authInfo = await client.getOAuthAuthorization({
  responseType: 'code',
  clientId: 'your-client-id',
  redirectUri: 'https://example.com/callback',
  scope: 'read:user read:servers',
  state: 'random-state',
})
```

```python [Python]
auth_info = client.get_oauth_authorization(
    response_type="code",
    client_id="your-client-id",
    redirect_uri="https://example.com/callback",
    scope="read:user read:servers",
    state="random-state",
)
```

:::

---

### 第二步：用户批准

```
POST /api/oauth/authorize
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `clientId` | string | 是 | 客户端 ID |
| `redirectUri` | string | 是 | 重定向 URI |
| `scope` | string | 否 | 批准的权限范围 |
| `state` | string | 是 | 必须匹配请求中的 state |

**响应：** 返回包含授权码的 `redirectTo` URL。

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

### 第三步：用授权码交换令牌

```
POST /api/oauth/token
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `grant_type` | string | 是 | `authorization_code` 或 `refresh_token` |
| `code` | string | 条件 | 授权码（用于 `authorization_code`） |
| `client_id` | string | 是 | 客户端 ID |
| `client_secret` | string | 是 | 客户端密钥 |
| `redirect_uri` | string | 条件 | 必须匹配授权请求 |
| `refresh_token` | string | 条件 | 用于 `refresh_token` 授权 |

**响应：**

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

### 获取用户信息

```
GET /api/oauth/userinfo
```

使用 OAuth 访问令牌返回已认证用户的资料。

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" https://shadowob.com/api/oauth/userinfo
```

---

## 授权管理

### 列出授权

```
GET /api/oauth/consents
```

列出用户已授权的所有应用。

:::code-group

```ts [TypeScript]
const consents = await client.listOAuthConsents()
```

```python [Python]
consents = client.list_oauth_consents()
```

:::

### 撤销授权

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
