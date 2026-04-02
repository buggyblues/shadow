import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

const createIntentSchema = z.object({
  tier: z.enum(['1000', '3000', '5000', 'custom']),
  customAmount: z.number().int().optional(),
  currency: z.string().default('usd'),
})

export function createRechargeHandler(container: AppContainer) {
  const h = new Hono()
  h.use('*', authMiddleware)

  /** GET /api/v1/recharge/config — Recharge tiers and configuration */
  h.get('/config', (c) => {
    const rechargeService = container.resolve('rechargeService')
    return c.json(rechargeService.getConfig())
  })

  /** POST /api/v1/recharge/create-intent — Create Stripe PaymentIntent */
  h.post('/create-intent', zValidator('json', createIntentSchema), async (c) => {
    const user = c.get('user')
    const { tier, customAmount, currency } = c.req.valid('json')
    const rechargeService = container.resolve('rechargeService')
    const result = await rechargeService.createPaymentIntent(
      user.userId,
      tier,
      customAmount,
      currency,
    )
    return c.json(result, 201)
  })

  /** GET /api/v1/recharge/history — User's recharge history */
  h.get('/history', async (c) => {
    const user = c.get('user')
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const rechargeService = container.resolve('rechargeService')
    return c.json(await rechargeService.getHistory(user.userId, limit, offset))
  })

  /** POST /api/v1/recharge/confirm — Confirm payment after 3D Secure */
  h.post('/confirm', zValidator('json', z.object({ paymentIntentId: z.string() })), async (c) => {
    const user = c.get('user')
    const { paymentIntentId } = c.req.valid('json')
    const rechargeService = container.resolve('rechargeService')
    const order = await rechargeService.confirmPayment(user.userId, paymentIntentId)
    return c.json(order)
  })

  return h
}
