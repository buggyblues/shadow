import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { relayDmToBot } from '../handlers/dm.handler'
import { logger } from '../lib/logger'

// Simple in-memory rate limiter for WebSocket message sending
// Per-user, per-window: max 30 messages per 10 seconds
const MESSAGE_RATE_LIMIT = 30
const MESSAGE_RATE_WINDOW_MS = 10_000
const messageTimestamps = new Map<string, number[]>()

function checkMessageRate(userId: string): boolean {
  const now = Date.now()
  const timestamps = messageTimestamps.get(userId) ?? []
  // Remove timestamps outside the current window
  const recent = timestamps.filter((t) => now - t < MESSAGE_RATE_WINDOW_MS)
  if (recent.length >= MESSAGE_RATE_LIMIT) {
    messageTimestamps.set(userId, recent)
    return false
  }
  recent.push(now)
  messageTimestamps.set(userId, recent)
  return true
}

export function setupChatGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined
    logger.info({ socketId: socket.id, userId }, 'Client connected')

    // Clean up rate limit data on disconnect
    socket.on('disconnect', () => {
      if (userId) messageTimestamps.delete(userId)
    })

    // channel:join
    socket.on(
      'channel:join',
      async ({ channelId }: { channelId: string }, ack?: (res: { ok: boolean }) => void) => {
        // Verify channel membership before joining the room
        if (userId) {
          try {
            const channelMemberDao = container.resolve('channelMemberDao')
            const membership = await channelMemberDao.get(channelId, userId)
            if (!membership) {
              logger.warn({ userId, channelId }, 'Denied channel:join — not a member')
              if (typeof ack === 'function') ack({ ok: false })
              return
            }
          } catch {
            /* membership check failed, allow join as fallback */
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
      }) => {
        if (!userId) return

        // Rate limit check
        if (!checkMessageRate(userId)) {
          logger.warn({ userId }, 'message:send rate limit exceeded')
          socket.emit('error', { message: 'Message rate limit exceeded. Slow down!' })
          return
        }

        try {
          // Verify channel membership before sending
          const channelMemberDao = container.resolve('channelMemberDao')
          const membership = await channelMemberDao.get(data.channelId, userId)
          if (!membership) {
            socket.emit('error', { message: 'You are not a member of this channel' })
            return
          }

          const messageService = container.resolve('messageService')

          let threadId = data.threadId

          // Auto-create thread when replying to a message
          if (data.replyToId && !threadId) {
            const parentMessage = await messageService.getById(data.replyToId)
            if (parentMessage) {
              // Check if parent message already has a thread
              if (parentMessage.threadId) {
                threadId = parentMessage.threadId
              } else {
                // Create a new thread
                const thread = await messageService.createThread(data.channelId, userId, {
                  name: `Thread`,
                  parentMessageId: data.replyToId,
                })
                threadId = thread?.id
              }
            }
          }

          const message = await messageService.send(data.channelId, userId, {
            content: data.content,
            threadId,
            replyToId: data.replyToId,
          })

          // Broadcast to channel room
          io.to(`channel:${data.channelId}`).emit('message:new', message)

          // If it's a thread message, also emit to thread room
          if (data.threadId) {
            io.to(`thread:${data.threadId}`).emit('message:new', message)
          }

          // Create notification for reply
          if (data.replyToId) {
            try {
              const notificationService = container.resolve('notificationService')
              const originalMessage = await messageService.getById(data.replyToId)
              if (originalMessage && originalMessage.authorId !== userId) {
                const notification = await notificationService.create({
                  userId: originalMessage.authorId,
                  type: 'reply',
                  title: `${message.author?.displayName ?? message.author?.username ?? 'Someone'} replied to your message`,
                  body: data.content.substring(0, 200),
                  referenceId: message.id,
                  referenceType: 'message',
                  senderId: userId,
                })
                // Push notification to the target user via WS
                io.to(`user:${originalMessage.authorId}`).emit('notification:new', notification)
              }
            } catch {
              /* notification creation failed, non-critical */
            }
          }

          // Create notifications for @mentions
          try {
            const userDao = container.resolve('userDao')
            const notificationService = container.resolve('notificationService')
            const senderName = message.author?.displayName ?? message.author?.username ?? 'Someone'

            const mentionUsernameRegex = /@([A-Za-z0-9_-]+)/g
            const mentionedUsernames = new Set<string>()
            let match: RegExpExecArray | null = mentionUsernameRegex.exec(data.content)
            while (match !== null) {
              if (match[1]) mentionedUsernames.add(match[1])
              match = mentionUsernameRegex.exec(data.content)
            }

            if (mentionedUsernames.size > 0) {
              for (const username of mentionedUsernames) {
                const mentionedUser = await userDao.findByUsername(username)
                if (mentionedUser && mentionedUser.id !== userId) {
                  const notification = await notificationService.create({
                    userId: mentionedUser.id,
                    type: 'mention',
                    title: `${senderName} mentioned you`,
                    body: data.content.substring(0, 200),
                    referenceId: message.id,
                    referenceType: 'message',
                    senderId: userId,
                  })
                  io.to(`user:${mentionedUser.id}`).emit('notification:new', notification)
                }
              }
            }
          } catch {
            /* mention notification failed, non-critical */
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to send message'
          socket.emit('error', { message: msg })
        }
      },
    )

    // message:typing
    socket.on('message:typing', ({ channelId }: { channelId: string }) => {
      if (!userId) return
      const username = socket.data.username as string
      socket.to(`channel:${channelId}`).emit('message:typing', { channelId, userId, username })
    })

    // ---- DM (Direct Message) Events ----

    // dm:join — join a DM channel room
    socket.on('dm:join', async ({ dmChannelId }: { dmChannelId: string }) => {
      if (!userId) return
      // Verify user is a participant
      try {
        const dmService = container.resolve('dmService')
        const channel = await dmService.getChannelById(dmChannelId)
        if (!channel || (channel.userAId !== userId && channel.userBId !== userId)) {
          return
        }
        await socket.join(`dm:${dmChannelId}`)
        logger.info({ userId, dmChannelId, socketId: socket.id }, 'Joined DM room')
      } catch {
        /* ignore */
      }
    })

    // dm:leave — leave a DM channel room
    socket.on('dm:leave', async ({ dmChannelId }: { dmChannelId: string }) => {
      await socket.leave(`dm:${dmChannelId}`)
    })

    // dm:send — send a DM message
    socket.on(
      'dm:send',
      async (data: { dmChannelId: string; content: string; replyToId?: string }) => {
        if (!userId) return
        try {
          const dmService = container.resolve('dmService')
          const channel = await dmService.getChannelById(data.dmChannelId)
          if (!channel || (channel.userAId !== userId && channel.userBId !== userId)) {
            socket.emit('error', { message: 'Not a participant of this DM' })
            return
          }

          const message = await dmService.sendMessage(
            data.dmChannelId,
            userId,
            data.content,
            data.replyToId,
          )

          // Broadcast to DM room
          io.to(`dm:${data.dmChannelId}`).emit('dm:message', message)

          // Send notification to the other user
          const otherUserId = channel.userAId === userId ? channel.userBId : channel.userAId
          try {
            const notificationService = container.resolve('notificationService')
            const senderName = message.author?.displayName ?? message.author?.username ?? 'Someone'
            const notification = await notificationService.create({
              userId: otherUserId,
              type: 'dm',
              title: `${senderName} sent you a message`,
              body: data.content.substring(0, 200),
              referenceId: data.dmChannelId,
              referenceType: 'dm_channel',
              senderId: userId,
            })
            io.to(`user:${otherUserId}`).emit('notification:new', notification)
          } catch {
            /* notification failed, non-critical */
          }

          // Relay to bot using shared helper
          try {
            await relayDmToBot(io, container, data.dmChannelId, userId, otherUserId, {
              id: message.id!,
              content: message.content ?? data.content,
              author: message.author,
              createdAt: message.createdAt,
              replyToId: message.replyToId,
              attachments: message.attachments,
            })
          } catch (err) {
            logger.error({ err, dmChannelId: data.dmChannelId }, 'Bot DM relay failed')
          }

          // Record rental message for billing v2 (fire-and-forget)
          try {
            const rentalService = container.resolve('rentalService')
            await rentalService.recordRentalMessage(userId, otherUserId)
          } catch {
            /* non-critical */
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to send DM'
          socket.emit('error', { message: msg })
        }
      },
    )

    // dm:edit — edit a DM message
    socket.on(
      'dm:edit',
      async (data: { dmChannelId: string; messageId: string; content: string }) => {
        if (!userId) return
        try {
          const dmService = container.resolve('dmService')
          const isParticipant = await dmService.isParticipant(data.dmChannelId, userId)
          if (!isParticipant) {
            socket.emit('error', { message: 'Not a participant of this DM' })
            return
          }

          const updated = await dmService.editMessage(data.messageId, userId, data.content)
          io.to(`dm:${data.dmChannelId}`).emit('dm:message:updated', updated)
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to edit DM'
          socket.emit('error', { message: msg })
        }
      },
    )

    // dm:delete — delete a DM message
    socket.on('dm:delete', async (data: { dmChannelId: string; messageId: string }) => {
      if (!userId) return
      try {
        const dmService = container.resolve('dmService')
        const isParticipant = await dmService.isParticipant(data.dmChannelId, userId)
        if (!isParticipant) {
          socket.emit('error', { message: 'Not a participant of this DM' })
          return
        }

        await dmService.deleteMessage(data.messageId, userId)
        io.to(`dm:${data.dmChannelId}`).emit('dm:message:deleted', {
          id: data.messageId,
          dmChannelId: data.dmChannelId,
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to delete DM'
        socket.emit('error', { message: msg })
      }
    })

    // dm:typing — typing indicator in DM
    socket.on('dm:typing', ({ dmChannelId }: { dmChannelId: string }) => {
      if (!userId) return
      const username = socket.data.username as string
      socket.to(`dm:${dmChannelId}`).emit('dm:typing', { dmChannelId, userId, username })
    })

    // dm:react — add a reaction to a DM message
    socket.on(
      'dm:react',
      async (data: { dmChannelId: string; dmMessageId: string; emoji: string }) => {
        if (!userId) return
        try {
          const dmService = container.resolve('dmService')
          const isParticipant = await dmService.isParticipant(data.dmChannelId, userId)
          if (!isParticipant) {
            socket.emit('error', { message: 'Not a participant of this DM' })
            return
          }

          await dmService.addReaction(data.dmMessageId, userId, data.emoji)
          const reactions = await dmService.getReactions(data.dmMessageId)
          io.to(`dm:${data.dmChannelId}`).emit('dm:reaction:updated', {
            dmMessageId: data.dmMessageId,
            dmChannelId: data.dmChannelId,
            reactions,
          })
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to add reaction'
          socket.emit('error', { message: msg })
        }
      },
    )

    // dm:unreact — remove a reaction from a DM message
    socket.on(
      'dm:unreact',
      async (data: { dmChannelId: string; dmMessageId: string; emoji: string }) => {
        if (!userId) return
        try {
          const dmService = container.resolve('dmService')
          const isParticipant = await dmService.isParticipant(data.dmChannelId, userId)
          if (!isParticipant) {
            socket.emit('error', { message: 'Not a participant of this DM' })
            return
          }

          await dmService.removeReaction(data.dmMessageId, userId, data.emoji)
          const reactions = await dmService.getReactions(data.dmMessageId)
          io.to(`dm:${data.dmChannelId}`).emit('dm:reaction:updated', {
            dmMessageId: data.dmMessageId,
            dmChannelId: data.dmChannelId,
            reactions,
          })
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to remove reaction'
          socket.emit('error', { message: msg })
        }
      },
    )

    // Disconnect
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'Client disconnected')
    })

    // Auto-join bot users to their DM channel rooms (after all handlers registered)
    if (userId) {
      ;(async () => {
        try {
          const userDao = container.resolve('userDao')
          const currentUser = await userDao.findById(userId)
          if (currentUser?.isBot) {
            const dmService = container.resolve('dmService')
            const dmChs = await dmService.getUserChannels(userId)
            for (const ch of dmChs) {
              await socket.join(`dm:${ch.id}`)
              logger.info(
                { userId, dmChannelId: ch.id, socketId: socket.id },
                'Bot auto-joined DM room',
              )
            }
            logger.info({ userId, count: dmChs.length }, 'Bot auto-joined all DM rooms')
          }
        } catch (err) {
          logger.error({ err, userId }, 'Failed to auto-join bot DM rooms')
        }
      })()
    }
  })
}
