import type { MessageMention } from '@shadowob/shared'
import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'

async function canUseChannelRoom(container: AppContainer, channelId: string, userId: string) {
  const channelAccessService = container.resolve('channelAccessService')
  const access = await channelAccessService.getAccess(channelId, userId)
  return access.ok
}

export function setupChatGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined
    logger.info({ socketId: socket.id, userId }, 'Client connected')

    // channel:join
    socket.on(
      'channel:join',
      async ({ channelId }: { channelId: string }, ack?: (res: { ok: boolean }) => void) => {
        // Verify channel membership before joining the room
        if (userId) {
          try {
            const allowed = await canUseChannelRoom(container, channelId, userId)
            if (!allowed) {
              logger.warn({ userId, channelId }, 'Denied channel:join — not a member')
              if (typeof ack === 'function') ack({ ok: false })
              return
            }
          } catch (err) {
            logger.warn(
              { err, userId, channelId },
              'channel:join membership check failed — denying join',
            )
            if (typeof ack === 'function') ack({ ok: false })
            return
          }
        }

        await socket.join(`channel:${channelId}`)
        logger.info({ userId, channelId, socketId: socket.id }, 'Joined channel room')
        // Send ack if client provided a callback
        if (typeof ack === 'function') {
          ack({ ok: true })
        }
      },
    )

    // channel:leave
    socket.on('channel:leave', async ({ channelId }: { channelId: string }) => {
      await socket.leave(`channel:${channelId}`)
      logger.info({ userId, channelId, socketId: socket.id }, 'Left channel room')
    })

    // message:send
    socket.on(
      'message:send',
      async (data: {
        channelId: string
        content: string
        threadId?: string
        replyToId?: string
        mentions?: MessageMention[]
        metadata?: Record<string, unknown>
      }) => {
        if (!userId) return

        try {
          // Verify channel membership before sending
          const allowed = await canUseChannelRoom(container, data.channelId, userId)
          if (!allowed) {
            socket.emit('error', { message: 'You are not a member of this channel' })
            return
          }

          const messageService = container.resolve('messageService')
          const mentionService = container.resolve('mentionService')
          const commerceCardService = container.resolve('commerceCardService')

          const preparedInput = await mentionService.prepareMessageInput(data.channelId, userId, {
            content: data.content,
            replyToId: data.replyToId,
            mentions: data.mentions,
            metadata: data.metadata,
          })
          preparedInput.metadata = await commerceCardService.inferMessageMetadata({
            metadata: preparedInput.metadata as Record<string, unknown> | undefined,
            target: { kind: 'channel', channelId: data.channelId },
            authorId: userId,
            content: preparedInput.content,
          })
          const message = await messageService.send(data.channelId, userId, preparedInput)

          // Broadcast to channel room
          io.to(`channel:${data.channelId}`).emit('message:new', message)

          try {
            const channelService = container.resolve('channelService')
            const channel = await channelService.getById(data.channelId)
            if (channel.kind === 'dm') {
              const peer = await channelService.findDirectPeer(data.channelId, userId)
              if (peer) {
                const senderName =
                  message.author?.displayName ?? message.author?.username ?? 'Someone'
                const notificationTriggerService = container.resolve('notificationTriggerService')
                await notificationTriggerService.triggerDirectMessage({
                  userId: peer.id,
                  actorId: userId,
                  actorName: senderName,
                  channelId: data.channelId,
                  preview: data.content.substring(0, 200),
                })
                const rentalService = container.resolve('rentalService')
                await rentalService.recordRentalMessage(userId, peer.id).catch(() => null)
              }
            }
          } catch (err) {
            logger.warn(
              { err, userId, channelId: data.channelId },
              'Direct channel side effects failed — non-critical',
            )
          }

          // Create notification for reply
          if (data.replyToId) {
            try {
              const notificationTriggerService = container.resolve('notificationTriggerService')
              const channelDao = container.resolve('channelDao')
              const originalMessage = await messageService.getById(data.replyToId)
              if (originalMessage && originalMessage.authorId !== userId) {
                const channel = await channelDao.findById(data.channelId)
                if (channel) {
                  await notificationTriggerService.triggerReply({
                    userId: originalMessage.authorId,
                    actorId: userId,
                    actorName: message.author?.displayName ?? message.author?.username ?? 'Someone',
                    messageId: message.id,
                    channelId: data.channelId,
                    serverId: channel.serverId,
                    channelName: channel.name,
                    preview: data.content.substring(0, 200),
                  })
                }
              }
            } catch (err) {
              logger.warn(
                { err, userId, replyToId: data.replyToId },
                'Reply notification creation failed — non-critical',
              )
            }
          }

          // Create notifications for structured mentions
          try {
            const senderName = message.author?.displayName ?? message.author?.username ?? 'Someone'
            const mentions = Array.isArray(message.metadata?.mentions)
              ? (message.metadata.mentions as MessageMention[])
              : []
            await mentionService.createMentionNotifications({
              messageId: message.id,
              channelId: data.channelId,
              authorId: userId,
              authorName: senderName,
              content: data.content,
              mentions,
            })
          } catch (err) {
            logger.warn(
              { err, userId, channelId: data.channelId },
              'Mention notification failed — non-critical',
            )
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to send message'
          socket.emit('error', { message: msg })
        }
      },
    )

    // message:typing
    socket.on(
      'message:typing',
      async ({ channelId, typing }: { channelId: string; typing?: boolean }) => {
        if (!userId) return
        const allowed = await canUseChannelRoom(container, channelId, userId).catch(() => false)
        if (!allowed) return
        const username = socket.data.username as string
        const displayName = socket.data.displayName as string | undefined
        socket.to(`channel:${channelId}`).emit('message:typing', {
          channelId,
          userId,
          username,
          displayName: displayName ?? username,
          typing: typing !== false,
        })
      },
    )

    // Disconnect
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'Client disconnected')
    })
  })
}
