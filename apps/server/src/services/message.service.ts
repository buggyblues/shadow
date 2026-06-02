import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { MessageDao } from '../dao/message.dao'
import type { UserDao } from '../dao/user.dao'
import type { MessageMetadata, TaskMessageCardMetadata } from '../db/schema/messages'
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
import type { VoiceMessageService } from './voice-message.service'
import type { WorkspaceService } from './workspace.service'

type MessageWithMetadata = {
  id: string
  metadata?: Record<string, unknown> | null
}

type InteractiveSubmissionRecord = NonNullable<
  Awaited<ReturnType<MessageDao['findInteractiveSubmission']>>
>

function getInteractiveBlockId(message: MessageWithMetadata): string | null {
  const interactive = message.metadata?.interactive
  if (!interactive || typeof interactive !== 'object' || Array.isArray(interactive)) return null
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
      io?: SocketIOServer
      logger?: Logger
    },
  ) {}

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
    if (!viewerUserId) return result
    const messagesWithInteractiveState = await this.attachInteractiveStates(
      result.messages,
      viewerUserId,
    )
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
    const metadata =
      input.mentions && input.mentions.length > 0
        ? { ...(input.metadata ?? {}), mentions: input.mentions }
        : input.metadata
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

    await this.completeInboxTaskFromBuddyReply({
      channelId,
      messageId: message.id,
      replyToId: input.replyToId,
      authorId,
      authorLabel: user?.displayName ?? user?.username ?? authorId,
      content: input.content,
    })

    const responseMessage = {
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
    }
    const [enrichedResponseMessage] =
      (await this.deps.voiceMessageService?.enrichMessagesForViewer([responseMessage], authorId)) ??
      []

    this.deps.contentFeedService?.indexMessage(message.id).catch((err) => {
      this.deps.logger?.warn?.({ err, messageId: message.id }, 'Failed to index content feed item')
    })

    return enrichedResponseMessage ?? responseMessage
  }

  private async completeInboxTaskFromBuddyReply(input: {
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
            isActiveTaskCard(card) &&
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
            if (!isTaskCard(card) || !isActiveTaskCard(card)) return false
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
      const nextCards = cards.map((card) => {
        if (!isTaskCard(card) || changed || !isActiveTaskCard(card)) return card
        if (card.assignee?.userId !== input.authorId && card.assignee?.agentId !== agentId) {
          return card
        }
        changed = true
        const {
          claim: _claim,
          capability: _capability,
          ...nextCard
        } = {
          ...card,
          status: 'completed' as const,
          updatedAt: now,
          progress: [
            ...(Array.isArray(card.progress) ? card.progress : []),
            {
              at: now,
              status: 'completed' as const,
              note: `Completed by Buddy reply: ${input.content.slice(0, 240)}`,
              actor: {
                kind: 'agent' as const,
                agentId,
                userId: input.authorId,
                label: input.authorLabel,
              },
            },
          ],
        }
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
        'Failed to complete Inbox task from Buddy reply',
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

    const updated = await this.deps.messageDao.updateById(id, userId, input.content)

    // Attach author info and attachments for broadcasting
    const user = await this.deps.userDao.findById(userId)
    const messageAttachments = await this.deps.messageDao.getAttachments(id)
    return {
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
    }
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

    return {
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
    }
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

    return this.deps.messageDao.createThread({
      name: input.name,
      channelId,
      parentMessageId: input.parentMessageId,
      creatorId: userId,
    })
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
    const message = await this.deps.messageDao.create({
      content: input.content,
      channelId: thread.channelId,
      authorId: userId,
      threadId,
      replyToId: input.replyToId,
      metadata,
    })

    const user = await this.deps.userDao.findById(userId)
    return {
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
    }
  }

  async getThreadMessages(
    threadId: string,
    limit?: number,
    cursor?: string,
    viewerUserId?: string,
  ) {
    const messages = await this.deps.messageDao.findByThreadId(threadId, limit, cursor)
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
    return this.deps.messageDao.findPinnedByChannelId(channelId)
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
