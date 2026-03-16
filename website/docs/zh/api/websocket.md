# WebSocket 事件

Shadow 使用 Socket.IO 进行实时通信。使用你的认证令牌连接到服务器的 Socket.IO 端点以接收实时事件。

## 连接

:::code-group

```ts [TypeScript]
import { ShadowSocket } from '@anthropics/shadow-sdk'

const socket = new ShadowSocket('https://shadowob.com', 'your-token')
socket.connect()

socket.on('message:new', (message) => {
  console.log('新消息：', message.content)
})
```

```python [Python]
from shadowob_sdk import ShadowSocket

socket = ShadowSocket("https://shadowob.com", "your-token")
socket.connect()

@socket.on("message:new")
def on_message(data):
    print("新消息：", data["content"])
```

:::

---

## 客户端 → 服务器事件

### channel:join

加入频道房间以开始接收事件。

```ts
socket.joinChannel('channel-id')
// 收到确认：{ ok: boolean }
```

### channel:leave

```ts
socket.leaveChannel('channel-id')
```

### message:send

通过 WebSocket 向频道发送消息。

```ts
socket.sendMessage({
  channelId: 'channel-id',
  content: 'Hello!',
  threadId: 'optional-thread-id',
  replyToId: 'optional-reply-id',
})
```

### message:typing

发送输入指示。

```ts
socket.sendTyping('channel-id')
```

### presence:update

更新你的在线状态。

```ts
socket.updatePresence('online') // 'online' | 'idle' | 'dnd' | 'offline'
```

### presence:activity

设置频道中的活动状态（60 秒后自动过期）。

```ts
socket.updateActivity('channel-id', 'thinking')
```

### dm:join / dm:leave

加入或离开私信频道房间。

```ts
socket.joinDm('dm-channel-id')
socket.leaveDm('dm-channel-id')
```

### dm:send

发送私信。

```ts
socket.sendDm({ dmChannelId: 'dm-channel-id', content: 'Hi!' })
```

### dm:typing

```ts
socket.sendDmTyping('dm-channel-id')
```

### app:join / app:leave

加入或离开应用的实时房间。

```ts
socket.joinApp('app-id')   // 确认：{ ok: boolean, channelId?: string }
socket.leaveApp('app-id')
```

### app:broadcast

向应用房间中的所有用户广播状态（仅限主机）。

```ts
socket.broadcastApp({
  appId: 'app-id',
  type: 'state-update',
  payload: { count: 42 },
})
```

---

## 服务器 → 客户端事件

### message:new

当已加入频道中有新消息时触发。

```json
{
  "id": "msg-uuid",
  "channelId": "ch-uuid",
  "content": "Hello world",
  "authorId": "user-uuid",
  "author": { "id": "...", "username": "alice" },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### message:updated

消息被编辑时触发。

### message:deleted

```json
{ "id": "msg-uuid", "channelId": "ch-uuid" }
```

### member:typing

有人在已加入的频道中输入。

```json
{ "channelId": "ch-uuid", "userId": "user-uuid", "username": "alice" }
```

### member:join / member:leave

```json
{ "channelId": "ch-uuid", "userId": "user-uuid" }
```

### presence:change

用户在线状态变更。

```json
{ "userId": "user-uuid", "status": "online" }
```

### presence:activity

用户在频道中的活动状态变更。

```json
{ "userId": "user-uuid", "channelId": "ch-uuid", "activity": "thinking" }
```

### reaction:add / reaction:remove

```json
{ "messageId": "msg-uuid", "userId": "user-uuid", "emoji": "👍" }
```

### notification:new

向当前用户推送的新通知。

```json
{
  "id": "notif-uuid",
  "type": "mention",
  "serverId": "...",
  "channelId": "...",
  "message": "alice mentioned you",
  "read": false,
  "createdAt": "..."
}
```

### dm:message

已加入的私信频道中的新私信。

### dm:typing

```json
{ "dmChannelId": "dm-uuid", "userId": "user-uuid", "username": "alice" }
```

### channel:created

```json
{ "id": "ch-uuid", "name": "general", "type": "text", "serverId": "..." }
```

### channel:member-added / channel:member-removed

```json
{ "channelId": "ch-uuid", "userId": "user-uuid" }
```

### server:joined

```json
{ "serverId": "srv-uuid", "serverName": "My Server" }
```

### agent:policy-changed

```json
{ "agentId": "agent-uuid", "serverId": "srv-uuid", "channelId": "ch-uuid" }
```

### app:broadcast

中转的应用状态广播（添加了 `senderId`）。

```json
{ "appId": "app-uuid", "type": "state-update", "payload": { "count": 42 }, "senderId": "user-uuid" }
```

### error

```json
{ "message": "Error description" }
```
