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
  'commerce.renewal_failed',
  'commerce.subscription_cancelled',
  'commerce.refund_issued',
  'commerce.force_majeure_decided',
])

function payloadFor(
  notification: NotificationItem & {
    title?: string
    body?: string | null
    metadata?: Record<string, unknown> | null
  },
) {
  return {
    id: notification.id,
    kind: notification.kind ?? 'system.generic',
    title: notification.title,
    body: notification.body,
    referenceId: notification.referenceId,
    referenceType: notification.referenceType,
    scopeServerId: notification.scopeServerId,
    scopeChannelId: notification.scopeChannelId,
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
    opts?: { source?: string; idempotencyKey?: string | null; bypassPreferences?: boolean },
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

    for (const delivery of deliveries) {
      if (delivery.status === 'skipped') continue
      try {
        if (delivery.channel === 'in_app') {
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            sentAt: new Date(),
          })
        } else if (delivery.channel === 'socket') {
          await this.deps.notificationDeliveryService.deliver({
            ...notification,
            id: notification.id,
            userId: notification.userId,
          })
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            sentAt: new Date(),
          })
        } else if (delivery.channel === 'mobile_push') {
          await this.deliverMobilePush(notification.userId, payload)
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            provider: 'expo',
            sentAt: new Date(),
          })
        } else if (delivery.channel === 'email') {
          await this.deliverEmail(notification.userId, payload)
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            provider: process.env.RESEND_API_KEY ? 'resend' : 'email-webhook',
            sentAt: new Date(),
          })
        } else if (delivery.channel === 'web_push') {
          await this.deliverWebhook('SHADOW_WEB_PUSH_WEBHOOK_URL', payload)
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            provider: 'web-push-webhook',
            sentAt: new Date(),
          })
        } else if (delivery.channel === 'sms') {
          await this.deliverWebhook('SHADOW_SMS_WEBHOOK_URL', payload)
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            provider: 'sms-webhook',
            sentAt: new Date(),
          })
        } else if (delivery.channel === 'chat_system') {
          await this.deliverWebhook('SHADOW_CHAT_SYSTEM_NOTIFICATION_WEBHOOK_URL', payload)
          await this.deps.notificationDao.updateDelivery(delivery.id, {
            status: 'sent',
            provider: 'chat-system-webhook',
            sentAt: new Date(),
          })
        }
      } catch (err) {
        await this.deps.notificationDao.updateDelivery(delivery.id, {
          status: 'failed',
          attempts: delivery.attempts + 1,
          error: err instanceof Error ? err.message : 'Delivery failed',
        })
      }
    }

    return event
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
    await this.deliverWebhook('SHADOW_NOTIFICATION_EMAIL_WEBHOOK_URL', {
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
