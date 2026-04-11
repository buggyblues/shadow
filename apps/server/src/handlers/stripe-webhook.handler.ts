import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { STRIPE_WEBHOOK_SECRET, stripe } from '../lib/stripe'
import { logger } from '../lib/logger'

/**
 * Stripe Webhook Handler.
 * This endpoint does NOT use authMiddleware — authentication is via
 * Stripe signature verification instead.
 */
export function createStripeWebhookHandler(container: AppContainer) {
  const h = new Hono()

  h.post('/', async (c) => {
    if (!stripe) {
      logger.error('[Stripe Webhook] Payment service unavailable — STRIPE_SECRET_KEY not set')
      return c.json({ ok: false, error: 'Payment service unavailable' }, 503)
    }

    const signature = c.req.header('stripe-signature')
    if (!signature) {
      logger.warn('[Stripe Webhook] Missing stripe-signature header')
      return c.json({ ok: false, error: 'Missing Stripe signature' }, 400)
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text()

    let event: ReturnType<typeof stripe.webhooks.constructEvent> extends infer T ? T : never
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ err }, `[Stripe Webhook] Signature verification failed: ${message}`)
      return c.json({ ok: false, error: 'Invalid signature' }, 400)
    }

    // Process the event
    try {
      const rechargeService = container.resolve('rechargeService')
      await rechargeService.handleWebhookEvent(
        event as unknown as {
          type: string
          data: { object: Record<string, unknown> }
        },
      )
    } catch (err) {
      logger.error({ err }, '[Stripe Webhook] Error processing event')
      // Return 500 so Stripe retries the webhook delivery automatically
      return c.json({ ok: false, error: 'Processing error, will retry' }, 500)
    }

    return c.json({ received: true })
  })

  return h
}
