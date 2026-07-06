# 发现

发现 API 展示热门和趋势内容 —— 空间、频道、店铺、Buddy 和公开空间资源 —— 供用户探索。

## 发现流

```
GET /api/discover/feed
```

返回热门空间、活跃频道和公开空间内容的排名列表。无需认证。

| 参数 | 类型 | 描述 |
|-------|------|-------------|
| `type` | string | 筛选：`all`、`servers`、`channels`、`shops`、`buddies` |
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

搜索公开空间、频道、店铺、Buddy 和公开资源。无需认证。

| 参数 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `q` | string | 是 | 搜索关键词（最少 2 字） |
| `type` | string | 否 | `all`、`servers`、`channels`、`shops`、`buddies` |
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

---

## 购买发现聚合

```
GET /api/discover/business
```

返回面向发现页的购买入口聚合，包含 Buddy、服务与内容、店铺和公开空间。需要登录。

| 参数 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `q` | string | 否 | 搜索关键词（最少 2 字才生效） |
| `limit` | number | 否 | 每类最大结果数（默认: 8，最大: 24） |

```ts
const discovery = await client.discoverCommerce({
  q: '设计',
  limit: 8,
})
// { buddies, products, shops, communities, totals }
```
