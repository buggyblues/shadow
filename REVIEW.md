# DB 查询优化审查报告

> 审查日期: 2026-04-12
> 审查范围: `apps/server/src/services/`, `apps/server/src/handlers/`, `apps/server/src/dao/`, `apps/server/src/db/schema/`

---

## 1. N+1 查询检测

### 🔴 严重 — ProductService.getProducts()

**文件**: `services/product.service.ts:30-37`

```typescript
async getProducts(shopId, opts) {
  const list = await this.deps.productDao.findByShopId(shopId, opts)
  return Promise.all(
    list.map(async (product) => {
      const media = await this.deps.productMediaDao.findByProductId(product.id)  // ← N+1!
      return { ...product, media }
    }),
  )
}
```

**问题**: 对每个 product 单独查询 media，N 个商品 = N+1 次查询。

**修复建议**: 在 `ProductMediaDao` 新增 `findByProductIds(ids: string[])` 批量查询，然后在 service 层组装。

---

### 🔴 严重 — OrderService.getMyOrders() / getShopOrders()

**文件**: `services/order.service.ts:169-177`, `services/order.service.ts:180-188`

```typescript
async getMyOrders(userId, opts) {
  const orderList = await this.deps.orderDao.findByBuyerId(userId, opts)
  return Promise.all(
    orderList.map(async (o) => {
      const items = await this.deps.orderDao.getItems(o.id)  // ← N+1!
      return { ...o, items }
    }),
  )
}
```

**问题**: 对每个 order 单独查询 order_items。

**修复建议**: 在 `OrderDao` 新增 `getItemsByOrderIds(orderIds: string[])` 批量查询。

---

### 🔴 严重 — CartService.getCart()

**文件**: `services/cart.service.ts:19-40`

```typescript
async getCart(userId, shopId) {
  const items = await this.deps.cartDao.findByUserId(userId, shopId)
  const enriched = await Promise.all(
    items.map(async (item) => {
      const product = await this.deps.productDao.findById(item.productId)      // ← N+1
      const sku = item.skuId ? await this.deps.skuDao.findById(item.skuId)    // ← N+1
      const media = product ? await this.deps.productMediaDao.findByProductId(product.id) : []  // ← N+1
      ...
    }),
  )
}
```

**问题**: 每个 cart item 触发 3 次独立查询（product + sku + media），N 个商品 = 3N+1 次查询。

**修复建议**: 批量获取所有 productIds 和 skuIds，一次性查询后在内存中 map 组装。

---

### 🟡 中等 — OrderService.createOrder() 循环内多次查询

**文件**: `services/order.service.ts:53-90`

```typescript
for (const item of items) {
  const product = await this.deps.productService.getProductById(item.productId)  // ← N+1
  ...
  if (item.skuId) {
    const sku = await this.deps.productService.getSkuById(item.skuId)  // ← N+1
  }
  imageUrl = (await this.deps.productService.getProductFirstImage(product.id)) ?? undefined  // ← N+1
}
```

**问题**: 下单时每个商品触发 3 次查询。虽然后面还有 for 循环递减库存和增加销量，这些也可以批量操作。

**修复建议**: 批量查询 product 和 sku 信息；库存递减和销量增加改为批量 SQL（虽然 DAO 层目前是单条 atomic UPDATE）。

---

### 🟡 中等 — ProductService.createProduct() / updateProduct() 逐条插入

**文件**: `services/product.service.ts:72-82`, `services/product.service.ts:98-120`

```typescript
if (media?.length) {
  for (let i = 0; i < media.length; i++) {
    await this.deps.productMediaDao.create({ productId: product.id, ... })  // ← 逐条 INSERT
  }
}
```

**问题**: 每个 media 和 sku 都是独立 INSERT。如果产品有 10 个 SKU，就是 10 次独立 INSERT。

**修复建议**: 在 DAO 层新增 `createMany()` 方法，使用 `db.insert().values([...])` 批量插入。

---

### 🟢 良好实践

以下代码已正确避免 N+1：

