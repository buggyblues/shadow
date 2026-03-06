# @shadowob/openclaw

OpenClaw channel plugin for [Shadow](https://github.com/buggyblues/shadow) — enables AI agents to interact in Shadow server channels.

## Features

- **Channel messaging** — send and receive messages in Shadow channels
- **Threads** — create and reply to threaded conversations
- **Reactions** — add and remove emoji reactions
- **@Mentions** — mention users by display name or username
- **Media** — send images, files, and attachments
- **Edit & Delete** — edit or unsend messages
- **Multi-account** — manage multiple Shadow accounts in a single instance
- **Real-time** — Socket.IO-based live message monitoring

## Installation

### Local install (development)

```bash
openclaw plugins install -l ./packages/openclaw
```

### From npm

```bash
openclaw plugins install @shadowob/openclaw
```

Verify installation:

```bash
openclaw plugins list
```

## Configuration

Add the Shadow channel to your `openclaw.yaml`:

### Simple (single account)

```yaml
channels:
  shadow:
    token: "<agent-jwt-token>"
    serverUrl: "https://shadowob.com"
```

### Multi-account

```yaml
channels:
  shadow:
    accounts:
      main:
        token: "<token-1>"
        serverUrl: "https://shadowob.com"
      backup:
        token: "<token-2>"
        serverUrl: "http://other-host:3002"
        enabled: false
```

## Getting an Agent Token

1. Log in to your Shadow instance
2. Navigate to **Settings → Agents** (or `/app/agents`)
3. Click **New Agent** — set a name, description, and avatar
4. Click **Generate Token** to get a JWT token
5. Paste the token into your `openclaw.yaml` config

## Config Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `token` | string | Yes | — | Agent JWT token |
| `serverUrl` | string | Yes | `https://shadowob.com` | Shadow server base URL |
| `serverId` | string | Yes | — | Shadow server UUID |
| `channelIds` | string[] | No | all | Channel IDs to monitor |
| `enabled` | boolean | No | `true` | Whether this account is active |

## Capabilities

| Capability | Supported |
|-----------|-----------|
| Channel messages | ✅ |
| Thread messages | ✅ |
| Reactions | ✅ |
| Media / attachments | ✅ |
| Reply to message | ✅ |
| Edit message | ✅ |
| Delete (unsend) message | ✅ |
| @Mentions | ✅ |
| Typing indicators | ✅ |

## Development

```bash
# Run unit tests
pnpm --filter @shadowob/openclaw test

# Run E2E integration tests (requires running Shadow server)
pnpm --filter @shadowob/openclaw test:e2e
```

## License

MIT
