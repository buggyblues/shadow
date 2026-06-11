import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { BuddyCollaborationDao } from '../dao/buddy-collaboration.dao'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCollaborationMetadata(value: unknown): value is {
  id: string
  rootMessageId: string
  buddyId: string
  turn: number
  target?: 'main' | 'thread'
  threadId?: string
  suggestedTextLimit?: number
  replyDensity?: 'reaction' | 'short' | 'normal' | 'long'
} {
  if (!isRecord(value)) return false
  const suggestedTextLimit = value.suggestedTextLimit
  return (
    typeof value.id === 'string' &&
    typeof value.rootMessageId === 'string' &&
    typeof value.buddyId === 'string' &&
    Number.isInteger(value.turn) &&
    (value.target === undefined || value.target === 'main' || value.target === 'thread') &&
    (value.threadId === undefined || typeof value.threadId === 'string') &&
    (suggestedTextLimit === undefined ||
      (typeof suggestedTextLimit === 'number' &&
        Number.isInteger(suggestedTextLimit) &&
        suggestedTextLimit >= 0 &&
        suggestedTextLimit <= 2000)) &&
    (value.replyDensity === undefined ||
      value.replyDensity === 'reaction' ||
      value.replyDensity === 'short' ||
      value.replyDensity === 'normal' ||
      value.replyDensity === 'long')
  )
}

