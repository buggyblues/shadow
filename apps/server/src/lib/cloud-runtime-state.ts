type WorkloadBackend = 'agent-sandbox' | 'deployment'

export interface RuntimeStateTarget {
  agentId: string
  runtime: string
  containerName: string
  statePath: string
  pvcName: string
  backend: WorkloadBackend
  persistentState: boolean
}

interface DeploymentLike {
  name: string
  configSnapshot?: unknown
}

const RUNTIME_STATE: Record<string, { containerName: string; statePath: string }> = {
  openclaw: { containerName: 'openclaw', statePath: '/home/shadow/.openclaw' },
  hermes: { containerName: 'hermes', statePath: '/home/shadow/.hermes' },
  'cc-connect': { containerName: 'cc-connect', statePath: '/home/shadow/.cc-connect' },
}
const DEFAULT_RUNTIME_STATE = RUNTIME_STATE.openclaw as { containerName: string; statePath: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function runtimeStatePvcNameForAgent(agentId: string): string {
  return `shadow-runner-state-${agentId}`
}

function runtimeStateFor(runtime: string) {
  return RUNTIME_STATE[runtime] ?? DEFAULT_RUNTIME_STATE
}

function deploymentBackend(configSnapshot: unknown): WorkloadBackend {
  if (!isRecord(configSnapshot)) return 'agent-sandbox'
  const deployments = configSnapshot.deployments
  if (!isRecord(deployments)) return 'agent-sandbox'
  return deployments.backend === 'deployment' ? 'deployment' : 'agent-sandbox'
}

function sandboxStateEnabled(configSnapshot: unknown, agent: Record<string, unknown>): boolean {
  if (!isRecord(configSnapshot)) return true
  const deployments = configSnapshot.deployments
  const globalSandbox = isRecord(deployments) ? deployments.sandbox : undefined
  const globalState = isRecord(globalSandbox) ? globalSandbox.state : undefined
  if (isRecord(globalState) && globalState.enabled === false) return false

  const agentSandbox = agent.sandbox
  const agentState = isRecord(agentSandbox) ? agentSandbox.state : undefined
  if (isRecord(agentState) && agentState.enabled === false) return false

  return true
}

function deploymentAgents(configSnapshot: unknown): Record<string, unknown>[] {
  if (!isRecord(configSnapshot)) return []
  const deployments = configSnapshot.deployments
  if (!isRecord(deployments) || !Array.isArray(deployments.agents)) return []
  return deployments.agents.filter(isRecord)
}

function agentIdOf(agent: Record<string, unknown>): string | null {
  return typeof agent.id === 'string' && agent.id.trim() ? agent.id.trim() : null
}

function runtimeOf(agent: Record<string, unknown>): string {
  return typeof agent.runtime === 'string' && agent.runtime.trim()
    ? agent.runtime.trim()
    : 'openclaw'
}

function targetForAgent(
  configSnapshot: unknown,
  fallbackName: string,
  agent: Record<string, unknown>,
): RuntimeStateTarget {
  const agentId = agentIdOf(agent) ?? fallbackName
  const runtime = runtimeOf(agent)
  const state = runtimeStateFor(runtime)
  const backend = deploymentBackend(configSnapshot)
  return {
    agentId,
    runtime,
    containerName: state.containerName,
    statePath: state.statePath,
    pvcName: runtimeStatePvcNameForAgent(agentId),
    backend,
    persistentState: sandboxStateEnabled(configSnapshot, agent),
  }
}

export function resolveRuntimeStateTarget(
  deployment: DeploymentLike,
  requestedAgentId?: string,
): RuntimeStateTarget {
  const requested = requestedAgentId?.trim()
  const agents = deploymentAgents(deployment.configSnapshot)
  const selected =
    (requested
      ? agents.find((agent) => agentIdOf(agent) === requested)
      : agents.find((agent) => agentIdOf(agent))) ?? null

  if (selected) {
    return targetForAgent(deployment.configSnapshot, deployment.name, selected)
  }

  const fallbackAgentId = requested || deployment.name
  const fallbackRuntime = 'openclaw'
  const state = runtimeStateFor(fallbackRuntime)
  const backend = deploymentBackend(deployment.configSnapshot)
  return {
    agentId: fallbackAgentId,
    runtime: fallbackRuntime,
    containerName: state.containerName,
    statePath: state.statePath,
    pvcName: runtimeStatePvcNameForAgent(fallbackAgentId),
    backend,
    persistentState: true,
  }
}

export function listRuntimeStateTargets(deployment: DeploymentLike): RuntimeStateTarget[] {
  const agents = deploymentAgents(deployment.configSnapshot)
  if (agents.length === 0) return [resolveRuntimeStateTarget(deployment)]
  return agents.map((agent) => targetForAgent(deployment.configSnapshot, deployment.name, agent))
}

export function listEphemeralRuntimeStateTargets(deployment: DeploymentLike): RuntimeStateTarget[] {
  return listRuntimeStateTargets(deployment).filter((target) => !target.persistentState)
}
