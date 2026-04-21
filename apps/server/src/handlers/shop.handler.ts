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
  createSupportTicketSchema,
  replyReviewSchema,
  updateCartItemSchema,
  updateCategorySchema,
  updateOrderStatusSchema,
  updateProductSchema,
  updateShopSchema,
  updateSupportBuddySchema,
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

  h.post(
    '/servers/:serverId/shop/categories',
    zValidator('json', createCategorySchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
      const shop = await resolveShop(serverId)
      const shopService = container.resolve('shopService')
      return c.json(await shopService.createCategory(shop.id, c.req.valid('json')), 201)
    },
  )

  h.put(
    '/servers/:serverId/shop/categories/:categoryId',
    zValidator('json', updateCategorySchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
      const shopService = container.resolve('shopService')
      return c.json(
        await shopService.updateCategory(c.req.param('categoryId'), c.req.valid('json')),
      )
    },
  )

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

    const status =
      (c.req.query('status') as 'draft' | 'active' | 'archived' | undefined) || undefined
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
      productService.getProducts(shop.id, {
        status: effectiveStatus,
        categoryId,
        keyword,
        limit,
        offset,
      }),
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

  h.put(
    '/servers/:serverId/shop/products/:productId',
    zValidator('json', updateProductSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
      const productService = container.resolve('productService')
      return c.json(
        await productService.updateProduct(c.req.param('productId'), c.req.valid('json')),
      )
    },
  )

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
    return c.json(
      await cartService.addToCart(
        user.userId,
        shop.id,
        input.productId,
        input.skuId,
        input.quantity,
      ),
      201,
    )
  })

  h.put(
    '/servers/:serverId/shop/cart/:itemId',
    zValidator('json', updateCartItemSchema),
    async (c) => {
      const user = c.get('user')
      const cartService = container.resolve('cartService')
      const input = c.req.valid('json')
      const result = await cartService.updateCartItemQuantity(
        c.req.param('itemId'),
        user.userId,
        input.quantity,
      )
      return c.json(result ?? { ok: true })
    },
  )

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
    return c.json(
      await orderService.createOrder(user.userId, shop.id, input.items, input.buyerNote),
      201,
    )
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

  h.put(
    '/servers/:serverId/shop/orders/:orderId/status',
    zValidator('json', updateOrderStatusSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
      const orderService = container.resolve('orderService')
      const input = c.req.valid('json')
      return c.json(
        await orderService.updateOrderStatus(c.req.param('orderId'), input.status, {
          trackingNo: input.trackingNo,
          sellerNote: input.sellerNote,
        }),
      )
    },
  )

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

  h.post(
    '/servers/:serverId/shop/orders/:orderId/review',
    zValidator('json', createReviewSchema),
    async (c) => {
      const user = c.get('user')
      const reviewService = container.resolve('reviewService')
      const input = c.req.valid('json')
      return c.json(
        await reviewService.createReview(
          user.userId,
          c.req.param('orderId'),
          input.productId,
          input.rating,
          input.content,
          input.images,
          input.isAnonymous,
        ),
        201,
      )
    },
  )

  h.get('/servers/:serverId/shop/orders/:orderId/reviews', async (c) => {
    const user = c.get('user')
    const reviewService = container.resolve('reviewService')
    return c.json(await reviewService.getOrderReviews(c.req.param('orderId'), user.userId))
  })

  h.put(
    '/servers/:serverId/shop/reviews/:reviewId/reply',
    zValidator('json', replyReviewSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
      const reviewService = container.resolve('reviewService')
      return c.json(
        await reviewService.replyToReview(c.req.param('reviewId'), c.req.valid('json').reply),
      )
    },
  )

  /* ══════════════════════════════════════════
     Wallet
     ══════════════════════════════════════════ */

  h.get('/wallet', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    return c.json(await walletService.getWallet(user.userId))
  })

  // NOTE: POST /wallet/topup intentionally removed.
  // Top-ups must go through Stripe (POST /api/v1/recharge/create-intent).
  // For dev/demo top-ups, see POST /api/admin/wallet/grant (admin-only,
  // additionally guarded by ENABLE_DEV_TOPUP=1).

  h.get('/wallet/transactions', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    return c.json(await walletService.getTransactions(user.userId, limit, offset))
  })

  h.get('/wallet/transactions/count', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    return c.json({ count: await walletService.getTransactionCount(user.userId) })
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

  /* ══════════════════════════════════════════
     Support / Buddy
     ══════════════════════════════════════════ */

  h.put(
    '/servers/:serverId/shop/support/buddy',
    zValidator('json', updateSupportBuddySchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireShopAdmin(serverId, user.userId)
      const shopService = container.resolve('shopService')
      const shop = await resolveShop(serverId)
      const input = c.req.valid('json')
      const settings = {
        ...(shop.settings || {}),
        supportBuddyUserId: input.buddyUserId || null,
      }
      return c.json(await shopService.updateShop(shop.id, { settings }))
    },
  )

  h.post(
    '/servers/:serverId/shop/support',
    zValidator('json', createSupportTicketSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      const shop = await resolveShop(serverId)
      const input = c.req.valid('json')

      const channelService = container.resolve('channelService')
      const messageService = container.resolve('messageService')
      const channelMemberDao = container.resolve('channelMemberDao')
      const serverDao = container.resolve('serverDao')
      const agentDao = container.resolve('agentDao')

      const existing = await channelService.getByServerId(serverId)
      const channelName = `shop-support-${user.userId.slice(0, 8)}`
      let channel = existing.find((ch) => ch.name === channelName)
      if (!channel) {
        channel = await channelService.create(serverId, {
          name: channelName,
          type: 'text',
          topic: 'Shop customer support ticket',
        })
      }

      // channel is definitely defined here (either found or just created)
      const ch = channel!

      // Keep channel private-ish: buyer + owner/admin + configured buddy
      const members = await serverDao.getMembers(serverId)
      const server = await serverDao.findById(serverId)
      const settings = (shop.settings || {}) as Record<string, unknown>
      const configuredBuddyId =
        typeof settings.supportBuddyUserId === 'string' ? settings.supportBuddyUserId : null
      const buddyId =
        configuredBuddyId && members.some((m) => m.userId === configuredBuddyId)
          ? configuredBuddyId
          : null
      const ownerId = server?.ownerId || members.find((m) => m.role === 'owner')?.userId || null
      const adminIds = members
        .filter((m) => m.role === 'owner' || m.role === 'admin')
        .map((m) => m.userId)
        .filter((id) => id !== ownerId)
      const allowOrder = [
        ...(ownerId ? [ownerId] : []),
        ...adminIds,
        ...(buddyId ? [buddyId] : []),
        user.userId,
      ]
      const allow = new Set<string>(allowOrder)

      for (const m of members) {
        if (!allow.has(m.userId)) {
          try {
            await channelMemberDao.remove(ch.id, m.userId)
          } catch {
            // ignore if already removed / missing table
          }
        }
      }
      for (const uid of allowOrder) {
        await channelMemberDao.add(ch.id, uid)
      }

      try {
        const io = container.resolve('io')
        for (const uid of allowOrder) {
          io.to(`channel:${ch.id}`).emit('channel:member-added', {
            channelId: ch.id,
            userId: uid,
          })
        }
      } catch {
        /* non-critical in test or ws-unavailable env */
      }

      const prefix = input.productId ? `商品(${input.productId})` : '通用咨询'
      const mentionLine = [ownerId, buddyId]
        .filter((id): id is string => !!id)
        .map((id) => {
          const m = members.find((mem) => mem.userId === id)
          return m?.user?.username ? `@${m.user.username}` : null
        })
        .filter((s): s is string => !!s)
        .join(' ')
      const content = [
        `[商城客服] ${prefix}`,
        mentionLine ? `请协助处理：${mentionLine}` : '',
        input.message,
      ]
        .filter(Boolean)
        .join('\n')

      const attachments = (input.images || []).map((url, idx) => ({
        filename: `support-image-${idx + 1}.png`,
        url,
        contentType: 'image/png',
        size: 0,
      }))

      await messageService.send(ch.id, user.userId, {
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
      })

      const buddyAgent = buddyId ? await agentDao.findByUserId(buddyId) : null
      const buddyStatus = buddyAgent?.status ?? null
      const buddyReady = !!buddyAgent && buddyAgent.status === 'running'

      return c.json(
        {
          ok: true,
          channelId: ch.id,
          channelName: ch.name,
          ownerUserId: ownerId,
          buddyUserId: buddyId,
          buddyStatus,
          buddyReady,
        },
        201,
      )
    },
  )

  return h
}