function getInteractiveBlockId(message: MessageWithMetadata): string | null {
  const interactive = message.metadata?.interactive
  if (!isRecord(interactive)) return null
  const id = (interactive as Record<string, unknown>).id
  return typeof id === 'string' && id.trim() ? id : null
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

function isActiveTaskCard(card: TaskMessageCardMetadata) {
  return card.status === 'queued' || card.status === 'claimed' || card.status === 'running'
}

function isReplyableTaskCard(card: TaskMessageCardMetadata) {
  return isActiveTaskCard(card) || card.status === 'completed' || card.status === 'failed'
}

function taskCardDataRecord(card: TaskMessageCardMetadata) {
  return card.data && typeof card.data === 'object' && !Array.isArray(card.data) ? card.data : null
}

function taskCardOutputContractRecord(card: TaskMessageCardMetadata) {
  return card.outputContract && typeof card.outputContract === 'object'
    ? (card.outputContract as Record<string, unknown>)
    : null
}

function taskCardReplyCompletionStatus(card: TaskMessageCardMetadata) {
  const outputContract = taskCardOutputContractRecord(card)
  const data = taskCardDataRecord(card)
  const policy: Record<string, unknown> | null = isRecord(outputContract?.completionPolicy)
    ? outputContract.completionPolicy
    : isRecord(data?.completionPolicy)
      ? data.completionPolicy
      : null
  if (!policy || policy.mode !== 'reply_terminal') return null
  return policy.status === 'failed' ? 'failed' : 'completed'
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
      buddyCollaborationDao: BuddyCollaborationDao
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
    replyToId?: string
    metadata?: Record<string, unknown>
  }) {
    if (!input.replyToId) return
    const [author, replyToMessage] = await Promise.all([
      this.deps.userDao.findById(input.authorId),
      this.deps.messageDao.findById(input.replyToId),
    ])
    if (!author?.isBot || !replyToMessage) return
    const replyToAuthor = await this.deps.userDao.findById(replyToMessage.authorId)
    if (!replyToAuthor?.isBot) return

    const collaboration = input.metadata?.collaboration
    if (!isCollaborationMetadata(collaboration)) {
      const [authorBuddy, replyToBuddy, channel] = await Promise.all([
        this.deps.agentDao?.findByUserId(input.authorId),
        this.deps.agentDao?.findByUserId(replyToMessage.authorId),
        this.deps.channelDao?.findById(input.channelId),
      ])
      if (!authorBuddy || !replyToBuddy || parseBuddyInboxAgentId(channel?.topic)) return
      throw Object.assign(new Error('Buddy-to-Buddy replies must claim collaboration first'), {
        status: 400,
      })
    }

    const [buddy, rootMessage, collaborationRecord] = await Promise.all([
      this.deps.agentDao.findByUserId(input.authorId),
      this.deps.messageDao.findById(collaboration.rootMessageId),
      this.deps.buddyCollaborationDao.findById(collaboration.id),
    ])

    const participants = collaborationRecord?.participants ?? []
    if (
      !buddy ||
      buddy.id !== collaboration.buddyId ||
      !rootMessage ||
      rootMessage.channelId !== input.channelId ||
      !collaborationRecord ||
      collaborationRecord.channelId !== input.channelId ||
      collaborationRecord.rootMessageId !== collaboration.rootMessageId ||
      collaborationRecord.turn < collaboration.turn ||
      !participants.includes(collaboration.buddyId)
    ) {
      throw Object.assign(new Error('Invalid Buddy collaboration claim'), { status: 400 })
    }
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
    return {
      ...result,
      messages:
        (await this.deps.voiceMessageService?.enrichMessagesForViewer(
          messagesWithInteractiveState,
          viewerUserId,
        )) ?? messagesWithInteractiveState,
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
    const [messageWithVoiceState] =
      (await this.deps.voiceMessageService?.enrichMessagesForViewer(
        messageWithInteractiveState ? [messageWithInteractiveState] : [],
        viewerUserId,
      )) ?? []
    return messageWithVoiceState ?? messageWithInteractiveState ?? message
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
    return {
      ...result,
      messages:
        (await this.deps.voiceMessageService?.enrichMessagesForViewer(
          messagesWithInteractiveState,
          viewerUserId,
        )) ?? messagesWithInteractiveState,
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

  async send(channelId: string, authorId: string, input: SendMessageInput) {
    if (input.threadId) {
      const thread = await this.deps.messageDao.findThreadById(input.threadId)
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
      replyToId: input.replyToId,
      metadata,
    })
    const message = await this.deps.messageDao.create({
      content: input.content,
      channelId,
      authorId,
      threadId: input.threadId,
      replyToId: input.replyToId,
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

    if (input.threadId) {
      await this.deps.messageDao.touchThread(input.threadId)
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
      replyToId: input.replyToId,
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
      let repliedTaskCard: TaskMessageCardMetadata | null = null
      const nextCards = cards.map((card) => {
        if (!isTaskCard(card) || matched || !isReplyableTaskCard(card)) return card
        if (card.assignee?.userId !== input.authorId && card.assignee?.agentId !== agentId) {
          return card
        }
        matched = true
        const existingReplies = Array.isArray(card.replies) ? card.replies : []
        if (existingReplies.some((reply) => reply.messageId === input.messageId)) return card
        const existingProgress = Array.isArray(card.progress) ? card.progress : []
        const actor = {
          kind: 'agent' as const,
          agentId,
          userId: input.authorId,
          label: input.authorLabel,
        }
        const replyCompletionStatus = isActiveTaskCard(card)
          ? taskCardReplyCompletionStatus(card)
          : null
        const nextStatus =
          replyCompletionStatus ??
          (card.status === 'queued' || card.status === 'claimed'
            ? ('running' as const)
            : card.status)
        const progressNotePrefix =
          replyCompletionStatus === 'failed'
            ? 'Buddy reply marked task failed'
            : replyCompletionStatus === 'completed'
              ? 'Buddy reply completed task'
              : 'Buddy replied'
        const nextCard = {
          ...card,
          status: nextStatus,
          updatedAt: now,
          replies: [
            ...existingReplies,
            {
              messageId: input.messageId,
              cardId: card.id,
              authorId: input.authorId,
              authorLabel: input.authorLabel,
              content: input.content.slice(0, 4000),
              createdAt: now,
              source: actor,
            },
          ].slice(-100),
          progress: [
            ...existingProgress,
            {
              at: now,
              status: nextStatus,
              note: `${progressNotePrefix}: ${input.content.slice(0, 240)}`,
              actor,
            },
          ].slice(-100),
        }
        changed = true
        if (replyCompletionStatus) {
          const { claim: _claim, capability: _capability, ...terminalCard } = nextCard
          repliedTaskCard = terminalCard
          return terminalCard
        }
        repliedTaskCard = nextCard
        return nextCard
      })
      if (!changed) return
      const updated = await this.updateMetadata(target.id, {
        ...metadata,
        cards: nextCards,
      })
      this.deps.io?.to(`channel:${input.channelId}`).emit('message:updated', updated)
      if (repliedTaskCard) {
        await this.notifyInboxTaskDispatcher({
          serverId: channel?.serverId ?? null,
          taskMessage: target,
          taskCard: repliedTaskCard,
          reply: input,
          responderAgentId: agentId,
        })
      }
    } catch (err) {
      this.deps.logger?.warn?.(
        { err, channelId: input.channelId, messageId: input.messageId },
        'Failed to record Inbox task reply from Buddy reply',
      )
    }
  }

  private async notifyInboxTaskDispatcher(input: {
    serverId: string | null
    taskMessage: { id: string; channelId: string; authorId: string }
    taskCard: TaskMessageCardMetadata
    reply: {
      channelId: string
      messageId: string
      authorId: string
      authorLabel: string
      content: string
    }
    responderAgentId: string
  }) {
    if (!input.serverId) return
    if (input.taskMessage.authorId === input.reply.authorId) return
    if (taskCardDataRecord(input.taskCard)?.taskReplyNotification === true) return
    if (input.taskCard.status !== 'completed' && input.taskCard.status !== 'failed') return

    const dispatcherAgent = await this.deps.agentDao.findByUserId(input.taskMessage.authorId)
    if (!dispatcherAgent) return
    const channels = await this.deps.channelDao.findByServerId(input.serverId)
    const dispatcherInbox = channels.find(
      (channel) => parseBuddyInboxAgentId(channel.topic) === dispatcherAgent.id,
    )
    if (!dispatcherInbox || dispatcherInbox.id === input.reply.channelId) return

    const idempotencyKey = [
      'inbox-task-reply',
      input.taskMessage.id,
      input.taskCard.id,
      input.reply.messageId,
    ].join(':')
    const recent = await this.deps.messageDao.findByChannelId(dispatcherInbox.id, 25)
    const alreadyNotified = recent.messages.some((message) => {
      const metadata = (message.metadata ?? {}) as MessageMetadata
      const custom = metadata.custom && typeof metadata.custom === 'object' ? metadata.custom : {}
      const notification =
        'inboxTaskReplyNotification' in custom &&
        custom.inboxTaskReplyNotification &&
        typeof custom.inboxTaskReplyNotification === 'object'
          ? (custom.inboxTaskReplyNotification as Record<string, unknown>)
          : null
      if (notification?.idempotencyKey === idempotencyKey) return true
      const cards = Array.isArray(metadata.cards) ? metadata.cards : []
      return cards.some((card) => {
        if (!isTaskCard(card)) return false
        return taskCardDataRecord(card)?.idempotencyKey === idempotencyKey
      })
    })
    if (alreadyNotified) return

    const now = new Date().toISOString()
    const resource =
      input.taskCard.source &&
      typeof input.taskCard.source === 'object' &&
      'resource' in input.taskCard.source
        ? input.taskCard.source.resource
        : undefined
    const taskTitle = `Review reply: ${input.taskCard.title}`
    const taskBody = [
      `${input.reply.authorLabel} replied to delegated Inbox task "${input.taskCard.title}".`,
      'Open the referenced message to review the full response in context.',
    ].join('\n')
    const notification = await this.send(dispatcherInbox.id, input.reply.authorId, {
      content: taskBody,
      metadata: {
        cards: [
          {
            id: `ref-${input.reply.messageId}`,
            kind: 'message_reference',
            version: 1,
            title: input.taskCard.title,
            description: input.reply.content.slice(0, 600),
            label: input.reply.authorLabel,
            target: {
              channelId: input.reply.channelId,
              messageId: input.reply.messageId,
              taskCardId: input.taskCard.id,
              inboxAgentId: input.responderAgentId,
              kind: 'inbox_message',
            },
            source: {
              kind: 'agent',
              id: input.responderAgentId,
              agentId: input.responderAgentId,
              label: input.reply.authorLabel,
              ...(resource ? { resource } : {}),
            },
            createdAt: now,
          },
        ],
        custom: {
          inboxTaskReplyNotification: {
            kind: 'inbox_task_reply_notification',
            idempotencyKey,
            replyMessageId: input.reply.messageId,
            replyChannelId: input.reply.channelId,
            replyAuthorId: input.reply.authorId,
            replyAuthorLabel: input.reply.authorLabel,
            responderAgentId: input.responderAgentId,
            originalTaskMessageId: input.taskMessage.id,
            originalTaskCardId: input.taskCard.id,
            originalTaskTitle: input.taskCard.title,
            originalTaskStatus: input.taskCard.status,
            title: taskTitle,
            ...(resource ? { resource } : {}),
          },
        },
      } as SendMessageInput['metadata'],
    })
    this.deps.io?.to(`channel:${dispatcherInbox.id}`).emit('message:new', notification)
  }

  async update(id: string, userId: string, input: UpdateMessageInput) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only edit your own messages'), { status: 403 })
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

    const thread = await this.deps.messageDao.createThread({
      name: input.name,
      channelId,
      parentMessageId: input.parentMessageId,
      creatorId: userId,
    })
    if (!thread) {
      throw Object.assign(new Error('Failed to create thread'), { status: 500 })
    }
    return thread
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
      metadata,
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
