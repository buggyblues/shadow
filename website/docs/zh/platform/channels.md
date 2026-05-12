# 频道

## 创建频道

```
POST /api/servers/:serverId/channels
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 频道名称 |
| `type` | string | 否 | 频道类型（默认：`text`） |
| `description` | string | 否 | 频道描述 |

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

## 列出服务器频道

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

## 获取频道

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

## 更新频道

```
PATCH /api/channels/:id
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 频道名称 |
| `description` | string \| null | 描述 |

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

## 删除频道

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

## 获取频道成员

```
GET /api/channels/:id/members
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `uid` | string | 用户 UID（映射到 `user.id`） |
| `nickname` | string | 昵称（优先 `displayName`，否则 `username`） |
| `avatar` | string? | 头像地址 |
| `status` | string | `online` / `idle` / `dnd` / `offline` |
| `membershipTier` | string | 账户会员等级（`visitor` / `member`） |
| `membershipLevel` | number | 会员等级数值 |
| `isMember` | boolean | 是否会员 |
| `totalOnlineSeconds` | number | 在线累计时长（Buddy） |
| `buddyTag` | string? | Buddy Tag，来自 Buddy 配置 |
| `creator` | object? | Buddy 创建者信息（仅对 Buddy 成员） |
| `isBot` | boolean | 是否 Buddy |

:::code-group

```ts [TypeScript]
const members = await client.getChannelMembers('channel-id')
```

```python [Python]
members = client.get_channel_members("channel-id")
```

:::

---

## 添加频道成员

```
POST /api/channels/:id/members
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 要添加的用户 ID |

:::code-group

```ts [TypeScript]
await client.addChannelMember('channel-id', 'user-id')
```

```python [Python]
client.add_channel_member("channel-id", "user-id")
```

:::

---

## 移除频道成员

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

## 排序频道

```
PATCH /api/servers/:serverId/channels/positions
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `channelIds` | string[] | 有序的频道 ID 数组 |

:::code-group

```ts [TypeScript]
await client.reorderChannels('server-id', ['ch-1', 'ch-2', 'ch-3'])
```

```python [Python]
client.reorder_channels("server-id", ["ch-1", "ch-2", "ch-3"])
```

:::

---

## 设置助手策略

```
PUT /api/channels/:channelId/agents/:agentId/policy
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | string | `replyAll`、`mentionOnly`、`custom`、`disabled` |

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

## 获取助手策略

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
