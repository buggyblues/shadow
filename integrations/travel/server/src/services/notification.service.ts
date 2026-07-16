import type { NotificationDao } from '../dao/notification.dao.js'
import { notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { safeFetch } from '../lib/safe-fetch.js'
import { nowIso } from '../lib/time.js'
import type { NotificationLevel, RequestContext, TravelNotification } from '../types.js'
import type { SettingsService } from './settings.service.js'

export class NotificationService {
  constructor(
    private readonly notificationDao: NotificationDao,
    private readonly settingsService?: SettingsService,
  ) {}

  listNotifications(
    ctx: RequestContext,
    options: { tripId?: string; unreadForMemberId?: string } = {},
  ) {
    return this.notificationDao.listNotifications(ctx.serverId, options)
  }

  findNotification(ctx: RequestContext, notificationId: string) {
    return this.notificationDao.findNotification(ctx.serverId, notificationId)
  }

  async createNotification(
    ctx: RequestContext,
    input: {
      tripId?: string
      title: string
      body?: string
      level?: NotificationLevel
      subjectType?: string
      subjectId?: string
    },
  ) {
    const notification: TravelNotification = {
      id: createId('notice'),
      serverId: ctx.serverId,
      tripId: input.tripId,
      title: input.title,
      body: input.body,
      level: input.level ?? 'info',
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      readByMemberIds: [],
      createdAt: nowIso(),
    }
    const saved = await this.notificationDao.createNotification(notification)
    await this.deliverExternal(ctx, saved).catch(() => undefined)
    return saved
  }

  private async deliverExternal(ctx: RequestContext, notification: TravelNotification) {
    if (!this.settingsService) return
    const [webhookUrl, ntfyServerUrl, ntfyTopic, ntfyToken] = await Promise.all([
      this.settingsService.getProviderValue(ctx, 'webhook.url'),
      this.settingsService.getProviderValue(ctx, 'ntfy.server_url'),
      this.settingsService.getProviderValue(ctx, 'ntfy.topic'),
      this.settingsService.getProviderValue(ctx, 'ntfy.token'),
    ])
    const payload = {
      event: notification.subjectType ?? 'travel_notification',
      title: notification.title,
      body: notification.body ?? '',
      tripId: notification.tripId,
      subjectId: notification.subjectId,
      level: notification.level,
      timestamp: notification.createdAt,
      source: 'travel',
    }
    await Promise.all([
      webhookUrl ? sendWebhook(webhookUrl, payload) : Promise.resolve(false),
      ntfyTopic ? sendNtfy(ntfyServerUrl, ntfyTopic, ntfyToken, payload) : Promise.resolve(false),
    ])
  }

  async markRead(ctx: RequestContext, notificationId: string, memberId: string, read: boolean) {
    const notification = await this.notificationDao.markRead(
      ctx.serverId,
      notificationId,
      memberId,
      read,
    )
    if (!notification) throw notFound('Notification')
    return notification
  }

  markAllRead(ctx: RequestContext, memberId: string, tripId?: string) {
    return this.notificationDao.markAllRead(ctx.serverId, memberId, tripId)
  }
}

async function sendWebhook(url: string, payload: Record<string, unknown>) {
  const parsed = new URL(url)
  let body: unknown = payload
  if (parsed.hostname === 'discord.com' && parsed.pathname.includes('/api/webhooks/')) {
    body = {
      embeds: [
        {
          title: payload.title,
          description: payload.body,
          timestamp: payload.timestamp,
        },
      ],
    }
  } else if (parsed.hostname === 'hooks.slack.com') {
    body = {
      text: payload.title,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${payload.title}*\n${payload.body}` } },
      ],
    }
  }
  const response = await safeFetch(parsed, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  return response.ok
}

async function sendNtfy(
  serverUrl: string | undefined,
  topic: string,
  token: string | undefined,
  payload: Record<string, unknown>,
) {
  const base = (serverUrl?.trim() || 'https://ntfy.sh').replace(/\/+$/, '')
  const response = await safeFetch(`${base}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: {
      title: String(payload.title ?? 'Travel notification'),
      priority: payload.level === 'error' ? 'high' : 'default',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: String(payload.body ?? payload.title ?? ''),
    signal: AbortSignal.timeout(10_000),
  })
  return response.ok
}
