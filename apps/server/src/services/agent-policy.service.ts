import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentPolicyDao } from '../dao/agent-policy.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ServerDao } from '../dao/server.dao'

export class AgentPolicyService {
  constructor(
    private deps: {
      agentPolicyDao: AgentPolicyDao
      agentDao: AgentDao
      serverDao: ServerDao
      channelDao: ChannelDao
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

    return this.deps.agentPolicyDao.batchUpsert(policies.map((p) => ({ agentId, ...p })))
  }

  /** Delete a specific policy */
  async deletePolicy(policyId: string) {
    await this.deps.agentPolicyDao.delete(policyId)
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
          channels: channels.map((ch) => {
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
