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

  // Get invite by code (public, for QR code scanning)
  handler.get('/:code', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const code = c.req.param('code')

    const invite = await inviteCodeDao.findByCode(code)
    if (!invite) {
      return c.json({ error: 'Invite not found' }, 404)
    }

    // Check if expired
    if (invite.invite.expiresAt && new Date(invite.invite.expiresAt) < new Date()) {
      return c.json({ error: 'Invite expired', code }, 410)
    }

    // Check if max uses reached
    if (invite.invite.maxUses && invite.invite.usedCount >= invite.invite.maxUses) {
      return c.json({ error: 'Invite max uses reached', code }, 410)
    }

    // Check if inactive
    if (!invite.invite.isActive) {
      return c.json({ error: 'Invite inactive', code }, 410)
    }

    return c.json({
      code: invite.invite.code,
      type: invite.invite.type,
      note: invite.invite.note,
      expiresAt: invite.invite.expiresAt,
      maxUses: invite.invite.maxUses,
      usedCount: invite.invite.usedCount,
      createdBy: invite.createdBy,
    })
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
          type: 'user',
          createdBy: user.userId,
          note,
        })
        codes.push(code)
      }
      return c.json(codes, 201)
    },
  )

  // Accept/Use invite
  handler.post('/:code/accept', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const friendshipDao = container.resolve('friendshipDao')
    const user = c.get('user') as { userId: string }
    const code = c.req.param('code')

    const invite = await inviteCodeDao.findAvailable(code)
    if (!invite) {
      return c.json({ error: 'Invite not found or expired' }, 404)
    }

    // Mark as used
    await inviteCodeDao.markUsed(invite.id, user.userId)

    // Handle user invites (friend requests)
    if (invite.type === 'user' && invite.userId) {
      const existing = await friendshipDao.findBetween(user.userId, invite.userId)
      if (existing) {
        return c.json({ error: 'Friendship already exists', userId: invite.userId }, 409)
      }
      await friendshipDao.create({
        requesterId: user.userId,
        addresseeId: invite.userId,
        status: 'pending',
      })
      return c.json({ success: true, type: 'user', userId: invite.userId })
    }

    return c.json({ success: true, type: invite.type })
  })

  // Deactivate own invite code
  handler.patch('/:id/deactivate', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')

    // Verify ownership
    const codes = await inviteCodeDao.findByCreator(user.userId, 1000, 0)
    const owned = codes.find((code) => code.id === id)
    if (!owned) {
      return c.json({ error: 'Not found or not owned' }, 404)
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
      return c.json({ error: 'Not found or not owned' }, 404)
    }

    await inviteCodeDao.delete(id)
    return c.json({ success: true })
  })

  return handler
}
