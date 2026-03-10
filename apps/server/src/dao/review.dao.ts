import { and, eq, sql, desc } from 'drizzle-orm'
import type { Database } from '../db'
import { reviews } from '../db/schema'

export class ReviewDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findByProductId(productId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async countByProductId(productId: string) {
    const r = await this.db.select({ count: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.productId, productId))
    return r[0]?.count ?? 0
  }

  async findByUserAndOrder(userId: string, orderId: string) {
    const r = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.orderId, orderId)))
      .limit(1)
    return r[0] ?? null
  }

  async findByUserAndProduct(userId: string, productId: string) {
    const r = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
      .limit(1)
    return r[0] ?? null
  }

  async create(data: { productId: string; orderId: string; userId: string; rating: number; content?: string; images?: string[] }) {
    const r = await this.db.insert(reviews).values(data).returning()
    return r[0] ?? null
  }

  async addReply(id: string, reply: string) {
    const r = await this.db
      .update(reviews)
      .set({ reply, repliedAt: new Date(), updatedAt: new Date() })
      .where(eq(reviews.id, id))
      .returning()
    return r[0] ?? null
  }

  async getAverageRating(productId: string) {
    const r = await this.db
      .select({
        avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(eq(reviews.productId, productId))
    return { avgRating: r[0]?.avg ?? 0, ratingCount: r[0]?.count ?? 0 }
  }
}
