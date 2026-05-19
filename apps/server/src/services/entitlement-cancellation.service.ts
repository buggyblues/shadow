import type { OrderDao } from '../dao/order.dao'
import { apiError } from '../lib/api-error'
import { type Actor, actorFromUserId } from '../security/actor'
import type { EconomyAuditService } from './economy-audit.service'
import type { EconomyPolicyService } from './economy-policy.service'
import type { EntitlementService } from './entitlement.service'
import type { LedgerService } from './ledger.service'
import type { NotificationTriggerService } from './notification-trigger.service'
import type { ProductService } from './product.service'
import type { SettlementService } from './settlement.service'

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function refundByNaturalDay(input: {
  paidAmount: number
  startsAt: Date
  expiresAt: Date
  now: Date
}) {
  const start = startOfUtcDay(input.startsAt)
  const end = startOfUtcDay(input.expiresAt)
  const now = startOfUtcDay(input.now)
  const totalDays = Math.max(Math.ceil((end - start) / 86_400_000), 1)
  const remainingDays = Math.max(Math.ceil((end - now) / 86_400_000), 0)
  return Math.floor((input.paidAmount * Math.min(remainingDays, totalDays)) / totalDays)
}

export class EntitlementCancellationService {
  constructor(
    private deps: {
      entitlementService: EntitlementService
      orderDao: OrderDao
      productService: ProductService
      ledgerService: LedgerService
      economyPolicyService: EconomyPolicyService
      economyAuditService: EconomyAuditService
      notificationTriggerService: NotificationTriggerService
      settlementService: SettlementService
    },
  ) {}

  async cancel(input: {
    actorUserId: string
    entitlementId: string
    reason?: string
    actor?: Actor
  }) {
    const actor = input.actor ?? actorFromUserId(input.actorUserId)
    const entitlement = await this.deps.entitlementService.getEntitlement(input.entitlementId)
    if (entitlement.userId !== input.actorUserId) {
      throw apiError('ENTITLEMENT_OWNER_MISMATCH', 403)
    }
    if (!entitlement.isActive && entitlement.status === 'cancelled') {
      return { entitlement, refundAmount: 0, alreadyCancelled: true }
    }
    if (!entitlement.isActive || entitlement.status !== 'active') {
      throw apiError('ENTITLEMENT_NOT_ACTIVE', 400)
    }

    const order = entitlement.orderId
      ? await this.deps.orderDao.findById(entitlement.orderId)
      : null
    const product = entitlement.productId
      ? await this.deps.productService.getProductById(entitlement.productId)
      : null
    const metadata = (entitlement.metadata ?? {}) as Record<string, unknown>
    const paidAmount =
      typeof metadata.refundBaseAmount === 'number'
        ? metadata.refundBaseAmount
        : (order?.totalAmount ?? 0)
    const refundAmount =
      entitlement.expiresAt && paidAmount > 0
        ? refundByNaturalDay({
            paidAmount,
            startsAt: entitlement.startsAt,
            expiresAt: entitlement.expiresAt,
            now: new Date(),
          })
        : 0

    const cancelled = await this.deps.entitlementService.cancelEntitlement(
      entitlement.id,
      input.reason ?? 'user_cancelled',
    )

    if (refundAmount > 0) {
      await this.deps.economyPolicyService.authorize({
        actor,
        action: 'wallet.refund',
        resource: { kind: 'entitlement', id: entitlement.id },
        scope: { kind: 'wallet', id: entitlement.userId },
        dataClass: 'financial',
        targetUserId: entitlement.userId,
      })
      await this.deps.ledgerService.credit({
        userId: entitlement.userId,
        amount: refundAmount,
        type: 'refund',
        referenceId: entitlement.orderId,
        referenceType: 'order',
        note: `虚拟服务取消退款 - ${product?.name ?? entitlement.id}`,
      })
      await this.deps.economyAuditService.record({
        actor,
        action: 'wallet.refund',
        resource: { kind: 'entitlement', id: entitlement.id },
        scope: { kind: 'wallet', id: entitlement.userId },
        request: { reason: input.reason },
        result: 'succeeded',
        metadata: { refundAmount, orderId: entitlement.orderId },
      })
      if (entitlement.orderId) {
        await this.deps.settlementService.reverseLinesForSource({
          sourceType: 'order',
          sourceId: entitlement.orderId,
          reason: 'entitlement_refund',
        })
      }
    }

    await this.deps.notificationTriggerService.triggerCommerceSubscriptionCancelled({
      userId: entitlement.userId,
      entitlementId: entitlement.id,
      refundAmount,
      productName: product?.name,
    })

    return { entitlement: cancelled, refundAmount }
  }

  async cancelRenewal(input: {
    actorUserId: string
    entitlementId: string
    reason?: string
    actor?: Actor
  }) {
    const actor = input.actor ?? actorFromUserId(input.actorUserId)
    const entitlement = await this.deps.entitlementService.getEntitlement(input.entitlementId)
    if (entitlement.userId !== input.actorUserId) {
      throw apiError('ENTITLEMENT_OWNER_MISMATCH', 403)
    }
    if (!entitlement.isActive || entitlement.status !== 'active') {
      throw apiError('ENTITLEMENT_NOT_ACTIVE', 400)
    }
    if (!entitlement.nextRenewalAt) {
      return { entitlement, refundAmount: 0, renewalCancelled: true, alreadyCancelled: true }
    }

    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'entitlement.cancel_renewal',
      resource: { kind: 'entitlement', id: entitlement.id },
      scope: { kind: 'wallet', id: entitlement.userId },
      dataClass: 'financial',
      targetUserId: entitlement.userId,
    })

    const product = entitlement.productId
      ? await this.deps.productService.getProductById(entitlement.productId)
      : null
    const cancelled = await this.deps.entitlementService.cancelRenewal(
      entitlement.id,
      input.reason ?? 'cancel_renewal',
    )

    await this.deps.economyAuditService.record({
      actor,
      action: 'entitlement.cancel_renewal',
      resource: { kind: 'entitlement', id: entitlement.id },
      scope: { kind: 'wallet', id: entitlement.userId },
      request: { reason: input.reason },
      result: 'succeeded',
      metadata: {
        productId: entitlement.productId,
        previousNextRenewalAt: entitlement.nextRenewalAt,
      },
    })

    await this.deps.notificationTriggerService.triggerCommerceSubscriptionCancelled({
      userId: entitlement.userId,
      entitlementId: entitlement.id,
      refundAmount: 0,
      productName: product?.name,
    })

    return { entitlement: cancelled, refundAmount: 0, renewalCancelled: true }
  }
}
