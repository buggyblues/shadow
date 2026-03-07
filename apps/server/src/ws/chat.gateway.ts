import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'

export function setupChatGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined
    logger.info({ socketId: socket.id, userId }, 'Client connected')

    // channel:join
    socket.on(
      'channel:join',
      async ({ channelId }: { channelId: string }, ack?: (res: { ok: boolean }) => void) => {
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

        try {
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
                threadId = thread.id
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
                })
                // Push notification to the user via WS
                io.emit('notification:new', notification)
              }
            } catch {
              /* notification creation failed, non-critical */
            }
          }

          // Create notifications for @mentions
          try {
            const mentionRegex = /@(\w+)/g
            const mentionedUsernames = new Set<string>()
            let match: RegExpExecArray | null = mentionRegex.exec(data.content)
            while (match !== null) {
              if (match[1]) mentionedUsernames.add(match[1])
              match = mentionRegex.exec(data.content)
            }

            if (mentionedUsernames.size > 0) {
              const userDao = container.resolve('userDao')
              const notificationService = container.resolve('notificationService')
              const senderName =
                message.author?.displayName ?? message.author?.username ?? 'Someone'

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
                  })
                  io.emit('notification:new', notification)
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

    // Disconnect
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'Client disconnected')
    })
  })
}
