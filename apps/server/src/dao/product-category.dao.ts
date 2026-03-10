import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { productCategories } from '../db/schema'

export class ProductCategoryDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findByShopId(shopId: string) {
    return this.db
      .select()
      .from(productCategories)
      .where(eq(productCategories.shopId, shopId))
      .orderBy(productCategories.position)
  }

  async findById(id: string) {
    const r = await this.db.select().from(productCategories).where(eq(productCategories.id, id)).limit(1)
    return r[0] ?? null
  }

  async create(data: { shopId: string; name: string; slug: string; parentId?: string; position?: number; iconUrl?: string }) {
    const r = await this.db.insert(productCategories).values(data).returning()
    return r[0] ?? null
  }

  async update(id: string, data: Partial<{ name: string; slug: string; parentId: string | null; position: number; iconUrl: string | null }>) {
    const r = await this.db.update(productCategories).set(data).where(eq(productCategories.id, id)).returning()
    return r[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(productCategories).where(eq(productCategories.id, id))
  }

  async countByShopId(shopId: string) {
    const r = await this.db.select({ count: sql<number>`count(*)::int` }).from(productCategories).where(eq(productCategories.shopId, shopId))
    return r[0]?.count ?? 0
  }
}
