import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { clawListings } from '../db/schema'

export class ClawListingDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const r = await this.db.select().from(clawListings).where(eq(clawListings.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByOwnerId(ownerId: string, opts?: { limit?: number; offset?: number }) {
    return this.db
      .select()
      .from(clawListings)
      .where(eq(clawListings.ownerId, ownerId))
      .orderBy(desc(clawListings.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
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
      eq(clawListings.listingStatus, 'active'),
      eq(clawListings.isListed, true),
      or(lte(clawListings.availableFrom, now), sql`${clawListings.availableFrom} IS NULL`),
      or(gte(clawListings.availableUntil, now), sql`${clawListings.availableUntil} IS NULL`),
    ]

    if (opts?.keyword) {
      conditions.push(
        or(
          ilike(clawListings.title, `%${opts.keyword}%`),
          ilike(clawListings.description, `%${opts.keyword}%`),
        )!,
      )
    }

    if (opts?.deviceTier) {
      const tiers = opts.deviceTier
        .split(',')
        .filter(Boolean) as (typeof clawListings.deviceTier.enumValues)[number][]
      if (tiers.length === 1) {
        conditions.push(eq(clawListings.deviceTier, tiers[0]!))
      } else if (tiers.length > 1) {
        conditions.push(inArray(clawListings.deviceTier, tiers))
      }
    }

    if (opts?.osType) {
      const types = opts.osType
        .split(',')
        .filter(Boolean) as (typeof clawListings.osType.enumValues)[number][]
      if (types.length === 1) {
        conditions.push(eq(clawListings.osType, types[0]!))
      } else if (types.length > 1) {
        conditions.push(inArray(clawListings.osType, types))
      }
    }

    const getOrderBy = () => {
      switch (opts?.sortBy) {
        case 'newest':
          return desc(clawListings.createdAt)
        case 'price-asc':
          return clawListings.hourlyRate
        case 'price-desc':
          return desc(clawListings.hourlyRate)
        default:
          // Popular = weighted by rentalCount + viewCount
          return desc(sql`${clawListings.rentalCount} * 10 + ${clawListings.viewCount}`)
      }
    }
    const orderBy = getOrderBy()

    return this.db
      .select()
      .from(clawListings)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(opts?.limit ?? 20)
      .offset(opts?.offset ?? 0)
  }

  /** Count active listings matching filters (for pagination) */
  async countBrowse(opts?: { keyword?: string; deviceTier?: string; osType?: string }) {
    const now = new Date()
    const conditions = [
      eq(clawListings.listingStatus, 'active'),
      eq(clawListings.isListed, true),
      or(lte(clawListings.availableFrom, now), sql`${clawListings.availableFrom} IS NULL`),
      or(gte(clawListings.availableUntil, now), sql`${clawListings.availableUntil} IS NULL`),
    ]

    if (opts?.keyword) {
      conditions.push(
        or(
          ilike(clawListings.title, `%${opts.keyword}%`),
          ilike(clawListings.description, `%${opts.keyword}%`),
        )!,
      )
    }

    if (opts?.deviceTier) {
      const tiers = opts.deviceTier
        .split(',')
        .filter(Boolean) as (typeof clawListings.deviceTier.enumValues)[number][]
      if (tiers.length === 1) {
        conditions.push(eq(clawListings.deviceTier, tiers[0]!))
      } else if (tiers.length > 1) {
        conditions.push(inArray(clawListings.deviceTier, tiers))
      }
    }

    if (opts?.osType) {
      const types = opts.osType
        .split(',')
        .filter(Boolean) as (typeof clawListings.osType.enumValues)[number][]
      if (types.length === 1) {
        conditions.push(eq(clawListings.osType, types[0]!))
      } else if (types.length > 1) {
        conditions.push(inArray(clawListings.osType, types))
      }
    }

    const r = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(clawListings)
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
    const r = await this.db.insert(clawListings).values(data).returning()
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
      .update(clawListings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clawListings.id, id))
      .returning()
    return r[0] ?? null
  }

  async incrementViewCount(id: string) {
    await this.db
      .update(clawListings)
      .set({ viewCount: sql`${clawListings.viewCount} + 1` })
      .where(eq(clawListings.id, id))
  }

  async incrementRentalCount(id: string) {
    await this.db
      .update(clawListings)
      .set({ rentalCount: sql`${clawListings.rentalCount} + 1` })
      .where(eq(clawListings.id, id))
  }

  async delete(id: string) {
    await this.db.delete(clawListings).where(eq(clawListings.id, id))
  }

  /** Find active (listed) listings that reference any of the given agent IDs */
  async findActiveByAgentIds(agentIds: string[]) {
    if (agentIds.length === 0) return []
    return this.db
      .select()
      .from(clawListings)
      .where(and(inArray(clawListings.agentId, agentIds), eq(clawListings.listingStatus, 'active')))
  }

  /** Find all listings (any status) that reference any of the given agent IDs */
  async findByAgentIds(agentIds: string[]) {
    if (agentIds.length === 0) return []
    return this.db.select().from(clawListings).where(inArray(clawListings.agentId, agentIds))
  }
}
