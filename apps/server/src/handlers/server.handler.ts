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

  // PATCH /api/servers/:id
  serverHandler.patch('/:id', zValidator('json', updateServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const server = await serverService.update(id, input, c.get('user').userId)
    return c.json(server)
  })

  // DELETE /api/servers/:id
  serverHandler.delete('/:id', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const user = c.get('user')
    await serverService.delete(id, user.userId)
    return c.json({ success: true })
  })

  // POST /api/servers/:id/join
  serverHandler.post('/:id/join', zValidator('json', joinServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const { inviteCode } = c.req.valid('json')
    const user = c.get('user')
    try {
      const server = await serverService.join(inviteCode, user.userId)
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
    await serverService.leave(id, user.userId)
    return c.json({ success: true })
  })

  // GET /api/servers/:id/members
  serverHandler.get('/:id/members', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const members = await serverService.getMembers(id)
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
    await serverService.kickMember(id, targetUserId, user.userId)
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

  return serverHandler
}
