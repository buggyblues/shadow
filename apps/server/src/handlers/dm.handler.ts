import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { Server as SocketIOServer } from 'socket.io'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'
import { authMiddleware } from '../middleware/auth.middleware'

/**
 * Relay a DM to a bot user for AI processing.
 * Shared by both REST and WebSocket send paths to avoid duplication.
 */
export async function relayDmToBot(
  io: SocketIOServer,
  container: AppContainer,
  dmChannelId: string,
  senderId: string,
  otherUserId: string,
  message: {
    id: string
    content: string
    author?: unknown
    createdAt: unknown
    replyToId?: string | null
    attachments?: { id: string; filename: string; url: string; contentType: string; size: number }[]
  },
) {
  const userDao = container.resolve('userDao')
  const otherUser = await userDao.findById(otherUserId)
  if (!otherUser?.isBot) return

  // Ensure bot socket is in DM room
  const botSockets = await io.in(`user:${otherUserId}`).fetchSockets()
  for (const bs of botSockets) {
    bs.join(`dm:${dmChannelId}`)
  }
  logger.info({ otherUserId, dmChannelId, botSocketCount: botSockets.length }, 'Relaying DM to bot')

  if (botSockets.length === 0) {
    logger.warn({ otherUserId, dmChannelId }, 'Bot has no active sockets — DM relay may be missed')
  }

  const dmPayload = {
    id: message.id,
    content: message.content,
    dmChannelId,
    channelId: `dm:${dmChannelId}`,
    authorId: senderId,
    author: message.author,
    senderId,
    receiverId: otherUserId,
    createdAt: message.createdAt,
    replyToId: message.replyToId ?? null,
    attachments: message.attachments ?? [],
  }
  io.to(`dm:${dmChannelId}`).to(`user:${otherUserId}`).emit('dm:message:new', dmPayload)
}

