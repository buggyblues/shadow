import { and, asc, desc, eq, ilike, lt } from 'drizzle-orm'
import type { Database } from '../db'
import { attachments, messages, reactions, threads, users } from '../db/schema'

export class MessageDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  private authorColumns = {
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    status: users.status,
    isBot: users.isBot,
  }

  async findById(id: string) {
    const result = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByChannelId(channelId: string, limit = 50, cursor?: string) {
    const conditions = [eq(messages.channelId, channelId)]
    if (cursor) {
      conditions.push(lt(messages.createdAt, new Date(cursor)))
    }

    const rows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(asc(messages.createdAt))
      .limit(limit)

    return rows.map((r) => ({ ...r.message, author: r.author }))
  }

  async findByThreadId(threadId: string, limit = 50, cursor?: string) {
    const conditions = [eq(messages.threadId, threadId)]
    if (cursor) {
      conditions.push(lt(messages.createdAt, new Date(cursor)))
    }

    const rows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(asc(messages.createdAt))
      .limit(limit)

    return rows.map((r) => ({ ...r.message, author: r.author }))
  }

  async create(data: {
    content: string
    channelId: string
    authorId: string
    threadId?: string
    replyToId?: string
  }) {
    const result = await this.db.insert(messages).values(data).returning()
    return result[0]
  }

  async update(id: string, content: string) {
    const result = await this.db
      .update(messages)
      .set({ content, isEdited: true, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning()
    return result[0] ?? null
  }

  async delete(id: string) {
    await this.db.delete(messages).where(eq(messages.id, id))
  }

  async search(query: string, options?: { serverId?: string; channelId?: string; limit?: number }) {
    const conditions = [ilike(messages.content, `%${query}%`)]
    if (options?.channelId) {
      conditions.push(eq(messages.channelId, options.channelId))
    }

    return this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options?.limit ?? 50)
  }

  // Attachments
  async createAttachment(data: {
    messageId: string
    filename: string
    url: string
    contentType: string
    size: number
    width?: number
    height?: number
  }) {
    const result = await this.db.insert(attachments).values(data).returning()
    return result[0]
  }

  async getAttachments(messageId: string) {
    return this.db.select().from(attachments).where(eq(attachments.messageId, messageId))
  }

  // Reactions
  async addReaction(messageId: string, userId: string, emoji: string) {
    const result = await this.db
      .insert(reactions)
      .values({ messageId, userId, emoji })
      .onConflictDoNothing()
      .returning()
    return result[0] ?? null
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    await this.db
      .delete(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji),
        ),
      )
  }

  async getReactions(messageId: string) {
    return this.db.select().from(reactions).where(eq(reactions.messageId, messageId))
  }

  // Pins
  async pinMessage(id: string) {
    const result = await this.db
      .update(messages)
      .set({ isPinned: true, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning()
    return result[0] ?? null
  }

  async unpinMessage(id: string) {
    const result = await this.db
      .update(messages)
      .set({ isPinned: false, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning()
    return result[0] ?? null
  }

  async findPinnedByChannelId(channelId: string) {
    const rows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(eq(messages.channelId, channelId), eq(messages.isPinned, true)))
      .orderBy(desc(messages.createdAt))

    return rows.map((r) => ({ ...r.message, author: r.author }))
  }

  // Threads
  async createThread(data: {
    name: string
    channelId: string
    parentMessageId: string
    creatorId: string
  }) {
    const result = await this.db.insert(threads).values(data).returning()
    return result[0]
  }

  async findThreadById(id: string) {
    const result = await this.db.select().from(threads).where(eq(threads.id, id)).limit(1)
    return result[0] ?? null
  }

  async findThreadsByChannelId(channelId: string) {
    return this.db
      .select()
      .from(threads)
      .where(and(eq(threads.channelId, channelId), eq(threads.isArchived, false)))
      .orderBy(desc(threads.createdAt))
  }

  async updateThread(id: string, data: Partial<{ name: string; isArchived: boolean }>) {
    const result = await this.db
      .update(threads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(threads.id, id))
      .returning()
    return result[0] ?? null
  }

  async deleteThread(id: string) {
    await this.db.delete(threads).where(eq(threads.id, id))
  }
}
