import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createServerSchema,
  joinServerSchema,
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
  serverHandler.get('/:id', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const server = await serverService.getById(id)
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
    const server = await serverService.join(inviteCode, user.userId)
    return c.json(server)
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

  return serverHandler
}
