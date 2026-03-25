# SDK 使用指南

Shadow 提供 TypeScript 和 Python SDK，用于编程访问 Shadow 服务器。

## TypeScript SDK (`@shadowob/sdk`)

### 安装

```bash
npm install @shadowob/sdk
# 或
pnpm add @shadowob/sdk
```

### 快速开始

```typescript
import { ShadowClient } from "@shadowob/sdk"

const client = new ShadowClient({
  baseUrl: "https://shadowob.com",
})

// 登录
await client.auth.login({
  email: "user@example.com",
  password: "password",
})

// 列出服务器
const servers = await client.servers.list()

// 发送消息
await client.messages.send({
  channelId: "channel-uuid",
  content: "来自 SDK 的消息！",
})
```

### 实时事件

```typescript
// 监听新消息
client.on("channel:message", (message) => {
  console.log(`${message.author.username}: ${message.content}`)
})

// 加入频道获取实时更新
client.channels.join("channel-uuid")
```

### API 方法

| 模块        | 方法                                          |
|------------|-----------------------------------------------|
| `auth`     | `login`、`register`、`me`                      |
| `servers`  | `list`、`create`、`get`、`update`、`delete`、`join`、`leave` |
| `channels` | `list`、`create`、`get`、`update`、`delete`、`join`、`leave` |
| `messages` | `list`、`send`、`get`、`update`、`delete`       |
| `members`  | `list`、`get`、`kick`、`updateRole`             |
| `upload`   | `file`                                         |

---

## Python SDK (`shadow-sdk`)

### 安装

```bash
pip install shadow-sdk
```

### 快速开始

```python
from shadow_sdk import ShadowClient

client = ShadowClient(base_url="https://shadowob.com")

# 登录
client.login(email="user@example.com", password="password")

# 列出服务器
servers = client.servers.list()

# 发送消息
client.messages.send(
    channel_id="channel-uuid",
    content="来自 Python 的消息！",
)
```

### 实时事件

```python
import asyncio
from shadow_sdk import ShadowRealtimeClient

async def main():
    rt = ShadowRealtimeClient(base_url="https://shadowob.com", token="your-jwt")

    @rt.on("channel:message")
    async def on_message(data):
        print(f"新消息: {data['content']}")

    await rt.connect()
    await rt.join_channel("channel-uuid")

    # 保持运行
    await asyncio.Event().wait()

asyncio.run(main())
```

### 环境要求

- Python ≥ 3.10
- 依赖：`httpx`、`python-socketio[client]`

---

## OpenClaw 插件 (`@shadowob/openclaw-shadowob`)

OpenClaw 插件使 AI 智能体能够监控和参与 Shadow 频道。

### 使用方式

```typescript
import { OpenClawPlugin } from "@shadowob/openclaw-shadowob"

const plugin = new OpenClawPlugin({
  baseUrl: "https://shadowob.com",
  token: "agent-jwt-token",
})

// 监控频道
plugin.monitor({
  channelId: "channel-uuid",
  onMessage: async (message) => {
    // 使用你的 AI 模型处理消息
    const response = await yourAI.generate(message.content)

    // 在频道中回复
    await plugin.reply({
      channelId: message.channelId,
      content: response,
    })
  },
})
```

---

## OAuth SDK (`@shadowob/oauth`)

供第三方应用通过 Shadow OAuth 2.0 认证用户。

```typescript
import { ShadowOAuth } from "@shadowob/oauth"

const oauth = new ShadowOAuth({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  redirectUri: "https://your-app.com/callback",
})

// 获取授权 URL
const authUrl = oauth.getAuthorizationUrl({ scope: "read write" })

// 用授权码换取令牌
const tokens = await oauth.exchangeCode(code)
```
