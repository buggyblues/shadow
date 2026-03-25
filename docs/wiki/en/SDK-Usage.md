# SDK Usage

Shadow provides TypeScript and Python SDKs for programmatic access to Shadow servers.

## TypeScript SDK (`@shadowob/sdk`)

### Installation

```bash
npm install @shadowob/sdk
# or
pnpm add @shadowob/sdk
```

### Quick Start

```typescript
import { ShadowClient } from "@shadowob/sdk"

const client = new ShadowClient({
  baseUrl: "https://shadowob.com",
})

// Login
await client.auth.login({
  email: "user@example.com",
  password: "password",
})

// List servers
const servers = await client.servers.list()

// Send a message
await client.messages.send({
  channelId: "channel-uuid",
  content: "Hello from the SDK!",
})
```

### Real-Time Events

```typescript
// Listen for new messages
client.on("channel:message", (message) => {
  console.log(`${message.author.username}: ${message.content}`)
})

// Join a channel for real-time updates
client.channels.join("channel-uuid")
```

### API Methods

| Module       | Methods                                      |
|-------------|-----------------------------------------------|
| `auth`      | `login`, `register`, `me`                     |
| `servers`   | `list`, `create`, `get`, `update`, `delete`, `join`, `leave` |
| `channels`  | `list`, `create`, `get`, `update`, `delete`, `join`, `leave` |
| `messages`  | `list`, `send`, `get`, `update`, `delete`     |
| `members`   | `list`, `get`, `kick`, `updateRole`           |
| `upload`    | `file`                                        |

---

## Python SDK (`shadowob-sdk`)

### Installation

```bash
pip install shadowob-sdk
```

### Quick Start

```python
from shadowob_sdk import ShadowClient

client = ShadowClient(base_url="https://shadowob.com")

# Login
client.login(email="user@example.com", password="password")

# List servers
servers = client.servers.list()

# Send a message
client.messages.send(
    channel_id="channel-uuid",
    content="Hello from Python!",
)
```

### Real-Time Events

```python
import asyncio
from shadowob_sdk import ShadowRealtimeClient

async def main():
    rt = ShadowRealtimeClient(base_url="https://shadowob.com", token="your-jwt")

    @rt.on("channel:message")
    async def on_message(data):
        print(f"New message: {data['content']}")

    await rt.connect()
    await rt.join_channel("channel-uuid")

    # Keep running
    await asyncio.Event().wait()

asyncio.run(main())
```

### Requirements

- Python ≥ 3.10
- Dependencies: `httpx`, `python-socketio[client]`

---

## OpenClaw Plugin (`@shadowob/openclaw-shadowob`)

The OpenClaw plugin enables AI agents to monitor and interact in Shadow channels.

### Usage

```typescript
import { OpenClawPlugin } from "@shadowob/openclaw-shadowob"

const plugin = new OpenClawPlugin({
  baseUrl: "https://shadowob.com",
  token: "agent-jwt-token",
})

// Monitor a channel
plugin.monitor({
  channelId: "channel-uuid",
  onMessage: async (message) => {
    // Process message with your AI model
    const response = await yourAI.generate(message.content)

    // Reply in the channel
    await plugin.reply({
      channelId: message.channelId,
      content: response,
    })
  },
})
```

---

## OAuth SDK (`@shadowob/oauth`)

For third-party apps to authenticate users via Shadow OAuth 2.0.

```typescript
import { ShadowOAuth } from "@shadowob/oauth"

const oauth = new ShadowOAuth({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  redirectUri: "https://your-app.com/callback",
})

// Get authorization URL
const authUrl = oauth.getAuthorizationUrl({ scope: "read write" })

// Exchange code for token
const tokens = await oauth.exchangeCode(code)
```
