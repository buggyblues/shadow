import { and, eq, ne, sql } from 'drizzle-orm'
import type { WalletDao } from '../dao/wallet.dao'
import type { Database } from '../db'
import { paymentOrders, wallets, walletTransactions, walletUsageAccruals } from '../db/schema'

const DEFAULT_WALLET_MICROS_PER_COIN = 1_000_000

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export type LedgerCreditType = 'topup' | 'refund' | 'reward' | 'adjustment' | 'settlement'
export type LedgerDebitType = 'purchase'

function walletMicrosPerCoin() {
  const value = Number.parseInt(process.env.SHADOWOB_WALLET_MICROS_PER_COIN ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_WALLET_MICROS_PER_COIN
}

function normalizePositiveInteger(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

function assertPositiveAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Ledger amount must be positive'), { status: 400 })
  }
}

export class LedgerService {
  constructor(
    private deps: {
      walletDao: WalletDao
      db: Database
    },
  ) {}

  private async getOrCreateWallet(userId: string, db: DbLike = this.deps.db) {
    await db.insert(wallets).values({ userId }).onConflictDoNothing()
    const rows = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
    const wallet = rows[0]
    if (!wallet) {
      throw Object.assign(new Error('Wallet unavailable'), { status: 500 })
    }
    return wallet
  }

  async getWallet(userId: string) {
    return this.deps.walletDao.getOrCreate(userId)
  }

