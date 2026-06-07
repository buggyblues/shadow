import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { triggerCloudDeploymentAutoResumeForBuddyUsers } from '../lib/cloud-deployment-autoresume'
import { logger } from '../lib/logger'
import { getRedisClient, presenceKeys } from '../lib/redis'
import { authMiddleware } from '../middleware/auth.middleware'
import { createAgentSchema, updateAgentSchema } from '../validators/agent.schema'

const usageProviderSchema = z.object({
  provider: z.string().min(1).max(120),
  amountUsd: z.number().finite().nullable().optional(),
  usageLabel: z.string().max(200).nullable().optional(),
  raw: z.string().max(1000).nullable().optional(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  totalTokens: z.number().int().nonnegative().nullable().optional(),
})

const usageSnapshotSchema = z.object({
  source: z.string().min(1).max(64).optional(),
  model: z.string().max(255).nullable().optional(),
  totalUsd: z.number().finite().nullable().optional(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  cacheReadTokens: z.number().int().nonnegative().nullable().optional(),
  cacheWriteTokens: z.number().int().nonnegative().nullable().optional(),
  totalTokens: z.number().int().nonnegative().nullable().optional(),
  providers: z.array(usageProviderSchema).max(20).optional(),
  raw: z.record(z.unknown()).optional(),
  generatedAt: z.string().datetime().optional(),
})

/** Helper: verify the requesting user owns the agent. Returns 403 response or null. */
async function requireAgentOwner(
  container: AppContainer,
  c: any,
  agentId: string,
  userId: string,
): Promise<Response | null> {
  const agentService = container.resolve('agentService')
  const agent = await agentService.getById(agentId)
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404)
  }
  if (agent.ownerId !== userId) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return null
}

function toTenantAgentView<T extends { config?: unknown }>(agent: T): T {
  const config =
    agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
      ? (agent.config as Record<string, unknown>)
      : {}
  return {
    ...agent,
    config: {
      description: config.description,
      buddyTag: config.buddyTag,
      buddyMode: config.buddyMode,
      allowedServerIds: config.allowedServerIds,
    },
  }
}

