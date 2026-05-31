import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Database } from '../db'
import {
  agents,
  commerceFulfillmentJobs,
  commerceIdempotencyKeys,
  entitlements,
  orderItems,
  orders,
  products,
  skus,
} from '../db/schema'
import { apiError } from '../lib/api-error'
import { type Actor, actorFromUserId } from '../security/actor'
import type { CommerceFulfillmentService } from './commerce-fulfillment.service'
import type { CommerceOfferService } from './commerce-offer.service'
import type { EconomyAuditService } from './economy-audit.service'
import type { EconomyPolicyService } from './economy-policy.service'
import type { EntitlementProvisionerService } from './entitlement-provisioner.service'
import { resolveProductEntitlementResource } from './entitlement-resource'
import type { LedgerService } from './ledger.service'
import type { NotificationTriggerService } from './notification-trigger.service'
import type { ProductService } from './product.service'
import type { SettlementService } from './settlement.service'

function addSeconds(seconds?: number | null) {
  return seconds ? new Date(Date.now() + seconds * 1000) : null
}

function entitlementConfigs(product: { entitlementConfig?: unknown }) {
  if (Array.isArray(product.entitlementConfig)) return product.entitlementConfig
  return product.entitlementConfig ? [product.entitlementConfig] : []
}

function productAllowsRepeatPurchase(product: { type?: string; entitlementConfig?: unknown }) {
  if (product.type !== 'entitlement') return true
  const configs = entitlementConfigs(product)
  return (
    configs.length === 0 ||
    configs.every((config) => {
      if (!config || typeof config !== 'object') return true
      return (config as { repeatable?: boolean }).repeatable !== false
    })
  )
}

function isDesktopPetPackTag(tag: string) {
  return ['desktop-pet-pack', 'desktop_pet_pack', '虾豆桌面宠物'].includes(tag)
}

const DESKTOP_PET_PACK_ASSET_TYPE = 'desktop_pet_pack'

function productDesktopPetPackMetadata(product: {
  tags?: string[] | null
}): Record<string, unknown> | null {
  const tags = product.tags ?? []
  if (!tags.some(isDesktopPetPackTag)) return null
  return {
    kind: 'desktop_pet_pack',
    schemaVersion: 'shadow.desktopPet.pack.v1',
    marketplaceTag: 'desktop-pet-pack',
  }
}

export class EntitlementPurchaseService {
  constructor(
    private deps: {
      db: Database
      productService: ProductService
      ledgerService: LedgerService
      notificationTriggerService: NotificationTriggerService
      entitlementProvisionerService: EntitlementProvisionerService
      commerceOfferService: CommerceOfferService
      commerceFulfillmentService: CommerceFulfillmentService
      economyPolicyService: EconomyPolicyService
      economyAuditService: EconomyAuditService
      settlementService: SettlementService
    },
  ) {}

  async purchase(input: {
    buyerId: string
    shopId: string
    productId: string
    skuId?: string
    idempotencyKey: string
    actor?: Actor
  }) {
    const product = await this.deps.productService.getProductById(input.productId)
    if (product.shopId !== input.shopId) {
      throw apiError('PRODUCT_SHOP_MISMATCH', 400)
    }
    const offer = await this.deps.commerceOfferService.ensureDefaultOfferForProduct({
      productId: input.productId,
    })
    return this.purchaseOffer({
      buyerId: input.buyerId,
      offerId: offer.id,
      skuId: input.skuId,
      idempotencyKey: input.idempotencyKey,
      actor: input.actor,
    })
  }

