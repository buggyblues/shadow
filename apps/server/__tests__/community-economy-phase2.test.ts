import { describe, expect, it, vi } from 'vitest'
import {
  communityAssetGrants,
  communityAssetTransferLogs,
  economyGiftItems,
  economyGifts,
  economyTips,
  settlementAccounts,
  settlementLines,
} from '../src/db/schema'
import { CommunityAssetService } from '../src/services/community-asset.service'
import { GiftService } from '../src/services/gift.service'
import { SettlementService } from '../src/services/settlement.service'
import { TipService } from '../src/services/tip.service'

function createTx(returningByTable: Map<unknown, unknown[]>, inserts: unknown[]) {
  return {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((data: unknown) => {
        inserts.push({ table, data })
        return {
          returning: vi.fn(async () => returningByTable.get(table) ?? []),
        }
      }),
    })),
  }
}

describe('Community economy phase 2 tips', () => {
  it('debits the sender, creates a settlement line, audits, and completes idempotency', async () => {
    const tip = {
      id: '11111111-1111-4111-8111-111111111111',
      senderUserId: 'sender-1',
      recipientUserId: 'recipient-1',
      amount: 100,
      sellerNet: 100,
      status: 'succeeded',
    }
    const inserts: unknown[] = []
    const tx = createTx(new Map([[economyTips, [tip]]]), inserts)
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: vi.fn(async () => [{ count: 0, amount: 0 }]),
        }),
      })),
      transaction: vi.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
    }
    const ledgerService = { debit: vi.fn(async () => undefined) }
    const settlementService = { createLine: vi.fn(async () => ({ id: 'settlement-line-1' })) }
    const economyIdempotencyService = {
      getCompleted: vi.fn(async () => null),
      begin: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
    }
    const economyAuditService = { record: vi.fn(async () => undefined) }
    const economyPolicyService = { authorize: vi.fn(async () => ({ ok: true })) }
    const service = new TipService({
      db: db as any,
      ledgerService: ledgerService as any,
      settlementService: settlementService as any,
      economyPolicyService: economyPolicyService as any,
      economyAuditService: economyAuditService as any,
      economyIdempotencyService: economyIdempotencyService as any,
    })

    const result = await service.sendTip({
      senderUserId: 'sender-1',
      recipientUserId: 'recipient-1',
      amount: 100,
      idempotencyKey: 'tip-idempotency-key',
    })

    expect(result).toEqual({ tip })
    expect(economyPolicyService.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tip.send',
        dataClass: 'financial',
        targetUserId: 'sender-1',
      }),
    )
    expect(ledgerService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'sender-1',
        amount: 100,
        referenceId: tip.id,
        referenceType: 'tip',
      }),
      tx,
    )
    expect(settlementService.createLine).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerUserId: 'recipient-1',
        sourceType: 'tip',
        sourceId: tip.id,
        grossAmount: 100,
      }),
      tx,
    )
    expect(economyIdempotencyService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'sender-1',
        key: 'tip-idempotency-key',
        action: 'economy.tip.send',
        referenceId: tip.id,
      }),
      tx,
    )
  })

  it('rejects self tips before mutating state', async () => {
    const db = { transaction: vi.fn() }
    const service = new TipService({
      db: db as any,
      ledgerService: {} as any,
      settlementService: {} as any,
      economyPolicyService: {} as any,
      economyAuditService: {} as any,
      economyIdempotencyService: {} as any,
    })

    await expect(
      service.sendTip({
        senderUserId: 'user-1',
        recipientUserId: 'user-1',
        amount: 1,
        idempotencyKey: 'tip-idempotency-key',
      }),
    ).rejects.toMatchObject({ code: 'TIP_SELF_NOT_ALLOWED' })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('rejects tips that exceed daily service-layer limits', async () => {
    const previous = process.env.SHADOW_TIP_DAILY_COUNT_LIMIT
    process.env.SHADOW_TIP_DAILY_COUNT_LIMIT = '1'
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: vi.fn(async () => [{ count: 1, amount: 0 }]),
        }),
      })),
      transaction: vi.fn(),
    }
    const service = new TipService({
      db: db as any,
      ledgerService: {} as any,
      settlementService: {} as any,
      economyPolicyService: { authorize: vi.fn(async () => ({ ok: true })) } as any,
      economyAuditService: {} as any,
      economyIdempotencyService: {
        getCompleted: vi.fn(async () => null),
      } as any,
    })

    await expect(
      service.sendTip({
        senderUserId: 'sender-1',
        recipientUserId: 'recipient-1',
        amount: 1,
        idempotencyKey: 'tip-idempotency-key',
      }),
    ).rejects.toMatchObject({ code: 'TIP_DAILY_COUNT_LIMIT_EXCEEDED' })
    expect(db.transaction).not.toHaveBeenCalled()
    if (previous == null) delete process.env.SHADOW_TIP_DAILY_COUNT_LIMIT
    else process.env.SHADOW_TIP_DAILY_COUNT_LIMIT = previous
  })
})

