# WebSocket Events

Shadow uses Socket.IO for real-time communication. Connect to the server's Socket.IO endpoint with your auth token to receive live events.

## Connecting

:::code-group

```ts [TypeScript]
import { ShadowSocket } from '@anthropics/shadow-sdk'

const socket = new ShadowSocket('https://shadowob.com', 'your-token')
socket.connect()

socket.on('message:new', (message) => {
  console.log('New message:', message.content)
})
```

```python [Python]
from shadowob_sdk import ShadowSocket

socket = ShadowSocket("https://shadowob.com", "your-token")
socket.connect()

@socket.on("message:new")
def on_message(data):
    print("New message:", data["content"])
```

:::

---

## Client → Server Events

### channel:join

Join a channel room to start receiving events.

```ts
socket.joinChannel('channel-id')
// Receives ack: { ok: boolean }
```

### channel:leave

```ts
socket.leaveChannel('channel-id')
```

### message:send

Send a message to a channel via WebSocket.

```ts
socket.sendMessage({
  channelId: 'channel-id',
  content: 'Hello!',
  threadId: 'optional-thread-id',
  replyToId: 'optional-reply-id',
})
```

### message:typing

Send a typing indicator.

```ts
socket.sendTyping('channel-id')
```

### presence:update

Update your presence status.

```ts
socket.updatePresence('online') // 'online' | 'idle' | 'dnd' | 'offline'
```

### presence:activity

Set activity status in a channel (auto-expires after 60s).

```ts
socket.updateActivity('channel-id', 'thinking')
```

### dm:join / dm:leave

Join or leave a DM channel room.

```ts
socket.joinDm('dm-channel-id')
socket.leaveDm('dm-channel-id')
```

### dm:send

Send a DM message.

```ts
socket.sendDm({ dmChannelId: 'dm-channel-id', content: 'Hi!' })
```

### dm:typing

```ts
socket.sendDmTyping('dm-channel-id')
```

### app:join / app:leave

Join or leave an app's real-time room.

```ts
socket.joinApp('app-id')   // ack: { ok: boolean, channelId?: string }
socket.leaveApp('app-id')
```

### app:broadcast

Broadcast state to all users in an app room (host only).

```ts
socket.broadcastApp({
  appId: 'app-id',
  type: 'state-update',
  payload: { count: 42 },
})
```

---

## Server → Client Events

### message:new

Fired when a new message is posted in a joined channel.

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

Fired when a message is edited.

### message:deleted

```json
{ "id": "msg-uuid", "channelId": "ch-uuid" }
```

### member:typing

Someone is typing in a joined channel.

```json
{ "channelId": "ch-uuid", "userId": "user-uuid", "username": "alice" }
```

### member:join / member:leave

```json
{ "channelId": "ch-uuid", "userId": "user-uuid" }
```

### presence:change

User presence status changed.

```json
{ "userId": "user-uuid", "status": "online" }
```

### presence:activity

User activity changed in a channel.

```json
{ "userId": "user-uuid", "channelId": "ch-uuid", "activity": "thinking" }
```

### reaction:add / reaction:remove

```json
{ "messageId": "msg-uuid", "userId": "user-uuid", "emoji": "👍" }
```

### notification:new

New notification pushed to the current user.

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

New DM message in a joined DM channel.

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

Relayed app state broadcast (adds `senderId`).

```json
{ "appId": "app-uuid", "type": "state-update", "payload": { "count": 42 }, "senderId": "user-uuid" }
```

### error

```json
{ "message": "Error description" }
```
