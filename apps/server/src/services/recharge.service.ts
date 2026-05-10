import { createHash } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
import type { RechargeDao } from '../dao/recharge.dao'
import type { Database } from '../db'
import { paymentOrders, paymentProviderEvents, riskCases } from '../db/schema'
import {
  CUSTOM_AMOUNT_MAX,
  CUSTOM_AMOUNT_MIN,
  generateOrderNo,
  RECHARGE_TIERS,
  type RechargeTierKey,
  shrimpCoinsToUsdCents,
  stripe,
} from '../lib/stripe'
import { type Actor, actorFromUserId } from '../security/actor'
import type { EconomyAuditService } from './economy-audit.service'
import type { EconomyIdempotencyService } from './economy-idempotency.service'
import type { EconomyPolicyService } from './economy-policy.service'
import type { LedgerService } from './ledger.service'
import type { NotificationTriggerService } from './notification-trigger.service'

function supportedStripeCurrencies() {
  return new Set(
    (process.env.SUPPORTED_STRIPE_CURRENCIES ?? 'usd')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function hashPayload(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export class RechargeService {
  constructor(
    private deps: {
      rechargeDao: RechargeDao
      db: Database
      ledgerService: LedgerService
      economyPolicyService: EconomyPolicyService
      economyAuditService: EconomyAuditService
      economyIdempotencyService: EconomyIdempotencyService
      notificationTriggerService: NotificationTriggerService
    },
  ) {}

  /** Get recharge configuration (tiers, limits) for the client. */
  getConfig() {
    return {
      tiers: Object.entries(RECHARGE_TIERS).map(([key, tier]) => ({
        key,
        shrimpCoins: tier.shrimpCoins,
        usdCents: tier.usdCents,
        label: tier.label,
      })),
      customAmountMin: CUSTOM_AMOUNT_MIN,
      customAmountMax: CUSTOM_AMOUNT_MAX,
      exchangeRate: 100, // 100 shrimp coins per $1
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    }
  }

  /**
   * Create a Stripe PaymentIntent and a local payment_order record.
   * Returns the clientSecret for the frontend Stripe Element.
   */
  async createPaymentIntent(
    userId: string,
    tier: RechargeTierKey | 'custom',
    customAmount?: number,
    currency = 'usd',
    actor: Actor = actorFromUserId(userId),
    idempotencyKey?: string,
  ) {
    if (!stripe) {
      throw Object.assign(new Error('Payment service unavailable'), { status: 503 })
    }

    await this.deps.economyPolicyService.authorize({
      actor,
      action: 'recharge.create',
      resource: { kind: 'payment_order' },
      scope: { kind: 'wallet', id: userId },
      dataClass: 'financial',
      targetUserId: userId,
    })

    if (!idempotencyKey) {
      throw Object.assign(new Error('idempotencyKey is required'), {
        status: 400,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      })
    }

    const cached = await this.deps.economyIdempotencyService.getCompleted<{
      clientSecret: string
      paymentIntentId: string
      orderNo: string
      amount: { shrimpCoins: number; usdCents: number }
    }>({
      actorUserId: userId,
      key: idempotencyKey,
      action: 'recharge.create-intent',
    })
    if (cached) return cached

    const normalizedCurrency = currency.toLowerCase()
    if (!supportedStripeCurrencies().has(normalizedCurrency)) {
      throw Object.assign(new Error('Unsupported payment currency'), {
        status: 400,
        code: 'UNSUPPORTED_PAYMENT_CURRENCY',
      })
    }

    // Determine amounts
    let shrimpCoins: number
    let usdCents: number

    if (tier === 'custom') {
      if (!customAmount || customAmount < CUSTOM_AMOUNT_MIN || customAmount > CUSTOM_AMOUNT_MAX) {
        throw Object.assign(
          new Error(
            `Custom amount must be between ${CUSTOM_AMOUNT_MIN} and ${CUSTOM_AMOUNT_MAX} shrimp coins`,
          ),
          { status: 400 },
        )
      }
      shrimpCoins = customAmount
      usdCents = shrimpCoinsToUsdCents(customAmount)
    } else {
      const tierConfig = RECHARGE_TIERS[tier]
      if (!tierConfig) {
        throw Object.assign(new Error('Invalid recharge tier'), { status: 400 })
      }
      shrimpCoins = tierConfig.shrimpCoins
      usdCents = tierConfig.usdCents
    }

    if (usdCents < 100) {
      throw Object.assign(new Error('Minimum payment amount is $1.00'), { status: 400 })
    }

    const orderNo = generateOrderNo()

    await this.deps.economyIdempotencyService.begin({
      actorUserId: userId,
      key: idempotencyKey,
      action: 'recharge.create-intent',
    })

    try {
      // Create Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: usdCents,
          currency: normalizedCurrency,
          automatic_payment_methods: { enabled: true },
          metadata: {
            userId,
            orderNo,
            shrimpCoins: String(shrimpCoins),
          },
        },
        { idempotencyKey: `recharge-${userId}-${idempotencyKey}` },
      )

      // Create local payment order record
      const order = await this.deps.rechargeDao.createPaymentOrder({
        userId,
        orderNo,
        shrimpCoinAmount: shrimpCoins,
        usdAmount: usdCents,
        stripePaymentIntentId: paymentIntent.id,
      })

      await this.deps.economyAuditService.record({
        actor,
        action: 'recharge.create-intent',
        resource: { kind: 'payment_order', id: order.id },
        scope: { kind: 'wallet', id: userId },
        idempotencyKey,
        request: { tier, customAmount, currency: normalizedCurrency },
        result: 'succeeded',
        metadata: { stripePaymentIntentId: paymentIntent.id, shrimpCoins, usdCents },
      })

      const response = {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        orderNo: order.orderNo,
        amount: {
          shrimpCoins,
          usdCents,
        },
      }

      await this.deps.economyIdempotencyService.complete({
        actorUserId: userId,
        key: idempotencyKey,
        action: 'recharge.create-intent',
        referenceId: order.id,
        response,
      })

      return response
    } catch (err) {
      const errorCode = (err as { code?: string }).code ?? 'RECHARGE_CREATE_INTENT_FAILED'
      await this.deps.economyIdempotencyService.fail({
        actorUserId: userId,
        key: idempotencyKey,
        action: 'recharge.create-intent',
        error: errorCode,
      })
      await this.deps.economyAuditService.record({
        actor,
        action: 'recharge.create-intent',
        resource: { kind: 'payment_order' },
        scope: { kind: 'wallet', id: userId },
        idempotencyKey,
        request: { tier, customAmount, currency: normalizedCurrency },
        result: 'failed',
        errorCode,
      })
      throw err
    }
  }

  /**
   * Handle Stripe webhook events.
   * This is the primary way payments are confirmed — NOT client-side confirmation.
   */
  async handleWebhookEvent(event: {
    id?: string
    type: string
    data: { object: Record<string, unknown> }
  }) {
    const providerEventId =
      event.id ??
      `${event.type}:${typeof event.data.object.id === 'string' ? event.data.object.id : hashPayload(event)}`
    const payloadHash = hashPayload(event)
    const inserted = await this.deps.db
      .insert(paymentProviderEvents)
      .values({
        provider: 'stripe',
        providerEventId,
        eventType: event.type,
        payloadHash,
        status: 'processing',
      })
      .onConflictDoNothing()
      .returning({ id: paymentProviderEvents.id })

    if (inserted.length === 0) return

    const obj = event.data.object

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(obj)
          break
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(obj)
          break
        case 'payment_intent.canceled':
          await this.handlePaymentCanceled(obj)
          break
        case 'charge.dispute.created':
          await this.handleDisputeCreated(obj)
          break
        default:
          await this.markProviderEvent(providerEventId, 'ignored')
          return
      }
      await this.markProviderEvent(providerEventId, 'processed')
    } catch (err) {
      await this.markProviderEvent(providerEventId, 'failed', {
        errorCode: (err as { code?: string }).code ?? 'STRIPE_WEBHOOK_PROCESSING_FAILED',
      })
      throw err
    }
  }

  private async markProviderEvent(
    providerEventId: string,
    status: 'processed' | 'failed' | 'ignored',
    opts?: { errorCode?: string },
  ) {
    await this.deps.db
      .update(paymentProviderEvents)
      .set({
        status,
        errorCode: opts?.errorCode,
        processedAt: status === 'processed' || status === 'ignored' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentProviderEvents.provider, 'stripe'),
          eq(paymentProviderEvents.providerEventId, providerEventId),
        ),
      )
  }

  private async handlePaymentSucceeded(paymentIntent: Record<string, unknown>) {
    const piId = paymentIntent.id as string
    const order = await this.deps.rechargeDao.findByPaymentIntentId(piId)
    if (!order) return

    // Idempotency: skip if already succeeded
    if (order.status === 'succeeded') return

    const paidAt = new Date()
    const credited = await this.deps.db.transaction(async (tx) => {
      const [updatedOrder] = await tx
        .update(paymentOrders)
        .set({ status: 'succeeded', paidAt, updatedAt: new Date() })
        .where(and(eq(paymentOrders.id, order.id), ne(paymentOrders.status, 'succeeded')))
        .returning()
      if (!updatedOrder) return null

      const balanceAfter = await this.deps.ledgerService.credit(
        {
          userId: updatedOrder.userId,
          amount: updatedOrder.shrimpCoinAmount,
          type: 'topup',
          referenceId: updatedOrder.id,
          referenceType: 'payment_order',
          note: `充值 ${updatedOrder.shrimpCoinAmount} 虾币 (${updatedOrder.orderNo})`,
        },
        tx,
      )
      return { order: updatedOrder, balanceAfter }
    })
    if (!credited) return

    await this.deps.notificationTriggerService.triggerRechargeSucceeded({
      userId: credited.order.userId,
      orderId: credited.order.id,
      orderNo: credited.order.orderNo,
      shrimpCoins: credited.order.shrimpCoinAmount,
      newBalance: credited.balanceAfter,
    })
  }

  private async handlePaymentFailed(paymentIntent: Record<string, unknown>) {
    const piId = paymentIntent.id as string
    const order = await this.deps.rechargeDao.findByPaymentIntentId(piId)
    if (!order || order.status === 'succeeded') return

    await this.deps.rechargeDao.updateStatus(order.id, 'failed', {
      failedAt: new Date(),
    })
  }

  private async handlePaymentCanceled(paymentIntent: Record<string, unknown>) {
    const piId = paymentIntent.id as string
    const order = await this.deps.rechargeDao.findByPaymentIntentId(piId)
    if (!order || order.status === 'succeeded') return

    await this.deps.rechargeDao.updateStatus(order.id, 'cancelled', {
      cancelledAt: new Date(),
    })
  }

  private async handleDisputeCreated(dispute: Record<string, unknown>) {
    const piId = (dispute.payment_intent as string) ?? null
    if (!piId) return
    const order = await this.deps.rechargeDao.findByPaymentIntentId(piId)
    if (!order) return

    await this.deps.rechargeDao.updateStatus(order.id, 'disputed')
    await this.deps.db.insert(riskCases).values({
      userId: order.userId,
      resourceType: 'payment_order',
      resourceId: order.id,
      kind: 'payment_dispute',
      status: 'open',
      severity: 'high',
      metadata: { stripePaymentIntentId: piId, disputeId: dispute.id },
    })

    await this.deps.economyAuditService.record({
      actor: {
        kind: 'system',
        service: 'stripe-webhook',
        capabilities: ['economy:recharge:write'],
      },
      action: 'recharge.dispute.created',
      resource: { kind: 'payment_order', id: order.id },
      scope: { kind: 'wallet', id: order.userId },
      result: 'succeeded',
      metadata: { stripePaymentIntentId: piId, orderNo: order.orderNo },
    })
  }

  /** Get a user's recharge history. */
  async getHistory(userId: string, limit = 20, offset = 0) {
    const [items, total] = await Promise.all([
      this.deps.rechargeDao.getHistory(userId, limit, offset),
      this.deps.rechargeDao.countByUserId(userId),
    ])
    return { items, total, limit, offset }
  }

  /** Confirm payment status after 3D Secure or async flow. */
  async confirmPayment(userId: string, paymentIntentId: string) {
    if (!stripe) {
      throw Object.assign(new Error('Payment service unavailable'), { status: 503 })
    }

    const order = await this.deps.rechargeDao.findByPaymentIntentId(paymentIntentId)
    if (!order || order.userId !== userId) {
      throw Object.assign(new Error('Payment order not found'), { status: 404 })
    }

    // Fetch latest status from Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (pi.status === 'succeeded' && order.status !== 'succeeded') {
      // Trigger the same flow as webhook
      await this.handlePaymentSucceeded({ id: paymentIntentId })
    }

    // Return updated order
    const updated = await this.deps.rechargeDao.findById(order.id)
    return updated
  }
}
