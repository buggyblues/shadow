import {
  parseShadowComputerId,
  type ShadowAgentComputerPlacement,
  type ShadowComputer,
  type ShadowComputerBuddy,
  type ShadowComputerCapabilities,
  shadowComputerId,
} from '@shadowob/shared/types'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { ConnectorDao } from '../dao/connector.dao'
import {
  cloudComputerIdForDeployment,
  selectCloudComputerDeploymentRows,
} from '../lib/cloud-computer-identity'
import { extractCloudProvisionedBuddies } from '../lib/cloud-provisioned-buddies'
import type { AgentService } from './agent.service'
import type { ConnectorService } from './connector.service'

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isoValue(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

type CloudDesiredBuddy = {
  id: string
  name: string
  avatarUrl: string | null
  runtimeId: string | null
}

function cloudDesiredBuddies(snapshot: unknown): CloudDesiredBuddy[] {
  const root = recordValue(snapshot) ?? {}
  const shadowob = (Array.isArray(root.use) ? root.use : [])
    .map(recordValue)
    .find((entry) => stringValue(entry?.plugin) === 'shadowob')
  const options = recordValue(shadowob?.options)
  const bindings = (Array.isArray(options?.bindings) ? options.bindings : [])
    .map(recordValue)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
  const deployments = recordValue(root.deployments)
  const runtimeAgents = (Array.isArray(deployments?.agents) ? deployments.agents : [])
    .map(recordValue)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))

  return (Array.isArray(options?.buddies) ? options.buddies : []).flatMap((candidate) => {
    const buddy = recordValue(candidate)
    const id = stringValue(buddy?.id)
    if (!id) return []
    const binding = bindings.find((entry) => stringValue(entry.targetId) === id)
    const runtimeAgentId = stringValue(binding?.agentId)
    const runtimeAgent = runtimeAgents.find((entry) => stringValue(entry.id) === runtimeAgentId)
    return [
      {
        id,
        name: stringValue(buddy?.name) ?? id,
        avatarUrl: stringValue(buddy?.avatarUrl),
        runtimeId: stringValue(runtimeAgent?.runtime),
      },
    ]
  })
}

function cloudRuntimes(snapshot: unknown) {
  const root = recordValue(snapshot) ?? {}
  const overlay = recordValue(root.cloudComputer)
  const declared = Array.isArray(overlay?.runtimes) ? overlay.runtimes : []
  const deployments = recordValue(root.deployments)
  const agentRuntimes = (Array.isArray(deployments?.agents) ? deployments.agents : [])
    .map((agent) => stringValue(recordValue(agent)?.runtime))
    .filter((id): id is string => Boolean(id))
  const ids = new Set<string>([
    ...declared.map((runtime) => stringValue(recordValue(runtime)?.id)).filter(Boolean),
    ...agentRuntimes,
  ] as string[])
  return [...ids].map((id) => ({ id, label: id, status: 'available' }))
}

function localCapabilities(capabilities: string[]): ShadowComputerCapabilities {
  const values = new Set(capabilities)
  return {
    buddies: true,
    runtimes: true,
    tasks: values.has('tasks'),
    diagnostics: values.has('diagnostics'),
    files: values.has('files'),
    terminal: values.has('terminal'),
    browser: values.has('browser'),
    desktop: values.has('desktop'),
    backups: values.has('backups'),
    connectors: true,
    power: false,
  }
}

function cloudCapabilities(status: string): ShadowComputerCapabilities {
  const ready = status === 'deployed'
  return {
    buddies: ready,
    runtimes: ready,
    tasks: ready,
    diagnostics: true,
    files: ready,
    terminal: ready,
    browser: ready,
    desktop: ready,
    backups: ['deployed', 'paused', 'failed'].includes(status),
    connectors: ready,
    power: true,
  }
}

export class ComputerService {
  constructor(
    private deps: {
      connectorDao: ConnectorDao
      connectorService: ConnectorService
      cloudDeploymentDao: CloudDeploymentDao
      agentService: AgentService
    },
  ) {}

