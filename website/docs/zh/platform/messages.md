# 消息

## 发送消息

```
POST /api/channels/:channelId/messages
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | 消息内容 |
| `threadId` | string | 否 | 线程回复的线程 ID |
| `replyToId` | string | 否 | 被回复的消息 ID |
| `metadata.interactive` | object | 否 | 客户端渲染的交互块（`form`、`buttons`、`select` 或 `approval`） |

:::code-group

```ts [TypeScript]
const msg = await client.sendMessage('channel-id', 'Hello, world!')

// 回复消息
const reply = await client.sendMessage('channel-id', 'Great point!', {
  replyToId: 'original-msg-id',
})
```

```python [Python]
msg = client.send_message("channel-id", "Hello, world!")

# 回复消息
reply = client.send_message("channel-id", "Great point!", reply_to_id="original-msg-id")
```

:::

**响应：**

```json
{
  "id": "uuid",
  "content": "Hello, world!",
  "channelId": "channel-id",
  "authorId": "user-id",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "author": {
    "id": "user-id",
    "username": "alice",
    "displayName": "Alice"
  }
}
```

---

## 获取消息列表

```
GET /api/channels/:channelId/messages
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | number | 50 | 最大返回消息数 |
| `cursor` | string | — | 分页游标 |

:::code-group

```ts [TypeScript]
const { messages, hasMore } = await client.getMessages('channel-id', 50)

// 分页
if (hasMore) {
  const lastId = messages[messages.length - 1].id
  const page2 = await client.getMessages('channel-id', 50, lastId)
}
```

```python [Python]
result = client.get_messages("channel-id", limit=50)
messages = result["messages"]
has_more = result["hasMore"]

# 分页
if has_more:
    last_id = messages[-1]["id"]
    page2 = client.get_messages("channel-id", limit=50, cursor=last_id)
```

:::

---

## 获取单条消息

```
GET /api/messages/:id
```

:::code-group

```ts [TypeScript]
const msg = await client.getMessage('message-id')
```

```python [Python]
msg = client.get_message("message-id")
```

:::

---

## 提交交互动作

```
POST /api/messages/:id/interactive
```

记录用户对源消息交互块的操作。对于 one-shot 交互块，服务端会持久化提交结果；之后重新拉取源消息时，会在 `metadata.interactiveState.response` 返回已提交状态，让客户端刷新后仍然锁定控件。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `blockId` | string | 是 | 来自 `metadata.interactive.id` 的交互块 ID |
| `actionId` | string | 是 | 按钮、选项或表单提交动作 |
| `value` | string | 否 | 动作值；服务端默认使用 `actionId` |
| `label` | string | 否 | 用于回显消息的人类可读标签 |
| `values` | object | 否 | 表单或审批字段值，按字段 ID 组织 |

:::code-group

```ts [TypeScript]
await client.submitInteractiveAction('source-message-id', {
  blockId: 'office-hour',
  actionId: 'submit',
  values: { pain: 'Manual reporting' },
})
```

```python [Python]
client.submit_interactive_action(
    "source-message-id",
    block_id="office-hour",
    action_id="submit",
    values={"pain": "Manual reporting"},
)
```

:::

---

## 编辑消息

```
PATCH /api/messages/:id
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | 新消息内容 |

:::code-group

```ts [TypeScript]
const updated = await client.editMessage('message-id', 'Updated content')
```

```python [Python]
updated = client.edit_message("message-id", "Updated content")
```

:::

---

## 删除消息

```
DELETE /api/messages/:id
```

:::code-group

```ts [TypeScript]
await client.deleteMessage('message-id')
```

```python [Python]
client.delete_message("message-id")
```

:::

---

## 置顶消息

```
PUT /api/channels/:channelId/pins/:messageId
```

:::code-group

```ts [TypeScript]
await client.pinMessage('message-id')
```

```python [Python]
client.pin_message("message-id")
```

:::

---

## 取消置顶

```
DELETE /api/channels/:channelId/pins/:messageId
```

:::code-group

```ts [TypeScript]
await client.unpinMessage('message-id')
```

```python [Python]
client.unpin_message("message-id")
```

:::

---

## 获取置顶消息

```
GET /api/channels/:channelId/pins
```

:::code-group

```ts [TypeScript]
const pinned = await client.getPinnedMessages('channel-id')
```

```python [Python]
pinned = client.get_pinned_messages("channel-id")
```

:::

---

## 添加表情反应

```
POST /api/messages/:id/reactions
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `emoji` | string | 表情字符（如 `👍`） |

:::code-group

```ts [TypeScript]
await client.addReaction('message-id', '👍')
```

```python [Python]
client.add_reaction("message-id", "👍")
```

:::

---

## 移除表情反应

```
DELETE /api/messages/:id/reactions/:emoji
```

:::code-group

```ts [TypeScript]
await client.removeReaction('message-id', '👍')
```

```python [Python]
client.remove_reaction("message-id", "👍")
```

:::

---

## 获取表情反应

```
GET /api/messages/:id/reactions
```

**响应：**

```json
[
  { "emoji": "👍", "count": 3, "users": ["user-1", "user-2", "user-3"] },
  { "emoji": "🎉", "count": 1, "users": ["user-1"] }
]
```

:::code-group

```ts [TypeScript]
const reactions = await client.getReactions('message-id')
```

```python [Python]
reactions = client.get_reactions("message-id")
```

:::
