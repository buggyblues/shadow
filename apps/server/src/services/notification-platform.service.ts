import type { NotificationChannel, NotificationDao } from '../dao/notification.dao'
import type { UserDao } from '../dao/user.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { logger } from '../lib/logger'
import type { NotificationItem } from './notification.service'
import type { NotificationDeliveryService } from './notification-delivery.service'

const DEFAULT_CHANNELS: NotificationChannel[] = [
  'in_app',
  'socket',
  'mobile_push',
  'web_push',
  'email',
  'sms',
  'chat_system',
]

const FORCE_IN_APP_KINDS = new Set([
  'commerce.purchase_completed',
  'commerce.order_shipped',
  'commerce.renewal_failed',
  'commerce.subscription_cancelled',
  'commerce.refund_issued',
  'commerce.force_majeure_decided',
])

const MAX_DELIVERY_ATTEMPTS = 5
const RETRY_BASE_MS = 30_000
const RETRY_MAX_MS = 6 * 60 * 60 * 1000

type DeliveryRecord = Awaited<ReturnType<NotificationDao['createDeliveries']>>[number]

function retryDelayMs(attempt: number) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1))
}

function payloadFor(
  notification: NotificationItem & {
    title?: string
    body?: string | null
    metadata?: Record<string, unknown> | null
  },
) {
  return {
    id: notification.id,
    type: notification.type,
    kind: notification.kind ?? 'system.generic',
    title: notification.title,
    body: notification.body,
    referenceId: notification.referenceId,
    referenceType: notification.referenceType,
    scopeServerId: notification.scopeServerId,
    scopeChannelId: notification.scopeChannelId,
    sourceSpaceAppId: notification.sourceSpaceAppId,
    sourceSpaceAppKey: notification.sourceSpaceAppKey,
    sourceSpaceAppTopicKey: notification.sourceSpaceAppTopicKey,
    metadata: notification.metadata ?? {},
  }
}

function trimJsonPayload(value: Record<string, unknown>) {
  const serialized = JSON.stringify(value)
  if (serialized.length <= 16_384) return value
  return {
    kind: typeof value.kind === 'string' ? value.kind : 'system.generic',
    truncated: true,
  }
}

export class NotificationPlatformService {
  constructor(
    private deps: {
      notificationDao: NotificationDao
      notificationDeliveryService: NotificationDeliveryService
      userDao: UserDao
      safeHttpClient: SafeHttpClient
    },
  ) {}

  async deliver(
    notification:
      | (NotificationItem & {
          title?: string
          body?: string | null
          metadata?: Record<string, unknown> | null
        })
      | null
      | undefined,
    opts?: {
      source?: string
      idempotencyKey?: string | null
      bypassPreferences?: boolean
      enabledChannels?: Array<'in_app' | 'mobile_push' | 'web_push' | 'email'>
    },
  ) {
    if (!notification) return null
    const kind = notification.kind ?? 'system.generic'
    const payload = trimJsonPayload(payloadFor(notification))
    const event = await this.deps.notificationDao.createEvent({
      userId: notification.userId,
      notificationId: notification.id,
      kind,
      source: opts?.source ?? 'notification-trigger',
      idempotencyKey: opts?.idempotencyKey ?? null,
      metadata: payload,
    })
    if (!event) return null

    const preferences = await this.deps.notificationDao.getChannelPreferences(notification.userId)
    const preferenceKey = (channel: NotificationChannel) => `${kind}:${channel}`
    const prefMap = new Map(preferences.map((pref) => [preferenceKey(pref.channel), pref.enabled]))
    const enabled = (channel: NotificationChannel) => {
      if (channel === 'in_app' && FORCE_IN_APP_KINDS.has(kind)) return true
      if (opts?.enabledChannels) {
        const appChannel = channel === 'socket' ? 'in_app' : channel
        if (!opts.enabledChannels.includes(appChannel as (typeof opts.enabledChannels)[number])) {
          return false
        }
      }
      return prefMap.get(preferenceKey(channel)) ?? true
    }

    const base = {
      eventId: event.id,
      notificationId: notification.id,
      userId: notification.userId,
      payload,
    }

    const deliveries = await this.deps.notificationDao.createDeliveries(
      DEFAULT_CHANNELS.map((channel) => ({
        ...base,
        channel,
        status: enabled(channel) ? 'pending' : 'skipped',
        provider: channel === 'socket' ? 'socket.io' : undefined,
      })),
    )

    await Promise.all(
      deliveries
        .filter((delivery) => delivery.status !== 'skipped')
        .map((delivery) => this.attemptDelivery(delivery)),
    )

    return event
  }

