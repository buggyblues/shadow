import type { MessageMention } from '@shadowob/shared'
import type { AppContainer } from '../container'
import {
  recordDeploymentActivityForBuddyUsers,
  resumePausedDeploymentsForBuddyUsers,
} from './cloud-deployment-processor'
import { logger } from './logger'

export function extractCloudResumeTargetUserIds(mentions: MessageMention[]): string[] {
  return [
    ...new Set(
      mentions
        .filter((mention) => mention.kind === 'buddy' || mention.kind === 'user')
        .map((mention) => mention.userId ?? mention.targetId)
        .filter((value): value is string => typeof value === 'string' && value.trim() !== ''),
    ),
  ]
}

type AppCloudResumeSource = {
  id?: string
  channelId?: string | null
  settings?: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))]
}

export function extractCloudResumeTargetUserIdsFromAppSettings(
  settings: Record<string, unknown> | null | undefined,
): string[] {
  if (!settings) return []

  const cloudAutoResume = asRecord(settings.cloudAutoResume)
  const cloudDeployment = asRecord(settings.cloudDeployment)
  const cloud = asRecord(settings.cloud)

  return uniqueNonEmpty([
    ...stringList(settings.cloudAutoResumeUserIds),
    ...stringList(settings.cloudAutoResumeBuddyUserIds),
    ...stringList(cloudAutoResume?.userIds),
    ...stringList(cloudAutoResume?.buddyUserIds),
    ...stringList(cloudDeployment?.userIds),
    ...stringList(cloudDeployment?.buddyUserIds),
    ...stringList(cloud?.userIds),
    ...stringList(cloud?.buddyUserIds),
  ])
}

function appSettingsAllowsChannelBotInference(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  if (!settings) return false
  if (settings.cloudAutoResume === true || settings.cloudAutoResumeInferChannelBots === true) {
    return true
  }
  const cloudAutoResume = asRecord(settings.cloudAutoResume)
  return cloudAutoResume?.enabled === true || cloudAutoResume?.inferChannelBots === true
}

export async function resolveCloudResumeTargetUserIdsForApp(input: {
  container: AppContainer
  app: AppCloudResumeSource
  includeChannelBotMembers?: boolean
}): Promise<string[]> {
  const settingsTargets = extractCloudResumeTargetUserIdsFromAppSettings(input.app.settings)
  const channelTargets: string[] = []
  const shouldInferChannelBots =
    input.includeChannelBotMembers || appSettingsAllowsChannelBotInference(input.app.settings)

  if (shouldInferChannelBots && input.app.channelId) {
    try {
      const channelMemberDao = input.container.resolve('channelMemberDao')
      const members = await channelMemberDao.getMembersWithUsers(input.app.channelId)
      for (const member of members) {
        const user = member.user
        if (user?.isBot && typeof user.id === 'string') {
          channelTargets.push(user.id)
        }
      }
    } catch (err) {
      logger.warn(
        { err, appId: input.app.id, channelId: input.app.channelId },
        'Failed to infer cloud auto-resume targets from app channel',
      )
    }
  }

  return uniqueNonEmpty([...settingsTargets, ...channelTargets])
}

export async function recordCloudDeploymentActivityAndResume(input: {
  container: AppContainer
  buddyUserIds: string[]
  reason: string
  at?: Date
}): Promise<number> {
  const buddyUserIds = uniqueNonEmpty(input.buddyUserIds)
  if (buddyUserIds.length === 0) return 0

  const deploymentDao = input.container.resolve('cloudDeploymentDao')
  const clusterDao = input.container.resolve('cloudClusterDao')
  await recordDeploymentActivityForBuddyUsers({
    deploymentDao,
    buddyUserIds,
    at: input.at,
  })
  return resumePausedDeploymentsForBuddyUsers({
    deploymentDao,
    clusterDao,
    buddyUserIds,
    reason: input.reason,
  })
}

export function triggerCloudDeploymentAutoResumeForBuddyUsers(input: {
  container: AppContainer
  buddyUserIds: string[]
  reason: string
  logContext?: Record<string, unknown>
}) {
  if (input.buddyUserIds.length === 0) return
  void recordCloudDeploymentActivityAndResume(input).catch((err) => {
    logger.warn(
      { err, buddyUserIds: input.buddyUserIds, reason: input.reason, ...input.logContext },
      'Cloud deployment auto-resume failed',
    )
  })
}

export type CloudDeploymentAutoResumeResult = {
  targetUserIds: string[]
  resumed: number
  timedOut: boolean
}

export async function waitCloudDeploymentAutoResumeForApp(input: {
  container: AppContainer
  app: AppCloudResumeSource
  reason: string
  includeChannelBotMembers?: boolean
  timeoutMs?: number
  logContext?: Record<string, unknown>
}): Promise<CloudDeploymentAutoResumeResult> {
  const runner = (async (): Promise<CloudDeploymentAutoResumeResult> => {
    const buddyUserIds = await resolveCloudResumeTargetUserIdsForApp({
      container: input.container,
      app: input.app,
      includeChannelBotMembers: input.includeChannelBotMembers,
    })
    if (buddyUserIds.length === 0) {
      return { targetUserIds: [], resumed: 0, timedOut: false }
    }
    const resumed = await recordCloudDeploymentActivityAndResume({
      container: input.container,
      buddyUserIds,
      reason: input.reason,
    })
    return { targetUserIds: buddyUserIds, resumed, timedOut: false }
  })()

  const timeoutMs = input.timeoutMs ?? 0
  if (timeoutMs <= 0) return runner

  let timeout: ReturnType<typeof setTimeout> | null = null
  const timedOut = new Promise<CloudDeploymentAutoResumeResult>((resolve) => {
    timeout = setTimeout(() => {
      resolve({ targetUserIds: [], resumed: 0, timedOut: true })
    }, timeoutMs)
  })

  const result = await Promise.race([runner, timedOut])
  if (timeout) clearTimeout(timeout)
  if (result.timedOut) {
    runner.catch((err) => {
      logger.warn(
        { err, appId: input.app.id, reason: input.reason, ...input.logContext },
        'Cloud deployment auto-resume from app finished after timeout with an error',
      )
    })
  }
  return result
}

export function triggerCloudDeploymentAutoResumeForApp(input: {
  container: AppContainer
  app: AppCloudResumeSource
  reason: string
  includeChannelBotMembers?: boolean
  logContext?: Record<string, unknown>
}) {
  void waitCloudDeploymentAutoResumeForApp(input).catch((err) => {
    logger.warn(
      { err, appId: input.app.id, reason: input.reason, ...input.logContext },
      'Cloud deployment auto-resume from app failed',
    )
  })
}

export function triggerCloudDeploymentAutoResumeForMentions(input: {
  container: AppContainer
  mentions: MessageMention[]
  reason: string
  logContext?: Record<string, unknown>
}) {
  const buddyUserIds = extractCloudResumeTargetUserIds(input.mentions)
  triggerCloudDeploymentAutoResumeForBuddyUsers({
    container: input.container,
    buddyUserIds,
    reason: input.reason,
    logContext: input.logContext,
  })
}
