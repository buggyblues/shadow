import { and, eq, gte, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { economyGiftItems, economyGifts, users } from '../db/schema'
import { apiError } from '../lib/api-error'
import { type Actor, actorFromUserId } from '../security/actor'
import type { CommunityAssetService } from './community-asset.service'
import type { EconomyAuditService } from './economy-audit.service'
import type { EconomyIdempotencyService } from './economy-idempotency.service'
import type { EconomyPolicyService } from './economy-policy.service'
import type { LedgerService } from './ledger.service'
import type { SettlementService } from './settlement.service'

function normalizeQuantity(value?: number) {
  return Math.max(Math.floor(value ?? 1), 1)
}

function positiveIntEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export class GiftService {
  constructor(
    private deps: {
      db: Database
      ledgerService: LedgerService
      communityAssetService: CommunityAssetService
      economyPolicyService: EconomyPolicyService
      economyAuditService: EconomyAuditService
      economyIdempotencyService: EconomyIdempotencyService
      settlementService: SettlementService
    },
  ) {}

  private async assertRecipientCanReceive(recipientUserId: string) {
    const [recipient] = await this.deps.db
      .select({ economyStatus: users.economyStatus })
      .from(users)
      .where(eq(users.id, recipientUserId))
      .limit(1)
    if (!recipient) throw apiError('GIFT_RECIPIENT_NOT_FOUND', 404)
    if (recipient.economyStatus === 'banned' || recipient.economyStatus === 'frozen') {
      throw apiError('GIFT_RECIPIENT_BLOCKED', 403)
    }
    if (recipient.economyStatus === 'economy_restricted') {
      throw apiError('GIFT_RECIPIENT_ECONOMY_RESTRICTED', 403)
    }
  }

  private async enforceGiftLimits(input: { senderUserId: string; currencyAmount: number }) {
    const maxCurrencyAmount = positiveIntEnv('SHADOW_GIFT_MAX_CURRENCY_AMOUNT', 1_000_000)
    if (input.currencyAmount > maxCurrencyAmount) {
      throw apiError('GIFT_CURRENCY_AMOUNT_LIMIT_EXCEEDED', 429, { maxCurrencyAmount })
    }

    const [daily] = await this.deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(economyGifts)
      .where(
        and(
          eq(economyGifts.senderUserId, input.senderUserId),
          gte(economyGifts.createdAt, startOfUtcDay()),
        ),
      )
    const dailyCount = Number(daily?.count ?? 0)
    const dailyCountLimit = positiveIntEnv('SHADOW_GIFT_DAILY_COUNT_LIMIT', 100)
    if (dailyCount >= dailyCountLimit) {
      throw apiError('GIFT_DAILY_COUNT_LIMIT_EXCEEDED', 429, { dailyCountLimit })
    }
  }

  async sendGift(input: {
    senderUserId: string
    recipientUserId: string
    assets?: Array<{ assetGrantId: string; quantity?: number }>
    currencies?: Array<{ currencyCode: 'shrimp_coin'; amount: number }>
    message?: string
    idempotencyKey: string
    actor?: Actor
  }) {
    if (input.senderUserId === input.recipientUserId) {
      throw apiError('GIFT_SELF_NOT_ALLOWED', 400)
    }
    const assets = input.assets ?? []
    const currencies = input.currencies ?? []
    if (assets.length === 0 && currencies.length === 0) {
      throw apiError('GIFT_EMPTY', 400)
    }
    if (
      currencies.some(
        (item) =>
          item.currencyCode !== 'shrimp_coin' || !Number.isFinite(item.amount) || item.amount <= 0,
      )
    ) {
      throw apiError('GIFT_CURRENCY_AMOUNT_INVALID', 400)
    }
    if (assets.some((item) => !Number.isFinite(item.quantity ?? 1) || (item.quantity ?? 1) <= 0)) {
      throw apiError('GIFT_ASSET_QUANTITY_INVALID', 400)
    }
    const currencyAmount = currencies.reduce((sum, item) => sum + item.amount, 0)
    const actor = input.actor ?? actorFromUserId(input.senderUserId)
    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'gift.send',
      resource: { kind: 'user', id: input.recipientUserId },
      scope: { kind: 'gift', id: input.recipientUserId },
      dataClass: 'financial',
      targetUserId: input.senderUserId,
    })

    const cached = await this.deps.economyIdempotencyService.getCompleted({
      actorUserId: input.senderUserId,
      key: input.idempotencyKey,
      action: 'economy.gift.send',
    })
    if (cached) return cached
    await this.assertRecipientCanReceive(input.recipientUserId)
    await this.enforceGiftLimits({ senderUserId: input.senderUserId, currencyAmount })

    return this.deps.db.transaction(async (tx) => {
      await this.deps.economyIdempotencyService.begin(
        {
          actorUserId: input.senderUserId,
          key: input.idempotencyKey,
          action: 'economy.gift.send',
        },
        tx,
      )

      const [gift] = await tx
        .insert(economyGifts)
        .values({
          senderUserId: input.senderUserId,
          recipientUserId: input.recipientUserId,
          message: input.message,
          idempotencyKey: input.idempotencyKey,
          metadata: { assetCount: assets.length, currencyCount: currencies.length },
        })
        .returning()
      if (!gift) throw apiError('GIFT_CREATE_FAILED', 500)

      if (currencyAmount > 0) {
        await this.deps.ledgerService.debit(
          {
            userId: input.senderUserId,
            amount: currencyAmount,
            type: 'purchase',
            referenceId: gift.id,
            referenceType: 'gift',
            note: '社区赠送',
          },
          tx,
        )
        await this.deps.settlementService.createLine(
          {
            sellerUserId: input.recipientUserId,
            sourceType: 'gift',
            sourceId: gift.id,
            grossAmount: currencyAmount,
          },
          tx,
        )
        await tx.insert(economyGiftItems).values(
          currencies.map((item) => ({
            giftId: gift.id,
            itemKind: 'currency' as const,
            currencyCode: item.currencyCode,
            amount: item.amount,
          })),
        )
      }

      for (const [index, asset] of assets.entries()) {
        const quantity = normalizeQuantity(asset.quantity)
        const grant = await this.deps.communityAssetService.transferGrant(
          {
            actorUserId: input.senderUserId,
            recipientUserId: input.recipientUserId,
            grantId: asset.assetGrantId,
            quantity,
            referenceType: 'gift',
            referenceId: gift.id,
            idempotencyKey: `${input.idempotencyKey}:asset:${index}`,
            actor,
          },
          tx,
        )
        await tx.insert(economyGiftItems).values({
          giftId: gift.id,
          itemKind: 'asset',
          assetGrantId: grant.id,
          assetDefinitionId: grant.definitionId,
          quantity,
        })
      }

      await this.deps.economyAuditService.record(
        {
          actor,
          action: 'gift.send',
          resource: { kind: 'gift', id: gift.id },
          scope: { kind: 'user', id: input.recipientUserId },
          idempotencyKey: input.idempotencyKey,
          request: input,
          result: 'succeeded',
          metadata: { currencyAmount, assetCount: assets.length },
        },
        tx,
      )

      const response = { gift }
      await this.deps.economyIdempotencyService.complete(
        {
          actorUserId: input.senderUserId,
          key: input.idempotencyKey,
          action: 'economy.gift.send',
          referenceId: gift.id,
          response,
        },
        tx,
      )
      return response
    })
  }

  async listForUser(userId: string) {
    return this.deps.db.select().from(economyGifts).where(eq(economyGifts.recipientUserId, userId))
  }
}