- **MessageDao.findByChannelId()** — 批量获取 attachments（`inArray` + Map 组装）
- **DmService.getMessages()** — `Promise.all` 批量获取 authors、attachments、reactions
- **NotificationService.filterByPreference()** — 批量获取 messageScopes 和 channelScopes
- **ServerDao.findByUserId()** — 使用 `inArray` + `groupBy` 批量获取 memberCount 和 channelCount

---

## 2. 索引覆盖

### ✅ 已有索引清单

| 表 | 索引 | 覆盖查询 |
|---|---|---|
| messages | `messages_channel_id_idx` | findByChannelId ✅ |
| messages | `messages_thread_id_idx` | findByThreadId ✅ |
| messages | `messages_created_at_idx` | orderBy createdAt（需配合 channelId） |
| notifications | `notifications_user_id_idx` | findByUserId ✅ |
| notifications | `notifications_created_at_idx` | orderBy ✅ |
| notifications | `notifications_is_read_idx` | WHERE isRead = false（单列，效果有限） |
| orders | `orders_shop_id_idx` | findByShopId ✅ |
| orders | `orders_buyer_id_idx` | findByBuyerId ✅ |
| orders | `orders_status_idx` | WHERE status ✅ |
| orders | `orders_created_at_idx` | orderBy ✅ |
| products | `products_shop_id_idx` | findByShopId ✅ |
| products | `products_category_id_idx` | WHERE categoryId ✅ |
| product_media | `product_media_product_id_idx` | findByProductId ✅ |
| skus | `skus_product_id_idx` | findByProductId ✅ |
| order_items | `order_items_order_id_idx` | getItems ✅ |
| order_items | `order_items_product_id_idx` | JOIN 查询 |
| cart_items | `cart_items_user_id_idx` | findByUserId ✅ |
| cart_items | `cart_items_shop_id_idx` | WHERE shopId ✅ |
| cart_items | `cart_items_product_id_idx` | JOIN 查询 |
| entitlements | `entitlements_user_id_idx` | findActiveByUser ✅ |
| entitlements | `entitlements_server_id_idx` | WHERE serverId ✅ |
| entitlements | `entitlements_type_idx` | WHERE type ✅ |
| agents | `agents_owner_id_idx` | findByOwnerId ✅ |
| agents | `agents_user_id_idx` | findByUserId ✅ |
| reactions | `reactions_message_id_idx` | getReactions ✅ |
| reactions | `reactions_user_id_idx` | 用户维度查询 |
| members | `members_server_id_idx` | getMembers ✅ |
| members | `members_user_id_idx` | 用户维度查询 |
| wallets | `wallets_user_id_unique` | 唯一索引 ✅ |
| wallet_transactions | `wallet_transactions_wallet_id_idx` | getTransactions ✅ |

### ⚠️ 缺失索引

| 缺失索引 | 影响 | 建议 |
|---|---|---|
| `messages(channel_id, created_at DESC)` | 消息列表查询最频繁，当前用两个单列索引，PostgreSQL 可能只用其中一个 | **添加复合索引** `idx_messages_channel_created` |
| `orders(buyer_id, created_at DESC)` | 我的订单列表按时间排序 | 添加复合索引 |
| `orders(shop_id, status, created_at DESC)` | 商家订单列表按状态筛选 + 排序 | 添加复合索引 |
| `products(shop_id, status)` | 商品列表按状态筛选 | 添加复合索引 |
| `notifications(user_id, is_read, created_at DESC)` | 未读通知查询 | 添加复合索引 |
| `messages.content` 全文索引 | 搜索使用 `ILIKE '%query%'` 全表扫描 | 添加 `tsvector` 列 + GIN 索引 |
| `dm_messages(dm_channel_id, created_at DESC)` | DM 消息列表 | 添加复合索引 |

---

## 3. JOIN vs 多次查询

### ✅ 正确使用 JOIN 的地方

