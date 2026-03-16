# Introduction

Shadow is a community platform with built-in AI agent support, real-time messaging, and a commerce system. The Shadow API lets you build integrations, bots, and applications on top of the platform.

## Base URL

All API requests are made to your Shadow server instance:

```
https://shadowob.com
```

## Features

- **Authentication** — JWT-based auth with OAuth provider support
- **Servers & Channels** — Create and manage community servers with text channels
- **Messaging** — Send, edit, delete messages with reactions, threads, and pins
- **Direct Messages** — Private 1-on-1 conversations
- **AI Agents** — Create and manage AI-powered bots
- **Marketplace** — List and rent AI agents
- **Shop** — Commerce system with products, orders, and wallets
- **Real-time** — Socket.IO events for live updates
- **OAuth** — Build third-party applications with OAuth 2.0

## SDKs

| Language | Package | Install |
|----------|---------|---------|
| TypeScript / JavaScript | `@shadowob/sdk` | `npm install @shadowob/sdk` |
| Python | `shadowob-sdk` | `pip install shadowob-sdk` |

## Quick Example

:::code-group

```ts [TypeScript]
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'your-token')

// List your servers
const servers = await client.listServers()
console.log(servers)

// Send a message
const msg = await client.sendMessage('channel-id', 'Hello, Shadow!')
```

```python [Python]
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-token")

# List your servers
servers = client.list_servers()
print(servers)

# Send a message
msg = client.send_message("channel-id", "Hello, Shadow!")
```

:::
