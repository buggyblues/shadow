# 搜索

## 搜索消息

```
GET /api/search/messages
```

在用户有权限访问的空间和频道中搜索消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索文本 |
| `serverId` | string | 否 | 限定到特定空间 |
| `channelId` | string | 否 | 限定到特定频道 |
| `from` | string | 否 | 按作者用户 ID 筛选 |
| `hasAttachment` | boolean | 否 | 仅包含附件的消息 |
| `limit` | number | 否 | 最大结果数 |

:::code-group

```ts [TypeScript]
const results = await client.searchMessages({
  query: 'deployment',
  serverId: 'server-id',
  limit: 20,
})
```

```python [Python]
results = client.search_messages(
    query="deployment",
    server_id="server-id",
    limit=20,
)
```

:::
