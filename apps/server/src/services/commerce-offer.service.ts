import { and, desc, eq, ilike, or } from 'drizzle-orm'
import type { Database } from '../db'
import { commerceDeliverables, commerceOffers, products, shops } from '../db/schema'
import { apiError } from '../lib/api-error'
import type { ProductService } from './product.service'
import type { ShopService } from './shop.service'

export type CommerceSurface = 'channel' | 'dm'

type ProductDetail = Awaited<ReturnType<ProductService['getProductDetail']>>
type ShopRecord = NonNullable<Awaited<ReturnType<ShopService['getShopById']>>>

function normalizeSurfaces(value: unknown, fallback: CommerceSurface[]): CommerceSurface[] {
  if (!Array.isArray(value)) return fallback
  const surfaces = value.filter(
    (item): item is CommerceSurface => item === 'channel' || item === 'dm',
  )
  return surfaces.length ? surfaces : fallback
}

function isActiveWindow(offer: { startsAt: Date | null; expiresAt: Date | null }) {
  const now = Date.now()
  if (offer.startsAt && offer.startsAt.getTime() > now) return false
  if (offer.expiresAt && offer.expiresAt.getTime() <= now) return false
  return true
}

export class CommerceOfferService {
  constructor(
    private deps: {
      db: Database
      productService: ProductService
      shopService: ShopService
    },
  ) {}

  private get db() {
    return this.deps.db
  }

  async createOffer(input: {
    shopId: string
    productId: string
    originKind?: 'server' | 'user' | 'platform'
    originServerId?: string | null
    sellerUserId?: string | null
    sellerBuddyUserId?: string | null
    allowedSurfaces?: CommerceSurface[]
    visibility?: string
    eligibility?: Record<string, unknown>
    priceOverride?: number | null
    status?: 'draft' | 'active' | 'paused' | 'archived'
    metadata?: Record<string, unknown>
  }) {
    const [offer] = await this.db
      .insert(commerceOffers)
      .values({
        shopId: input.shopId,
        productId: input.productId,
        originKind: input.originKind ?? 'server',
        originServerId: input.originServerId ?? null,
        sellerUserId: input.sellerUserId ?? null,
        sellerBuddyUserId: input.sellerBuddyUserId ?? null,
        allowedSurfaces: input.allowedSurfaces ?? ['channel', 'dm'],
        visibility: input.visibility ?? 'login_required',
        eligibility: input.eligibility ?? {},
        priceOverride: input.priceOverride ?? null,
        status: input.status ?? 'active',
        metadata: input.metadata ?? {},
      })
      .returning()
    if (!offer) throw apiError('COMMERCE_OFFER_CREATE_FAILED', 500)
    return offer
  }

  async ensureDefaultOfferForProduct(input: {
    productId: string
    sellerUserId?: string | null
    sellerBuddyUserId?: string | null
  }) {
    const existing = await this.db
      .select()
      .from(commerceOffers)
      .where(eq(commerceOffers.productId, input.productId))
      .orderBy(desc(commerceOffers.createdAt))
      .limit(1)
    if (existing[0]) return existing[0]

    const product = await this.deps.productService.getProductDetail(input.productId)
    const shop = await this.deps.shopService.getShopById(product.shopId)
    if (!shop) throw apiError('SHOP_NOT_FOUND', 404)
    const allowedSurfaces: CommerceSurface[] =
      shop.scopeKind === 'server' ? ['channel'] : ['channel', 'dm']

    return this.createOffer({
      shopId: shop.id,
      productId: product.id,
      originKind: shop.scopeKind === 'server' ? 'server' : 'user',
      originServerId: shop.serverId,
      sellerUserId: input.sellerUserId ?? shop.ownerUserId,
      sellerBuddyUserId: input.sellerBuddyUserId ?? null,
      allowedSurfaces,
      status: product.status === 'active' ? 'active' : 'draft',
      metadata: { defaultOffer: true },
    })
  }

  async ensureDefaultOffersForShop(shopId: string, opts?: { keyword?: string; limit?: number }) {
    const productList = await this.deps.productService.getProducts(shopId, {
      status: 'active',
      keyword: opts?.keyword,
      limit: opts?.limit ?? 50,
    })
    for (const product of productList) {
      await this.ensureDefaultOfferForProduct({ productId: product.id })
    }
  }