  private async localBuddies(
    computerId: string,
    computerStatus: string,
  ): Promise<ShadowComputerBuddy[]> {
    const rows = await this.deps.connectorDao.listConnectorAgentsForComputer(computerId)
    return rows.map(({ agent, botUser, placement }) => {
      const config = recordValue(agent.config) ?? {}
      return {
        agentId: agent.id,
        buddyId: agent.id,
        name: botUser.displayName || botUser.username || agent.id,
        username: botUser.username,
        avatarUrl: botUser.avatarUrl,
        status: computerStatus === 'online' ? agent.status : 'offline',
        runtimeId:
          placement.runtimeId ?? stringValue(config.connectorRuntimeId) ?? agent.kernelType,
        runtimeLabel: placement.runtimeLabel ?? stringValue(config.connectorRuntimeLabel),
        workDir: placement.workDir ?? stringValue(config.connectorWorkDir),
      }
    })
  }

  private async listLocalComputers(userId: string): Promise<ShadowComputer[]> {
    const rows = await this.deps.connectorService.listComputers(userId)
    return Promise.all(
      rows.map(async (computer) => {
        const buddies = await this.localBuddies(computer.id, computer.status)
        return {
          id: shadowComputerId('local', computer.id),
          sourceId: computer.id,
          kind: 'local' as const,
          name: computer.name,
          status: computer.status,
          device: {
            class: computer.deviceClass as ShadowComputer['device']['class'],
            vendor: computer.deviceVendor,
            model: computer.deviceModel,
            hostname: computer.hostname,
            os: computer.os,
            osVersion: computer.osVersion,
            arch: computer.arch,
          },
          capabilities: localCapabilities(computer.capabilities),
          runtimes: computer.runtimes,
          buddies,
          buddyCount: buddies.length,
          lastSeenAt: computer.lastSeenAt,
          createdAt: computer.createdAt,
          updatedAt: computer.updatedAt,
          local: {
            installationId: computer.installationId,
            deviceFingerprint: computer.deviceFingerprint,
            daemonVersion: computer.daemonVersion,
          },
        }
      }),
    )
  }

  private async listCloudComputers(userId: string): Promise<ShadowComputer[]> {
    const candidates = await this.deps.cloudDeploymentDao.listCloudComputerCandidatesByUser(userId)
    const deployments = selectCloudComputerDeploymentRows(candidates, { includeFailed: true })
    return Promise.all(
      deployments.map(async (deployment) => {
        const sourceId = cloudComputerIdForDeployment(deployment)
        const desired = cloudDesiredBuddies(deployment.configSnapshot)
        const provisioned = extractCloudProvisionedBuddies(deployment.configSnapshot)
        const provisionedByBuddy = new Map(provisioned.map((buddy) => [buddy.id, buddy]))
        const agents = await this.deps.agentService.getByIds(
          provisioned.map((buddy) => buddy.agentId),
        )
        const agentsById = new Map(agents.map((agent) => [agent.id, agent]))
        const buddies: ShadowComputerBuddy[] = desired.map((buddy) => {
          const provisionedBuddy = provisionedByBuddy.get(buddy.id)
          const agent = provisionedBuddy ? agentsById.get(provisionedBuddy.agentId) : null
          return {
            agentId: agent?.id ?? null,
            buddyId: buddy.id,
            name: agent?.botUser?.displayName || agent?.botUser?.username || buddy.name,
            username: agent?.botUser?.username ?? null,
            avatarUrl: agent?.botUser?.avatarUrl ?? buddy.avatarUrl,
            status: agent?.status ?? 'pending',
            runtimeId: buddy.runtimeId ?? agent?.kernelType ?? null,
            runtimeLabel: buddy.runtimeId ?? agent?.kernelType ?? null,
          }
        })
        const snapshot = recordValue(deployment.configSnapshot)
        const overlay = recordValue(snapshot?.cloudComputer)
        const appearance = recordValue(overlay?.appearance)
        const status = String(deployment.status ?? 'unknown')
        return {
          id: shadowComputerId('cloud', sourceId),
          sourceId,
          kind: 'cloud' as const,
          name: deployment.name,
          status,
          device: {
            class: 'cloud' as const,
            vendor: 'Shadow',
            model: stringValue(deployment.resourceTier) ?? 'cloud-computer',
            hostname: deployment.namespace,
            os: 'linux',
            arch: null,
          },
          capabilities: cloudCapabilities(status),
          runtimes: cloudRuntimes(deployment.configSnapshot),
          buddies,
          buddyCount: buddies.length,
          lastActiveAt: isoValue(deployment.lastActiveAt),
          createdAt: isoValue(deployment.createdAt),
          updatedAt: isoValue(deployment.updatedAt),
          cloud: {
            shellColor: stringValue(appearance?.shellColor),
            hourlyCredits: numberValue(deployment.hourlyCost),
            monthlyCredits: numberValue(deployment.monthlyCost),
          },
        }
      }),
    )
  }