  async credit(
    input: {
      userId: string
      amount: number
      type: LedgerCreditType
      referenceId?: string | null
      referenceType?: string | null
      note?: string
    },
    db: DbLike = this.deps.db,
  ) {
    assertPositiveAmount(input.amount)
    const wallet = await this.getOrCreateWallet(input.userId, db)
    const rows = await db
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${input.amount}`, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id))
      .returning({ balance: wallets.balance })
    const balanceAfter = rows[0]!.balance

    await db.insert(walletTransactions).values({
      walletId: wallet.id,
      type: input.type,
      amount: input.amount,
      balanceAfter,
      referenceId: input.referenceId ?? undefined,
      referenceType: input.referenceType ?? undefined,
      note: input.note,
    })

    return balanceAfter
  }

  async debit(
    input: {
      userId: string
      amount: number
      type?: LedgerDebitType
      referenceId?: string | null
      referenceType?: string | null
      note?: string
    },
    db: DbLike = this.deps.db,
  ) {
    assertPositiveAmount(input.amount)
    const wallet = await this.getOrCreateWallet(input.userId, db)
    const updated = await db
      .update(wallets)
      .set({ balance: sql`${wallets.balance} - ${input.amount}`, updatedAt: new Date() })
      .where(and(eq(wallets.id, wallet.id), sql`${wallets.balance} >= ${input.amount}`))
      .returning({ balance: wallets.balance })

    if (updated.length === 0) {
      throw Object.assign(new Error('Insufficient balance'), {
        status: 402,
        code: 'WALLET_INSUFFICIENT_BALANCE',
        requiredAmount: input.amount,
        balance: wallet.balance,
        shortfall: Math.max(input.amount - wallet.balance, 0),
        nextAction: 'earn_or_recharge',
      })
    }

    const balanceAfter = updated[0]!.balance
    await db.insert(walletTransactions).values({
      walletId: wallet.id,
      type: input.type ?? 'purchase',
      amount: -input.amount,
      balanceAfter,
      referenceId: input.referenceId ?? undefined,
      referenceType: input.referenceType ?? undefined,
      note: input.note,
    })

    return balanceAfter
  }

  async settleReservedMicros(
    userId: string,
    amountMicros: number,
    reservedAmount: number,
    source: string,
    referenceId: string,
    referenceType: string,
    note: string,
  ) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    const micros = normalizePositiveInteger(amountMicros)
    const reserved = normalizePositiveInteger(reservedAmount)
    const microsPerCoin = walletMicrosPerCoin()

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.deps.db.transaction(async (tx) => {
          await tx
            .insert(walletUsageAccruals)
            .values({ walletId: wallet.id, source, accruedMicros: 0 })
            .onConflictDoNothing()

          const accrualRows = await tx
            .select()
            .from(walletUsageAccruals)
            .where(
              and(
                eq(walletUsageAccruals.walletId, wallet.id),
                eq(walletUsageAccruals.source, source),
              ),
            )
            .limit(1)
          const accrual = accrualRows[0]
          if (!accrual) {
            throw Object.assign(new Error('Wallet usage accrual unavailable'), {
              code: 'WALLET_ACCRUAL_UNAVAILABLE',
            })
          }

          const totalMicros = accrual.accruedMicros + micros
          const chargedAmount = Math.floor(totalMicros / microsPerCoin)
          const pendingMicros = totalMicros % microsPerCoin
          const delta = chargedAmount - reserved

          const walletRows = await tx
            .select({ balance: wallets.balance })
            .from(wallets)
            .where(eq(wallets.id, wallet.id))
            .limit(1)
          const currentBalance = walletRows[0]?.balance ?? wallet.balance
          let balanceAfter = currentBalance

          if (delta > 0) {
            const updated = await tx
              .update(wallets)
              .set({ balance: sql`${wallets.balance} - ${delta}`, updatedAt: new Date() })
              .where(and(eq(wallets.id, wallet.id), sql`${wallets.balance} >= ${delta}`))
              .returning({ balance: wallets.balance })

            if (updated.length === 0) {
              throw Object.assign(new Error('Insufficient balance'), {
                status: 402,
                code: 'WALLET_INSUFFICIENT_BALANCE',
                requiredAmount: delta,
                balance: currentBalance,
                shortfall: Math.max(delta - currentBalance, 0),
                nextAction: 'earn_or_recharge',
              })
            }

            balanceAfter = updated[0]!.balance
            await tx.insert(walletTransactions).values({
              walletId: wallet.id,
              type: 'purchase',
              amount: -delta,
              balanceAfter,
              referenceId,
              referenceType,
              note,
            })
          } else if (delta < 0) {
            const refund = Math.abs(delta)
            const refundRows = await tx
              .update(wallets)
              .set({ balance: sql`${wallets.balance} + ${refund}`, updatedAt: new Date() })
              .where(eq(wallets.id, wallet.id))
              .returning({ balance: wallets.balance })
            balanceAfter = refundRows[0]!.balance
            await tx.insert(walletTransactions).values({
              walletId: wallet.id,
              type: 'refund',
              amount: refund,
              balanceAfter,
              referenceId,
              referenceType,
              note: `${note} adjustment`,
            })
          }

          const accrualUpdated = await tx
            .update(walletUsageAccruals)
            .set({ accruedMicros: pendingMicros, updatedAt: new Date() })
            .where(
              and(
                eq(walletUsageAccruals.id, accrual.id),
                eq(walletUsageAccruals.accruedMicros, accrual.accruedMicros),
              ),
            )
            .returning({ accruedMicros: walletUsageAccruals.accruedMicros })

          if (accrualUpdated.length === 0) {
            throw Object.assign(new Error('Wallet usage accrual changed concurrently'), {
              code: 'WALLET_ACCRUAL_CONFLICT',
            })
          }

          return { chargedAmount, pendingMicros, balanceAfter }
        })
      } catch (err) {
        if ((err as { code?: string }).code === 'WALLET_ACCRUAL_CONFLICT' && attempt < 2) {
          continue
        }
        throw err
      }
    }

    throw Object.assign(new Error('Wallet usage accrual changed concurrently'), {
      code: 'WALLET_ACCRUAL_CONFLICT',
    })
  }

  async markPaymentSucceededOnce(
    input: { orderId: string; paidAt: Date },
    db: DbLike = this.deps.db,
  ) {
    return db
      .update(paymentOrders)
      .set({ status: 'succeeded', paidAt: input.paidAt, updatedAt: new Date() })
      .where(and(eq(paymentOrders.id, input.orderId), ne(paymentOrders.status, 'succeeded')))
      .returning()
  }
}
