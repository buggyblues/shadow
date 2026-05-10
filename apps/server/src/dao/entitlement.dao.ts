import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { commerceOffers, entitlements, products, shops, users, workspaceNodes } from '../db/schema'

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export class EntitlementDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findActiveByUser(userId: string, serverId: string) {
    return this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.serverId, serverId),
          eq(entitlements.isActive, true),
          sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`,
        ),
      )
  }

  async findById(id: string) {
    const r = await this.db.select().from(entitlements).where(eq(entitlements.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByUser(userId: string) {
    return this.db.select().from(entitlements).where(eq(entitlements.userId, userId))
  }

  async findByUserWithDetails(userId: string) {
    const rows = await this.db
      .select({
        entitlement: entitlements,
        shop: {
          id: shops.id,
          scopeKind: shops.scopeKind,
          serverId: shops.serverId,
          ownerUserId: shops.ownerUserId,
          name: shops.name,
          logoUrl: shops.logoUrl,
        },
        product: {
          id: products.id,
          shopId: products.shopId,
          name: products.name,
          summary: products.summary,
          type: products.type,
          basePrice: products.basePrice,
          currency: products.currency,
          billingMode: products.billingMode,
          entitlementConfig: products.entitlementConfig,
        },
        offer: {
          id: commerceOffers.id,
          shopId: commerceOffers.shopId,
          productId: commerceOffers.productId,
          priceOverride: commerceOffers.priceOverride,
          currency: commerceOffers.currency,
          status: commerceOffers.status,
        },
        paidFile: {
          id: workspaceNodes.id,
          name: workspaceNodes.name,
          mime: workspaceNodes.mime,
          sizeBytes: workspaceNodes.sizeBytes,
          previewUrl: workspaceNodes.previewUrl,
        },
      })
      .from(entitlements)
      .leftJoin(shops, eq(entitlements.shopId, shops.id))
      .leftJoin(products, eq(entitlements.productId, products.id))
      .leftJoin(commerceOffers, eq(entitlements.offerId, commerceOffers.id))
      .leftJoin(
        workspaceNodes,
        and(
          eq(entitlements.resourceType, 'workspace_file'),
          sql`${entitlements.resourceId} = ${workspaceNodes.id}::text`,
        ),
      )
      .where(eq(entitlements.userId, userId))
      .orderBy(desc(entitlements.createdAt))

    return rows.map((row) => ({
      ...row.entitlement,
      shop: row.shop?.id ? row.shop : null,
      product: row.product?.id ? row.product : null,
      offer: row.offer?.id ? row.offer : null,
      paidFile: row.paidFile?.id ? row.paidFile : null,
    }))
  }

  async findByShop(shopId: string, opts?: { limit?: number; offset?: number }) {
    const rows = await this.db
      .select({
        entitlement: entitlements,
        buyer: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
        product: {
          id: products.id,
          shopId: products.shopId,
          name: products.name,
          summary: products.summary,
          type: products.type,
          basePrice: products.basePrice,
          currency: products.currency,
          billingMode: products.billingMode,
          entitlementConfig: products.entitlementConfig,
        },
        offer: {
          id: commerceOffers.id,
          shopId: commerceOffers.shopId,
          productId: commerceOffers.productId,
          priceOverride: commerceOffers.priceOverride,
          currency: commerceOffers.currency,
          status: commerceOffers.status,
        },
        paidFile: {
          id: workspaceNodes.id,
          name: workspaceNodes.name,
          mime: workspaceNodes.mime,
          sizeBytes: workspaceNodes.sizeBytes,
          previewUrl: workspaceNodes.previewUrl,
        },
      })
      .from(entitlements)
      .leftJoin(users, eq(entitlements.userId, users.id))
      .leftJoin(products, eq(entitlements.productId, products.id))
      .leftJoin(commerceOffers, eq(entitlements.offerId, commerceOffers.id))
      .leftJoin(
        workspaceNodes,
        and(
          eq(entitlements.resourceType, 'workspace_file'),
          sql`${entitlements.resourceId} = ${workspaceNodes.id}::text`,
        ),
      )
      .where(eq(entitlements.shopId, shopId))
      .orderBy(desc(entitlements.createdAt))
      .limit(opts?.limit ?? 100)
      .offset(opts?.offset ?? 0)

    return rows.map((row) => ({
      ...row.entitlement,
      buyer: row.buyer?.id ? row.buyer : null,
      product: row.product?.id ? row.product : null,
      offer: row.offer?.id ? row.offer : null,
      paidFile: row.paidFile?.id ? row.paidFile : null,
    }))
  }

  async hasResourceEntitlement(input: {
    userId: string
    resourceType: string
    resourceId: string
    capability?: string
    serverId?: string | null
  }) {
    const conditions = [
      eq(entitlements.userId, input.userId),
      eq(entitlements.resourceType, input.resourceType),
      eq(entitlements.resourceId, input.resourceId),
      eq(entitlements.capability, input.capability ?? 'use'),
      eq(entitlements.isActive, true),
      sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`,
    ]
    if (input.serverId) conditions.push(eq(entitlements.serverId, input.serverId))

    const r = await this.db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(and(...conditions))
      .limit(1)
    return r.length > 0
  }

  async findActiveResourceEntitlement(input: {
    userId: string
    resourceType: string
    resourceId: string
    capability?: string
    serverId?: string | null
  }) {
    const conditions = [
      eq(entitlements.userId, input.userId),
      eq(entitlements.resourceType, input.resourceType),
      eq(entitlements.resourceId, input.resourceId),
      eq(entitlements.capability, input.capability ?? 'use'),
      eq(entitlements.isActive, true),
      sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`,
    ]
    if (input.serverId) conditions.push(eq(entitlements.serverId, input.serverId))

    const r = await this.db
      .select()
      .from(entitlements)
      .where(and(...conditions))
      .limit(1)
    return r[0] ?? null
  }

  async findResourceEntitlements(input: {
    userId: string
    resourceType: string
    resourceId: string
    capabilities?: string[]
    serverId?: string | null
    limit?: number
  }) {
    const conditions = [
      eq(entitlements.userId, input.userId),
      eq(entitlements.resourceType, input.resourceType),
      eq(entitlements.resourceId, input.resourceId),
    ]
    if (input.capabilities?.length) {
      conditions.push(inArray(entitlements.capability, input.capabilities))
    }
    if (input.serverId) conditions.push(eq(entitlements.serverId, input.serverId))

    return this.db
      .select()
      .from(entitlements)
      .where(and(...conditions))
      .orderBy(desc(entitlements.createdAt))
      .limit(input.limit ?? 10)
  }

  async create(data: {
    userId: string
    serverId?: string | null
    shopId?: string | null
    orderId?: string
    productId?: string
    offerId?: string | null
    scopeKind?: 'server' | 'user'
    resourceType: string
    resourceId: string
    capability?: string
    status?:
      | 'active'
      | 'expired'
      | 'cancelled'
      | 'revoked'
      | 'renewal_failed'
      | 'pending_force_majeure_review'
    startsAt?: Date
    expiresAt?: Date
    nextRenewalAt?: Date | null
    metadata?: Record<string, unknown>
  }) {
    const r = await this.db.insert(entitlements).values(data).returning()
    return r[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      renewalOrderId: string | null
      status:
        | 'active'
        | 'expired'
        | 'cancelled'
        | 'revoked'
        | 'renewal_failed'
        | 'pending_force_majeure_review'
      isActive: boolean
      expiresAt: Date | null
      nextRenewalAt: Date | null
      cancelledAt: Date | null
      revokedAt: Date | null
      cancelReason: string | null
      revocationReason: string | null
      metadata: Record<string, unknown>
    }>,
    db: DbLike = this.db,
  ) {
    const r = await db
      .update(entitlements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(entitlements.id, id))
      .returning()
    return r[0] ?? null
  }

  async revoke(id: string, reason?: string) {
    return this.update(id, {
      isActive: false,
      status: 'revoked',
      revokedAt: new Date(),
      revocationReason: reason ?? null,
    })
  }

  async revokeByOrder(orderId: string) {
    await this.db
      .update(entitlements)
      .set({ isActive: false, status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(entitlements.orderId, orderId))
  }

  async findDueRenewals(now = new Date(), limit = 100) {
    return this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.status, 'active'),
          eq(entitlements.isActive, true),
          lte(entitlements.nextRenewalAt, now),
        ),
      )
      .limit(limit)
  }
}