- **MessageDao.findByChannelId()** — `LEFT JOIN users` 获取作者信息
- **ServerDao.getMembers()** — `LEFT JOIN users` 获取成员用户信息
- **ServerDao.findByUserId()** — `INNER JOIN servers` 获取用户加入的服务器
- **NotificationDao.findByUserId()** — `LEFT JOIN users` 获取发送者头像
- **NotificationDao.findMessageScopesByMessageIds()** — `INNER JOIN channels` 获取消息的 channel/server 范围

### ⚠️ 可以优化的地方

- **DmService.isParticipant()** — 先查询整个 channel 记录再判断 userAId/userBId
  - **优化**: 改为 `SELECT count(*) FROM dm_channels WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)`

---

## 4. 批量操作

### ❌ 缺少批量操作

| 位置 | 问题 |
|---|---|
| `product.service.ts:createProduct()` | media 和 sku 逐条 INSERT |
| `product.service.ts:updateProduct()` | 先 DELETE 再逐条 INSERT |
| `order.service.ts:createOrder()` | 逐条 decrementSkuStock、incrementSalesCount |
| `agent-dashboard.service.ts:getRentalStats()` | 循环内累加 totalIncome 和 totalDuration |

### ✅ 已有批量操作

- **MessageDao.findByChannelId()** — `inArray` 批量获取 attachments
- **DmService.getMessages()** — `Promise.all` 批量获取 authors/attachments/reactions
- **ServerDao.findByUserId()** — `inArray + groupBy` 批量统计
- **NotificationDao.markAsReadByIds()** — `inArray` 批量更新
- **OrderDao.createItems()** — 批量插入 order items ✅

---

## 5. 分页策略

### ✅ 游标分页（推荐）

- **MessageDao.findByChannelId()** — 使用 `createdAt` 作为游标 ✅
- **MessageDao.findByThreadId()** — 使用 `createdAt` 作为游标 ✅
- **DmService.getMessages()** — 使用 `createdAt` 作为游标 ✅

### ⚠️ OFFSET 分页（大数据量会变慢）

| 端点 | 问题 |
|---|---|
| `NotificationDao.findByUserId()` | `LIMIT/OFFSET`，通知多时第 N 页越来越慢 |
| `NotificationDao.findUnreadByUserId()` | 无 LIMIT，获取所有未读通知 |
| `ProductDao.findByShopId()` | `LIMIT/OFFSET` |
| `OrderDao.findByBuyerId()` | `LIMIT/OFFSET` |
| `OrderDao.findByShopId()` | `LIMIT/OFFSET` |
| `ServerDao.findAll()` / `findPublic()` | `LIMIT/OFFSET` |
| `AgentDao.findAll()` | `LIMIT/OFFSET` |

**建议**: 高频访问的列表（通知、订单）应改为游标分页。产品列表和服务器发现页 offset 分页可接受（通常不会翻很多页）。

---

## 6. 连接池配置

### 🔴 问题：无连接池配置

**文件**: `db/index.ts`

```typescript
const queryClient = postgres(connectionString)  // ← 无配置！
```

`postgres` 库默认 `max: 10`，但在生产环境中应根据实际情况调整。当前问题：

1. **无 `max` 显式配置** — 默认 10，可能不够用
2. **无 `idle_timeout`** — 空闲连接不会自动回收
3. **无 `max_lifetime`** — 连接不会定期重建，可能导致使用被数据库端关闭的 stale 连接
4. **无 `connect_timeout`** — 连接超时未设置
5. **无健康检查** — 无定期 ping 检测连接可用性

**建议配置**:

```typescript
const queryClient = postgres(connectionString, {
  max: 20,            // 最大连接数，根据并发量调整
  idle_timeout: 30,   // 30秒空闲后回收
  max_lifetime: 60 * 30, // 连接最大存活30分钟
  connect_timeout: 5, // 连接超时5秒
})
```

---

## 7. 慢查询风险

### 🔴 高风险