  async listComputers(userId: string, kind?: 'local' | 'cloud'): Promise<ShadowComputer[]> {
    const [local, cloud] = await Promise.all([
      kind === 'cloud' ? Promise.resolve([]) : this.listLocalComputers(userId),
      kind === 'local' ? Promise.resolve([]) : this.listCloudComputers(userId),
    ])
    return [...local, ...cloud].sort((left, right) => {
      const leftOnline = ['online', 'deployed'].includes(left.status) ? 0 : 1
      const rightOnline = ['online', 'deployed'].includes(right.status) ? 0 : 1
      if (leftOnline !== rightOnline) return leftOnline - rightOnline
      return Date.parse(right.updatedAt ?? '') - Date.parse(left.updatedAt ?? '')
    })
  }

  async getComputer(userId: string, id: string): Promise<ShadowComputer | null> {
    const parsed = parseShadowComputerId(id)
    if (!parsed) return null
    const computers = await this.listComputers(userId, parsed.kind)
    return computers.find((computer) => computer.id === id) ?? null
  }

  async placementMap(userId: string): Promise<Map<string, ShadowAgentComputerPlacement>> {
    const computers = await this.listComputers(userId)
    const placements = new Map<string, ShadowAgentComputerPlacement>()
    for (const computer of computers) {
      for (const buddy of computer.buddies) {
        if (!buddy.agentId) continue
        placements.set(buddy.agentId, {
          computerId: computer.id,
          computerKind: computer.kind,
          computerName: computer.name,
          computerStatus: computer.status,
          deviceClass: computer.device.class,
          deviceModel: computer.device.model,
          runtimeId: buddy.runtimeId,
          runtimeLabel: buddy.runtimeLabel,
        })
      }
    }
    return placements
  }

  async renameComputer(userId: string, id: string, name: string) {
    const parsed = parseShadowComputerId(id)
    if (!parsed) throw Object.assign(new Error('Computer not found'), { status: 404 })
    if (parsed.kind === 'local') {
      await this.deps.connectorService.renameComputer(userId, parsed.sourceId, name)
    } else {
      const candidates =
        await this.deps.cloudDeploymentDao.listCloudComputerCandidatesByUser(userId)
      const deployment = selectCloudComputerDeploymentRows(candidates, {
        includeFailed: true,
      }).find((candidate) => cloudComputerIdForDeployment(candidate) === parsed.sourceId)
      if (!deployment) throw Object.assign(new Error('Computer not found'), { status: 404 })
      await this.deps.cloudDeploymentDao.updateName(deployment.id, userId, name)
    }
    const updated = await this.getComputer(userId, id)
    if (!updated) throw Object.assign(new Error('Computer not found'), { status: 404 })
    return updated
  }

  async removeLocalComputer(userId: string, id: string) {
    const parsed = parseShadowComputerId(id)
    if (!parsed || parsed.kind !== 'local') {
      throw Object.assign(new Error('Only local computers can be disconnected here'), {
        status: 409,
      })
    }
    return this.deps.connectorService.revokeComputer(userId, parsed.sourceId)
  }
}
