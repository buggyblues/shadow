import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createServerSchema,
  joinServerSchema,
  updateMemberSchema,
  updateServerSchema,
} from '../validators/server.schema'

export function createServerHandler(container: AppContainer) {
  const serverHandler = new Hono()

  const resolveServerId = async (idOrSlug: string) => {
    const serverService = container.resolve('serverService')
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    if (isUuid) return idOrSlug
    const bySlug = await serverService.getBySlug(idOrSlug)
    return bySlug.id
  }

  // Public endpoint: GET /api/servers/discover - browse public servers
  serverHandler.get('/discover', async (c) => {
    const serverService = container.resolve('serverService')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const servers = await serverService.discoverPublic(limit, offset)
    return c.json(servers)
  })

  // Public endpoint: GET /api/servers/invite/:code - get server info by invite code
  serverHandler.get('/invite/:code', async (c) => {
    const serverService = container.resolve('serverService')
    const code = c.req.param('code')
    try {
      const server = await serverService.getByInviteCode(code)
      return c.json({
        id: server.id,
        name: server.name,
        iconUrl: server.iconUrl,
      })
    } catch {
      return c.json({ error: 'Invalid invite code' }, 404)
    }
  })

  // All other server routes require authentication
  serverHandler.use('*', authMiddleware)

  // POST /api/servers
  serverHandler.post('/', zValidator('json', createServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const input = c.req.valid('json')
    const user = c.get('user')
    const server = await serverService.create(input, user.userId)
    return c.json(server, 201)
  })

  // GET /api/servers
  serverHandler.get('/', async (c) => {
    const serverService = container.resolve('serverService')
    const user = c.get('user')
    const servers = await serverService.getUserServers(user.userId)
    return c.json(servers)
  })

  // GET /api/servers/:id
  // GET /api/servers/:id (supports UUID or slug)
  serverHandler.get('/:id', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    // Try UUID first, then slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const server = isUuid ? await serverService.getById(id) : await serverService.getBySlug(id)
    return c.json(server)
  })

  // PATCH /api/servers/:id (supports UUID or slug)
  serverHandler.patch('/:id', zValidator('json', updateServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const resolvedId = isUuid ? id : (await serverService.getBySlug(id)).id
    const input = c.req.valid('json')
    const server = await serverService.update(resolvedId, input, c.get('user').userId)
    return c.json(server)
  })

  // DELETE /api/servers/:id (supports UUID or slug)
  serverHandler.delete('/:id', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const resolvedId = isUuid ? id : (await serverService.getBySlug(id)).id
    const user = c.get('user')
    await serverService.delete(resolvedId, user.userId)
    return c.json({ success: true })
  })

  // POST /api/servers/:id/join
  serverHandler.post('/:id/join', zValidator('json', joinServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const { inviteCode } = c.req.valid('json')
    const user = c.get('user')
    try {
      const server = await serverService.join(inviteCode, user.userId)

      // Emit member:joined to all channel rooms in the server
      try {
        const io = container.resolve('io')
        const channelDao = container.resolve('channelDao')
        const userDao = container.resolve('userDao')
        const fullUser = await userDao.findById(user.userId)
        const channels = await channelDao.findByServerId(server.id)
        const payload = {
          serverId: server.id,
          userId: user.userId,
          username: fullUser?.username ?? 'unknown',
          displayName: fullUser?.displayName ?? fullUser?.username ?? 'unknown',
          avatarUrl: fullUser?.avatarUrl ?? null,
          isBot: fullUser?.isBot ?? false,
        }
        for (const ch of channels) {
          io.to(`channel:${ch.id}`).emit('member:joined', payload)
        }

        // Send notification to server owner about the new member
        if (server.ownerId && server.ownerId !== user.userId) {
          try {
            const notificationService = container.resolve('notificationService')
            const displayName = fullUser?.displayName ?? fullUser?.username ?? 'unknown'
            const notification = await notificationService.create({
              userId: server.ownerId,
              type: 'system',
              title: `${displayName} joined your server "${server.name}"`,
              referenceId: server.id,
              referenceType: 'server_join',
            })
            io.to(`user:${server.ownerId}`).emit('notification:new', notification)
          } catch {
            /* non-critical */
          }
        }
      } catch {
        /* non-critical */
      }

      return c.json(server)
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status === 409) {
        // Already a member — return the server info so client can navigate
        const server = await serverService.getByInviteCode(inviteCode)
        return c.json(server, 409)
      }
      throw error
    }
  })

  // POST /api/servers/:id/leave
  serverHandler.post('/:id/leave', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const user = c.get('user')

    // Get user info before leaving for the event payload
    let leavePayload: {
      serverId: string
      userId: string
      username: string
      displayName: string
      avatarUrl: string | null
      isBot: boolean
    } | null = null
    try {
      const userDao = container.resolve('userDao')
      const fullUser = await userDao.findById(user.userId)
      leavePayload = {
        serverId: id,
        userId: user.userId,
        username: fullUser?.username ?? 'unknown',
        displayName: fullUser?.displayName ?? fullUser?.username ?? 'unknown',
        avatarUrl: fullUser?.avatarUrl ?? null,
        isBot: fullUser?.isBot ?? false,
      }
    } catch {
      /* non-critical */
    }

    await serverService.leave(id, user.userId)

    // Emit member:left to all channel rooms
    if (leavePayload) {
      try {
        const io = container.resolve('io')
        const channelDao = container.resolve('channelDao')
        const channels = await channelDao.findByServerId(id)
        for (const ch of channels) {
          io.to(`channel:${ch.id}`).emit('member:left', leavePayload)
        }
      } catch {
        /* non-critical */
      }
    }

    return c.json({ success: true })
  })

  // GET /api/servers/:id/members
  serverHandler.get('/:id/members', async (c) => {
    const serverService = container.resolve('serverService')
    const idOrSlug = c.req.param('id')
    const serverId = await resolveServerId(idOrSlug)
    const members = await serverService.getMembers(serverId)
    return c.json(members)
  })

  // PATCH /api/servers/:id/members/:userId
  serverHandler.patch('/:id/members/:userId', zValidator('json', updateMemberSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const targetUserId = c.req.param('userId')
    const input = c.req.valid('json')
    const user = c.get('user')
    const member = await serverService.updateMember(id, targetUserId, user.userId, input)
    return c.json(member)
  })

  // DELETE /api/servers/:id/members/:userId
  serverHandler.delete('/:id/members/:userId', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const targetUserId = c.req.param('userId')
    const user = c.get('user')

    // Get target user info before kicking for the event payload
    let kickPayload: {
      serverId: string
      userId: string
      username: string
      displayName: string
      avatarUrl: string | null
      isBot: boolean
    } | null = null
    try {
      const userDao = container.resolve('userDao')
      const fullUser = await userDao.findById(targetUserId)
      kickPayload = {
        serverId: id,
        userId: targetUserId,
        username: fullUser?.username ?? 'unknown',
        displayName: fullUser?.displayName ?? fullUser?.username ?? 'unknown',
        avatarUrl: fullUser?.avatarUrl ?? null,
        isBot: fullUser?.isBot ?? false,
      }
    } catch {
      /* non-critical */
    }

    await serverService.kickMember(id, targetUserId, user.userId)

    // Emit member:left to all channel rooms
    if (kickPayload) {
      try {
        const io = container.resolve('io')
        const channelDao = container.resolve('channelDao')
        const channels = await channelDao.findByServerId(id)
        for (const ch of channels) {
          io.to(`channel:${ch.id}`).emit('member:left', kickPayload)
        }
      } catch {
        /* non-critical */
      }
    }

    return c.json({ success: true })
  })

  // POST /api/servers/:id/invite/regenerate
  serverHandler.post('/:id/invite/regenerate', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const user = c.get('user')
    const server = await serverService.regenerateInvite(id, user.userId)
    return c.json({ inviteCode: server.inviteCode })
  })

  // POST /api/servers/:id/agents — add agent(s) to server as members
  serverHandler.post('/:id/agents', async (c) => {
    const serverService = container.resolve('serverService')
    const agentService = container.resolve('agentService')
    const agentPolicyService = container.resolve('agentPolicyService')
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json<{ agentIds: string[] }>()

    if (!Array.isArray(body.agentIds) || body.agentIds.length === 0) {
      return c.json({ error: 'agentIds is required' }, 400)
    }

    const results: Array<{ agentId: string; success: boolean; error?: string }> = []
    for (const agentId of body.agentIds) {
      try {
        const agent = await agentService.getById(agentId)
        if (!agent) {
          results.push({ agentId, success: false, error: 'Agent not found' })
          continue
        }
        // Verify the user owns the agent
        if (agent.ownerId !== user.userId) {
          results.push({ agentId, success: false, error: 'Not the owner' })
          continue
        }
        // Add bot user as server member
        await serverService.addBotMember(id, agent.userId)
        // Auto-create default server-wide policy
        await agentPolicyService.ensureServerDefault(agentId, id)
        results.push({ agentId, success: true })

        // Emit member:joined to the server's channels so existing members see the bot
        // The bot is not yet in any channel, but server members should know it's available
        try {
          const io = container.resolve('io')
          const userDao = container.resolve('userDao')
          const serverDao = container.resolve('serverDao')
          const botUser = await userDao.findById(agent.userId)
          const serverMembers = await serverDao.getMembers(id)
          const payload = {
            serverId: id,
            userId: agent.userId,
            username: botUser?.username ?? 'unknown',
            displayName: botUser?.displayName ?? botUser?.username ?? 'unknown',
            avatarUrl: botUser?.avatarUrl ?? null,
            isBot: true,
          }
          // Notify all non-bot server members about the new bot
          for (const m of serverMembers) {
            if (!m.user?.isBot) {
              io.to(`user:${m.userId}`).emit('member:joined', payload)
            }
          }
          // Notify the bot directly so its monitor can connect
          io.to(`user:${agent.userId}`).emit('server:joined', {
            serverId: id,
            agentId,
          })
        } catch {
          /* non-critical */
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ agentId, success: false, error: msg })
      }
    }

    return c.json({ results })
  })

  return serverHandler
}
