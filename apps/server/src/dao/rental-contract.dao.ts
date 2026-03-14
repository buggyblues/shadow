import { and, desc, eq, isNotNull, lt, or, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { rentalContracts, rentalUsageRecords, rentalViolations } from '../db/schema'

/* ──────────────── Rental Contract DAO ──────────────── */

export class RentalContractDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const r = await this.db
      .select()
      .from(rentalContracts)
      .where(eq(rentalContracts.id, id))
      .limit(1)
    return r[0] ?? null
  }

  async findByContractNo(contractNo: string) {
    const r = await this.db
      .select()
      .from(rentalContracts)
      .where(eq(rentalContracts.contractNo, contractNo))
      .limit(1)
    return r[0] ?? null
  }

  /** Get contracts where user is tenant (renting from others) */
  async findByTenantId(
    tenantId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ) {
    const conditions = [eq(rentalContracts.tenantId, tenantId)]
    if (opts?.status) {
      conditions.push(
        eq(
          rentalContracts.status,
          opts.status as (typeof rentalContracts.status.enumValues)[number],
        ),
      )
    }
    return this.db
      .select()
      .from(rentalContracts)
      .where(and(...conditions))
      .orderBy(desc(rentalContracts.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
  }

  /** Get contracts where user is owner (renting out to others) */
  async findByOwnerId(
    ownerId: string,
    opts?: { status?: string; limit?: number; offset?: number },
  ) {
    const conditions = [eq(rentalContracts.ownerId, ownerId)]
    if (opts?.status) {
      conditions.push(
        eq(
          rentalContracts.status,
          opts.status as (typeof rentalContracts.status.enumValues)[number],
        ),
      )
    }
    return this.db
      .select()
      .from(rentalContracts)
      .where(and(...conditions))
      .orderBy(desc(rentalContracts.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
  }

  /** Get all contracts for a user (both as owner and tenant) */
  async findByUserId(userId: string, opts?: { status?: string; limit?: number; offset?: number }) {
    const conditions = [
      or(eq(rentalContracts.tenantId, userId), eq(rentalContracts.ownerId, userId)),
    ]
    if (opts?.status) {
      conditions.push(
        eq(
          rentalContracts.status,
          opts.status as (typeof rentalContracts.status.enumValues)[number],
        ),
      )
    }
    return this.db
      .select()
      .from(rentalContracts)
      .where(and(...conditions))
      .orderBy(desc(rentalContracts.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
  }

  /** Check if a listing has an active contract (to prevent owner self-use) */
  async findActiveByListingId(listingId: string) {
    const r = await this.db
      .select()
      .from(rentalContracts)
      .where(and(eq(rentalContracts.listingId, listingId), eq(rentalContracts.status, 'active')))
      .limit(1)
    return r[0] ?? null
  }

  /** Find active contracts that have passed their expiration time */
  async findExpiredActive() {
    return this.db
      .select()
      .from(rentalContracts)
      .where(
        and(
          eq(rentalContracts.status, 'active'),
          isNotNull(rentalContracts.expiresAt),
          lt(rentalContracts.expiresAt, new Date()),
        ),
      )
  }

  async create(data: {
    contractNo: string
    listingId: string
    tenantId: string
    ownerId: string
    listingSnapshot?: Record<string, unknown>
    hourlyRate: number
    dailyRate?: number
    monthlyRate?: number
    platformFeeRate?: number
    depositAmount?: number
    ownerTerms?: string
    platformTerms?: string
    tenantAgreedAt?: Date
    startsAt?: Date
    expiresAt?: Date | null
  }) {
    const r = await this.db.insert(rentalContracts).values(data).returning()
    return r[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      status: 'pending' | 'active' | 'completed' | 'cancelled' | 'violated' | 'disputed'
      tenantAgreedAt: Date
      terminatedAt: Date
      terminationReason: string
      totalCost: number
    }>,
  ) {
    const r = await this.db
      .update(rentalContracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rentalContracts.id, id))
      .returning()
    return r[0] ?? null
  }

  /** Increment running total cost */
  async addCost(id: string, amount: number) {
    const r = await this.db
      .update(rentalContracts)
      .set({
        totalCost: sql`${rentalContracts.totalCost} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(rentalContracts.id, id))
      .returning()
    return r[0] ?? null
  }
}

/* ──────────────── Usage Record DAO ──────────────── */

export class RentalUsageDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findByContractId(contractId: string, opts?: { limit?: number; offset?: number }) {
    return this.db
      .select()
      .from(rentalUsageRecords)
      .where(eq(rentalUsageRecords.contractId, contractId))
      .orderBy(desc(rentalUsageRecords.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)
  }

  async create(data: {
    contractId: string
    startedAt: Date
    endedAt?: Date
    durationMinutes: number
    tokensConsumed?: number
    tokenCost?: number
    electricityCost?: number
    rentalCost: number
    platformFee: number
    totalCost: number
  }) {
    const r = await this.db.insert(rentalUsageRecords).values(data).returning()
    return r[0] ?? null
  }

  async getTotalByContractId(contractId: string) {
    const r = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${rentalUsageRecords.totalCost}), 0)::int` })
      .from(rentalUsageRecords)
      .where(eq(rentalUsageRecords.contractId, contractId))
    return r[0]?.total ?? 0
  }
}

/* ──────────────── Violation DAO ──────────────── */

export class RentalViolationDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findByContractId(contractId: string) {
    return this.db
      .select()
      .from(rentalViolations)
      .where(eq(rentalViolations.contractId, contractId))
      .orderBy(desc(rentalViolations.createdAt))
  }

  async create(data: {
    contractId: string
    violatorId: string
    violationType: string
    description?: string
    penaltyAmount: number
  }) {
    const r = await this.db.insert(rentalViolations).values(data).returning()
    return r[0] ?? null
  }

  async resolve(id: string) {
    const r = await this.db
      .update(rentalViolations)
      .set({ isPenaltyPaid: true, resolvedAt: new Date() })
      .where(eq(rentalViolations.id, id))
      .returning()
    return r[0] ?? null
  }
}
