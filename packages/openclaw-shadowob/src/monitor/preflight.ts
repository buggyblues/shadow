import type { ShadowChannelPolicy, ShadowMessage } from '@shadowob/sdk'
import {
  getShadowMessageMentions,
  mentionedBuddyIds,
  mentionsTargetSpaceApp,
  mentionTargetsBuddy,
} from '../mentions.js'
import type { ShadowPolicyConfig, ShadowRuntimeLogger } from '../types.js'
import { isActiveTaskCardForBuddy, type ShadowBuddyTaskIdentity } from './task-card-routing.js'

export type ShadowMessagePreflightOk = {
  ok: true
  senderLabel: string
  policy?: ShadowChannelPolicy
  policyConfig?: ShadowPolicyConfig
  isProcessingBuddyMessage: boolean
  wasMentionedExplicitly: boolean
}

export type ShadowMessagePreflightResult = ShadowMessagePreflightOk | { ok: false; reason: string }

function normalizeTriggerUserIds(policyConfig: ShadowPolicyConfig | undefined): string[] | null {
  const value = policyConfig?.allowedTriggerUserIds ?? policyConfig?.triggerUserIds
  if (!Array.isArray(value)) return null
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function messageHasActiveTaskForBuddy(message: ShadowMessage, identity: ShadowBuddyTaskIdentity) {
  const cards = message.metadata?.cards
  if (!Array.isArray(cards)) return false
  return cards.some((card) => isActiveTaskCardForBuddy(card, identity))
}

function hasAnyId(ids: string[], candidates: Array<string | undefined | null>) {
  return candidates.some((candidate) => candidate && ids.includes(candidate))
}

export function evaluateShadowMessagePreflight(params: {
  message: ShadowMessage
  buddyUserId: string
  buddyId?: string | null
  buddyUsername: string
  channelPolicies: Map<string, ShadowChannelPolicy>
  runtime: ShadowRuntimeLogger
  isRuntimeTaskThread?: boolean
}): ShadowMessagePreflightResult {
  const {
    message,
    buddyUserId,
    buddyId,
    buddyUsername,
    channelPolicies,
    runtime,
    isRuntimeTaskThread = false,
  } = params
  const senderLabel = message.author?.username ?? message.authorId

  if (message.authorId === buddyUserId) {
    return { ok: false, reason: `[msg] Skipping own message ${message.id}` }
  }

  const policy = channelPolicies.get(message.channelId)
  const policyConfig = policy?.config as ShadowPolicyConfig | undefined
  const hasActiveTaskForBuddy = messageHasActiveTaskForBuddy(message, { buddyUserId, buddyId })
  const hasRuntimeTaskContext = hasActiveTaskForBuddy || isRuntimeTaskThread
  const structuredMentions = getShadowMessageMentions(message)
  const hasExplicitBuddyMention = mentionedBuddyIds(structuredMentions).length > 0
  const escapedBuddyUsername = buddyUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBuddyUsername}(?:\\s|$)`, 'i')
  const wasBuddyMentionedExplicitly =
    mentionTargetsBuddy({ mentions: structuredMentions, buddyUserId, buddyUsername }) ||
    hasRuntimeTaskContext ||
    mentionRegex.test(message.content)
  const wasMentionedExplicitly =
    wasBuddyMentionedExplicitly || mentionsTargetSpaceApp(structuredMentions)
  const isHumanMentionOverride = wasBuddyMentionedExplicitly && !message.author?.isBot
  let isProcessingBuddyMessage = false

  if (!message.author?.isBot && hasExplicitBuddyMention && !wasBuddyMentionedExplicitly) {
    return {
      ok: false,
      reason: `[msg] Message explicitly mentions other Buddy targets, skipping (${message.id})`,
    }
  }

  if (message.author?.isBot) {
    const isThreadMessage = Boolean(message.threadId)
    if (policyConfig?.replyToBuddy === false && !hasRuntimeTaskContext && !isThreadMessage) {
      return {
        ok: false,
        reason: `[msg] Skipping Buddy message from ${senderLabel} (replyToBuddy=false) (${message.id})`,
      }
    }
    if (isThreadMessage && !hasRuntimeTaskContext && !wasBuddyMentionedExplicitly) {
      return {
        ok: false,
        reason: `[msg] Skipping Buddy thread message from ${senderLabel}; no explicit thread context for ${buddyUsername} (${message.id})`,
      }
    }

    const senderBuddyIds = [message.authorId, message.author?.id]
    if (
      policyConfig?.buddyBlacklist?.length &&
      hasAnyId(policyConfig.buddyBlacklist, senderBuddyIds)
    ) {
      return {
        ok: false,
        reason: `[msg] Sender Buddy ${senderLabel} is in blacklist, skipping (${message.id})`,
      }
    }

    if (
      policyConfig?.buddyWhitelist?.length &&
      !hasAnyId(policyConfig.buddyWhitelist, senderBuddyIds)
    ) {
      return {
        ok: false,
        reason: `[msg] Sender Buddy ${senderLabel} not in whitelist, skipping (${message.id})`,
      }
    }

    isProcessingBuddyMessage = true
    const triggerReason = hasRuntimeTaskContext
      ? 'active task-card'
      : isThreadMessage
        ? 'thread mention'
        : 'replyToBuddy=true'
    runtime.log?.(
      `[msg] Processing Buddy message from ${senderLabel} (${triggerReason}) (${message.id})`,
    )
  }

  if (policy && !policy.listen) {
    return {
      ok: false,
      reason: `[msg] Policy blocks listen for channel ${message.channelId}, skipping`,
    }
  }

  if (policy && !policy.reply && !isHumanMentionOverride) {
    return {
      ok: false,
      reason: `[msg] Policy blocks reply for channel ${message.channelId}, skipping (${message.id})`,
    }
  }

  const triggerUserIds = normalizeTriggerUserIds(policyConfig)
  if (
    triggerUserIds &&
    !triggerUserIds.includes(message.authorId) &&
    !hasRuntimeTaskContext &&
    !isHumanMentionOverride &&
    !isProcessingBuddyMessage
  ) {
    return {
      ok: false,
      reason: `[msg] Sender ${senderLabel} is not the Buddy owner or active tenant, skipping (${message.id})`,
    }
  }

  if (
    policy?.mentionOnly &&
    !wasMentionedExplicitly &&
    !isProcessingBuddyMessage &&
    !message.threadId
  ) {
    return {
      ok: false,
      reason: `[msg] Policy requires mention for channel ${message.channelId}, skipping (${message.id})`,
    }
  }

  return {
    ok: true,
    senderLabel,
    policy,
    policyConfig,
    isProcessingBuddyMessage,
    wasMentionedExplicitly,
  }
}
