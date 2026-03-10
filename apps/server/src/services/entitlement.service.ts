import type { EntitlementDao } from '../dao/entitlement.dao'

/**
 * EntitlementService — manages user entitlements / privileges.
 * Entitlements can be channel access, speaking rights, app access, roles, etc.
 * Linked to orders and products for traceability.
 */
export class EntitlementService {
  constructor(private deps: { entitlementDao: EntitlementDao }) {}

  async getUserEntitlements(userId: string, serverId: string) {
    return this.deps.entitlementDao.findActiveByUser(userId, serverId)
  }

  async checkEntitlement(userId: string, serverId: string, type: string, targetId: string) {
    return this.deps.entitlementDao.hasEntitlement(userId, serverId, type, targetId)
  }

  async grantEntitlement(data: {
    userId: string
    serverId: string
    orderId?: string
    productId?: string
    type: 'channel_access' | 'channel_speak' | 'app_access' | 'custom_role' | 'custom'
    targetId?: string
    expiresAt?: Date
  }) {
    return this.deps.entitlementDao.create(data)
  }

  async revokeEntitlement(id: string) {
    return this.deps.entitlementDao.revoke(id)
  }

  async revokeByOrder(orderId: string) {
    return this.deps.entitlementDao.revokeByOrder(orderId)
  }
}
