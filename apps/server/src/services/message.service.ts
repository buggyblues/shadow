import type { ChannelDao } from '../dao/channel.dao'
import type { MessageDao } from '../dao/message.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  CreateThreadInput,
  ReactionInput,
  SendMessageInput,
  UpdateMessageInput,
  UpdateThreadInput,
} from '../validators/message.schema'

export class MessageService {
  constructor(private deps: { messageDao: MessageDao; userDao: UserDao; channelDao: ChannelDao }) {}

  async getByChannelId(channelId: string, limit?: number, cursor?: string) {
    return this.deps.messageDao.findByChannelId(channelId, limit, cursor)
  }

  async getById(id: string) {
    return this.deps.messageDao.findById(id)
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
        await this.deps.messageDao.createAttachment({
          messageId: message.id,
          filename: att.filename,
          url: att.url,
          contentType: att.contentType,
          size: att.size,
        })
      }
    }

    // Attach author info and attachments for broadcasting
    const user = await this.deps.userDao.findById(authorId)
    const messageAttachments = await this.deps.messageDao.getAttachments(message.id)
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
