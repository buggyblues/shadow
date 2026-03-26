import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createCommentSchema,
  createPortfolioSchema,
  listCommentsSchema,
  portfolioFiltersSchema,
  updatePortfolioSchema,
} from '../validators/portfolio.schema'

export function createPortfolioHandler(container: AppContainer) {
  const portfolioHandler = new Hono()

  portfolioHandler.use('*', authMiddleware)

  // ============ Portfolio CRUD ============

  // GET /api/portfolios - List portfolios with filters
  portfolioHandler.get('/portfolios', zValidator('query', portfolioFiltersSchema), async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const filters = c.req.valid('query')
    const user = c.get('user')
    const result = await portfolioService.list(filters, user.userId)
    return c.json(result)
  })

  // GET /api/portfolios/:id - Get portfolio detail
  portfolioHandler.get('/portfolios/:id', async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const id = c.req.param('id')
    const user = c.get('user')

    const portfolio = await portfolioService.getWithOwner(id, user.userId)
    if (!portfolio) {
      return c.json({ error: 'Portfolio not found' }, 404)
    }

    // Check visibility
    if (portfolio.visibility === 'private' && portfolio.ownerId !== user.userId) {
      return c.json({ error: 'Portfolio not found' }, 404)
    }

    return c.json(portfolio)
  })

  // POST /api/portfolios - Create portfolio from attachment
  portfolioHandler.post('/portfolios', zValidator('json', createPortfolioSchema), async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const input = c.req.valid('json')
    const user = c.get('user')

    const portfolio = await portfolioService.createFromAttachment(user.userId, input)
    return c.json(portfolio, 201)
  })

  // PATCH /api/portfolios/:id - Update portfolio metadata
  portfolioHandler.patch(
    '/portfolios/:id',
    zValidator('json', updatePortfolioSchema),
    async (c) => {
      const portfolioService = container.resolve('portfolioService')
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const user = c.get('user')

      const portfolio = await portfolioService.update(id, user.userId, input)
      return c.json(portfolio)
    },
  )

  // DELETE /api/portfolios/:id - Delete portfolio
  portfolioHandler.delete('/portfolios/:id', async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const id = c.req.param('id')
    const user = c.get('user')

    await portfolioService.delete(id, user.userId)
    return c.json({ success: true })
  })

  // POST /api/portfolios/:id/view - Increment view count
  portfolioHandler.post('/portfolios/:id/view', async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const id = c.req.param('id')

    await portfolioService.recordView(id)
    return c.json({ success: true })
  })

  // ============ User Portfolio ============

  // GET /api/users/:userId/portfolio - Get user's portfolio
  portfolioHandler.get('/users/:userId/portfolio', async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const userId = c.req.param('userId')
    const user = c.get('user')

    const result = await portfolioService.getByUserId(userId, user.userId)
    return c.json(result)
  })

  // ============ Likes ============

  // POST /api/portfolios/:id/like - Like a portfolio item
  portfolioHandler.post('/portfolios/:id/like', async (c) => {
    const portfolioSocialService = container.resolve('portfolioSocialService')
    const id = c.req.param('id')
    const user = c.get('user')

    const result = await portfolioSocialService.toggleLike(id, user.userId)
    return c.json(result)
  })

  // DELETE /api/portfolios/:id/like - Unlike
  portfolioHandler.delete('/portfolios/:id/like', async (c) => {
    const portfolioSocialService = container.resolve('portfolioSocialService')
    const id = c.req.param('id')
    const user = c.get('user')

    const result = await portfolioSocialService.unlike(id, user.userId)
    return c.json(result)
  })

  // ============ Favorites ============

  // POST /api/portfolios/:id/favorite - Favorite
  portfolioHandler.post('/portfolios/:id/favorite', async (c) => {
    const portfolioSocialService = container.resolve('portfolioSocialService')
    const id = c.req.param('id')
    const user = c.get('user')

    const result = await portfolioSocialService.toggleFavorite(id, user.userId)
    return c.json(result)
  })

  // DELETE /api/portfolios/:id/favorite - Unfavorite
  portfolioHandler.delete('/portfolios/:id/favorite', async (c) => {
    const portfolioSocialService = container.resolve('portfolioSocialService')
    const id = c.req.param('id')
    const user = c.get('user')

    const result = await portfolioSocialService.unfavorite(id, user.userId)
    return c.json(result)
  })

  // GET /api/users/me/favorites - List user's favorites
  portfolioHandler.get('/users/me/favorites', async (c) => {
    const portfolioService = container.resolve('portfolioService')
    const user = c.get('user')
    const limit = Number(c.req.query('limit') ?? '20')
    const cursor = c.req.query('cursor')

    const result = await portfolioService.getFavorites(user.userId, limit, cursor)
    return c.json(result)
  })

  // ============ Comments ============

  // GET /api/portfolios/:id/comments - List comments
  portfolioHandler.get(
    '/portfolios/:id/comments',
    zValidator('query', listCommentsSchema),
    async (c) => {
      const portfolioSocialService = container.resolve('portfolioSocialService')
      const id = c.req.param('id')
      const query = c.req.valid('query')

      const result = await portfolioSocialService.listComments(id, {
        limit: query.limit,
        cursor: query.cursor,
      })
      return c.json(result)
    },
  )

  // POST /api/portfolios/:id/comments - Add comment
  portfolioHandler.post(
    '/portfolios/:id/comments',
    zValidator('json', createCommentSchema),
    async (c) => {
      const portfolioSocialService = container.resolve('portfolioSocialService')
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const user = c.get('user')

      const comment = await portfolioSocialService.addComment(id, user.userId, input)
      return c.json(comment, 201)
    },
  )

  // DELETE /api/portfolios/:id/comments/:commentId - Delete comment
  portfolioHandler.delete('/portfolios/:id/comments/:commentId', async (c) => {
    const portfolioSocialService = container.resolve('portfolioSocialService')
    const commentId = c.req.param('commentId')
    const user = c.get('user')

    await portfolioSocialService.deleteComment(commentId, user.userId)
    return c.json({ success: true })
  })

  return portfolioHandler
}
