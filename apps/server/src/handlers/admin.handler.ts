import { zValidator } from '@hono/zod-validator'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { channels, messages } from '../db/schema'
import { authMiddleware } from '../middleware/auth.middleware'
import { updateServerSchema } from '../validators/server.schema'

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function createAdminHandler(container: AppContainer) {
  const adminHandler = new Hono()

  adminHandler.use('*', authMiddleware)

  // Admin-only middleware: check isAdmin on the authenticated user
  adminHandler.use('*', async (c, next) => {
    const user = c.get('user') as { userId: string }
    const userDao = container.resolve('userDao')
    const dbUser = await userDao.findById(user.userId)
    if (!dbUser || !dbUser.isAdmin) {
      return c.json({ error: 'Forbidden: admin access required' }, 403)
    }
    await next()
  })

  // ── Stats ─────────────────────────────────────────
  adminHandler.get('/stats', async (c) => {
    const userDao = container.resolve('userDao')
    const serverDao = container.resolve('serverDao')
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const db = container.resolve('db')

    const [allUsers, allServers, totalCodes, usedCodes, msgCountResult, chCountResult] =
      await Promise.all([
        userDao.findAll(9999, 0),
        serverDao.findAll(9999, 0),
        inviteCodeDao.count(),
        inviteCodeDao.countUsed(),
        db.select({ count: sql<number>`count(*)` }).from(messages),
        db.select({ count: sql<number>`count(*)` }).from(channels),
      ])

    const onlineUsers = allUsers.filter((u: { status?: string }) => u.status === 'online').length

    return c.json({
      totalUsers: allUsers.length,
      onlineUsers,
      totalServers: allServers.length,
      totalMessages: Number(msgCountResult[0]?.count ?? 0),
      totalChannels: Number(chCountResult[0]?.count ?? 0),
      totalInviteCodes: totalCodes,
      usedInviteCodes: usedCodes,
    })
  })

  // ── Invite Codes ──────────────────────────────────
  adminHandler.get('/invite-codes', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const codes = await inviteCodeDao.findAll(limit, offset)
    return c.json(codes)
  })

  adminHandler.post(
    '/invite-codes',
    zValidator(
      'json',
      z.object({
        count: z.number().min(1).max(100).default(1),
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

  adminHandler.delete('/invite-codes/:id', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const id = c.req.param('id')
    await inviteCodeDao.delete(id)
    return c.json({ success: true })
  })

  adminHandler.patch('/invite-codes/:id/deactivate', async (c) => {
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const id = c.req.param('id')
    const code = await inviteCodeDao.deactivate(id)
    return c.json(code)
  })

  // ── Users ─────────────────────────────────────────
  adminHandler.get('/users', async (c) => {
    const userDao = container.resolve('userDao')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const users = await userDao.findAll(limit, offset)
    return c.json(
      users.map((u: Record<string, unknown>) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        status: u.status,
        isBot: u.isBot,
        createdAt: u.createdAt,
      })),
    )
  })

  adminHandler.patch(
    '/users/:id',
    zValidator(
      'json',
      z.object({
        displayName: z.string().optional(),
        status: z.enum(['online', 'idle', 'dnd', 'offline']).optional(),
      }),
    ),
    async (c) => {
      const userDao = container.resolve('userDao')
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const user = await userDao.update(id, input)
      return c.json(user)
    },
  )

  adminHandler.delete('/users/:id', async (c) => {
    const userDao = container.resolve('userDao')
    const id = c.req.param('id')
    await userDao.update(id, { displayName: '[deleted]' })
    return c.json({ success: true })
  })

  // ── Servers ───────────────────────────────────────
  adminHandler.get('/servers', async (c) => {
    const serverDao = container.resolve('serverDao')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const servers = await serverDao.findAll(limit, offset)
    return c.json(servers)
  })

  // Server detail — get a single server by ID
  adminHandler.get('/servers/:id', async (c) => {
    const serverDao = container.resolve('serverDao')
    const id = c.req.param('id')
    const server = await serverDao.findById(id)
    if (!server) return c.json({ error: 'Server not found' }, 404)
    return c.json(server)
  })

  // Channels for a specific server
  adminHandler.get('/servers/:id/channels', async (c) => {
    const channelDao = container.resolve('channelDao')
    const serverId = c.req.param('id')
    const chs = await channelDao.findByServerId(serverId)
    return c.json(chs)
  })

  // Messages for a specific channel (admin)
  adminHandler.get('/servers/:serverId/channels/:channelId/messages', async (c) => {
    const messageDao = container.resolve('messageDao')
    const channelId = c.req.param('channelId')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const msgs = await messageDao.findByChannelId(channelId, limit, cursor)
    return c.json(msgs)
  })

  // Update server settings (admin)
  adminHandler.patch('/servers/:id', zValidator('json', updateServerSchema), async (c) => {
    const serverDao = container.resolve('serverDao')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const server = await serverDao.findById(id)
    if (!server) return c.json({ error: 'Server not found' }, 404)
    const updated = await serverDao.update(id, input)
    return c.json(updated)
  })

  adminHandler.delete('/servers/:id', async (c) => {
    const serverDao = container.resolve('serverDao')
    const id = c.req.param('id')
    await serverDao.delete(id)
    return c.json({ success: true })
  })

  // ── Messages ──────────────────────────────────────
  adminHandler.delete('/messages/:id', async (c) => {
    const messageDao = container.resolve('messageDao')
    const id = c.req.param('id')
    await messageDao.delete(id)
    return c.json({ success: true })
  })

  // ── Channels ──────────────────────────────────────
  adminHandler.get('/channels', async (c) => {
    const channelDao = container.resolve('channelDao')
    const serverId = c.req.query('serverId')
    if (serverId) {
      const channels = await channelDao.findByServerId(serverId)
      return c.json(channels)
    }
    return c.json([])
  })

  adminHandler.delete('/channels/:id', async (c) => {
    const channelDao = container.resolve('channelDao')
    const id = c.req.param('id')
    await channelDao.delete(id)
    return c.json({ success: true })
  })

  return adminHandler
}
