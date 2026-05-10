import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { apiError } from '../lib/api-error'
import { authMiddleware } from '../middleware/auth.middleware'

const idempotencyKeySchema = z.string().min(8).max(200)

const tipSchema = z.object({
  recipientUserId: z.string().uuid(),
  amount: z.number().int().positive().max(100_000_000),
  message: z.string().max(1000).optional(),
  context: z
    .object({
      kind: z.string().min(1).max(80),
      id: z.string().min(1).max(160),
    })
    .optional(),
  idempotencyKey: idempotencyKeySchema,
})

const giftSchema = z.object({
  recipientUserId: z.string().uuid(),
  assets: z
    .array(
      z.object({
        assetGrantId: z.string().uuid(),
        quantity: z.number().int().positive().max(1000).optional(),
      }),
    )
    .max(20)
    .optional(),
  currencies: z
    .array(
      z.object({
        currencyCode: z.literal('shrimp_coin'),
        amount: z.number().int().positive().max(100_000_000),
      }),
    )
    .max(5)
    .optional(),
  message: z.string().max(1000).optional(),
  idempotencyKey: idempotencyKeySchema,
})

const consumeAssetSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
})

const assetLifecycleSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().max(300).optional(),
})

export function createEconomyHandler(container: AppContainer) {
  const h = new Hono()
  h.use('*', authMiddleware)

  h.get('/assets', async (c) => {
    const user = c.get('user')
    const communityAssetService = container.resolve('communityAssetService')
    return c.json({ assets: await communityAssetService.listUserAssets(user.userId) })
  })

  h.get('/assets/:grantId', async (c) => {
    const user = c.get('user')
    const communityAssetService = container.resolve('communityAssetService')
    const row = await communityAssetService.getGrant(c.req.param('grantId'))
    if (!row) throw apiError('COMMUNITY_ASSET_GRANT_NOT_FOUND', 404)
    if (row.grant.ownerUserId !== user.userId) {
      throw apiError('COMMUNITY_ASSET_OWNER_MISMATCH', 403)
    }
    return c.json(row)
  })

  h.post('/assets/:grantId/consume', zValidator('json', consumeAssetSchema), async (c) => {
    const user = c.get('user')
    const communityAssetService = container.resolve('communityAssetService')
    const input = c.req.valid('json')
    return c.json({
      grant: await communityAssetService.consume({
        actorUserId: user.userId,
        grantId: c.req.param('grantId'),
        idempotencyKey: input.idempotencyKey,
        actor: c.get('actor'),
      }),
    })
  })

  h.post('/assets/:grantId/lock', zValidator('json', assetLifecycleSchema), async (c) => {
    const user = c.get('user')
    const communityAssetService = container.resolve('communityAssetService')
    const input = c.req.valid('json')
    return c.json({
      grant: await communityAssetService.lockGrant({
        actorUserId: user.userId,
        grantId: c.req.param('grantId'),
        idempotencyKey: input.idempotencyKey,
        actor: c.get('actor'),
      }),
    })
  })

  h.post('/assets/:grantId/unlock', zValidator('json', assetLifecycleSchema), async (c) => {
    const user = c.get('user')
    const communityAssetService = container.resolve('communityAssetService')
    const input = c.req.valid('json')
    return c.json({
      grant: await communityAssetService.unlockGrant({
        actorUserId: user.userId,
        grantId: c.req.param('grantId'),
        idempotencyKey: input.idempotencyKey,
        actor: c.get('actor'),
      }),
    })
  })

  h.post('/assets/:grantId/revoke', zValidator('json', assetLifecycleSchema), async (c) => {
    const user = c.get('user')
    const communityAssetService = container.resolve('communityAssetService')
    const input = c.req.valid('json')
    return c.json({
      grant: await communityAssetService.revokeGrant({
        actorUserId: user.userId,
        grantId: c.req.param('grantId'),
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        actor: c.get('actor'),
      }),
    })
  })

  h.post('/tips', zValidator('json', tipSchema), async (c) => {
    const user = c.get('user')
    const tipService = container.resolve('tipService')
    const input = c.req.valid('json')
    return c.json(
      await tipService.sendTip({
        senderUserId: user.userId,
        recipientUserId: input.recipientUserId,
        amount: input.amount,
        message: input.message,
        context: input.context,
        idempotencyKey: input.idempotencyKey,
        actor: c.get('actor'),
      }),
      201,
    )
  })

  h.get('/tips', async (c) => {
    const user = c.get('user')
    const tipService = container.resolve('tipService')
    return c.json({ tips: await tipService.listForUser(user.userId) })
  })

  h.post('/gifts', zValidator('json', giftSchema), async (c) => {
    const user = c.get('user')
    const giftService = container.resolve('giftService')
    const input = c.req.valid('json')
    return c.json(
      await giftService.sendGift({
        senderUserId: user.userId,
        recipientUserId: input.recipientUserId,
        assets: input.assets,
        currencies: input.currencies,
        message: input.message,
        idempotencyKey: input.idempotencyKey,
        actor: c.get('actor'),
      }),
      201,
    )
  })

  h.get('/gifts', async (c) => {
    const user = c.get('user')
    const giftService = container.resolve('giftService')
    return c.json({ gifts: await giftService.listForUser(user.userId) })
  })

  h.get('/settlements', async (c) => {
    const user = c.get('user')
    const settlementService = container.resolve('settlementService')
    return c.json({
      settlements: await settlementService.listForUser(
        user.userId,
        Number(c.req.query('limit')) || 50,
        Number(c.req.query('offset')) || 0,
      ),
    })
  })

  h.post('/settlements/settle', async (c) => {
    const user = c.get('user')
    const settlementService = container.resolve('settlementService')
    return c.json({ settlements: await settlementService.settleAvailableForUser(user.userId) })
  })

  return h
}
