import { createHash } from 'node:crypto'
import type { AppContainer } from '../container'
import { type Actor, actorUserId } from '../security/actor'

export type CloudComputerDeploymentIdentity = {
  id: string
  clusterId: string | null
  namespace: string
  name: string
  status?: string
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  configSnapshot?: unknown
}

const CLOUD_COMPUTER_VISIBLE_STATUSES = new Set([
  'pending',
  'deploying',
  'cancelling',
  'deployed',
  'paused',
  'resuming',
  'destroying',
  'failed',
])

const CLOUD_COMPUTER_RECOVERABLE_STATUSES = new Set([...CLOUD_COMPUTER_VISIBLE_STATUSES, 'failed'])

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function cloudComputerEnvironmentKey(deployment: {
  clusterId?: unknown
  namespace?: unknown
}) {
  const clusterId = stringValue(deployment.clusterId) ?? 'platform'
  const namespace = stringValue(deployment.namespace) ?? 'unknown'
  return `${clusterId}:${namespace}`
}

export function cloudComputerIdForDeployment(deployment: {
  clusterId?: unknown
  namespace?: unknown
}) {
  const digest = createHash('sha256')
    .update(cloudComputerEnvironmentKey(deployment))
    .digest('base64url')
    .slice(0, 22)
  return `cc_${digest}`
}

export function cloudComputerWorkspaceId(deployment: { clusterId?: unknown; namespace?: unknown }) {
  return `cloud-computer:${cloudComputerIdForDeployment(deployment)}`
}

function deploymentTime(row: {
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}) {
  const value = row.updatedAt ?? row.createdAt
  if (!value) return 0
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

const CLOUD_COMPUTER_STATUS_PRIORITY = new Map([
  ['deployed', 100],
  ['paused', 90],
  ['resuming', 80],
  ['deploying', 70],
  ['pending', 60],
  ['cancelling', 50],
  ['destroying', 40],
])

function deploymentStatusPriority(row: { status?: string }) {
  return CLOUD_COMPUTER_STATUS_PRIORITY.get(String(row.status ?? 'unknown')) ?? 0
}

function shouldReplaceDeploymentCandidate<T extends CloudComputerDeploymentIdentity>(
  next: T,
  current: T,
) {
  const nextPriority = deploymentStatusPriority(next)
  const currentPriority = deploymentStatusPriority(current)
  if (nextPriority !== currentPriority) return nextPriority > currentPriority
  return deploymentTime(next) >= deploymentTime(current)
}

export function selectCloudComputerDeploymentRows<T extends CloudComputerDeploymentIdentity>(
  rows: T[],
  options: { includeFailed?: boolean } = {},
): T[] {
  const latestByEnvironment = new Map<string, T>()
  const visibleStatuses = options.includeFailed
    ? CLOUD_COMPUTER_RECOVERABLE_STATUSES
    : CLOUD_COMPUTER_VISIBLE_STATUSES
  for (const row of rows) {
    if (!visibleStatuses.has(String(row.status ?? 'unknown'))) continue
    const key = cloudComputerEnvironmentKey(row)
    const existing = latestByEnvironment.get(key)
    if (!existing || shouldReplaceDeploymentCandidate(row, existing)) {
      latestByEnvironment.set(key, row)
    }
  }
  return [...latestByEnvironment.values()]
}

export async function resolveCloudComputerDeployment(
  container: AppContainer,
  actor: Actor,
  cloudComputerId: string,
): Promise<CloudComputerDeploymentIdentity | null> {
  if (!cloudComputerId.startsWith('cc_')) return null

  const userId = actorUserId(actor)
  const deployments = await container
    .resolve('cloudDeploymentDao')
    .listCloudComputerCandidatesByUser(userId)
  const currentDeployments = selectCloudComputerDeploymentRows(deployments, { includeFailed: true })
  return (
    currentDeployments.find(
      (deployment) => cloudComputerIdForDeployment(deployment) === cloudComputerId,
    ) ?? null
  )
}
