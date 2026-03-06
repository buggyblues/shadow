import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createAgentSchema } from '../validators/agent.schema'

export function createAgentHandler(container: AppContainer) {
  const agentHandler = new Hono()

  agentHandler.use('*', authMiddleware)

  // GET /api/agents — list current user's agents
  agentHandler.get('/', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const agents = await agentService.getByOwnerId(user.userId)
    // Enrich with bot user info
    const enriched = await Promise.all(
      agents.map(async (agent) => {
        const full = await agentService.getById(agent.id)
        return full
      }),
    )
    return c.json(enriched.filter(Boolean))
  })

  // POST /api/agents — create a new agent
  agentHandler.post('/', zValidator('json', createAgentSchema), async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const input = c.req.valid('json')
    const agent = await agentService.create({
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl,
      kernelType: input.kernelType,
      config: input.config,
      ownerId: user.userId,
    })
    return c.json(agent, 201)
  })

  // GET /api/agents/:id — get agent details
  agentHandler.get('/:id', async (c) => {
    const agentService = container.resolve('agentService')
    const id = c.req.param('id')
    const agent = await agentService.getById(id)
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404)
    }
    return c.json(agent)
  })

  // POST /api/agents/:id/token — generate agent token
  agentHandler.post('/:id/token', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const id = c.req.param('id')
    const result = await agentService.generateToken(id, user.userId)
    return c.json({
      token: result.token,
      agent: {
        id: result.agent.id,
        userId: result.agent.userId,
        status: result.agent.status,
      },
      botUser: {
        id: result.botUser.id,
        username: result.botUser.username,
        displayName: result.botUser.displayName,
        avatarUrl: result.botUser.avatarUrl,
      },
    })
  })

  // DELETE /api/agents/:id — delete agent
  agentHandler.delete('/:id', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const id = c.req.param('id')

    // Verify ownership
    const agent = await agentService.getById(id)
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404)
    }
    if (agent.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    await agentService.delete(id)
    return c.json({ success: true })
  })

  // POST /api/agents/:id/start — start agent
  agentHandler.post('/:id/start', async (c) => {
    const agentService = container.resolve('agentService')
    const id = c.req.param('id')
    const agent = await agentService.start(id)
    return c.json(agent)
  })

  // POST /api/agents/:id/stop — stop agent
  agentHandler.post('/:id/stop', async (c) => {
    const agentService = container.resolve('agentService')
    const id = c.req.param('id')
    const agent = await agentService.stop(id)
    return c.json(agent)
  })

  // POST /api/agents/:id/heartbeat — record heartbeat from agent
  agentHandler.post('/:id/heartbeat', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const id = c.req.param('id')
    try {
      const agent = await agentService.heartbeat(id, user.userId)
      return c.json({ ok: true, status: agent?.status, lastHeartbeat: agent?.lastHeartbeat })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 404 | 403)
    }
  })

  // GET /api/agents/:id/config — full remote config for the plugin
  agentHandler.get('/:id/config', async (c) => {
    const agentPolicyService = container.resolve('agentPolicyService')
    const id = c.req.param('id')
    try {
      const config = await agentPolicyService.getRemoteConfig(id)
      return c.json(config)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 404)
    }
  })

  // GET /api/agents/:id/policies — list all policies for an agent
  agentHandler.get('/:id/policies', async (c) => {
    const agentPolicyService = container.resolve('agentPolicyService')
    const id = c.req.param('id')
    try {
      const policies = await agentPolicyService.getPolicies(id)
      return c.json(policies)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 404)
    }
  })

  // PUT /api/agents/:id/policies — upsert policies (batch)
  agentHandler.put('/:id/policies', async (c) => {
    const agentPolicyService = container.resolve('agentPolicyService')
    const user = c.get('user')
    const id = c.req.param('id')

    // Verify ownership
    const agentService = container.resolve('agentService')
    const agent = await agentService.getById(id)
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404)
    }
    if (agent.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const body = await c.req.json<{
      policies: Array<{
        serverId: string
        channelId?: string | null
        listen?: boolean
        reply?: boolean
        mentionOnly?: boolean
        config?: Record<string, unknown>
      }>
    }>()

    if (!Array.isArray(body.policies) || body.policies.length === 0) {
      return c.json({ error: 'policies array is required' }, 400)
    }

    try {
      const results = await agentPolicyService.upsertPolicies(id, body.policies)
      return c.json(results)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ error: (err as Error).message }, status as 404)
    }
  })

  // DELETE /api/agents/:id/policies/:policyId — delete a specific policy
  agentHandler.delete('/:id/policies/:policyId', async (c) => {
    const agentPolicyService = container.resolve('agentPolicyService')
    const user = c.get('user')
    const id = c.req.param('id')
    const policyId = c.req.param('policyId')

    // Verify ownership
    const agentService = container.resolve('agentService')
    const agent = await agentService.getById(id)
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404)
    }
    if (agent.ownerId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    await agentPolicyService.deletePolicy(policyId)
    return c.json({ success: true })
  })

  return agentHandler
}
