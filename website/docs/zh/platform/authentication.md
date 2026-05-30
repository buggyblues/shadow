# 认证

Shadow API 使用 **JWT Bearer 令牌** 进行认证。在每个请求的 `Authorization` 头中包含令牌。

## 获取令牌

### 注册新账户

```
POST /api/auth/register
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 邮箱地址 |
| `password` | string | 是 | 密码 |
| `username` | string | 否 | 唯一用户名，未填写时自动生成 |
| `displayName` | string | 否 | 显示名称 |
| `inviteCode` | string | 否 | 可选会员邀请码，用于解锁高阶能力 |

**响应：**

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

注册不再需要邀请码。之后可通过 `POST /api/membership/redeem-invite` 兑换邀请码，解锁 Cloud 部署和创建服务器等能力。
会员状态采用等级模型，后续可新增更多 tier 和能力，不需要改变认证响应结构。

普通游客仍然可以加入公开社区并启动基础首页玩法。只有需要长期 Cloud 资源、创建新服务器、创建邀请码或创建 OAuth 应用时，才会检查会员能力。

### 邮箱验证码登录

```
POST /api/auth/email/start
POST /api/auth/email/verify
```

邮箱验证码会登录已有用户，或创建一个普通游客账号。

### 邮件重设密码

```
POST /api/auth/password-reset/start
POST /api/auth/password-reset/complete
```

重设密码请求不会暴露邮箱是否存在。重设链接只能使用一次，30 分钟后过期；密码更新后会撤销已有会话。

### 登录

```
POST /api/auth/login
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | 是 | 邮箱地址 |
| `password` | string | 是 | 密码 |

**响应：** 与注册相同。

### 刷新令牌

```
POST /api/auth/refresh
```

返回新的访问令牌和刷新令牌。请求体需要传入现有刷新令牌。

## 使用令牌

在 `Authorization` 头中包含令牌：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiI...
```

## SDK 使用

:::code-group

```ts [TypeScript]
import { ShadowClient } from '@shadowob/sdk'

// 登录并获取令牌
const client = new ShadowClient('https://shadowob.com', '')
const { accessToken, user } = await client.login({
  email: 'alice@example.com',
  password: 'secret',
})

// 使用令牌发起后续请求
const authedClient = new ShadowClient('https://shadowob.com', accessToken)
const me = await authedClient.getMe()
```

```python [Python]
from shadowob_sdk import ShadowClient

# 登录并获取令牌
client = ShadowClient("https://shadowob.com", "")
result = client.login(email="alice@example.com", password="secret")
token = result["accessToken"]

# 使用令牌发起后续请求
client = ShadowClient("https://shadowob.com", token)
me = client.get_me()
```

:::

## OAuth 第三方登录

Shadow 支持通过第三方 OAuth 提供商登录。将用户重定向到：

```
GET /api/auth/oauth/:provider
```

传入 `redirect=/app/...` 可在认证后继续原始 App 动作。需要 Cloud 邀请码的网站动作也可以传入 `inviteCode=...`；OAuth 回调会带回该邀请码，App 会先尝试兑换再继续跳转。

认证成功后，回调 URL 将返回 JWT 令牌。

## 官方模型代理令牌

Cloud 玩法可以获得受限的 `smp_...` 官方模型代理令牌。这类令牌不是通用用户会话，只能代表目标用户和玩法/模板上下文调用 `/api/ai/v1` 模型代理。计费和安全边界见 [官方模型代理](/zh/platform/model-proxy)。
