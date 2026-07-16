import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { users } from '../db/schema'

export type AdminUserStatusFilter = 'online' | 'idle' | 'dnd' | 'offline'
export type AdminUserSortBy = 'createdAt' | 'username' | 'email' | 'status'
export type AdminUserSortOrder = 'asc' | 'desc'

export interface AdminUserListOptions {
  limit?: number
  offset?: number
  search?: string
  status?: AdminUserStatusFilter
  isBot?: boolean
  sortBy?: AdminUserSortBy
  sortOrder?: AdminUserSortOrder
}

const DEFAULT_ADMIN_USER_LIMIT = 50
const MAX_ADMIN_USER_LIMIT = 200

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_ADMIN_USER_LIMIT
  return Math.min(MAX_ADMIN_USER_LIMIT, Math.max(1, Math.trunc(value ?? DEFAULT_ADMIN_USER_LIMIT)))
}

function clampOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value ?? 0))
}

function getAdminUserOrderBy(sortBy: AdminUserSortBy, sortOrder: AdminUserSortOrder): SQL[] {
  const direction = sortOrder === 'asc' ? asc : desc

  if (sortBy === 'username') return [direction(users.username), direction(users.id)]
  if (sortBy === 'email') return [direction(users.email), direction(users.id)]
  if (sortBy === 'status') return [direction(users.status), desc(users.createdAt), desc(users.id)]

  return [direction(users.createdAt), direction(users.id)]
}

export class UserDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByIds(ids: string[]) {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return []
    return this.db.select().from(users).where(inArray(users.id, uniqueIds))
  }

  async findByEmail(email: string) {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    return result[0] ?? null
  }

  async findByUsername(username: string) {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1)
    return result[0] ?? null
  }

  async create(data: {
    email: string
    username: string
    passwordHash: string
    displayName?: string
  }) {
    const result = await this.db
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        passwordHash: data.passwordHash,
        displayName: data.displayName ?? data.username,
      })
      .returning()
    return result[0]
  }

  async updateStatus(id: string, status: 'online' | 'idle' | 'dnd' | 'offline') {
    const result = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return result[0] ?? null
  }

  async update(
    id: string,
    data: Partial<{
      displayName: string
      avatarUrl: string | null
      passwordHash: string
    }>,
  ) {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return result[0] ?? null
  }

  async findAll(limit = 50, offset = 0) {
    return this.db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit)
      .offset(offset)
  }

  async listForAdmin(options: AdminUserListOptions = {}) {
    const limit = clampLimit(options.limit)
    const offset = clampOffset(options.offset)
    const sortBy = options.sortBy ?? 'createdAt'
    const sortOrder = options.sortOrder ?? 'desc'
    const orderBy = getAdminUserOrderBy(sortBy, sortOrder)
    const conditions: SQL[] = []
    const normalizedSearch = options.search?.trim()

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`
      const searchCondition = or(
        ilike(users.username, pattern),
        ilike(users.email, pattern),
        ilike(users.displayName, pattern),
      )
      if (searchCondition) conditions.push(searchCondition)
    }

    if (options.status) {
      conditions.push(eq(users.status, options.status))
    }

    if (options.isBot !== undefined) {
      conditions.push(eq(users.isBot, options.isBot))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const itemsPromise = whereClause
      ? this.db
          .select()
          .from(users)
          .where(whereClause)
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset)
      : this.db
          .select()
          .from(users)
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset)

    const countPromise = whereClause
      ? this.db.select({ count: sql<number>`count(*)::int` }).from(users).where(whereClause)
      : this.db.select({ count: sql<number>`count(*)::int` }).from(users)

    const [items, countResult] = await Promise.all([itemsPromise, countPromise])
    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    }
  }

  async delete(id: string) {
    await this.db.delete(users).where(eq(users.id, id))
  }
}
