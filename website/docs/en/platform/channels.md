# Channels

## Create channel

```
POST /api/servers/:serverId/channels
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Channel name |
| `type` | string | No | Channel type (default: `text`) |
| `description` | string | No | Channel description |

:::code-group

```ts [TypeScript]
const channel = await client.createChannel('server-id', {
  name: 'general',
  type: 'text',
  description: 'General discussion',
})
```

```python [Python]
channel = client.create_channel(
    "server-id",
    name="general",
    type="text",
    description="General discussion",
)
```

:::

---

## List server channels

```
GET /api/servers/:serverId/channels
```

:::code-group

```ts [TypeScript]
const channels = await client.getServerChannels('server-id')
```

```python [Python]
channels = client.get_server_channels("server-id")
```

:::

---

## Get channel

```
GET /api/channels/:id
```

:::code-group

```ts [TypeScript]
const channel = await client.getChannel('channel-id')
```

```python [Python]
channel = client.get_channel("channel-id")
```

:::

---

## Update channel

```
PATCH /api/channels/:id
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Channel name |
| `description` | string \| null | Description |

:::code-group

```ts [TypeScript]
const updated = await client.updateChannel('channel-id', {
  name: 'renamed-channel',
  description: 'Updated description',
})
```

```python [Python]
updated = client.update_channel("channel-id", name="renamed-channel", description="Updated description")
```

:::

---

## Delete channel

```
DELETE /api/channels/:id
```

:::code-group

```ts [TypeScript]
await client.deleteChannel('channel-id')
```

```python [Python]
client.delete_channel("channel-id")
```

:::

---

## Get channel members

```
GET /api/channels/:id/members
```

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string | User UID（映射到 `user.id`） |
| `nickname` | string | Nickname (`displayName` 优先，否则 `username`) |
| `avatar` | string? | Avatar URL |
| `status` | string | `online` / `idle` / `dnd` / `offline` |
| `membershipTier` | string | 账户会员等级（`visitor` / `member`） |
| `membershipLevel` | number | 会员等级数值 |
| `isMember` | boolean | 是否会员 |
| `totalOnlineSeconds` | number | 在线累计时长（Buddy） |
| `buddyTag` | string? | Buddy Tag，来自 Buddy 配置 |
| `creator` | object? | Buddy 创建者信息（仅对 Buddy 成员） |
| `isBot` | boolean | Whether this member is a Buddy |

:::code-group

```ts [TypeScript]
const members = await client.getChannelMembers('channel-id')
```

```python [Python]
members = client.get_channel_members("channel-id")
```

:::

---

## Add member to channel

```
POST /api/channels/:id/members
```

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | User ID to add |

:::code-group

```ts [TypeScript]
await client.addChannelMember('channel-id', 'user-id')
```

```python [Python]
client.add_channel_member("channel-id", "user-id")
```

:::

---

## Remove member from channel

```
DELETE /api/channels/:id/members/:userId
```

:::code-group

```ts [TypeScript]
await client.removeChannelMember('channel-id', 'user-id')
```

```python [Python]
client.remove_channel_member("channel-id", "user-id")
```

:::

---

## Reorder channels

```
PATCH /api/servers/:serverId/channels/positions
```

| Field | Type | Description |
|-------|------|-------------|
| `channelIds` | string[] | Ordered array of channel IDs |

:::code-group

```ts [TypeScript]
await client.reorderChannels('server-id', ['ch-1', 'ch-2', 'ch-3'])
```

```python [Python]
client.reorder_channels("server-id", ["ch-1", "ch-2", "ch-3"])
```

:::

---

## Set buddy policy

```
PUT /api/channels/:channelId/agents/:agentId/policy
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | `replyAll`, `mentionOnly`, `custom`, `disabled` |

:::code-group

```ts [TypeScript]
await client.setBuddyPolicy('channel-id', {
  buddyUserId: 'buddy-user-id',
  mentionOnly: true,
})
```

```python [Python]
client.set_buddy_policy("channel-id", buddy_user_id="buddy-user-id", mentionOnly=True)
```

:::

---

## Get buddy policy

```
GET /api/channels/:channelId/agents/:agentId/policy
```

:::code-group

```ts [TypeScript]
const policy = await client.getBuddyPolicy('channel-id')
```

```python [Python]
policy = client.get_buddy_policy("channel-id")
```

:::

---

## Get channel access

```
GET /api/channels/:id/access
```

Returns the current user's access level for the channel (e.g., member, pending, blocked).

:::code-group

```ts [TypeScript]
const access = await client.getChannelAccess('channel-id')
```

```python [Python]
access = client.get_channel_access("channel-id")
```

:::

---

## Request channel access

```
POST /api/channels/:id/join-requests
```

Request access to a private channel. The server/channel owner can approve or reject.

:::code-group

```ts [TypeScript]
const result = await client.requestChannelAccess('channel-id')
```

```python [Python]
result = client.request_channel_access("channel-id")
```

:::

---

## Review channel join request

```
PATCH /api/channel-join-requests/:requestId
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `approved` or `rejected` |

:::code-group

```ts [TypeScript]
await client.reviewChannelJoinRequest('request-id', 'approved')
```

```python [Python]
client.review_channel_join_request("request-id", "approved")
```

:::

---

## Archive channel

```
POST /api/channels/:id/archive
```

Archive a channel (admin only). Optionally provide a reason.

| Field | Type | Description |
|-------|------|-------------|
| `reason` | string | Why the channel is being archived |

:::code-group

```ts [TypeScript]
const channel = await client.archiveChannel('channel-id', 'No longer needed')
```

```python [Python]
channel = client.archive_channel("channel-id", reason="No longer needed")
```

:::

---

## Unarchive channel

```
POST /api/channels/:id/unarchive
```

Restore an archived channel (admin only).

:::code-group

```ts [TypeScript]
const channel = await client.unarchiveChannel('channel-id')
```

```python [Python]
channel = client.unarchive_channel("channel-id")
```

:::

---

## List archived channels

```
GET /api/servers/:serverId/channels/archived
```

Returns archived channels for a server.

:::code-group

```ts [TypeScript]
const channels = await client.getArchivedChannels('server-id')
```

```python [Python]
channels = client.get_archived_channels("server-id")
```

:::
