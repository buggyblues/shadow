import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'

const onlineUsers = new Map<string, Set<string>>() // userId -> Set<socketId>

/** In-memory activity status: userId → { activity, channelId, expiresAt } */
const userActivities = new Map<
  string,
  { activity: string; channelId: string; timer: ReturnType<typeof setTimeout> }
>()

export function setupPresenceGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined
    if (!userId) return

    // Track online user
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set())
      // Broadcast online status
      const userDao = container.resolve('userDao')
      void userDao.updateStatus(userId, 'online')
      io.emit('presence:change', { userId, status: 'online' })
    }
    onlineUsers.get(userId)!.add(socket.id)

    // presence:update
    socket.on(
      'presence:update',
      async ({ status }: { status: 'online' | 'idle' | 'dnd' | 'offline' }) => {
        const userDao = container.resolve('userDao')
        await userDao.updateStatus(userId, status)
        io.emit('presence:change', { userId, status })
      },
    )

    // presence:activity — agent/user activity status (thinking, working, etc.)
    socket.on(
      'presence:activity',
      ({ channelId, activity }: { channelId: string; activity: string | null }) => {
        // Clear any existing auto-expire timer
        const existing = userActivities.get(userId)
        if (existing?.timer) clearTimeout(existing.timer)

        if (activity) {
          // Set activity with auto-expire (60s safety net)
          const timer = setTimeout(() => {
            userActivities.delete(userId)
            io.to(`channel:${channelId}`).emit('presence:activity', {
              userId,
              channelId,
              activity: null,
            })
          }, 60_000)

          userActivities.set(userId, { activity, channelId, timer })
        } else {
          userActivities.delete(userId)
        }

        // Broadcast to channel room
        io.to(`channel:${channelId}`).emit('presence:activity', {
          userId,
          channelId,
          activity,
        })
      },
    )

    // Disconnect
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          onlineUsers.delete(userId)
          const userDao = container.resolve('userDao')
          void userDao.updateStatus(userId, 'offline')
          io.emit('presence:change', { userId, status: 'offline' })

          // Clear activity on disconnect
          const act = userActivities.get(userId)
          if (act) {
            clearTimeout(act.timer)
            userActivities.delete(userId)
            io.to(`channel:${act.channelId}`).emit('presence:activity', {
              userId,
              channelId: act.channelId,
              activity: null,
            })
          }
        }
      }
    })
  })
}

/** Get online user IDs */
export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys())
}
