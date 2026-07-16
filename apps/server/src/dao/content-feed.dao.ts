import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  attachments,
  type ContentDigestMode,
  type ContentFeedEventState,
  type ContentFeedKind,
  type ContentSubscriptionStatus,
  channelContentSubscriptions,
  channelMembers,
  channels,
  contentFeedEvents,
  contentFeedItems,
  contentSubscriptionPreferences,
  members,
  messages,
  reactions,
  servers,
  threads,
  users,
} from '../db/schema'

export type ContentFeedCursor = {
  publishedAt: Date
  id: string
  score?: number
}

export type UpsertContentFeedItemInput = {
  messageId: string
  channelId: string
  serverId: string
  authorId: string
  title: string
  summary?: string | null
  contentKinds: ContentFeedKind[]
  primaryAttachmentId?: string | null
  primaryAttachmentContentType?: string | null
  primaryAttachmentSize?: number | null
  attachmentIds: string[]
  cardRefs: Array<Record<string, unknown>>
  score: number
  publishedAt: Date
}

const DEFAULT_CONTENT_FEED_KINDS: ContentFeedKind[] = [
  'image',
  'html',
  'pdf',
  'file',
  'voice',
  'card',
]
const DEFAULT_CONTENT_FEED_KINDS_SQL = sql`ARRAY['image','html','pdf','file','voice','card']::varchar(24)[]`
const EMPTY_MIME_TYPES_SQL = sql`ARRAY[]::varchar(120)[]`
const EFFECTIVE_INCLUDE_KINDS_SQL = sql`COALESCE(
  CASE WHEN ${channelContentSubscriptions.ruleCustomized} THEN ${channelContentSubscriptions.includeKinds} END,
  ${contentSubscriptionPreferences.includeKinds},
  ${DEFAULT_CONTENT_FEED_KINDS_SQL}
)`
const EFFECTIVE_EXCLUDE_MIME_TYPES_SQL = sql`COALESCE(
  CASE WHEN ${channelContentSubscriptions.ruleCustomized} THEN ${channelContentSubscriptions.excludeMimeTypes} END,
  ${EMPTY_MIME_TYPES_SQL}
)`
const CONTENT_FEED_LIKE_EMOJI = '❤️'