async function resolveCurrentActivity(userId: string): Promise<string | null> {
  try {
    const redis = await getRedisClient()
    if (!redis) return null
    const raw = await redis.get(presenceKeys.userActivity(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { activity?: unknown }
    return typeof parsed.activity === 'string' ? parsed.activity : null
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to resolve agent current activity')
    return null
  }
}

export function createAgentHandler(container: AppContainer) {
  const agentHandler = new Hono()

  agentHandler.use('*', authMiddleware)

  // GET /api/agents — list current user's agents (with rental status)
  agentHandler.get('/', async (c) => {
    const agentService = container.resolve('agentService')
    const agentListingDao = container.resolve('agentListingDao')
    const mediaService = container.resolve('mediaService')
    const rentalContractDao = container.resolve('rentalContractDao')
    const rentalService = container.resolve('rentalService')
    const user = c.get('user')
    const includeRentals = c.req.query('includeRentals') === 'true'
    const agents = await agentService.getByOwnerId(user.userId)
    const accessRoles = new Map<string, 'owner' | 'tenant'>()
    const activeContractIds = new Map<string, string>()
    // Enrich with bot user info
    const enriched = await Promise.all(
      agents.map(async (agent) => {
        accessRoles.set(agent.id, 'owner')
        const full = await agentService.getById(agent.id)
        return full
      }),
    )
    const tenantRows = includeRentals ? await rentalService.getActiveTenantAgents(user.userId) : []
    const enrichedTenantAgents = await Promise.all(
      tenantRows
        .filter(({ agent }) => agent.ownerId !== user.userId)
        .map(async ({ agent, contract }) => {
          accessRoles.set(agent.id, 'tenant')
          activeContractIds.set(agent.id, contract.id)
          return agentService.getById(agent.id)
        }),
    )
    const result = [...enriched, ...enrichedTenantAgents].filter(Boolean)

    // Enrich with rental status: check all listings (any status) for each agent
    const agentIds = result.map((a) => a!.id)
    const allListings = await agentListingDao.findByAgentIds(agentIds)
    const rentedAgentIds = new Set<string>()
    const listedAgentIds = new Set<string>()
    // Map agentId → listing status for detailed display
    const agentListingStatus = new Map<
      string,
      { listingId: string; listingStatus: string; isListed: boolean }
    >()
    for (const listing of allListings) {
      if (!listing.agentId) continue
      // Track any listing (regardless of status) → agentListingStatus
      const existing = agentListingStatus.get(listing.agentId)
      // Prefer active > paused > draft > others
      const priority: Record<string, number> = { active: 4, paused: 3, draft: 2 }
      const existingPriority = existing ? (priority[existing.listingStatus] ?? 1) : 0
      const currentPriority = priority[listing.listingStatus] ?? 1
      if (currentPriority > existingPriority) {
        agentListingStatus.set(listing.agentId, {
          listingId: listing.id,
          listingStatus: listing.listingStatus,
          isListed: listing.isListed,
        })
      }
      // isListed = has an active+listed listing
      if (listing.listingStatus === 'active' && listing.isListed) {
        listedAgentIds.add(listing.agentId)
      }
      // isRented = has an active contract on any listing
      if (listing.listingStatus === 'active') {
        const activeContract = await rentalContractDao.findActiveByListingId(listing.id)
        if (activeContract) {
          rentedAgentIds.add(listing.agentId)
        }
      }
    }

    return c.json(
      await Promise.all(
        result.map(async (agent) => {
          const signedAgent = {
            ...agent!,
            botUser: agent!.botUser
              ? {
                  ...agent!.botUser,
                  avatarUrl: mediaService.resolveMediaUrl(agent!.botUser.avatarUrl, 'image/png', {
                    variant: 'avatar',
                  }),
                }
              : agent!.botUser,
            owner: agent!.owner
              ? {
                  ...agent!.owner,
                  avatarUrl: mediaService.resolveMediaUrl(agent!.owner.avatarUrl, 'image/png', {
                    variant: 'avatar',
                  }),
                }
              : agent!.owner,
          }
          const accessRole = accessRoles.get(agent!.id) ?? 'owner'
          const base = {
            ...signedAgent,
            currentActivity: await resolveCurrentActivity(agent!.userId),
            accessRole,
            activeContractId: activeContractIds.get(agent!.id) ?? null,
            isListed: listedAgentIds.has(agent!.id),
            isRented: rentedAgentIds.has(agent!.id),
            listingInfo: agentListingStatus.get(agent!.id) ?? null,
          }
          return accessRole === 'tenant' ? toTenantAgentView(base) : base
        }),
      ),
    )
  })

  // POST /api/agents — create a new agent
  agentHandler.post('/', zValidator('json', createAgentSchema), async (c) => {
    try {
      const agentService = container.resolve('agentService')
      const mediaService = container.resolve('mediaService')
      const user = c.get('user')
      const input = c.req.valid('json')
      const agent = await agentService.create({
        name: input.name,
        username: input.username,
        description: input.description,
        avatarUrl: input.avatarUrl
          ? (mediaService.normalizeMediaUrl(input.avatarUrl) ?? undefined)
          : input.avatarUrl,
        kernelType: input.kernelType,
        config: input.config,
        buddyMode: input.buddyMode,
        allowedServerIds: input.allowedServerIds,
        ownerId: user.userId,
      })
      return c.json(agent, 201)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json(
        { ok: false, error: (err as Error).message || 'Internal Server Error' },
        status as 409,
      )
    }
  })

  // GET /api/agents/:id — get agent details (owner only)
  agentHandler.get('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const ownershipError = await requireAgentOwner(container, c, id, user.userId)
    if (ownershipError) return ownershipError
    const agentService = container.resolve('agentService')
    const agent = await agentService.getById(id)
    if (!agent) {
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }
    return c.json(agent)
  })

  // PATCH /api/agents/:id — update existing agent (owner only, zod validated)
  agentHandler.patch('/:id', zValidator('json', updateAgentSchema), async (c) => {
    const agentService = container.resolve('agentService')
    const mediaService = container.resolve('mediaService')
    const user = c.get('user')
    const id = c.req.param('id')
    const input = c.req.valid('json')

    // Verify ownership before updating
    const ownershipError = await requireAgentOwner(container, c, id, user.userId)
    if (ownershipError) return ownershipError

    const agent = await agentService.update(id, user.userId, {
      ...input,
      buddyMode: input.buddyMode,
      allowedServerIds: input.allowedServerIds,
      ...(input.avatarUrl !== undefined
        ? { avatarUrl: mediaService.normalizeMediaUrl(input.avatarUrl) ?? undefined }
        : {}),
    })
    if (!agent) {
      return c.json({ ok: false, error: 'Agent not found' }, 404)
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
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }
    if (agent.ownerId !== user.userId) {
      return c.json({ ok: false, error: 'Forbidden' }, 403)
    }

    await agentService.delete(id)
    return c.json({ ok: true })
  })

  // POST /api/agents/:id/start — start agent (owner only)
  agentHandler.post('/:id/start', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const ownershipError = await requireAgentOwner(container, c, id, user.userId)
    if (ownershipError) return ownershipError
    const agentService = container.resolve('agentService')
    const agent = await agentService.start(id)
    return c.json(agent)
  })

  // POST /api/agents/:id/stop — stop agent (owner only)
  agentHandler.post('/:id/stop', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const ownershipError = await requireAgentOwner(container, c, id, user.userId)
    if (ownershipError) return ownershipError
    const agentService = container.resolve('agentService')
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
      try {
        const io = container.resolve('io')
        const channelMemberDao = container.resolve('channelMemberDao')
        const channelIds = await channelMemberDao.getAllChannelIds(user.userId)
        const heartbeatDate = agent?.lastHeartbeat ? new Date(agent.lastHeartbeat) : null
        const lastHeartbeat =
          heartbeatDate && Number.isFinite(heartbeatDate.getTime())
            ? heartbeatDate.toISOString()
            : null
        for (const channelId of channelIds) {
          io.to(`channel:${channelId}`).emit('presence:change', {
            userId: user.userId,
            status: 'online',
            agentId: agent?.id ?? id,
            agentStatus: agent?.status ?? 'running',
            lastHeartbeat,
          })
        }
      } catch (err) {
        logger.warn(
          { err, agentId: id, userId: user.userId },
          'Failed to broadcast agent heartbeat',
        )
      }
      triggerCloudDeploymentAutoResumeForBuddyUsers({
        container,
        buddyUserIds: [user.userId],
        reason: 'agent heartbeat',
        logContext: { agentId: id },
      })
      return c.json({ ok: true, status: agent?.status, lastHeartbeat: agent?.lastHeartbeat })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 404 | 403)
    }
  })

  // POST /api/agents/:id/usage-snapshot — lightweight runtime cost telemetry from the Buddy
  agentHandler.post('/:id/usage-snapshot', zValidator('json', usageSnapshotSchema), async (c) => {
    const cloudUsageService = container.resolve('cloudUsageService')
    const user = c.get('user')
    const id = c.req.param('id')
    try {
      const snapshot = await cloudUsageService.recordAgentSnapshot(
        id,
        user.userId,
        c.req.valid('json'),
      )
      triggerCloudDeploymentAutoResumeForBuddyUsers({
        container,
        buddyUserIds: [user.userId],
        reason: 'agent usage snapshot',
        logContext: { agentId: id },
      })
      return c.json({ ok: true, snapshot })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 404 | 403 | 500)
    }
  })

  // GET /api/agents/:id/config — full remote config for the plugin (owner or agent itself)
  agentHandler.get('/:id/config', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const id = c.req.param('id')
    const agent = await agentService.getById(id)
    if (!agent) return c.json({ error: 'Agent not found' }, 404)
    // Allow both the owner and the agent's own bot user
    if (agent.ownerId !== user.userId && agent.userId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    const agentPolicyService = container.resolve('agentPolicyService')
    try {
      const config = await agentPolicyService.getRemoteConfig(id)
      return c.json(config)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 404)
    }
  })

  // GET /api/agents/:id/slash-commands — runtime/owner command registry
  agentHandler.get('/:id/slash-commands', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const id = c.req.param('id')
    try {
      const commands = await agentService.getSlashCommands(id, user.userId)
      return c.json({ commands })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 404 | 403)
    }
  })

  // PUT /api/agents/:id/slash-commands — called by running Buddy after pack discovery
  agentHandler.put('/:id/slash-commands', async (c) => {
    const agentService = container.resolve('agentService')
    const user = c.get('user')
    const id = c.req.param('id')
    try {
      const body = await c.req.json<{ commands?: unknown }>()
      const commands = await agentService.updateSlashCommands(id, user.userId, body.commands)
      try {
        const agent = await agentService.getById(id)
        if (agent) {
          const channelMemberDao = container.resolve('channelMemberDao')
          const io = container.resolve('io')
          const channelIds = await channelMemberDao.getAllChannelIds(agent.userId)
          for (const channelId of channelIds) {
            io.to(`channel:${channelId}`).emit('channel:slash-commands-updated', {
              channelId,
              agentId: id,
              buddyUserId: agent.userId,
              commandCount: commands.length,
            })
          }
        }
      } catch {
        /* non-critical realtime refresh failure */
      }
      return c.json({ ok: true, commands })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 400 | 403 | 404)
    }
  })

  // GET /api/agents/:id/policies — list all policies for an agent (owner only)
  agentHandler.get('/:id/policies', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const ownershipError = await requireAgentOwner(container, c, id, user.userId)
    if (ownershipError) return ownershipError
    const agentPolicyService = container.resolve('agentPolicyService')
    try {
      const policies = await agentPolicyService.getPolicies(id)
      return c.json(policies)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 404)
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
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }
    if (agent.ownerId !== user.userId) {
      return c.json({ ok: false, error: 'Forbidden' }, 403)
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
      return c.json({ ok: false, error: 'policies array is required' }, 400)
    }

    try {
      const results = await agentPolicyService.upsertPolicies(id, body.policies)
      return c.json(results)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 404)
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
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }
    if (agent.ownerId !== user.userId) {
      return c.json({ ok: false, error: 'Forbidden' }, 403)
    }

    await agentPolicyService.deletePolicy(id, policyId)
    return c.json({ ok: true })
  })

  return agentHandler
}
