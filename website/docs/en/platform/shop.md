# Shop

The Shop API lets server owners set up stores with categories, products, cart, orders, reviews, and a wallet system.

Shops are consumer storefronts, not isolated admin catalogs. Personal shops, server shops, Buddy
cards, and app-backed products should share the same product, offer, order, entitlement,
fulfillment, settlement, and review model. Buyer-facing pages should make the provider, shop,
server context, delivery result, validity, refund/support rule, and asset-home link visible before
checkout.

## Get / Create shop

```
GET /api/servers/:serverId/shop
```

Returns the shop for the server, creating one if it doesn't exist.

:::code-group

```ts [TypeScript]
const shop = await client.getShop('server-id')
```

```python [Python]
shop = client.get_shop("server-id")
```

:::

---

## Update shop

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

## Categories

### List categories

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

### Create category

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

### Update category

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

### Delete category

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

## Products

### List products

```
GET /api/servers/:serverId/shop/products
```

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status |
| `categoryId` | string | Filter by category |
| `keyword` | string | Search keyword |
| `limit` | number | Max results |
| `offset` | number | Offset |

:::code-group

```ts [TypeScript]
const products = await client.listProducts('server-id', { keyword: 'shirt' })
```

```python [Python]
products = client.list_products("server-id", keyword="shirt")
```

:::

### Get product

```
GET /api/servers/:serverId/shop/products/:productId
```

Product responses include `media?: Array<{ type: 'image' | 'video'; url: string; thumbnailUrl?: string; position?: number }>` when covers or gallery assets are attached. Private upload references returned from `POST /api/media/upload` can be used as product media `url`; Shop API responses resolve those references into authorized render URLs.

:::code-group

```ts [TypeScript]
const product = await client.getProduct('server-id', 'product-id')
```

```python [Python]
product = client.get_product("server-id", "product-id")
```

:::

### Create product

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

### Update product

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

### Delete product

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

## Cart

### Get cart

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

---

## Remove from cart

```
DELETE /api/servers/:serverId/shop/cart/:itemId
```

:::code-group

```ts [TypeScript]
await client.removeCartItem('server-id', 'item-id')
```

```python [Python]
client.remove_cart_item("server-id", "item-id")
```

:::

### Add to cart

```
POST /api/servers/:serverId/shop/cart
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | string | Yes | Product ID |
| `skuId` | string | No | SKU variant |
| `quantity` | number | Yes | Quantity |

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

### Update cart item

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

### Remove from cart

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

## Orders

### Place order

```
POST /api/servers/:serverId/shop/orders
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idempotencyKey` | string | Yes | Client-generated key for safe retries |
| `items` | array | Yes | Cart item IDs or product specs |
| `buyerNote` | string | No | Note to seller |

Entitlement-only orders are delivered immediately after payment. They grant the configured access or community asset, move to `completed`, and become visible in Wallet access/asset records. Physical and manually fulfilled services remain in the normal `paid -> processing -> shipped -> delivered -> completed` flow.

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

### List my orders

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

### Admin: manage orders

```
GET /api/servers/:serverId/shop/orders/manage
```

:::code-group

```ts [TypeScript]
const orders = await client.listShopOrders('server-id', { status: 'pending' })
```

```python [Python]
orders = client.manage_orders("server-id", status="pending")
```

:::

### Get order

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

### Update order status

```
PUT /api/servers/:serverId/shop/orders/:orderId/status
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | New status |
| `trackingNo` | string | No | Tracking number |
| `sellerNote` | string | No | Note to buyer |

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

### Cancel order

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

### Confirm completed delivery

Buyers call this after a seller marks the order `delivered`. This moves the order to `completed` and releases the settlement flow.

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

## Reviews

### List product reviews

```
GET /api/servers/:serverId/shop/products/:productId/reviews
```

:::code-group

```ts [TypeScript]
const reviews = await client.getProductReviews('server-id', 'product-id')
```

```python [Python]
reviews = client.list_product_reviews("server-id", "product-id")
```

:::

### Submit review

```
POST /api/servers/:serverId/shop/orders/:orderId/review
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | string | Yes | Product reviewed |
| `rating` | number | Yes | 1 – 5 |
| `content` | string | No | Review text |
| `images` | string[] | No | Image URLs |
| `isAnonymous` | boolean | No | Post anonymously |

:::code-group

```ts [TypeScript]
await client.createReview('server-id', 'order-id', {
  productId: 'product-id',
  rating: 5,
  content: 'Excellent quality!',
})
```

```python [Python]
client.submit_review("server-id", "order-id", productId="product-id", rating=5, content="Excellent quality!")
```

:::

### Reply to review (seller)

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

## Wallet

### Get wallet

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

### Top up

Public wallet top-up is disabled. Balance increases must come from a verified payment flow, refund, settlement, task reward, or admin grant.

The legacy `POST /api/wallet/topup` route now returns `403`.

:::code-group

```ts [TypeScript]
await client.topUpWallet(100) // throws; use the payment flow instead
```

```python [Python]
client.top_up_wallet(100)  # raises; use the payment flow instead
```

:::

### List transactions

```
GET /api/wallet/transactions
```

:::code-group

```ts [TypeScript]
const txns = await client.getWalletTransactions({ limit: 50 })
```

```python [Python]
txns = client.list_transactions(limit=50)
```

:::

---

## Entitlements

```
GET /api/servers/:serverId/shop/entitlements
```

:::code-group

```ts [TypeScript]
const entitlements = await client.getEntitlements('server-id')
```

```python [Python]
entitlements = client.list_entitlements("server-id")
```

:::
