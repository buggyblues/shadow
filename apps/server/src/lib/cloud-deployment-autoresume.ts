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

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))]
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

export function triggerCloudDeploymentActivityForBuddyUsers(input: {
  container: AppContainer
  buddyUserIds: string[]
  logContext?: Record<string, unknown>
}) {
  const buddyUserIds = uniqueNonEmpty(input.buddyUserIds)
  if (buddyUserIds.length === 0) return
  void recordDeploymentActivityForBuddyUsers({
    deploymentDao: input.container.resolve('cloudDeploymentDao'),
    buddyUserIds,
  }).catch((err) => {
    logger.warn(
      { err, buddyUserIds, ...input.logContext },
      'Cloud deployment activity recording failed',
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
