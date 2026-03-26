import { and, count, desc, eq, lt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  portfolioComments,
  portfolioFavorites,
  portfolioLikes,
  portfolios,
  users,
} from '../db/schema'
import type { PortfolioStatus, PortfolioVisibility } from '../db/schema/portfolios'

export class PortfolioDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  private ownerColumns = {
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    isBot: users.isBot,
  }

  // ============ Portfolio CRUD ============

  async findById(id: string) {
    const result = await this.db.select().from(portfolios).where(eq(portfolios.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByIdWithOwner(id: string) {
    const result = await this.db
      .select({
        portfolio: portfolios,
        owner: this.ownerColumns,
      })
      .from(portfolios)
      .leftJoin(users, eq(portfolios.ownerId, users.id))
      .where(eq(portfolios.id, id))
      .limit(1)
    if (!result[0]) return null
    return { ...result[0].portfolio, owner: result[0].owner }
  }

  async findByOwnerId(
    ownerId: string,
    options?: {
      visibility?: PortfolioVisibility
      status?: PortfolioStatus
      limit?: number
      cursor?: string
    },
  ) {
    const conditions = [eq(portfolios.ownerId, ownerId)]
    if (options?.visibility) {
      conditions.push(eq(portfolios.visibility, options.visibility))
    }
    if (options?.status) {
      conditions.push(eq(portfolios.status, options.status))
    }
    if (options?.cursor) {
      conditions.push(lt(portfolios.createdAt, new Date(options.cursor)))
    }

    const limit = options?.limit ?? 20
    const rows = await this.db
      .select({
        portfolio: portfolios,
        owner: this.ownerColumns,
      })
      .from(portfolios)
      .leftJoin(users, eq(portfolios.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(portfolios.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({ ...r.portfolio, owner: r.owner }))
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]?.createdAt : null

    return { items, nextCursor, hasMore }
  }

  async findPublic(options?: { limit?: number; cursor?: string; tags?: string[] }) {
    const conditions = [eq(portfolios.visibility, 'public'), eq(portfolios.status, 'published')]
    if (options?.cursor) {
      conditions.push(lt(portfolios.createdAt, new Date(options.cursor)))
    }

    const limit = options?.limit ?? 20

    const query = this.db
      .select({
        portfolio: portfolios,
        owner: this.ownerColumns,
      })
      .from(portfolios)
      .leftJoin(users, eq(portfolios.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(portfolios.createdAt))
      .limit(limit + 1)

    const rows = await query

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({ ...r.portfolio, owner: r.owner }))
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]?.createdAt : null

    return { items, nextCursor, hasMore }
  }

  async findByAttachmentId(attachmentId: string) {
    const result = await this.db
      .select()
      .from(portfolios)
      .where(eq(portfolios.attachmentId, attachmentId))
      .limit(1)
    return result[0] ?? null
  }

  async create(data: {
    ownerId: string
    attachmentId?: string
    title?: string
    description?: string
    fileUrl: string
    fileName: string
    fileType: string
    fileSize: number
    fileWidth?: number
    fileHeight?: number
    thumbnailUrl?: string
    visibility?: PortfolioVisibility
    tags?: string[]
  }) {
    const result = await this.db.insert(portfolios).values(data).returning()
    return result[0]
  }

  async update(
    id: string,
    data: Partial<{
      title: string
      description: string
      visibility: PortfolioVisibility
      status: PortfolioStatus
      tags: string[]
      thumbnailUrl: string
    }>,
  ) {
    const result = await this.db
      .update(portfolios)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(portfolios.id, id))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(portfolios).where(eq(portfolios.id, id))
  }

  // ============ Counters ============

  async incrementViewCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ viewCount: sql`${portfolios.viewCount} + 1` })
      .where(eq(portfolios.id, id))
  }

  async incrementLikeCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ likeCount: sql`${portfolios.likeCount} + 1` })
      .where(eq(portfolios.id, id))
  }

  async decrementLikeCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ likeCount: sql`GREATEST(${portfolios.likeCount} - 1, 0)` })
      .where(eq(portfolios.id, id))
  }

  async incrementFavoriteCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ favoriteCount: sql`${portfolios.favoriteCount} + 1` })
      .where(eq(portfolios.id, id))
  }

  async decrementFavoriteCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ favoriteCount: sql`GREATEST(${portfolios.favoriteCount} - 1, 0)` })
      .where(eq(portfolios.id, id))
  }

  async incrementCommentCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ commentCount: sql`${portfolios.commentCount} + 1` })
      .where(eq(portfolios.id, id))
  }

  async decrementCommentCount(id: string) {
    await this.db
      .update(portfolios)
      .set({ commentCount: sql`GREATEST(${portfolios.commentCount} - 1, 0)` })
      .where(eq(portfolios.id, id))
  }

  // ============ Likes ============

  async addLike(portfolioId: string, userId: string) {
    const result = await this.db
      .insert(portfolioLikes)
      .values({ portfolioId, userId })
      .onConflictDoNothing()
      .returning()
    return result[0] ?? null
  }

  async removeLike(portfolioId: string, userId: string) {
    await this.db
      .delete(portfolioLikes)
      .where(and(eq(portfolioLikes.portfolioId, portfolioId), eq(portfolioLikes.userId, userId)))
  }

  async findLike(portfolioId: string, userId: string) {
    const result = await this.db
      .select()
      .from(portfolioLikes)
      .where(and(eq(portfolioLikes.portfolioId, portfolioId), eq(portfolioLikes.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async findLikesByUser(userId: string, limit = 50) {
    return this.db
      .select()
      .from(portfolioLikes)
      .where(eq(portfolioLikes.userId, userId))
      .orderBy(desc(portfolioLikes.createdAt))
      .limit(limit)
  }

  // ============ Favorites ============

  async addFavorite(portfolioId: string, userId: string) {
    const result = await this.db
      .insert(portfolioFavorites)
      .values({ portfolioId, userId })
      .onConflictDoNothing()
      .returning()
    return result[0] ?? null
  }

  async removeFavorite(portfolioId: string, userId: string) {
    await this.db
      .delete(portfolioFavorites)
      .where(
        and(eq(portfolioFavorites.portfolioId, portfolioId), eq(portfolioFavorites.userId, userId)),
      )
  }

  async findFavorite(portfolioId: string, userId: string) {
    const result = await this.db
      .select()
      .from(portfolioFavorites)
      .where(
        and(eq(portfolioFavorites.portfolioId, portfolioId), eq(portfolioFavorites.userId, userId)),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findFavoritesByUser(userId: string, limit = 50, cursor?: string) {
    const conditions = [eq(portfolioFavorites.userId, userId)]
    if (cursor) {
      conditions.push(lt(portfolioFavorites.createdAt, new Date(cursor)))
    }

    const rows = await this.db
      .select({
        favorite: portfolioFavorites,
        portfolio: portfolios,
        owner: this.ownerColumns,
      })
      .from(portfolioFavorites)
      .leftJoin(portfolios, eq(portfolioFavorites.portfolioId, portfolios.id))
      .leftJoin(users, eq(portfolios.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(portfolioFavorites.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({
      favorite: r.favorite,
      portfolio: r.portfolio ? { ...r.portfolio, owner: r.owner } : null,
    }))
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]?.favorite?.createdAt : null

    return { items, nextCursor, hasMore }
  }

  // ============ Comments ============

  async createComment(data: {
    portfolioId: string
    userId: string
    parentId?: string
    content: string
  }) {
    const result = await this.db.insert(portfolioComments).values(data).returning()
    return result[0]
  }

  async findCommentById(id: string) {
    const result = await this.db
      .select()
      .from(portfolioComments)
      .where(eq(portfolioComments.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async findCommentsByPortfolioId(
    portfolioId: string,
    options?: { limit?: number; cursor?: string },
  ) {
    const conditions = [eq(portfolioComments.portfolioId, portfolioId)]
    if (options?.cursor) {
      conditions.push(lt(portfolioComments.createdAt, new Date(options.cursor)))
    }

    const limit = options?.limit ?? 20
    const rows = await this.db
      .select({
        comment: portfolioComments,
        author: this.ownerColumns,
      })
      .from(portfolioComments)
      .leftJoin(users, eq(portfolioComments.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(portfolioComments.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({ ...r.comment, author: r.author }))
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]?.createdAt : null

    return { items, nextCursor, hasMore }
  }

  async findReplies(parentId: string) {
    const rows = await this.db
      .select({
        comment: portfolioComments,
        author: this.ownerColumns,
      })
      .from(portfolioComments)
      .leftJoin(users, eq(portfolioComments.userId, users.id))
      .where(eq(portfolioComments.parentId, parentId))
      .orderBy(desc(portfolioComments.createdAt))

    return rows.map((r) => ({ ...r.comment, author: r.author }))
  }

  async deleteComment(id: string) {
    await this.db.delete(portfolioComments).where(eq(portfolioComments.id, id))
  }

  async updateComment(id: string, content: string) {
    const result = await this.db
      .update(portfolioComments)
      .set({ content, isEdited: true, updatedAt: new Date() })
      .where(eq(portfolioComments.id, id))
      .returning()
    return result[0] ?? null
  }

  // ============ Stats ============

  async countByOwnerId(ownerId: string) {
    const result = await this.db
      .select({ count: count() })
      .from(portfolios)
      .where(eq(portfolios.ownerId, ownerId))
    return result[0]?.count ?? 0
  }
}
