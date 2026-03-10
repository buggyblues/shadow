import { and, eq, sql, desc } from 'drizzle-orm'
import type { Database } from '../db'
import { wallets, walletTransactions } from '../db/schema'

export class WalletDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findByUserId(userId: string) {
    const r = await this.db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
    return r[0] ?? null
  }

  async getOrCreate(userId: string) {
    let wallet = await this.findByUserId(userId)
    if (!wallet) {
      const r = await this.db.insert(wallets).values({ userId }).returning()
      wallet = r[0] ?? null
    }
    return wallet!
  }

  async updateBalance(id: string, balance: number) {
    const r = await this.db.update(wallets).set({ balance, updatedAt: new Date() }).where(eq(wallets.id, id)).returning()
    return r[0] ?? null
  }

  async debit(id: string, amount: number) {
    const r = await this.db
      .update(wallets)
      .set({ balance: sql`${wallets.balance} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(wallets.id, id), sql`${wallets.balance} >= ${amount}`))
      .returning()
    return r[0] ?? null
  }

  async credit(id: string, amount: number) {
    const r = await this.db
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(wallets.id, id))
      .returning()
    return r[0] ?? null
  }

  async addTransaction(data: {
    walletId: string
    type: 'topup' | 'purchase' | 'refund' | 'reward' | 'transfer' | 'adjustment'
    amount: number
    balanceAfter: number
    referenceId?: string
    referenceType?: string
    note?: string
  }) {
    const r = await this.db.insert(walletTransactions).values(data).returning()
    return r[0] ?? null
  }

  async getTransactions(walletId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async countTransactions(walletId: string) {
    const r = await this.db.select({ count: sql<number>`count(*)::int` }).from(walletTransactions).where(eq(walletTransactions.walletId, walletId))
    return r[0]?.count ?? 0
  }
}
