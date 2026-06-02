import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

const contentKindSchema = z.enum(['image', 'html', 'pdf', 'file', 'voice', 'card'])
const subscriptionStatusSchema = z.enum(['active', 'paused'])
const digestModeSchema = z.enum(['realtime', 'daily', 'none'])
const eventStateSchema = z.enum(['seen', 'opened', 'saved', 'hidden', 'dismissed'])

const updateSubscriptionSchema = z.object({
  status: subscriptionStatusSchema.optional(),
  includeKinds: z.array(contentKindSchema).max(6).optional(),
  excludeMimeTypes: z.array(z.string().min(1).max(120)).max(40).optional(),
  minAttachmentSize: z.number().int().min(0).nullable().optional(),
  maxAttachmentSize: z.number().int().min(0).nullable().optional(),
  pushEnabled: z.boolean().optional(),
  digestMode: digestModeSchema.optional(),
  lastReadAt: z.string().datetime().nullable().optional(),
  resetRules: z.boolean().optional(),
})

const updateDefaultPreferencesSchema = z.object({
  includeKinds: z.array(contentKindSchema).min(1).max(6).optional(),
  pushEnabled: z.boolean().optional(),
  digestMode: digestModeSchema.optional(),
})

const feedEventSchema = z.object({
  state: eventStateSchema,
  lastPosition: z.record(z.unknown()).nullable().optional(),
})

const readScopeSchema = z
  .object({
    feedItemId: z.string().uuid().optional(),
    channelId: z.string().uuid().optional(),
    serverId: z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.feedItemId || value.channelId || value.serverId || value.all), {
    message: 'Provide feedItemId, channelId, serverId, or all=true',
  })

function parseKinds(raw?: string) {
  if (!raw) return undefined
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.length === 0) return undefined
  return z.array(contentKindSchema).parse(values)
}

export function createContentFeedHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('*', authMiddleware)

  handler.get('/content-subscriptions', async (c) => {
    const user = c.get('user')
    const contentFeedService = container.resolve('contentFeedService')
    return c.json(
      await contentFeedService.listSubscriptions({
        userId: user.userId,
        serverId: c.req.query('serverId'),
      }),
    )
  })

  handler.get('/content-subscriptions/defaults', async (c) => {
    const user = c.get('user')
    const contentFeedService = container.resolve('contentFeedService')
    return c.json(await contentFeedService.getDefaultPreferences(user.userId))
  })

  handler.patch(
    '/content-subscriptions/defaults',
    zValidator('json', updateDefaultPreferencesSchema),
    async (c) => {
      const user = c.get('user')
      const input = c.req.valid('json')
      const contentFeedService = container.resolve('contentFeedService')
      return c.json(await contentFeedService.updateDefaultPreferences(user.userId, input))
    },
  )

  handler.get('/channels/:channelId/content-subscription', async (c) => {
    const user = c.get('user')
    const channelId = c.req.param('channelId')
    const contentFeedService = container.resolve('contentFeedService')
    return c.json(
      await contentFeedService.getChannelSubscription({ userId: user.userId, channelId }),
    )
  })

  handler.post('/channels/:channelId/content-subscription', async (c) => {
    const user = c.get('user')
    const channelId = c.req.param('channelId')
    const contentFeedService = container.resolve('contentFeedService')
    return c.json(
      await contentFeedService.subscribeChannel({ userId: user.userId, channelId }),
      201,
    )
  })

  handler.patch(
    '/content-subscriptions/:id',
    zValidator('json', updateSubscriptionSchema),
    async (c) => {
      const user = c.get('user')
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const contentFeedService = container.resolve('contentFeedService')
      return c.json(await contentFeedService.updateSubscription(user.userId, id, input))
    },
  )

  handler.delete('/content-subscriptions/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const contentFeedService = container.resolve('contentFeedService')
    return c.json(await contentFeedService.deleteSubscription(user.userId, id))
  })

  handler.get('/content-feed', async (c) => {
    const user = c.get('user')
    const contentFeedService = container.resolve('contentFeedService')
    const mediaService = container.resolve('mediaService')
    const rawLimit = Number(c.req.query('limit') ?? '30')
    const limit = Number.isFinite(rawLimit) ? rawLimit : 30
    const unreadOnly = c.req.query('unreadOnly') === 'true'
    const sort = c.req.query('sort') === 'recommended' ? 'recommended' : 'latest'
    const feed = await contentFeedService.listFeed({
      userId: user.userId,
      limit,
      cursor: c.req.query('cursor'),
      kinds: parseKinds(c.req.query('kinds')),
      channelId: c.req.query('channelId'),
      serverId: c.req.query('serverId'),
      unreadOnly,
      sort,
    })
    return c.json({
      ...feed,
      items: feed.items.map((item) => ({
        ...item,
        server: {
          ...item.server,
          iconUrl: mediaService.resolveMediaUrl(item.server.iconUrl, 'image/png', {
            variant: 'avatar',
          }),
        },
      })),
    })
  })

  handler.post(
    '/content-feed/:feedItemId/events',
    zValidator('json', feedEventSchema),
    async (c) => {
      const user = c.get('user')
      const feedItemId = c.req.param('feedItemId')
      const input = c.req.valid('json')
      const contentFeedService = container.resolve('contentFeedService')
      return c.json(
        await contentFeedService.recordEvent({
          userId: user.userId,
          feedItemId,
          state: input.state,
          lastPosition: input.lastPosition,
        }),
      )
    },
  )

  handler.post('/content-feed/read-scope', zValidator('json', readScopeSchema), async (c) => {
    const user = c.get('user')
    const input = c.req.valid('json')
    const contentFeedService = container.resolve('contentFeedService')
    return c.json(await contentFeedService.markReadScope({ userId: user.userId, ...input }))
  })

  return handler
}
