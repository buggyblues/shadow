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

const CLOUD_COMPUTER_INSTANCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
const CLOUD_COMPUTER_TRANSITIONAL_STATUSES = new Set([
  'pending',
  'deploying',
  'cancelling',
  'resuming',
  'destroying',
])

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function cloudComputerInstanceId(deployment: { configSnapshot?: unknown }) {
  const snapshot = recordValue(deployment.configSnapshot)
  const overlay = recordValue(snapshot?.cloudComputer)
  const instanceId = stringValue(overlay?.instanceId)
  return instanceId && CLOUD_COMPUTER_INSTANCE_ID_RE.test(instanceId)
    ? instanceId.toLowerCase()
    : null
}

export function cloudComputerEnvironmentKey(deployment: {
  clusterId?: unknown
  namespace?: unknown
}) {
  const clusterId = stringValue(deployment.clusterId) ?? 'platform'
  const namespace = stringValue(deployment.namespace) ?? 'unknown'
  return `${clusterId}:${namespace}`
}

export function cloudComputerIdentityKey(deployment: {
  clusterId?: unknown
  namespace?: unknown
  configSnapshot?: unknown
}) {
  const instanceId = cloudComputerInstanceId(deployment)
  return instanceId
    ? `instance:${instanceId}`
    : `legacy-environment:${cloudComputerEnvironmentKey(deployment)}`
}

export function cloudComputerIdForDeployment(deployment: {
  clusterId?: unknown
  namespace?: unknown
  configSnapshot?: unknown
}) {
  const instanceId = cloudComputerInstanceId(deployment)
  if (instanceId) return `cc_${instanceId.replace(/-/g, '')}`
  const digest = createHash('sha256')
    .update(cloudComputerEnvironmentKey(deployment))
    .digest('base64url')
    .slice(0, 22)
  return `cc_${digest}`
}

export function cloudComputerWorkspaceId(deployment: {
  clusterId?: unknown
  namespace?: unknown
  configSnapshot?: unknown
}) {
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

function deploymentCreatedTime(row: {
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}) {
  const value = row.createdAt ?? row.updatedAt
  if (!value) return 0
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function shouldReplaceDeploymentCandidate<T extends CloudComputerDeploymentIdentity>(
  next: T,
  current: T,
) {
  const nextFailed = next.status === 'failed'
  const currentFailed = current.status === 'failed'
  if (nextFailed !== currentFailed) return !nextFailed
  const nextCreatedAt = deploymentCreatedTime(next)
  const currentCreatedAt = deploymentCreatedTime(current)
  if (nextCreatedAt !== currentCreatedAt) return nextCreatedAt > currentCreatedAt
  return deploymentTime(next) >= deploymentTime(current)
}

export function selectCloudComputerDeploymentRows<T extends CloudComputerDeploymentIdentity>(
  rows: T[],
  options: { includeFailed?: boolean } = {},
): T[] {
  const latestByIdentity = new Map<string, T>()
  const latestDestroyedAtByIdentity = new Map<string, number>()
  const latestFailedAtByIdentity = new Map<string, number>()
  const visibleStatuses = options.includeFailed
    ? CLOUD_COMPUTER_RECOVERABLE_STATUSES
    : CLOUD_COMPUTER_VISIBLE_STATUSES

  for (const row of rows) {
    if (String(row.status ?? 'unknown') === 'failed') {
      const key = cloudComputerIdentityKey(row)
      const failedAt = deploymentCreatedTime(row)
      latestFailedAtByIdentity.set(key, Math.max(latestFailedAtByIdentity.get(key) ?? 0, failedAt))
    }
    if (String(row.status ?? 'unknown') !== 'destroyed') continue
    const key = cloudComputerIdentityKey(row)
    const destroyedAt = deploymentTime(row)
    latestDestroyedAtByIdentity.set(
      key,
      Math.max(latestDestroyedAtByIdentity.get(key) ?? 0, destroyedAt),
    )
  }

  for (const row of rows) {
    if (!visibleStatuses.has(String(row.status ?? 'unknown'))) continue
    const key = cloudComputerIdentityKey(row)
    const latestDestroyedAt = latestDestroyedAtByIdentity.get(key)
    if (latestDestroyedAt !== undefined && deploymentTime(row) <= latestDestroyedAt) continue
    const latestFailedAt = latestFailedAtByIdentity.get(key)
    if (
      latestFailedAt !== undefined &&
      CLOUD_COMPUTER_TRANSITIONAL_STATUSES.has(String(row.status ?? 'unknown')) &&
      deploymentCreatedTime(row) <= latestFailedAt
    ) {
      continue
    }
    const existing = latestByIdentity.get(key)
    if (!existing || shouldReplaceDeploymentCandidate(row, existing)) {
      latestByIdentity.set(key, row)
    }
  }
  return [...latestByIdentity.values()]
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
