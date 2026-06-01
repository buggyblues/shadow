import { createHash, randomBytes } from 'node:crypto'
import type { ConnectorDao } from '../dao/connector.dao'
import type { ConnectorRuntimeInfo } from '../db/schema'
import { decrypt, encrypt } from '../lib/kms'
import { type AgentService, effectiveAgentStatus } from './agent.service'

const ONLINE_WINDOW_MS = 90_000
const MACHINE_TOKEN_PREFIX = 'sk_machine_'
const CONNECTOR_RECONNECT_JOB_DEDUPE_MS = 60_000

export interface ConnectorComputerView {
  id: string
  name: string
  status: 'pending' | 'online' | 'offline'
  hostname: string | null
  os: string | null
  arch: string | null
  daemonVersion: string | null
  runtimes: ConnectorRuntimeInfo[]
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectorConfigureBuddyPayload {
  serverUrl: string
  token: string
  runtimeId: string
  buddy: {
    id: string
    username: string
    displayName: string | null
  }
  projectName: string
  workDir: string
  modelProvider?: {
    id: string
    label: string
    baseUrl: string
    apiKey: string
    model: string
  }
}

export function connectorComputerStatus(lastSeenAt: Date | string | null | undefined) {
  if (!lastSeenAt) return 'pending' as const
  const time =
    typeof lastSeenAt === 'string' ? new Date(lastSeenAt).getTime() : lastSeenAt.getTime()
  return Date.now() - time <= ONLINE_WINDOW_MS ? ('online' as const) : ('offline' as const)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function generateMachineToken() {
  return `${MACHINE_TOKEN_PREFIX}${randomBytes(32).toString('hex')}`
}

function shellQuote(value: string): string {
  if (!value) return "''"
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim() || 'https://shadowob.com'
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed.replace(/\/$/, '')
}

function toComputerView(computer: {
  id: string
  name: string
  hostname: string | null
  os: string | null
  arch: string | null
  daemonVersion: string | null
  runtimes: ConnectorRuntimeInfo[]
  lastSeenAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ConnectorComputerView {
  return {
    id: computer.id,
    name: computer.name,
    status: connectorComputerStatus(computer.lastSeenAt),
    hostname: computer.hostname,
    os: computer.os,
    arch: computer.arch,
    daemonVersion: computer.daemonVersion,
    runtimes: computer.runtimes ?? [],
    lastSeenAt: computer.lastSeenAt?.toISOString?.() ?? null,
    createdAt: computer.createdAt.toISOString(),
    updatedAt: computer.updatedAt.toISOString(),
  }
}

function computerIdentity(computer: ConnectorComputerView) {
  return [
    (computer.hostname || computer.name).trim().toLowerCase(),
    (computer.os || '').trim().toLowerCase(),
    (computer.arch || '').trim().toLowerCase(),
  ].join('|')
}

function normalizeRuntimes(runtimes: ConnectorRuntimeInfo[]): ConnectorRuntimeInfo[] {
  const seen = new Set<string>()
  const next: ConnectorRuntimeInfo[] = []
  for (const runtime of runtimes) {
    const id = runtime.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      label: runtime.label?.trim() || id,
      kind: runtime.kind === 'openclaw' ? 'openclaw' : 'cli',
      status: runtime.status === 'available' ? 'available' : 'missing',
      version: runtime.version?.trim() || null,
      command: runtime.command?.trim() || null,
      iconId: runtime.iconId?.trim() || null,
      installCommand: runtime.installCommand?.trim() || null,
      installCommands: Array.isArray(runtime.installCommands)
        ? runtime.installCommands
            .map((command) => command.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      helpUrl: runtime.helpUrl?.trim() || null,
      detectedAt: runtime.detectedAt?.trim() || new Date().toISOString(),
    })
  }
  return next.slice(0, 30)
}

function readConfigString(config: Record<string, unknown> | null | undefined, key: string) {
  const value = config?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export class ConnectorService {
  constructor(
    private deps: {
      connectorDao: ConnectorDao
      agentService: AgentService
    },
  ) {}

  async createBootstrap(userId: string, input: { name?: string; serverUrl: string }) {
    const token = generateMachineToken()
    const name = input.name?.trim() || 'My Computer'
    const pendingComputer = await this.deps.connectorDao.findPendingComputerForUser(userId)
    const computer = pendingComputer
      ? await this.deps.connectorDao.resetComputerToken(pendingComputer.id, userId, {
          name,
          tokenHash: hashToken(token),
        })
      : await this.deps.connectorDao.createComputer({
          userId,
          name,
          tokenHash: hashToken(token),
        })
    if (!computer) throw new Error('Failed to create connector computer')
    await this.deps.connectorDao.deletePendingComputersForUserExcept(userId, computer.id)

    const serverUrl = normalizeServerUrl(input.serverUrl)
    const command = [
      'npx @shadowob/connector@latest --daemon',
      `--server-url ${shellQuote(serverUrl)}`,
      `--api-key ${shellQuote(token)}`,
    ].join(' ')

    return {
      computer: toComputerView(computer),
      apiKey: token,
      command,
    }
  }

  async listComputers(userId: string) {
    const computers = await this.deps.connectorDao.listComputers(userId)
    const onlineComputers = computers
      .map(toComputerView)
      .filter((computer) => computer.status === 'online')
      .sort((a, b) => {
        const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0
        const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0
        return bTime - aTime
      })
    const deduped = new Map<string, ConnectorComputerView>()
    for (const computer of onlineComputers) {
      const key = computerIdentity(computer)
      if (!deduped.has(key)) deduped.set(key, computer)
    }
    return [...deduped.values()]
  }

  async authenticateDaemon(apiKey: string) {
    if (!apiKey.startsWith(MACHINE_TOKEN_PREFIX)) return null
    return this.deps.connectorDao.findComputerByTokenHash(hashToken(apiKey))
  }

  async recordHeartbeat(
    computerId: string,
    input: {
      hostname?: string | null
      os?: string | null
      arch?: string | null
      daemonVersion?: string | null
      runtimes: ConnectorRuntimeInfo[]
    },
  ) {
    const updated = await this.deps.connectorDao.updateComputerHeartbeat(computerId, {
      hostname: input.hostname,
      os: input.os,
      arch: input.arch,
      daemonVersion: input.daemonVersion,
      runtimes: normalizeRuntimes(input.runtimes),
    })
    if (updated) {
      await this.enqueueReconnectJobs(updated)
    }
    return updated ? toComputerView(updated) : null
  }

  private async enqueueReconnectJobs(computer: {
    id: string
    userId: string
    runtimes: ConnectorRuntimeInfo[]
  }) {
    const availableRuntimes = new Map(
      (computer.runtimes ?? [])
        .filter((runtime) => runtime.status === 'available')
        .map((runtime) => [runtime.id, runtime]),
    )
    if (availableRuntimes.size === 0) return

    const boundAgents = await this.deps.connectorDao.listConnectorAgentsForComputer(computer.id)
    const since = new Date(Date.now() - CONNECTOR_RECONNECT_JOB_DEDUPE_MS)
    for (const { agent, botUser } of boundAgents) {
      if (effectiveAgentStatus(agent) === 'running') continue
      const config = (agent.config as Record<string, unknown> | null) ?? {}
      const runtimeId = readConfigString(config, 'connectorRuntimeId') || agent.kernelType
      const runtime = availableRuntimes.get(runtimeId)
      if (!runtime) continue

      const hasRecentJob = await this.deps.connectorDao.hasRecentConfigureJob(
        computer.id,
        agent.id,
        since,
      )
      if (hasRecentJob) continue

      const tokenResult = await this.deps.agentService.generateToken(agent.id, computer.userId)
      const serverUrl = readConfigString(config, 'connectorServerUrl') || 'https://shadowob.com'
      const payload: ConnectorConfigureBuddyPayload = {
        serverUrl: normalizeServerUrl(serverUrl),
        token: tokenResult.token,
        runtimeId: runtime.id,
        buddy: {
          id: agent.id,
          username: botUser.username,
          displayName: botUser.displayName,
        },
        projectName: botUser.username,
        workDir: readConfigString(config, 'connectorWorkDir') || '.',
      }
      await this.deps.connectorDao.createJob({
        userId: computer.userId,
        computerId: computer.id,
        agentId: agent.id,
        type: 'configure-buddy',
        payloadEncrypted: encrypt(JSON.stringify(payload)),
      })
    }
  }

  async createBuddyOnComputer(
    userId: string,
    computerId: string,
    input: {
      runtimeId: string
      serverUrl: string
      name: string
      username: string
      description?: string
      avatarUrl?: string | null
      buddyMode?: 'private' | 'shareable'
      allowedServerIds?: string[]
    },
  ) {
    const computer = await this.deps.connectorDao.findComputerForUser(computerId, userId)
    if (!computer) {
      throw Object.assign(new Error('Connector computer not found'), { status: 404 })
    }
    if (connectorComputerStatus(computer.lastSeenAt) !== 'online') {
      throw Object.assign(new Error('Connector computer is not online'), { status: 409 })
    }

    const runtime = (computer.runtimes ?? []).find(
      (item) => item.id === input.runtimeId && item.status === 'available',
    )
    if (!runtime) {
      throw Object.assign(new Error('Selected runtime is not available on this computer'), {
        status: 409,
      })
    }

    const agent = await this.deps.agentService.create({
      name: input.name,
      username: input.username,
      description: input.description,
      avatarUrl: input.avatarUrl ?? undefined,
      kernelType: input.runtimeId,
      config: {
        connectorComputerId: computer.id,
        connectorRuntimeId: runtime.id,
        connectorRuntimeLabel: runtime.label,
        connectorServerUrl: normalizeServerUrl(input.serverUrl),
        connectorWorkDir: '.',
      },
      buddyMode: input.buddyMode,
      allowedServerIds: input.allowedServerIds,
      ownerId: userId,
      initialStatus: 'stopped',
    })
    if (!agent?.id) {
      throw new Error('Failed to create connector Buddy')
    }
    const agentId = agent.id

    const tokenResult = await this.deps.agentService.generateToken(agentId, userId)
    const payload: ConnectorConfigureBuddyPayload = {
      serverUrl: normalizeServerUrl(input.serverUrl),
      token: tokenResult.token,
      runtimeId: runtime.id,
      buddy: {
        id: agentId,
        username: agent.botUser?.username ?? input.username,
        displayName: agent.botUser?.displayName ?? input.name,
      },
      projectName: agent.botUser?.username ?? input.username,
      workDir: '.',
    }
    const job = await this.deps.connectorDao.createJob({
      userId,
      computerId: computer.id,
      agentId,
      type: 'configure-buddy',
      payloadEncrypted: encrypt(JSON.stringify(payload)),
    })

    return { agent, job }
  }

  async configureBuddyOnComputer(
    userId: string,
    computerId: string,
    agentId: string,
    input: {
      runtimeId: string
      serverUrl: string
    },
  ) {
    const computer = await this.deps.connectorDao.findComputerForUser(computerId, userId)
    if (!computer) {
      throw Object.assign(new Error('Connector computer not found'), { status: 404 })
    }
    if (connectorComputerStatus(computer.lastSeenAt) !== 'online') {
      throw Object.assign(new Error('Connector computer is not online'), { status: 409 })
    }

    const runtime = (computer.runtimes ?? []).find(
      (item) => item.id === input.runtimeId && item.status === 'available',
    )
    if (!runtime) {
      throw Object.assign(new Error('Selected runtime is not available on this computer'), {
        status: 409,
      })
    }

    const tokenResult = await this.deps.agentService.generateToken(agentId, userId)
    const agent =
      (await this.deps.agentService.updateConnectorBinding(agentId, userId, {
        connectorComputerId: computer.id,
        connectorRuntimeId: runtime.id,
        connectorRuntimeLabel: runtime.label,
        connectorServerUrl: normalizeServerUrl(input.serverUrl),
        connectorWorkDir: '.',
      })) ?? tokenResult.agent
    const botUser = tokenResult.botUser

    const payload: ConnectorConfigureBuddyPayload = {
      serverUrl: normalizeServerUrl(input.serverUrl),
      token: tokenResult.token,
      runtimeId: runtime.id,
      buddy: {
        id: agentId,
        username: botUser.username,
        displayName: botUser.displayName,
      },
      projectName: botUser.username,
      workDir: '.',
    }
    const job = await this.deps.connectorDao.createJob({
      userId,
      computerId: computer.id,
      agentId,
      type: 'configure-buddy',
      payloadEncrypted: encrypt(JSON.stringify(payload)),
    })

    return { agent, job }
  }

  async removeBuddyFromComputer(
    userId: string,
    computerId: string,
    agentId: string,
    options: { deleteCloudBuddy?: boolean } = {},
  ) {
    const computer = await this.deps.connectorDao.findComputerForUser(computerId, userId)
    if (!computer) {
      throw Object.assign(new Error('Connector computer not found'), { status: 404 })
    }

    const agent = await this.deps.agentService.getById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (agent.ownerId !== userId) {
      throw Object.assign(new Error('Not the owner of this Buddy'), { status: 403 })
    }

    const config = (agent.config as Record<string, unknown> | null) ?? {}
    const boundComputerId = readConfigString(config, 'connectorComputerId')
    if (boundComputerId && boundComputerId !== computer.id) {
      throw Object.assign(new Error('This Buddy is connected to a different computer'), {
        status: 409,
      })
    }

    const runtimeId = readConfigString(config, 'connectorRuntimeId') || agent.kernelType
    const projectName =
      agent.botUser?.username || readConfigString(config, 'connectorProjectName') || agentId
    const payload: ConnectorConfigureBuddyPayload = {
      serverUrl: normalizeServerUrl(
        readConfigString(config, 'connectorServerUrl') || 'https://shadowob.com',
      ),
      token: '',
      runtimeId,
      buddy: {
        id: agentId,
        username: agent.botUser?.username ?? projectName,
        displayName: agent.botUser?.displayName ?? null,
      },
      projectName,
      workDir: readConfigString(config, 'connectorWorkDir') || '.',
    }
    const job = await this.deps.connectorDao.createJob({
      userId,
      computerId: computer.id,
      agentId,
      type: 'remove-buddy',
      payloadEncrypted: encrypt(JSON.stringify(payload)),
    })
    const updatedAgent = options.deleteCloudBuddy
      ? null
      : await this.deps.agentService.clearConnectorBinding(agentId, userId)
    if (options.deleteCloudBuddy) {
      await this.deps.agentService.delete(agentId)
    }

    return { agent: updatedAgent, job }
  }

  async claimDaemonJobs(computerId: string) {
    const jobs = await this.deps.connectorDao.claimPendingJobs(computerId)
    return jobs.map((job) => ({
      id: job.id,
      type: job.type,
      agentId: job.agentId,
      payload: JSON.parse(decrypt(job.payloadEncrypted)) as ConnectorConfigureBuddyPayload,
      createdAt: job.createdAt.toISOString(),
    }))
  }

  async getJobForUser(userId: string, jobId: string) {
    const job = await this.deps.connectorDao.findJobForUser(jobId, userId)
    if (!job) return null
    return {
      id: job.id,
      type: job.type,
      agentId: job.agentId,
      status: job.status,
      error: job.error,
      result: job.result,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt?.toISOString?.() ?? null,
    }
  }

  async completeDaemonJob(
    computerId: string,
    jobId: string,
    input: { status: 'completed' | 'failed'; result?: Record<string, unknown>; error?: string },
  ) {
    const job = await this.deps.connectorDao.updateJobForComputer(jobId, computerId, {
      status: input.status,
      result: input.result ?? null,
      error: input.error ?? null,
    })
    if (job?.agentId && input.status === 'failed') {
      await this.deps.agentService.markError(job.agentId, input.error)
    }
    return job
  }
}
