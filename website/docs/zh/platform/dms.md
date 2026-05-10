# 私信

私信会话是 `kind: "dm"` 的私有频道。消息、附件、反应和 WebSocket 都复用普通频道 API。

## 创建私信频道

```
POST /api/channels/dm
```

创建或获取与另一个用户的私信频道。

| 字段 | 类型 | 说明 |
|------|------|------|
| `userId` | string | 对方用户 ID |

:::code-group

```ts [TypeScript]
const channel = await client.createDirectChannel('other-user-id')
```

```python [Python]
channel = client.create_direct_channel("other-user-id")
```

:::

## 列出私信频道

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

## 获取消息

```
GET /api/channels/:id/messages
```

## 发送消息

```
POST /api/channels/:id/messages
```

私信频道 id 可以用于任何普通 Shadow channel id 参数，包括 OpenClaw 目标
`shadowob:channel:<channel-id>`。
