import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

const updatePreferenceSchema = z.object({
  strategy: z.enum(['all', 'mention_only', 'none']).optional(),
  mutedServerIds: z.array(z.string().uuid()).optional(),
  mutedChannelIds: z.array(z.string().uuid()).optional(),
})

const readScopeSchema = z
  .object({
    serverId: z.string().uuid().optional(),
    channelId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.serverId || !!v.channelId, {
    message: 'serverId or channelId is required',
  })

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
    const notification = await notificationService.markAsRead(id)
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

  return notificationHandler
}
