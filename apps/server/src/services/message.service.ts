import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { MessageDao } from '../dao/message.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  CreateThreadInput,
  InteractiveActionInput,
  ReactionInput,
  SendMessageInput,
  UpdateMessageInput,
  UpdateThreadInput,
} from '../validators/message.schema'
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

export class MessageService {
  constructor(
    private deps: {
      messageDao: MessageDao
      userDao: UserDao
      channelDao: ChannelDao
      agentDao: AgentDao
      agentDashboardDao: AgentDashboardDao
      workspaceService?: WorkspaceService
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
    attachment: { filename: string; url: string; contentType: string; size: number },
  ) {
    const workspaceNodeId = await this.createWorkspaceNodeForAttachment(
      channelId,
      messageId,
      attachment,
    )
    return this.deps.messageDao.createAttachment({
      messageId,
      filename: attachment.filename,
      url: attachment.url,
      contentType: attachment.contentType,
      size: attachment.size,
      workspaceNodeId,
    })
  }

  async getByChannelId(channelId: string, limit?: number, cursor?: string, viewerUserId?: string) {
    const result = await this.deps.messageDao.findByChannelId(channelId, limit, cursor)
    if (!viewerUserId) return result
    return {
      ...result,
      messages: await this.attachInteractiveStates(result.messages, viewerUserId),
    }
  }

  async getById(id: string, viewerUserId?: string) {
    const message = await this.deps.messageDao.findById(id)
    if (!message || !viewerUserId) return message
    return (await this.attachInteractiveStates([message], viewerUserId))[0] ?? message
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
    const message = await this.deps.messageDao.create({
      content: input.content,
      channelId,
      authorId,
      threadId: input.threadId,
      replyToId: input.replyToId,
      metadata: input.metadata,
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
        await this.createAttachmentForMessage(message.id, channelId, att)
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

    return {
      ...message,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarName: user.avatarUrl,
            status: user.status,
            isBot: user.isBot,
          }
        : null,
      attachments: messageAttachments,
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

    const updated = await this.deps.messageDao.update(id, input.content)

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

  async delete(id: string, userId: string) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only delete your own messages'), { status: 403 })
    }

    await this.deps.messageDao.delete(id)
    return message
  }

  /** Delete a message by id without ownership check (caller must verify authorization). */
  async deleteById(id: string) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    await this.deps.messageDao.delete(id)
    return message
  }

  // Threads
  async createThread(channelId: string, userId: string, input: CreateThreadInput) {
    const message = await this.deps.messageDao.findById(input.parentMessageId)
    if (!message) {
      throw Object.assign(new Error('Parent message not found'), { status: 404 })
    }

    return this.deps.messageDao.createThread({
      name: input.name,
      channelId,
      parentMessageId: input.parentMessageId,
      creatorId: userId,
    })
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
    input: { content: string; metadata?: Record<string, unknown> },
  ) {
    const thread = await this.deps.messageDao.findThreadById(threadId)
    if (!thread) {
      throw Object.assign(new Error('Thread not found'), { status: 404 })
    }
    if (thread.isArchived) {
      throw Object.assign(new Error('Thread is archived'), { status: 400 })
    }

    const message = await this.deps.messageDao.create({
      content: input.content,
      channelId: thread.channelId,
      authorId: userId,
      threadId,
      metadata: input.metadata,
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

  async getThreadMessages(threadId: string, limit?: number, cursor?: string) {
    return this.deps.messageDao.findByThreadId(threadId, limit, cursor)
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
