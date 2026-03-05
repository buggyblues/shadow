import type { MessageDao } from '../dao/message.dao'
import type { UserDao } from '../dao/user.dao'
import type {
  CreateThreadInput,
  ReactionInput,
  SendMessageInput,
  UpdateMessageInput,
} from '../validators/message.schema'

export class MessageService {
  constructor(private deps: { messageDao: MessageDao; userDao: UserDao }) {}

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
    })

    // Attach author info for broadcasting
    const user = await this.deps.userDao.findById(authorId)
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

  async update(id: string, userId: string, input: UpdateMessageInput) {
    const message = await this.deps.messageDao.findById(id)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only edit your own messages'), { status: 403 })
    }

    return this.deps.messageDao.update(id, input.content)
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

  async getThreadMessages(threadId: string, limit?: number, cursor?: string) {
    return this.deps.messageDao.findByThreadId(threadId, limit, cursor)
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
    return this.deps.messageDao.getReactions(messageId)
  }
}
