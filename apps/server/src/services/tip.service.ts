import { and, eq, gte, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { economyTips } from '../db/schema'
import { apiError } from '../lib/api-error'
import { type Actor, actorFromUserId } from '../security/actor'
import type { EconomyAuditService } from './economy-audit.service'
import type { EconomyIdempotencyService } from './economy-idempotency.service'
import type { EconomyPolicyService } from './economy-policy.service'
import type { LedgerService } from './ledger.service'
import type { SettlementService } from './settlement.service'

function maxTipAmount() {
  const value = Number.parseInt(process.env.SHADOWOB_MAX_TIP_AMOUNT ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : 100_000
}

function positiveIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export class TipService {
  constructor(
    private deps: {
      db: Database
      ledgerService: LedgerService
      settlementService: SettlementService
      economyPolicyService: EconomyPolicyService
      economyAuditService: EconomyAuditService
      economyIdempotencyService: EconomyIdempotencyService
    },
  ) {}

  private async enforceTipLimits(input: {
    senderUserId: string
    amount: number
    context?: { kind: string; id: string }
  }) {
    const since = startOfUtcDay()
    const [daily] = await this.deps.db
      .select({
        count: sql<number>`count(*)::int`,
        amount: sql<number>`coalesce(sum(${economyTips.amount}), 0)::int`,
      })
      .from(economyTips)
      .where(
        and(eq(economyTips.senderUserId, input.senderUserId), gte(economyTips.createdAt, since)),
      )
    const dailyCount = Number(daily?.count ?? 0)
    const dailyAmount = Number(daily?.amount ?? 0)
    const dailyCountLimit = positiveIntEnv('SHADOWOB_TIP_DAILY_COUNT_LIMIT', 100)
    const dailyAmountLimit = positiveIntEnv('SHADOWOB_TIP_DAILY_AMOUNT_LIMIT', 1_000_000)
    if (dailyCount >= dailyCountLimit) {
      throw apiError('TIP_DAILY_COUNT_LIMIT_EXCEEDED', 429, { dailyCountLimit })
    }
    if (dailyAmount + input.amount > dailyAmountLimit) {
      throw apiError('TIP_DAILY_AMOUNT_LIMIT_EXCEEDED', 429, { dailyAmountLimit })
    }

    if (!input.context) return
    const [contextDaily] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(economyTips)
      .where(
        and(
          eq(economyTips.senderUserId, input.senderUserId),
          eq(economyTips.contextKind, input.context.kind),
          eq(economyTips.contextId, input.context.id),
          gte(economyTips.createdAt, since),
        ),
      )
    const contextCount = Number(contextDaily?.count ?? 0)
    const contextLimit = positiveIntEnv('SHADOWOB_TIP_CONTEXT_DAILY_COUNT_LIMIT', 20)
    if (contextCount >= contextLimit) {
      throw apiError('TIP_CONTEXT_DAILY_LIMIT_EXCEEDED', 429, { contextLimit })
    }
  }

  async sendTip(input: {
    senderUserId: string
    recipientUserId: string
    amount: number
    message?: string
    context?: { kind: string; id: string }
    idempotencyKey: string
    actor?: Actor
  }) {
    if (input.senderUserId === input.recipientUserId) {
      throw apiError('TIP_SELF_NOT_ALLOWED', 400)
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > maxTipAmount()) {
      throw apiError('TIP_AMOUNT_INVALID', 400, { maxAmount: maxTipAmount() })
    }
    const actor = input.actor ?? actorFromUserId(input.senderUserId)
    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'tip.send',
      resource: { kind: 'user', id: input.recipientUserId },
      scope: input.context
        ? { kind: input.context.kind, id: input.context.id }
        : { kind: 'user', id: input.recipientUserId },
      dataClass: 'financial',
      targetUserId: input.senderUserId,
    })

    const cached = await this.deps.economyIdempotencyService.getCompleted({
      actorUserId: input.senderUserId,
      key: input.idempotencyKey,
      action: 'economy.tip.send',
    })
    if (cached) return cached
    await this.enforceTipLimits(input)

    return this.deps.db.transaction(async (tx) => {
      await this.deps.economyIdempotencyService.begin(
        {
          actorUserId: input.senderUserId,
          key: input.idempotencyKey,
          action: 'economy.tip.send',
        },
        tx,
      )

      const [tip] = await tx
        .insert(economyTips)
        .values({
          senderUserId: input.senderUserId,
          recipientUserId: input.recipientUserId,
          amount: input.amount,
          contextKind: input.context?.kind,
          contextId: input.context?.id,
          message: input.message,
          sellerNet: input.amount,
          idempotencyKey: input.idempotencyKey,
        })
        .returning()
      if (!tip) throw apiError('TIP_CREATE_FAILED', 500)

      await this.deps.ledgerService.debit(
        {
          userId: input.senderUserId,
          amount: input.amount,
          type: 'purchase',
          referenceId: tip.id,
          referenceType: 'tip',
          note: '社区打赏',
        },
        tx,
      )

      await this.deps.settlementService.createLine(
        {
          sellerUserId: input.recipientUserId,
          sourceType: 'tip',
          sourceId: tip.id,
          grossAmount: input.amount,
        },
        tx,
      )

      await this.deps.economyAuditService.record(
        {
          actor,
          action: 'tip.send',
          resource: { kind: 'tip', id: tip.id },
          scope: input.context
            ? { kind: input.context.kind, id: input.context.id }
            : { kind: 'user', id: input.recipientUserId },
          idempotencyKey: input.idempotencyKey,
          request: input,
          result: 'succeeded',
          metadata: { amount: input.amount, recipientUserId: input.recipientUserId },
        },
        tx,
      )

      const response = { tip }
      await this.deps.economyIdempotencyService.complete(
        {
          actorUserId: input.senderUserId,
          key: input.idempotencyKey,
          action: 'economy.tip.send',
          referenceId: tip.id,
          response,
        },
        tx,
      )
      return response
    })
  }

  async listForUser(userId: string) {
    return this.deps.db.select().from(economyTips).where(eq(economyTips.recipientUserId, userId))
  }
}
