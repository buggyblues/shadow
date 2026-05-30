# Commerce Marketplace Products

`GET /api/discover/marketplace/products`

Returns globally public virtual products for the unified network marketplace. The list only includes active public offers from active shops where:

- server shops belong to public servers; or
- personal shops have `visibility = "public"`.

Query parameters:

| Name | Description |
| --- | --- |
| `q` | Optional search term, minimum 2 characters. Searches product, shop, server, owner, and tag text. |
| `tag` | Optional exact product tag. Tags are creator-defined and are also used for category pages. |
| `category` | Optional legacy category alias. New clients should prefer recommended tags from `/api/discover/marketplace/categories`. |
| `scope` | Optional shop scope filter: `server` or `user`. |
| `limit` | Page size, 1-72. Defaults to 24. |
| `offset` | Result offset. Defaults to 0. |

Response:

```json
{
  "products": [
    {
      "id": "product-id",
      "name": "Desktop pet pack",
      "type": "entitlement",
      "billingMode": "one_time",
      "price": 100,
      "currency": "shrimp_coin",
      "tags": ["虾豆桌面宠物"],
      "globalPublic": true,
      "shop": {
        "id": "shop-id",
        "name": "Creator shop",
        "scopeKind": "user",
        "owner": { "id": "user-id", "username": "creator" },
        "server": null
      },
      "links": {
        "product": "/app/shop/products/product-id",
        "shop": "/app/shop/users/user-id?view=buyer"
      }
    }
  ],
  "total": 1,
  "hasMore": false,
  "filters": { "q": null, "tags": ["虾豆桌面宠物"], "scope": null }
}
```

Product creation and update payloads now accept `globalPublic?: boolean`. Setting it to `true` marks the product's default commerce offer as `visibility = "public"`; discovery still requires the surrounding shop/server visibility rule above.

## Smart Categories

`GET /api/discover/marketplace/categories`

Returns recommended marketplace categories derived from public product tags. The server ranks tags by public product count, sales, rating activity, and freshness, so clients do not need to hardcode category shelves.

Query parameters:

| Name | Description |
| --- | --- |
| `q` | Optional search term, minimum 2 characters. Narrows the product set before aggregating tags. |
| `limit` | Number of recommended categories, 1-24. Defaults to 12. |

Response:

```json
{
  "categories": [
    {
      "tag": "虾豆桌面宠物",
      "title": "虾豆桌面宠物",
      "productCount": 12,
      "salesCount": 48,
      "ratingCount": 9,
      "avgRating": 5,
      "score": 1621,
      "href": "/app/shop/tags/%E8%99%BE%E8%B1%86%E6%A1%8C%E9%9D%A2%E5%AE%A0%E7%89%A9"
    }
  ],
  "total": 8,
  "filters": { "q": null }
}
```

SDK helpers:

- TypeScript: `client.discoverMarketplaceProducts({ tag, q, category, scope, limit, offset })`
- TypeScript: `client.discoverMarketplaceCategories({ q, limit })`
- Python: `client.discover_marketplace_products(tag=..., q=..., category=...)`
- Python: `client.discover_marketplace_categories(q=..., limit=...)`
