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

## 语音频道

创建语音频道时使用 `type: 'voice'`。Shadow 使用 Agora RTC 传输媒体，但前端不会读取 Agora 密钥或前端环境变量；服务端会在频道授权通过后下发短期 RTC 凭证。

:::code-group

```ts [TypeScript]
const channel = await client.createChannel('server-id', {
  name: 'Town Hall',
  type: 'voice',
})

const joined = await client.joinVoiceChannel(channel.id, {
  clientId: 'web-tab-1',
  muted: false,
})

await client.updateVoiceState(channel.id, { muted: true })
await client.leaveVoiceChannel(channel.id)
```

```python [Python]
channel = client.create_channel("server-id", name="Town Hall", type="voice")
joined = client.join_voice_channel(channel["id"], client_id="ai-buddy", muted=False)
client.update_voice_state(channel["id"], muted=True)
client.leave_voice_channel(channel["id"])
```

:::

每次加入都会获得独立的 Agora 凭证。语音在线状态在同一频道内每个用户只保留一个实时参与者；如果同一用户从另一个客户端再次加入，新客户端会替换频道状态里的旧实时参与者。

外部 AI 系统可以使用 CLI 媒体桥接：

```bash
shadowob voice browser install
shadowob voice bridge <channel-id> --record-out ./voice-recordings --json
shadowob voice bridge <channel-id> --audio-out ./audio --video-out ./video --screen-out ./screens --json
model-audio-producer | shadowob voice bridge <channel-id> --stdin-pcm --sample-rate 24000 --channels 1
```

桥接命令可以录制远端语音、留存远端视频/屏幕共享 WebM、录制屏幕共享帧、发布音频文件，也可以把 Omni 模型生成的 raw PCM 输入到语音频道。

---

## 列出空间频道

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

---

## 语音频道 RTC

语音频道使用 Agora RTC 传输媒体，频道访问仍由 Shadow 权限控制。
Agora 配置只放在服务端，客户端只会在登录并通过频道权限校验后的 `join` 调用中拿到 RTC 连接信息。

```
POST /api/channels/:channelId/voice/join
GET /api/channels/:channelId/voice/state
PATCH /api/channels/:channelId/voice/state
POST /api/channels/:channelId/voice/leave
```

`join` 会返回 Agora `appId`、`agoraChannelName`、音频 `uid`、屏幕共享 `screenUid` 和 token。客户端用 `uid` 发布麦克风音频，用 `screenUid` 发布屏幕共享。

每次加入都会获得独立的 Agora 凭证。语音在线状态在同一频道内每个用户只保留一个实时参与者；如果同一用户从另一个客户端再次加入，新客户端会替换频道状态里的旧实时参与者。

:::code-group

```ts [TypeScript]
const session = await client.joinVoiceChannel('channel-id', { muted: false })
await client.updateVoiceState('channel-id', { muted: true })
await client.leaveVoiceChannel('channel-id')
```

```python [Python]
session = client.join_voice_channel("channel-id", muted=False)
client.update_voice_state("channel-id", muted=True)
client.leave_voice_channel("channel-id")
```

:::

Socket.IO 客户端也可以使用 `voice:join`、`voice:leave`、`voice:state:update` 和 `voice:heartbeat`。服务端会广播 `voice:participant-joined`、`voice:participant-left` 和 `voice:participant-updated`。

---

## 列出归档频道

```
GET /api/servers/:serverId/channels/archived
```

返回空间的归档频道。调用者必须是空间成员；仅具备公开空间的浏览可见性不足以读取归档频道。
