import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentPolicyDao } from '../dao/agent-policy.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ServerDao } from '../dao/server.dao'
import { validateJsonLimits } from '../lib/json-limits'
import { normalizeSlashCommands } from './agent.service'

const AGENT_POLICY_CONFIG_KEYS = new Set([
  'replyToUsers',
  'keywords',
  'mentionOnly',
  'replyToBuddy',
  'maxBuddyChainDepth',
  'buddyBlacklist',
  'buddyWhitelist',
  'smartReply',
])

function stringArray(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 50) {
    throw Object.assign(new Error(`Invalid policy config ${key}`), { status: 400 })
  }
  return value.map((item) => {
    if (typeof item !== 'string' || item.length > 120) {
      throw Object.assign(new Error(`Invalid policy config ${key}`), { status: 400 })
    }
    return item
  })
}

function validatePolicyConfig(config: Record<string, unknown> | undefined) {
  if (!config) return {}
  const limits = validateJsonLimits(config, {
    maxBytes: 8 * 1024,
    maxDepth: 4,
    maxObjectKeys: 32,
    maxArrayItems: 64,
  })
  if (!limits.ok) {
    throw Object.assign(new Error(limits.error), { status: 400 })
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (!AGENT_POLICY_CONFIG_KEYS.has(key)) {
      throw Object.assign(new Error(`Unsupported policy config key: ${key}`), { status: 400 })
    }
    if (
      key === 'replyToUsers' ||
      key === 'keywords' ||
      key === 'buddyBlacklist' ||
      key === 'buddyWhitelist'
    ) {
      sanitized[key] = stringArray(value, key)
      continue
    }
    if (key === 'mentionOnly' || key === 'replyToBuddy' || key === 'smartReply') {
      if (typeof value !== 'boolean') {
        throw Object.assign(new Error(`Invalid policy config ${key}`), { status: 400 })
      }
      sanitized[key] = value
      continue
    }
    if (key === 'maxBuddyChainDepth') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 8) {
        throw Object.assign(new Error('Invalid policy config maxBuddyChainDepth'), { status: 400 })
      }
      sanitized[key] = value
    }
  }
  return sanitized
}

export class AgentPolicyService {
  constructor(
    private deps: {
      agentPolicyDao: AgentPolicyDao
      agentDao: AgentDao
      serverDao: ServerDao
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      logger: Logger
    },
  ) {}

  /** Get all policies for an agent */
  async getPolicies(agentId: string) {
    return this.deps.agentPolicyDao.findByAgentId(agentId)
  }

  /** Upsert policies (batch) */
  async upsertPolicies(
    agentId: string,
    policies: Array<{
      serverId: string
      channelId?: string | null
      listen?: boolean
      reply?: boolean
      mentionOnly?: boolean
      config?: Record<string, unknown>
    }>,
  ) {
    // Verify agent exists
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    for (const policy of policies) {
      const serverMember = await this.deps.serverDao.getMember(policy.serverId, agent.userId)
      if (!serverMember) {
        throw Object.assign(new Error('Agent must join the target server before policy upsert'), {
          status: 403,
        })
      }
      if (policy.channelId) {
        const channel = await this.deps.channelDao.findById(policy.channelId)
        if (!channel || channel.serverId !== policy.serverId) {
          throw Object.assign(new Error('Policy channel does not belong to target server'), {
            status: 400,
          })
        }
        const channelMember = await this.deps.channelMemberDao.get(policy.channelId, agent.userId)
        if (!channelMember) {
          throw Object.assign(
            new Error('Agent must join the target channel before policy upsert'),
            {
              status: 403,
            },
          )
        }
      }
    }

    return this.deps.agentPolicyDao.batchUpsert(
      policies.map((p) => ({ agentId, ...p, config: validatePolicyConfig(p.config) })),
    )
  }

  /** Delete a specific policy */
  async deletePolicy(agentId: string, policyId: string) {
    const policy = await this.deps.agentPolicyDao.findById(policyId)
    if (!policy || policy.agentId !== agentId) {
      throw Object.assign(new Error('Policy not found'), { status: 404 })
    }
    await this.deps.agentPolicyDao.deleteByAgentIdAndId(agentId, policyId)
  }

  /**
   * Get the full remote config for an agent (what the plugin fetches on startup).
   *
   * Returns the list of servers the bot user has joined, with channels and
   * per-channel policies. If no channel-specific policy exists, the server-wide
   * default is used. If no server-wide default exists, sensible defaults are
   * returned (listen: true, reply: true, mentionOnly: false).
   */
  async getRemoteConfig(agentId: string) {
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    // Find all servers the bot user has joined
    const memberships = await this.deps.serverDao.findByUserId(agent.userId)

    // Get all policies for the agent
    const allPolicies = await this.deps.agentPolicyDao.findByAgentId(agentId)

    // Build the response
    const servers = await Promise.all(
      memberships.map(async ({ server }) => {
        const channels = await this.deps.channelDao.findByServerId(server.id)
        const channelIds = channels.map((ch) => ch.id)
        let visibleChannelIds: Set<string> | null = null
        try {
          visibleChannelIds = new Set(
            await this.deps.channelMemberDao.getUserChannelIds(agent.userId, channelIds),
          )
        } catch (err) {
          this.deps.logger.warn(
            { err, agentId, serverId: server.id },
            'Failed to filter remote agent config by channel membership; falling back to all channels',
          )
        }
        const joinableChannels = visibleChannelIds
          ? channels.filter((ch) => visibleChannelIds.has(ch.id))
          : channels
        const serverPolicies = allPolicies.filter((p) => p.serverId === server.id)

        // Find server-wide default policy (channelId is null)
        const serverDefault = serverPolicies.find((p) => p.channelId === null)
        const defaultPolicy = {
          listen: serverDefault?.listen ?? true,
          reply: serverDefault?.reply ?? true,
          mentionOnly: serverDefault?.mentionOnly ?? false,
          config: serverDefault?.config ?? {},
        }

        return {
          id: server.id,
          name: server.name,
          slug: server.slug,
          iconUrl: server.iconUrl,
          defaultPolicy,
          channels: joinableChannels.map((ch) => {
            const channelPolicy = serverPolicies.find((p) => p.channelId === ch.id)
            return {
              id: ch.id,
              name: ch.name,
              type: ch.type,
              policy: channelPolicy
                ? {
                    listen: channelPolicy.listen,
                    reply: channelPolicy.reply,
                    mentionOnly: channelPolicy.mentionOnly,
                    config: channelPolicy.config,
                  }
                : defaultPolicy,
            }
          }),
        }
      }),
    )

    return {
      agentId,
      botUserId: agent.userId,
      slashCommands: normalizeSlashCommands(
        (agent.config as Record<string, unknown>)?.slashCommands,
      ),
      servers,
    }
  }

  /**
   * Auto-create default server-wide policy when a bot is added to a server.
   */
  async ensureServerDefault(agentId: string, serverId: string) {
    const existing = await this.deps.agentPolicyDao.findServerDefault(agentId, serverId)
    if (existing) return existing
    return this.deps.agentPolicyDao.upsert({
      agentId,
      serverId,
      channelId: null,
      listen: true,
      reply: true,
      mentionOnly: false,
      config: {},
    })
  }
}