  async processDueDeliveries(limit = 50) {
    const deliveries = await this.deps.notificationDao.claimRetryableDeliveries({
      limit,
      maxAttempts: MAX_DELIVERY_ATTEMPTS,
    })
    const results = await Promise.all(deliveries.map((delivery) => this.attemptDelivery(delivery)))
    return {
      claimed: deliveries.length,
      sent: results.filter((result) => result === 'sent').length,
      failed: results.filter((result) => result === 'failed').length,
      deadLettered: results.filter((result) => result === 'dead_letter').length,
    }
  }

  private async attemptDelivery(delivery: DeliveryRecord) {
    try {
      const payload = delivery.payload ?? {}
      let provider = delivery.provider
      if (delivery.channel === 'socket') {
        await this.deps.notificationDeliveryService.deliver({
          ...payload,
          id: delivery.notificationId ?? String(payload.id ?? delivery.id),
          userId: delivery.userId,
        })
      } else if (delivery.channel === 'mobile_push') {
        await this.deliverMobilePush(delivery.userId, payload)
        provider = 'expo'
      } else if (delivery.channel === 'email') {
        await this.deliverEmail(delivery.userId, payload)
        provider = process.env.RESEND_API_KEY ? 'resend' : 'email-webhook'
      } else if (delivery.channel === 'web_push') {
        await this.deliverWebhook('SHADOWOB_WEB_PUSH_WEBHOOK_URL', payload)
        provider = 'web-push-webhook'
      } else if (delivery.channel === 'sms') {
        await this.deliverWebhook('SHADOWOB_SMS_WEBHOOK_URL', payload)
        provider = 'sms-webhook'
      } else if (delivery.channel === 'chat_system') {
        await this.deliverWebhook('SHADOWOB_CHAT_SYSTEM_NOTIFICATION_WEBHOOK_URL', payload)
        provider = 'chat-system-webhook'
      }
      await this.deps.notificationDao.updateDelivery(delivery.id, {
        status: 'sent',
        provider,
        sentAt: new Date(),
        nextAttemptAt: null,
        error: null,
      })
      return 'sent' as const
    } catch (err) {
      const attempts = delivery.attempts + 1
      const deadLettered = attempts >= MAX_DELIVERY_ATTEMPTS
      await this.deps.notificationDao.updateDelivery(delivery.id, {
        status: deadLettered ? 'dead_letter' : 'failed',
        attempts,
        error: err instanceof Error ? err.message : 'Delivery failed',
        nextAttemptAt: deadLettered ? null : new Date(Date.now() + retryDelayMs(attempts)),
      })
      if (deadLettered) {
        logger.error(
          { deliveryId: delivery.id, channel: delivery.channel, attempts },
          'Notification delivery moved to dead letter',
        )
        return 'dead_letter' as const
      }
      return 'failed' as const
    }
  }

  private async deliverMobilePush(userId: string, payload: Record<string, unknown>) {
    const tokens = await this.deps.notificationDao.findActivePushTokens(userId)
    if (tokens.length === 0) return
    const messages = tokens.map((token) => ({
      to: token.token,
      title: typeof payload.title === 'string' ? payload.title : 'Shadow',
      body: typeof payload.body === 'string' ? payload.body : undefined,
      data: payload,
      sound: 'default',
    }))
    const res = await this.deps.safeHttpClient.fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    })
    if (!res.ok) {
      throw new Error(`Expo push failed: ${res.status}`)
    }
  }

  private async deliverEmail(userId: string, payload: Record<string, unknown>) {
    const user = await this.deps.userDao.findById(userId)
    if (!user?.email) return
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const res = await this.deps.safeHttpClient.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: user.email,
          subject: typeof payload.title === 'string' ? payload.title : 'Shadow notification',
          text: typeof payload.body === 'string' ? payload.body : String(payload.title ?? ''),
        }),
      })
      if (!res.ok) throw new Error(`Resend notification email failed: ${res.status}`)
      return
    }
    await this.deliverWebhook('SHADOWOB_NOTIFICATION_EMAIL_WEBHOOK_URL', {
      ...payload,
      to: user.email,
    })
  }

  private async deliverWebhook(envName: string, payload: Record<string, unknown>) {
    const url = process.env[envName]
    if (!url) {
      logger.debug({ envName }, 'Notification delivery webhook not configured')
      return
    }
    const res = await this.deps.safeHttpClient.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`${envName} delivery failed: ${res.status}`)
  }
}
