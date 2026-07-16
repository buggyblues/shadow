import { CLOUD_SAAS_RUNTIME_KEY, extractCloudSaasRuntime } from '@shadowob/cloud'
import type { AppContainer } from '../container'
import {
  type CloudComputerDeploymentIdentity,
  cloudComputerIdForDeployment,
} from './cloud-computer-identity'
import { extractCloudProvisionedBuddies } from './cloud-provisioned-buddies'

export type CloudComputerBuddyIdentityCleanup = {
  buddyId: string
  agentId: string
  userId?: string | null
  deploymentId?: string | null
  requestedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function cloudComputerBuddyIdentityCleanupQueue(
  configSnapshot: unknown,
): CloudComputerBuddyIdentityCleanup[] {
  const snapshot = extractCloudSaasRuntime(configSnapshot).configSnapshot
  if (!snapshot) return []
  const cloudComputer = isRecord(snapshot.cloudComputer) ? snapshot.cloudComputer : null
  const queue = cloudComputer?.buddyIdentityCleanup
  if (!Array.isArray(queue)) return []

  const result: CloudComputerBuddyIdentityCleanup[] = []
  const seenAgentIds = new Set<string>()
  for (const item of queue) {
    if (!isRecord(item)) continue
    const buddyId = readString(item.buddyId)
    const agentId = readString(item.agentId)
    const requestedAt = readString(item.requestedAt)
    if (!buddyId || !agentId || !requestedAt || seenAgentIds.has(agentId)) continue
    seenAgentIds.add(agentId)
    result.push({
      buddyId,
      agentId,
      requestedAt,
      userId: readString(item.userId),
      deploymentId: readString(item.deploymentId),
    })
  }
  return result
}

export function enqueueCloudComputerBuddyIdentityCleanup(
  configSnapshot: Record<string, unknown>,
  cleanup: Omit<CloudComputerBuddyIdentityCleanup, 'requestedAt'> & { requestedAt?: string },
): Record<string, unknown> {
  const cloudComputer = isRecord(configSnapshot.cloudComputer) ? configSnapshot.cloudComputer : {}
  const current = cloudComputerBuddyIdentityCleanupQueue(configSnapshot)
  const next = [
    ...current.filter((item) => item.agentId !== cleanup.agentId),
    {
      ...cleanup,
      requestedAt: cleanup.requestedAt ?? new Date().toISOString(),
    },
  ]
  return {
    ...configSnapshot,
    cloudComputer: {
      ...cloudComputer,
      buddyIdentityCleanup: next,
    },
  }
}

export function retainCloudComputerBuddyIdentityCleanup(
  configSnapshot: unknown,
  retainedAgentIds: Set<string>,
): Record<string, unknown> | null {
  if (!isRecord(configSnapshot)) return null
  const runtime = isRecord(configSnapshot[CLOUD_SAAS_RUNTIME_KEY])
    ? configSnapshot[CLOUD_SAAS_RUNTIME_KEY]
    : null
  const declarative = extractCloudSaasRuntime(configSnapshot).configSnapshot
  if (!declarative) return null
  const cloudComputer = isRecord(declarative.cloudComputer) ? declarative.cloudComputer : {}
  const retained = cloudComputerBuddyIdentityCleanupQueue(configSnapshot).filter((item) =>
    retainedAgentIds.has(item.agentId),
  )
  const nextCloudComputer = { ...cloudComputer }
  if (retained.length > 0) {
    nextCloudComputer.buddyIdentityCleanup = retained
  } else {
    delete nextCloudComputer.buddyIdentityCleanup
  }
  return {
    ...declarative,
    cloudComputer: nextCloudComputer,
    ...(runtime ? { [CLOUD_SAAS_RUNTIME_KEY]: runtime } : {}),
  }
}

export async function setCloudComputerBuddyRuntimeState(
  container: AppContainer,
  deployment: CloudComputerDeploymentIdentity,
  action: 'pause' | 'resume',
) {
  const agentService = container.resolve('agentService')
  const agentDao = container.resolve('agentDao')
  const cloudComputerId = cloudComputerIdForDeployment(deployment)
  await Promise.all(
    extractCloudProvisionedBuddies(deployment.configSnapshot).map(async (buddy) => {
      const agent = await agentService.getById(buddy.agentId).catch(() => null)
      if (!agent) return
      const config = { ...(isRecord(agent.config) ? agent.config : {}) }
      if (action === 'pause') {
        if (agent.status !== 'running') return
        await agentDao.updateConfig(buddy.agentId, {
          ...config,
          cloudComputerPausedBy: cloudComputerId,
          cloudComputerResumeAfterPause: true,
        })
        await agentService.stop(buddy.agentId)
        return
      }
      if (
        config.cloudComputerPausedBy !== cloudComputerId ||
        config.cloudComputerResumeAfterPause !== true
      ) {
        return
      }
      delete config.cloudComputerPausedBy
      delete config.cloudComputerResumeAfterPause
      await agentDao.updateConfig(buddy.agentId, config)
      await agentService.start(buddy.agentId)
    }),
  )
}
