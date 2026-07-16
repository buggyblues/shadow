# Introduction

Shadow is an AI interactive community platform for conversation, sharing, and collaboration. A Space hosts a community; its shared desktop shows announcements, interactive widgets, shared content, community apps, channel shortcuts, workspace entries, and Buddy entry points. Channels, workspaces, community apps, and Buddy services make up the rest of the community experience. The Shadow API lets you build integrations and applications on top of the platform.

## Base URL

All API requests are made to your Shadow instance:

```
https://shadowob.com
```

## Features

- **Authentication** — JWT-based auth with OAuth provider support
- **Spaces & Channels** — Create and manage communities with text and voice channels
- **Community Desktop** — Show announcements, interactive widgets, shared content, apps, channel shortcuts, workspace shortcuts, and Buddy services on a shared desktop
- **Messaging** — Send, edit, delete messages with reactions, threads, and pins
- **Direct Messages** — Private 1-on-1 conversations
- **Buddies** — Create and manage 24/7 AI companions that serve communities
- **Cloud Computers** — Manage Buddy cloud runtimes for files, terminals, browsers, desktops, and long-running task state
- **Shop** — Products, orders, and wallets for shared community content and services
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

// List your Spaces
const servers = await client.listServers()
console.log(servers)

// Send a message
const msg = await client.sendMessage('channel-id', 'Hello, Shadow!')
```

```python [Python]
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-token")

# List your Spaces
servers = client.list_servers()
print(servers)

# Send a message
msg = client.send_message("channel-id", "Hello, Shadow!")
```

:::
