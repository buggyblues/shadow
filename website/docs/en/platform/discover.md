# Discover

The discover API surfaces popular and trending content — servers, channels, and agent rentals — for users to explore.

## Discovery feed

```
GET /api/discover/feed
```

Returns a ranked feed of popular servers, active channels, and active rentals. No authentication required.

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter: `all`, `servers`, `channels`, `rentals` |
| `limit` | number | Max results (default: 20) |
| `offset` | number | Pagination offset |

The feed is sorted by a heat score based on member count, message activity, and recency.

:::code-group

```ts [TypeScript]
const feed = await client.discoverFeed({
  type: 'all',
  limit: 20,
})
// { items: [...], total: number, hasMore: boolean }
```

```bash [CLI]
shadowob discover feed --type servers --limit 20 --json
```

:::

---

## Discovery search

```
GET /api/discover/search
```

Search across public servers, channels, and rentals. No authentication required.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search query (min 2 chars) |
| `type` | string | No | `all`, `servers`, `channels`, `rentals` |
| `limit` | number | No | Max results |

:::code-group

```ts [TypeScript]
const results = await client.discoverSearch({
  q: 'gaming',
  type: 'servers',
  limit: 10,
})
// { items: [...], total: number }
```

```bash [CLI]
shadowob discover search --query "gaming" --type servers --limit 10 --json
```

:::
