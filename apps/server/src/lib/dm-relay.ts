import type { Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from './logger'

/**
 * Relay a DM to a bot user for AI processing.
 * Shared by both REST and WebSocket send paths to avoid duplication.
 *
 * This is a utility function, not a handler or service — it coordinates
 * Socket.IO emission with user/DM lookups and belongs in the lib layer.
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