export class ContentFeedDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  private accessibleFeedConditions(userId: string) {
    return [
      sql`COALESCE(${channelContentSubscriptions.status}, 'active') = 'active'`,
      eq(channels.kind, 'server' as const),
      eq(channels.isArchived, false),
      sql`${members.id} IS NOT NULL`,
      or(
        eq(channels.isPrivate, false),
        sql`${channelMembers.id} IS NOT NULL`,
        inArray(members.role, ['owner', 'admin']),
      )!,
      sql`${EFFECTIVE_INCLUDE_KINDS_SQL} && ${contentFeedItems.contentKinds}`,
      sql`(
        cardinality(${EFFECTIVE_EXCLUDE_MIME_TYPES_SQL}) = 0
        OR ${contentFeedItems.primaryAttachmentContentType} IS NULL
        OR NOT (${contentFeedItems.primaryAttachmentContentType} = ANY(${EFFECTIVE_EXCLUDE_MIME_TYPES_SQL}))
      )`,
      sql`(
        COALESCE(${channelContentSubscriptions.ruleCustomized}, false) = false
        OR
        ${channelContentSubscriptions.minAttachmentSize} IS NULL
        OR ${contentFeedItems.primaryAttachmentSize} IS NULL
        OR ${contentFeedItems.primaryAttachmentSize} >= ${channelContentSubscriptions.minAttachmentSize}
      )`,
      sql`(
        COALESCE(${channelContentSubscriptions.ruleCustomized}, false) = false
        OR
        ${channelContentSubscriptions.maxAttachmentSize} IS NULL
        OR ${contentFeedItems.primaryAttachmentSize} IS NULL
        OR ${contentFeedItems.primaryAttachmentSize} <= ${channelContentSubscriptions.maxAttachmentSize}
      )`,
      sql`(${contentFeedEvents.state} IS NULL OR ${contentFeedEvents.state} NOT IN ('hidden', 'dismissed'))`,
    ]
  }

  private fromAccessibleFeed(userId: string) {
    return this.db
      .select({
        item: contentFeedItems,
        subscription: channelContentSubscriptions,
        event: contentFeedEvents,
        channel: {
          id: channels.id,
          name: channels.name,
          type: channels.type,
          serverId: channels.serverId,
        },
        server: {
          id: servers.id,
          name: servers.name,
          slug: servers.slug,
          iconUrl: servers.iconUrl,
        },
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          isBot: users.isBot,
        },
        primaryAttachmentDurationMs: sql<number | null>`(
          SELECT ${attachments.durationMs}
          FROM ${attachments}
          WHERE ${attachments.id} = ${contentFeedItems.primaryAttachmentId}
          LIMIT 1
        )`,
        likeCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int
          FROM ${reactions}
          WHERE ${reactions.messageId} = ${contentFeedItems.messageId}
            AND ${reactions.emoji} = ${CONTENT_FEED_LIKE_EMOJI}
        ), 0)`,
        viewerLiked: sql<boolean>`EXISTS (
          SELECT 1
          FROM ${reactions}
          WHERE ${reactions.messageId} = ${contentFeedItems.messageId}
            AND ${reactions.userId} = ${userId}
            AND ${reactions.emoji} = ${CONTENT_FEED_LIKE_EMOJI}
        )`,
        commentCount: sql<number>`COALESCE((
          SELECT COUNT(*)::int
          FROM ${threads} feed_threads
          INNER JOIN ${messages} feed_thread_messages
            ON feed_thread_messages.thread_id = feed_threads.id
          WHERE feed_threads.parent_message_id = ${contentFeedItems.messageId}
            AND feed_threads.is_archived = false
        ), 0)`,
      })
      .from(contentFeedItems)
      .leftJoin(
        channelContentSubscriptions,
        and(
          eq(channelContentSubscriptions.channelId, contentFeedItems.channelId),
          eq(channelContentSubscriptions.userId, userId),
        ),
      )
      .leftJoin(contentSubscriptionPreferences, eq(contentSubscriptionPreferences.userId, userId))
      .innerJoin(channels, eq(channels.id, contentFeedItems.channelId))
      .innerJoin(servers, eq(servers.id, contentFeedItems.serverId))
      .innerJoin(users, eq(users.id, contentFeedItems.authorId))
      .leftJoin(
        members,
        and(eq(members.serverId, contentFeedItems.serverId), eq(members.userId, userId)),
      )
      .leftJoin(
        channelMembers,
        and(
          eq(channelMembers.channelId, contentFeedItems.channelId),
          eq(channelMembers.userId, userId),
        ),
      )
      .leftJoin(
        contentFeedEvents,
        and(
          eq(contentFeedEvents.feedItemId, contentFeedItems.id),
          eq(contentFeedEvents.userId, userId),
        ),
      )
  }

  async upsertSubscription(data: {
    userId: string
    channelId: string
    serverId: string
    status?: ContentSubscriptionStatus
    includeKinds?: ContentFeedKind[]
    excludeMimeTypes?: string[]
    minAttachmentSize?: number | null
    maxAttachmentSize?: number | null
    pushEnabled?: boolean
    digestMode?: ContentDigestMode
    lastReadAt?: Date | null
    ruleCustomized?: boolean
  }) {
    const now = new Date()
    const hasRuleData =
      data.includeKinds !== undefined ||
      data.excludeMimeTypes !== undefined ||
      data.minAttachmentSize !== undefined ||
      data.maxAttachmentSize !== undefined ||
      data.pushEnabled !== undefined ||
      data.digestMode !== undefined
    const shouldSetRuleCustomized = data.ruleCustomized !== undefined || hasRuleData
    const values = {
      userId: data.userId,
      channelId: data.channelId,
      serverId: data.serverId,
      status: data.status ?? 'active',
      includeKinds: data.includeKinds ?? DEFAULT_CONTENT_FEED_KINDS,
      ...(data.excludeMimeTypes ? { excludeMimeTypes: data.excludeMimeTypes } : {}),
      ...(data.minAttachmentSize !== undefined
        ? { minAttachmentSize: data.minAttachmentSize }
        : {}),
      ...(data.maxAttachmentSize !== undefined
        ? { maxAttachmentSize: data.maxAttachmentSize }
        : {}),
      ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
      ...(data.digestMode ? { digestMode: data.digestMode } : {}),
      ...(data.lastReadAt !== undefined ? { lastReadAt: data.lastReadAt } : {}),
      ...(shouldSetRuleCustomized ? { ruleCustomized: data.ruleCustomized ?? hasRuleData } : {}),
      updatedAt: now,
    }
    const result = await this.db
      .insert(channelContentSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: [channelContentSubscriptions.userId, channelContentSubscriptions.channelId],
        set: {
          status: data.status ?? 'active',
          serverId: data.serverId,
          ...(data.includeKinds ? { includeKinds: data.includeKinds } : {}),
          ...(data.excludeMimeTypes ? { excludeMimeTypes: data.excludeMimeTypes } : {}),
          ...(data.minAttachmentSize !== undefined
            ? { minAttachmentSize: data.minAttachmentSize }
            : {}),
          ...(data.maxAttachmentSize !== undefined
            ? { maxAttachmentSize: data.maxAttachmentSize }
            : {}),
          ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
          ...(data.digestMode ? { digestMode: data.digestMode } : {}),
          ...(data.lastReadAt !== undefined ? { lastReadAt: data.lastReadAt } : {}),
          ...(shouldSetRuleCustomized
            ? { ruleCustomized: data.ruleCustomized ?? hasRuleData }
            : {}),
          updatedAt: now,
        },
      })
      .returning()
    return result[0]!
  }

  async findSubscriptionByUserChannel(userId: string, channelId: string) {
    const result = await this.db
      .select()
      .from(channelContentSubscriptions)
      .where(
        and(
          eq(channelContentSubscriptions.userId, userId),
          eq(channelContentSubscriptions.channelId, channelId),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async listSubscriptions(input: { userId: string; serverId?: string }) {
    const conditions = [
      eq(channels.kind, 'server' as const),
      eq(channels.isArchived, false),
      sql`${members.id} IS NOT NULL`,
      or(
        eq(channels.isPrivate, false),
        sql`${channelMembers.id} IS NOT NULL`,
        inArray(members.role, ['owner', 'admin']),
      )!,
    ]
    if (input.serverId) conditions.push(eq(channels.serverId, input.serverId))

    return this.db
      .select({
        subscription: channelContentSubscriptions,
        channel: {
          id: channels.id,
          name: channels.name,
          type: channels.type,
          isPrivate: channels.isPrivate,
          serverId: channels.serverId,
          lastMessageAt: channels.lastMessageAt,
        },
        server: {
          id: servers.id,
          name: servers.name,
          slug: servers.slug,
          iconUrl: servers.iconUrl,
        },
      })
      .from(channels)
      .innerJoin(servers, eq(servers.id, channels.serverId))
      .leftJoin(
        channelContentSubscriptions,
        and(
          eq(channelContentSubscriptions.channelId, channels.id),
          eq(channelContentSubscriptions.userId, input.userId),
        ),
      )
      .leftJoin(
        members,
        and(eq(members.serverId, channels.serverId), eq(members.userId, input.userId)),
      )
      .leftJoin(
        channelMembers,
        and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, input.userId)),
      )
      .where(and(...conditions))
      .orderBy(asc(servers.name), asc(channels.position), asc(channels.name))
  }

  async updateSubscription(
    userId: string,
    id: string,
    data: Partial<{
      status: ContentSubscriptionStatus
      includeKinds: ContentFeedKind[]
      excludeMimeTypes: string[]
      minAttachmentSize: number | null
      maxAttachmentSize: number | null
      pushEnabled: boolean
      digestMode: ContentDigestMode
      lastReadAt: Date | null
      ruleCustomized: boolean
    }>,
  ) {
    const result = await this.db
      .update(channelContentSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(channelContentSubscriptions.id, id), eq(channelContentSubscriptions.userId, userId)),
      )
      .returning()
    return result[0] ?? null
  }

  async deleteSubscription(userId: string, id: string) {
    const result = await this.db
      .update(channelContentSubscriptions)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(
        and(eq(channelContentSubscriptions.id, id), eq(channelContentSubscriptions.userId, userId)),
      )
      .returning()
    return result[0] ?? null
  }

  async listAccessibleChannels(input: { userId: string; channelId?: string; serverId?: string }) {
    const conditions = [
      eq(channels.kind, 'server' as const),
      eq(channels.isArchived, false),
      sql`${members.id} IS NOT NULL`,
      or(
        eq(channels.isPrivate, false),
        sql`${channelMembers.id} IS NOT NULL`,
        inArray(members.role, ['owner', 'admin']),
      )!,
    ]
    if (input.channelId) conditions.push(eq(channels.id, input.channelId))
    if (input.serverId) conditions.push(eq(channels.serverId, input.serverId))

    return this.db
      .select({
        channelId: channels.id,
        serverId: channels.serverId,
      })
      .from(channels)
      .leftJoin(
        members,
        and(eq(members.serverId, channels.serverId), eq(members.userId, input.userId)),
      )
      .leftJoin(
        channelMembers,
        and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, input.userId)),
      )
      .where(and(...conditions))
  }

  async markSubscriptionsRead(input: {
    userId: string
    channelId?: string
    serverId?: string
    readAt?: Date
  }) {
    const readAt = input.readAt ?? new Date()
    const now = new Date()
    const accessibleChannels = await this.listAccessibleChannels(input)
    const values = accessibleChannels
      .filter((row): row is { channelId: string; serverId: string } => Boolean(row.serverId))
      .map((row) => ({
        userId: input.userId,
        channelId: row.channelId,
        serverId: row.serverId,
        lastReadAt: readAt,
        updatedAt: now,
      }))
    if (values.length === 0) return 0
    const result = await this.db
      .insert(channelContentSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: [channelContentSubscriptions.userId, channelContentSubscriptions.channelId],
        set: {
          lastReadAt: readAt,
          updatedAt: now,
        },
      })
      .returning({ id: channelContentSubscriptions.id })
    return result.length
  }

  async listRecentUnindexedMessageIds(input: {
    userId: string
    channelId?: string
    serverId?: string
    limit?: number
  }) {
    const conditions = [
      eq(channels.kind, 'server' as const),
      eq(channels.isArchived, false),
      sql`${messages.threadId} IS NULL`,
      sql`${members.id} IS NOT NULL`,
      sql`${contentFeedItems.id} IS NULL`,
      or(
        eq(channels.isPrivate, false),
        sql`${channelMembers.id} IS NOT NULL`,
        inArray(members.role, ['owner', 'admin']),
      )!,
      or(
        sql`EXISTS (
          SELECT 1 FROM ${attachments}
          WHERE ${attachments.messageId} = ${messages.id}
        )`,
        sql`COALESCE(${messages.metadata}->'cards', '[]'::jsonb) @> '[{"kind":"space_app"}]'::jsonb`,
      )!,
    ]
    if (input.channelId) conditions.push(eq(messages.channelId, input.channelId))
    if (input.serverId) conditions.push(eq(channels.serverId, input.serverId))

    const rows = await this.db
      .select({ messageId: messages.id })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .innerJoin(servers, eq(servers.id, channels.serverId))
      .leftJoin(contentFeedItems, eq(contentFeedItems.messageId, messages.id))
      .leftJoin(
        members,
        and(eq(members.serverId, channels.serverId), eq(members.userId, input.userId)),
      )
      .leftJoin(
        channelMembers,
        and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, input.userId)),
      )
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(Math.max(input.limit ?? 80, 1), 200))

    return rows.map((row) => row.messageId)
  }

  async upsertFeedItem(data: UpsertContentFeedItemInput) {
    const now = new Date()
    const result = await this.db
      .insert(contentFeedItems)
      .values({
        ...data,
        summary: data.summary ?? null,
        primaryAttachmentId: data.primaryAttachmentId ?? null,
        primaryAttachmentContentType: data.primaryAttachmentContentType ?? null,
        primaryAttachmentSize: data.primaryAttachmentSize ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: contentFeedItems.messageId,
        set: {
          channelId: data.channelId,
          serverId: data.serverId,
          authorId: data.authorId,
          title: data.title,
          summary: data.summary ?? null,
          contentKinds: data.contentKinds,
          primaryAttachmentId: data.primaryAttachmentId ?? null,
          primaryAttachmentContentType: data.primaryAttachmentContentType ?? null,
          primaryAttachmentSize: data.primaryAttachmentSize ?? null,
          attachmentIds: data.attachmentIds,
          cardRefs: data.cardRefs,
          score: data.score,
          publishedAt: data.publishedAt,
          updatedAt: now,
        },
      })
      .returning()
    return result[0]!
  }

  async findPreferences(userId: string) {
    const result = await this.db
      .select()
      .from(contentSubscriptionPreferences)
      .where(eq(contentSubscriptionPreferences.userId, userId))
      .limit(1)
    return result[0] ?? null
  }

  async upsertPreferences(
    userId: string,
    data: Partial<{
      includeKinds: ContentFeedKind[]
      pushEnabled: boolean
      digestMode: ContentDigestMode
    }>,
  ) {
    const now = new Date()
    const result = await this.db
      .insert(contentSubscriptionPreferences)
      .values({
        userId,
        ...(data.includeKinds !== undefined ? { includeKinds: data.includeKinds } : {}),
        ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
        ...(data.digestMode !== undefined ? { digestMode: data.digestMode } : {}),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: contentSubscriptionPreferences.userId,
        set: {
          ...(data.includeKinds !== undefined ? { includeKinds: data.includeKinds } : {}),
          ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
          ...(data.digestMode !== undefined ? { digestMode: data.digestMode } : {}),
          updatedAt: now,
        },
      })
      .returning()
    return result[0]!
  }

  async deleteFeedItemByMessageId(messageId: string) {
    await this.db.delete(contentFeedItems).where(eq(contentFeedItems.messageId, messageId))
  }

  async listFeed(input: {
    userId: string
    limit: number
    cursor?: ContentFeedCursor
    kinds?: ContentFeedKind[]
    channelId?: string
    serverId?: string
    unreadOnly?: boolean
    sort?: 'latest' | 'recommended'
  }) {
    const conditions = this.accessibleFeedConditions(input.userId)
    if (input.channelId) conditions.push(eq(contentFeedItems.channelId, input.channelId))
    if (input.serverId) conditions.push(eq(contentFeedItems.serverId, input.serverId))
    if (input.kinds?.length) {
      conditions.push(sql`${contentFeedItems.contentKinds} && ${input.kinds}`)
    }
    if (input.cursor) {
      if (input.sort === 'recommended' && typeof input.cursor.score === 'number') {
        conditions.push(
          or(
            lt(contentFeedItems.score, input.cursor.score),
            and(
              eq(contentFeedItems.score, input.cursor.score),
              lt(contentFeedItems.publishedAt, input.cursor.publishedAt),
            ),
            and(
              eq(contentFeedItems.score, input.cursor.score),
              eq(contentFeedItems.publishedAt, input.cursor.publishedAt),
              lt(contentFeedItems.id, input.cursor.id),
            ),
          )!,
        )
      } else {
        conditions.push(
          or(
            lt(contentFeedItems.publishedAt, input.cursor.publishedAt),
            and(
              eq(contentFeedItems.publishedAt, input.cursor.publishedAt),
              lt(contentFeedItems.id, input.cursor.id),
            ),
          )!,
        )
      }
    }
    if (input.unreadOnly) {
      conditions.push(
        sql`${contentFeedItems.publishedAt} > COALESCE(${channelContentSubscriptions.lastReadAt}, to_timestamp(0))`,
      )
      conditions.push(
        sql`(${contentFeedEvents.state} IS NULL OR ${contentFeedEvents.state} = 'seen')`,
      )
    }

    const order =
      input.sort === 'recommended'
        ? [
            desc(contentFeedItems.score),
            desc(contentFeedItems.publishedAt),
            desc(contentFeedItems.id),
          ]
        : [desc(contentFeedItems.publishedAt), desc(contentFeedItems.id)]

    return this.fromAccessibleFeed(input.userId)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(input.limit)
  }

  async findAccessibleFeedItem(userId: string, feedItemId: string) {
    const rows = await this.fromAccessibleFeed(userId)
      .where(and(...this.accessibleFeedConditions(userId), eq(contentFeedItems.id, feedItemId)))
      .limit(1)
    return rows[0] ?? null
  }

  async recordEvent(input: {
    userId: string
    feedItemId: string
    state: ContentFeedEventState
    lastPosition?: Record<string, unknown> | null
  }) {
    const now = new Date()
    const result = await this.db
      .insert(contentFeedEvents)
      .values({
        userId: input.userId,
        feedItemId: input.feedItemId,
        state: input.state,
        lastPosition: input.lastPosition ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [contentFeedEvents.userId, contentFeedEvents.feedItemId],
        set: {
          state: input.state,
          lastPosition: input.lastPosition ?? null,
          updatedAt: now,
        },
      })
      .returning()
    return result[0]!
  }
}
