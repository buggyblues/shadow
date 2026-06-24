import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { settlementAccounts, settlementLines } from '../db/schema'
import { apiError } from '../lib/api-error'
import type { LedgerService } from './ledger.service'

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]
type SettlementLine = typeof settlementLines.$inferSelect

function settlementDelayDays() {
  const value = Number.parseInt(process.env.SHADOWOB_COMMERCE_SETTLEMENT_DELAY_DAYS ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function platformFeeBps() {
  const value = Number.parseInt(process.env.SHADOWOB_COMMERCE_PLATFORM_FEE_BPS ?? '', 10)
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10_000) : 0
}

function addDays(days: number) {
  return days > 0 ? new Date(Date.now() + days * 86_400_000) : new Date()
}

export class SettlementService {
  constructor(private deps: { db: Database; ledgerService: LedgerService }) {}

  private async adjustAccount(
    db: DbLike,
    userId: string,
    delta: { pending?: number; available?: number; held?: number },
  ) {
    await db
      .update(settlementAccounts)
      .set({
        pendingBalance:
          delta.pending != null
            ? sql`${settlementAccounts.pendingBalance} + ${delta.pending}`
            : sql`${settlementAccounts.pendingBalance}`,
        availableBalance:
          delta.available != null
            ? sql`${settlementAccounts.availableBalance} + ${delta.available}`
            : sql`${settlementAccounts.availableBalance}`,
        heldBalance:
          delta.held != null
            ? sql`${settlementAccounts.heldBalance} + ${delta.held}`
            : sql`${settlementAccounts.heldBalance}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(settlementAccounts.ownerKind, 'user'),
          eq(settlementAccounts.ownerId, userId),
          eq(settlementAccounts.currencyCode, 'shrimp_coin'),
        ),
      )
  }

  async createLine(
    input: {
      sellerUserId: string
      shopId?: string | null
      sourceType: 'order' | 'tip' | 'gift' | 'adjustment'
      sourceId: string
      grossAmount: number
      platformFee?: number
      status?: 'pending' | 'available' | 'held'
    },
    db: DbLike = this.deps.db,
  ) {
    if (!Number.isFinite(input.grossAmount) || input.grossAmount <= 0) {
      throw apiError('SETTLEMENT_AMOUNT_INVALID', 400)
    }
    const fee = input.platformFee ?? Math.floor((input.grossAmount * platformFeeBps()) / 10_000)
    const net = Math.max(input.grossAmount - fee, 0)
    const delayDays = settlementDelayDays()
    const status = input.status ?? (delayDays > 0 ? 'pending' : 'available')
    const availableAt = status === 'pending' ? addDays(delayDays) : new Date()

    await db
      .insert(settlementAccounts)
      .values({
        ownerKind: 'user',
        ownerId: input.sellerUserId,
        currencyCode: 'shrimp_coin',
      })
      .onConflictDoNothing()

    const [line] = await db
      .insert(settlementLines)
      .values({
        sellerUserId: input.sellerUserId,
        shopId: input.shopId ?? undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        grossAmount: input.grossAmount,
        platformFee: fee,
        netAmount: net,
        status,
        availableAt,
      })
      .returning()
    if (!line) throw apiError('SETTLEMENT_LINE_CREATE_FAILED', 500)

    await db
      .update(settlementAccounts)
      .set({
        pendingBalance:
          status === 'pending'
            ? sql`${settlementAccounts.pendingBalance} + ${net}`
            : sql`${settlementAccounts.pendingBalance}`,
        availableBalance:
          status === 'available'
            ? sql`${settlementAccounts.availableBalance} + ${net}`
            : sql`${settlementAccounts.availableBalance}`,
        heldBalance:
          status === 'held'
            ? sql`${settlementAccounts.heldBalance} + ${net}`
            : sql`${settlementAccounts.heldBalance}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(settlementAccounts.ownerKind, 'user'),
          eq(settlementAccounts.ownerId, input.sellerUserId),
          eq(settlementAccounts.currencyCode, 'shrimp_coin'),
        ),
      )

    return line
  }

  async listForUser(userId: string, limit = 50, offset = 0) {
    return this.deps.db
      .select()
      .from(settlementLines)
      .where(eq(settlementLines.sellerUserId, userId))
      .limit(Math.min(Math.max(limit, 1), 100))
      .offset(Math.max(offset, 0))
  }

  async makePendingAvailableForUser(
    userId: string,
    limit = 500,
    db: DbLike = this.deps.db,
    now = new Date(),
  ) {
    const lines = await db
      .select()
      .from(settlementLines)
      .where(
        and(
          eq(settlementLines.sellerUserId, userId),
          eq(settlementLines.status, 'pending'),
          lte(settlementLines.availableAt, now),
        ),
      )
      .limit(Math.min(Math.max(limit, 1), 500))

    const released: SettlementLine[] = []
    for (const line of lines) {
      const [updated] = await db
        .update(settlementLines)
        .set({ status: 'available', updatedAt: new Date() })
        .where(and(eq(settlementLines.id, line.id), eq(settlementLines.status, 'pending')))
        .returning()
      if (!updated || !line.sellerUserId) continue
      await this.adjustAccount(db, line.sellerUserId, {
        pending: -line.netAmount,
        available: line.netAmount,
      })
      released.push(updated)
    }
    return released
  }

  async holdLinesForSource(
    input: { sourceType: string; sourceId: string; reason?: string },
    db: DbLike = this.deps.db,
  ) {
    const lines = await db
      .select()
      .from(settlementLines)
      .where(
        and(
          eq(settlementLines.sourceType, input.sourceType),
          eq(settlementLines.sourceId, input.sourceId),
          inArray(settlementLines.status, ['pending', 'available']),
        ),
      )

    const held: SettlementLine[] = []
    for (const line of lines) {
      const [updated] = await db
        .update(settlementLines)
        .set({
          status: 'held',
          heldAmount: line.netAmount,
          errorCode: input.reason ?? 'settlement_held',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(settlementLines.id, line.id),
            inArray(settlementLines.status, ['pending', 'available']),
          ),
        )
        .returning()
      if (!updated || !line.sellerUserId) continue
      await this.adjustAccount(db, line.sellerUserId, {
        pending: line.status === 'pending' ? -line.netAmount : 0,
        available: line.status === 'available' ? -line.netAmount : 0,
        held: line.netAmount,
      })
      held.push(updated)
    }
    return held
  }

  async reverseLinesForSource(
    input: { sourceType: string; sourceId: string; reason?: string },
    db: DbLike = this.deps.db,
  ) {
    const lines = await db
      .select()
      .from(settlementLines)
      .where(
        and(
          eq(settlementLines.sourceType, input.sourceType),
          eq(settlementLines.sourceId, input.sourceId),
          inArray(settlementLines.status, ['pending', 'available', 'held']),
        ),
      )

    const reversed: SettlementLine[] = []
    for (const line of lines) {
      const [updated] = await db
        .update(settlementLines)
        .set({
          status: 'reversed',
          refundAmount: line.netAmount,
          errorCode: input.reason ?? 'settlement_reversed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(settlementLines.id, line.id),
            inArray(settlementLines.status, ['pending', 'available', 'held']),
          ),
        )
        .returning()
      if (!updated || !line.sellerUserId) continue
      await this.adjustAccount(db, line.sellerUserId, {
        pending: line.status === 'pending' ? -line.netAmount : 0,
        available: line.status === 'available' ? -line.netAmount : 0,
        held: line.status === 'held' ? -line.netAmount : 0,
      })
      reversed.push(updated)
    }
    return reversed
  }

  async settleAvailableForUser(userId: string, limit = 50) {
    return this.deps.db.transaction(async (tx) => {
      await this.makePendingAvailableForUser(userId, limit, tx)
      const lines = await tx
        .select()
        .from(settlementLines)
        .where(
          and(
            eq(settlementLines.sellerUserId, userId),
            eq(settlementLines.status, 'available'),
            lte(settlementLines.availableAt, new Date()),
          ),
        )
        .limit(Math.min(Math.max(limit, 1), 100))

      for (const line of lines) {
        await this.deps.ledgerService.credit(
          {
            userId,
            amount: line.netAmount,
            type: 'settlement',
            referenceId: line.id,
            referenceType: 'settlement_line',
            note: `社区经济结算 - ${line.sourceType}`,
          },
          tx,
        )
        await tx
          .update(settlementLines)
          .set({ status: 'settled', settledAt: new Date(), updatedAt: new Date() })
          .where(eq(settlementLines.id, line.id))
      }

      if (lines.length > 0) {
        const total = lines.reduce((sum, line) => sum + line.netAmount, 0)
        await tx
          .update(settlementAccounts)
          .set({
            availableBalance: sql`${settlementAccounts.availableBalance} - ${total}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(settlementAccounts.ownerKind, 'user'),
              eq(settlementAccounts.ownerId, userId),
              eq(settlementAccounts.currencyCode, 'shrimp_coin'),
            ),
          )
      }

      return lines
    })
  }
}
