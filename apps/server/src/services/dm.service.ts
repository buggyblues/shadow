import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'
import type { Database } from '../db'
import { dmAttachments, dmChannels, dmMessages, dmReactions, users } from '../db/schema'

export class DmService {
  constructor(private deps: { db: Database }) {}

  async getOrCreateChannel(userAId: string, userBId: string) {
    // Ensure consistent ordering
    const [first, second] = userAId < userBId ? [userAId, userBId] : [userBId, userAId]

    const existing = await this.deps.db
      .select()
      .from(dmChannels)
      .where(and(eq(dmChannels.userAId, first), eq(dmChannels.userBId, second)))
      .limit(1)

    if (existing[0]) {
      return existing[0]
    }

    const result = await this.deps.db
      .insert(dmChannels)
      .values({ userAId: first, userBId: second })
      .returning()
    return result[0]
  }

  async getUserChannels(userId: string) {
    const channels = await this.deps.db
      .select()
      .from(dmChannels)
      .where(or(eq(dmChannels.userAId, userId), eq(dmChannels.userBId, userId)))

    if (channels.length === 0) return []

    // Batch-fetch all other-user IDs to avoid N+1
    const otherIds = channels.map((ch) => (ch.userAId === userId ? ch.userBId : ch.userAId))
    const uniqueIds = [...new Set(otherIds)]
    const otherUsers = await this.deps.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        status: users.status,
        isBot: users.isBot,
      })
      .from(users)
      .where(inArray(users.id, uniqueIds))

    const userMap = new Map(otherUsers.map((u) => [u.id, u]))

    return channels.map((ch) => {
      const otherId = ch.userAId === userId ? ch.userBId : ch.userAId
      return { ...ch, otherUser: userMap.get(otherId) ?? null }
    })
  }

  async getChannelById(id: string) {
    const result = await this.deps.db
      .select()
      .from(dmChannels)
      .where(eq(dmChannels.id, id))
      .limit(1)
    return result[0] ?? null
  }

  /** Check if a user is a participant of a DM channel */
  async isParticipant(dmChannelId: string, userId: string): Promise<boolean> {
    const channel = await this.getChannelById(dmChannelId)
    if (!channel) return false
    return channel.userAId === userId || channel.userBId === userId
  }

  async getMessages(dmChannelId: string, limit = 50, cursor?: string) {
    const conditions = [eq(dmMessages.dmChannelId, dmChannelId)]

    if (cursor) {
      conditions.push(lt(dmMessages.createdAt, new Date(cursor)))
    }

    const rows = await this.deps.db
      .select()
      .from(dmMessages)
      .where(and(...conditions))
      .orderBy(desc(dmMessages.createdAt))
      .limit(limit)

    if (rows.length === 0) return []

    const msgIds = rows.map((r) => r.id)

    // Batch-fetch authors, attachments, and reactions to avoid N+1
    const authorIds = [...new Set(rows.map((r) => r.authorId))]
    const [authors, atts, rxns] = await Promise.all([
      this.deps.db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          isBot: users.isBot,
        })
        .from(users)
        .where(inArray(users.id, authorIds)),
      this.deps.db.select().from(dmAttachments).where(inArray(dmAttachments.dmMessageId, msgIds)),
      this.deps.db.select().from(dmReactions).where(inArray(dmReactions.dmMessageId, msgIds)),
    ])

    const authorMap = new Map(authors.map((a) => [a.id, a]))

    const attMap = new Map<string, (typeof atts)[number][]>()
    for (const att of atts) {
      const list = attMap.get(att.dmMessageId) ?? []
      list.push(att)
      attMap.set(att.dmMessageId, list)
    }

    // Group reactions: { emoji, count, userIds }
    const rxnMap = new Map<string, { emoji: string; count: number; userIds: string[] }[]>()
    for (const r of rxns) {
      const groups = rxnMap.get(r.dmMessageId) ?? []
      const existing = groups.find((g) => g.emoji === r.emoji)
      if (existing) {
        existing.count++
        existing.userIds.push(r.userId)
      } else {
        groups.push({ emoji: r.emoji, count: 1, userIds: [r.userId] })
      }
      rxnMap.set(r.dmMessageId, groups)
    }

    return rows.map((msg) => ({
      ...msg,
      author: authorMap.get(msg.authorId) ?? undefined,
      attachments: attMap.get(msg.id) ?? [],
      reactions: rxnMap.get(msg.id) ?? [],
    }))
  }

  async getMessageById(id: string) {
    const result = await this.deps.db
      .select()
      .from(dmMessages)
      .where(eq(dmMessages.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async sendMessage(
    dmChannelId: string,
    authorId: string,
    content: string,
    replyToId?: string,
    attachmentInputs?: { filename: string; url: string; contentType: string; size: number }[],
    metadata?: Record<string, unknown>,
  ) {
    const result = await this.deps.db
      .insert(dmMessages)
      .values({ content, dmChannelId, authorId, replyToId: replyToId ?? null, metadata })
      .returning()

    // Update last_message_at
    await this.deps.db
      .update(dmChannels)
      .set({ lastMessageAt: new Date() })
      .where(eq(dmChannels.id, dmChannelId))

    // Create attachment records if provided
    const messageAttachments: (typeof dmAttachments.$inferSelect)[] = []
    if (attachmentInputs && attachmentInputs.length > 0) {
      for (const att of attachmentInputs) {
        const rows = await this.deps.db
          .insert(dmAttachments)
          .values({ dmMessageId: result[0].id, ...att })
          .returning()
        if (rows[0]) messageAttachments.push(rows[0])
      }
    }

    // Enrich with author info
    const author = await this.deps.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isBot: users.isBot,
      })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1)

    return {
      ...result[0],
      author: author[0] ?? undefined,
      attachments: messageAttachments,
      reactions: [] as { emoji: string; count: number; userIds: string[] }[],
    }
  }

  /** Edit a DM message (only the author can edit) */
  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.getMessageById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only edit your own messages'), { status: 403 })
    }

    const updated = await this.deps.db
      .update(dmMessages)
      .set({ content, isEdited: true, updatedAt: new Date() })
      .where(eq(dmMessages.id, messageId))
      .returning()

    const author = await this.deps.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isBot: users.isBot,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    return {
      ...updated[0],
      author: author[0] ?? undefined,
    }
  }

  /** Delete a DM message (only the author can delete) */
  async deleteMessage(messageId: string, userId: string) {
    const message = await this.getMessageById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    if (message.authorId !== userId) {
      throw Object.assign(new Error('Can only delete your own messages'), { status: 403 })
    }

    await this.deps.db.delete(dmMessages).where(eq(dmMessages.id, messageId))

    return message
  }

  // ── Attachments ──────────────────────────────────────

  async createAttachment(data: {
    dmMessageId: string
    filename: string
    url: string
    contentType: string
    size: number
  }) {
    const result = await this.deps.db.insert(dmAttachments).values(data).returning()
    return result[0]
  }

  async getAttachments(dmMessageId: string) {
    return this.deps.db
      .select()
      .from(dmAttachments)
      .where(eq(dmAttachments.dmMessageId, dmMessageId))
  }

  // ── Reactions ────────────────────────────────────────

  async addReaction(dmMessageId: string, userId: string, emoji: string) {
    const result = await this.deps.db
      .insert(dmReactions)
      .values({ dmMessageId, userId, emoji })
      .onConflictDoNothing()
      .returning()
    return result[0] ?? null
  }

  async removeReaction(dmMessageId: string, userId: string, emoji: string) {
    await this.deps.db
      .delete(dmReactions)
      .where(
        and(
          eq(dmReactions.dmMessageId, dmMessageId),
          eq(dmReactions.userId, userId),
          eq(dmReactions.emoji, emoji),
        ),
      )
  }

  async getReactions(dmMessageId: string) {
    const raw = await this.deps.db
      .select()
      .from(dmReactions)
      .where(eq(dmReactions.dmMessageId, dmMessageId))
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
