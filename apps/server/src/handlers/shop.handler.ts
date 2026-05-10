import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { entitlementForceMajeureRequests } from '../db/schema'
import { apiError } from '../lib/api-error'
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

const productPickerSchema = z.object({
  target: z.enum(['channel', 'dm']),
  channelId: z.string().uuid().optional(),
  dmChannelId: z.string().uuid().optional(),
  keyword: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

const purchaseProductSchema = z.object({
  skuId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(200),
})

const purchaseOfferSchema = purchaseProductSchema.extend({
  destinationKind: z.enum(['channel', 'dm']).optional(),
  destinationId: z.string().uuid().optional(),
})

const createOfferSchema = z.object({
  productId: z.string().uuid(),
  allowedSurfaces: z
    .array(z.enum(['channel', 'dm']))
    .min(1)
    .max(2)
    .optional(),
  priceOverride: z.number().int().min(0).nullable().optional(),
  sellerBuddyUserId: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const createDeliverableSchema = z.object({
  kind: z
    .enum(['paid_file', 'message', 'external', 'entitlement', 'community_asset', 'currency'])
    .optional(),
  resourceType: z.string().min(1).max(80).optional(),
  resourceId: z.string().min(1),
  senderBuddyUserId: z.string().uuid().nullable().optional(),
  messageTemplateKey: z.string().max(120).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const createAssetDefinitionSchema = z.object({
  assetType: z.enum([
    'badge',
    'gift',
    'coupon',
    'service_ticket',
    'collectible',
    'content_pass',
    'reward',
  ]),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  giftable: z.boolean().optional(),
  transferable: z.boolean().optional(),
  consumable: z.boolean().optional(),
  revocable: z.boolean().optional(),
  expiresAfterDays: z.number().int().min(1).max(3650).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const updateAssetDefinitionSchema = createAssetDefinitionSchema
  .omit({ assetType: true })
  .partial()
  .extend({
    status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  })

const createPersonalShopSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
})

const cancelEntitlementSchema = z.object({
  reason: z.string().max(500).optional(),
})

const forceMajeureRequestSchema = z.object({
  reason: z.string().min(1).max(4000),
  evidence: z.record(z.unknown()).optional(),
})

const forceMajeureDecisionSchema = z.object({
  approved: z.boolean(),
  refundAmount: z.number().int().min(0).optional(),
  note: z.string().max(2000).optional(),
})

function errorResponse(c: Context, code: string, status: number): Response {
  return c.json(
    {
      ok: false,
      error: code,
      code,
    },
    status as Parameters<typeof c.json>[1],
  )
}

export function createShopHandler(container: AppContainer) {
  const h = new Hono()
  h.use('*', authMiddleware)

  /* ─── Helpers ─── */

  async function resolveServerId(param: string): Promise<string> {
    if (UUID_RE.test(param)) return param
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findBySlug(param)
    if (!server) throw apiError('SERVER_NOT_FOUND', 404)
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
    if (!server) throw apiError('SERVER_NOT_FOUND', 404)
    return shopService.getOrCreateShop(serverId, server.name)
  }

  async function requireProductVisible(productId: string, userId: string) {
    const productService = container.resolve('productService')
    const shopScopeService = container.resolve('shopScopeService')
    const product = await productService.getProductDetail(productId)
    await shopScopeService.requireVisibleShop(product.shopId, userId)
    if (product.status !== 'active') {
      const shop = await shopScopeService
        .requireShopManager(product.shopId, userId)
        .catch(() => null)
      if (!shop) throw apiError('PRODUCT_NOT_FOUND', 404)
    }
    return product
  }

  function requirePlatformReviewer(user: { email?: string; scopes?: string[] }) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    const isAdminEmail = adminEmail && user.email?.toLowerCase() === adminEmail
    const hasAdminScope = user.scopes?.some((scope) => scope === '*' || scope === 'admin:*')
    if (!isAdminEmail && !hasAdminScope) {
      throw apiError('PLATFORM_REVIEW_FORBIDDEN', 403)
    }
  }

  /* ══════════════════════════════════════════
     Scope-neutral commerce foundation
     ══════════════════════════════════════════ */

  h.get('/me/shop', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    return c.json(await shopScopeService.getOrCreatePersonalShop(user.userId))
  })

  h.post('/me/shop', zValidator('json', createPersonalShopSchema), async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const shopService = container.resolve('shopService')
    const shop = await shopScopeService.getOrCreatePersonalShop(user.userId)
    return c.json(await shopService.updateShop(shop.id, c.req.valid('json')))
  })

  h.get('/users/:userId/shop', async (c) => {
    const shopService = container.resolve('shopService')
    const shop = await shopService.getShopByOwnerUserId(c.req.param('userId'))
    if (!shop || shop.status !== 'active') {
      return errorResponse(c, 'SHOP_NOT_FOUND', 404)
    }
    return c.json(shop)
  })

  h.get('/users/:userId/shop/manage', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const shop = await shopScopeService.getOrCreatePersonalShop(c.req.param('userId'))
    await shopScopeService.requireShopManager(shop.id, user.userId)
    return c.json(shop)
  })

  h.post('/users/:userId/shop/manage', zValidator('json', createPersonalShopSchema), async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const shopService = container.resolve('shopService')
    const shop = await shopScopeService.getOrCreatePersonalShop(c.req.param('userId'))
    await shopScopeService.requireShopManager(shop.id, user.userId)
    return c.json(await shopService.updateShop(shop.id, c.req.valid('json')))
  })

  h.get('/shops/:shopId', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    return c.json(await shopScopeService.requireVisibleShop(c.req.param('shopId'), user.userId))
  })

  h.get('/shops/:shopId/products', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const productService = container.resolve('productService')
    const shop = await shopScopeService.requireVisibleShop(c.req.param('shopId'), user.userId)
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    const keyword = c.req.query('keyword') || undefined
    return c.json({
      products: await productService.getProducts(shop.id, {
        status: 'active',
        keyword,
        limit,
        offset,
      }),
    })
  })

  h.get('/shops/:shopId/assets', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const communityAssetService = container.resolve('communityAssetService')
    await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    return c.json({
      assets: await communityAssetService.listDefinitionsForShop(c.req.param('shopId')),
    })
  })

  h.post('/shops/:shopId/assets', zValidator('json', createAssetDefinitionSchema), async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const communityAssetService = container.resolve('communityAssetService')
    const shop = await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    const input = c.req.valid('json')
    return c.json(
      await communityAssetService.createDefinition({
        actor: c.get('actor'),
        createdBy: user.userId,
        issuerKind: 'shop',
        issuerId: shop.id,
        shopId: shop.id,
        assetType: input.assetType,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        giftable: input.giftable,
        transferable: input.transferable,
        consumable: input.consumable,
        revocable: input.revocable,
        expiresAfterDays: input.expiresAfterDays,
        status: input.status,
        metadata: input.metadata,
      }),
      201,
    )
  })

  h.get('/products/:productId', async (c) => {
    const user = c.get('user')
    return c.json(await requireProductVisible(c.req.param('productId'), user.userId))
  })

  h.get('/shops/:shopId/products/:productId', async (c) => {
    const user = c.get('user')
    const product = await requireProductVisible(c.req.param('productId'), user.userId)
    if (product.shopId !== c.req.param('shopId')) throw apiError('PRODUCT_SHOP_MISMATCH', 400)
    return c.json(product)
  })

  h.post('/shops/:shopId/products', zValidator('json', createProductSchema), async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const productService = container.resolve('productService')
    const commerceOfferService = container.resolve('commerceOfferService')
    const shop = await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    const product = await productService.createProduct(shop.id, c.req.valid('json'))
    await commerceOfferService.ensureDefaultOfferForProduct({
      productId: product.id,
      sellerUserId: user.userId,
    })
    return c.json(product, 201)
  })

  h.put(
    '/shops/:shopId/products/:productId',
    zValidator('json', updateProductSchema),
    async (c) => {
      const user = c.get('user')
      const shopScopeService = container.resolve('shopScopeService')
      const productService = container.resolve('productService')
      const shop = await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
      const product = await productService.getProductById(c.req.param('productId'))
      if (product.shopId !== shop.id) throw apiError('PRODUCT_SHOP_MISMATCH', 400)
      return c.json(await productService.updateProduct(product.id, c.req.valid('json')))
    },
  )

  h.delete('/shops/:shopId/products/:productId', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const productService = container.resolve('productService')
    const shop = await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    const product = await productService.getProductById(c.req.param('productId'))
    if (product.shopId !== shop.id) throw apiError('PRODUCT_SHOP_MISMATCH', 400)
    await productService.deleteProduct(product.id)
    return c.json({ ok: true })
  })

  h.patch(
    '/shops/:shopId/assets/:assetDefinitionId',
    zValidator('json', updateAssetDefinitionSchema),
    async (c) => {
      const user = c.get('user')
      const shopScopeService = container.resolve('shopScopeService')
      const communityAssetService = container.resolve('communityAssetService')
      const shop = await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
      const input = c.req.valid('json')
      return c.json(
        await communityAssetService.updateDefinition({
          actor: c.get('actor'),
          definitionId: c.req.param('assetDefinitionId'),
          shopId: shop.id,
          updatedBy: user.userId,
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          giftable: input.giftable,
          transferable: input.transferable,
          consumable: input.consumable,
          revocable: input.revocable,
          expiresAfterDays: input.expiresAfterDays,
          status: input.status,
          metadata: input.metadata,
        }),
      )
    },
  )

  h.get('/commerce/product-picker', zValidator('query', productPickerSchema), async (c) => {
    const user = c.get('user')
    const input = c.req.valid('query')
    if (input.target === 'channel' && !input.channelId) {
      throw apiError('CHANNEL_REQUIRED', 400)
    }
    if (input.target === 'dm' && !input.dmChannelId) {
      throw apiError('DM_CHANNEL_REQUIRED', 400)
    }
    const shopService = container.resolve('shopService')
    const commerceCardService = container.resolve('commerceCardService')
    const commerceOfferService = container.resolve('commerceOfferService')
    const groups: Array<{
      key: string
      labelKey: string
      shopId: string
      shopName: string
      shopScope: { kind: 'server' | 'user'; id: string }
      cards: Awaited<ReturnType<typeof commerceCardService.buildOfferCard>>[]
    }> = []
    const seenShopIds = new Set<string>()
    const target =
      input.target === 'dm'
        ? ({ kind: 'dm', dmChannelId: input.dmChannelId ?? 'unknown' } as const)
        : ({ kind: 'channel', channelId: input.channelId ?? 'unknown' } as const)

    const addShopGroup = async (
      key: string,
      labelKey: string,
      shop: NonNullable<Awaited<ReturnType<typeof shopService.getShopById>>>,
    ) => {
      if (seenShopIds.has(shop.id) || shop.status !== 'active') return
      seenShopIds.add(shop.id)
      await commerceOfferService.ensureDefaultOffersForShop(shop.id, {
        keyword: input.keyword,
        limit: input.limit,
      })
      const offers = await commerceOfferService.listActiveOffersForShop(shop.id, {
        keyword: input.keyword,
        limit: input.limit,
      })
      const cards = []
      for (const offer of offers.slice(0, input.limit)) {
        try {
          cards.push(
            await commerceCardService.buildOfferCard({
              offerId: offer.id,
              target,
            }),
          )
        } catch {
          /* skip products that are not valid for this target */
        }
      }
      if (cards.length === 0) return
      groups.push({
        key,
        labelKey,
        shopId: shop.id,
        shopName: shop.name,
        shopScope: {
          kind: shop.scopeKind,
          id: shop.scopeKind === 'server' ? shop.serverId! : shop.ownerUserId!,
        },
        cards,
      })
    }

    const personalShop = await shopService.getShopByOwnerUserId(user.userId)
    if (personalShop)
      await addShopGroup('personal', 'chat.productPickerGroupPersonal', personalShop)

    if (input.target === 'channel' && input.channelId) {
      const channelDao = container.resolve('channelDao')
      const channelMemberDao = container.resolve('channelMemberDao')
      const serverDao = container.resolve('serverDao')
      const channel = await channelDao.findById(input.channelId)
      if (channel) {
        const serverMember = await serverDao.getMember(channel.serverId, user.userId)
        const channelMember = serverMember
          ? await channelMemberDao.get(channel.id, user.userId)
          : null
        const canManage = serverMember?.role === 'owner' || serverMember?.role === 'admin'
        if (!serverMember || (channel.isPrivate && !channelMember && !canManage)) {
          throw apiError('CHANNEL_ACCESS_REQUIRED', 403)
        }
        const serverShop = await shopService.getShopByServerId(channel.serverId)
        if (serverShop) await addShopGroup('server', 'chat.productPickerGroupServer', serverShop)
        const channelService = container.resolve('channelService')
        const agentDao = container.resolve('agentDao')
        const members = await channelService.getChannelMembers(channel.id, channel.serverId)
        const agents = await agentDao.findByUserIds(members.map((member) => member.userId))
        for (const agent of agents) {
          const buddyShop = await shopService.getShopByOwnerUserId(agent.userId)
          if (buddyShop) {
            await addShopGroup(`buddy:${agent.userId}`, 'chat.productPickerGroupBuddy', buddyShop)
          }
        }
      }
    } else if (input.target === 'dm' && input.dmChannelId) {
      const dmService = container.resolve('dmService')
      const channel = await dmService.getChannelById(input.dmChannelId)
      if (!channel || (channel.userAId !== user.userId && channel.userBId !== user.userId)) {
        throw apiError('DM_ACCESS_REQUIRED', 403)
      }
      const otherUserId = channel.userAId === user.userId ? channel.userBId : channel.userAId
      const otherShop = await shopService.getShopByOwnerUserId(otherUserId)
      if (otherShop) await addShopGroup('dm:other', 'chat.productPickerGroupPeer', otherShop)
    }

    const cards = groups.flatMap((group) => group.cards).slice(0, input.limit)
    return c.json({ cards, groups })
  })

  h.post(
    '/commerce/offers/:offerId/purchase',
    zValidator('json', purchaseOfferSchema),
    async (c) => {
      const user = c.get('user')
      const entitlementPurchaseService = container.resolve('entitlementPurchaseService')
      const input = c.req.valid('json')
      const destination =
        input.destinationKind && input.destinationId
          ? { kind: input.destinationKind, id: input.destinationId }
          : undefined
      return c.json(
        await entitlementPurchaseService.purchaseOffer({
          buyerId: user.userId,
          offerId: c.req.param('offerId'),
          skuId: input.skuId,
          idempotencyKey: input.idempotencyKey,
          destination,
          actor: c.get('actor'),
        }),
        201,
      )
    },
  )

  h.get('/commerce/offers/:offerId/checkout-preview', async (c) => {
    const user = c.get('user')
    const commerceCheckoutService = container.resolve('commerceCheckoutService')
    const commerceOfferService = container.resolve('commerceOfferService')
    const viewerUserIdQuery = c.req.query('viewerUserId')
    if (viewerUserIdQuery && !UUID_RE.test(viewerUserIdQuery)) {
      return errorResponse(c, 'INVALID_VIEWER_USER_ID', 422)
    }
    const viewerUserId = viewerUserIdQuery || user.userId
    if (viewerUserId !== user.userId) {
      const { offer } = await commerceOfferService.getOfferBundle(c.req.param('offerId'))
      const canInspectViewer =
        offer.sellerUserId === user.userId || offer.sellerBuddyUserId === user.userId
      if (!canInspectViewer) {
        return errorResponse(c, 'COMMERCE_VIEWER_STATE_FORBIDDEN', 403)
      }
    }
    return c.json(
      await commerceCheckoutService.previewOffer({
        userId: viewerUserId,
        offerId: c.req.param('offerId'),
        skuId: c.req.query('skuId') || undefined,
        includeWallet: viewerUserId === user.userId,
      }),
    )
  })

  h.post(
    '/shops/:shopId/products/:productId/purchase',
    zValidator('json', purchaseProductSchema),
    async (c) => {
      const user = c.get('user')
      const entitlementPurchaseService = container.resolve('entitlementPurchaseService')
      const input = c.req.valid('json')
      return c.json(
        await entitlementPurchaseService.purchase({
          buyerId: user.userId,
          shopId: c.req.param('shopId'),
          productId: c.req.param('productId'),
          skuId: input.skuId,
          idempotencyKey: input.idempotencyKey,
          actor: c.get('actor'),
        }),
        201,
      )
    },
  )

  h.post(
    '/messages/:messageId/commerce-cards/:cardId/purchase',
    zValidator('json', purchaseProductSchema),
    async (c) => {
      const user = c.get('user')
      const messageService = container.resolve('messageService')
      const entitlementPurchaseService = container.resolve('entitlementPurchaseService')
      const message = await messageService.getById(c.req.param('messageId'))
      if (!message) return errorResponse(c, 'MESSAGE_NOT_FOUND', 404)
      const metadata = (message.metadata ?? {}) as Record<string, unknown>
      const cards = Array.isArray(metadata.commerceCards) ? metadata.commerceCards : []
      const card = cards.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).id === c.req.param('cardId'),
      ) as Record<string, unknown> | undefined
      if (!card || typeof card.offerId !== 'string') {
        return errorResponse(c, 'COMMERCE_CARD_NOT_FOUND', 404)
      }
      const input = c.req.valid('json')
      return c.json(
        await entitlementPurchaseService.purchaseOffer({
          buyerId: user.userId,
          offerId: card.offerId,
          skuId: input.skuId,
          idempotencyKey: input.idempotencyKey,
          destination: { kind: 'channel', id: message.channelId },
          actor: c.get('actor'),
        }),
        201,
      )
    },
  )

  h.post(
    '/dm/messages/:messageId/commerce-cards/:cardId/purchase',
    zValidator('json', purchaseProductSchema),
    async (c) => {
      const user = c.get('user')
      const dmService = container.resolve('dmService')
      const entitlementPurchaseService = container.resolve('entitlementPurchaseService')
      const message = await dmService.getMessageById(c.req.param('messageId'))
      if (!message) return errorResponse(c, 'MESSAGE_NOT_FOUND', 404)
      if (!(await dmService.isParticipant(message.dmChannelId, user.userId))) {
        throw apiError('DM_ACCESS_REQUIRED', 403)
      }
      const metadata = (message.metadata ?? {}) as Record<string, unknown>
      const cards = Array.isArray(metadata.commerceCards) ? metadata.commerceCards : []
      const card = cards.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).id === c.req.param('cardId'),
      ) as Record<string, unknown> | undefined
      if (!card || typeof card.offerId !== 'string') {
        return errorResponse(c, 'COMMERCE_CARD_NOT_FOUND', 404)
      }
      const input = c.req.valid('json')
      return c.json(
        await entitlementPurchaseService.purchaseOffer({
          buyerId: user.userId,
          offerId: card.offerId,
          skuId: input.skuId,
          idempotencyKey: input.idempotencyKey,
          destination: { kind: 'dm', id: message.dmChannelId },
          actor: c.get('actor'),
        }),
        201,
      )
    },
  )

  h.get('/shops/:shopId/offers', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const commerceOfferService = container.resolve('commerceOfferService')
    await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    return c.json({
      offers: await commerceOfferService.listActiveOffersForShop(c.req.param('shopId'), {
        keyword: c.req.query('keyword') || undefined,
        limit: Number(c.req.query('limit')) || 50,
      }),
    })
  })

  h.post('/shops/:shopId/offers', zValidator('json', createOfferSchema), async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const productService = container.resolve('productService')
    const commerceOfferService = container.resolve('commerceOfferService')
    const shop = await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    const input = c.req.valid('json')
    const product = await productService.getProductById(input.productId)
    if (product.shopId !== shop.id) throw apiError('PRODUCT_SHOP_MISMATCH', 400)
    return c.json(
      await commerceOfferService.createOffer({
        shopId: shop.id,
        productId: product.id,
        originKind: shop.scopeKind === 'server' ? 'server' : 'user',
        originServerId: shop.serverId,
        sellerUserId: user.userId,
        sellerBuddyUserId: input.sellerBuddyUserId,
        allowedSurfaces: input.allowedSurfaces,
        priceOverride: input.priceOverride,
        status: input.status,
        metadata: input.metadata,
      }),
      201,
    )
  })

  h.post(
    '/shops/:shopId/offers/:offerId/deliverables',
    zValidator('json', createDeliverableSchema),
    async (c) => {
      const user = c.get('user')
      const shopScopeService = container.resolve('shopScopeService')
      const commerceOfferService = container.resolve('commerceOfferService')
      await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
      const bundle = await commerceOfferService.getOfferBundle(c.req.param('offerId'))
      if (bundle.shop.id !== c.req.param('shopId')) throw apiError('OFFER_SHOP_MISMATCH', 400)
      const input = c.req.valid('json')
      return c.json(
        await commerceOfferService.createDeliverable({
          offerId: bundle.offer.id,
          kind: input.kind,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          senderBuddyUserId: input.senderBuddyUserId,
          messageTemplateKey: input.messageTemplateKey,
          metadata: input.metadata,
        }),
        201,
      )
    },
  )

  h.get('/entitlements', async (c) => {
    const user = c.get('user')
    const entitlementService = container.resolve('entitlementService')
    return c.json(await entitlementService.getAllUserEntitlements(user.userId))
  })

  h.get('/shops/:shopId/entitlements', async (c) => {
    const user = c.get('user')
    const shopScopeService = container.resolve('shopScopeService')
    const entitlementService = container.resolve('entitlementService')
    await shopScopeService.requireShopManager(c.req.param('shopId'), user.userId)
    return c.json(
      await entitlementService.getShopEntitlements(c.req.param('shopId'), {
        limit: Number(c.req.query('limit')) || 100,
        offset: Number(c.req.query('offset')) || 0,
      }),
    )
  })

  h.get('/entitlements/:entitlementId/verify', async (c) => {
    const user = c.get('user')
    const entitlementService = container.resolve('entitlementService')
    const shopScopeService = container.resolve('shopScopeService')
    const entitlementProvisionerService = container.resolve('entitlementProvisionerService')
    const entitlement = await entitlementService.getEntitlement(c.req.param('entitlementId'))
    if (entitlement.userId !== user.userId) {
      if (!entitlement.shopId) throw apiError('ENTITLEMENT_ACCESS_FORBIDDEN', 403)
      await shopScopeService.requireShopManager(entitlement.shopId, user.userId)
    }
    return c.json(await entitlementProvisionerService.verify(entitlement.id))
  })

  h.post(
    '/entitlements/:entitlementId/cancel',
    zValidator('json', cancelEntitlementSchema),
    async (c) => {
      const user = c.get('user')
      const cancellationService = container.resolve('entitlementCancellationService')
      return c.json(
        await cancellationService.cancel({
          actorUserId: user.userId,
          entitlementId: c.req.param('entitlementId'),
          reason: c.req.valid('json').reason,
          actor: c.get('actor'),
        }),
      )
    },
  )

  h.post(
    '/entitlements/:entitlementId/cancel-renewal',
    zValidator('json', cancelEntitlementSchema),
    async (c) => {
      const user = c.get('user')
      const cancellationService = container.resolve('entitlementCancellationService')
      return c.json(
        await cancellationService.cancel({
          actorUserId: user.userId,
          entitlementId: c.req.param('entitlementId'),
          reason: c.req.valid('json').reason ?? 'cancel_renewal',
          actor: c.get('actor'),
        }),
      )
    },
  )

  h.post(
    '/entitlements/:entitlementId/force-majeure-requests',
    zValidator('json', forceMajeureRequestSchema),
    async (c) => {
      const user = c.get('user')
      const input = c.req.valid('json')
      const entitlementService = container.resolve('entitlementService')
      const shopScopeService = container.resolve('shopScopeService')
      const db = container.resolve('db')
      const entitlement = await entitlementService.getEntitlement(c.req.param('entitlementId'))
      if (!entitlement.shopId) {
        return errorResponse(c, 'ENTITLEMENT_SHOP_MISSING', 400)
      }
      await shopScopeService.requireShopManager(entitlement.shopId, user.userId)
      const [request] = await db
        .insert(entitlementForceMajeureRequests)
        .values({
          entitlementId: entitlement.id,
          requesterId: user.userId,
          reason: input.reason,
          evidence: input.evidence ?? {},
        })
        .returning()
      await entitlementService.markPendingForceMajeureReview(entitlement.id)
      if (request) return c.json(request, 201)
      return errorResponse(c, 'FORCE_MAJEURE_REQUEST_CREATE_FAILED', 500)
    },
  )

  h.post(
    '/entitlement-review/:requestId/decision',
    zValidator('json', forceMajeureDecisionSchema),
    async (c) => {
      const user = c.get('user')
      requirePlatformReviewer(user)
      const input = c.req.valid('json')
      const db = container.resolve('db')
      const [request] = await db
        .update(entitlementForceMajeureRequests)
        .set({
          reviewerId: user.userId,
          status: input.approved ? 'refund_decided' : 'rejected',
          refundAmount: input.refundAmount,
          platformDecision: { approved: input.approved, note: input.note },
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(entitlementForceMajeureRequests.id, c.req.param('requestId')))
        .returning()
      if (!request) return errorResponse(c, 'FORCE_MAJEURE_REQUEST_NOT_FOUND', 404)
      if (input.approved) {
        const entitlementService = container.resolve('entitlementService')
        const ledgerService = container.resolve('ledgerService')
        const economyPolicyService = container.resolve('economyPolicyService')
        const economyAuditService = container.resolve('economyAuditService')
        const settlementService = container.resolve('settlementService')
        const entitlement = await entitlementService.getEntitlement(request.entitlementId)
        if (input.refundAmount && input.refundAmount > 0) {
          await economyPolicyService.authorize({
            actor: c.get('actor'),
            action: 'wallet.refund',
            resource: { kind: 'entitlement', id: entitlement.id },
            scope: { kind: 'wallet', id: entitlement.userId },
            dataClass: 'financial',
            targetUserId: entitlement.userId,
          })
          await ledgerService.credit({
            userId: entitlement.userId,
            amount: input.refundAmount,
            type: 'refund',
            referenceId: entitlement.orderId,
            referenceType: 'order',
            note: '不可抗力裁定退款',
          })
          await economyAuditService.record({
            actor: c.get('actor'),
            action: 'wallet.refund',
            resource: { kind: 'entitlement', id: entitlement.id },
            scope: { kind: 'wallet', id: entitlement.userId },
            request: { forceMajeureRequestId: request.id, approved: input.approved },
            result: 'succeeded',
            metadata: { refundAmount: input.refundAmount, orderId: entitlement.orderId },
          })
          if (entitlement.orderId) {
            await settlementService.reverseLinesForSource({
              sourceType: 'order',
              sourceId: entitlement.orderId,
              reason: 'force_majeure_refund',
            })
          }
        }
        await entitlementService.revokeEntitlement(
          request.entitlementId,
          'force_majeure_platform_decision',
        )
        await db
          .update(entitlementForceMajeureRequests)
          .set({ status: 'entitlement_revoked', updatedAt: new Date() })
          .where(eq(entitlementForceMajeureRequests.id, request.id))
      }
      return c.json(request)
    },
  )

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
    if (!shop) throw apiError('SHOP_NOT_FOUND', 404)
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
    const commerceOfferService = container.resolve('commerceOfferService')
    const product = await productService.createProduct(shop.id, c.req.valid('json'))
    await commerceOfferService.ensureDefaultOfferForProduct({
      productId: product.id,
      sellerUserId: user.userId,
    })
    return c.json(product, 201)
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
      await orderService.createOrder(
        user.userId,
        shop.id,
        input.items,
        input.buyerNote,
        input.idempotencyKey,
        c.get('actor'),
      ),
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
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    const shopService = container.resolve('shopService')
    const orderService = container.resolve('orderService')
    const shop = await shopService.getShopByServerId(serverId)
    if (!shop) return errorResponse(c, 'SHOP_NOT_FOUND', 404)
    const order = await orderService.getOrderDetail(c.req.param('orderId'))
    const isAdmin = await container
      .resolve('permissionService')
      .requireRole(serverId, user.userId, 'admin')
      .then(() => true)
      .catch(() => false)
    if (order.shopId !== shop.id || (order.buyerId !== user.userId && !isAdmin)) {
      return errorResponse(c, 'ORDER_NOT_FOUND', 404)
    }
    return c.json(order)
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

  h.post('/wallet/topup', async (c) => {
    return errorResponse(c, 'WALLET_TOPUP_REQUIRES_VERIFIED_PAYMENT', 403)
  })

  h.get('/wallet/transactions', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    const limit = Number(c.req.query('limit')) || 50
    const offset = Number(c.req.query('offset')) || 0
    const audience = c.req.query('audience') === 'consumer' ? 'consumer' : 'ledger'
    const directionQuery = c.req.query('direction')
    const direction =
      directionQuery === 'income' || directionQuery === 'expense' ? directionQuery : 'all'
    return c.json(
      await walletService.getTransactions(user.userId, limit, offset, { audience, direction }),
    )
  })

  h.get('/wallet/transactions/count', async (c) => {
    const user = c.get('user')
    const walletService = container.resolve('walletService')
    const audience = c.req.query('audience') === 'consumer' ? 'consumer' : 'ledger'
    const directionQuery = c.req.query('direction')
    const direction =
      directionQuery === 'income' || directionQuery === 'expense' ? directionQuery : 'all'
    return c.json({
      count: await walletService.getTransactionCount(user.userId, { audience, direction }),
    })
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

      const members = await serverDao.getMembers(serverId)
      if (!members.some((member) => member.userId === user.userId)) {
        return errorResponse(c, 'SERVER_MEMBERSHIP_REQUIRED', 403)
      }
      const server = await serverDao.findById(serverId)
      const ownerId = server?.ownerId || members.find((m) => m.role === 'owner')?.userId || null

      const existing = await channelService.getByServerId(serverId)
      const channelName = `shop-support-${user.userId.slice(0, 8)}`
      let channel = existing.find((ch) => ch.name === channelName)
      if (!channel) {
        const creatorUserId = ownerId ?? members.find((m) => m.role === 'admin')?.userId
        if (!creatorUserId) return errorResponse(c, 'SHOP_OWNER_NOT_FOUND', 422)
        channel = await channelService.create(
          serverId,
          {
            name: channelName,
            type: 'text',
            topic: 'Shop customer support ticket',
          },
          creatorUserId,
        )
      }

      // channel is definitely defined here (either found or just created)
      const ch = channel!

      // Keep channel private-ish: buyer + owner/admin + configured buddy
      const settings = (shop.settings || {}) as Record<string, unknown>
      const configuredBuddyId =
        typeof settings.supportBuddyUserId === 'string' ? settings.supportBuddyUserId : null
      const buddyId =
        configuredBuddyId && members.some((m) => m.userId === configuredBuddyId)
          ? configuredBuddyId
          : null
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
