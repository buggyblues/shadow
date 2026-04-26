import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { UserDao } from '../dao/user.dao'
import { signAgentToken } from '../lib/jwt'

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

function effectiveAgentStatus(agent: AgentRecord): 'running' | 'stopped' | 'error' {
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
  constructor(private deps: { agentDao: AgentDao; userDao: UserDao; logger: Logger }) {}

  async create(data: {
    name: string
    username: string
    description?: string
    avatarUrl?: string
    kernelType: string
    config: Record<string, unknown>
    ownerId: string
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
      config: {
        ...data.config,
        ...(data.description ? { description: data.description } : {}),
      },
      ownerId: data.ownerId,
    })

    // Set initial status to running
    await this.deps.agentDao.updateStatus(agent!.id, 'running')

    return {
      ...agent,
      status: 'running' as const,
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
    data: { name?: string; description?: string; avatarUrl?: string | null },
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

    const updated = await this.deps.agentDao.updateHeartbeat(agentId)
    await this.deps.userDao.updateStatus(botUserId, 'online')
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
    await this.deps.agentDao.delete(id)

    // Delete the bot user — cascade removes members entries from all servers
    await this.deps.userDao.delete(agent.userId)
  }
}
