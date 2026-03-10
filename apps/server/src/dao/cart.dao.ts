import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { cartItems } from '../db/schema'

export class CartDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findByUserId(userId: string, shopId?: string) {
    const conditions = [eq(cartItems.userId, userId)]
    if (shopId) conditions.push(eq(cartItems.shopId, shopId))
    return this.db.select().from(cartItems).where(and(...conditions)).orderBy(cartItems.createdAt)
  }

  async upsert(data: { userId: string; shopId: string; productId: string; skuId?: string; quantity: number }) {
    const conditions = [
      eq(cartItems.userId, data.userId),
      eq(cartItems.productId, data.productId),
    ]
    if (data.skuId) conditions.push(eq(cartItems.skuId, data.skuId))

    const existing = await this.db.select().from(cartItems).where(and(...conditions)).limit(1)
    if (existing[0]) {
      const r = await this.db
        .update(cartItems)
        .set({ quantity: data.quantity, updatedAt: new Date() })
        .where(eq(cartItems.id, existing[0].id))
        .returning()
      return r[0] ?? null
    }
    const r = await this.db.insert(cartItems).values(data).returning()
    return r[0] ?? null
  }

  async updateQuantity(id: string, userId: string, quantity: number) {
    const r = await this.db
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)))
      .returning()
    return r[0] ?? null
  }

  async delete(id: string, userId: string) {
    await this.db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, userId)))
  }

  async clearByShop(userId: string, shopId: string) {
    await this.db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.shopId, shopId)))
  }

  async countByUser(userId: string, shopId: string) {
    const items = await this.findByUserId(userId, shopId)
    return items.length
  }
}
