import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { UserDao } from '../dao/user.dao'
import { signAgentToken } from '../lib/jwt'

export class AgentService {
  constructor(private deps: { agentDao: AgentDao; userDao: UserDao; logger: Logger }) {}

  async create(data: {
    name: string
    description?: string
    avatarUrl?: string
    kernelType: string
    config: Record<string, unknown>
    ownerId: string
  }) {
    // Create a bot user for the agent
    const username = `agent-${data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
    const botUser = await this.deps.agentDao.createBotUser({
      username,
      displayName: data.name,
    })

    if (!botUser) {
      throw Object.assign(new Error('Failed to create bot user'), { status: 500 })
    }

    // Update avatar if provided
    if (data.avatarUrl) {
      await this.deps.userDao.update(botUser.id, { avatarUrl: data.avatarUrl })
    }

    // Create the agent record (default to running)
    const agent = await this.deps.agentDao.create({
      userId: botUser.id,
      kernelType: data.kernelType,
      config: {
        ...data.config,
        ...(data.description ? { description: data.description } : {}),
      },
      ownerId: data.ownerId,
    })

    // Set initial status to running
    await this.deps.agentDao.updateStatus(agent!.id, 'running')

    return { ...agent, status: 'running' as const, botUser: { ...botUser, avatarUrl: data.avatarUrl ?? botUser.avatarUrl } }
  }

  async getById(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) return null
    const botUser = await this.deps.userDao.findById(agent.userId)
    const owner = await this.deps.userDao.findById(agent.ownerId)
    return { ...agent, botUser, owner }
  }

  async update(
    id: string,
    ownerId: string,
    data: { name?: string; description?: string; avatarUrl?: string | null }
  ) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this agent'), { status: 403 })
    }

    const updates: any = {}
    if (data.name !== undefined) updates.displayName = data.name
    if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl

    if (Object.keys(updates).length > 0) {
      await this.deps.userDao.update(agent.userId, updates)
    }

    if (data.description !== undefined) {
      const config = (agent.config as Record<string, unknown>) ?? {}
      config.description = data.description
      await this.deps.agentDao.updateConfig(id, config)
    }

    return this.getById(id)
  }

  async getAll() {
    return this.deps.agentDao.findAll()
  }

  async getByOwnerId(ownerId: string) {
    return this.deps.agentDao.findByOwnerId(ownerId)
  }

  /** Generate a long-lived JWT token for the agent's bot user */
  async generateToken(agentId: string, ownerId: string) {
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this agent'), { status: 403 })
    }

    const botUser = await this.deps.userDao.findById(agent.userId)
    if (!botUser) {
      throw Object.assign(new Error('Bot user not found'), { status: 404 })
    }

    const token = signAgentToken({
      userId: botUser.id,
      email: botUser.email,
      username: botUser.username,
    })

    // Persist the token in agent config so it can be viewed again later
    await this.deps.agentDao.updateConfig(agentId, {
      ...((agent.config as Record<string, unknown>) ?? {}),
      lastToken: token,
    })

    return { token, agent, botUser }
  }

  async start(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    // TODO: Start Docker container via AgentRuntime
    await this.deps.agentDao.updateStatus(id, 'running')
    this.deps.logger.info({ agentId: id }, 'Agent started')

    return this.deps.agentDao.findById(id)
  }

  async stop(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    // TODO: Stop Docker container via AgentRuntime
    await this.deps.agentDao.updateStatus(id, 'stopped')
    this.deps.logger.info({ agentId: id }, 'Agent stopped')

    return this.deps.agentDao.findById(id)
  }

  async restart(id: string) {
    await this.stop(id)
    return this.start(id)
  }

  /** Record a heartbeat from the agent — marks it as running */
  async heartbeat(agentId: string, botUserId: string) {
    // Verify the agent exists and the bot user matches
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.userId !== botUserId) {
      throw Object.assign(new Error('User does not match agent'), { status: 403 })
    }

    return this.deps.agentDao.updateHeartbeat(agentId)
  }

  async delete(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    if (agent.status === 'running') {
      await this.stop(id)
    }

    // Delete the agent record first (cascade deletes agent_policies)
    await this.deps.agentDao.delete(id)

    // Delete the bot user — cascade removes members entries from all servers
    await this.deps.userDao.delete(agent.userId)
  }
}
