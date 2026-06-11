import type {
  AgentDeployment,
  AgentRuntime,
  CloudConfig,
  DeploymentPlacementGroupConfig,
  DeploymentPlacementIsolation,
} from '../config/schema.js'
import { getPluginRegistry } from '../plugins/registry.js'
import '../runtimes/loader.js'
import { runtimeStatePvcName } from '../runtimes/container.js'
import { getRuntime, type RuntimeKind } from '../runtimes/index.js'

export type RuntimePackageMode = 'single-agent' | 'multi-agent'

export interface CloudExecutionUnitCompatibility {
  accepted: boolean
  reason?: string
}

export interface CloudExecutionUnit {
  id: string
  runtime: AgentRuntime
  runtimeKind: RuntimeKind
  packageMode: RuntimePackageMode
  isolation: DeploymentPlacementIsolation
  agentIds: string[]
  primaryAgentId: string
  workloadName: string
  serviceName: string
  configMapName: string
  secretName: string
  statePvcName: string
  shared: boolean
  compatibility?: CloudExecutionUnitCompatibility
}

export interface CloudRuntimeTopology {
  schemaVersion: 1
  executionUnits: CloudExecutionUnit[]
  agentToExecutionUnit: Record<string, string>
}

export interface RuntimeTargetResolution {
  requestedAgentId: string
  executionUnitId: string
  affectedAgentIds: string[]
  sandboxName: string
  serviceName: string
  statePvcName: string
  scope: 'agent' | 'execution-unit'
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value ?? null))
}