  async purchaseOffer(input: {
    buyerId: string
    offerId: string
    skuId?: string
    idempotencyKey: string
    destination?: { kind: 'channel'; id: string }
    actor?: Actor
  }) {
    if (!input.idempotencyKey || input.idempotencyKey.length > 200) {
      throw apiError('IDEMPOTENCY_KEY_REQUIRED', 400, { maxLength: 200 })
    }

    const actor = input.actor ?? actorFromUserId(input.buyerId)
    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'offer.purchase',
      resource: { kind: 'offer', id: input.offerId },
      scope: input.destination
        ? { kind: input.destination.kind, id: input.destination.id }
        : { kind: 'offer', id: input.offerId },
      dataClass: 'financial',
      targetUserId: input.buyerId,
    })

    const existing = await this.deps.db
      .select()
      .from(commerceIdempotencyKeys)
      .where(
        and(
          eq(commerceIdempotencyKeys.actorUserId, input.buyerId),
          eq(commerceIdempotencyKeys.key, input.idempotencyKey),
          eq(commerceIdempotencyKeys.action, 'entitlement.purchase'),
        ),
      )
      .limit(1)
    if (existing[0]?.status === 'completed') return existing[0].response
    if (existing[0]?.status === 'started') {
      throw apiError('PURCHASE_IN_PROGRESS', 409)
    }

    const { offer, product, shop } = input.destination
      ? await this.deps.commerceOfferService.requireActiveOfferForSurface(
          input.offerId,
          input.destination.kind,
        )
      : await this.deps.commerceOfferService.getOfferBundle(input.offerId)
    if (offer.status !== 'active') throw apiError('COMMERCE_OFFER_NOT_ACTIVE', 400)
    if (product.status !== 'active' || product.type !== 'entitlement') {
      throw apiError('PRODUCT_NOT_ENTITLEMENT_PURCHASABLE', 400)
    }
    if (!shop || shop.status !== 'active') {
      throw apiError('SHOP_NOT_FOUND', 404)
    }
    const validatedResource = await this.deps.entitlementProvisionerService.validateProductConfig({
      product,
      shop,
    })

    const sku = input.skuId ? product.skus.find((item) => item.id === input.skuId) : undefined
    if (input.skuId && (!sku || !sku.isActive)) {
      throw apiError('SKU_NOT_AVAILABLE', 400)
    }
    const price = offer.priceOverride ?? sku?.price ?? product.basePrice
    const productImageUrl =
      sku?.imageUrl ?? product.media?.[0]?.thumbnailUrl ?? product.media?.[0]?.url ?? null
    const productAssetType = product.tags?.find(isDesktopPetPackTag)
      ? DESKTOP_PET_PACK_ASSET_TYPE
      : (product.tags?.find((tag) =>
          [
            'badge',
            'gift',
            'coupon',
            'service_ticket',
            'collectible',
            'content_pass',
            'reward',
          ].includes(tag),
        ) ?? null)
    const desktopPetPack = productDesktopPetPackMetadata(product)
    const settlementUserId = await this.resolveSettlementUserId({
      buyerId: input.buyerId,
      sellerBuddyUserId: offer.sellerBuddyUserId,
      sellerUserId: offer.sellerUserId,
      shopOwnerUserId: shop.ownerUserId,
    })
    const entitlementResource = resolveProductEntitlementResource(product)
    if (!entitlementResource) {
      throw apiError('ENTITLEMENT_PRODUCT_CONFIG_MISSING', 400)
    }
    const grantsInstantly = entitlementResource.resourceType !== 'service'
    const { config } = entitlementResource
    const durationSeconds = config.durationSeconds ?? config.renewalPeriodSeconds ?? null
    const expiresAt = addSeconds(durationSeconds)
    const nextRenewalAt = product.billingMode === 'subscription' ? expiresAt : null
    const orderNo = `SH${Date.now().toString(36).toUpperCase()}${nanoid(6).toUpperCase()}`
    const deliverables = await this.deps.commerceOfferService.listDeliverablesForOffer(offer.id)

    const result = await this.deps.db.transaction(async (tx) => {
      const insertedKeys = await tx
        .insert(commerceIdempotencyKeys)
        .values({
          actorUserId: input.buyerId,
          key: input.idempotencyKey,
          action: 'entitlement.purchase',
          status: 'started',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing()
        .returning({ id: commerceIdempotencyKeys.id })
      if (insertedKeys.length === 0) {
        throw apiError('PURCHASE_IN_PROGRESS', 409)
      }

      if (!productAllowsRepeatPurchase(product)) {
        const existingEntitlement = await tx
          .select({ id: entitlements.id })
          .from(entitlements)
          .where(
            and(
              eq(entitlements.userId, input.buyerId),
              eq(entitlements.productId, product.id),
              eq(entitlements.isActive, true),
              eq(entitlements.status, 'active'),
              sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`,
            ),
          )
          .limit(1)
        if (existingEntitlement[0]) {
          throw apiError('PRODUCT_ALREADY_PURCHASED', 409, { productId: product.id })
        }
      }

      if (sku) {
        const stockRows = await tx
          .update(skus)
          .set({ stock: sql`${skus.stock} - 1`, updatedAt: new Date() })
          .where(and(eq(skus.id, sku.id), sql`${skus.stock} >= 1`))
          .returning({ id: skus.id })
        if (stockRows.length === 0) {
          throw apiError('INSUFFICIENT_STOCK', 400)
        }
      }

      const paidAt = new Date()
      const [order] = await tx
        .insert(orders)
        .values({
          orderNo,
          shopId: shop.id,
          buyerId: input.buyerId,
          totalAmount: price,
          status: grantsInstantly ? 'completed' : 'paid',
          paidAt,
          completedAt: grantsInstantly ? paidAt : undefined,
        })
        .returning()
      if (!order) throw apiError('ORDER_CREATE_FAILED', 500)

      await this.deps.ledgerService.debit(
        {
          userId: input.buyerId,
          amount: price,
          type: 'purchase',
          referenceId: order.id,
          referenceType: 'order',
          note: `购买虚拟服务 - 订单 ${orderNo}`,
        },
        tx,
      )
      if (settlementUserId && grantsInstantly) {
        await this.deps.settlementService.createLine(
          {
            sellerUserId: settlementUserId,
            shopId: shop.id,
            sourceType: 'order',
            sourceId: order.id,
            grossAmount: price,
          },
          tx,
        )
      }

      await this.deps.economyAuditService.record(
        {
          actor,
          action: 'commerce.offer.purchase',
          resource: { kind: 'order', id: order.id },
          scope: { kind: 'offer', id: offer.id },
          idempotencyKey: input.idempotencyKey,
          request: {
            offerId: input.offerId,
            skuId: input.skuId,
            destination: input.destination,
          },
          result: 'succeeded',
          metadata: { price, productId: product.id, shopId: shop.id },
        },
        tx,
      )

      await tx.insert(orderItems).values({
        orderId: order.id,
        productId: product.id,
        skuId: sku?.id,
        productName: product.name,
        specValues: sku?.specValues ?? [],
        price,
        quantity: 1,
        imageUrl: sku?.imageUrl ?? product.media?.[0]?.url,
      })

      const [entitlement] = await tx
        .insert(entitlements)
        .values({
          userId: input.buyerId,
          serverId: validatedResource.serverId ?? shop.serverId,
          shopId: shop.id,
          orderId: order.id,
          productId: product.id,
          offerId: offer.id,
          scopeKind: shop.scopeKind,
          resourceType: entitlementResource.resourceType,
          resourceId: entitlementResource.resourceId,
          capability: entitlementResource.capability,
          expiresAt: expiresAt ?? undefined,
          nextRenewalAt: nextRenewalAt ?? undefined,
          metadata: {
            billingMode: product.billingMode,
            paidAmount: price,
            refundBaseAmount: price,
            offerId: offer.id,
            productImageUrl,
            productAssetType,
            productTags: product.tags ?? [],
            ...(desktopPetPack ? { desktopPetPack } : {}),
          },
        })
        .returning()
      if (!entitlement) throw apiError('ENTITLEMENT_CREATE_FAILED', 500)

      const fulfillmentJobs = []
      for (const deliverable of deliverables) {
        const requiresDestination = ['paid_file', 'message', 'external'].includes(deliverable.kind)
        if (requiresDestination && !input.destination) continue

        const [job] = await tx
          .insert(commerceFulfillmentJobs)
          .values({
            orderId: order.id,
            entitlementId: entitlement.id,
            deliverableId: deliverable.id,
            buyerId: input.buyerId,
            destinationKind: input.destination?.kind,
            destinationId: input.destination?.id,
            senderBuddyUserId: deliverable.senderBuddyUserId ?? offer.sellerBuddyUserId,
          })
          .returning()
        if (job) fulfillmentJobs.push(job)
      }

      await tx
        .update(products)
        .set({ salesCount: sql`${products.salesCount} + 1`, updatedAt: new Date() })
        .where(eq(products.id, product.id))

      const response = {
        order: { id: order.id, orderNo: order.orderNo, status: order.status, totalAmount: price },
        entitlement,
        fulfillmentJobs,
        nextAction: deliverables.some(
          (deliverable) =>
            deliverable.kind === 'paid_file' && deliverable.resourceType === 'workspace_file',
        )
          ? 'open_paid_file'
          : 'view_entitlement',
      }

      await tx
        .update(commerceIdempotencyKeys)
        .set({
          status: 'completed',
          referenceId: order.id,
          response,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(commerceIdempotencyKeys.actorUserId, input.buyerId),
            eq(commerceIdempotencyKeys.key, input.idempotencyKey),
            eq(commerceIdempotencyKeys.action, 'entitlement.purchase'),
          ),
        )

      return response
    })

    const provisioned = await this.deps.entitlementProvisionerService.provision(
      result.entitlement.id,
    )
    const provisionedResult = {
      ...result,
      entitlement: provisioned.entitlement,
      provisioning: provisioned.provisioning,
    }

    await this.deps.db
      .update(commerceIdempotencyKeys)
      .set({
        response: provisionedResult,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commerceIdempotencyKeys.actorUserId, input.buyerId),
          eq(commerceIdempotencyKeys.key, input.idempotencyKey),
          eq(commerceIdempotencyKeys.action, 'entitlement.purchase'),
        ),
      )

    await this.deps.notificationTriggerService.triggerCommercePurchaseCompleted({
      userId: input.buyerId,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      productName: product.name,
      entitlementId: result.entitlement.id,
    })

    if (result.fulfillmentJobs.length > 0) {
      const jobs = await this.deps.commerceFulfillmentService.processJobs(
        result.fulfillmentJobs.map((job) => job.id),
      )
      return { ...provisionedResult, fulfillmentJobs: jobs }
    }

    return provisionedResult
  }

  private async resolveSettlementUserId(input: {
    buyerId: string
    sellerBuddyUserId?: string | null
    sellerUserId?: string | null
    shopOwnerUserId?: string | null
  }) {
    const shopOwnerPayoutUserId = await this.resolveAgentOwnerUserId(input.shopOwnerUserId)
    if (shopOwnerPayoutUserId) {
      return shopOwnerPayoutUserId
    }

    const sellerBuddyPayoutUserId = await this.resolveAgentOwnerUserId(input.sellerBuddyUserId)
    if (sellerBuddyPayoutUserId) {
      return sellerBuddyPayoutUserId
    }

    const sellerUserId = input.sellerUserId ?? input.shopOwnerUserId
    if (!sellerUserId) return null
    return sellerUserId
  }

  private async resolveAgentOwnerUserId(userId?: string | null) {
    if (!userId) return null

    const agentRows = await this.deps.db
      .select({ ownerId: agents.ownerId })
      .from(agents)
      .where(eq(agents.userId, userId))
      .limit(1)
    return agentRows[0]?.ownerId ?? null
  }
}
