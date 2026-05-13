import type { ShadowChannelPolicy, ShadowMessage } from '@shadowob/sdk'
import { getShadowMessageMentions, mentionTargetsBot } from '../mentions.js'
import type { AgentChainMetadata, ShadowPolicyConfig, ShadowRuntimeLogger } from '../types.js'

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

export function evaluateShadowMessagePreflight(params: {
  message: ShadowMessage
  botUserId: string
  botUsername: string
  channelPolicies: Map<string, ShadowChannelPolicy>
  runtime: ShadowRuntimeLogger
}): ShadowMessagePreflightResult {
  const { message, botUserId, botUsername, channelPolicies, runtime } = params
  const senderLabel = message.author?.username ?? message.authorId

  if (message.authorId === botUserId) {
    return { ok: false, reason: `[msg] Skipping own message ${message.id}` }
  }

  const policy = channelPolicies.get(message.channelId)
  const policyConfig = policy?.config as ShadowPolicyConfig | undefined
  let isProcessingBuddyMessage = false

  if (message.author?.isBot) {
    if (!policyConfig?.replyToBuddy) {
      return {
        ok: false,
        reason: `[msg] Skipping bot message from ${senderLabel} (replyToBuddy=false) (${message.id})`,
      }
    }

    const maxDepth = policyConfig.maxBuddyChainDepth ?? 3
    const chainMeta = (message as { metadata?: { agentChain?: AgentChainMetadata } }).metadata
      ?.agentChain
    if (chainMeta) {
      if (chainMeta.depth >= maxDepth) {
        return {
          ok: false,
          reason: `[msg] Buddy chain depth ${chainMeta.depth} >= max ${maxDepth}, stopping loop (${message.id})`,
        }
      }

      if (chainMeta.participants?.includes(botUserId)) {
        return {
          ok: false,
          reason: `[msg] Already in buddy chain [${chainMeta.participants.join(', ')}], skipping to prevent loop (${message.id})`,
        }
      }

      const senderAgentId = message.author?.id
      if (senderAgentId && policyConfig.buddyBlacklist?.includes(senderAgentId)) {
        return {
          ok: false,
          reason: `[msg] Sender agent ${senderAgentId} is in blacklist, skipping (${message.id})`,
        }
      }

      if (
        senderAgentId &&
        policyConfig.buddyWhitelist?.length &&
        !policyConfig.buddyWhitelist.includes(senderAgentId)
      ) {
        return {
          ok: false,
          reason: `[msg] Sender agent ${senderAgentId} not in whitelist, skipping (${message.id})`,
        }
      }
    }

    isProcessingBuddyMessage = true
    runtime.log?.(
      `[msg] Processing bot message from ${senderLabel} (replyToBuddy=true) (${message.id})`,
    )
  }

  if (policy && !policy.listen) {
    return {
      ok: false,
      reason: `[msg] Policy blocks listen for channel ${message.channelId}, skipping`,
    }
  }

  if (policy && !policy.reply) {
    return {
      ok: false,
      reason: `[msg] Policy blocks reply for channel ${message.channelId}, skipping (${message.id})`,
    }
  }

  const triggerUserIds = normalizeTriggerUserIds(policyConfig)
  if (triggerUserIds && !triggerUserIds.includes(message.authorId)) {
    return {
      ok: false,
      reason: `[msg] Sender ${senderLabel} is not the Buddy owner or active tenant, skipping (${message.id})`,
    }
  }

  const structuredMentions = getShadowMessageMentions(message)
  const escapedBotUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBotUsername}(?:\\s|$)`, 'i')
  const wasMentionedExplicitly =
    mentionTargetsBot({ mentions: structuredMentions, botUserId, botUsername }) ||
    mentionRegex.test(message.content)

  if (policy?.mentionOnly && !wasMentionedExplicitly) {
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
