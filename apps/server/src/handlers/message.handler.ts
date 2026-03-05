import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createThreadSchema,
  reactionSchema,
  sendMessageSchema,
  updateMessageSchema,
} from '../validators/message.schema'

export function createMessageHandler(container: AppContainer) {
  const messageHandler = new Hono()

  messageHandler.use('*', authMiddleware)

  // GET /api/channels/:channelId/messages
  messageHandler.get('/channels/:channelId/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const messages = await messageService.getByChannelId(channelId, limit, cursor)
    return c.json(messages)
  })

  // POST /api/channels/:channelId/messages
  messageHandler.post(
    '/channels/:channelId/messages',
    zValidator('json', sendMessageSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')
      const message = await messageService.send(channelId, user.userId, input)
      return c.json(message, 201)
    },
  )

  // PATCH /api/messages/:id
  messageHandler.patch('/messages/:id', zValidator('json', updateMessageSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const message = await messageService.update(id, user.userId, input)

    // Emit WS event
    try {
      const io = container.resolve('io')
      io.to(`channel:${message.channelId}`).emit('message:updated', message)
    } catch {
      /* io not yet registered */
    }

    return c.json(message)
  })

  // DELETE /api/messages/:id
  messageHandler.delete('/messages/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const user = c.get('user')
    const deleted = await messageService.delete(id, user.userId)

    // Emit WS event
    try {
      const io = container.resolve('io')
      io.to(`channel:${deleted.channelId}`).emit('message:deleted', {
        id,
        channelId: deleted.channelId,
      })
    } catch {
      /* io not yet registered */
    }

    return c.json({ success: true })
  })

  // POST /api/channels/:channelId/threads
  messageHandler.post(
    '/channels/:channelId/threads',
    zValidator('json', createThreadSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')
      const thread = await messageService.createThread(channelId, user.userId, input)
      return c.json(thread, 201)
    },
  )

  // GET /api/threads/:id/messages
  messageHandler.get('/threads/:id/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const messages = await messageService.getThreadMessages(id, limit, cursor)
    return c.json(messages)
  })

  // POST /api/messages/:id/reactions
  messageHandler.post('/messages/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const reaction = await messageService.addReaction(id, user.userId, input)

    // Broadcast reaction via WS
    try {
      const io = container.resolve('io')
      const message = await messageService.getById(id)
      if (message) {
        const reactions = await messageService.getReactions(id)
        io.to(`channel:${message.channelId}`).emit('reaction:updated', {
          messageId: id,
          channelId: message.channelId,
          reactions,
        })
      }
    } catch {
      /* io not yet registered */
    }

    return c.json(reaction, 201)
  })

  // DELETE /api/messages/:id/reactions/:emoji
  messageHandler.delete('/messages/:id/reactions/:emoji', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const emoji = c.req.param('emoji')
    const user = c.get('user')
    await messageService.removeReaction(id, user.userId, emoji)

    // Broadcast reaction removal via WS
    try {
      const io = container.resolve('io')
      const message = await messageService.getById(id)
      if (message) {
        const reactions = await messageService.getReactions(id)
        io.to(`channel:${message.channelId}`).emit('reaction:updated', {
          messageId: id,
          channelId: message.channelId,
          reactions,
        })
      }
    } catch {
      /* io not yet registered */
    }

    return c.json({ success: true })
  })

  // GET /api/messages/:id/reactions
  messageHandler.get('/messages/:id/reactions', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const reactions = await messageService.getReactions(id)
    return c.json(reactions)
  })

  return messageHandler
}
