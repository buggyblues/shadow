# 商店

商店 API 允许空间所有者设置商店，包括分类、商品、购物车、订单、评价和钱包系统。

商店是面向消费者的货架，不是孤立的后台目录。个人店铺、空间店铺、Buddy 卡片和应用服务商品都应该复用同一套商品、销售 Offer、订单、权益、履约、结算和评价模型。买家侧页面在结账前需要清楚展示提供者、店铺、空间上下文、交付结果、有效期、退款/支持规则和资产主页入口。

## 获取 / 创建商店

```
GET /api/servers/:serverId/shop
```

返回空间的商店，如果不存在则创建一个。

:::code-group

```ts [TypeScript]
const shop = await client.getShop('server-id')
```

```python [Python]
shop = client.get_shop("server-id")
```

:::

---

## 更新商店

```
PUT /api/servers/:serverId/shop
```

:::code-group

```ts [TypeScript]
await client.updateShop('server-id', { name: 'My Store' })
```

```python [Python]
client.update_shop("server-id", name="My Store")
```

:::

---

## 分类

### 列出分类

```
GET /api/servers/:serverId/shop/categories
```

:::code-group

```ts [TypeScript]
const categories = await client.listCategories('server-id')
```

```python [Python]
categories = client.list_categories("server-id")
```

:::

### 创建分类

```
POST /api/servers/:serverId/shop/categories
```

:::code-group

```ts [TypeScript]
const category = await client.createCategory('server-id', {
  name: 'Merch',
  description: 'Official merchandise',
})
```

```python [Python]
category = client.create_category("server-id", name="Merch", description="Official merchandise")
```

:::

### 更新分类

```
PUT /api/servers/:serverId/shop/categories/:categoryId
```

:::code-group

```ts [TypeScript]
await client.updateCategory('server-id', 'category-id', { name: 'Accessories' })
```

```python [Python]
client.update_category("server-id", "category-id", name="Accessories")
```

:::

### 删除分类

```
DELETE /api/servers/:serverId/shop/categories/:categoryId
```

:::code-group

```ts [TypeScript]
await client.deleteCategory('server-id', 'category-id')
```

```python [Python]
client.delete_category("server-id", "category-id")
```

:::

---

## 商品

### 列出商品

```
GET /api/servers/:serverId/shop/products
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | 按状态筛选 |
| `categoryId` | string | 按分类筛选 |
| `keyword` | string | 搜索关键词 |
| `limit` | number | 最大结果数 |
| `offset` | number | 偏移量 |

:::code-group

```ts [TypeScript]
const products = await client.listProducts('server-id', { keyword: 'shirt' })
```

```python [Python]
products = client.list_products("server-id", keyword="shirt")
```

:::

### 获取商品

```
GET /api/servers/:serverId/shop/products/:productId
```

商品响应在配置封面或画廊资源后会包含 `media?: Array<{ type: 'image' | 'video'; url: string; thumbnailUrl?: string; position?: number }>`。`POST /api/media/upload` 返回的私有上传引用可以直接作为商品媒体 `url` 使用；Shop API 响应会把这些引用解析成可渲染的授权地址。

:::code-group

```ts [TypeScript]
const product = await client.getProduct('server-id', 'product-id')
```

```python [Python]
product = client.get_product("server-id", "product-id")
```

:::

### 创建商品

```
POST /api/servers/:serverId/shop/products
```

:::code-group

```ts [TypeScript]
const product = await client.createProduct('server-id', {
  name: 'Creator badge',
  slug: 'creator-badge',
  type: 'entitlement',
  categoryId: 'category-id',
  basePrice: 100,
  media: [{ type: 'image', url: '/shadow/uploads/cover.png', position: 0 }],
})
```

```python [Python]
product = client.create_product(
    "server-id",
    name="Creator badge",
    slug="creator-badge",
    type="entitlement",
    categoryId="category-id",
    basePrice=100,
    media=[{"type": "image", "url": "/shadow/uploads/cover.png", "position": 0}],
)
```

:::

### 更新商品

```
PUT /api/servers/:serverId/shop/products/:productId
```

:::code-group

```ts [TypeScript]
await client.updateProduct('server-id', 'product-id', { price: 19.99 })
```

```python [Python]
client.update_product("server-id", "product-id", price=19.99)
```

:::

### 删除商品

```
DELETE /api/servers/:serverId/shop/products/:productId
```

:::code-group

```ts [TypeScript]
await client.deleteProduct('server-id', 'product-id')
```

```python [Python]
client.delete_product("server-id", "product-id")
```

:::

---

## 购物车

### 获取购物车

```
GET /api/servers/:serverId/shop/cart
```

:::code-group

```ts [TypeScript]
const cart = await client.getCart('server-id')
```

```python [Python]
cart = client.get_cart("server-id")
```

:::

### 加入购物车

```
POST /api/servers/:serverId/shop/cart
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `productId` | string | 是 | 商品 ID |
| `skuId` | string | 否 | SKU 变体 |
| `quantity` | number | 是 | 数量 |

:::code-group

```ts [TypeScript]
await client.addToCart('server-id', {
  productId: 'product-id',
  quantity: 2,
})
```

```python [Python]
client.add_to_cart("server-id", productId="product-id", quantity=2)
```

:::

### 更新购物车商品

```
PUT /api/servers/:serverId/shop/cart/:itemId
```

:::code-group

```ts [TypeScript]
await client.updateCartItem('server-id', 'item-id', 3)
```

```python [Python]
client.update_cart_item("server-id", "item-id", quantity=3)
```

:::

### 从购物车移除

```
DELETE /api/servers/:serverId/shop/cart/:itemId
```

:::code-group

```ts [TypeScript]
await client.removeFromCart('server-id', 'item-id')
```

