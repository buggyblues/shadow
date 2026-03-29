import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createThreadSchema,
  reactionSchema,
  sendMessageSchema,
  updateMessageSchema,
  updateThreadSchema,
} from '../validators/message.schema'

export function createMessageHandler(container: AppContainer) {
  const messageHandler = new Hono()

  messageHandler.use('*', authMiddleware)

  // GET /api/messages/:id — single message lookup (used by notification click-through)
  messageHandler.get('/messages/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const message = await messageService.getById(id)
    if (!message) return c.json({ error: 'Message not found' }, 404)
    return c.json(message)
  })

  // GET /api/channels/:channelId/messages
  messageHandler.get('/channels/:channelId/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const result = await messageService.getByChannelId(channelId, limit, cursor)
    return c.json(result)
  })

  // POST /api/channels/:channelId/messages
  messageHandler.post(
    '/channels/:channelId/messages',
    zValidator('json', sendMessageSchema),
    async (c) => {
      const messageService = container.resolve('messageService')
      const channelPostingRuleService = container.resolve('channelPostingRuleService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')

      // Check posting rules before allowing message
      const canPost = await channelPostingRuleService.canPost(channelId, user.userId)
      if (!canPost.allowed) {
        return c.json(
          {
            error: 'POSTING_RULE_VIOLATION',
            message: canPost.reason || 'Not authorized to post in this channel',
            ruleType: canPost.ruleType || 'unknown',
          },
          403,
        )
      }

      const message = await messageService.send(channelId, user.userId, input)

      // Emit WS event so all connected clients (including bots) see the message
      try {
        const io = container.resolve('io')
        io.to(`channel:${channelId}`).emit('message:new', message)
      } catch {
        /* io not yet registered */
      }

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
    const agentDao = container.resolve('agentDao')
    const id = c.req.param('id')
    const user = c.get('user')

    // Check if the requester is the bot's owner (can delete bot's messages)
    const message = await messageService.getById(id)
    if (!message) return c.json({ error: 'Message not found' }, 404)

    let canDelete = message.authorId === user.userId
    if (!canDelete && message.authorId) {
      // Check if the message author is a bot owned by the requester
      const agent = await agentDao.findByUserId(message.authorId)
      if (agent && agent.ownerId === user.userId) {
        canDelete = true
      }
    }
    if (!canDelete) {
      return c.json({ error: 'Not authorized to delete this message' }, 403)
    }

    const deleted = await messageService.deleteById(id)

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
      const channelPostingRuleService = container.resolve('channelPostingRuleService')
      const channelId = c.req.param('channelId')
      const input = c.req.valid('json')
      const user = c.get('user')

      // Check posting rules before allowing thread creation
      const canPost = await channelPostingRuleService.canPost(channelId, user.userId)
      if (!canPost.allowed) {
        return c.json({ error: canPost.reason || 'Not authorized to post in this channel' }, 403)
      }

      const thread = await messageService.createThread(channelId, user.userId, input)
      return c.json(thread, 201)
    },
  )

  // GET /api/channels/:channelId/threads
  messageHandler.get('/channels/:channelId/threads', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const threads = await messageService.getThreadsByChannelId(channelId)
    return c.json(threads)
  })

  // GET /api/threads/:id
  messageHandler.get('/threads/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const thread = await messageService.getThread(id)
    return c.json(thread)
  })

  // PATCH /api/threads/:id
  messageHandler.patch('/threads/:id', zValidator('json', updateThreadSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')
    const thread = await messageService.updateThread(id, user.userId, input)
    return c.json(thread)
  })

  // DELETE /api/threads/:id
  messageHandler.delete('/threads/:id', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const user = c.get('user')
    await messageService.deleteThread(id, user.userId)
    return c.json({ success: true })
  })

  // GET /api/threads/:id/messages
  messageHandler.get('/threads/:id/messages', async (c) => {
    const messageService = container.resolve('messageService')
    const id = c.req.param('id')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const messages = await messageService.getThreadMessages(id, limit, cursor)
    return c.json(messages)
  })

  // POST /api/threads/:id/messages
  messageHandler.post('/threads/:id/messages', zValidator('json', sendMessageSchema), async (c) => {
    const messageService = container.resolve('messageService')
    const channelPostingRuleService = container.resolve('channelPostingRuleService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const user = c.get('user')

    // Get thread to find channel ID
    const thread = await messageService.getThread(id)

    // Check posting rules before allowing message in thread
    const canPost = await channelPostingRuleService.canPost(thread.channelId, user.userId)
    if (!canPost.allowed) {
      return c.json({ error: canPost.reason || 'Not authorized to post in this channel' }, 403)
    }

    const message = await messageService.sendToThread(id, user.userId, {
      content: input.content,
    })
    return c.json(message, 201)
  })

  // PUT /api/channels/:channelId/pins/:messageId
  messageHandler.put('/channels/:channelId/pins/:messageId', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const message = await messageService.pinMessage(channelId, messageId)
    return c.json(message)
  })

  // DELETE /api/channels/:channelId/pins/:messageId
  messageHandler.delete('/channels/:channelId/pins/:messageId', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const message = await messageService.unpinMessage(channelId, messageId)
    return c.json(message)
  })

  // GET /api/channels/:channelId/pins
  messageHandler.get('/channels/:channelId/pins', async (c) => {
    const messageService = container.resolve('messageService')
    const channelId = c.req.param('channelId')
    const messages = await messageService.getPinnedMessages(channelId)
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
