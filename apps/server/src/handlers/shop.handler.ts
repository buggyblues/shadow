import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  addToCartSchema,
  createCategorySchema,
  createOrderSchema,
  createProductSchema,
  createReviewSchema,
  replyReviewSchema,
  topUpSchema,
  updateCartItemSchema,
  updateCategorySchema,
  updateOrderStatusSchema,
  updateProductSchema,
  updateShopSchema,
} from '../validators/shop.schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createShopHandler(container: AppContainer) {
  const h = new Hono()
  h.use('*', authMiddleware)

  /* ─── Helpers ─── */

  async function resolveServerId(param: string): Promise<string> {
    if (UUID_RE.test(param)) return param
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findBySlug(param)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return server.id
  }

  async function requireShopAdmin(serverId: string, userId: string) {
    const permissionService = container.resolve('permissionService')
    await permissionService.requireRole(serverId, userId, 'admin')
  }

  async function resolveShop(serverId: string) {
    const shopService = container.resolve('shopService')
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findById(serverId)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return shopService.getOrCreateShop(serverId, server.name)
  }

  /* ══════════════════════════════════════════
     Shop Metadata
     ══════════════════════════════════════════ */

  h.get('/servers/:serverId/shop', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const shop = await resolveShop(serverId)
    return c.json(shop)
  })

  h.put('/servers/:serverId/shop', zValidator('json', updateShopSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const shopService = container.resolve('shopService')
    const shop = await shopService.getShopByServerId(serverId)
    if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 })
    return c.json(await shopService.updateShop(shop.id, c.req.valid('json')))
  })

  /* ══════════════════════════════════════════
     Categories
     ══════════════════════════════════════════ */

  h.get('/servers/:serverId/shop/categories', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const shopService = container.resolve('shopService')
    const shop = await shopService.getShopByServerId(serverId)
    if (!shop) return c.json([])
    return c.json(await shopService.getCategories(shop.id))
  })

  h.post('/servers/:serverId/shop/categories', zValidator('json', createCategorySchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const shop = await resolveShop(serverId)
    const shopService = container.resolve('shopService')
    return c.json(await shopService.createCategory(shop.id, c.req.valid('json')), 201)
  })

  h.put('/servers/:serverId/shop/categories/:categoryId', zValidator('json', updateCategorySchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const shopService = container.resolve('shopService')
    return c.json(await shopService.updateCategory(c.req.param('categoryId'), c.req.valid('json')))
  })

  h.delete('/servers/:serverId/shop/categories/:categoryId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const shopService = container.resolve('shopService')
    await shopService.deleteCategory(c.req.param('categoryId'))
    return c.json({ ok: true })
  })

  /* ══════════════════════════════════════════
     Products
     ══════════════════════════════════════════ */

  h.get('/servers/:serverId/shop/products', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const shopService = container.resolve('shopService')
    const productService = container.resolve('productService')
    const shop = await shopService.getShopByServerId(serverId)
    if (!shop) return c.json({ products: [], total: 0 })

    const status = (c.req.query('status') as 'draft' | 'active' | 'archived' | undefined) || undefined
    const categoryId = c.req.query('categoryId') || undefined
    const keyword = c.req.query('keyword') || undefined
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0

    // Non-admin users only see active products
    let effectiveStatus = status
    try {
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
    } catch {
      effectiveStatus = 'active'
    }

    const [products, total] = await Promise.all([
      productService.getProducts(shop.id, { status: effectiveStatus, categoryId, keyword, limit, offset }),
      productService.getProductCount(shop.id, { status: effectiveStatus, categoryId, keyword }),
    ])
    return c.json({ products, total })
  })

  h.get('/servers/:serverId/shop/products/:productId', async (c) => {
    const productService = container.resolve('productService')
    return c.json(await productService.getProductDetail(c.req.param('productId')))
  })

  h.post('/servers/:serverId/shop/products', zValidator('json', createProductSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const shop = await resolveShop(serverId)
    const productService = container.resolve('productService')
    return c.json(await productService.createProduct(shop.id, c.req.valid('json')), 201)
  })

  h.put('/servers/:serverId/shop/products/:productId', zValidator('json', updateProductSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const productService = container.resolve('productService')
    return c.json(await productService.updateProduct(c.req.param('productId'), c.req.valid('json')))
  })

  h.delete('/servers/:serverId/shop/products/:productId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const productService = container.resolve('productService')
    await productService.deleteProduct(c.req.param('productId'))
    return c.json({ ok: true })
  })

  /* ══════════════════════════════════════════
     Cart
     ══════════════════════════════════════════ */

  h.get('/servers/:serverId/shop/cart', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    const shopService = container.resolve('shopService')
    const cartService = container.resolve('cartService')
    const shop = await shopService.getShopByServerId(serverId)
    if (!shop) return c.json([])
    return c.json(await cartService.getCart(user.userId, shop.id))
  })

  h.post('/servers/:serverId/shop/cart', zValidator('json', addToCartSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    const shop = await resolveShop(serverId)
    const cartService = container.resolve('cartService')
    const input = c.req.valid('json')
    return c.json(await cartService.addToCart(user.userId, shop.id, input.productId, input.skuId, input.quantity), 201)
  })

  h.put('/servers/:serverId/shop/cart/:itemId', zValidator('json', updateCartItemSchema), async (c) => {
    const user = c.get('user')
    const cartService = container.resolve('cartService')
    const input = c.req.valid('json')
    const result = await cartService.updateCartItemQuantity(c.req.param('itemId'), user.userId, input.quantity)
    return c.json(result ?? { ok: true })
  })

  h.delete('/servers/:serverId/shop/cart/:itemId', async (c) => {
    const user = c.get('user')
    const cartService = container.resolve('cartService')
    await cartService.removeFromCart(c.req.param('itemId'), user.userId)
    return c.json({ ok: true })
  })

  /* ══════════════════════════════════════════
     Orders
     ══════════════════════════════════════════ */

  h.post('/servers/:serverId/shop/orders', zValidator('json', createOrderSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    const shop = await resolveShop(serverId)
    const orderService = container.resolve('orderService')
    const input = c.req.valid('json')
    return c.json(await orderService.createOrder(user.userId, shop.id, input.items, input.buyerNote), 201)
  })

  h.get('/servers/:serverId/shop/orders', async (c) => {
    const user = c.get('user')
    const orderService = container.resolve('orderService')
    const status = c.req.query('status') || undefined
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    return c.json(await orderService.getMyOrders(user.userId, { status, limit, offset }))
  })

  h.get('/servers/:serverId/shop/orders/manage', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const shopService = container.resolve('shopService')
    const orderService = container.resolve('orderService')
    const shop = await shopService.getShopByServerId(serverId)
    if (!shop) return c.json([])
    const status = c.req.query('status') || undefined
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    return c.json(await orderService.getShopOrders(shop.id, { status, limit, offset }))
  })

  h.get('/servers/:serverId/shop/orders/:orderId', async (c) => {
    const orderService = container.resolve('orderService')
    return c.json(await orderService.getOrderDetail(c.req.param('orderId')))
  })

  h.put('/servers/:serverId/shop/orders/:orderId/status', zValidator('json', updateOrderStatusSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const orderService = container.resolve('orderService')
    const input = c.req.valid('json')
    return c.json(await orderService.updateOrderStatus(c.req.param('orderId'), input.status, { trackingNo: input.trackingNo, sellerNote: input.sellerNote }))
  })

  h.post('/servers/:serverId/shop/orders/:orderId/cancel', async (c) => {
    const user = c.get('user')
    const orderService = container.resolve('orderService')
    return c.json(await orderService.cancelOrder(c.req.param('orderId'), user.userId))
  })

  /* ══════════════════════════════════════════
     Reviews
     ══════════════════════════════════════════ */

  h.get('/servers/:serverId/shop/products/:productId/reviews', async (c) => {
    const reviewService = container.resolve('reviewService')
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    return c.json(await reviewService.getProductReviews(c.req.param('productId'), limit, offset))
  })

  h.post('/servers/:serverId/shop/orders/:orderId/review', zValidator('json', createReviewSchema), async (c) => {
    const user = c.get('user')
    const reviewService = container.resolve('reviewService')
    const input = c.req.valid('json')
    return c.json(await reviewService.createReview(user.userId, c.req.param('orderId'), input.productId, input.rating, input.content, input.images), 201)
  })

  h.put('/servers/:serverId/shop/reviews/:reviewId/reply', zValidator('json', replyReviewSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireShopAdmin(serverId, user.userId)
    const reviewService = container.resolve('reviewService')
    return c.json(await reviewService.replyToReview(c.req.param('reviewId'), c.req.valid('json').reply))
  })

  /* ══════════════════════════════════════════
     Wallet
     ══════════════════════════════════════════ */

  h.get('/wallet', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    return c.json(await walletService.getWallet(user.userId))
  })

  h.post('/wallet/topup', zValidator('json', topUpSchema), async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    const input = c.req.valid('json')
    return c.json(await walletService.topUp(user.userId, input.amount, input.note))
  })

  h.get('/wallet/transactions', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    return c.json(await walletService.getTransactions(user.userId, limit, offset))
  })

  /* ══════════════════════════════════════════
     Entitlements
     ══════════════════════════════════════════ */

  h.get('/servers/:serverId/shop/entitlements', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    const entitlementService = container.resolve('entitlementService')
    return c.json(await entitlementService.getUserEntitlements(user.userId, serverId))
  })

  return h
}
