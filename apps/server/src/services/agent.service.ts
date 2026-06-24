import { createHash } from 'node:crypto'
import {
  getBuddyPresenceExpiresAt,
  normalizeBuddyRuntimePresenceStatus,
  type PresenceChangePayload,
  type UserStatus,
} from '@shadowob/shared'
import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { UserDao } from '../dao/user.dao'
import { signAgentToken } from '../lib/jwt'
import { applyBuddyAccessConfig, type BuddyMode } from './buddy-policy'

const AGENT_HEARTBEAT_ONLINE_MS = 90_000
const SLASH_COMMAND_NAME_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/

type AgentRecord = Awaited<ReturnType<AgentDao['findById']>>
export type AgentSlashCommand = {
  name: string
  description?: string
  aliases?: string[]
  packId?: string
  sourcePath?: string
  interaction?: Record<string, unknown>
}

export function effectiveAgentStatus(agent: AgentRecord): 'running' | 'stopped' | 'error' {
  if (!agent) return 'stopped'
  if (agent.status !== 'running') return agent.status
  if (!agent.lastHeartbeat) return 'stopped'
  return Date.now() - new Date(agent.lastHeartbeat).getTime() <= AGENT_HEARTBEAT_ONLINE_MS
    ? 'running'
    : 'stopped'
}

function normalizeSlashCommandName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/^\/+/, '')
  return SLASH_COMMAND_NAME_RE.test(name) ? name : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, max = 2000): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

function normalizeInteractionItems(value: unknown, max: number) {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter(isRecord)
    .map((item, index) => {
      const label =
        readString(item.label, 120) ?? readString(item.value, 120) ?? `Option ${index + 1}`
      const id = readString(item.id, 80) ?? readString(item.value, 80) ?? label
      const out: Record<string, unknown> = { id, label }
      const rawValue = readString(item.value, 2048)
      if (rawValue) out.value = rawValue
      const style = readString(item.style, 40)
      if (style && ['primary', 'secondary', 'destructive'].includes(style)) out.style = style
      return out
    })
    .filter((item) => item.id && item.label)
  return items.length > 0 ? items.slice(0, max) : undefined
}

function normalizeInteractionFields(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const fields = value
    .filter(isRecord)
    .map((field, index) => {
      const id = readString(field.id, 80) ?? readString(field.name, 80) ?? `field_${index + 1}`
      const label = readString(field.label, 120) ?? readString(field.name, 120) ?? id
      const kind = readString(field.kind, 20) ?? readString(field.type, 20) ?? 'text'
      if (!['text', 'textarea', 'number', 'checkbox', 'select'].includes(kind)) return null
      const out: Record<string, unknown> = { id, kind, label }
      const placeholder = readString(field.placeholder, 200)
      const defaultValue = readString(field.defaultValue, 2048)
      if (placeholder) out.placeholder = placeholder
      if (defaultValue) out.defaultValue = defaultValue
      if (typeof field.required === 'boolean') out.required = field.required
      if (typeof field.maxLength === 'number') out.maxLength = field.maxLength
      if (typeof field.min === 'number') out.min = field.min
      if (typeof field.max === 'number') out.max = field.max
      const options = normalizeInteractionItems(field.options, 20)
      if (options) out.options = options
      return out
    })
    .filter((field): field is Record<string, unknown> => Boolean(field))
  return fields.length > 0 ? fields.slice(0, 12) : undefined
}

function normalizeSlashCommandInteraction(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const kind = readString(value.kind, 20)
  if (!kind || !['buttons', 'select', 'form', 'approval'].includes(kind)) return undefined

  const out: Record<string, unknown> = { kind }
  const id = readString(value.id, 120)
  const prompt = readString(value.prompt)
  const submitLabel = readString(value.submitLabel, 40)
  const responsePrompt = readString(value.responsePrompt)
  const approvalCommentLabel = readString(value.approvalCommentLabel, 120)
  const buttons = normalizeInteractionItems(value.buttons, 8)
  const options = normalizeInteractionItems(value.options, 20)
  const fields = normalizeInteractionFields(value.fields)

  if (id) out.id = id
  if (prompt) out.prompt = prompt
  if (submitLabel) out.submitLabel = submitLabel
  if (responsePrompt) out.responsePrompt = responsePrompt
  if (approvalCommentLabel) out.approvalCommentLabel = approvalCommentLabel
  if (buttons) out.buttons = buttons
  if (options) out.options = options
  if (fields) out.fields = fields
  if (typeof value.oneShot === 'boolean') out.oneShot = value.oneShot
  return out
}

