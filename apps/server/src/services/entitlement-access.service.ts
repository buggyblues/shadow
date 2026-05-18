import type { EntitlementDao } from '../dao/entitlement.dao'
import type { Database } from '../db'
import { apiError } from '../lib/api-error'
import type { OAuthActor } from '../security/actor'
import type { EconomyIdempotencyService } from './economy-idempotency.service'

type EntitlementAccessStatus =
  | 'active'
  | 'not_found'
  | 'expired'
  | 'cancelled'
  | 'revoked'
  | 'renewal_failed'
  | 'pending_force_majeure_review'
  | 'inactive'

type EntitlementAccessRecord = {
  id: string
  status: string
  capability: string
  resourceType: string
  resourceId: string
  productId?: string | null
  shopId?: string | null
  orderId?: string | null
  offerId?: string | null
  expiresAt: Date | null
  isActive: boolean
  metadata?: Record<string, unknown> | null
}

function summarize(entitlement: EntitlementAccessRecord | null) {
  if (!entitlement) return null
  return {
    id: entitlement.id,
    status: entitlement.status,
    capability: entitlement.capability,
    resourceType: entitlement.resourceType,
    resourceId: entitlement.resourceId,
    productId: entitlement.productId ?? null,
    shopId: entitlement.shopId ?? null,
    orderId: entitlement.orderId ?? null,
    offerId: entitlement.offerId ?? null,
    expiresAt: entitlement.expiresAt,
  }
}

function accessStatus(entitlement: EntitlementAccessRecord | null): EntitlementAccessStatus {
  if (!entitlement) return 'not_found'
  if (!entitlement.isActive) return 'inactive'
  if (entitlement.status !== 'active') return entitlement.status as EntitlementAccessStatus
  if (entitlement.expiresAt && entitlement.expiresAt.getTime() <= Date.now()) return 'expired'
  return 'active'
}

type ExternalRedemptionRecord = {
  appId: string
  resourceType: string
  resourceId: string
  capability: string
  idempotencyKey: string
  redeemedAt: string
  metadata?: Record<string, unknown>
}

type ExternalCommerceAccessResult = {
  allowed: boolean
  status: EntitlementAccessStatus
  reasonCode: string | null
  resourceType: string
  resourceId: string
  capability: string
  app: { id: string }
  entitlement: ReturnType<typeof summarize>
}

type ExternalCommerceRedeemResult = {
  redeemed: true
  resourceType: string
  resourceId: string
  capability: string
  app: { id: string }
  entitlement: NonNullable<ReturnType<typeof summarize>>
  redemption: ExternalRedemptionRecord
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getExternalRedemptions(
  metadata: Record<string, unknown> | null | undefined,
): ExternalRedemptionRecord[] {
  if (!metadata) return []
  const value = metadata.externalRedemptions
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ExternalRedemptionRecord => {
    return (
      isRecord(item) &&
      typeof item.appId === 'string' &&
      typeof item.resourceType === 'string' &&
      typeof item.resourceId === 'string' &&
      typeof item.capability === 'string' &&
      typeof item.idempotencyKey === 'string' &&
      typeof item.redeemedAt === 'string'
    )
  })
}

function hasMatchingRedemption(
  entitlement: EntitlementAccessRecord,
  input: { appId: string; resourceType: string; resourceId: string; capability: string },
) {
  return getExternalRedemptions(entitlement.metadata).some((record) => {
    return (
      record.appId === input.appId &&
      record.resourceType === input.resourceType &&
      record.resourceId === input.resourceId &&
      record.capability === input.capability
    )
  })
}

export class EntitlementAccessService {
  constructor(
    private deps: {
      db: Database
      entitlementDao: EntitlementDao
      economyIdempotencyService: EconomyIdempotencyService
    },
  ) {}

  async checkResourceAccess(input: {
    userId: string
    resourceType: string
    resourceId: string
    capability?: string
    capabilities?: string[]
    serverId?: string | null
  }) {
    const capabilities = input.capabilities?.length
      ? input.capabilities
      : [input.capability ?? 'use']
    const entitlements = await this.deps.entitlementDao.findResourceEntitlements({
      userId: input.userId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      capabilities,
      serverId: input.serverId,
      limit: 10,
    })
    const active =
      entitlements.find((entitlement) => accessStatus(entitlement) === 'active') ?? null
    const fallback = active ?? entitlements[0] ?? null
    const status = accessStatus(fallback)

    return {
      allowed: status === 'active',
      status,
      reasonCode: status === 'active' ? null : `ENTITLEMENT_${status.toUpperCase()}`,
      entitlement: summarize(fallback),
    }
  }

