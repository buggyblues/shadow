import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

// Allowed emojis for reactions
const ALLOWED_EMOJIS = ['👍', '👎', '❤️', '😂', '🎉', '👀', '🔥', '👣', '🙏', '💪'] as const

const createCommentSchema = z.object({
  profileUserId: z.string().uuid(),
  content: z.string().min(1).max(500),
  parentId: z.string().uuid().optional(),
})

const reactionSchema = z.object({
  emoji: z.enum(ALLOWED_EMOJIS),
})

export function createProfileCommentHandler(container: AppContainer) {
  const handler = new Hono()

  // All routes require auth
  handler.use('*', authMiddleware)

  // GET /api/profile-comments/:profileUserId — Get comments for a profile
  handler.get('/:profileUserId', async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const user = c.get('user')
    const profileUserId = c.req.param('profileUserId')
    const limit = parseInt(c.req.query('limit') ?? '20', 10)
    const offset = parseInt(c.req.query('offset') ?? '0', 10)

    if (!profileUserId) {
      return c.json({ ok: false, error: 'Missing profileUserId' }, 400)
    }

    const comments = await profileCommentDao.findByProfileUserId(
      profileUserId,
      user?.userId ?? null,
      limit,
      offset,
    )

    return c.json(comments)
  })

  // GET /api/profile-comments/:profileUserId/stats — Get reaction stats for profile
  handler.get('/:profileUserId/stats', async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const profileUserId = c.req.param('profileUserId')

    if (!profileUserId) {
      return c.json({ ok: false, error: 'Missing profileUserId' }, 400)
    }

    const stats = await profileCommentDao.getReactionStats(profileUserId)
    return c.json(stats)
  })

  // GET /api/profile-comments/replies/:parentId — Get replies for a comment
  handler.get('/replies/:parentId', async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const user = c.get('user')
    const parentId = c.req.param('parentId')
    const limit = parseInt(c.req.query('limit') ?? '10', 10)
    const offset = parseInt(c.req.query('offset') ?? '0', 10)

    if (!parentId) {
      return c.json({ ok: false, error: 'Missing parentId' }, 400)
    }

    const replies = await profileCommentDao.findReplies(
      parentId,
      user?.userId ?? null,
      limit,
      offset,
    )
    return c.json(replies)
  })

  // POST /api/profile-comments — Create a comment
  handler.post('/', zValidator('json', createCommentSchema), async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const userDao = container.resolve('userDao')
    const user = c.get('user')
    const input = c.req.valid('json')

    // Verify profile user exists
    const profileUser = await userDao.findById(input.profileUserId)
    if (!profileUser) {
      return c.json({ ok: false, error: 'Profile user not found' }, 404)
    }

    // If replying, verify parent comment exists and belongs to same profile
    if (input.parentId) {
      const parentComment = await profileCommentDao.findById(input.parentId)
      if (!parentComment) {
        return c.json({ ok: false, error: 'Parent comment not found' }, 404)
      }
      if (parentComment.profileUserId !== input.profileUserId) {
        return c.json({ ok: false, error: 'Parent comment does not belong to this profile' }, 400)
      }
    }

    const comment = await profileCommentDao.create({
      profileUserId: input.profileUserId,
      authorId: user.userId,
      content: input.content,
      parentId: input.parentId,
    })

    // Notify profile owner via WebSocket
    try {
      const io = container.resolve('io')
      const author = await userDao.findById(user.userId)

      io.to(`user:${input.profileUserId}`).emit('profile:comment', {
        ...comment,
        author: {
          id: author?.id,
          username: author?.username,
          displayName: author?.displayName,
          avatarUrl: author?.avatarUrl,
        },
      })
    } catch {
      /* non-critical */
    }

    return c.json(comment, 201)
  })

  // DELETE /api/profile-comments/:id — Delete own comment
  handler.delete('/:id', async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const user = c.get('user')
    const id = c.req.param('id')

    if (!id) {
      return c.json({ ok: false, error: 'Missing comment id' }, 400)
    }

    const deleted = await profileCommentDao.delete(id, user.userId)
    if (!deleted) {
      return c.json({ ok: false, error: 'Comment not found or not authorized' }, 404)
    }

    return c.json({ ok: true })
  })

  // POST /api/profile-comments/:id/reactions — Add reaction
  handler.post('/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const user = c.get('user')
    const id = c.req.param('id')
    const { emoji } = c.req.valid('json')

    if (!id) {
      return c.json({ ok: false, error: 'Missing comment id' }, 400)
    }

    // Verify comment exists
    const comment = await profileCommentDao.findById(id)
    if (!comment) {
      return c.json({ ok: false, error: 'Comment not found' }, 404)
    }

    const reaction = await profileCommentDao.addReaction(id, user.userId, emoji)
    if (!reaction) {
      return c.json({ ok: false, error: 'Already reacted with this emoji' }, 400)
    }

    return c.json(reaction, 201)
  })

  // DELETE /api/profile-comments/:id/reactions — Remove reaction
  handler.delete('/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const profileCommentDao = container.resolve('profileCommentDao')
    const user = c.get('user')
    const id = c.req.param('id')
    const { emoji } = c.req.valid('json')

    if (!id) {
      return c.json({ ok: false, error: 'Missing comment id' }, 400)
    }

    const deleted = await profileCommentDao.removeReaction(id, user.userId, emoji)
    if (!deleted) {
      return c.json({ ok: false, error: 'Reaction not found' }, 404)
    }

    return c.json({ ok: true })
  })

  return handler
}