| 查询 | 文件 | 风险描述 |
|---|---|---|
| `MessageDao.search()` — `ILIKE '%query%'` | `dao/message.dao.ts` | 前缀通配符无法使用 B-tree 索引，大数据量时全表扫描 |
| `NotificationDao.findUnreadByUserId()` — 无 LIMIT | `dao/notification.dao.ts` | 通知积累到上万条时，一次性全量加载 |
| `WorkspaceService.getTree()` — 加载整个工作区树 | `services/workspace.service.ts` | 文件节点多时内存和查询压力大 |

### 🟡 中等风险

| 查询 | 文件 | 风险描述 |
|---|---|---|
| `ServerDao.findPublic()` — 获取所有会员头像 | `dao/server.dao.ts` | LEFT JOIN members + users，无 LIMIT 在 JOIN 层 |
| `AgentDashboardDao.findDailyStats()` — 365天数据 | `dao/agent-dashboard.dao.ts` | 查询一整年数据，缺少 `(agent_id, date)` 复合索引 |
| `OrderService.getMyOrders()` — N+1 加载 items | `services/order.service.ts` | 每页50个订单 = 51次查询 |

### 🟢 低风险

- 所有基于 UUID 主键的 `findById()` 查询 — 主键索引覆盖
- 所有基于 `shopId`、`serverId` 的单表查询 — 已有索引

---

## 8. 事务边界

### 🔴 严重 — OrderService.createOrder() 无事务包裹

**文件**: `services/order.service.ts:47-138`

下单流程包含以下步骤，但**没有任何事务包裹**：

1. 验证商品和 SKU（多次查询）
2. 创建订单
3. 创建订单项
4. **扣款**（wallet debit）
5. 标记订单为已支付
6. 递减库存
7. 增加销量
8. 发放权益（entitlements）
9. 清空购物车

**风险场景**:
- 扣款成功但库存递减失败 → 钱扣了但订单未完成
- 订单创建成功但扣款失败 → 产生了未支付的脏订单
- 库存递减成功但权益发放失败 → 用户付了钱没拿到权益

**修复建议**: 使用数据库事务包裹核心步骤（2-8），验证步骤可在事务外：

```typescript
await this.deps.orderDao.db.transaction(async (tx) => {
  // 2-8 全部在事务内
  const order = await tx.insert(orders).values(...).returning()
  await tx.insert(orderItems).values(...)
  await tx.update(wallets).set({ balance: sql`...` }).where(...)
  await tx.update(orders).set({ status: 'paid' }).where(...)
  // ...
})
```

### 🟡 中等 — ProductService.createProduct() / updateProduct() 无事务

**文件**: `services/product.service.ts`

- `createProduct()` — 插入 product → 插入 media → 插入 skus，如果中间失败会留下不完整的 product
- `updateProduct()` — 更新 product → 删除 media → 插入新 media，如果中间失败 media 全部丢失

**修复建议**: 使用事务包裹整个创建/更新流程。

### 🟡 中等 — WorkspaceService 文件操作无事务

**文件**: `services/workspace.service.ts`

- `updateFolder()` — 更新节点 → 重写后代路径，如果重写失败会导致路径不一致
- `pasteNodes()` — 大量创建操作，中间失败会留下部分数据

---

## 总结 & 优先级

### P0 — 必须修复（影响数据一致性）

1. **OrderService.createOrder() 添加事务包裹** — 防止扣款/库存/权益不一致
2. **ProductService 批量插入 media/sku** — 减少下单时的数据库往返

### P1 — 强烈建议（影响性能和用户体验）

3. **添加缺失的复合索引** — 特别是 `messages(channel_id, created_at)` 和 `notifications(user_id, is_read, created_at)`
4. **修复 N+1 查询** — `ProductService.getProducts()`、`OrderService.getMyOrders()`、`CartService.getCart()`
5. **配置数据库连接池** — 添加 max、idle_timeout、max_lifetime 等参数

### P2 — 建议优化（预防性问题）

6. **ProductService.createProduct/updateProduct 添加事务**
7. **高频列表接口改为游标分页** — 通知、订单列表
8. **消息搜索改用全文搜索** — `ILIKE` 改为 `tsvector` + GIN 索引
9. **NotificationDao.findUnreadByUserId() 添加 LIMIT**