describe('Community economy phase 2 gifts', () => {
  it('moves currency and assets in one idempotent gift transaction', async () => {
    const gift = {
      id: '22222222-2222-4222-8222-222222222222',
      senderUserId: 'sender-1',
      recipientUserId: 'recipient-1',
      status: 'succeeded',
    }
    const assetGrant = {
      id: '33333333-3333-4333-8333-333333333333',
      definitionId: '44444444-4444-4444-8444-444444444444',
    }
    const inserts: unknown[] = []
    const tx = createTx(new Map([[economyGifts, [gift]]]), inserts)
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: vi.fn(async () => [{ economyStatus: 'normal' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: vi.fn(async () => [{ count: 0 }]),
          }),
        }),
      transaction: vi.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx)),
    }
    const ledgerService = {
      debit: vi.fn(async () => undefined),
    }
    const settlementService = { createLine: vi.fn(async () => ({ id: 'gift-settlement-1' })) }
    const communityAssetService = {
      transferGrant: vi.fn(async () => assetGrant),
    }
    const economyIdempotencyService = {
      getCompleted: vi.fn(async () => null),
      begin: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
    }
    const service = new GiftService({
      db: db as any,
      ledgerService: ledgerService as any,
      communityAssetService: communityAssetService as any,
      economyPolicyService: { authorize: vi.fn(async () => ({ ok: true })) } as any,
      economyAuditService: { record: vi.fn(async () => undefined) } as any,
      economyIdempotencyService: economyIdempotencyService as any,
      settlementService: settlementService as any,
    })

    const result = await service.sendGift({
      senderUserId: 'sender-1',
      recipientUserId: 'recipient-1',
      currencies: [{ currencyCode: 'shrimp_coin', amount: 25 }],
      assets: [{ assetGrantId: 'source-grant-1', quantity: 2 }],
      idempotencyKey: 'gift-idempotency-key',
    })

    expect(result).toEqual({ gift })
    expect(ledgerService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'sender-1',
        amount: 25,
        referenceId: gift.id,
        referenceType: 'gift',
      }),
      tx,
    )
    expect(settlementService.createLine).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerUserId: 'recipient-1',
        sourceType: 'gift',
        sourceId: gift.id,
        grossAmount: 25,
      }),
      tx,
    )
    expect(communityAssetService.transferGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'sender-1',
        recipientUserId: 'recipient-1',
        grantId: 'source-grant-1',
        quantity: 2,
        referenceId: gift.id,
        idempotencyKey: 'gift-idempotency-key:asset:0',
        actor: expect.objectContaining({ kind: 'user' }),
      }),
      tx,
    )
    expect(inserts).toContainEqual(
      expect.objectContaining({
        table: economyGiftItems,
        data: expect.objectContaining({
          giftId: gift.id,
          itemKind: 'asset',
          assetGrantId: assetGrant.id,
          assetDefinitionId: assetGrant.definitionId,
        }),
      }),
    )
    expect(economyIdempotencyService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'sender-1',
        key: 'gift-idempotency-key',
        action: 'economy.gift.send',
        referenceId: gift.id,
      }),
      tx,
    )
  })

  it('rejects gifts to economy-restricted recipients before mutating state', async () => {
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn(async () => [{ economyStatus: 'economy_restricted' }]),
          }),
        }),
      })),
      transaction: vi.fn(),
    }
    const service = new GiftService({
      db: db as any,
      ledgerService: {} as any,
      communityAssetService: {} as any,
      economyPolicyService: { authorize: vi.fn(async () => ({ ok: true })) } as any,
      economyAuditService: {} as any,
      economyIdempotencyService: {
        getCompleted: vi.fn(async () => null),
      } as any,
      settlementService: {} as any,
    })

    await expect(
      service.sendGift({
        senderUserId: 'sender-1',
        recipientUserId: 'recipient-1',
        currencies: [{ currencyCode: 'shrimp_coin', amount: 1 }],
        idempotencyKey: 'gift-idempotency-key',
      }),
    ).rejects.toMatchObject({ code: 'GIFT_RECIPIENT_ECONOMY_RESTRICTED' })
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

