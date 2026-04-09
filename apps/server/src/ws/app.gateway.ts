import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'

/**
 * App gateway — extends the channel WS room with app-specific broadcast.
 *
 * Apps reuse the hidden channel room (`channel:{channelId}`) for messaging.
 * This gateway adds:
 *   - `app:broadcast` — host broadcasts state to all guests in the app room
 *   - `app:join`  — joins the app's hidden channel room (alias for channel:join)
 *   - `app:leave` — leaves the app's hidden channel room
 */
export function setupAppGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined

    // app:join — look up the app's hidden channelId and join that room
    socket.on(
      'app:join',
      async (
        { appId }: { appId: string },
        ack?: (res: { ok: boolean; channelId?: string }) => void,
      ) => {
        if (!userId) return
        try {
          const appDao = container.resolve('appDao')
          const app = await appDao.findById(appId)
          if (!app?.channelId) {
            if (typeof ack === 'function') ack({ ok: false })
            return
          }
          await socket.join(`channel:${app.channelId}`)
          logger.info({ userId, appId, channelId: app.channelId }, 'Joined app room')
          if (typeof ack === 'function') ack({ ok: true, channelId: app.channelId })
        } catch (err) {
          logger.warn({ err, userId, appId }, 'app:join failed to lookup app')
          if (typeof ack === 'function') ack({ ok: false })
        }
      },
    )

    // app:leave
    socket.on('app:leave', async ({ appId }: { appId: string }) => {
      if (!userId) return
      try {
        const appDao = container.resolve('appDao')
        const app = await appDao.findById(appId)
        if (app?.channelId) {
          await socket.leave(`channel:${app.channelId}`)
        }
      } catch (err) {
        logger.warn({ err, userId, appId }, 'app:leave failed')
      }
    })

    // app:broadcast — host broadcasts arbitrary state to the app room
    socket.on('app:broadcast', async (data: { appId: string; type: string; payload: unknown }) => {
      if (!userId) return
      try {
        const appDao = container.resolve('appDao')
        const app = await appDao.findById(data.appId)
        if (!app?.channelId) return

        // Broadcast to all sockets in the channel room except sender
        socket.to(`channel:${app.channelId}`).emit('app:broadcast', {
          appId: data.appId,
          type: data.type,
          payload: data.payload,
          senderId: userId,
        })
      } catch (err) {
        logger.warn({ err, userId, appId: data.appId }, 'app:broadcast failed')
      }
    })
  })
}
