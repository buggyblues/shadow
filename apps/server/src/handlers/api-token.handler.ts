import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createApiTokenSchema } from '../validators/api-token.schema'

export function createApiTokenHandler(container: AppContainer) {
  const handler = new Hono()

  // POST /api/tokens — create a new personal access token
  handler.post('/', authMiddleware, zValidator('json', createApiTokenSchema), async (c) => {
    const apiTokenUseCase = container.resolve('apiTokenUseCase')
    const actor = c.get('actor')
    const input = c.req.valid('json')
    const result = await apiTokenUseCase.createToken(actor, input)
    return c.json(result, 201)
  })

  // GET /api/tokens — list all tokens for the current user
  handler.get('/', authMiddleware, async (c) => {
    const apiTokenUseCase = container.resolve('apiTokenUseCase')
    const actor = c.get('actor')
    const tokens = await apiTokenUseCase.listTokens(actor)
    return c.json(tokens)
  })

  // DELETE /api/tokens/:tokenId — revoke and delete a token
  handler.delete('/:tokenId', authMiddleware, async (c) => {
    const apiTokenUseCase = container.resolve('apiTokenUseCase')
    const actor = c.get('actor')
    const tokenId = c.req.param('tokenId')!

    const result = await apiTokenUseCase.deleteToken(actor, tokenId)
    if (!result) {
      return c.json({ ok: false, error: 'Token not found' }, 404)
    }
    return c.json(result)
  })

  return handler
}