describe('Community economy phase 2 settlements', () => {
  function createSettlementUpdateDb(line: Record<string, unknown>, updatedStatus: string) {
    const updates: Array<{ table: unknown; data: unknown }> = []
    const db = {
      update: vi.fn((table: unknown) => ({
        set: vi.fn((data: unknown) => {
          updates.push({ table, data })
          return {
            where: vi.fn(() => {
              if (table === settlementLines) {
                return {
                  returning: vi.fn(async () => [{ ...line, status: updatedStatus }]),
                }
              }
              return undefined
            }),
          }
        }),
      })),
    }
    return { db, updates }
  }

  it('moves due pending settlement lines into available balance', async () => {
    const line = {
      id: 'settlement-line-1',
      sellerUserId: 'seller-1',
      sourceType: 'tip',
      sourceId: 'tip-1',
      netAmount: 90,
      status: 'pending',
    }
    const { db, updates } = createSettlementUpdateDb(line, 'available')
    Object.assign(db, {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn(async () => [line]),
          }),
        }),
      })),
    })
    const service = new SettlementService({ db: db as any, ledgerService: {} as any })

    const released = await service.makePendingAvailableForUser('seller-1')

    expect(released).toHaveLength(1)
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: settlementLines,
          data: expect.objectContaining({ status: 'available' }),
        }),
        expect.objectContaining({ table: settlementAccounts }),
      ]),
    )
  })

  it('reverses unsettled settlement lines and removes them from held balance', async () => {
    const line = {
      id: 'settlement-line-1',
      sellerUserId: 'seller-1',
      sourceType: 'order',
      sourceId: 'order-1',
      netAmount: 90,
      status: 'held',
    }
    const { db, updates } = createSettlementUpdateDb(line, 'reversed')
    Object.assign(db, {
      select: vi.fn(() => ({
        from: () => ({
          where: vi.fn(async () => [line]),
        }),
      })),
    })
    const service = new SettlementService({ db: db as any, ledgerService: {} as any })

    const reversed = await service.reverseLinesForSource({
      sourceType: 'order',
      sourceId: 'order-1',
      reason: 'refund',
    })

    expect(reversed).toHaveLength(1)
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: settlementLines,
          data: expect.objectContaining({ status: 'reversed', refundAmount: 90 }),
        }),
        expect.objectContaining({ table: settlementAccounts }),
      ]),
    )
  })
})

describe('Community economy phase 2 assets', () => {
  it('returns the recipient grant for duplicate asset transfer idempotency keys', async () => {
    const recipientGrant = {
      id: '55555555-5555-4555-8555-555555555555',
      definitionId: '44444444-4444-4444-8444-444444444444',
      ownerUserId: 'recipient-1',
    }
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: (table: unknown) => {
            expect(table).toBe(communityAssetTransferLogs)
            return {
              where: () => ({
                limit: vi.fn(async () => [{ grantId: recipientGrant.id }]),
              }),
            }
          },
        })
        .mockReturnValueOnce({
          from: (table: unknown) => {
            expect(table).toBe(communityAssetGrants)
            return {
              where: () => ({
                limit: vi.fn(async () => [recipientGrant]),
              }),
            }
          },
        }),
      update: vi.fn(),
    }
    const service = new CommunityAssetService({
      db: db as any,
      economyPolicyService: {} as any,
      economyAuditService: {} as any,
    })

    const result = await service.transferGrant({
      actorUserId: 'sender-1',
      recipientUserId: 'recipient-1',
      grantId: 'source-grant-1',
      referenceType: 'gift',
      referenceId: 'gift-1',
      idempotencyKey: 'gift-idempotency-key:asset:0',
    })

    expect(result).toBe(recipientGrant)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('locks active grants through policy, transfer log, and audit', async () => {
    const sourceGrant = {
      id: '55555555-5555-4555-8555-555555555555',
      definitionId: '44444444-4444-4444-8444-444444444444',
      ownerUserId: 'sender-1',
      remainingQuantity: 1,
      status: 'active',
    }
    const definition = {
      id: sourceGrant.definitionId,
      giftable: true,
      consumable: true,
    }
    const lockedGrant = { ...sourceGrant, status: 'locked' }
    const inserts: unknown[] = []
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: vi.fn(async () => []),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: vi.fn(async () => [{ grant: sourceGrant, definition }]),
              }),
            }),
          }),
        }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [lockedGrant]),
          })),
        })),
      })),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((data: unknown) => {
          inserts.push({ table, data })
          return {}
        }),
      })),
    }
    const economyPolicyService = { authorize: vi.fn(async () => ({ ok: true })) }
    const economyAuditService = { record: vi.fn(async () => undefined) }
    const service = new CommunityAssetService({
      db: db as any,
      economyPolicyService: economyPolicyService as any,
      economyAuditService: economyAuditService as any,
    })

    const result = await service.lockGrant({
      actorUserId: 'sender-1',
      grantId: sourceGrant.id,
      idempotencyKey: 'asset-lock-idempotency-key',
    })

    expect(result).toEqual(lockedGrant)
    expect(economyPolicyService.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'asset.lock',
        requiredScope: 'economy:assets:write',
        targetUserId: 'sender-1',
      }),
    )
    expect(inserts).toContainEqual(
      expect.objectContaining({
        table: communityAssetTransferLogs,
        data: expect.objectContaining({
          grantId: sourceGrant.id,
          action: 'lock',
          idempotencyKey: 'asset-lock-idempotency-key',
        }),
      }),
    )
    expect(economyAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'asset.lock',
        idempotencyKey: 'asset-lock-idempotency-key',
        result: 'succeeded',
      }),
      db,
    )
  })
})