  async listActiveOffersForShop(shopId: string, opts?: { keyword?: string; limit?: number }) {
    const conditions = [
      eq(commerceOffers.shopId, shopId),
      eq(commerceOffers.status, 'active'),
      eq(products.status, 'active'),
    ]
    if (opts?.keyword) conditions.push(ilike(products.name, `%${opts.keyword}%`))

    return this.db
      .select({ offer: commerceOffers })
      .from(commerceOffers)
      .innerJoin(products, eq(products.id, commerceOffers.productId))
      .where(and(...conditions))
      .orderBy(desc(commerceOffers.updatedAt))
      .limit(opts?.limit ?? 50)
      .then((rows) => rows.map((row) => row.offer))
  }

  async listActiveOfferBundlesForSeller(input: {
    sellerUserId: string
    surface: CommerceSurface
    limit?: number
  }) {
    const rows = await this.db
      .select({ offer: commerceOffers, product: products, shop: shops })
      .from(commerceOffers)
      .innerJoin(products, eq(products.id, commerceOffers.productId))
      .innerJoin(shops, eq(shops.id, commerceOffers.shopId))
      .where(
        and(
          eq(commerceOffers.status, 'active'),
          eq(products.status, 'active'),
          eq(shops.status, 'active'),
          or(
            eq(commerceOffers.sellerUserId, input.sellerUserId),
            eq(commerceOffers.sellerBuddyUserId, input.sellerUserId),
            eq(shops.ownerUserId, input.sellerUserId),
          ),
        ),
      )
      .orderBy(desc(commerceOffers.updatedAt))
      .limit(input.limit ?? 10)

    return rows.filter((row) => {
      if (!isActiveWindow(row.offer)) return false
      const surfaces = normalizeSurfaces(row.offer.allowedSurfaces, ['channel', 'dm'])
      return surfaces.includes(input.surface)
    })
  }

  async getOfferBundle(offerId: string): Promise<{
    offer: typeof commerceOffers.$inferSelect
    product: ProductDetail
    shop: ShopRecord
  }> {
    const rows = await this.db
      .select()
      .from(commerceOffers)
      .where(eq(commerceOffers.id, offerId))
      .limit(1)
    const offer = rows[0]
    if (!offer) throw apiError('COMMERCE_OFFER_NOT_FOUND', 404)
    const product = await this.deps.productService.getProductDetail(offer.productId)
    const shop = await this.deps.shopService.getShopById(offer.shopId)
    if (!shop) throw apiError('SHOP_NOT_FOUND', 404)
    return { offer, product, shop }
  }

  async requireActiveOfferForSurface(offerId: string, surface: CommerceSurface) {
    const bundle = await this.getOfferBundle(offerId)
    if (bundle.offer.status !== 'active' || !isActiveWindow(bundle.offer)) {
      throw apiError('COMMERCE_OFFER_NOT_ACTIVE', 400)
    }
    if (bundle.product.status !== 'active') {
      throw apiError('PRODUCT_NOT_ACTIVE', 400)
    }
    if (bundle.shop.status !== 'active') {
      throw apiError('SHOP_NOT_FOUND', 404)
    }
    const surfaces = normalizeSurfaces(bundle.offer.allowedSurfaces, ['channel', 'dm'])
    if (!surfaces.includes(surface)) {
      throw apiError('COMMERCE_OFFER_SURFACE_NOT_ALLOWED', 403)
    }
    return bundle
  }

  async createDeliverable(input: {
    offerId: string
    productId?: string
    kind?: 'paid_file' | 'message' | 'external' | 'entitlement' | 'community_asset' | 'currency'
    resourceType?: string
    resourceId: string
    senderBuddyUserId?: string | null
    deliveryTiming?: string
    messageTemplateKey?: string | null
    status?: 'active' | 'paused' | 'archived'
    metadata?: Record<string, unknown>
  }) {
    const bundle = await this.getOfferBundle(input.offerId)
    const [deliverable] = await this.db
      .insert(commerceDeliverables)
      .values({
        offerId: input.offerId,
        productId: input.productId ?? bundle.product.id,
        kind: input.kind ?? 'paid_file',
        resourceType: input.resourceType ?? 'workspace_file',
        resourceId: input.resourceId,
        senderBuddyUserId: input.senderBuddyUserId ?? bundle.offer.sellerBuddyUserId,
        deliveryTiming: input.deliveryTiming ?? 'after_purchase',
        messageTemplateKey: input.messageTemplateKey ?? null,
        status: input.status ?? 'active',
        metadata: input.metadata ?? {},
      })
      .returning()
    if (!deliverable) throw apiError('COMMERCE_DELIVERABLE_CREATE_FAILED', 500)
    return deliverable
  }

  async listDeliverablesForOffer(offerId: string) {
    return this.db
      .select()
      .from(commerceDeliverables)
      .where(
        and(eq(commerceDeliverables.offerId, offerId), eq(commerceDeliverables.status, 'active')),
      )
  }
}
