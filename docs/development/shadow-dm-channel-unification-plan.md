# Shadow Direct Channel Unification

## Decision

Direct conversations are represented as private channels:

- `channels.kind = 'dm'`
- `channels.server_id = null`
- participants are stored in `channel_members`
- messages, attachments, reactions, notifications, media auth, commerce cards, and WebSocket events all use the normal channel/message paths

No compatibility layer is kept. The old standalone DM runtime surface is removed:

- no `/api/dm/*`
- no `dm:*` socket events
- no `ShadowClient.createDmChannel/listDmChannels/getDmMessages/sendDmMessage`
- no `ShadowSocket.joinDmChannel/sendDmMessage/sendDmTyping`
- no `dmMessageId` media upload target
- no `scopeDmChannelId` notification scope
- no OpenClaw `shadowob:dm:<id>` target

## Current API

Direct channel creation/listing:

```http
POST /api/channels/dm
GET  /api/channels/dm
```

`GET /api/channels/dm` includes `lastMessagePreview` on each direct channel so conversation
lists can render the latest message summary without issuing one message request per channel.

Messages, reactions, attachments, commerce cards, and socket rooms use the existing channel APIs:

```http
GET  /api/channels/:channelId/messages
POST /api/channels/:channelId/messages
POST /api/messages/:messageId/reactions
GET  /api/attachments/:attachmentId/media-url
POST /api/messages/:messageId/commerce-cards/:cardId/purchase
```

```text
channel:join
channel:leave
message:send
message:typing
message:new
message:updated
message:deleted
reaction:updated
```

## Migration

Migration `0060_unify_dm_channels.sql` moves legacy direct conversation data into unified tables:

- old direct conversations become rows in `channels` with `kind = 'dm'`
- old direct participants become `channel_members`
- old direct messages become `messages`
- old direct attachments become `attachments`
- old direct reactions become `reactions`
- notification direct scopes move into `scope_channel_id`
- standalone legacy direct-message tables are dropped

The migration preserves legacy direct channel ids as new channel ids so existing URLs and references can continue to point at the same conversation id while using the unified channel APIs.

## Implementation Notes

Backend authorization now goes through `ChannelAccessService` and `PolicyService`:

- server channels still combine server membership, channel membership, and policy checks
- direct channels require `channel_members` participation
- channel management remains server-channel only

OpenClaw joins direct conversations with `channel:join` and receives `message:new`. Outbound direct replies use `shadowob:channel:<channel-id>` and normal `sendMessage`.

SDKs expose direct channels through:

- TypeScript: `createDirectChannel`, `listDirectChannels`, `getMessages`, `sendMessage`
- Python: `create_direct_channel`, `list_direct_channels`, `get_messages`, `send_message`

## Verification Targets

Required checks for this refactor:

- server, web, mobile, desktop, SDK, shared, CLI, and OpenClaw typechecks
- SDK, shared, OpenClaw, Python SDK, and focused server/web unit tests
- docker-compose integration/E2E pass before merging a release branch