export function createDmHandler(container: AppContainer) {
  const dmHandler = new Hono()

  dmHandler.use('*', authMiddleware)

  // POST /api/dm/channels
  dmHandler.post(
    '/channels',
    zValidator('json', z.object({ userId: z.string().uuid() })),
    async (c) => {
      const dmService = container.resolve('dmService')
      const { userId: targetUserId } = c.req.valid('json')
      const user = c.get('user')
      const channel = await dmService.getOrCreateChannel(user.userId, targetUserId)
      return c.json(channel, 201)
    },
  )

  // GET /api/dm/channels
  dmHandler.get('/channels', async (c) => {
    const dmService = container.resolve('dmService')
    const user = c.get('user')
    const channels = await dmService.getUserChannels(user.userId)
    return c.json(channels)
  })

  // GET /api/dm/channels/:id/messages — requires participant authorization
  dmHandler.get('/channels/:id/messages', async (c) => {
    const dmService = container.resolve('dmService')
    const id = c.req.param('id')
    const user = c.get('user')

    // Verify user is a participant of this DM channel
    const isParticipant = await dmService.isParticipant(id, user.userId)
    if (!isParticipant) {
      return c.json({ error: 'Not a participant of this DM channel' }, 403)
    }

    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const messages = await dmService.getMessages(id, limit, cursor)
    return c.json(messages)
  })

  // POST /api/dm/channels/:id/messages
  dmHandler.post(
    '/channels/:id/messages',
    zValidator(
      'json',
      z.object({
        content: z.string().min(1).max(4000),
        replyToId: z.string().uuid().optional(),
        attachments: z
          .array(
            z.object({
              filename: z.string(),
              url: z.string(),
              contentType: z.string(),
              size: z.number(),
            }),
          )
          .optional(),
      }),
    ),
    async (c) => {
      const dmService = container.resolve('dmService')
      const id = c.req.param('id')
      const { content, replyToId, attachments } = c.req.valid('json')
      const user = c.get('user')

      // Verify participant
      const isParticipant = await dmService.isParticipant(id, user.userId)
      if (!isParticipant) {
        return c.json({ error: 'Not a participant of this DM channel' }, 403)
      }

      const message = await dmService.sendMessage(id, user.userId, content, replyToId, attachments)

      // Broadcast to DM room via WebSocket
      const io = container.resolve('io')
      io.to(`dm:${id}`).emit('dm:message', message)

      // Relay to bot user if recipient is a bot (for AI processing)
      try {
        const channel = await dmService.getChannelById(id)
        if (channel) {
          const otherUserId = channel.userAId === user.userId ? channel.userBId : channel.userAId
          await relayDmToBot(io, container, id, user.userId, otherUserId, {
            id: message.id,
            content: message.content ?? content,
            author: message.author,
            createdAt: message.createdAt,
            replyToId: message.replyToId,
            attachments: message.attachments,
          })

          // Record rental message for billing (fire-and-forget)
          try {
            const rentalService = container.resolve('rentalService')
            await rentalService.recordRentalMessage(user.userId, otherUserId)
          } catch {
            /* non-critical */
          }
        }
      } catch (err) {
        logger.error({ err, dmChannelId: id }, 'REST: Bot DM relay failed')
      }

      return c.json(message, 201)
    },
  )

  // PATCH /api/dm/channels/:channelId/messages/:messageId — edit a DM message
  dmHandler.patch(
    '/channels/:channelId/messages/:messageId',
    zValidator('json', z.object({ content: z.string().min(1).max(4000) })),
    async (c) => {
      const dmService = container.resolve('dmService')
      const channelId = c.req.param('channelId')
      const messageId = c.req.param('messageId')
      const { content } = c.req.valid('json')
      const user = c.get('user')

      // Verify participant
      const isParticipant = await dmService.isParticipant(channelId, user.userId)
      if (!isParticipant) {
        return c.json({ error: 'Not a participant of this DM channel' }, 403)
      }

      const updated = await dmService.editMessage(messageId, user.userId, content)

      // Broadcast update via WebSocket
      try {
        const io = container.resolve('io')
        io.to(`dm:${channelId}`).emit('dm:message:updated', updated)
      } catch {
        /* io not yet registered */
      }

      return c.json(updated)
    },
  )

  // DELETE /api/dm/channels/:channelId/messages/:messageId — delete a DM message
  dmHandler.delete('/channels/:channelId/messages/:messageId', async (c) => {
    const dmService = container.resolve('dmService')
    const channelId = c.req.param('channelId')
    const messageId = c.req.param('messageId')
    const user = c.get('user')

    // Verify participant
    const isParticipant = await dmService.isParticipant(channelId, user.userId)
    if (!isParticipant) {
      return c.json({ error: 'Not a participant of this DM channel' }, 403)
    }

    const deleted = await dmService.deleteMessage(messageId, user.userId)

    // Broadcast deletion via WebSocket
    try {
      const io = container.resolve('io')
      io.to(`dm:${channelId}`).emit('dm:message:deleted', {
        id: messageId,
        dmChannelId: channelId,
      })
    } catch {
      /* io not yet registered */
    }

    return c.json({ success: true })
  })

  // ── DM Reactions ─────────────────────────────────────

  // POST /api/dm/messages/:messageId/reactions — add a reaction
  dmHandler.post(
    '/messages/:messageId/reactions',
    zValidator('json', z.object({ emoji: z.string().min(1).max(32) })),
    async (c) => {
      const dmService = container.resolve('dmService')
      const messageId = c.req.param('messageId')
      const { emoji } = c.req.valid('json')
      const user = c.get('user')

      // Find the message and verify participant
      const message = await dmService.getMessageById(messageId)
      if (!message) {
        return c.json({ error: 'Message not found' }, 404)
      }
      const isParticipant = await dmService.isParticipant(message.dmChannelId, user.userId)
      if (!isParticipant) {
        return c.json({ error: 'Not a participant of this DM channel' }, 403)
      }

      const reaction = await dmService.addReaction(messageId, user.userId, emoji)

      // Broadcast reaction update
      try {
        const io = container.resolve('io')
        const reactions = await dmService.getReactions(messageId)
        io.to(`dm:${message.dmChannelId}`).emit('dm:reaction:updated', {
          dmMessageId: messageId,
          dmChannelId: message.dmChannelId,
          reactions,
        })
      } catch {
        /* io not yet registered */
      }

      return c.json(reaction, 201)
    },
  )

  // DELETE /api/dm/messages/:messageId/reactions/:emoji — remove a reaction
  dmHandler.delete('/messages/:messageId/reactions/:emoji', async (c) => {
    const dmService = container.resolve('dmService')
    const messageId = c.req.param('messageId')
    const emoji = c.req.param('emoji')
    const user = c.get('user')

    const message = await dmService.getMessageById(messageId)
    if (!message) {
      return c.json({ error: 'Message not found' }, 404)
    }
    const isParticipant = await dmService.isParticipant(message.dmChannelId, user.userId)
    if (!isParticipant) {
      return c.json({ error: 'Not a participant of this DM channel' }, 403)
    }

    await dmService.removeReaction(messageId, user.userId, emoji)

    // Broadcast reaction update
    try {
      const io = container.resolve('io')
      const reactions = await dmService.getReactions(messageId)
      io.to(`dm:${message.dmChannelId}`).emit('dm:reaction:updated', {
        dmMessageId: messageId,
        dmChannelId: message.dmChannelId,
        reactions,
      })
    } catch {
      /* io not yet registered */
    }

    return c.json({ success: true })
  })

  // GET /api/dm/messages/:messageId/reactions
  dmHandler.get('/messages/:messageId/reactions', async (c) => {
    const dmService = container.resolve('dmService')
    const messageId = c.req.param('messageId')
    const user = c.get('user')

    const message = await dmService.getMessageById(messageId)
    if (!message) {
      return c.json({ error: 'Message not found' }, 404)
    }
    const isParticipant = await dmService.isParticipant(message.dmChannelId, user.userId)
    if (!isParticipant) {
      return c.json({ error: 'Not a participant of this DM channel' }, 403)
    }

    const reactions = await dmService.getReactions(messageId)
    return c.json(reactions)
  })

  return dmHandler
}
