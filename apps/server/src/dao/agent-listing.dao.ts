import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { agentListings, rentalContracts } from '../db/schema'
import { agents } from '../db/schema/agents'

export class AgentListingDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const r = await this.db.select().from(agentListings).where(eq(agentListings.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByOwnerId(ownerId: string, opts?: { limit?: number; offset?: number }) {
    return this.db
      .select()
      .from(agentListings)
      .where(eq(agentListings.ownerId, ownerId))
      .orderBy(desc(agentListings.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
  }

  async findByAgentId(agentId: string) {
    return this.db
      .select()
      .from(agentListings)
      .where(eq(agentListings.agentId, agentId))
      .orderBy(desc(agentListings.createdAt))
  }

  /** Helper: get IDs of listings currently actively rented */
  async getActivelyRentedListingIds(): Promise<string[]> {
    const rows = await this.db
      .select({ listingId: rentalContracts.listingId })
      .from(rentalContracts)
      .where(eq(rentalContracts.status, 'active'))
    return rows.map((r) => r.listingId)
  }

  /** Browse active listings on marketplace with search, sort, and filter */
  async browse(opts?: {
    keyword?: string
    deviceTier?: string
    osType?: string
    tags?: string[]
    sortBy?: 'popular' | 'newest' | 'price-asc' | 'price-desc'
    limit?: number
    offset?: number
  }) {
    const now = new Date()
    const conditions = [
      eq(agentListings.listingStatus, 'active'),
      eq(agentListings.isListed, true),
      or(lte(agentListings.availableFrom, now), sql`${agentListings.availableFrom} IS NULL`),
      or(gte(agentListings.availableUntil, now), sql`${agentListings.availableUntil} IS NULL`),
      sql`EXISTS (
        SELECT 1 FROM ${agents}
        WHERE ${agents.id} = ${agentListings.agentId}
          AND ${agents.config}->>'buddyMode' = 'shareable'
      )`,
    ]

    // Exclude listings that are currently being rented
    const rentedIds = await this.getActivelyRentedListingIds()
    if (rentedIds.length > 0) {
      conditions.push(
        sql`${agentListings.id} NOT IN (${sql.join(
          rentedIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
    }

    if (opts?.keyword) {
      conditions.push(
        or(
          ilike(agentListings.title, `%${opts.keyword}%`),
          ilike(agentListings.description, `%${opts.keyword}%`),
        )!,
      )
    }

    if (opts?.deviceTier) {
      const tiers = opts.deviceTier
        .split(',')
        .filter(Boolean) as (typeof agentListings.deviceTier.enumValues)[number][]
      if (tiers.length === 1) {
        conditions.push(eq(agentListings.deviceTier, tiers[0]!))
      } else if (tiers.length > 1) {
        conditions.push(inArray(agentListings.deviceTier, tiers))
      }
    }

    if (opts?.osType) {
      const types = opts.osType
        .split(',')
        .filter(Boolean) as (typeof agentListings.osType.enumValues)[number][]
      if (types.length === 1) {
        conditions.push(eq(agentListings.osType, types[0]!))
      } else if (types.length > 1) {
        conditions.push(inArray(agentListings.osType, types))
      }
    }

    const getOrderBy = () => {
      switch (opts?.sortBy) {
        case 'newest':
          return desc(agentListings.createdAt)
        case 'price-asc':
          return agentListings.hourlyRate
        case 'price-desc':
          return desc(agentListings.hourlyRate)
        default:
          // Popular = weighted by rentalCount + viewCount
          return desc(sql`${agentListings.rentalCount} * 10 + ${agentListings.viewCount}`)
      }
    }
    const orderBy = getOrderBy()

    return this.db
      .select()
      .from(agentListings)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(opts?.limit ?? 20)
      .offset(opts?.offset ?? 0)
  }

  /** Count active listings matching filters (for pagination) */
  async countBrowse(opts?: { keyword?: string; deviceTier?: string; osType?: string }) {
    const now = new Date()
    const conditions = [
      eq(agentListings.listingStatus, 'active'),
      eq(agentListings.isListed, true),
      or(lte(agentListings.availableFrom, now), sql`${agentListings.availableFrom} IS NULL`),
      or(gte(agentListings.availableUntil, now), sql`${agentListings.availableUntil} IS NULL`),
      sql`EXISTS (
        SELECT 1 FROM ${agents}
        WHERE ${agents.id} = ${agentListings.agentId}
          AND ${agents.config}->>'buddyMode' = 'shareable'
      )`,
    ]

    // Exclude listings that are currently being rented
    const rentedIds = await this.getActivelyRentedListingIds()
    if (rentedIds.length > 0) {
      conditions.push(
        sql`${agentListings.id} NOT IN (${sql.join(
          rentedIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
    }

    if (opts?.keyword) {
      conditions.push(
        or(
          ilike(agentListings.title, `%${opts.keyword}%`),
          ilike(agentListings.description, `%${opts.keyword}%`),
        )!,
      )
    }

    if (opts?.deviceTier) {
      const tiers = opts.deviceTier
        .split(',')
        .filter(Boolean) as (typeof agentListings.deviceTier.enumValues)[number][]
      if (tiers.length === 1) {
        conditions.push(eq(agentListings.deviceTier, tiers[0]!))
      } else if (tiers.length > 1) {
        conditions.push(inArray(agentListings.deviceTier, tiers))
      }
    }

    if (opts?.osType) {
      const types = opts.osType
        .split(',')
        .filter(Boolean) as (typeof agentListings.osType.enumValues)[number][]
      if (types.length === 1) {
        conditions.push(eq(agentListings.osType, types[0]!))
      } else if (types.length > 1) {
        conditions.push(inArray(agentListings.osType, types))
      }
    }

    const r = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentListings)
      .where(and(...conditions))
    return r[0]?.count ?? 0
  }

  async create(data: {
    ownerId: string
    agentId?: string
    title: string
    description?: string
    skills?: string[]
    guidelines?: string
    deviceTier?: 'high_end' | 'mid_range' | 'low_end'
    osType?: 'macos' | 'windows' | 'linux'
    deviceInfo?: Record<string, string>
    softwareTools?: string[]
    hourlyRate: number
    dailyRate?: number
    monthlyRate?: number
    tokenFeePassthrough?: boolean
    depositAmount?: number
    listingStatus?: 'draft' | 'active'
    availableFrom?: Date
    availableUntil?: Date | null
    tags?: string[]
  }) {
    const r = await this.db.insert(agentListings).values(data).returning()
    return r[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      title: string
      description: string | null
      skills: string[]
      guidelines: string | null
      deviceTier: 'high_end' | 'mid_range' | 'low_end'
      osType: 'macos' | 'windows' | 'linux'
      deviceInfo: Record<string, string>
      softwareTools: string[]
      hourlyRate: number
      dailyRate: number
      monthlyRate: number
      tokenFeePassthrough: boolean
      depositAmount: number
      listingStatus: 'draft' | 'active' | 'paused' | 'expired' | 'closed'
      isListed: boolean
      availableFrom: Date | null
      availableUntil: Date | null
      tags: string[]
    }>,
  ) {
    const r = await this.db
      .update(agentListings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentListings.id, id))
      .returning()
    return r[0] ?? null
  }

  async incrementViewCount(id: string) {
    await this.db
      .update(agentListings)
      .set({ viewCount: sql`${agentListings.viewCount} + 1` })
      .where(eq(agentListings.id, id))
  }

  async incrementRentalCount(id: string) {
    await this.db
      .update(agentListings)
      .set({ rentalCount: sql`${agentListings.rentalCount} + 1` })
      .where(eq(agentListings.id, id))
  }

  /** Scoped delete by userId (owner) and listing id */
  async deleteByUserIdAndId(userId: string, id: string) {
    await this.db
      .delete(agentListings)
      .where(and(eq(agentListings.id, id), eq(agentListings.ownerId, userId)))
  }

  /** Find active (listed) listings that reference any of the given agent IDs */
  async findActiveByAgentIds(agentIds: string[]) {
    if (agentIds.length === 0) return []
    return this.db
      .select()
      .from(agentListings)
      .where(
        and(inArray(agentListings.agentId, agentIds), eq(agentListings.listingStatus, 'active')),
      )
  }

  /** Find all listings (any status) that reference any of the given agent IDs */
  async findByAgentIds(agentIds: string[]) {
    if (agentIds.length === 0) return []
    return this.db.select().from(agentListings).where(inArray(agentListings.agentId, agentIds))
  }
}
