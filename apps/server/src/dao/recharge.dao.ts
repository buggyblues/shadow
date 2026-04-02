import { desc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { paymentOrders } from '../db/schema'

export class RechargeDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async createPaymentOrder(data: {
    userId: string
    orderNo: string
    shrimpCoinAmount: number
    usdAmount: number
    stripePaymentIntentId?: string
    stripeCustomerId?: string
    localCurrencyAmount?: number
    localCurrency?: string
  }) {
    const r = await this.db.insert(paymentOrders).values(data).returning()
    return r[0]!
  }

  async findByPaymentIntentId(paymentIntentId: string) {
    const r = await this.db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.stripePaymentIntentId, paymentIntentId))
      .limit(1)
    return r[0] ?? null
  }

  async findByOrderNo(orderNo: string) {
    const r = await this.db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.orderNo, orderNo))
      .limit(1)
    return r[0] ?? null
  }

  async findById(id: string) {
    const r = await this.db.select().from(paymentOrders).where(eq(paymentOrders.id, id)).limit(1)
    return r[0] ?? null
  }

  async updateStatus(
    id: string,
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'disputed',
    extra?: {
      paidAt?: Date
      failedAt?: Date
      cancelledAt?: Date
      requiresAction?: boolean
      actionType?: string
    },
  ) {
    const r = await this.db
      .update(paymentOrders)
      .set({ status, updatedAt: new Date(), ...extra })
      .where(eq(paymentOrders.id, id))
      .returning()
    return r[0] ?? null
  }

  async getHistory(userId: string, limit = 20, offset = 0) {
    return this.db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.userId, userId))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async countByUserId(userId: string) {
    const r = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentOrders)
      .where(eq(paymentOrders.userId, userId))
    return r[0]?.count ?? 0
  }
}