  async checkOAuthExternalAppAccess(input: {
    actor: OAuthActor
    resourceType?: string
    resourceId?: string
    capability?: string
  }): Promise<ExternalCommerceAccessResult> {
    const resource = this.normalizeOAuthExternalResource(input)
    const access = await this.checkResourceAccess({
      userId: input.actor.userId,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      capability: resource.capability,
    })

    return {
      ...access,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId,
      capability: resource.capability,
      app: { id: input.actor.appId },
    }
  }

  async redeemOAuthExternalAppEntitlement(input: {
    actor: OAuthActor
    idempotencyKey: string
    resourceType?: string
    resourceId?: string
    capability?: string
    metadata?: Record<string, unknown>
  }): Promise<ExternalCommerceRedeemResult> {
    const resource = this.normalizeOAuthExternalResource(input)
    const action = `oauth-commerce-redeem:${input.actor.appId}`
    const cached =
      await this.deps.economyIdempotencyService.getCompleted<ExternalCommerceRedeemResult>({
        actorUserId: input.actor.userId,
        key: input.idempotencyKey,
        action,
      })
    if (cached) return cached

    await this.deps.economyIdempotencyService.begin({
      actorUserId: input.actor.userId,
      key: input.idempotencyKey,
      action,
    })

    try {
      const result = await this.deps.db.transaction(async (tx) => {
        const entitlements = await this.deps.entitlementDao.findResourceEntitlements(
          {
            userId: input.actor.userId,
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            capabilities: [resource.capability],
            limit: 25,
          },
          tx,
        )
        const activeEntitlements = entitlements.filter(
          (entitlement) => accessStatus(entitlement) === 'active',
        )
        const redeemable = activeEntitlements.find(
          (entitlement) =>
            !hasMatchingRedemption(entitlement, {
              appId: input.actor.appId,
              ...resource,
            }),
        )

        if (!redeemable) {
          const reason = activeEntitlements.length
            ? 'EXTERNAL_ENTITLEMENT_ALREADY_REDEEMED'
            : 'EXTERNAL_ENTITLEMENT_NOT_ACTIVE'
          throw apiError(reason, activeEntitlements.length ? 409 : 404, {
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            capability: resource.capability,
          })
        }

        const redemption: ExternalRedemptionRecord = {
          appId: input.actor.appId,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          capability: resource.capability,
          idempotencyKey: input.idempotencyKey,
          redeemedAt: new Date().toISOString(),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        }
        const metadata = {
          ...(redeemable.metadata ?? {}),
          externalRedemptions: [...getExternalRedemptions(redeemable.metadata), redemption],
        }
        const updated = await this.deps.entitlementDao.update(redeemable.id, { metadata }, tx)
        if (!updated) throw apiError('ENTITLEMENT_REDEEM_UPDATE_FAILED', 500)

        const response: ExternalCommerceRedeemResult = {
          redeemed: true,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          capability: resource.capability,
          app: { id: input.actor.appId },
          entitlement: summarize(updated)!,
          redemption,
        }

        await this.deps.economyIdempotencyService.complete(
          {
            actorUserId: input.actor.userId,
            key: input.idempotencyKey,
            action,
            referenceId: updated.id,
            response,
          },
          tx,
        )

        return response
      })

      return result
    } catch (error) {
      const structured = error as { code?: string; message?: string }
      await this.deps.economyIdempotencyService.fail({
        actorUserId: input.actor.userId,
        key: input.idempotencyKey,
        action,
        error: structured.code ?? structured.message ?? 'EXTERNAL_ENTITLEMENT_REDEEM_FAILED',
      })
      throw error
    }
  }

  private normalizeOAuthExternalResource(input: {
    actor: OAuthActor
    resourceType?: string
    resourceId?: string
    capability?: string
  }) {
    const resourceType = input.resourceType ?? 'external_app'
    const resourceOwnerIds = [input.actor.appId, input.actor.appClientId].filter(
      (value): value is string => Boolean(value),
    )
    const resourceId = input.resourceId ?? input.actor.appClientId ?? input.actor.appId
    const capability = input.capability ?? 'use'

    if (resourceType !== 'external_app') {
      throw apiError('OAUTH_COMMERCE_RESOURCE_TYPE_FORBIDDEN', 403, {
        resourceType,
      })
    }
    const ownsResource = resourceOwnerIds.some(
      (ownerId) => resourceId === ownerId || resourceId.startsWith(`${ownerId}:`),
    )
    if (!ownsResource) {
      throw apiError('OAUTH_COMMERCE_RESOURCE_FORBIDDEN', 403, {
        resourceType,
        resourceId,
      })
    }

    return { resourceType, resourceId, capability }
  }
}
