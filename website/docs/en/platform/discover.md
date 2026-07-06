# Discover

The discover API surfaces popular and trending content — spaces, channels, shops, Buddies, and public community resources — for users to explore.

## Discovery feed

```
GET /api/discover/feed
```

Returns a ranked feed of popular spaces, active channels, and public community content. No authentication required.

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter: `all`, `servers`, `channels`, `shops`, `buddies` |
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

Search across public spaces, channels, shops, Buddies, and public resources. No authentication required.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | Yes | Search query (min 2 chars) |
| `type` | string | No | `all`, `servers`, `channels`, `shops`, `buddies` |
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

---

## Discover Commerce Aggregate

```
GET /api/discover/business
```

Returns the consumer-facing discovery aggregate for Buddies, services and content, shops, and public spaces. Authentication is required.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | No | Search query; applied when it has at least 2 chars |
| `limit` | number | No | Max results per section (default: 8, max: 24) |

```ts
const discovery = await client.discoverCommerce({
  q: 'design',
  limit: 8,
})
// { buddies, products, shops, communities, totals }
```
