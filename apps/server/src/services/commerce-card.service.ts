import { nanoid } from 'nanoid'
import type { ChannelDao } from '../dao/channel.dao'
import type { ServerDao } from '../dao/server.dao'
import { apiError } from '../lib/api-error'
import type { CommerceOfferService } from './commerce-offer.service'
import { resolveProductEntitlementResource } from './entitlement-resource'

export type CommerceCardTarget = { kind: 'channel'; channelId: string }

export interface CommerceCard {
  id: string
  kind: 'offer'
  offerId: string
  shopId: string
  shopScope: { kind: 'server' | 'user'; id: string }
  productId: string
  skuId?: string
  snapshot: {
    name: string
    summary?: string | null
    imageUrl?: string | null
    shopName?: string | null
    deliveryPromise?: string | null
    price: number
    currency: string
    productType: 'physical' | 'entitlement'
    billingMode?: 'one_time' | 'fixed_duration' | 'subscription'
    durationSeconds?: number | null
    resourceType?: string
    resourceId?: string
    capability?: string
  }
  purchase: { mode: 'direct' | 'select_sku' | 'open_detail' }
}

function normalizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {}
  const json = JSON.stringify(metadata)
  if (json.length > 24_000) {
    throw apiError('MESSAGE_METADATA_TOO_LARGE', 400, { maxBytes: 24_000 })
  }
  const allowedKeys = new Set([
    'agentChain',
    'collaboration',
    'copilotContext',
    'interactive',
    'interactiveResponse',
    'mentions',
    'ccConnectDelivery',
    'shadowDelivery',
    'slashCommand',
    'cards',
    // Deprecated compatibility inputs retained for existing commerce messages.
    // New card-like protocols must use metadata.cards[] and should not add keys here.
    'commerceOfferId',
    'commerceCards',
    'paidFileCards',
    'oauthLinkCards',
    'commerceFulfillment',
    'greeting',
    'custom',
  ])
  const normalized: Record<string, unknown> = {}
  const custom: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (allowedKeys.has(key)) normalized[key] = value
    else custom[key] = value
  }
  if (Object.keys(custom).length > 0) {
    normalized.custom = { ...((normalized.custom as Record<string, unknown>) ?? {}), ...custom }
  }
  return normalized
}

export class CommerceCardService {
  constructor(
    private deps: {
      channelDao: ChannelDao
      serverDao: ServerDao
      commerceOfferService: CommerceOfferService
    },
  ) {}

  private async assertOfferTarget(input: {
    target: CommerceCardTarget
    shop: { scopeKind: 'server' | 'user'; serverId: string | null; ownerUserId: string | null }
    sellerUserId?: string | null
    sellerBuddyUserId?: string | null
  }) {
    const channel = await this.deps.channelDao.findById(input.target.channelId)
    if (!channel) throw apiError('CHANNEL_NOT_FOUND', 404)
    if (channel.kind === 'dm') {
      const sellerIds = [
        input.shop.ownerUserId,
        input.sellerUserId,
        input.sellerBuddyUserId,
      ].filter((id): id is string => Boolean(id))
      const participants = new Set([channel.dmUserAId, channel.dmUserBId].filter(Boolean))
      if (
        input.shop.scopeKind !== 'user' ||
        !sellerIds.some((sellerId) => participants.has(sellerId))
      ) {
        throw apiError('DM_PRODUCT_CARD_REQUIRES_PERSONAL_SHOP', 403)
      }
      return
    }

    const serverId = channel.serverId
    if (!serverId) throw apiError('CHANNEL_NOT_FOUND', 404)
    if (input.shop.scopeKind === 'server') {
      if (!input.shop.serverId || serverId !== input.shop.serverId) {
        throw apiError('SERVER_SHOP_PRODUCT_CHANNEL_SCOPE_MISMATCH', 403)
      }
      return
    }
    const sellerIds = [input.shop.ownerUserId, input.sellerUserId, input.sellerBuddyUserId].filter(
      (id): id is string => Boolean(id),
    )
    const hasSellerInServer = await Promise.all(
      sellerIds.map((sellerId) => this.deps.serverDao.getMember(serverId, sellerId)),
    )
    if (!hasSellerInServer.some(Boolean)) {
      throw apiError('USER_SHOP_PRODUCT_CHANNEL_SCOPE_MISMATCH', 403)
    }
  }

