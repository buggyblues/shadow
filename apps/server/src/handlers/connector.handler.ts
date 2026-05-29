import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

const runtimeSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  kind: z.enum(['openclaw', 'cli']),
  status: z.enum(['available', 'missing']),
  version: z.string().max(120).nullable().optional(),
  command: z.string().max(120).nullable().optional(),
  detectedAt: z.string().datetime().nullable().optional(),
})

const bootstrapSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  serverUrl: z.string().url().max(500),
})

const heartbeatSchema = z.object({
  hostname: z.string().max(255).nullable().optional(),
  os: z.string().max(64).nullable().optional(),
  arch: z.string().max(64).nullable().optional(),
  daemonVersion: z.string().max(64).nullable().optional(),
  runtimes: z.array(runtimeSchema).max(30).default([]),
})

const createBuddySchema = z.object({
  runtimeId: z.string().min(1).max(80),
  serverUrl: z.string().url().max(500),
  name: z.string().min(1).max(64),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens, and underscores',
    ),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().nullable().optional(),
  buddyMode: z.enum(['private', 'shareable']).optional().default('private'),
  allowedServerIds: z.array(z.string().uuid()).max(100).optional().default([]),
})

const configureBuddySchema = z.object({
  runtimeId: z.string().min(1).max(80),
  serverUrl: z.string().url().max(500),
})

const completeJobSchema = z.object({
  status: z.enum(['completed', 'failed']),
  result: z.record(z.unknown()).optional(),
  error: z.string().max(1000).optional(),
})

async function authenticateDaemon(container: AppContainer, c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const apiKey = authHeader.slice(7)
  return container.resolve('connectorService').authenticateDaemon(apiKey)
}

export function createConnectorHandler(container: AppContainer) {
  const handler = new Hono()

  handler.get('/connector/computers', authMiddleware, async (c) => {
    const user = c.get('user')
    const computers = await container.resolve('connectorService').listComputers(user.userId)
    return c.json({ computers })
  })

  handler.post(
    '/connector/computers/bootstrap',
    authMiddleware,
    zValidator('json', bootstrapSchema),
    async (c) => {
      const user = c.get('user')
      const input = c.req.valid('json')
      const result = await container.resolve('connectorService').createBootstrap(user.userId, input)
      return c.json(result, 201)
    },
  )

  handler.post(
    '/connector/computers/:id/buddies',
    authMiddleware,
    zValidator('json', createBuddySchema),
    async (c) => {
      const user = c.get('user')
      const mediaService = container.resolve('mediaService')
      const input = c.req.valid('json')
      try {
        const result = await container
          .resolve('connectorService')
          .createBuddyOnComputer(user.userId, c.req.param('id'), {
            ...input,
            avatarUrl:
              input.avatarUrl !== undefined
                ? (mediaService.normalizeMediaUrl(input.avatarUrl) ?? undefined)
                : undefined,
          })
        container
          .resolve('io')
          .to(`user:${user.userId}`)
          .emit('connector:job-created', {
            computerId: c.req.param('id'),
            jobId: result.job?.id ?? null,
            agentId: result.agent.id,
          })
        return c.json(
          {
            agent: result.agent,
            job: result.job
              ? { id: result.job.id, status: result.job.status, type: result.job.type }
              : null,
          },
          201,
        )
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500
        return c.json(
          { ok: false, error: (err as Error).message || 'Internal Server Error' },
          status as 400,
        )
      }
    },
  )

  handler.post(
    '/connector/computers/:id/buddies/:agentId/configure',
    authMiddleware,
    zValidator('json', configureBuddySchema),
    async (c) => {
      const user = c.get('user')
      const input = c.req.valid('json')
      try {
        const result = await container
          .resolve('connectorService')
          .configureBuddyOnComputer(user.userId, c.req.param('id'), c.req.param('agentId'), input)
        container
          .resolve('io')
          .to(`user:${user.userId}`)
          .emit('connector:job-created', {
            computerId: c.req.param('id'),
            jobId: result.job?.id ?? null,
            agentId: result.agent.id,
          })
        return c.json(
          {
            agent: result.agent,
            job: result.job
              ? { id: result.job.id, status: result.job.status, type: result.job.type }
              : null,
          },
          201,
        )
      } catch (err) {
        const status = (err as { status?: number }).status ?? 500
        return c.json(
          { ok: false, error: (err as Error).message || 'Internal Server Error' },
          status as 400,
        )
      }
    },
  )

  handler.get('/connector/jobs/:id', authMiddleware, async (c) => {
    const user = c.get('user')
    const jobId = c.req.param('id')
    if (!jobId) return c.json({ ok: false, error: 'Job not found' }, 404)
    const job = await container.resolve('connectorService').getJobForUser(user.userId, jobId)
    if (!job) return c.json({ ok: false, error: 'Job not found' }, 404)
    return c.json({ job })
  })

  handler.post('/connector/daemon/heartbeat', zValidator('json', heartbeatSchema), async (c) => {
    const computer = await authenticateDaemon(container, c)
    if (!computer) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const updated = await container
      .resolve('connectorService')
      .recordHeartbeat(computer.id, c.req.valid('json'))
    if (updated) {
      container.resolve('io').to(`user:${computer.userId}`).emit('connector:computer-updated', {
        computer: updated,
      })
    }
    return c.json({ ok: true, computer: updated })
  })

  handler.get('/connector/daemon/jobs', async (c) => {
    const computer = await authenticateDaemon(container, c)
    if (!computer) return c.json({ ok: false, error: 'Unauthorized' }, 401)
    const jobs = await container.resolve('connectorService').claimDaemonJobs(computer.id)
    return c.json({ jobs })
  })

  handler.post(
    '/connector/daemon/jobs/:id/complete',
    zValidator('json', completeJobSchema),
    async (c) => {
      const computer = await authenticateDaemon(container, c)
      if (!computer) return c.json({ ok: false, error: 'Unauthorized' }, 401)
      const result = await container
        .resolve('connectorService')
        .completeDaemonJob(computer.id, c.req.param('id'), c.req.valid('json'))
      if (!result) return c.json({ ok: false, error: 'Job not found' }, 404)
      container.resolve('io').to(`user:${computer.userId}`).emit('connector:job-updated', {
        computerId: computer.id,
        jobId: result.id,
        agentId: result.agentId,
        status: result.status,
      })
      return c.json({ ok: true })
    },
  )

  return handler
}
