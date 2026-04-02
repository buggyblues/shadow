import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { STRIPE_WEBHOOK_SECRET, stripe } from '../lib/stripe'

/**
 * Stripe Webhook Handler.
 * This endpoint does NOT use authMiddleware — authentication is via
 * Stripe signature verification instead.
 */
export function createStripeWebhookHandler(container: AppContainer) {
  const h = new Hono()

  h.post('/', async (c) => {
    if (!stripe) {
      return c.json({ error: 'Payment service unavailable' }, 503)
    }

    const signature = c.req.header('stripe-signature')
    if (!signature) {
      return c.json({ error: 'Missing Stripe signature' }, 400)
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text()

    let event: ReturnType<typeof stripe.webhooks.constructEvent> extends infer T ? T : never
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Stripe Webhook] Signature verification failed: ${message}`)
      return c.json({ error: 'Invalid signature' }, 400)
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
      console.error('[Stripe Webhook] Error processing event:', err)
      // Return 200 to prevent Stripe from retrying — we've logged the error
      return c.json({ received: true, error: 'Processing error' }, 200)
    }

    return c.json({ received: true })
  })

  return h
}