  async buildOfferCard(input: {
    offerId: string
    skuId?: string
    target: CommerceCardTarget
  }): Promise<CommerceCard> {
    const { offer, product, shop } =
      await this.deps.commerceOfferService.requireActiveOfferForSurface(
        input.offerId,
        input.target.kind,
      )
    await this.assertOfferTarget({
      target: input.target,
      shop,
      sellerUserId: offer.sellerUserId,
      sellerBuddyUserId: offer.sellerBuddyUserId,
    })

    const sku = input.skuId ? product.skus.find((item) => item.id === input.skuId) : undefined
    const config = Array.isArray(product.entitlementConfig)
      ? product.entitlementConfig[0]
      : product.entitlementConfig
    const resource = resolveProductEntitlementResource(product)
    const imageUrl = sku?.imageUrl ?? product.media?.[0]?.url ?? null

    return {
      id: nanoid(12),
      kind: 'offer',
      offerId: offer.id,
      shopId: product.shopId,
      shopScope: {
        kind: shop.scopeKind,
        id: shop.scopeKind === 'server' ? shop.serverId! : shop.ownerUserId!,
      },
      productId: product.id,
      skuId: input.skuId,
      snapshot: {
        name: product.name,
        summary: product.summary,
        imageUrl,
        shopName: shop.name,
        deliveryPromise: config?.privilegeDescription ?? product.summary ?? null,
        price: offer.priceOverride ?? sku?.price ?? product.basePrice,
        currency: offer.currency ?? product.currency,
        productType: product.type,
        billingMode: product.billingMode,
        durationSeconds: config?.durationSeconds ?? null,
        resourceType: resource?.resourceType,
        resourceId: resource?.resourceId,
        capability: resource?.capability,
      },
      purchase: { mode: input.skuId || !product.skus?.length ? 'direct' : 'select_sku' },
    }
  }

  async buildProductCard(input: {
    productId: string
    skuId?: string
    target: CommerceCardTarget
  }): Promise<CommerceCard> {
    const offer = await this.deps.commerceOfferService.ensureDefaultOfferForProduct({
      productId: input.productId,
    })
    return this.buildOfferCard({ offerId: offer.id, skuId: input.skuId, target: input.target })
  }

  async normalizeMessageMetadata(
    metadata: Record<string, unknown> | undefined,
    target: CommerceCardTarget,
  ) {
    const normalized = normalizeMetadata(metadata)
    const directOfferId =
      typeof normalized.commerceOfferId === 'string' ? normalized.commerceOfferId : undefined
    const rawCards =
      normalized.commerceCards ??
      (directOfferId ? [{ kind: 'offer', offerId: directOfferId }] : undefined)
    if (rawCards === undefined) return normalized
    if (!Array.isArray(rawCards) || rawCards.length > 3) {
      throw apiError('INVALID_COMMERCE_CARDS_METADATA', 400, { maxCards: 3 })
    }
    const cards: CommerceCard[] = []
    for (const raw of rawCards) {
      if (!raw || typeof raw !== 'object') {
        throw apiError('INVALID_COMMERCE_CARD', 400)
      }
      const record = raw as Record<string, unknown>
      if (record.kind === 'offer' && typeof record.offerId === 'string') {
        cards.push(
          await this.buildOfferCard({
            offerId: record.offerId,
            skuId: typeof record.skuId === 'string' ? record.skuId : undefined,
            target,
          }),
        )
        continue
      }
      if (record.kind !== 'product' || typeof record.productId !== 'string') {
        throw apiError('INVALID_PRODUCT_COMMERCE_CARD', 400)
      }
      cards.push(
        await this.buildProductCard({
          productId: record.productId,
          skuId: typeof record.skuId === 'string' ? record.skuId : undefined,
          target,
        }),
      )
    }
    return { ...normalized, commerceCards: cards }
  }

  async inferMessageMetadata(input: {
    metadata: Record<string, unknown> | undefined
    target: CommerceCardTarget
    authorId: string
    content: string
  }) {
    const normalized = normalizeMetadata(input.metadata)
    if (normalized.commerceCards !== undefined || typeof normalized.commerceOfferId === 'string') {
      return this.normalizeMessageMetadata(normalized, input.target)
    }
    return normalized
  }
}