```python [Python]
client.remove_from_cart("server-id", "item-id")
```

:::

---

## 订单

### 下单

```
POST /api/servers/:serverId/shop/orders
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `idempotencyKey` | string | 是 | 客户端生成的幂等键，用于安全重试 |
| `items` | array | 是 | 购物车商品 ID 或商品规格 |
| `buyerNote` | string | 否 | 买家备注 |

纯权益订单在支付后会立即发放，授予配置的访问权限或空间资产，并直接进入 `completed` 状态，同时出现在钱包权益/资产记录中。实物商品和需要人工履约的服务仍走 `paid -> processing -> shipped -> delivered -> completed` 流程。

:::code-group

```ts [TypeScript]
const order = await client.createOrder('server-id', {
  idempotencyKey: crypto.randomUUID(),
  items: [{ productId: 'pid', quantity: 1 }],
  buyerNote: 'Please gift-wrap',
})
```

```python [Python]
order = client.create_order(
    "server-id",
    idempotency_key="order-123",
    items=[{"productId": "pid", "quantity": 1}],
    buyerNote="Please gift-wrap",
)
```

:::

### 列出我的订单

```
GET /api/servers/:serverId/shop/orders
```

:::code-group

```ts [TypeScript]
const orders = await client.listOrders('server-id', { status: 'paid' })
```

```python [Python]
orders = client.list_orders("server-id", status="paid")
```

:::

### 管理员：管理订单

```
GET /api/servers/:serverId/shop/orders/manage
```

:::code-group

```ts [TypeScript]
const orders = await client.listShopOrders('server-id', { status: 'pending' })
```

```python [Python]
orders = client.list_shop_orders("server-id", status="pending")
```

:::

### 获取订单

```
GET /api/servers/:serverId/shop/orders/:orderId
```

:::code-group

```ts [TypeScript]
const order = await client.getOrder('server-id', 'order-id')
```

```python [Python]
order = client.get_order("server-id", "order-id")
```

:::

### 更新订单状态

```
PUT /api/servers/:serverId/shop/orders/:orderId/status
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | 是 | 新状态 |
| `trackingNo` | string | 否 | 物流单号 |
| `sellerNote` | string | 否 | 卖家备注 |

:::code-group

```ts [TypeScript]
await client.updateOrderStatus('server-id', 'order-id', {
  status: 'shipped',
  trackingNo: 'TRACK123',
})
```

```python [Python]
client.update_order_status("server-id", "order-id", status="shipped", trackingNo="TRACK123")
```

:::

### 取消订单

```
POST /api/servers/:serverId/shop/orders/:orderId/cancel
```

:::code-group

```ts [TypeScript]
await client.cancelOrder('server-id', 'order-id')
```

```python [Python]
client.cancel_order("server-id", "order-id")
```

:::

### 买家确认完成

卖家把订单标记为 `delivered` 后，买家调用该接口确认履约完成。成功后订单进入 `completed`，并触发后续结算流程。

```
POST /api/servers/:serverId/shop/orders/:orderId/complete
```

:::code-group

```ts [TypeScript]
await client.completeOrder('server-id', 'order-id')
```

```python [Python]
client.complete_order("server-id", "order-id")
```

:::

---

## 评价

### 列出商品评价

```
GET /api/servers/:serverId/shop/products/:productId/reviews
```

:::code-group

```ts [TypeScript]
const reviews = await client.getProductReviews('server-id', 'product-id')
```

```python [Python]
reviews = client.get_product_reviews("server-id", "product-id")
```

:::

### 提交评价

```
POST /api/servers/:serverId/shop/orders/:orderId/review
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `productId` | string | 是 | 评价的商品 |
| `rating` | number | 是 | 1 – 5 |
| `content` | string | 否 | 评价内容 |
| `images` | string[] | 否 | 图片 URL |
| `isAnonymous` | boolean | 否 | 匿名发布 |

:::code-group

```ts [TypeScript]
await client.createReview('server-id', 'order-id', {
  productId: 'product-id',
  rating: 5,
  content: 'Excellent quality!',
})
```

```python [Python]
client.create_review("server-id", "order-id", productId="product-id", rating=5, content="Excellent quality!")
```

:::

### 回复评价（卖家）

```
PUT /api/servers/:serverId/shop/reviews/:reviewId/reply
```

:::code-group

```ts [TypeScript]
await client.replyToReview('server-id', 'review-id', 'Thank you!')
```

```python [Python]
client.reply_to_review("server-id", "review-id", reply="Thank you!")
```

:::

---

## 钱包

### 获取钱包

```
GET /api/wallet
```

:::code-group

```ts [TypeScript]
const wallet = await client.getWallet()
```

```python [Python]
wallet = client.get_wallet()
```

:::

### 充值

普通钱包充值接口已禁用。余额增加必须来自已验证的支付流程、退款、结算、任务奖励或管理员发放。

旧的 `POST /api/wallet/topup` 路由现在返回 `403`。

:::code-group

```ts [TypeScript]
await client.topUpWallet(100) // 会抛错；请使用支付流程
```

```python [Python]
client.top_up_wallet(100)  # 会抛错；请使用支付流程
```

:::

### 列出交易记录

```
GET /api/wallet/transactions
```

:::code-group

```ts [TypeScript]
const txns = await client.getWalletTransactions({ limit: 50 })
```

```python [Python]
txns = client.get_wallet_transactions(limit=50)
```

:::

---

## 权益

```
GET /api/servers/:serverId/shop/entitlements
```

:::code-group

```ts [TypeScript]
const entitlements = await client.getEntitlements('server-id')
```

```python [Python]
entitlements = client.get_entitlements("server-id")
```

:::
