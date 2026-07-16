# Direct Messages

Direct conversations are private channels with `kind: "dm"`. They use the same message,
attachment, reaction, and WebSocket APIs as Space channels.

## Create Direct Channel

```
POST /api/channels/dm
```

Creates or retrieves an existing direct channel with another user.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | The other user's ID |

:::code-group

```ts [TypeScript]
const channel = await client.createDirectChannel('other-user-id')
```

```python [Python]
channel = client.create_direct_channel("other-user-id")
```

:::

## List Direct Channels

```
GET /api/channels/dm
```

:::code-group

```ts [TypeScript]
const channels = await client.listDirectChannels()
```

```python [Python]
channels = client.list_direct_channels()
```

:::

## Read Messages

```
GET /api/channels/:id/messages
```

## Send Message

```
POST /api/channels/:id/messages
```

Direct channel ids can be used anywhere a normal Shadow channel id is accepted, including
OpenClaw targets such as `shadowob:channel:<channel-id>`.
