import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'

const updatePreferenceSchema = z.object({
  strategy: z.enum(['all', 'mention_only', 'none']).optional(),
  mutedServerIds: z.array(z.string().uuid()).optional(),
  mutedChannelIds: z.array(z.string().uuid()).optional(),
})

const notificationChannelSchema = z.enum([
  'in_app',
  'socket',
  'mobile_push',
  'web_push',
  'email',
  'sms',
  'chat_system',
])

const updateChannelPreferenceSchema = z.object({
  kind: z.string().min(1).max(80),
  channel: notificationChannelSchema,
  enabled: z.boolean(),
})

const pushTokenSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']).or(z.string().min(1).max(20)),
  token: z.string().min(16).max(4096),
  deviceName: z.string().max(120).nullable().optional(),
})

const webPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(1).max(1024),
    auth: z.string().min(1).max(1024),
  }),
  userAgent: z.string().max(500).nullable().optional(),
})

const spaceAppNotificationChannelSchema = z.enum(['in_app', 'mobile_push', 'web_push', 'email'])
const updateSpaceAppNotificationPreferenceSchema = z
  .object({
    serverId: z.string().uuid(),
    appKey: z.string().min(1).max(80),
    topicKey: z.string().min(1).max(80),
    enabled: z.boolean().optional(),
    channels: z.array(spaceAppNotificationChannelSchema).min(1).max(4).optional(),
  })
  .refine((value) => value.enabled !== undefined || value.channels !== undefined)

const readScopeSchema = z
  .object({
    serverId: z.string().uuid().optional(),
    channelId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.serverId || !!v.channelId)

export function createNotificationHandler(container: AppContainer) {
  const notificationHandler = new Hono()

  notificationHandler.use('*', authMiddleware)

  // GET /api/notifications
  notificationHandler.get('/', async (c) => {
    const notificationService = container.resolve('notificationService')
    const user = c.get('user')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const notifications = await notificationService.getByUserId(user.userId, limit, offset)
    return c.json(notifications)
  })

  // PATCH /api/notifications/:id/read
  notificationHandler.patch('/:id/read', async (c) => {
    const notificationService = container.resolve('notificationService')
    const id = c.req.param('id')
    const user = c.get('user')
    const notification = await notificationService.markAsRead(user.userId, id)
    if (!notification) {
      return c.json(
        { ok: false, error: 'NOTIFICATION_NOT_FOUND', code: 'NOTIFICATION_NOT_FOUND' },
        404,
      )
    }
    return c.json(notification)
  })

  // POST /api/notifications/read-all
  notificationHandler.post('/read-all', async (c) => {
    const notificationService = container.resolve('notificationService')
    const user = c.get('user')
    await notificationService.markAllAsRead(user.userId)
    return c.json({ ok: true })
  })

  // POST /api/notifications/read-scope
  notificationHandler.post('/read-scope', zValidator('json', readScopeSchema), async (c) => {
    const notificationService = container.resolve('notificationService')
    const user = c.get('user')
    const input = c.req.valid('json')
    const result = await notificationService.markScopeAsRead(user.userId, input)
    return c.json(result)
  })

  // GET /api/notifications/unread-count
  notificationHandler.get('/unread-count', async (c) => {
    const notificationService = container.resolve('notificationService')
    const user = c.get('user')
    const count = await notificationService.getUnreadCount(user.userId)
    return c.json({ count })
  })

  // GET /api/notifications/scoped-unread
  notificationHandler.get('/scoped-unread', async (c) => {
    const notificationService = container.resolve('notificationService')
    const user = c.get('user')
    const data = await notificationService.getScopedUnread(user.userId)
    return c.json(data)
  })

  // GET /api/notifications/preferences
  notificationHandler.get('/preferences', async (c) => {
    const notificationService = container.resolve('notificationService')
    const user = c.get('user')
    const pref = await notificationService.getPreference(user.userId)
    return c.json(pref)
  })

  // PATCH /api/notifications/preferences
  notificationHandler.patch(
    '/preferences',
    zValidator('json', updatePreferenceSchema),
    async (c) => {
      const notificationService = container.resolve('notificationService')
      const user = c.get('user')
      const input = c.req.valid('json')
      const pref = await notificationService.updatePreference(user.userId, input)
      return c.json(pref)
    },
  )

  notificationHandler.get('/space-app-preferences', async (c) => {
    const user = c.get('user')
    const serverId = c.req.query('serverId')
    if (serverId && !z.string().uuid().safeParse(serverId).success) {
      return c.json({ ok: false, error: 'invalid_server_id' }, 422)
    }
    return c.json(
      await container
        .resolve('spaceAppNotificationService')
        .listPreferences(
          user.userId,
          serverId,
          c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0],
        ),
    )
  })

  notificationHandler.patch(
    '/space-app-preferences',
    zValidator('json', updateSpaceAppNotificationPreferenceSchema),
    async (c) => {
      const user = c.get('user')
      return c.json(
        await container.resolve('spaceAppNotificationService').updatePreference({
          userId: user.userId,
          ...c.req.valid('json'),
        }),
      )
    },
  )

  notificationHandler.get('/channel-preferences', async (c) => {
    const notificationUseCase = container.resolve('notificationUseCase')
    return c.json(
      await notificationUseCase.getChannelPreferences({
        ctx: createActorContext(c.get('actor')),
      }),
    )
  })

  notificationHandler.patch(
    '/channel-preferences',
    zValidator('json', updateChannelPreferenceSchema),
    async (c) => {
      const notificationUseCase = container.resolve('notificationUseCase')
      const input = c.req.valid('json')
      return c.json(
        await notificationUseCase.upsertChannelPreference({
          ctx: createActorContext(c.get('actor')),
          kind: input.kind,
          channel: input.channel,
          enabled: input.enabled,
        }),
      )
    },
  )

  notificationHandler.post('/push-tokens', zValidator('json', pushTokenSchema), async (c) => {
    const notificationUseCase = container.resolve('notificationUseCase')
    const input = c.req.valid('json')
    return c.json(
      await notificationUseCase.upsertPushToken({
        ctx: createActorContext(c.get('actor')),
        platform: input.platform,
        token: input.token,
        deviceName: input.deviceName,
      }),
      201,
    )
  })

  notificationHandler.delete('/push-tokens/:idOrToken', async (c) => {
    const notificationUseCase = container.resolve('notificationUseCase')
    await notificationUseCase.deactivatePushToken({
      ctx: createActorContext(c.get('actor')),
      idOrToken: c.req.param('idOrToken'),
    })
    return c.json({ ok: true })
  })

  notificationHandler.post(
    '/web-push-subscriptions',
    zValidator('json', webPushSubscriptionSchema),
    async (c) => {
      const notificationUseCase = container.resolve('notificationUseCase')
      const input = c.req.valid('json')
      return c.json(
        await notificationUseCase.upsertWebPushSubscription({
          ctx: createActorContext(c.get('actor')),
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent,
        }),
        201,
      )
    },
  )

  notificationHandler.delete('/web-push-subscriptions/:idOrEndpoint', async (c) => {
    const notificationUseCase = container.resolve('notificationUseCase')
    await notificationUseCase.deactivateWebPushSubscription({
      ctx: createActorContext(c.get('actor')),
      idOrEndpoint: c.req.param('idOrEndpoint'),
    })
    return c.json({ ok: true })
  })

  return notificationHandler
}