function groupAgentIds(group: DeploymentPlacementGroupConfig): string[] {
  const raw = group.agentIds ?? group.agents ?? []
  const result: string[] = []
  const seen = new Set<string>()
  for (const id of raw) {
    const normalized = id.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function resolvedRuntimeKind(agent: AgentDeployment): RuntimeKind {
  return getRuntime(agent.runtime).runtimeKind
}

function resolvedImage(agent: AgentDeployment): string {
  const runtime = getRuntime(agent.runtime)
  return agent.image ?? runtime.defaultImage
}

function firstMismatch<T>(
  agents: AgentDeployment[],
  label: string,
  read: (agent: AgentDeployment) => T,
): string | null {
  if (agents.length <= 1) return null
  const first = stableJson(read(agents[0]!))
  for (const agent of agents.slice(1)) {
    if (stableJson(read(agent)) !== first) {
      return `${label} differs across agents`
    }
  }
  return null
}

function podLevelPluginUseReason(agents: AgentDeployment[]): string | null {
  const registry = getPluginRegistry()
  if (registry.size === 0) return null

  for (const agent of agents) {
    for (const entry of agent.use ?? []) {
      const plugin = registry.get(entry.plugin)
      if (plugin?.k8s && plugin.executionUnitScope !== 'agent-runtime') {
        return `agent ${agent.id} uses pod-level plugin ${entry.plugin}`
      }
    }
  }
  return null
}

export function runtimeExecutionUnitShareCompatibility(
  agents: AgentDeployment[],
): CloudExecutionUnitCompatibility {
  if (agents.length <= 1) return { accepted: true }

  const runtimeKinds = new Set(agents.map((agent) => resolvedRuntimeKind(agent)))
  if (runtimeKinds.size !== 1) {
    return { accepted: false, reason: 'runtimeKind differs across agents' }
  }

  const images = new Set(agents.map((agent) => resolvedImage(agent)))
  if (images.size !== 1) {
    return { accepted: false, reason: 'runner image differs across agents' }
  }

  const replicaAgent = agents.find((agent) => (agent.replicas ?? 1) > 1)
  if (replicaAgent) {
    return {
      accepted: false,
      reason: `agent ${replicaAgent.id} sets replicas=${replicaAgent.replicas}`,
    }
  }

  const podLevelPluginReason = podLevelPluginUseReason(agents)
  if (podLevelPluginReason) {
    return { accepted: false, reason: podLevelPluginReason }
  }

  const mismatch =
    firstMismatch(agents, 'vault', (agent) => agent.vault ?? 'default') ??
    firstMismatch(agents, 'networking', (agent) => agent.networking) ??
    firstMismatch(agents, 'sandbox', (agent) => agent.sandbox) ??
    firstMismatch(agents, 'scheduling', (agent) => agent.scheduling) ??
    firstMismatch(agents, 'resources', (agent) => agent.resources) ??
    firstMismatch(agents, 'source', (agent) => agent.source)
  if (mismatch) return { accepted: false, reason: mismatch }

  return { accepted: true }
}

function executionUnitForAgents(options: {
  id: string
  agents: AgentDeployment[]
  isolation: DeploymentPlacementIsolation
  compatibility?: CloudExecutionUnitCompatibility
}): CloudExecutionUnit {
  const primary = options.agents[0]
  if (!primary) throw new Error(`Execution unit "${options.id}" has no agents`)
  const runtime = getRuntime(primary.runtime)
  const agentIds = options.agents.map((agent) => agent.id)
  const shared = agentIds.length > 1 && options.isolation === 'shared-runner'
  return {
    id: options.id,
    runtime: primary.runtime,
    runtimeKind: runtime.runtimeKind,
    packageMode: shared ? 'multi-agent' : 'single-agent',
    isolation: shared ? 'shared-runner' : 'dedicated',
    agentIds,
    primaryAgentId: primary.id,
    workloadName: options.id,
    serviceName: `${options.id}-svc`,
    configMapName: `${options.id}-config`,
    secretName: `${options.id}-secrets`,
    statePvcName: runtimeStatePvcName(options.id),
    shared,
    ...(options.compatibility ? { compatibility: options.compatibility } : {}),
  }
}

function dedicatedUnit(
  agent: AgentDeployment,
  compatibility?: CloudExecutionUnitCompatibility,
): CloudExecutionUnit {
  return executionUnitForAgents({
    id: agent.id,
    agents: [agent],
    isolation: 'dedicated',
    ...(compatibility ? { compatibility } : {}),
  })
}

function autoShareKey(agent: AgentDeployment): string {
  return [
    resolvedRuntimeKind(agent),
    agent.runtime,
    resolvedImage(agent),
    agent.vault ?? 'default',
    stableJson(agent.networking),
    stableJson(agent.sandbox),
    stableJson(agent.scheduling),
    stableJson(agent.resources),
    stableJson(agent.source),
  ].join('|')
}

function uniqueUnitId(base: string, used: Set<string>): string {
  let id = base
  let index = 2
  while (used.has(id)) {
    id = `${base}-${index}`
    index += 1
  }
  used.add(id)
  return id
}

export function planRuntimeTopology(config: CloudConfig): CloudRuntimeTopology {
  const agents = config.deployments?.agents ?? []
  const byId = new Map(agents.map((agent) => [agent.id, agent]))
  const placement = config.deployments?.placement
  const units: CloudExecutionUnit[] = []
  const assigned = new Set<string>()
  const usedUnitIds = new Set<string>()

  for (const group of placement?.groups ?? []) {
    const requestedIds = groupAgentIds(group)
    const groupAgents = requestedIds.map((id) => {
      const agent = byId.get(id)
      if (!agent) throw new Error(`Placement group "${group.id}" references unknown agent "${id}"`)
      return agent
    })
    for (const id of requestedIds) {
      if (assigned.has(id)) {
        throw new Error(`Agent "${id}" appears in more than one placement group`)
      }
      assigned.add(id)
    }

    const requestedIsolation = group.isolation ?? 'shared-runner'
    if (requestedIsolation !== 'shared-runner' || groupAgents.length <= 1) {
      for (const agent of groupAgents) {
        units.push(dedicatedUnit(agent))
        usedUnitIds.add(agent.id)
      }
      continue
    }

    const compatibility = runtimeExecutionUnitShareCompatibility(groupAgents)
    if (compatibility.accepted) {
      units.push(
        executionUnitForAgents({
          id: uniqueUnitId(group.id, usedUnitIds),
          agents: groupAgents,
          isolation: 'shared-runner',
          compatibility,
        }),
      )
    } else {
      for (const agent of groupAgents) {
        units.push(dedicatedUnit(agent, compatibility))
        usedUnitIds.add(agent.id)
      }
    }
  }

  const unassigned = agents.filter((agent) => !assigned.has(agent.id))
  const autoShared = placement?.mode === 'auto' && placement.defaultIsolation === 'shared-runner'

  if (autoShared) {
    const grouped = new Map<string, AgentDeployment[]>()
    for (const agent of unassigned) {
      const key = autoShareKey(agent)
      grouped.set(key, [...(grouped.get(key) ?? []), agent])
    }
    for (const groupAgents of grouped.values()) {
      const compatibility = runtimeExecutionUnitShareCompatibility(groupAgents)
      if (groupAgents.length > 1 && compatibility.accepted) {
        const primary = groupAgents[0]!
        const id = uniqueUnitId(`${primary.runtime}-shared`, usedUnitIds)
        units.push(
          executionUnitForAgents({
            id,
            agents: groupAgents,
            isolation: 'shared-runner',
            compatibility,
          }),
        )
      } else {
        for (const agent of groupAgents) {
          units.push(dedicatedUnit(agent, groupAgents.length > 1 ? compatibility : undefined))
          usedUnitIds.add(agent.id)
        }
      }
    }
  } else {
    for (const agent of unassigned) {
      units.push(dedicatedUnit(agent))
      usedUnitIds.add(agent.id)
    }
  }

  const agentToExecutionUnit: Record<string, string> = {}
  for (const unit of units) {
    for (const agentId of unit.agentIds) {
      agentToExecutionUnit[agentId] = unit.id
    }
  }

  return {
    schemaVersion: 1,
    executionUnits: units,
    agentToExecutionUnit,
  }
}

export function resolveRuntimeTarget(
  topology: CloudRuntimeTopology,
  requestedAgentId?: string,
): RuntimeTargetResolution {
  const agentId = requestedAgentId?.trim() || Object.keys(topology.agentToExecutionUnit)[0]
  if (!agentId) throw new Error('No runtime agent is available')
  const unitId = topology.agentToExecutionUnit[agentId]
  if (!unitId) throw new Error(`Runtime agent "${agentId}" is not present in topology`)
  const unit = topology.executionUnits.find((entry) => entry.id === unitId)
  if (!unit) throw new Error(`Execution unit "${unitId}" is missing from topology`)
  return {
    requestedAgentId: agentId,
    executionUnitId: unit.id,
    affectedAgentIds: unit.agentIds,
    sandboxName: unit.workloadName,
    serviceName: unit.serviceName,
    statePvcName: unit.statePvcName,
    scope: unit.shared ? 'execution-unit' : 'agent',
  }
}
