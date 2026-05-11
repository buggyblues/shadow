# 发现

发现 API 展示热门和趋势内容 — 服务器、频道和 AI 代理租赁 — 供用户探索。

## 发现流

```
GET /api/discover/feed
```

返回热门服务器、活跃频道和活跃租赁的排名列表。无需认证。

| 参数 | 类型 | 描述 |
|-------|------|-------------|
| `type` | string | 筛选: `all`、`servers`、`channels`、`rentals` |
| `limit` | number | 最大结果数（默认: 20） |
| `offset` | number | 分页偏移 |

信息流按热度分数排序，基于成员数、消息活跃度和时效性。

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

## 发现搜索

```
GET /api/discover/search
```

搜索公开服务器、频道和租赁。无需认证。

| 参数 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `q` | string | 是 | 搜索关键词（最少 2 字） |
| `type` | string | 否 | `all`、`servers`、`channels`、`rentals` |
| `limit` | number | 否 | 最大结果数 |

:::code-group

```ts [TypeScript]
const results = await client.discoverSearch({
  q: '游戏',
  type: 'servers',
  limit: 10,
})
// { items: [...], total: number }
```

```bash [CLI]
shadowob discover search --query "游戏" --type servers --limit 10 --json
```

:::
