import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Database } from '../db'
import { orders } from '../db/schema'
import { apiError } from '../lib/api-error'
import type { EntitlementService } from './entitlement.service'
import type { LedgerService } from './ledger.service'
import type { NotificationTriggerService } from './notification-trigger.service'
import type { ProductService } from './product.service'

function addSeconds(from: Date, seconds?: number | null) {
  return seconds ? new Date(from.getTime() + seconds * 1000) : null
}

function firstConfig(product: { entitlementConfig: unknown }) {
  const config = Array.isArray(product.entitlementConfig)
    ? product.entitlementConfig[0]
    : product.entitlementConfig
  if (!config || typeof config !== 'object') return null
  return config as { durationSeconds?: number | null; renewalPeriodSeconds?: number | null }
}

export class EntitlementRenewalService {
  constructor(
    private deps: {
      db: Database
      entitlementService: EntitlementService
      productService: ProductService
      ledgerService: LedgerService
      notificationTriggerService: NotificationTriggerService
    },
  ) {}

  async processDueRenewals(limit = 100) {
    const due = await this.deps.entitlementService.getDueRenewals(new Date(), limit)
    const results: Array<{ entitlementId: string; success: boolean; error?: string }> = []
    for (const entitlement of due) {
      try {
        await this.renew(entitlement.id)
        results.push({ entitlementId: entitlement.id, success: true })
      } catch (err) {
        await this.deps.entitlementService.markRenewalFailed(entitlement.id)
        await this.deps.notificationTriggerService.triggerCommerceRenewalFailed({
          userId: entitlement.userId,
          entitlementId: entitlement.id,
          expiresAt: entitlement.expiresAt,
        })
        results.push({
          entitlementId: entitlement.id,
          success: false,
          error: (err as { code?: string })?.code ?? 'RENEWAL_FAILED',
        })
      }
    }
    return results
  }

  private async renew(entitlementId: string) {
    const entitlement = await this.deps.entitlementService.getEntitlement(entitlementId)
    if (!entitlement.productId || !entitlement.shopId) {
      throw apiError('ENTITLEMENT_NOT_RENEWABLE', 400)
    }
    const product = await this.deps.productService.getProductById(entitlement.productId)
    if (product.type !== 'entitlement' || product.billingMode !== 'subscription') {
      throw apiError('PRODUCT_NOT_SUBSCRIPTION_ENTITLEMENT', 400)
    }
    const config = firstConfig(product)
    const renewalSeconds = config?.renewalPeriodSeconds ?? config?.durationSeconds
    const nextExpiresAt = addSeconds(entitlement.expiresAt ?? new Date(), renewalSeconds)
    if (!nextExpiresAt) throw apiError('SUBSCRIPTION_RENEWAL_PERIOD_MISSING', 400)

    const orderNo = `SH${Date.now().toString(36).toUpperCase()}${nanoid(6).toUpperCase()}`
    const price = product.basePrice

    return this.deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(orders)
        .values({
          orderNo,
          shopId: entitlement.shopId!,
          buyerId: entitlement.userId,
          totalAmount: price,
          status: 'completed',
          paidAt: new Date(),
          completedAt: new Date(),
        })
        .returning()
      if (!created) throw apiError('RENEWAL_ORDER_CREATE_FAILED', 500)
      await this.deps.ledgerService.debit(
        {
          userId: entitlement.userId,
          amount: price,
          type: 'purchase',
          referenceId: created.id,
          referenceType: 'order',
          note: `自动续费 - ${product.name}`,
        },
        tx,
      )
      await this.deps.entitlementService.extendEntitlement(
        entitlement.id,
        nextExpiresAt,
        created.id,
        tx,
      )
      await tx.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, created.id))
      return created
    })
  }
}
