# Search

## Search messages

```
GET /api/search/messages
```

Search across messages in spaces and channels the user has access to.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search text |
| `serverId` | string | No | Limit to a specific space |
| `channelId` | string | No | Limit to a specific channel |
| `from` | string | No | Filter by author user ID |
| `hasAttachment` | boolean | No | Only messages with attachments |
| `limit` | number | No | Max results |

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
