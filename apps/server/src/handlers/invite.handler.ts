import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function createInviteHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('*', authMiddleware)

  // List current user's invite codes (with usage info)
  handler.get('/', async (c) => {
    const user = c.get('user') as { userId: string }
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const codes = await inviteCodeDao.findByCreator(user.userId)
    return c.json(codes)
  })

  // Create invite codes (any authenticated user, max 5 at a time)
  handler.post(
    '/',
    zValidator(
      'json',
      z.object({
        count: z.number().min(1).max(5).default(1),
        note: z.string().max(200).optional(),
      }),
    ),
    async (c) => {
      const inviteCodeDao = container.resolve('inviteCodeDao')
      const user = c.get('user') as { userId: string }
      const { count, note } = c.req.valid('json')
      const codes = []
      for (let i = 0; i < count; i++) {
        const code = await inviteCodeDao.create({
          code: generateCode(),
          createdBy: user.userId,
          note,
        })
        codes.push(code)
      }
      return c.json(codes, 201)
    },
  )

  // Deactivate own invite code
  handler.patch('/:id/deactivate', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')

    // Verify ownership
    const codes = await inviteCodeDao.findByCreator(user.userId, 1000, 0)
    const owned = codes.find((code) => code.id === id)
    if (!owned) {
      return c.json({ ok: false, error: 'Not found or not owned' }, 404)
    }

    const code = await inviteCodeDao.deactivate(id)
    return c.json(code)
  })

  // Delete own invite code
  handler.delete('/:id', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')

    // Verify ownership
    const codes = await inviteCodeDao.findByCreator(user.userId, 1000, 0)
    const owned = codes.find((code) => code.id === id)
    if (!owned) {
      return c.json({ ok: false, error: 'Not found or not owned' }, 404)
    }

    await inviteCodeDao.delete(id)
    return c.json({ ok: true })
  })

  return handler
}