export function normalizeSlashCommands(input: unknown): AgentSlashCommand[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const commands: AgentSlashCommand[] = []

  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const name = normalizeSlashCommandName(record.name)
    if (!name) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const aliases = Array.isArray(record.aliases)
      ? [
          ...new Set(
            record.aliases
              .map(normalizeSlashCommandName)
              .filter((alias): alias is string => Boolean(alias)),
          ),
        ].filter((alias) => alias.toLowerCase() !== key)
      : undefined
    const interaction = normalizeSlashCommandInteraction(record.interaction)

    commands.push({
      name,
      ...(typeof record.description === 'string' && record.description.trim()
        ? { description: record.description.trim().slice(0, 240) }
        : {}),
      ...(aliases && aliases.length > 0 ? { aliases } : {}),
      ...(typeof record.packId === 'string' && record.packId.trim()
        ? { packId: record.packId.trim().slice(0, 80) }
        : {}),
      ...(typeof record.sourcePath === 'string' && record.sourcePath.trim()
        ? { sourcePath: record.sourcePath.trim().slice(0, 500) }
        : {}),
      ...(interaction ? { interaction } : {}),
    })
  }

  return commands.slice(0, 200)
}

export class AgentService {
  constructor(
    private deps: {
      agentDao: AgentDao
      userDao: UserDao
      logger: Logger
      channelMemberDao?: Pick<ChannelMemberDao, 'getAllChannelIds'>
      io?: Pick<SocketIOServer, 'to'>
    },
  ) {}

  private toPresenceUserStatus(status: string): UserStatus {
    if (status === 'online' || status === 'idle' || status === 'dnd') return status
    return 'offline'
  }

  private async broadcastAgentPresence(
    agent: NonNullable<AgentRecord>,
    options?: { agentStatus?: string | null; lastHeartbeat?: Date | string | null },
  ) {
    if (!this.deps.io || !this.deps.channelMemberDao) return
    try {
      const agentStatus = options?.agentStatus ?? agent.status
      const heartbeat =
        options && 'lastHeartbeat' in options ? options.lastHeartbeat : agent.lastHeartbeat
      const heartbeatDate = heartbeat ? new Date(heartbeat) : null
      const lastHeartbeat =
        heartbeatDate && Number.isFinite(heartbeatDate.getTime())
          ? heartbeatDate.toISOString()
          : null
      const resolvedStatus = normalizeBuddyRuntimePresenceStatus({ agentStatus, lastHeartbeat })
      const payload: PresenceChangePayload = {
        userId: agent.userId,
        status: this.toPresenceUserStatus(resolvedStatus),
        agentId: agent.id,
        agentStatus,
        lastHeartbeat,
        observedAt: new Date().toISOString(),
        expiresAt: getBuddyPresenceExpiresAt(lastHeartbeat),
      }
      const channelIds = await this.deps.channelMemberDao.getAllChannelIds(agent.userId)
      for (const channelId of channelIds) {
        this.deps.io.to(`channel:${channelId}`).emit('presence:change', payload)
      }
    } catch (err) {
      this.deps.logger.warn(
        { err, agentId: agent.id, userId: agent.userId },
        'Failed to broadcast agent presence',
      )
    }
  }

