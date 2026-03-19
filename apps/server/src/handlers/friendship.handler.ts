import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

export function createFriendshipHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('*', authMiddleware)

  // POST /api/friends/request — Send friend request by username
  handler.post(
    '/request',
    zValidator('json', z.object({ username: z.string().min(1).max(32) })),
    async (c) => {
      const friendshipService = container.resolve('friendshipService')
      const user = c.get('user')
      const { username } = c.req.valid('json')
      const result = await friendshipService.sendRequest(user.userId, username)

      // Notify the target user via WebSocket so their UI updates in real-time
      try {
        const io = container.resolve('io')
        const userDao = container.resolve('userDao')
        const targetUser = await userDao.findByUsername(username)
        if (targetUser) {
          const requester = await userDao.findById(user.userId)
          const senderName = requester?.displayName ?? requester?.username ?? 'Someone'

          // Emit friend request event for real-time UI updates
          io.to(`user:${targetUser.id}`).emit('friend:request', result)

          // Also send a notification
          if (result) {
            const notificationService = container.resolve('notificationService')
            const notification = await notificationService.create({
              userId: targetUser.id,
              type: 'system',
              title: `${senderName} sent you a friend request`,
              referenceId: result.id,
              referenceType: 'friendship',
              senderId: user.userId,
            })
            io.to(`user:${targetUser.id}`).emit('notification:new', notification)
          }
        }
      } catch {
        /* notification failed, non-critical */
      }

      return c.json(result, 201)
    },
  )

  // POST /api/friends/:id/accept — Accept a pending request
  handler.post('/:id/accept', async (c) => {
    const friendshipService = container.resolve('friendshipService')
    const user = c.get('user')
    const id = c.req.param('id')
    const result = await friendshipService.acceptRequest(user.userId, id)

    // Notify the requester that their friend request was accepted
    try {
      const io = container.resolve('io')
      if (result?.requesterId) {
        io.to(`user:${result.requesterId}`).emit('friend:accepted', result)
      }
    } catch {
      /* non-critical */
    }

    return c.json(result)
  })

  // POST /api/friends/:id/reject — Reject a pending request
  handler.post('/:id/reject', async (c) => {
    const friendshipService = container.resolve('friendshipService')
    const user = c.get('user')
    const id = c.req.param('id')
    await friendshipService.rejectRequest(user.userId, id)
    return c.json({ ok: true })
  })

  // DELETE /api/friends/:id — Remove friend
  handler.delete('/:id', async (c) => {
    const friendshipService = container.resolve('friendshipService')
    const user = c.get('user')
    const id = c.req.param('id')
    await friendshipService.removeFriend(user.userId, id)
    return c.json({ success: true })
  })

  // GET /api/friends — List all friends
  handler.get('/', async (c) => {
    const friendshipService = container.resolve('friendshipService')
    const user = c.get('user')
    const friends = await friendshipService.getFriends(user.userId)
    return c.json(friends)
  })

  // GET /api/friends/pending — List pending received requests
  handler.get('/pending', async (c) => {
    const friendshipService = container.resolve('friendshipService')
    const user = c.get('user')
    const pending = await friendshipService.getPendingReceived(user.userId)
    return c.json(pending)
  })

  // GET /api/friends/sent — List pending sent requests
  handler.get('/sent', async (c) => {
    const friendshipService = container.resolve('friendshipService')
    const user = c.get('user')
    const sent = await friendshipService.getPendingSent(user.userId)
    return c.json(sent)
  })

  return handler
}
