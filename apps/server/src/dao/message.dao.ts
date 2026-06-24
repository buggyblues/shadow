import { and, asc, desc, eq, exists, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  attachments,
  channelMembers,
  messageInteractiveSubmissions,
  messages,
  reactions,
  taskCardReadStates,
  threads,
  users,
} from '../db/schema'

export interface ChannelListMemberPreview {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline' | null
  lastSpokeAt: Date | null
}

export interface ChannelListMessagePreview {
  id: string
  content: string
  createdAt: Date
  attachmentCount: number
  attachmentPreviews: ChannelListAttachmentPreview[]
  author: {
    id: string
    username: string
    displayName: string | null
  } | null
}

export interface ChannelListAttachmentPreview {
  id: string
  filename: string
  contentType: string
  kind: 'file' | 'image' | 'voice'
}

export interface ChannelListPreview {
  lastMessagePreview: ChannelListMessagePreview | null
  memberPreviews: ChannelListMemberPreview[]
}

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

  private threadColumns = {
    id: threads.id,
    name: threads.name,
    channelId: threads.channelId,
    parentMessageId: threads.parentMessageId,
    creatorId: threads.creatorId,
    isArchived: threads.isArchived,
    createdAt: threads.createdAt,
    updatedAt: threads.updatedAt,
    messageCount: sql<number>`(
      CASE WHEN EXISTS (
        SELECT 1
        FROM ${messages} source_message
        WHERE source_message.id = ${sql.raw('"threads"."parent_message_id"')}
      ) THEN 1 ELSE 0 END
    ) + COALESCE((
      SELECT COUNT(*)::int
      FROM ${messages} thread_messages
      WHERE thread_messages.thread_id = ${sql.raw('"threads"."id"')}
    ), 0)`,
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

  async findTaskCardReadStatesForMessages(userId: string, messageIds: string[]) {
    if (messageIds.length === 0) return []
    return this.db
      .select()
      .from(taskCardReadStates)
      .where(
        and(
          eq(taskCardReadStates.userId, userId),
          inArray(taskCardReadStates.messageId, messageIds),
        ),
      )
  }

  async upsertTaskCardReadState(input: {
    userId: string
    messageId: string
    cardId: string
    readAt: Date
  }) {
    const now = new Date()
    const result = await this.db
      .insert(taskCardReadStates)
      .values({
        userId: input.userId,
        messageId: input.messageId,
        cardId: input.cardId,
        readAt: input.readAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          taskCardReadStates.userId,
          taskCardReadStates.messageId,
          taskCardReadStates.cardId,
        ],
        set: {
          readAt: input.readAt,
          updatedAt: now,
        },
      })
      .returning()
    return result[0] ?? null
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
    const conditions = [eq(messages.channelId, channelId), isNull(messages.threadId)]
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

    // Batch-fetch attachments and reactions for all messages
    if (msgList.length > 0) {
      const msgIds = msgList.map((m) => m.id)
      const [atts, reacts] = await Promise.all([
        this.db.select().from(attachments).where(inArray(attachments.messageId, msgIds)),
        this.db.select().from(reactions).where(inArray(reactions.messageId, msgIds)),
      ])
      const attMap = new Map<string, typeof atts>()
      for (const att of atts) {
        const list = attMap.get(att.messageId) ?? []
        list.push(att)
        attMap.set(att.messageId, list)
      }
      const reactionMap = this.groupReactionsByMessage(reacts)
      return {
        messages: msgList.map((m) => ({
          ...m,
          attachments: attMap.get(m.id) ?? [],
          reactions: reactionMap.get(m.id) ?? [],
        })),
        hasMore,
      }
    }

    return {
      messages: msgList.map((m) => ({
        ...m,
        attachments: [] as (typeof attachments.$inferSelect)[],
        reactions: [] as Array<{ emoji: string; count: number; userIds: string[] }>,
      })),
      hasMore,
    }
  }

  async findChannelListPreviews(channelIds: string[], memberLimit = 6) {
    if (channelIds.length === 0) return new Map<string, ChannelListPreview>()

    const previewByChannel = new Map<string, ChannelListPreview>(
      channelIds.map((channelId) => [channelId, { lastMessagePreview: null, memberPreviews: [] }]),
    )

    const latestMessages = await this.db
      .selectDistinctOn([messages.channelId], {
        id: messages.id,
        channelId: messages.channelId,
        content: messages.content,
        createdAt: messages.createdAt,
        authorId: messages.authorId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(inArray(messages.channelId, channelIds), isNull(messages.threadId)))
      .orderBy(messages.channelId, desc(messages.createdAt), desc(messages.id))

    const latestMessageIds = latestMessages.map((message) => message.id)
    const attachmentCountByMessage = new Map<string, number>()
    const attachmentPreviewByMessage = new Map<string, ChannelListAttachmentPreview[]>()
    if (latestMessageIds.length > 0) {
      const attachmentCounts = await this.db
        .select({
          messageId: attachments.messageId,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(attachments)
        .where(inArray(attachments.messageId, latestMessageIds))
        .groupBy(attachments.messageId)

      for (const row of attachmentCounts) {
        attachmentCountByMessage.set(row.messageId, row.count)
      }

      const attachmentPreviewRows = await this.db
        .select({
          id: attachments.id,
          messageId: attachments.messageId,
          filename: attachments.filename,
          contentType: attachments.contentType,
          kind: attachments.kind,
        })
        .from(attachments)
        .where(inArray(attachments.messageId, latestMessageIds))
        .orderBy(attachments.messageId, asc(attachments.createdAt), asc(attachments.id))

      for (const row of attachmentPreviewRows) {
        const previews = attachmentPreviewByMessage.get(row.messageId) ?? []
        if (previews.length >= 3) continue
        previews.push({
          id: row.id,
          filename: row.filename,
          contentType: row.contentType,
          kind: row.kind,
        })
        attachmentPreviewByMessage.set(row.messageId, previews)
      }
    }

    for (const message of latestMessages) {
      const preview = previewByChannel.get(message.channelId)
      if (!preview) continue
      preview.lastMessagePreview = {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        attachmentCount: attachmentCountByMessage.get(message.id) ?? 0,
        attachmentPreviews: attachmentPreviewByMessage.get(message.id) ?? [],
        author:
          message.authorId && message.authorUsername
            ? {
                id: message.authorId,
                username: message.authorUsername,
                displayName: message.authorDisplayName,
              }
            : null,
      }
    }

    try {
      const safeMemberLimit = Math.max(1, Math.min(memberLimit, 6))
      const channelIdList = sql.join(
        channelIds.map((channelId) => sql`${channelId}`),
        sql`, `,
      )
      const memberRows = await this.db.execute<{
        channelId: string
        id: string
        username: string
        displayName: string | null
        avatarUrl: string | null
        status: 'online' | 'idle' | 'dnd' | 'offline' | null
        lastSpokeAt: Date | null
      }>(sql`
        WITH latest_member_speech AS (
          SELECT
            ${messages.channelId} AS "channelId",
            ${messages.authorId} AS "userId",
            MAX(${messages.createdAt}) AS "lastSpokeAt"
          FROM ${messages}
          WHERE ${messages.channelId} IN (${channelIdList})
            AND ${messages.threadId} IS NULL
          GROUP BY ${messages.channelId}, ${messages.authorId}
        ),
        ranked_members AS (
          SELECT
            ${channelMembers.channelId} AS "channelId",
            ${users.id} AS "id",
            ${users.username} AS "username",
            ${users.displayName} AS "displayName",
            ${users.avatarUrl} AS "avatarUrl",
            ${users.status} AS "status",
            latest_member_speech."lastSpokeAt" AS "lastSpokeAt",
            ROW_NUMBER() OVER (
              PARTITION BY ${channelMembers.channelId}
              ORDER BY
                CASE WHEN latest_member_speech."lastSpokeAt" IS NULL THEN 1 ELSE 0 END ASC,
                latest_member_speech."lastSpokeAt" DESC NULLS LAST,
                ${channelMembers.joinedAt} ASC,
                ${users.id} ASC
            ) AS "previewRank"
          FROM ${channelMembers}
          INNER JOIN ${users} ON ${users.id} = ${channelMembers.userId}
          LEFT JOIN latest_member_speech
            ON latest_member_speech."channelId" = ${channelMembers.channelId}
            AND latest_member_speech."userId" = ${channelMembers.userId}
          WHERE ${channelMembers.channelId} IN (${channelIdList})
        )
        SELECT
          "channelId",
          "id",
          "username",
          "displayName",
          "avatarUrl",
          "status",
          "lastSpokeAt"
        FROM ranked_members
        WHERE "previewRank" <= ${safeMemberLimit}
        ORDER BY "channelId", "previewRank"
      `)

      for (const row of memberRows) {
        const preview = previewByChannel.get(row.channelId)
        if (!preview) continue
        preview.memberPreviews.push({
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          status: row.status,
          lastSpokeAt: row.lastSpokeAt,
        })
      }
    } catch {
      // Older installs may not have channel_members yet; message previews remain useful.
    }

    return previewByChannel
  }

  async findWindowAroundMessage(channelId: string, messageId: string, limit = 50) {
    const targetRows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(
        and(
          eq(messages.channelId, channelId),
          eq(messages.id, messageId),
          isNull(messages.threadId),
        ),
      )
      .limit(1)

    const target = targetRows[0]
    if (!target) return null

    const safeLimit = Math.max(1, Math.min(limit, 100))
    const beforeLimit = Math.floor((safeLimit - 1) / 2)
    const afterLimit = safeLimit - beforeLimit - 1
    const beforeFetchLimit = beforeLimit + 1

    const [olderRows, newerRows] = await Promise.all([
      this.db
        .select({
          message: messages,
          author: this.authorColumns,
        })
        .from(messages)
        .leftJoin(users, eq(messages.authorId, users.id))
        .where(
          and(
            eq(messages.channelId, channelId),
            isNull(messages.threadId),
            lt(messages.createdAt, target.message.createdAt),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(beforeFetchLimit),
      this.db
        .select({
          message: messages,
          author: this.authorColumns,
        })
        .from(messages)
        .leftJoin(users, eq(messages.authorId, users.id))
        .where(
          and(
            eq(messages.channelId, channelId),
            isNull(messages.threadId),
            gt(messages.createdAt, target.message.createdAt),
          ),
        )
        .orderBy(asc(messages.createdAt))
        .limit(afterLimit),
    ])

    const hasMore = olderRows.length > beforeLimit
    const rows = [...olderRows.slice(0, beforeLimit).reverse(), target, ...newerRows]
    const msgList = rows.map((r) => ({ ...r.message, author: r.author }))

    if (msgList.length === 0) return { messages: [], hasMore }

    const msgIds = msgList.map((m) => m.id)
    const [atts, reacts] = await Promise.all([
      this.db.select().from(attachments).where(inArray(attachments.messageId, msgIds)),
      this.db.select().from(reactions).where(inArray(reactions.messageId, msgIds)),
    ])
    const attMap = new Map<string, typeof atts>()
    for (const att of atts) {
      const list = attMap.get(att.messageId) ?? []
      list.push(att)
      attMap.set(att.messageId, list)
    }
    const reactionMap = this.groupReactionsByMessage(reacts)

    return {
      messages: msgList.map((m) => ({
        ...m,
        attachments: attMap.get(m.id) ?? [],
        reactions: reactionMap.get(m.id) ?? [],
      })),
      hasMore,
    }
  }

  private groupReactionsByMessage(rows: (typeof reactions.$inferSelect)[]) {
    const byMessage = new Map<
      string,
      Map<string, { emoji: string; count: number; userIds: string[] }>
    >()
    for (const row of rows) {
      let grouped = byMessage.get(row.messageId)
      if (!grouped) {
        grouped = new Map()
        byMessage.set(row.messageId, grouped)
      }
      const current = grouped.get(row.emoji)
      if (current) {
        current.count += 1
        current.userIds.push(row.userId)
      } else {
        grouped.set(row.emoji, { emoji: row.emoji, count: 1, userIds: [row.userId] })
      }
    }
    return new Map(
      [...byMessage.entries()].map(([messageId, grouped]) => [messageId, [...grouped.values()]]),
    )
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

  /** Scoped update by message id only if the user is the sender */
  async updateById(id: string, sender: string, content: string) {
    const result = await this.db
      .update(messages)
      .set({ content, isEdited: true, updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.authorId, sender)))
      .returning()
    return result[0] ?? null
  }

  async updateMetadata(id: string, metadata: Record<string, unknown> | null) {
    const result = await this.db
      .update(messages)
      .set({ metadata: metadata ?? undefined, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning()
    return result[0] ?? null
  }

  /** Scoped delete by message id only if the user is the sender */
  async deleteById(id: string, sender: string) {
    await this.db.delete(messages).where(and(eq(messages.id, id), eq(messages.authorId, sender)))
  }

  async search(
    query: string,
    options?: {
      serverId?: string
      channelId?: string
      accessibleChannelIds?: string[]
      from?: string
      hasAttachment?: boolean
      limit?: number
      offset?: number
    },
  ) {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const pattern = `%${escapeLikePattern(normalizedQuery)}%`
    const conditions = [sql`lower(${messages.content}) LIKE ${pattern} ESCAPE '\\'`]
    if (!options?.accessibleChannelIds || options.accessibleChannelIds.length === 0) {
      throw Object.assign(new Error('Message search requires accessibleChannelIds'), {
        status: 500,
      })
    }
    conditions.push(inArray(messages.channelId, options.accessibleChannelIds))
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
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)
    const offset = Math.max(options?.offset ?? 0, 0)

    const rows = await this.db
      .select({
        message: messages,
        author: this.authorColumns,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset)

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
    kind?: 'file' | 'image' | 'voice'
    durationMs?: number | null
    audioCodec?: string | null
    audioContainer?: string | null
    waveformPeaks?: number[] | null
    waveformVersion?: number | null
  }) {
    const result = await this.db.insert(attachments).values(data).returning()
    return result[0]
  }

  async getAttachments(messageId: string) {
    return this.db.select().from(attachments).where(eq(attachments.messageId, messageId))
  }

  async findAttachmentById(id: string) {
    const result = await this.db.select().from(attachments).where(eq(attachments.id, id)).limit(1)
    return result[0] ?? null
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
    return this.db
      .select()
      .from(reactions)
      .where(eq(reactions.messageId, messageId))
      .orderBy(asc(reactions.createdAt), asc(reactions.id))
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
    const thread = result[0]
    return thread ? this.findThreadById(thread.id) : null
  }

  async findThreadById(id: string) {
    const result = await this.db
      .select(this.threadColumns)
      .from(threads)
      .where(eq(threads.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async findThreadByParentMessageId(parentMessageId: string) {
    const result = await this.db
      .select(this.threadColumns)
      .from(threads)
      .where(and(eq(threads.parentMessageId, parentMessageId), eq(threads.isArchived, false)))
      .orderBy(asc(threads.createdAt), asc(threads.id))
      .limit(1)
    return result[0] ?? null
  }

  async moveRepliesToThread(parentMessageId: string, threadId: string) {
    const result = await this.db
      .update(messages)
      .set({ threadId, replyToId: null, updatedAt: new Date() })
      .where(and(eq(messages.replyToId, parentMessageId), isNull(messages.threadId)))
      .returning({ id: messages.id })
    return result.length
  }

  async findThreadsByChannelId(channelId: string) {
    return this.db
      .select(this.threadColumns)
      .from(threads)
      .where(and(eq(threads.channelId, channelId), eq(threads.isArchived, false)))
      .orderBy(desc(threads.updatedAt), desc(threads.createdAt))
  }

  async updateThread(id: string, data: Partial<{ name: string; isArchived: boolean }>) {
    const result = await this.db
      .update(threads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(threads.id, id))
      .returning()
    const thread = result[0]
    return thread ? this.findThreadById(thread.id) : null
  }

  async touchThread(id: string) {
    const result = await this.db
      .update(threads)
      .set({ updatedAt: new Date() })
      .where(eq(threads.id, id))
      .returning()
    const thread = result[0]
    return thread ? this.findThreadById(thread.id) : null
  }

  async deleteThread(id: string) {
    await this.db.delete(threads).where(eq(threads.id, id))
  }
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
