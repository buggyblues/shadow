import type { MessageMention } from '@shadowob/shared'
import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { MessageDao } from '../dao/message.dao'
import type { UserDao } from '../dao/user.dao'
import type { MessageMetadata, TaskMessageCardMetadata } from '../db/schema/messages'
import { resolveAvatarUrl } from '../lib/avatar-url'
import type {
  CreateThreadInput,
  InteractiveActionInput,
  ReactionInput,
  SendMessageInput,
  UpdateMessageInput,
  UpdateThreadInput,
} from '../validators/message.schema'
import { parseBuddyInboxAgentId } from './buddy-inbox-protocol'
import type { ContentFeedService } from './content-feed.service'
import type { MediaService } from './media.service'
import type { VoiceMessageService } from './voice-message.service'
import type { WorkspaceService } from './workspace.service'

type MessageWithMetadata = {
  id: string
  metadata?: Record<string, unknown> | null
}

type MessageAuthorWithAvatar = {
  avatarUrl: string | null
}

type InteractiveSubmissionRecord = NonNullable<
  Awaited<ReturnType<MessageDao['findInteractiveSubmission']>>
>
type TaskCardReadStateRecord = Awaited<
  ReturnType<MessageDao['findTaskCardReadStatesForMessages']>
>[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getInteractiveBlockId(message: MessageWithMetadata): string | null {
  const interactive = message.metadata?.interactive
  if (!isRecord(interactive)) return null
  const id = (interactive as Record<string, unknown>).id
  return typeof id === 'string' && id.trim() ? id : null
}

function isTaskCardMetadata(value: unknown): value is TaskMessageCardMetadata {
  return (
    isRecord(value) &&
    value.kind === 'task' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string'
  )
}

function taskCardReadKey(messageId: string, cardId: string) {
  return `${messageId}:${cardId}`
}

function taskCardReadAtIso(state: TaskCardReadStateRecord | undefined) {
  return state?.readAt instanceof Date ? state.readAt.toISOString() : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function mentionedBuddyUserIds(mentions: MessageMention[]) {
  const ids = new Set<string>()
  for (const mention of mentions) {
    if (mention.kind !== 'buddy' && !(mention.kind === 'user' && mention.isBot)) continue
    const userId = mention.userId ?? mention.targetId
    if (userId) ids.add(userId)
  }
  return [...ids]
}

function buddyDiscussionThreadName(content: string) {
  const preview = content.replace(/\s+/g, ' ').trim().slice(0, 80)
  return preview || 'Buddy discussion'
}

function taskCardThreadId(card: TaskMessageCardMetadata) {
  const task = isRecord(card.data?.task) ? card.data.task : null
  return stringValue(task?.threadId)
}

function buildInteractiveState(sourceMessageId: string, blockId: string) {
  return {
    sourceMessageId,
    blockId,
    submitted: false,
  }
}

function buildSubmittedInteractiveState(submission: InteractiveSubmissionRecord) {
  return {
    sourceMessageId: submission.sourceMessageId,
    blockId: submission.blockId,
    submitted: true,
    response: {
      blockId: submission.blockId,
      sourceMessageId: submission.sourceMessageId,
      actionId: submission.actionId,
      value: submission.value,
      ...(submission.values ? { values: submission.values } : {}),
      submissionId: submission.id,
      responseMessageId: submission.responseMessageId,
      submittedAt: submission.createdAt.toISOString(),
    },
  }
}

function isTaskCard(card: unknown): card is TaskMessageCardMetadata {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return false
  const record = card as Record<string, unknown>
  return record.kind === 'task' && typeof record.id === 'string'
}

function isPollCard(card: unknown) {
  return isRecord(card) && card.kind === 'poll' && typeof card.pollId === 'string'
}

function hasPollCard(metadata: unknown) {
  if (!isRecord(metadata)) return false
  const cards = metadata.cards
  return Array.isArray(cards) && cards.some(isPollCard)
}

function isActiveTaskCard(card: TaskMessageCardMetadata) {
  return card.status === 'queued' || card.status === 'claimed' || card.status === 'running'
}

function isReplyableTaskCard(card: TaskMessageCardMetadata) {
  return isActiveTaskCard(card) || card.status === 'completed' || card.status === 'failed'
}

function isVoiceRecordingLike(attachment: {
  filename?: string
  contentType: string
  durationMs?: number | null
  waveformPeaks?: number[] | null
}) {
  return (
    attachment.contentType.startsWith('audio/') &&
    (typeof attachment.durationMs === 'number' ||
      Boolean(attachment.waveformPeaks?.length) ||
      /^voice[-_]\d+/i.test(attachment.filename ?? ''))
  )
}

function inferAttachmentKind(attachment: {
  filename?: string
  contentType: string
  kind?: 'file' | 'image' | 'voice'
  durationMs?: number | null
  waveformPeaks?: number[] | null
}): 'file' | 'image' | 'voice' {
  if (attachment.kind === 'voice' || isVoiceRecordingLike(attachment)) return 'voice'
  if (attachment.kind === 'image' || attachment.contentType.startsWith('image/')) return 'image'
  return 'file'
}

export class MessageService {
  constructor(
    private deps: {
      messageDao: MessageDao
      userDao: UserDao
      channelDao: ChannelDao
      agentDao: AgentDao
      agentDashboardDao: AgentDashboardDao
      workspaceService?: WorkspaceService
      voiceMessageService?: VoiceMessageService
      contentFeedService?: ContentFeedService
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
      io?: SocketIOServer
      logger?: Logger
    },
  ) {}

  private resolveAuthorAvatar<T extends { author?: (MessageAuthorWithAvatar & object) | null }>(
    message: T,
  ): T {
    if (!message.author) return message
    return {
      ...message,
      author: {
        ...message.author,
        avatarUrl: resolveAvatarUrl(this.deps.mediaService, message.author.avatarUrl),
      },
    }
  }

  private resolveAuthorAvatars<T extends { author?: (MessageAuthorWithAvatar & object) | null }>(
    messages: T[],
  ): T[] {
    return messages.map((message) => this.resolveAuthorAvatar(message))
  }

  private async assertBuddyReplyCollaboration(input: {
    channelId: string
    authorId: string
    threadId?: string
    replyToId?: string
  }) {
    if (!input.replyToId) return
    if (input.threadId) return
    const [author, replyToMessage] = await Promise.all([
      this.deps.userDao.findById(input.authorId),
      this.deps.messageDao.findById(input.replyToId),
    ])
    if (!author?.isBot || !replyToMessage) return
    const replyToAuthor = await this.deps.userDao.findById(replyToMessage.authorId)
    if (!replyToAuthor?.isBot) return

    const [authorBuddy, replyToBuddy, channel] = await Promise.all([
      this.deps.agentDao?.findByUserId(input.authorId),
      this.deps.agentDao?.findByUserId(replyToMessage.authorId),
      this.deps.channelDao?.findById(input.channelId),
    ])
    if (
      !authorBuddy ||
      !replyToBuddy ||
      parseBuddyInboxAgentId(channel?.topic) ||
      channel?.kind === 'dm'
    ) {
      return
    }
    throw Object.assign(new Error('Buddy-to-Buddy replies in the main channel must use a thread'), {
      status: 400,
    })
  }

  private async createWorkspaceNodeForAttachment(
    channelId: string,
    messageId: string,
    attachment: { filename: string; url: string; contentType: string; size: number },
  ): Promise<string | null> {
    try {
      if (!this.deps.workspaceService) return null
      const channel = await this.deps.channelDao.findById(channelId)
      if (!channel) return null
      if (channel.kind === 'dm' || !channel.serverId) return null
      const workspace = await this.deps.workspaceService.getOrCreateForServer(channel.serverId)
      const access =
        channel.isPrivate === true
          ? { scope: 'channel', serverId: channel.serverId, channelId }
          : { scope: 'server', serverId: channel.serverId }
      const node = await this.deps.workspaceService.createFile(workspace.id, {
        parentId: null,
        name: attachment.filename,
        mime: attachment.contentType,
        sizeBytes: attachment.size,
        contentRef: attachment.url,
        previewUrl: attachment.url,
        metadata: {
          source: 'channel_message_attachment',
          channelId,
          messageId,
          access,
        },
      })
      return node?.id ?? null
    } catch (err) {
      this.deps.logger?.warn?.(
        { err, channelId, messageId, filename: attachment.filename },
        'Failed to associate channel attachment with workspace',
      )
      return null
    }
  }

  async createAttachmentForMessage(
    messageId: string,
    channelId: string,
    attachment: {
      filename: string
      url: string
      contentType: string
      size: number
      kind?: 'file' | 'image' | 'voice'
      durationMs?: number | null
      audioCodec?: string | null
      audioContainer?: string | null
      waveformPeaks?: number[] | null
      waveformVersion?: number | null
    },
  ) {
    const workspaceNodeId = await this.createWorkspaceNodeForAttachment(
      channelId,
      messageId,
      attachment,
    )
    const created = await this.deps.messageDao.createAttachment({
      messageId,
      filename: attachment.filename,
      url: attachment.url,
      contentType: attachment.contentType,
      size: attachment.size,
      kind: inferAttachmentKind(attachment),
      durationMs: attachment.durationMs,
      audioCodec: attachment.audioCodec,
      audioContainer: attachment.audioContainer,
      waveformPeaks: attachment.waveformPeaks,
      waveformVersion: attachment.waveformVersion,
      workspaceNodeId,
    })
    if (!created) {
      throw Object.assign(new Error('Failed to create attachment'), { status: 500 })
    }
    return created
  }

  async getByChannelId(channelId: string, limit?: number, cursor?: string, viewerUserId?: string) {
    const result = await this.deps.messageDao.findByChannelId(channelId, limit, cursor)
    const messages = this.resolveAuthorAvatars(result.messages)
    if (!viewerUserId) return { ...result, messages }
    const messagesWithInteractiveState = await this.attachInteractiveStates(messages, viewerUserId)
    const messagesWithTaskCardReadStates = await this.attachTaskCardReadStates(
      messagesWithInteractiveState,
      viewerUserId,
    )
    return {
      ...result,
      messages:
        (await this.deps.voiceMessageService?.enrichMessagesForViewer(
          messagesWithTaskCardReadStates,
          viewerUserId,
        )) ?? messagesWithTaskCardReadStates,
    }
  }

  async getById(id: string, viewerUserId?: string) {
    const message = await this.deps.messageDao.findById(id)
    if (!message || !viewerUserId) return message
    const attachments = await this.deps.messageDao.getAttachments(id)
    const [messageWithInteractiveState] = await this.attachInteractiveStates(
      [{ ...message, attachments }],
      viewerUserId,
    )
    const [messageWithTaskCardReadState] = await this.attachTaskCardReadStates(
      messageWithInteractiveState ? [messageWithInteractiveState] : [],
      viewerUserId,
    )
    const [messageWithVoiceState] =
      (await this.deps.voiceMessageService?.enrichMessagesForViewer(
        messageWithTaskCardReadState ? [messageWithTaskCardReadState] : [],
        viewerUserId,
      )) ?? []
    return (
      messageWithVoiceState ??
      messageWithTaskCardReadState ??
      messageWithInteractiveState ??
      message
    )
  }

  async getWindowAroundMessage(
    channelId: string,
    messageId: string,
    limit?: number,
    viewerUserId?: string,
  ) {
    const result = await this.deps.messageDao.findWindowAroundMessage(channelId, messageId, limit)
    if (!result) return null
    const messages = this.resolveAuthorAvatars(result.messages)
    if (!viewerUserId) return { ...result, messages }
    const messagesWithInteractiveState = await this.attachInteractiveStates(messages, viewerUserId)
    const messagesWithTaskCardReadStates = await this.attachTaskCardReadStates(
      messagesWithInteractiveState,
      viewerUserId,
    )
    return {
      ...result,
      messages:
        (await this.deps.voiceMessageService?.enrichMessagesForViewer(
          messagesWithTaskCardReadStates,
          viewerUserId,
        )) ?? messagesWithTaskCardReadStates,
    }
  }

  async getInteractiveSubmission(sourceMessageId: string, blockId: string, userId: string) {
    return this.deps.messageDao.findInteractiveSubmission(sourceMessageId, blockId, userId)
  }

  async getInteractiveState(sourceMessageId: string, blockId: string, userId: string) {
    const submission = await this.deps.messageDao.findInteractiveSubmission(
      sourceMessageId,
      blockId,
      userId,
    )
    return submission
      ? buildSubmittedInteractiveState(submission)
      : buildInteractiveState(sourceMessageId, blockId)
  }

  async createInteractiveSubmission(
    sourceMessageId: string,
    blockId: string,
    userId: string,
    input: Pick<InteractiveActionInput, 'actionId' | 'values'> & { value: string },
  ) {
    return this.deps.messageDao.createInteractiveSubmission({
      sourceMessageId,
      blockId,
      userId,
      actionId: input.actionId,
      value: input.value,
      values: input.values,
    })
  }

  async updateInteractiveSubmissionResponse(submissionId: string, responseMessageId: string) {
    return this.deps.messageDao.updateInteractiveSubmissionResponse(submissionId, responseMessageId)
  }

  private async attachInteractiveStates<T extends MessageWithMetadata>(
    messages: T[],
    viewerUserId: string,
  ): Promise<T[]> {
    const interactiveMessages = messages
      .map((message) => ({ message, blockId: getInteractiveBlockId(message) }))
      .filter((entry): entry is { message: T; blockId: string } => Boolean(entry.blockId))
    if (interactiveMessages.length === 0) return messages

    const submissions = await this.deps.messageDao.findInteractiveSubmissionsForSources(
      interactiveMessages.map((entry) => entry.message.id),
      viewerUserId,
    )
    if (submissions.length === 0) return messages

    const byKey = new Map(
      submissions.map((submission) => {
        return [`${submission.sourceMessageId}:${submission.blockId}`, submission] as const
      }),
    )

    return messages.map((message) => {
      const blockId = getInteractiveBlockId(message)
      if (!blockId) return message
      const submission = byKey.get(`${message.id}:${blockId}`)
      if (!submission) return message

      return {
        ...message,
        metadata: {
          ...(message.metadata ?? {}),
          interactiveState: buildSubmittedInteractiveState(submission),
        },
      }
    })
  }

  private async attachTaskCardReadStates<T extends MessageWithMetadata>(
    messages: T[],
    viewerUserId: string,
  ): Promise<T[]> {
    const taskEntries = messages.flatMap((message) => {
      const cards = Array.isArray(message.metadata?.cards) ? message.metadata.cards : []
      return cards
        .filter(isTaskCardMetadata)
        .map((card) => ({ messageId: message.id, cardId: card.id }))
    })
    if (taskEntries.length === 0) return messages

    const states = await this.deps.messageDao.findTaskCardReadStatesForMessages(viewerUserId, [
      ...new Set(taskEntries.map((entry) => entry.messageId)),
    ])
    if (states.length === 0) return messages

    const byKey = new Map(
      states.map((state) => [taskCardReadKey(state.messageId, state.cardId), state] as const),
    )

    return messages.map((message) => {
      const cards = Array.isArray(message.metadata?.cards) ? message.metadata.cards : null
      if (!cards) return message

      let changed = false
      const nextCards = cards.map((card) => {
        if (!isTaskCardMetadata(card)) return card
        const viewerReadAt = taskCardReadAtIso(byKey.get(taskCardReadKey(message.id, card.id)))
        if (!viewerReadAt) return card
        changed = true
        const taskData = isRecord(card.data?.task) ? card.data.task : {}
        return {
          ...card,
          data: {
            ...(card.data ?? {}),
            task: {
              ...taskData,
              viewerReadAt,
            },
          },
        }
      })

      if (!changed) return message
      return {
        ...message,
        metadata: {
          ...(message.metadata ?? {}),
          cards: nextCards,
        },
      }
    })
  }

  private async inferInboxTaskReplyRoute(input: {
    channelId: string
    authorId: string
    replyToId?: string
  }): Promise<{ threadId?: string; replyToId?: string }> {
    const authorAgent = await this.deps.agentDao?.findByUserId?.(input.authorId)
    if (!authorAgent) return {}

    const matchesAuthorAgent = (card: TaskMessageCardMetadata) =>
      card.assignee?.userId === input.authorId || card.assignee?.agentId === authorAgent.id

    if (input.replyToId) {
      const replyTarget = await this.deps.messageDao.findById(input.replyToId)
      if (!replyTarget || replyTarget.channelId !== input.channelId) return {}
      if (replyTarget.threadId) return { threadId: replyTarget.threadId }

      const cards = Array.isArray(replyTarget.metadata?.cards) ? replyTarget.metadata.cards : []
      const card = cards.find(
        (item): item is TaskMessageCardMetadata =>
          isTaskCard(item) && isReplyableTaskCard(item) && matchesAuthorAgent(item),
      )
      const threadId = card ? taskCardThreadId(card) : undefined
      if (threadId) return { threadId, replyToId: input.replyToId }
    }

    const channel = await this.deps.channelDao.findById(input.channelId)
    const inboxAgentId = parseBuddyInboxAgentId(channel?.topic)
    if (inboxAgentId && inboxAgentId !== authorAgent.id) return {}
    if (!inboxAgentId) return {}

    const recent = await this.deps.messageDao.findByChannelId(input.channelId, 25)
    const candidates = [...recent.messages].reverse().flatMap((message) => {
      const cards = Array.isArray(message.metadata?.cards) ? message.metadata.cards : []
      return cards
        .filter(
          (card): card is TaskMessageCardMetadata =>
            isTaskCard(card) &&
            isReplyableTaskCard(card) &&
            matchesAuthorAgent(card) &&
            Boolean(taskCardThreadId(card)),
        )
        .map((card) => ({
          message,
          card,
          active: isActiveTaskCard(card),
        }))
    })

    const target =
      candidates.find((candidate) => candidate.active) ??
      candidates.find((candidate) => Boolean(candidate.card))
    const threadId = target ? taskCardThreadId(target.card) : undefined
    return threadId ? { threadId, replyToId: input.replyToId ?? target?.message.id } : {}
  }

  async send(channelId: string, authorId: string, input: SendMessageInput) {
    let threadId = input.threadId
    let replyToId = input.replyToId
    if (!threadId && input.replyToId) {
      const replyTarget = await this.deps.messageDao.findById(input.replyToId)
      if (replyTarget?.channelId === channelId && replyTarget.threadId) {
        threadId = replyTarget.threadId
      }
    }
    if (!threadId) {
      const taskReplyRoute = await this.inferInboxTaskReplyRoute({
        channelId,
        authorId,
        replyToId,
      })
      if (taskReplyRoute.threadId) {
        threadId = taskReplyRoute.threadId
        replyToId = taskReplyRoute.replyToId ?? replyToId
      }
    }

    if (threadId) {
      const thread = await this.deps.messageDao.findThreadById(threadId)
      if (!thread || thread.channelId !== channelId) {
        throw Object.assign(new Error('Thread not found'), { status: 404 })
      }
      if (thread.isArchived) {
        throw Object.assign(new Error('Thread is archived'), { status: 400 })
      }
    }

    const metadata =
      input.mentions && input.mentions.length > 0
        ? { ...(input.metadata ?? {}), mentions: input.mentions }
        : input.metadata
    await this.assertBuddyReplyCollaboration({
      channelId,
      authorId,
      threadId,
      replyToId,
    })
    const message = await this.deps.messageDao.create({
      content: input.content,
      channelId,
      authorId,
      threadId,
      replyToId,
      metadata,
    })
    if (!message) {
      throw Object.assign(new Error('Failed to create message'), { status: 500 })
    }

    // Update channel's lastMessageAt for sorting
    try {
      await this.deps.channelDao.updateLastMessageAt(channelId)
    } catch {
      // Non-critical: don't fail message creation if this fails
    }

    if (threadId) {
      await this.deps.messageDao.touchThread(threadId)
    }

    // Create attachment records if provided (pre-uploaded files)
    if (input.attachments && input.attachments.length > 0) {
      for (const att of input.attachments) {
        const attachmentKind = inferAttachmentKind(att)
        const createdAttachment = await this.createAttachmentForMessage(message.id, channelId, att)
        if (attachmentKind === 'voice' && this.deps.voiceMessageService) {
          if (att.transcriptText) {
            await this.deps.voiceMessageService.upsertTranscript({
              attachmentId: createdAttachment.id,
              userId: authorId,
              source: att.transcriptSource ?? 'client',
              text: att.transcriptText,
              language: att.transcriptLanguage,
            })
          } else if (this.deps.voiceMessageService.hasServerTranscriptProvider()) {
            await this.deps.voiceMessageService.requestServerTranscript({
              attachmentId: createdAttachment.id,
              userId: authorId,
              language: att.transcriptLanguage,
              waitForResult: true,
            })
          }
        }
      }
    }

    // Attach author info and attachments for broadcasting
    const user = await this.deps.userDao.findById(authorId)
    const messageAttachments = await this.deps.messageDao.getAttachments(message.id)

    // Track message stats for Buddy Dashboard if author is a bot
    if (user?.isBot) {
      try {
        const agent = await this.deps.agentDao.findByUserId(authorId)
        if (agent) {
          const getDateString = (date: Date): string => date.toISOString().slice(0, 10)
          await this.deps.agentDashboardDao.incrementMessageCount(
            agent.id,
            getDateString(new Date()),
          )
          await this.deps.agentDashboardDao.incrementHourlyMessage(agent.id, new Date().getHours())
          await this.deps.agentDashboardDao.createEvent(agent.id, 'message', {
            preview: input.content.substring(0, 100),
            channelId,
            messageId: message.id,
          })
        }
      } catch (err) {
        // Non-critical: don't fail message creation if stats tracking fails
        // But log for monitoring
        this.deps.logger?.warn?.(
          { err, agentId: authorId, messageId: message.id },
          'Failed to track dashboard stats',
        )
      }
    }

    await this.recordInboxTaskReplyFromBuddyReply({
      channelId,
      messageId: message.id,
      replyToId,
      authorId,
      authorLabel: user?.displayName ?? user?.username ?? authorId,
      content: input.content,
    })

    const responseMessage = this.resolveAuthorAvatar({
      ...message,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: user.status,
            isBot: user.isBot,
          }
        : null,
      attachments: messageAttachments,
    })
    const [enrichedResponseMessage] =
      (await this.deps.voiceMessageService?.enrichMessagesForViewer([responseMessage], authorId)) ??
      []

    this.deps.contentFeedService?.indexMessage(message.id).catch((err) => {
      this.deps.logger?.warn?.({ err, messageId: message.id }, 'Failed to index content feed item')
    })

    return enrichedResponseMessage
      ? this.resolveAuthorAvatar(enrichedResponseMessage)
      : responseMessage
  }

  private async recordInboxTaskReplyFromBuddyReply(input: {
    channelId: string
    messageId: string
    replyToId?: string
    authorId: string
    authorLabel: string
    content: string
  }) {
    try {
      const channel = await this.deps.channelDao.findById(input.channelId)
      const agentId = parseBuddyInboxAgentId(channel?.topic)
      if (!agentId) return
      const agent = await this.deps.agentDao.findById(agentId)
      if (!agent || agent.userId !== input.authorId) return

      let target = input.replyToId ? await this.deps.messageDao.findById(input.replyToId) : null
      if (target) {
        const metadata = (target.metadata ?? {}) as MessageMetadata
        const cards = Array.isArray(metadata.cards) ? metadata.cards : []
        const hasAssignableTask = cards.some(
          (card) =>
            isTaskCard(card) &&
            isReplyableTaskCard(card) &&
            (card.assignee?.userId === input.authorId || card.assignee?.agentId === agentId),
        )
        if (!hasAssignableTask) target = null
      }

      if (!target) {
        const recent = await this.deps.messageDao.findByChannelId(input.channelId, 25)
        const candidates = [...recent.messages].reverse().filter((message) => {
          if (message.id === input.messageId) return false
          const metadata = (message.metadata ?? {}) as MessageMetadata
          const cards = Array.isArray(metadata.cards) ? metadata.cards : []
          return cards.some((card) => {
            if (!isTaskCard(card) || !isReplyableTaskCard(card)) return false
            return card.assignee?.userId === input.authorId || card.assignee?.agentId === agentId
          })
        })
        target = candidates.length === 1 ? (candidates[0] ?? null) : null
      }
      if (!target) return

      const metadata = (target.metadata ?? {}) as MessageMetadata
      const cards = Array.isArray(metadata.cards) ? metadata.cards : []
      const now = new Date().toISOString()
      let changed = false
      let matched = false
      const nextCards = cards.map((card) => {
        if (!isTaskCard(card) || matched || !isReplyableTaskCard(card)) return card
        if (card.assignee?.userId !== input.authorId && card.assignee?.agentId !== agentId) {
          return card
        }
        matched = true
        const existingProgress = Array.isArray(card.progress) ? card.progress : []
        const actor = {
          kind: 'agent' as const,
          agentId,
          userId: input.authorId,
          label: input.authorLabel,
        }
        const nextCard = {
          ...card,
          updatedAt: now,
          progress: [
            ...existingProgress,
            {
              at: now,
              status: card.status,
              note: `Buddy replied: ${input.content.slice(0, 240)}`,
              actor,
            },
          ].slice(-100),
        }
        changed = true
        return nextCard
      })
      if (!changed) return
      const updated = await this.updateMetadata(target.id, {
        ...metadata,
        cards: nextCards,
      })
      this.deps.io?.to(`channel:${input.channelId}`).emit('message:updated', updated)
    } catch (err) {
      this.deps.logger?.warn?.(
        { err, channelId: input.channelId, messageId: input.messageId },
        'Failed to record Inbox task reply from Buddy reply',
      )
    }
  }

  async update(id: string, userId: string, input: UpdateMessageInput) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only edit your own messages'), { status: 403 })
    }
    if (hasPollCard(message.metadata)) {
      throw Object.assign(new Error('Poll messages cannot be edited'), { status: 400 })
    }

    const updated = await this.deps.messageDao.updateById(id, userId, input.content)

    // Attach author info and attachments for broadcasting
    const user = await this.deps.userDao.findById(userId)
    const messageAttachments = await this.deps.messageDao.getAttachments(id)
    return this.resolveAuthorAvatar({
      ...updated,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: user.status,
            isBot: user.isBot,
          }
        : null,
      attachments: messageAttachments,
    })
  }

  async updateMetadata(id: string, metadata: Record<string, unknown> | null) {
    const existing = await this.deps.messageDao.findById(id)
    if (!existing) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    const updated = await this.deps.messageDao.updateMetadata(id, metadata)
    const [user, messageAttachments] = await Promise.all([
      this.deps.userDao.findById(existing.authorId),
      this.deps.messageDao.getAttachments(id),
    ])

    return this.resolveAuthorAvatar({
      ...updated,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: user.status,
            isBot: user.isBot,
          }
        : null,
      attachments: messageAttachments,
    })
  }

  async delete(id: string, userId: string) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only delete your own messages'), { status: 403 })
    }

    await this.deps.messageDao.deleteById(id, userId)
    return message
  }

  /** Delete a message by id without ownership check (caller must verify authorization). */
  async deleteById(id: string) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    await this.deps.messageDao.deleteById(id, message.authorId)
    return message
  }

  // Threads
  async createThread(channelId: string, userId: string, input: CreateThreadInput) {
    const message = await this.deps.messageDao.findById(input.parentMessageId)
    if (!message) {
      throw Object.assign(new Error('Parent message not found'), { status: 404 })
    }
    if (message.channelId !== channelId) {
      throw Object.assign(new Error('Parent message does not belong to this channel'), {
        status: 400,
      })
    }

    return this.ensureThreadForMessage(input.parentMessageId, userId, { name: input.name })
  }

  async ensureThreadForMessage(
    parentMessageId: string,
    userId: string,
    input: { name?: string } = {},
  ) {
    const message = await this.deps.messageDao.findById(parentMessageId)
    if (!message) {
      throw Object.assign(new Error('Parent message not found'), { status: 404 })
    }
    if (message.threadId) {
      throw Object.assign(new Error('Cannot create a thread from a thread message'), {
        status: 400,
      })
    }

    const thread =
      (await this.deps.messageDao.findThreadByParentMessageId(parentMessageId)) ??
      (await this.deps.messageDao.createThread({
        name: input.name?.trim().slice(0, 100) || 'Thread',
        channelId: message.channelId,
        parentMessageId,
        creatorId: userId,
      }))

    if (!thread) {
      throw Object.assign(new Error('Failed to create thread'), { status: 500 })
    }
    await this.deps.messageDao.moveRepliesToThread(parentMessageId, thread.id)
    return thread
  }

  async tryEnsureMultiBuddyMentionThread(
    message: {
      id: string
      content: string
      channelId?: string | null
      threadId?: string | null
      metadata?: MessageMetadata | Record<string, unknown> | null
    },
    authorId: string,
    input: { channelKind?: string | null } = {},
  ) {
    if (message.threadId) return null

    let channelKind = input.channelKind
    if (channelKind === undefined && message.channelId) {
      channelKind = (await this.deps.channelDao?.findById(message.channelId))?.kind ?? null
    }
    if (channelKind === 'dm') return null

    const mentions = Array.isArray(message.metadata?.mentions)
      ? (message.metadata.mentions as MessageMention[])
      : []
    if (mentionedBuddyUserIds(mentions).length < 2) return null

    try {
      return await this.ensureThreadForMessage(message.id, authorId, {
        name: buddyDiscussionThreadName(message.content),
      })
    } catch (err) {
      this.deps.logger?.warn?.(
        { err, messageId: message.id, channelId: message.channelId },
        'Failed to ensure multi-Buddy mention thread',
      )
      return null
    }
  }

  async getThreadsByChannelId(channelId: string) {
    return this.deps.messageDao.findThreadsByChannelId(channelId)
  }

  async getThread(threadId: string) {
    const thread = await this.deps.messageDao.findThreadById(threadId)
    if (!thread) {
      throw Object.assign(new Error('Thread not found'), { status: 404 })
    }
    return thread
  }

  async updateThread(threadId: string, userId: string, input: UpdateThreadInput) {
    const thread = await this.deps.messageDao.findThreadById(threadId)
    if (!thread) {
      throw Object.assign(new Error('Thread not found'), { status: 404 })
    }
    if (thread.creatorId !== userId) {
      throw Object.assign(new Error('Can only update your own threads'), { status: 403 })
    }
    return this.deps.messageDao.updateThread(threadId, input)
  }

  async deleteThread(threadId: string, userId: string) {
    const thread = await this.deps.messageDao.findThreadById(threadId)
    if (!thread) {
      throw Object.assign(new Error('Thread not found'), { status: 404 })
    }
    if (thread.creatorId !== userId) {
      throw Object.assign(new Error('Can only delete your own threads'), { status: 403 })
    }
    await this.deps.messageDao.deleteThread(threadId)
  }

  async sendToThread(
    threadId: string,
    userId: string,
    input: {
      content: string
      replyToId?: string
      mentions?: SendMessageInput['mentions']
      metadata?: Record<string, unknown>
    },
  ) {
    const thread = await this.deps.messageDao.findThreadById(threadId)
    if (!thread) {
      throw Object.assign(new Error('Thread not found'), { status: 404 })
    }
    if (thread.isArchived) {
      throw Object.assign(new Error('Thread is archived'), { status: 400 })
    }

    const metadata =
      input.mentions && input.mentions.length > 0
        ? { ...(input.metadata ?? {}), mentions: input.mentions }
        : input.metadata
    await this.assertBuddyReplyCollaboration({
      channelId: thread.channelId,
      authorId: userId,
      replyToId: input.replyToId,
    })
    const message = await this.deps.messageDao.create({
      content: input.content,
      channelId: thread.channelId,
      authorId: userId,
      threadId,
      replyToId: input.replyToId,
      metadata,
    })
    if (!message) {
      throw Object.assign(new Error('Failed to create thread message'), { status: 500 })
    }

    await this.deps.messageDao.touchThread(threadId)

    const user = await this.deps.userDao.findById(userId)
    return this.resolveAuthorAvatar({
      ...message,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: user.status,
            isBot: user.isBot,
          }
        : null,
    })
  }

  async getThreadMessages(
    threadId: string,
    limit?: number,
    cursor?: string,
    viewerUserId?: string,
  ) {
    const messages = this.resolveAuthorAvatars(
      await this.deps.messageDao.findByThreadId(threadId, limit, cursor),
    )
    if (!viewerUserId) return messages
    const messagesWithInteractiveState = await this.attachInteractiveStates(messages, viewerUserId)
    return (
      (await this.deps.voiceMessageService?.enrichMessagesForViewer(
        messagesWithInteractiveState,
        viewerUserId,
      )) ?? messagesWithInteractiveState
    )
  }

  // Pins
  async pinMessage(channelId: string, messageId: string) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.channelId !== channelId) {
      throw Object.assign(new Error('Message does not belong to this channel'), { status: 400 })
    }
    return this.deps.messageDao.pinMessage(messageId)
  }

  async unpinMessage(channelId: string, messageId: string) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.channelId !== channelId) {
      throw Object.assign(new Error('Message does not belong to this channel'), { status: 400 })
    }
    return this.deps.messageDao.unpinMessage(messageId)
  }

  async getPinnedMessages(channelId: string) {
    return this.resolveAuthorAvatars(await this.deps.messageDao.findPinnedByChannelId(channelId))
  }

  // Reactions
  async addReaction(messageId: string, userId: string, input: ReactionInput) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }

    return this.deps.messageDao.addReaction(messageId, userId, input.emoji)
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    await this.deps.messageDao.removeReaction(messageId, userId, emoji)
  }

  async getReactions(messageId: string) {
    const raw = await this.deps.messageDao.getReactions(messageId)
    // Group by emoji: { emoji, count, userIds }
    const grouped = new Map<string, { emoji: string; count: number; userIds: string[] }>()
    for (const r of raw) {
      const existing = grouped.get(r.emoji)
      if (existing) {
        existing.count++
        existing.userIds.push(r.userId)
      } else {
        grouped.set(r.emoji, { emoji: r.emoji, count: 1, userIds: [r.userId] })
      }
    }
    return Array.from(grouped.values())
  }
}
