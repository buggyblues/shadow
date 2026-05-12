import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'

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
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const profileUserId = c.req.param('profileUserId')
    const limit = parseInt(c.req.query('limit') ?? '20', 10)
    const offset = parseInt(c.req.query('offset') ?? '0', 10)

    if (!profileUserId) {
      return c.json({ ok: false, error: 'Missing profileUserId' }, 400)
    }

    const comments = await profileCommentUseCase.findByProfileUserId({
      ctx: createActorContext(c.get('actor')),
      profileUserId,
      limit,
      offset,
    })

    return c.json(comments)
  })

  // GET /api/profile-comments/:profileUserId/stats — Get reaction stats for profile
  handler.get('/:profileUserId/stats', async (c) => {
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const profileUserId = c.req.param('profileUserId')

    if (!profileUserId) {
      return c.json({ ok: false, error: 'Missing profileUserId' }, 400)
    }

    const stats = await profileCommentUseCase.getReactionStats({
      ctx: createActorContext(c.get('actor')),
      profileUserId,
    })
    return c.json(stats)
  })

  // GET /api/profile-comments/replies/:parentId — Get replies for a comment
  handler.get('/replies/:parentId', async (c) => {
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const parentId = c.req.param('parentId')
    const limit = parseInt(c.req.query('limit') ?? '10', 10)
    const offset = parseInt(c.req.query('offset') ?? '0', 10)

    if (!parentId) {
      return c.json({ ok: false, error: 'Missing parentId' }, 400)
    }

    const replies = await profileCommentUseCase.findReplies({
      ctx: createActorContext(c.get('actor')),
      parentId,
      limit,
      offset,
    })
    return c.json(replies)
  })

  // POST /api/profile-comments — Create a comment
  handler.post('/', zValidator('json', createCommentSchema), async (c) => {
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const user = c.get('user')
    const input = c.req.valid('json')

    const result = await profileCommentUseCase.createComment({
      ctx: createActorContext(c.get('actor')),
      profileUserId: input.profileUserId,
      content: input.content,
      parentId: input.parentId,
    })
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 404)
    }

    const comment = result.comment

    // Notify profile owner via WebSocket
    try {
      const io = container.resolve('io')
      const author = await profileCommentUseCase.getUserById({
        ctx: createActorContext(c.get('actor')),
        userId: user.userId,
      })

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
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const id = c.req.param('id')

    if (!id) {
      return c.json({ ok: false, error: 'Missing comment id' }, 400)
    }

    const result = await profileCommentUseCase.deleteComment({
      ctx: createActorContext(c.get('actor')),
      id,
    })
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 404)
    }

    return c.json({ ok: true })
  })

  // POST /api/profile-comments/:id/reactions — Add reaction
  handler.post('/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const id = c.req.param('id')
    const { emoji } = c.req.valid('json')

    if (!id) {
      return c.json({ ok: false, error: 'Missing comment id' }, 400)
    }

    const result = await profileCommentUseCase.addReaction({
      ctx: createActorContext(c.get('actor')),
      commentId: id,
      emoji,
    })
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 400)
    }

    return c.json(result.reaction, 201)
  })

  // DELETE /api/profile-comments/:id/reactions — Remove reaction
  handler.delete('/:id/reactions', zValidator('json', reactionSchema), async (c) => {
    const profileCommentUseCase = container.resolve('profileCommentUseCase')
    const id = c.req.param('id')
    const { emoji } = c.req.valid('json')

    if (!id) {
      return c.json({ ok: false, error: 'Missing comment id' }, 400)
    }

    const result = await profileCommentUseCase.removeReaction({
      ctx: createActorContext(c.get('actor')),
      commentId: id,
      emoji,
    })
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 404)
    }

    return c.json({ ok: true })
  })

  return handler
}
