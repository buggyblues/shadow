import { createHash, randomBytes } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createApiTokenSchema } from '../validators/api-token.schema'

function generatePatToken(): string {
  return `pat_${randomBytes(32).toString('hex')}`
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createApiTokenHandler(container: AppContainer) {
  const handler = new Hono()

  // POST /api/tokens — create a new personal access token
  handler.post('/', authMiddleware, zValidator('json', createApiTokenSchema), async (c) => {
    const apiTokenDao = container.resolve('apiTokenDao')
    const user = c.get('user')
    const input = c.req.valid('json')

    const plainToken = generatePatToken()
    const tokenHash = hashToken(plainToken)

    let expiresAt: Date | null = null
    if (input.expiresInDays) {
      expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    }

    const token = await apiTokenDao.create({
      userId: user.userId,
      tokenHash,
      name: input.name,
      scope: input.scope,
      expiresAt,
    })

    // Return the plaintext token ONLY on creation
    return c.json(
      {
        id: token!.id,
        name: token!.name,
        token: plainToken,
        scope: token!.scope,
        expiresAt: token!.expiresAt,
        createdAt: token!.createdAt,
      },
      201,
    )
  })

  // GET /api/tokens — list all tokens for the current user
  handler.get('/', authMiddleware, async (c) => {
    const apiTokenDao = container.resolve('apiTokenDao')
    const user = c.get('user')
    const tokens = await apiTokenDao.findByUserId(user.userId)
    return c.json(tokens)
  })

  // DELETE /api/tokens/:tokenId — revoke and delete a token
  handler.delete('/:tokenId', authMiddleware, async (c) => {
    const apiTokenDao = container.resolve('apiTokenDao')
    const user = c.get('user')
    const tokenId = c.req.param('tokenId')!

    const existing = await apiTokenDao.findById(tokenId, user.userId)
    if (!existing) {
      return c.json({ ok: false, error: 'Token not found' }, 404)
    }

    await apiTokenDao.delete(tokenId, user.userId)
    return c.json({ ok: true })
  })

  return handler
}
