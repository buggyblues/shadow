import type { Server as SocketIOServer } from 'socket.io'
import type { RechargeDao } from '../dao/recharge.dao'
import type { WalletDao } from '../dao/wallet.dao'
import {
  CUSTOM_AMOUNT_MAX,
  CUSTOM_AMOUNT_MIN,
  generateOrderNo,
  RECHARGE_TIERS,
  type RechargeTierKey,
  shrimpCoinsToUsdCents,
  stripe,
} from '../lib/stripe'
import { pushNotification } from '../ws/notification.gateway'
import type { NotificationService } from './notification.service'

export class RechargeService {
  constructor(
    private deps: {
      rechargeDao: RechargeDao
      walletDao: WalletDao
      notificationService: NotificationService
      io: SocketIOServer
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
  ) {
    if (!stripe) {
      throw Object.assign(new Error('Payment service unavailable'), { status: 503 })
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

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: usdCents,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId,
          orderNo,
          shrimpCoins: String(shrimpCoins),
        },
      },
      { idempotencyKey: `recharge-${orderNo}` },
    )

    // Create local payment order record
    const order = await this.deps.rechargeDao.createPaymentOrder({
      userId,
      orderNo,
      shrimpCoinAmount: shrimpCoins,
      usdAmount: usdCents,
      stripePaymentIntentId: paymentIntent.id,
    })

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      orderNo: order.orderNo,
      amount: {
        shrimpCoins,
        usdCents,
      },
    }
  }

  /**
   * Handle Stripe webhook events.
   * This is the primary way payments are confirmed — NOT client-side confirmation.
   */
  async handleWebhookEvent(event: { type: string; data: { object: Record<string, unknown> } }) {
    const obj = event.data.object

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
    }
  }

  private async handlePaymentSucceeded(paymentIntent: Record<string, unknown>) {
    const piId = paymentIntent.id as string
    const order = await this.deps.rechargeDao.findByPaymentIntentId(piId)
    if (!order) return

    // Idempotency: skip if already succeeded
    if (order.status === 'succeeded') return

    // Credit wallet
    const wallet = await this.deps.walletDao.getOrCreate(order.userId)
    const newBalance = wallet.balance + order.shrimpCoinAmount
    await this.deps.walletDao.credit(wallet.id, order.shrimpCoinAmount)
    await this.deps.walletDao.addTransaction({
      walletId: wallet.id,
      type: 'topup',
      amount: order.shrimpCoinAmount,
      balanceAfter: newBalance,
      referenceId: order.id,
      referenceType: 'payment_order',
      note: `充值 ${order.shrimpCoinAmount} 虾币 (${order.orderNo})`,
    })

    // Update order status
    await this.deps.rechargeDao.updateStatus(order.id, 'succeeded', {
      paidAt: new Date(),
    })

    // Persist notification to DB for offline users
    await this.deps.notificationService.create({
      userId: order.userId,
      type: 'system',
      title: '充值成功',
      body: `${order.shrimpCoinAmount} 虾币已到账`,
      referenceId: order.id,
      referenceType: 'payment_order',
    })

    // Send real-time notification via WebSocket
    pushNotification(this.deps.io, order.userId, {
      type: 'recharge_success',
      title: '充值成功',
      body: `${order.shrimpCoinAmount} 虾币已到账`,
      data: {
        orderNo: order.orderNo,
        shrimpCoins: order.shrimpCoinAmount,
        newBalance,
      },
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
    // Log the dispute for manual review
    console.error(`[DISPUTE] Order ${order.orderNo} disputed. PaymentIntent: ${piId}`)
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
