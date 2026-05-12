import { randomBytes } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(bytes[i]! % chars.length)
  }
  return code
}

export function createInviteHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('*', authMiddleware)

  // List current user's invite codes (with usage info)
  handler.get('/', async (c) => {
    const inviteUseCase = container.resolve('inviteUseCase')
    const codes = await inviteUseCase.findMyCodes({
      ctx: createActorContext(c.get('actor')),
    })
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
      const inviteUseCase = container.resolve('inviteUseCase')
      const membershipService = container.resolve('membershipService')
      const user = c.get('user') as { userId: string }
      const { count, note } = c.req.valid('json')
      await membershipService.requireMember(user.userId, 'invite:create')
      const codes = []
      for (let i = 0; i < count; i++) {
        const code = await inviteUseCase.createCode({
          ctx: createActorContext(c.get('actor')),
          code: generateCode(),
          note,
        })
        codes.push(code)
      }
      return c.json(codes, 201)
    },
  )

  // Deactivate own invite code
  handler.patch('/:id/deactivate', async (c) => {
    const inviteUseCase = container.resolve('inviteUseCase')
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')

    // Verify ownership
    const codes = await inviteUseCase.findMyCodes({
      ctx: createActorContext(c.get('actor')),
      limit: 1000,
    })
    const owned = codes.find((code: { id: string }) => code.id === id)
    if (!owned) {
      return c.json({ ok: false, error: 'Not found or not owned' }, 404)
    }

    const code = await inviteUseCase.deactivateCode({
      ctx: createActorContext(c.get('actor')),
      id,
    })
    return c.json(code)
  })

  // Delete own invite code
  handler.delete('/:id', async (c) => {
    const inviteUseCase = container.resolve('inviteUseCase')
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')

    // Verify ownership
    const codes = await inviteUseCase.findMyCodes({
      ctx: createActorContext(c.get('actor')),
      limit: 1000,
    })
    const owned = codes.find((code: { id: string }) => code.id === id)
    if (!owned) {
      return c.json({ ok: false, error: 'Not found or not owned' }, 404)
    }

    await inviteUseCase.deleteCode({
      ctx: createActorContext(c.get('actor')),
      id,
    })
    return c.json({ ok: true })
  })

  return handler
}
