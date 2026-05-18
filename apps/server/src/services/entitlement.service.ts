import type { EntitlementDao } from '../dao/entitlement.dao'
import type { Database } from '../db'
import { apiError } from '../lib/api-error'

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * EntitlementService — manages purchased resource capabilities.
 * Linked to orders and products for traceability.
 */
export class EntitlementService {
  constructor(private deps: { entitlementDao: EntitlementDao }) {}

  async getUserEntitlements(userId: string, serverId: string) {
    return this.deps.entitlementDao.findActiveByUser(userId, serverId)
  }

  async getAllUserEntitlements(userId: string) {
    return this.deps.entitlementDao.findByUserWithDetails(userId)
  }

  async getEntitlementDetail(id: string) {
    const entitlement = await this.deps.entitlementDao.findByIdWithDetails(id)
    if (!entitlement) throw apiError('ENTITLEMENT_NOT_FOUND', 404)
    return entitlement
  }

  async getShopEntitlements(shopId: string, opts?: { limit?: number; offset?: number }) {
    return this.deps.entitlementDao.findByShop(shopId, opts)
  }

  async getEntitlement(id: string) {
    const entitlement = await this.deps.entitlementDao.findById(id)
    if (!entitlement) throw apiError('ENTITLEMENT_NOT_FOUND', 404)
    return entitlement
  }

  async checkResourceEntitlement(input: {
    userId: string
    resourceType: string
    resourceId: string
    capability?: string
    serverId?: string | null
  }) {
    return this.deps.entitlementDao.hasResourceEntitlement(input)
  }

  async grantEntitlement(data: {
    userId: string
    serverId?: string | null
    shopId?: string | null
    orderId?: string
    productId?: string
    scopeKind?: 'server' | 'user'
    resourceType: string
    resourceId: string
    capability?: string
    startsAt?: Date
    expiresAt?: Date
    nextRenewalAt?: Date | null
    metadata?: Record<string, unknown>
  }) {
    return this.deps.entitlementDao.create(data)
  }

  async revokeEntitlement(id: string, reason?: string) {
    return this.deps.entitlementDao.revoke(id, reason)
  }

  async cancelEntitlement(id: string, reason?: string) {
    return this.deps.entitlementDao.update(id, {
      status: 'cancelled',
      isActive: false,
      cancelledAt: new Date(),
      cancelReason: reason ?? null,
    })
  }

  async cancelRenewal(id: string, reason?: string) {
    const entitlement = await this.getEntitlement(id)
    return this.deps.entitlementDao.update(id, {
      nextRenewalAt: null,
      cancelReason: reason ?? 'cancel_renewal',
      metadata: {
        ...(entitlement.metadata ?? {}),
        renewalCancelledAt: new Date().toISOString(),
        renewalCancelReason: reason ?? 'cancel_renewal',
      },
    })
  }

  async markRenewalFailed(id: string) {
    return this.deps.entitlementDao.update(id, {
      status: 'renewal_failed',
      nextRenewalAt: null,
    })
  }

  async markPendingForceMajeureReview(id: string) {
    return this.deps.entitlementDao.update(id, {
      status: 'pending_force_majeure_review',
    })
  }

  async extendEntitlement(id: string, expiresAt: Date, renewalOrderId?: string, db?: DbLike) {
    return this.deps.entitlementDao.update(
      id,
      {
        status: 'active',
        isActive: true,
        expiresAt,
        nextRenewalAt: expiresAt,
        renewalOrderId: renewalOrderId ?? null,
      },
      db,
    )
  }

  async getDueRenewals(now = new Date(), limit = 100) {
    return this.deps.entitlementDao.findDueRenewals(now, limit)
  }

  async revokeByOrder(orderId: string) {
    return this.deps.entitlementDao.revokeByOrder(orderId)
  }
}