  async create(data: {
    name: string
    username: string
    description?: string
    avatarUrl?: string
    kernelType: string
    config: Record<string, unknown>
    buddyMode?: BuddyMode
    allowedServerIds?: string[]
    ownerId: string
    initialStatus?: 'running' | 'stopped'
  }) {
    // Create a bot user for the agent with the provided username.
    let botUser: Awaited<ReturnType<typeof this.deps.agentDao.createBotUser>>
    try {
      botUser = await this.deps.agentDao.createBotUser({
        username: data.username,
        displayName: data.name,
      })
    } catch (err) {
      const pgCode =
        (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
      if (
        pgCode === '23505' ||
        (err instanceof Error && /unique.*constraint|duplicate key/i.test(err.message))
      ) {
        throw Object.assign(new Error('Username already taken'), { status: 409 })
      }
      throw err
    }

    if (!botUser) {
      throw Object.assign(new Error('Username already taken'), { status: 409 })
    }

    // Update avatar if provided
    if (data.avatarUrl) {
      await this.deps.userDao.update(botUser.id, { avatarUrl: data.avatarUrl })
    }

    // Create the agent record (default to running)
    const agent = await this.deps.agentDao.create({
      userId: botUser.id,
      kernelType: data.kernelType,
      config: applyBuddyAccessConfig(
        {
          ...data.config,
          ...(data.description ? { description: data.description } : {}),
        },
        {
          buddyMode: data.buddyMode,
          allowedServerIds: data.allowedServerIds,
        },
      ),
      ownerId: data.ownerId,
    })

    const initialStatus = data.initialStatus ?? 'running'
    await this.deps.agentDao.updateStatus(agent!.id, initialStatus)

    return {
      ...agent,
      status: initialStatus,
      botUser: { ...botUser, avatarUrl: data.avatarUrl ?? botUser.avatarUrl },
    }
  }

  async getById(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) return null
    const botUser = await this.deps.userDao.findById(agent.userId)
    const owner = await this.deps.userDao.findById(agent.ownerId)
    return { ...agent, status: effectiveAgentStatus(agent), botUser, owner }
  }

  async update(
    id: string,
    ownerId: string,
    data: {
      name?: string
      description?: string
      avatarUrl?: string | null
      buddyMode?: BuddyMode
      allowedServerIds?: string[]
    },
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

    if (
      data.description !== undefined ||
      data.buddyMode !== undefined ||
      data.allowedServerIds !== undefined
    ) {
      let config = { ...((agent.config as Record<string, unknown>) ?? {}) }
      if (data.description !== undefined) config.description = data.description
      config = applyBuddyAccessConfig(config, {
        buddyMode: data.buddyMode,
        allowedServerIds: data.allowedServerIds,
      })
      await this.deps.agentDao.updateConfig(id, config)
    }

    return this.getById(id)
  }

