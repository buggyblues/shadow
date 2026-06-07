import type { AgentDao } from '../dao/agent.dao'
import type { BuddyCollaborationDao } from '../dao/buddy-collaboration.dao'
import type { MessageDao } from '../dao/message.dao'
import type { ChannelAccessService } from './channel-access.service'

export type ClaimBuddyReplyResult =
  | {
      ok: true
      collaborationId: string
      turn: number
      replyToId: string
      target: 'main' | 'thread'
      threadId?: string
      suggestedTextLimit: number
      replyDensity: 'short'
      metadata: {
        collaboration: {
          id: string
          rootMessageId: string
          buddyId: string
          turn: number
          target: 'main' | 'thread'
          threadId?: string
          suggestedTextLimit: number
          replyDensity: 'short'
        }
      }
    }
  | {
      ok: false
      reason: 'busy' | 'duplicate' | 'policy_denied' | 'limit_reached' | 'stopped'
    }

export class BuddyCollaborationService {
  constructor(
    private deps: {
      agentDao: AgentDao
      buddyCollaborationDao: BuddyCollaborationDao
      channelAccessService: ChannelAccessService
      messageDao: MessageDao
    },
  ) {}

  async claimBuddyReply(input: {
    channelId: string
    rootMessageId: string
    buddyId: string
    replyToMessageId: string
    actorUserId: string
    maxTurns?: number
    mode?: 'initial' | 'conversation'
    preferredTarget?: 'main' | 'thread'
  }): Promise<ClaimBuddyReplyResult> {
    const maxTurns = clampInt(input.maxTurns, 4, 1, 8)
    const agent = await this.deps.agentDao.findById(input.buddyId)
    if (!agent || agent.userId !== input.actorUserId) {
      return { ok: false, reason: 'policy_denied' }
    }

    const access = await this.deps.channelAccessService.getAccess(
      input.channelId,
      input.actorUserId,
    )
    if (!access.ok) {
      return { ok: false, reason: 'policy_denied' }
    }

    const [rootMessage, replyToMessage] = await Promise.all([
      this.deps.messageDao.findById(input.rootMessageId),
      this.deps.messageDao.findById(input.replyToMessageId),
    ])
    if (
      !rootMessage ||
      !replyToMessage ||
      rootMessage.channelId !== input.channelId ||
      replyToMessage.channelId !== input.channelId
    ) {
      return { ok: false, reason: 'policy_denied' }
    }

    const mentionedBuddyIds =
      input.mode === 'initial' ? await this.mentionedBuddyIdsFromRoot(rootMessage.metadata) : []
    if (
      input.mode === 'initial' &&
      mentionedBuddyIds.length > 0 &&
      !mentionedBuddyIds.includes(input.buddyId)
    ) {
      return { ok: false, reason: 'policy_denied' }
    }

    const claimed = await this.deps.buddyCollaborationDao.claim({
      channelId: input.channelId,
      rootMessageId: input.rootMessageId,
      buddyId: input.buddyId,
      replyToMessageId: input.replyToMessageId,
      maxTurns,
      ttlMs: 10 * 60 * 1000,
      ...(input.mode ? { mode: input.mode } : {}),
      ...(mentionedBuddyIds.length > 0 ? { mentionedBuddyIds } : {}),
    })

    if (!claimed.ok) {
      return { ok: false, reason: claimed.reason }
    }

    const target =
      input.preferredTarget === 'thread' ||
      (input.mode === 'initial' && mentionedBuddyIds.length >= 2) ||
      claimed.collaboration.turn > 1
        ? 'thread'
        : 'main'
    const suggestedTextLimit = target === 'main' ? 160 : 360
    const replyDensity = 'short' as const
    const threadId =
      target === 'thread'
        ? await this.ensureCollaborationThread({
            channelId: input.channelId,
            rootMessageId: input.rootMessageId,
            creatorUserId: input.actorUserId,
            existingThreadId: claimed.collaboration.threadId,
            rootContent: rootMessage.content,
          })
        : undefined

    return {
      ok: true,
      collaborationId: claimed.collaboration.id,
      turn: claimed.collaboration.turn,
      replyToId: input.replyToMessageId,
      target,
      ...(threadId ? { threadId } : {}),
      suggestedTextLimit,
      replyDensity,
      metadata: {
        collaboration: {
          id: claimed.collaboration.id,
          rootMessageId: input.rootMessageId,
          buddyId: input.buddyId,
          turn: claimed.collaboration.turn,
          target,
          ...(threadId ? { threadId } : {}),
          suggestedTextLimit,
          replyDensity,
        },
      },
    }
  }

  private async ensureCollaborationThread(input: {
    channelId: string
    rootMessageId: string
    creatorUserId: string
    existingThreadId?: string | null
    rootContent?: string | null
  }): Promise<string> {
    if (input.existingThreadId) return input.existingThreadId

    const thread =
      (await this.deps.messageDao.findThreadByParentMessageId(input.rootMessageId)) ??
      (await this.deps.messageDao.createThread({
        name: collaborationThreadName(input.rootContent),
        channelId: input.channelId,
        parentMessageId: input.rootMessageId,
        creatorId: input.creatorUserId,
      }))
    if (!thread) {
      throw Object.assign(new Error('Failed to create Buddy collaboration thread'), {
        status: 500,
      })
    }

    await this.deps.buddyCollaborationDao.setThreadId({
      channelId: input.channelId,
      rootMessageId: input.rootMessageId,
      threadId: thread.id,
    })

    return thread.id
  }

  private async mentionedBuddyIdsFromRoot(metadata: unknown): Promise<string[]> {
    const mentionedUserIds = mentionedBuddyUserIds(metadata)
    if (mentionedUserIds.length === 0) return []

    const buddies = await this.deps.agentDao.findByUserIds(mentionedUserIds)
    const buddyIdByUserId = new Map(buddies.map((buddy) => [buddy.userId, buddy.id]))
    return mentionedUserIds
      .map((userId) => buddyIdByUserId.get(userId))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function collaborationThreadName(content: string | null | undefined) {
  const preview = (content ?? '')
    .replace(/<[@#!][^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return preview ? preview.slice(0, 100) : 'Buddy collaboration'
}

function mentionedBuddyUserIds(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return []
  const mentions = (metadata as { mentions?: unknown }).mentions
  if (!Array.isArray(mentions)) return []

  const ids = new Set<string>()
  for (const mention of mentions) {
    if (!mention || typeof mention !== 'object') continue
    const item = mention as {
      kind?: unknown
      isBot?: unknown
      userId?: unknown
      targetId?: unknown
    }
    const isBuddyMention = item.kind === 'buddy' || (item.kind === 'user' && item.isBot === true)
    if (!isBuddyMention) continue
    const userId = typeof item.userId === 'string' ? item.userId : item.targetId
    if (typeof userId === 'string' && userId.length > 0) ids.add(userId)
  }
  return [...ids]
}
