# SDK

Shadow 提供官方的 TypeScript/JavaScript 和 Python SDK。

## TypeScript / JavaScript

### 安装

```bash
npm install @shadowob/sdk
# 或者
pnpm add @shadowob/sdk
```

### REST 客户端

```ts
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'your-jwt-token')

// 所有方法返回带类型的 Promise
const me = await client.getMe()
const servers = await client.listServers()
const msg = await client.sendMessage('channel-id', 'Hello!')
```

### 实时 Socket

```ts
import { ShadowSocket } from '@shadowob/sdk'

const socket = new ShadowSocket({
  serverUrl: 'https://shadowob.com',
  token: 'your-jwt-token',
})

socket.connect()
await socket.waitForConnect()

// 加入频道并监听消息
await socket.joinChannel('channel-id')
socket.on('message:new', (msg) => {
  console.log(`${msg.author?.username}: ${msg.content}`)
})

// 通过 WebSocket 发送消息
socket.sendMessage({ channelId: 'channel-id', content: 'Hello!' })

// 输入指示
socket.sendTyping('channel-id')

// 在线状态
socket.updatePresence('online')
```

### 可用事件类型

| 事件 | 负载 | 说明 |
|------|------|------|
| `message:new` | `ShadowMessage` | 已加入频道的新消息 |
| `message:updated` | `ShadowMessage` | 消息被编辑 |
| `message:deleted` | `{ id, channelId }` | 消息被删除 |
| `member:typing` | `{ channelId, userId, username }` | 用户正在输入 |
| `member:join` | `{ channelId, userId }` | 用户加入频道 |
| `member:leave` | `{ channelId, userId }` | 用户离开频道 |
| `presence:change` | `{ userId, status }` | 用户状态变化 |
| `reaction:add` | `{ messageId, userId, emoji }` | 添加反应 |
| `reaction:remove` | `{ messageId, userId, emoji }` | 移除反应 |
| `notification:new` | `ShadowNotification` | 新通知 |
| `channel:created` | `{ id, name, type, serverId }` | 频道已创建 |

---

## Python

### 安装

```bash
pip install shadowob-sdk
```

### REST 客户端

```python
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-jwt-token")

me = client.get_me()
servers = client.list_servers()
msg = client.send_message("channel-id", "Hello from Python!")
```

### 实时 Socket

```python
from shadowob_sdk import ShadowSocket

socket = ShadowSocket("https://shadowob.com", token="your-jwt-token")

def on_message(msg):
    print(f"新消息：{msg['content']}")

socket.on("message:new", on_message)
socket.connect()
socket.join_channel("channel-id")
socket.wait()  # 阻塞直到断开连接
```

### 上下文管理器

Python 客户端支持上下文管理器用法：

```python
with ShadowClient("https://shadowob.com", "token") as client:
    servers = client.list_servers()
    for server in servers:
        print(server["name"])
```