  async updateConnectorBinding(
    id: string,
    ownerId: string,
    data: {
      connectorComputerId: string
      connectorRuntimeId: string
      connectorRuntimeLabel: string
      connectorServerUrl?: string
      connectorWorkDir?: string
    },
  ) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this agent'), { status: 403 })
    }

    await this.deps.agentDao.updateConfig(id, {
      ...((agent.config as Record<string, unknown>) ?? {}),
      connectorComputerId: data.connectorComputerId,
      connectorRuntimeId: data.connectorRuntimeId,
      connectorRuntimeLabel: data.connectorRuntimeLabel,
      ...(data.connectorServerUrl ? { connectorServerUrl: data.connectorServerUrl } : {}),
      ...(data.connectorWorkDir ? { connectorWorkDir: data.connectorWorkDir } : {}),
      connectorConfiguredAt: new Date().toISOString(),
    })

    return this.getById(id)
  }

  async clearConnectorBinding(id: string, ownerId: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.ownerId !== ownerId) {
      throw Object.assign(new Error('Not the owner of this agent'), { status: 403 })
    }

    const config = { ...((agent.config as Record<string, unknown>) ?? {}) }
    delete config.connectorComputerId
    delete config.connectorRuntimeId
    delete config.connectorRuntimeLabel
    delete config.connectorServerUrl
    delete config.connectorWorkDir
    delete config.connectorConfiguredAt
    await this.deps.agentDao.updateConfig(id, config)
    await this.deps.agentDao.updateStatus(id, 'stopped')

    return this.getById(id)
  }

  async getAll() {
    return this.deps.agentDao.findAll()
  }

  async getByOwnerId(ownerId: string) {
    return this.deps.agentDao.findByOwnerId(ownerId)
  }

  async getSlashCommands(agentId: string, requesterUserId: string) {
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.ownerId !== requesterUserId && agent.userId !== requesterUserId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
    return normalizeSlashCommands((agent.config as Record<string, unknown>)?.slashCommands)
  }

  async updateSlashCommands(
    agentId: string,
    requesterUserId: string,
    commandsInput: unknown,
  ): Promise<AgentSlashCommand[]> {
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.ownerId !== requesterUserId && agent.userId !== requesterUserId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }

    const commands = normalizeSlashCommands(commandsInput)
    await this.deps.agentDao.updateConfig(agentId, {
      ...((agent.config as Record<string, unknown>) ?? {}),
      slashCommands: commands,
      slashCommandsUpdatedAt: new Date().toISOString(),
    })

    return commands
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
      agentId: agent.id,
      ownerId: agent.ownerId,
      scopes: ['rental:usage:write'],
    })
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const currentConfig = ((agent.config as Record<string, unknown>) ?? {}) as Record<
      string,
      unknown
    >
    const { lastToken: _lastToken, ...safeConfig } = currentConfig

    // Persist only a hash. The plaintext token is returned once to the owner.
    await this.deps.agentDao.updateConfig(agentId, {
      ...safeConfig,
      lastTokenHash: tokenHash,
      lastTokenIssuedAt: new Date().toISOString(),
    })

    return { token, agent, botUser }
  }

  async start(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    // TODO: Start Docker container via AgentRuntime
    const updated = await this.deps.agentDao.updateStatus(id, 'running')
    this.deps.logger.info({ agentId: id }, 'Agent started')
    if (updated) await this.broadcastAgentPresence(updated)

    return updated
  }

  async stop(id: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    // TODO: Stop Docker container via AgentRuntime
    const updated = await this.deps.agentDao.updateStatus(id, 'stopped')
    await this.deps.userDao.updateStatus(agent.userId, 'offline')
    this.deps.logger.info({ agentId: id }, 'Agent stopped')
    if (updated) await this.broadcastAgentPresence(updated, { lastHeartbeat: null })

    return updated
  }

  async markError(id: string, message?: string) {
    const agent = await this.deps.agentDao.findById(id)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    const config = { ...((agent.config as Record<string, unknown>) ?? {}) }
    if (message?.trim()) {
      config.connectorLastError = message.trim().slice(0, 1000)
      config.connectorLastErrorAt = new Date().toISOString()
      await this.deps.agentDao.updateConfig(id, config)
    }
    const updated = await this.deps.agentDao.updateStatus(id, 'error')
    await this.deps.userDao.updateStatus(agent.userId, 'offline')
    this.deps.logger.warn({ agentId: id, error: message }, 'Agent marked error')
    if (updated) await this.broadcastAgentPresence(updated, { lastHeartbeat: null })
    return updated
  }

  async restart(id: string) {
    await this.stop(id)
    return this.start(id)
  }

  /** Record a heartbeat from the agent — marks it as running */
  async heartbeat(agentId: string, buddyUserId: string) {
    // Verify the Buddy exists and the authenticated Buddy user matches.
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }
    if (agent.userId !== buddyUserId) {
      throw Object.assign(new Error('User does not match agent'), { status: 403 })
    }

    const updated = await this.deps.agentDao.updateHeartbeat(agentId)
    await this.deps.userDao.updateStatus(buddyUserId, 'online')
    if (updated) await this.broadcastAgentPresence(updated)
    return updated
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
    await this.deps.agentDao.deleteByUserIdAndId(agent.ownerId, id)

    // Delete the bot user — cascade removes members entries from all servers
    await this.deps.userDao.delete(agent.userId)
  }
}
