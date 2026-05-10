# SDKs

Shadow provides official SDKs for TypeScript/JavaScript and Python.

## TypeScript / JavaScript

### Installation

```bash
npm install @shadowob/sdk
# or
pnpm add @shadowob/sdk
```

### REST Client

```ts
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'your-jwt-token')

// All methods return typed promises
const me = await client.getMe()
const servers = await client.listServers()
const msg = await client.sendMessage('channel-id', 'Hello!')
```

### Real-time Socket

```ts
import { ShadowSocket } from '@shadowob/sdk'

const socket = new ShadowSocket({
  serverUrl: 'https://shadowob.com',
  token: 'your-jwt-token',
})

socket.connect()
await socket.waitForConnect()

// Join a channel and listen for messages
await socket.joinChannel('channel-id')
socket.on('message:new', (msg) => {
  console.log(`${msg.author?.username}: ${msg.content}`)
})

// Send messages via WebSocket
socket.sendMessage({ channelId: 'channel-id', content: 'Hello!' })

// Typing indicators
socket.sendTyping('channel-id')

// Presence
socket.updatePresence('online')
```

### Available Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `ShadowMessage` | New message in joined channel |
| `message:updated` | `ShadowMessage` | Message was edited |
| `message:deleted` | `{ id, channelId }` | Message was deleted |
| `member:typing` | `{ channelId, userId, username }` | User is typing |
| `member:join` | `{ channelId, userId }` | User joined channel |
| `member:leave` | `{ channelId, userId }` | User left channel |
| `presence:change` | `{ userId, status }` | User status change |
| `reaction:add` | `{ messageId, userId, emoji }` | Reaction added |
| `reaction:remove` | `{ messageId, userId, emoji }` | Reaction removed |
| `notification:new` | `ShadowNotification` | New notification |
| `channel:created` | `{ id, name, type, serverId }` | Channel created |

---

## Python

### Installation

```bash
pip install shadowob-sdk
```

### REST Client

```python
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-jwt-token")

me = client.get_me()
servers = client.list_servers()
msg = client.send_message("channel-id", "Hello from Python!")
```

### Real-time Socket

```python
from shadowob_sdk import ShadowSocket

socket = ShadowSocket("https://shadowob.com", token="your-jwt-token")

def on_message(msg):
    print(f"New message: {msg['content']}")

socket.on("message:new", on_message)
socket.connect()
socket.join_channel("channel-id")
socket.wait()  # Block until disconnected
```

### Context Manager

The Python client supports context manager usage:

```python
with ShadowClient("https://shadowob.com", "token") as client:
    servers = client.list_servers()
    for server in servers:
        print(server["name"])
```

## Method Name Mapping

The Python SDK uses `snake_case` method names that map 1-to-1 to the TypeScript `camelCase` methods:

| TypeScript | Python |
|------------|--------|
| `getMe()` | `get_me()` |
| `listServers()` | `list_servers()` |
| `sendMessage()` | `send_message()` |
| `getServerChannels()` | `get_server_channels()` |
| `createChannel()` | `create_channel()` |
| `sendFriendRequest()` | `send_friend_request()` |
| `browseListings()` | `browse_listings()` |
| `createProduct()` | `create_product()` |
