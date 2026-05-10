import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  communityAssetDefinitions,
  communityAssetGrants,
  communityAssetTransferLogs,
} from '../db/schema'
import { apiError } from '../lib/api-error'
import { type Actor, actorFromUserId } from '../security/actor'
import type { EconomyAuditService } from './economy-audit.service'
import type { EconomyPolicyService } from './economy-policy.service'

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]
type AssetDefinitionStatus = 'draft' | 'active' | 'paused' | 'archived'
type AssetType =
  | 'badge'
  | 'gift'
  | 'coupon'
  | 'service_ticket'
  | 'collectible'
  | 'content_pass'
  | 'reward'

function addDays(days?: number | null) {
  return days && days > 0 ? new Date(Date.now() + days * 86_400_000) : null
}

export class CommunityAssetService {
  constructor(
    private deps: {
      db: Database
      economyPolicyService: EconomyPolicyService
      economyAuditService: EconomyAuditService
    },
  ) {}

  async createDefinition(input: {
    actor: Actor
    createdBy: string
    issuerKind: 'platform' | 'server' | 'user' | 'shop'
    issuerId?: string | null
    shopId?: string | null
    assetType: AssetType
    name: string
    description?: string | null
    imageUrl?: string | null
    giftable?: boolean
    transferable?: boolean
    consumable?: boolean
    revocable?: boolean
    expiresAfterDays?: number | null
    status?: AssetDefinitionStatus
    metadata?: Record<string, unknown>
  }) {
    await this.deps.economyPolicyService.authorize({
      actor: input.actor,
      action: 'asset.definition.create',
      resource: { kind: 'community_asset_definition' },
      scope: { kind: input.issuerKind, id: input.issuerId ?? input.shopId },
      dataClass: 'commercial',
      targetUserId: input.createdBy,
    })
    const [definition] = await this.deps.db
      .insert(communityAssetDefinitions)
      .values({
        issuerKind: input.issuerKind,
        issuerId: input.issuerId ?? null,
        shopId: input.shopId ?? null,
        assetType: input.assetType,
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        giftable: input.giftable ?? false,
        transferable: input.transferable ?? false,
        consumable: input.consumable ?? false,
        revocable: input.revocable ?? true,
        expiresAfterDays: input.expiresAfterDays ?? null,
        status: input.status ?? 'draft',
        metadata: input.metadata ?? {},
        createdBy: input.createdBy,
      })
      .returning()
    if (!definition) throw apiError('COMMUNITY_ASSET_DEFINITION_CREATE_FAILED', 500)

    await this.deps.economyAuditService.record({
      actor: input.actor,
      action: 'asset.definition.create',
      resource: { kind: 'community_asset_definition', id: definition.id },
      scope: { kind: input.issuerKind, id: input.issuerId ?? input.shopId },
      result: 'succeeded',
      metadata: { assetType: input.assetType, status: definition.status },
    })
    return definition
  }

  async listUserAssets(userId: string) {
    return this.deps.db
      .select({ grant: communityAssetGrants, definition: communityAssetDefinitions })
      .from(communityAssetGrants)
      .innerJoin(
        communityAssetDefinitions,
        eq(communityAssetDefinitions.id, communityAssetGrants.definitionId),
      )
      .where(eq(communityAssetGrants.ownerUserId, userId))
  }

  async listDefinitionsForShop(shopId: string) {
    return this.deps.db
      .select()
      .from(communityAssetDefinitions)
      .where(eq(communityAssetDefinitions.shopId, shopId))
  }

