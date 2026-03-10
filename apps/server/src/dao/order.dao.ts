import { and, eq, sql, desc } from 'drizzle-orm'
import type { Database } from '../db'
import { orders, orderItems } from '../db/schema'

export class OrderDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findById(id: string) {
    const r = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1)
    return r[0] ?? null
  }

  async findByOrderNo(orderNo: string) {
    const r = await this.db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1)
    return r[0] ?? null
  }

  async findByBuyerId(buyerId: string, opts?: { status?: string; limit?: number; offset?: number }) {
    const conditions = [eq(orders.buyerId, buyerId)]
    if (opts?.status) conditions.push(eq(orders.status, opts.status as typeof orders.status.enumValues[number]))
    return this.db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).limit(opts?.limit ?? 50).offset(opts?.offset ?? 0)
  }

  async findByShopId(shopId: string, opts?: { status?: string; limit?: number; offset?: number }) {
    const conditions = [eq(orders.shopId, shopId)]
    if (opts?.status) conditions.push(eq(orders.status, opts.status as typeof orders.status.enumValues[number]))
    return this.db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt)).limit(opts?.limit ?? 50).offset(opts?.offset ?? 0)
  }

  async countByShopId(shopId: string, opts?: { status?: string }) {
    const conditions = [eq(orders.shopId, shopId)]
    if (opts?.status) conditions.push(eq(orders.status, opts.status as typeof orders.status.enumValues[number]))
    const r = await this.db.select({ count: sql<number>`count(*)::int` }).from(orders).where(and(...conditions))
    return r[0]?.count ?? 0
  }

  async create(data: {
    orderNo: string
    shopId: string
    buyerId: string
    totalAmount: number
    shippingAddress?: Record<string, unknown>
    buyerNote?: string
  }) {
    const r = await this.db.insert(orders).values(data).returning()
    return r[0] ?? null
  }

  async update(id: string, data: Partial<{
    status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded'
    trackingNo: string | null
    sellerNote: string | null
    paidAt: Date
    shippedAt: Date
    completedAt: Date
    cancelledAt: Date
  }>) {
    const r = await this.db.update(orders).set({ ...data, updatedAt: new Date() }).where(eq(orders.id, id)).returning()
    return r[0] ?? null
  }

  async createItems(items: Array<{
    orderId: string
    productId: string
    skuId?: string
    productName: string
    specValues?: string[]
    price: number
    quantity: number
    imageUrl?: string
  }>) {
    if (items.length === 0) return []
    return this.db.insert(orderItems).values(items).returning()
  }

  async getItems(orderId: string) {
    return this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  }
}
