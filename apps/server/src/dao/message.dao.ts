import { and, asc, desc, eq, exists, ilike, inArray, lt } from 'drizzle-orm'
import type { Database } from '../db'
import {
  attachments,
  messageInteractiveSubmissions,
  messages,
  reactions,
  threads,
  users,
} from '../db/schema'

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

  async findInteractiveSubmission(sourceMessageId: string, blockId: string, userId: string) {
    const result = await this.db
      .select()
      .from(messageInteractiveSubmissions)
      .where(
        and(
          eq(messageInteractiveSubmissions.sourceMessageId, sourceMessageId),
          eq(messageInteractiveSubmissions.blockId, blockId),
          eq(messageInteractiveSubmissions.userId, userId),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findInteractiveSubmissionsForSources(sourceMessageIds: string[], userId: string) {
    if (sourceMessageIds.length === 0) return []
    return this.db
      .select()
      .from(messageInteractiveSubmissions)
      .where(
        and(
          inArray(messageInteractiveSubmissions.sourceMessageId, sourceMessageIds),
          eq(messageInteractiveSubmissions.userId, userId),
        ),
      )
      .orderBy(asc(messageInteractiveSubmissions.createdAt))
  }

  async createInteractiveSubmission(data: {
    sourceMessageId: string
    blockId: string
    userId: string
    actionId: string
    value: string
    values?: Record<string, string>
  }) {
    const result = await this.db
      .insert(messageInteractiveSubmissions)
      .values(data)
      .onConflictDoNothing()
      .returning()
    return result[0] ?? null
  }

  async updateInteractiveSubmissionResponse(id: string, responseMessageId: string) {
    const result = await this.db
      .update(messageInteractiveSubmissions)
      .set({ responseMessageId, updatedAt: new Date() })
      .where(eq(messageInteractiveSubmissions.id, id))
      .returning()
    return result[0] ?? null
  }

  async findByChannelId(channelId: string, limit = 50, cursor?: string) {
    const conditions = [eq(messages.channelId, channelId)]
    if (cursor) {
      conditions.push(lt(messages.createdAt, new Date(cursor)))
    }

    // Fetch one extra record to determine if there are more older messages
    const fetchLimit = limit + 1
    const rows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(fetchLimit)

    const hasMore = rows.length > limit
    const trimmed = rows.slice(0, limit).reverse() // oldest-to-newest for display
    const msgList = trimmed.map((r) => ({ ...r.message, author: r.author }))

    // Batch-fetch attachments for all messages
    if (msgList.length > 0) {
      const msgIds = msgList.map((m) => m.id)
      const atts = await this.db
        .select()
        .from(attachments)
        .where(inArray(attachments.messageId, msgIds))
      const attMap = new Map<string, typeof atts>()
      for (const att of atts) {
        const list = attMap.get(att.messageId) ?? []
        list.push(att)
        attMap.set(att.messageId, list)
      }
      return {
        messages: msgList.map((m) => ({ ...m, attachments: attMap.get(m.id) ?? [] })),
        hasMore,
      }
    }

    return {
      messages: msgList.map((m) => ({
        ...m,
        attachments: [] as (typeof attachments.$inferSelect)[],
      })),
      hasMore,
    }
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

    const msgList = rows.map((r) => ({ ...r.message, author: r.author }))

    // Batch-fetch attachments
    if (msgList.length > 0) {
      const msgIds = msgList.map((m) => m.id)
      const atts = await this.db
        .select()
        .from(attachments)
        .where(inArray(attachments.messageId, msgIds))
      const attMap = new Map<string, typeof atts>()
      for (const att of atts) {
        const list = attMap.get(att.messageId) ?? []
        list.push(att)
        attMap.set(att.messageId, list)
      }
      return msgList.map((m) => ({ ...m, attachments: attMap.get(m.id) ?? [] }))
    }

    return msgList.map((m) => ({ ...m, attachments: [] as (typeof attachments.$inferSelect)[] }))
  }

  async create(data: {
    content: string
    channelId: string
    authorId: string
    threadId?: string
    replyToId?: string
    metadata?: Record<string, unknown>
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

  async search(
    query: string,
    options?: {
      serverId?: string
      channelId?: string
      from?: string
      hasAttachment?: boolean
      limit?: number
    },
  ) {
    const conditions = [ilike(messages.content, `%${query}%`)]
    if (options?.channelId) {
      conditions.push(eq(messages.channelId, options.channelId))
    }
    if (options?.from) {
      conditions.push(eq(messages.authorId, options.from))
    }
    if (options?.hasAttachment) {
      conditions.push(
        exists(
          this.db
            .select({ x: attachments.id })
            .from(attachments)
            .where(eq(attachments.messageId, messages.id)),
        ),
      )
    }

    const rows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(options?.limit ?? 50)

    return rows.map((r) => ({
      ...r.message,
      author: r.author,
    }))
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
    workspaceNodeId?: string | null
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

    const msgList = rows.map((r) => ({ ...r.message, author: r.author }))

    // Batch-fetch attachments
    if (msgList.length > 0) {
      const msgIds = msgList.map((m) => m.id)
      const atts = await this.db
        .select()
        .from(attachments)
        .where(inArray(attachments.messageId, msgIds))
      const attMap = new Map<string, typeof atts>()
      for (const att of atts) {
        const list = attMap.get(att.messageId) ?? []
        list.push(att)
        attMap.set(att.messageId, list)
      }
      return msgList.map((m) => ({ ...m, attachments: attMap.get(m.id) ?? [] }))
    }

    return msgList.map((m) => ({ ...m, attachments: [] as (typeof attachments.$inferSelect)[] }))
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