  async updateDefinition(input: {
    actor: Actor
    definitionId: string
    shopId: string
    updatedBy: string
    name?: string
    description?: string | null
    imageUrl?: string | null
    giftable?: boolean
    transferable?: boolean
    consumable?: boolean
    revocable?: boolean
    expiresAfterDays?: number | null
    status?: AssetDefinitionStatus
    metadata?: Record<string, unknown>
  }) {
    await this.deps.economyPolicyService.authorize({
      actor: input.actor,
      action: 'asset.definition.update',
      resource: { kind: 'community_asset_definition', id: input.definitionId },
      scope: { kind: 'shop', id: input.shopId },
      dataClass: 'commercial',
      targetUserId: input.updatedBy,
    })

    const [definition] = await this.deps.db
      .update(communityAssetDefinitions)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.giftable !== undefined ? { giftable: input.giftable } : {}),
        ...(input.transferable !== undefined ? { transferable: input.transferable } : {}),
        ...(input.consumable !== undefined ? { consumable: input.consumable } : {}),
        ...(input.revocable !== undefined ? { revocable: input.revocable } : {}),
        ...(input.expiresAfterDays !== undefined
          ? { expiresAfterDays: input.expiresAfterDays }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityAssetDefinitions.id, input.definitionId),
          eq(communityAssetDefinitions.shopId, input.shopId),
        ),
      )
      .returning()
    if (!definition) throw apiError('COMMUNITY_ASSET_DEFINITION_NOT_FOUND', 404)

    await this.deps.economyAuditService.record({
      actor: input.actor,
      action: 'asset.definition.update',
      resource: { kind: 'community_asset_definition', id: definition.id },
      scope: { kind: 'shop', id: input.shopId },
      result: 'succeeded',
      metadata: { status: definition.status },
    })
    return definition
  }

  async getGrant(grantId: string, db: DbLike = this.deps.db) {
    const [row] = await db
      .select({ grant: communityAssetGrants, definition: communityAssetDefinitions })
      .from(communityAssetGrants)
      .innerJoin(
        communityAssetDefinitions,
        eq(communityAssetDefinitions.id, communityAssetGrants.definitionId),
      )
      .where(eq(communityAssetGrants.id, grantId))
      .limit(1)
    return row ?? null
  }

  private async getGrantByTransferLog(idempotencyKey: string, db: DbLike = this.deps.db) {
    const [existingLog] = await db
      .select()
      .from(communityAssetTransferLogs)
      .where(eq(communityAssetTransferLogs.idempotencyKey, idempotencyKey))
      .limit(1)
    if (!existingLog?.grantId) return null

    const [grant] = await db
      .select()
      .from(communityAssetGrants)
      .where(eq(communityAssetGrants.id, existingLog.grantId))
      .limit(1)
    return grant ?? null
  }

  async grantToUser(
    input: {
      actor: Actor
      ownerUserId: string
      definitionId: string
      sourceKind: string
      sourceId?: string | null
      quantity?: number
      idempotencyKey: string
      metadata?: Record<string, unknown>
    },
    db: DbLike = this.deps.db,
  ) {
    const quantity = Math.max(Math.floor(input.quantity ?? 1), 1)
    const existingGrant = await this.getGrantByTransferLog(input.idempotencyKey, db)
    if (existingGrant) return existingGrant

    const [definition] = await db
      .select()
      .from(communityAssetDefinitions)
      .where(eq(communityAssetDefinitions.id, input.definitionId))
      .limit(1)
    if (!definition || definition.status !== 'active') {
      throw apiError('COMMUNITY_ASSET_DEFINITION_NOT_ACTIVE', 400)
    }

    await this.deps.economyPolicyService.authorize({
      actor: input.actor,
      action: 'asset.grant',
      resource: { kind: 'community_asset_definition', id: input.definitionId },
      scope: { kind: 'community_asset', id: input.definitionId },
      dataClass: 'commercial',
      requiredScope: 'economy:assets:write',
      targetUserId: input.ownerUserId,
    })

    const [grant] = await db
      .insert(communityAssetGrants)
      .values({
        definitionId: input.definitionId,
        ownerUserId: input.ownerUserId,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId ?? null,
        quantity,
        remainingQuantity: quantity,
        expiresAt: addDays(definition.expiresAfterDays),
        metadata: input.metadata ?? {},
      })
      .returning()
    if (!grant) throw apiError('COMMUNITY_ASSET_GRANT_FAILED', 500)

    await db.insert(communityAssetTransferLogs).values({
      definitionId: input.definitionId,
      grantId: grant.id,
      toUserId: input.ownerUserId,
      quantity,
      action: 'grant',
      referenceType: input.sourceKind,
      referenceId: input.sourceId ?? null,
      idempotencyKey: input.idempotencyKey,
    })

    await this.deps.economyAuditService.record(
      {
        actor: input.actor,
        action: 'asset.grant',
        resource: { kind: 'community_asset_grant', id: grant.id },
        scope: { kind: 'community_asset_definition', id: input.definitionId },
        idempotencyKey: input.idempotencyKey,
        result: 'succeeded',
        metadata: { ownerUserId: input.ownerUserId, quantity },
      },
      db,
    )

    return grant
  }

  async transferGrant(
    input: {
      actorUserId: string
      recipientUserId: string
      grantId: string
      quantity?: number
      referenceType: string
      referenceId: string
      idempotencyKey: string
      actor?: Actor
    },
    db: DbLike = this.deps.db,
  ) {
    const quantity = Math.max(Math.floor(input.quantity ?? 1), 1)
    const existingGrant = await this.getGrantByTransferLog(input.idempotencyKey, db)
    if (existingGrant) return existingGrant

    const row = await this.getGrant(input.grantId, db)
    if (!row) throw apiError('COMMUNITY_ASSET_GRANT_NOT_FOUND', 404)
    if (row.grant.ownerUserId !== input.actorUserId) {
      throw apiError('COMMUNITY_ASSET_OWNER_MISMATCH', 403)
    }
    if (!row.definition.giftable) throw apiError('COMMUNITY_ASSET_NOT_GIFTABLE', 400)
    if (row.grant.status !== 'active' || row.grant.remainingQuantity < quantity) {
      throw apiError('COMMUNITY_ASSET_GRANT_UNAVAILABLE', 400)
    }
    const actor = input.actor ?? actorFromUserId(input.actorUserId)
    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'asset.transfer',
      resource: { kind: 'community_asset_grant', id: input.grantId },
      scope: { kind: 'community_asset_definition', id: row.definition.id },
      dataClass: 'commercial',
      requiredScope: 'economy:assets:write',
      targetUserId: input.actorUserId,
    })

    const updated = await db
      .update(communityAssetGrants)
      .set({
        remainingQuantity: sql`${communityAssetGrants.remainingQuantity} - ${quantity}`,
        status: row.grant.remainingQuantity === quantity ? 'consumed' : 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityAssetGrants.id, input.grantId),
          eq(communityAssetGrants.ownerUserId, input.actorUserId),
          eq(communityAssetGrants.status, 'active'),
          sql`${communityAssetGrants.remainingQuantity} >= ${quantity}`,
        ),
      )
      .returning({ id: communityAssetGrants.id })
    if (updated.length === 0) throw apiError('COMMUNITY_ASSET_GRANT_CONFLICT', 409)

    const [newGrant] = await db
      .insert(communityAssetGrants)
      .values({
        definitionId: row.definition.id,
        ownerUserId: input.recipientUserId,
        sourceKind: 'gift',
        sourceId: input.referenceId,
        quantity,
        remainingQuantity: quantity,
        expiresAt: row.grant.expiresAt,
        metadata: row.grant.metadata,
      })
      .returning()
    if (!newGrant) throw apiError('COMMUNITY_ASSET_GIFT_GRANT_FAILED', 500)

    await db.insert(communityAssetTransferLogs).values({
      definitionId: row.definition.id,
      grantId: newGrant.id,
      fromUserId: input.actorUserId,
      toUserId: input.recipientUserId,
      quantity,
      action: 'gift',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
    })
    await this.deps.economyAuditService.record(
      {
        actor,
        action: 'asset.transfer',
        resource: { kind: 'community_asset_grant', id: newGrant.id },
        scope: { kind: 'community_asset_definition', id: row.definition.id },
        idempotencyKey: input.idempotencyKey,
        result: 'succeeded',
        metadata: {
          fromGrantId: input.grantId,
          fromUserId: input.actorUserId,
          toUserId: input.recipientUserId,
          quantity,
        },
      },
      db,
    )

    return newGrant
  }

  private async mutateGrantStatus(input: {
    actor: Actor
    actorUserId: string
    grantId: string
    fromStatuses: Array<'active' | 'locked'>
    toStatus: 'active' | 'locked' | 'revoked' | 'expired'
    action: 'asset.lock' | 'asset.unlock' | 'asset.revoke' | 'asset.expire'
    transferAction: 'lock' | 'unlock' | 'revoke' | 'expire'
    idempotencyKey: string
    referenceType: string
    referenceId: string
    zeroRemaining?: boolean
    db?: DbLike
  }) {
    const db = input.db ?? this.deps.db
    const existingGrant = await this.getGrantByTransferLog(input.idempotencyKey, db)
    if (existingGrant) return existingGrant

    const row = await this.getGrant(input.grantId, db)
    if (!row) throw apiError('COMMUNITY_ASSET_GRANT_NOT_FOUND', 404)
    if (row.grant.ownerUserId !== input.actorUserId) {
      throw apiError('COMMUNITY_ASSET_OWNER_MISMATCH', 403)
    }
    if (!input.fromStatuses.includes(row.grant.status as 'active' | 'locked')) {
      throw apiError('COMMUNITY_ASSET_GRANT_UNAVAILABLE', 400)
    }

    await this.deps.economyPolicyService.authorize({
      actor: input.actor,
      action: input.action,
      resource: { kind: 'community_asset_grant', id: input.grantId },
      scope: { kind: 'community_asset_definition', id: row.definition.id },
      dataClass: 'commercial',
      requiredScope: 'economy:assets:write',
      targetUserId: input.actorUserId,
    })

    const [updated] = await db
      .update(communityAssetGrants)
      .set({
        status: input.toStatus,
        ...(input.zeroRemaining ? { remainingQuantity: 0 } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityAssetGrants.id, input.grantId),
          eq(communityAssetGrants.ownerUserId, input.actorUserId),
          inArray(communityAssetGrants.status, input.fromStatuses),
        ),
      )
      .returning()
    if (!updated) throw apiError('COMMUNITY_ASSET_GRANT_CONFLICT', 409)

    await db.insert(communityAssetTransferLogs).values({
      definitionId: row.definition.id,
      grantId: input.grantId,
      fromUserId: input.actorUserId,
      quantity: row.grant.remainingQuantity,
      action: input.transferAction,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
    })
    await this.deps.economyAuditService.record(
      {
        actor: input.actor,
        action: input.action,
        resource: { kind: 'community_asset_grant', id: input.grantId },
        scope: { kind: 'community_asset_definition', id: row.definition.id },
        idempotencyKey: input.idempotencyKey,
        result: 'succeeded',
        metadata: {
          fromStatus: row.grant.status,
          toStatus: input.toStatus,
          quantity: row.grant.remainingQuantity,
        },
      },
      db,
    )
    return updated
  }

  async lockGrant(input: {
    actorUserId: string
    grantId: string
    idempotencyKey: string
    referenceType?: string
    referenceId?: string
    actor?: Actor
  }) {
    return this.mutateGrantStatus({
      actor: input.actor ?? actorFromUserId(input.actorUserId),
      actorUserId: input.actorUserId,
      grantId: input.grantId,
      fromStatuses: ['active'],
      toStatus: 'locked',
      action: 'asset.lock',
      transferAction: 'lock',
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType ?? 'asset_grant',
      referenceId: input.referenceId ?? input.grantId,
    })
  }

  async unlockGrant(input: {
    actorUserId: string
    grantId: string
    idempotencyKey: string
    referenceType?: string
    referenceId?: string
    actor?: Actor
  }) {
    return this.mutateGrantStatus({
      actor: input.actor ?? actorFromUserId(input.actorUserId),
      actorUserId: input.actorUserId,
      grantId: input.grantId,
      fromStatuses: ['locked'],
      toStatus: 'active',
      action: 'asset.unlock',
      transferAction: 'unlock',
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType ?? 'asset_grant',
      referenceId: input.referenceId ?? input.grantId,
    })
  }

  async revokeGrant(input: {
    actorUserId: string
    grantId: string
    idempotencyKey: string
    reason?: string
    actor?: Actor
  }) {
    return this.mutateGrantStatus({
      actor: input.actor ?? actorFromUserId(input.actorUserId),
      actorUserId: input.actorUserId,
      grantId: input.grantId,
      fromStatuses: ['active', 'locked'],
      toStatus: 'revoked',
      action: 'asset.revoke',
      transferAction: 'revoke',
      idempotencyKey: input.idempotencyKey,
      referenceType: 'asset_revoke',
      referenceId: input.reason ?? input.grantId,
      zeroRemaining: true,
    })
  }

  async expireDueGrants(input: { actor: Actor; now?: Date; limit?: number }) {
    await this.deps.economyPolicyService.authorize({
      actor: input.actor,
      action: 'asset.expire',
      resource: { kind: 'community_asset_grant' },
      scope: { kind: 'community_asset_grant' },
      dataClass: 'commercial',
      requiredScope: 'economy:assets:write',
    })
    const now = input.now ?? new Date()
    const due = await this.deps.db
      .select()
      .from(communityAssetGrants)
      .where(
        and(
          inArray(communityAssetGrants.status, ['active', 'locked']),
          lte(communityAssetGrants.expiresAt, now),
        ),
      )
      .limit(Math.min(Math.max(input.limit ?? 500, 1), 500))

    const expired = []
    for (const grant of due) {
      const [updated] = await this.deps.db
        .update(communityAssetGrants)
        .set({ status: 'expired', remainingQuantity: 0, updatedAt: new Date() })
        .where(
          and(
            eq(communityAssetGrants.id, grant.id),
            inArray(communityAssetGrants.status, ['active', 'locked']),
          ),
        )
        .returning()
      if (!updated) continue
      await this.deps.db.insert(communityAssetTransferLogs).values({
        definitionId: grant.definitionId,
        grantId: grant.id,
        fromUserId: grant.ownerUserId,
        quantity: grant.remainingQuantity,
        action: 'expire',
        referenceType: 'asset_expiry',
        referenceId: grant.expiresAt?.toISOString() ?? grant.id,
        idempotencyKey: `asset-expire:${grant.id}:${grant.expiresAt?.getTime() ?? now.getTime()}`,
      })
      await this.deps.economyAuditService.record({
        actor: input.actor,
        action: 'asset.expire',
        resource: { kind: 'community_asset_grant', id: grant.id },
        scope: { kind: 'community_asset_definition', id: grant.definitionId },
        result: 'succeeded',
        metadata: { ownerUserId: grant.ownerUserId, expiresAt: grant.expiresAt },
      })
      expired.push(updated)
    }
    return expired
  }

  async consume(input: {
    actorUserId: string
    grantId: string
    idempotencyKey: string
    actor?: Actor
  }) {
    const existingGrant = await this.getGrantByTransferLog(input.idempotencyKey)
    if (existingGrant) return existingGrant

    const row = await this.getGrant(input.grantId)
    if (!row) throw apiError('COMMUNITY_ASSET_GRANT_NOT_FOUND', 404)
    if (row.grant.ownerUserId !== input.actorUserId) {
      throw apiError('COMMUNITY_ASSET_OWNER_MISMATCH', 403)
    }
    if (!row.definition.consumable) throw apiError('COMMUNITY_ASSET_NOT_CONSUMABLE', 400)
    const actor = input.actor ?? actorFromUserId(input.actorUserId)
    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'asset.consume',
      resource: { kind: 'community_asset_grant', id: input.grantId },
      scope: { kind: 'community_asset_definition', id: row.definition.id },
      dataClass: 'commercial',
      requiredScope: 'economy:assets:write',
      targetUserId: input.actorUserId,
    })

    return this.deps.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(communityAssetGrants)
        .set({ status: 'consumed', remainingQuantity: 0, updatedAt: new Date() })
        .where(
          and(
            eq(communityAssetGrants.id, input.grantId),
            eq(communityAssetGrants.ownerUserId, input.actorUserId),
            eq(communityAssetGrants.status, 'active'),
          ),
        )
        .returning()
      if (!updated) throw apiError('COMMUNITY_ASSET_GRANT_UNAVAILABLE', 400)
      await tx.insert(communityAssetTransferLogs).values({
        definitionId: row.definition.id,
        grantId: input.grantId,
        fromUserId: input.actorUserId,
        quantity: row.grant.remainingQuantity,
        action: 'consume',
        referenceType: 'asset_grant',
        referenceId: input.grantId,
        idempotencyKey: input.idempotencyKey,
      })
      await this.deps.economyAuditService.record(
        {
          actor,
          action: 'asset.consume',
          resource: { kind: 'community_asset_grant', id: input.grantId },
          scope: { kind: 'community_asset_definition', id: row.definition.id },
          idempotencyKey: input.idempotencyKey,
          result: 'succeeded',
          metadata: { quantity: row.grant.remainingQuantity },
        },
        tx,
      )
      return updated
    })
  }
}
