import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

export function createSearchHandler(container: AppContainer) {
  const searchHandler = new Hono()

  searchHandler.use('*', authMiddleware)

  // GET /api/search/messages
  searchHandler.get('/messages', async (c) => {
    const searchService = container.resolve('searchService')
    const query = c.req.query('query') ?? c.req.query('q') ?? ''
    const serverId = c.req.query('serverId')
    const channelId = c.req.query('channelId')
    const from = c.req.query('from') ?? c.req.query('authorId')
    const hasAttachmentParam = c.req.query('hasAttachment') ?? c.req.query('hasAttachments')
    const hasAttachment =
      hasAttachmentParam === 'true' || hasAttachmentParam === '1' ? true : undefined
    const limit = clampNumber(Number(c.req.query('limit') ?? '50'), 1, 100)
    const offset = clampNumber(Number(c.req.query('offset') ?? '0'), 0, 10_000)
    const actor = c.get('actor')

    if (channelId) {
      await container.resolve('policyService').requireChannelRead(actor, channelId)
    }

    const accessibleChannelIds = channelId
      ? [channelId]
      : await searchService.getAccessibleChannelIds(actor, serverId)

    const messages = await searchService.searchMessages(query, {
      serverId,
      channelId,
      accessibleChannelIds,
      from,
      hasAttachment,
      limit,
      offset,
    })
    return c.json(messages)
  })

  return searchHandler
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.trunc(value), min), max)
}
