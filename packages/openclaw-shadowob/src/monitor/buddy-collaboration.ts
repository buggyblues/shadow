import type {
  ShadowBuddyReplyClaimInput,
  ShadowBuddyReplyClaimResult,
  ShadowMessage,
} from '@shadowob/sdk'
import type { BuddyCollaborationMetadata } from '../types.js'

export type BuddyCollaborationClaimClient = {
  claimBuddyReply(input: ShadowBuddyReplyClaimInput): Promise<ShadowBuddyReplyClaimResult>
}

export type BuddyCollaborationClaimContext = {
  collaboration: BuddyCollaborationMetadata
  replyToId: string
  target: 'main' | 'thread'
  threadId?: string
}

export type BuddyCollaborationRuntimeClaimResult =
  | {
      ok: true
      claimed: false
    }
  | ({
      ok: true
      claimed: true
    } & BuddyCollaborationClaimContext)
  | {
      ok: false
      mode: 'initial' | 'conversation'
      reason: string
      error?: unknown
    }

function messageCollaboration(message: ShadowMessage): BuddyCollaborationMetadata | undefined {
  return message.metadata?.collaboration as BuddyCollaborationMetadata | undefined
}

function claimContext(
  claim: Extract<ShadowBuddyReplyClaimResult, { ok: true }>,
): BuddyCollaborationClaimContext {
  return {
    collaboration: claim.metadata.collaboration,
    replyToId: claim.replyToId,
    target: claim.target,
    ...(claim.threadId ? { threadId: claim.threadId } : {}),
  }
}

export async function claimBuddyCollaborationForRuntime(params: {
  client: BuddyCollaborationClaimClient
  message: ShadowMessage
  channelId: string
  agentId: string | null | undefined
  maxTurns?: number
  isProcessingBuddyMessage: boolean
  hasRuntimeTaskCard: boolean
}): Promise<BuddyCollaborationRuntimeClaimResult> {
  const {
    client,
    message,
    channelId,
    agentId,
    maxTurns,
    isProcessingBuddyMessage,
    hasRuntimeTaskCard,
  } = params
  if (!agentId || hasRuntimeTaskCard) return { ok: true, claimed: false }

  if (!isProcessingBuddyMessage) {
    try {
      const claim = await client.claimBuddyReply({
        channelId,
        rootMessageId: message.id,
        buddyId: agentId,
        replyToMessageId: message.id,
        maxTurns,
        mode: 'initial',
      })
      if (!claim.ok) {
        return { ok: false, mode: 'initial', reason: claim.reason }
      }
      return { ok: true, claimed: true, ...claimContext(claim) }
    } catch (error) {
      return { ok: false, mode: 'initial', reason: 'failed', error }
    }
  }

  const collaboration = messageCollaboration(message)
  if (!collaboration?.rootMessageId) {
    return { ok: false, mode: 'conversation', reason: 'missing_collaboration' }
  }

  try {
    const claim = await client.claimBuddyReply({
      channelId,
      rootMessageId: collaboration.rootMessageId,
      buddyId: agentId,
      replyToMessageId: message.id,
      maxTurns,
      mode: 'conversation',
    })
    if (!claim.ok) {
      return { ok: false, mode: 'conversation', reason: claim.reason }
    }
    return { ok: true, claimed: true, ...claimContext(claim) }
  } catch (error) {
    return { ok: false, mode: 'conversation', reason: 'failed', error }
  }
}
