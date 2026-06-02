import type { Logger } from 'pino'
import type { Server as SocketIOServer } from 'socket.io'
import type { ChannelDao } from '../dao/channel.dao'
import type { ContentFeedCursor, ContentFeedDao } from '../dao/content-feed.dao'
import type { MessageDao } from '../dao/message.dao'
import type {
  ContentDigestMode,
  ContentFeedEventState,
  ContentFeedKind,
  ContentSubscriptionStatus,
} from '../db/schema'
import type { ChannelAccessService } from './channel-access.service'

const DEFAULT_INCLUDE_KINDS: ContentFeedKind[] = ['image', 'html', 'pdf', 'file', 'voice', 'card']
const DEFAULT_SUBSCRIPTION_DATE = new Date(0)
const DEFAULT_SUBSCRIPTION_ID_PREFIX = 'default:'
const DEFAULT_PUSH_ENABLED = true
const DEFAULT_DIGEST_MODE: ContentDigestMode = 'realtime'
const FEED_BACKFILL_THROTTLE_MS = 30_000
const FEED_BACKFILL_BATCH_SIZE = 8

function defaultSubscriptionId(channelId: string) {
  return `${DEFAULT_SUBSCRIPTION_ID_PREFIX}${channelId}`
}

function channelIdFromDefaultSubscriptionId(id: string) {
  return id.startsWith(DEFAULT_SUBSCRIPTION_ID_PREFIX)
    ? id.slice(DEFAULT_SUBSCRIPTION_ID_PREFIX.length)
    : null
}

function truncateText(value: string | null | undefined, max: number) {
  const normalized = (value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isServerAppCard(value: unknown) {
  const card = asRecord(value)
  return (
    card?.kind === 'server_app' &&
    typeof card.appKey === 'string' &&
    card.appKey.trim().length > 0 &&
    typeof card.title === 'string' &&
    card.title.trim().length > 0
  )
}

function serverAppCardRef(value: unknown) {
  const card = asRecord(value)!
  const action = asRecord(card.action)
  return {
    id: stringValue(card.id),
    kind: 'server_app',
    appKey: stringValue(card.appKey),
    title: stringValue(card.title),
    description: stringValue(card.description),
    label: stringValue(card.label),
    action:
      action?.mode === 'open_app'
        ? {
            mode: 'open_app',
            path: stringValue(action.path),
          }
        : undefined,
  }
}

function attachmentKind(input: {
  filename: string
  contentType: string
  kind?: 'file' | 'image' | 'voice'
}): ContentFeedKind {
  const contentType = input.contentType.toLowerCase()
  const filename = input.filename.toLowerCase()
  if (input.kind === 'voice' || contentType.startsWith('audio/')) return 'voice'
  if (input.kind === 'image' || contentType.startsWith('image/')) return 'image'
  if (contentType.includes('html') || filename.endsWith('.html') || filename.endsWith('.htm')) {
    return 'html'
  }
  if (contentType.includes('pdf') || filename.endsWith('.pdf')) return 'pdf'
  return 'file'
}

function scoreKinds(kinds: Set<ContentFeedKind>) {
  let score = 0
  if (kinds.has('card')) score += 30
  if (kinds.has('html') || kinds.has('pdf')) score += 20
  if (kinds.has('image') || kinds.has('voice')) score += 10
  if (kinds.has('file')) score += 5
  return score
}

export class ContentFeedService {
  private readonly feedBackfillAttempts = new Map<string, number>()

  constructor(
    private deps: {
      contentFeedDao: ContentFeedDao
      messageDao: MessageDao
      channelDao: ChannelDao
      channelAccessService: ChannelAccessService
      io?: SocketIOServer
      logger?: Logger
    },
  ) {}

  encodeCursor(cursor: ContentFeedCursor | null) {
    if (!cursor) return null
    return Buffer.from(
      JSON.stringify({
        publishedAt: cursor.publishedAt.toISOString(),
        id: cursor.id,
        score: cursor.score,
      }),
      'utf8',
    ).toString('base64url')
  }

  decodeCursor(cursor?: string | null): ContentFeedCursor | undefined {
    if (!cursor) return undefined
    try {
      const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        publishedAt?: unknown
        id?: unknown
        score?: unknown
      }
      if (typeof raw.publishedAt !== 'string' || typeof raw.id !== 'string') return undefined
      const publishedAt = new Date(raw.publishedAt)
      if (Number.isNaN(publishedAt.getTime())) return undefined
      return {
        publishedAt,
        id: raw.id,
        score: typeof raw.score === 'number' ? raw.score : undefined,
      }
    } catch {
      return undefined
    }
  }

  async subscribeChannel(input: { userId: string; channelId: string }) {
    const channel = await this.deps.channelAccessService.assertCanRead(
      input.channelId,
      input.userId,
    )
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Only server channels can be subscribed'), { status: 400 })
    }
    const [subscription, preferences] = await Promise.all([
      this.deps.contentFeedDao.upsertSubscription({
        userId: input.userId,
        channelId: input.channelId,
        serverId: channel.serverId,
        status: 'active',
      }),
      this.getDefaultPreferences(input.userId),
    ])
    return this.serializeSubscription(subscription, preferences)
  }

  async listSubscriptions(input: { userId: string; serverId?: string }) {
    const [rows, preferences] = await Promise.all([
      this.deps.contentFeedDao.listSubscriptions(input),
      this.getDefaultPreferences(input.userId),
    ])
    return rows.map((row) => ({
      ...(row.subscription
        ? this.serializeSubscription(row.subscription, preferences)
        : this.serializeDefaultSubscription({
            userId: input.userId,
            channelId: row.channel.id,
            serverId: row.server.id,
            preferences,
          })),
      channel: row.channel,
      server: row.server,
    }))
  }

  async getDefaultPreferences(userId: string) {
    const preferences = await this.deps.contentFeedDao.findPreferences(userId)
    return this.serializePreferences(userId, preferences)
  }

  async updateDefaultPreferences(
    userId: string,
    data: Partial<{
      includeKinds: ContentFeedKind[]
      pushEnabled: boolean
      digestMode: ContentDigestMode
    }>,
  ) {
    return this.serializePreferences(
      userId,
      await this.deps.contentFeedDao.upsertPreferences(userId, data),
    )
  }

  async getChannelSubscription(input: { userId: string; channelId: string }) {
    const channel = await this.deps.channelAccessService.assertCanRead(
      input.channelId,
      input.userId,
    )
    if (channel.kind !== 'server' || !channel.serverId) return null
    const subscription = await this.deps.contentFeedDao.findSubscriptionByUserChannel(
      input.userId,
      input.channelId,
    )
    const preferences = await this.getDefaultPreferences(input.userId)
    return subscription
      ? this.serializeSubscription(subscription, preferences)
      : this.serializeDefaultSubscription({
          userId: input.userId,
          channelId: input.channelId,
          serverId: channel.serverId,
          preferences,
        })
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
      lastReadAt: string | null
      resetRules: boolean
    }>,
  ) {
    const updateData = this.normalizeSubscriptionUpdate(data)
    const defaultChannelId = channelIdFromDefaultSubscriptionId(id)
    if (defaultChannelId) {
      const channel = await this.deps.channelAccessService.assertCanRead(defaultChannelId, userId)
      if (channel.kind !== 'server' || !channel.serverId) {
        throw Object.assign(new Error('Subscription not found'), { status: 404 })
      }
      const subscription = await this.deps.contentFeedDao.upsertSubscription({
        userId,
        channelId: defaultChannelId,
        serverId: channel.serverId,
        status: updateData.status ?? 'active',
        includeKinds: updateData.includeKinds,
        excludeMimeTypes: updateData.excludeMimeTypes,
        minAttachmentSize: updateData.minAttachmentSize,
        maxAttachmentSize: updateData.maxAttachmentSize,
        pushEnabled: updateData.pushEnabled,
        digestMode: updateData.digestMode,
        lastReadAt: updateData.lastReadAt,
        ruleCustomized: updateData.ruleCustomized,
      })
      return this.serializeSubscription(subscription, await this.getDefaultPreferences(userId))
    }

    const subscription = await this.deps.contentFeedDao.updateSubscription(userId, id, updateData)
    if (!subscription) throw Object.assign(new Error('Subscription not found'), { status: 404 })
    return this.serializeSubscription(subscription, await this.getDefaultPreferences(userId))
  }

  async deleteSubscription(userId: string, id: string) {
    const defaultChannelId = channelIdFromDefaultSubscriptionId(id)
    if (defaultChannelId) {
      const channel = await this.deps.channelAccessService.assertCanRead(defaultChannelId, userId)
      if (channel.kind !== 'server' || !channel.serverId) {
        throw Object.assign(new Error('Subscription not found'), { status: 404 })
      }
      await this.deps.contentFeedDao.upsertSubscription({
        userId,
        channelId: defaultChannelId,
        serverId: channel.serverId,
        status: 'paused',
      })
      return { ok: true }
    }
    await this.deps.contentFeedDao.deleteSubscription(userId, id)
    return { ok: true }
  }

  async listFeed(input: {
    userId: string
    limit?: number
    cursor?: string | null
    kinds?: ContentFeedKind[]
    channelId?: string
    serverId?: string
    unreadOnly?: boolean
    sort?: 'latest' | 'recommended'
  }) {
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 50)
    const query = {
      userId: input.userId,
      limit: limit + 1,
      cursor: this.decodeCursor(input.cursor),
      kinds: input.kinds,
      channelId: input.channelId,
      serverId: input.serverId,
      unreadOnly: input.unreadOnly,
      sort: input.sort ?? 'latest',
    }
    let rows = await this.deps.contentFeedDao.listFeed(query)
    if (!query.cursor && rows.length < limit + 1) {
      const indexed = await this.backfillRecentFeedItems({
        userId: input.userId,
        channelId: input.channelId,
        serverId: input.serverId,
        limit: Math.max((limit + 1) * 2, 80),
      })
      if (indexed > 0) {
        rows = await this.deps.contentFeedDao.listFeed(query)
      }
    }
    const pageRows = rows.slice(0, limit)
    const last = pageRows[pageRows.length - 1]?.item
    return {
      items: pageRows.map((row) => this.serializeFeedRow(row)),
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit && last
          ? this.encodeCursor({ publishedAt: last.publishedAt, id: last.id, score: last.score })
          : null,
    }
  }

  async recordEvent(input: {
    userId: string
    feedItemId: string
    state: ContentFeedEventState
    lastPosition?: Record<string, unknown> | null
  }) {
    const row = await this.deps.contentFeedDao.findAccessibleFeedItem(
      input.userId,
      input.feedItemId,
    )
    if (!row) throw Object.assign(new Error('Feed item not found'), { status: 404 })
    const event = await this.deps.contentFeedDao.recordEvent(input)
    return {
      id: event.id,
      feedItemId: event.feedItemId,
      state: event.state,
      lastPosition: event.lastPosition,
      updatedAt: event.updatedAt,
    }
  }

  async markReadScope(input: {
    userId: string
    feedItemId?: string
    channelId?: string
    serverId?: string
    all?: boolean
  }) {
    if (input.feedItemId) {
      await this.recordEvent({
        userId: input.userId,
        feedItemId: input.feedItemId,
        state: 'seen',
      })
      return { updated: 1 }
    }
    const updated = await this.deps.contentFeedDao.markSubscriptionsRead({
      userId: input.userId,
      channelId: input.channelId,
      serverId: input.serverId,
      readAt: new Date(),
    })
    return { updated }
  }

  async indexMessage(messageId: string) {
    return this.indexMessageWithOptions(messageId)
  }

  private async indexMessageWithOptions(messageId: string, options: { emit?: boolean } = {}) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message || message.threadId) {
      await this.deps.contentFeedDao.deleteFeedItemByMessageId(messageId)
      return null
    }
    const channel = await this.deps.channelDao.findById(message.channelId)
    if (!channel || channel.kind !== 'server' || !channel.serverId) {
      await this.deps.contentFeedDao.deleteFeedItemByMessageId(messageId)
      return null
    }

    const attachments = await this.deps.messageDao.getAttachments(messageId)
    const kinds = new Set<ContentFeedKind>()
    for (const attachment of attachments) {
      kinds.add(attachmentKind(attachment))
    }

    const metadata = asRecord(message.metadata)
    const cards = Array.isArray(metadata?.cards) ? metadata.cards.filter(isServerAppCard) : []
    const cardRefs = cards.map(serverAppCardRef)
    if (cardRefs.length > 0) kinds.add('card')

    if (kinds.size === 0) {
      await this.deps.contentFeedDao.deleteFeedItemByMessageId(messageId)
      return null
    }

    const primaryAttachment = attachments[0] ?? null
    const title =
      stringValue(cardRefs[0]?.title) ??
      primaryAttachment?.filename ??
      truncateText(message.content, 80) ??
      'Content'
    const summary =
      stringValue(cardRefs[0]?.description) ?? truncateText(message.content, 240) ?? null
    const item = await this.deps.contentFeedDao.upsertFeedItem({
      messageId: message.id,
      channelId: message.channelId,
      serverId: channel.serverId,
      authorId: message.authorId,
      title: truncateText(title, 240) || 'Content',
      summary,
      contentKinds: [...kinds],
      primaryAttachmentId: primaryAttachment?.id ?? null,
      primaryAttachmentContentType: primaryAttachment?.contentType ?? null,
      primaryAttachmentSize: primaryAttachment?.size ?? null,
      attachmentIds: attachments.map((attachment) => attachment.id),
      cardRefs,
      score: scoreKinds(kinds),
      publishedAt: message.createdAt,
    })

    if (options.emit !== false) {
      try {
        this.deps.io?.to(`channel:${message.channelId}`).emit('content_feed:new', {
          feedItemId: item.id,
          channelId: item.channelId,
          serverId: item.serverId,
          publishedAt: item.publishedAt,
        })
      } catch (err) {
        this.deps.logger?.warn?.({ err, messageId }, 'Failed to emit content feed event')
      }
    }
    return item
  }

  private async backfillRecentFeedItems(input: {
    userId: string
    channelId?: string
    serverId?: string
    limit: number
  }) {
    const cacheKey = `${input.userId}:${input.serverId ?? '*'}:${input.channelId ?? '*'}`
    const now = Date.now()
    const lastAttempt = this.feedBackfillAttempts.get(cacheKey)
    if (lastAttempt && now - lastAttempt < FEED_BACKFILL_THROTTLE_MS) return 0
    this.feedBackfillAttempts.set(cacheKey, now)

    const messageIds = await this.deps.contentFeedDao.listRecentUnindexedMessageIds(input)
    if (messageIds.length === 0) return 0

    let indexed = 0
    for (let index = 0; index < messageIds.length; index += FEED_BACKFILL_BATCH_SIZE) {
      const batch = messageIds.slice(index, index + FEED_BACKFILL_BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((messageId) => this.indexMessageWithOptions(messageId, { emit: false })),
      )
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) indexed += 1
        if (result.status === 'rejected') {
          this.deps.logger?.warn?.({ err: result.reason }, 'Failed to backfill content feed item')
        }
      }
    }
    if (indexed > 0) this.feedBackfillAttempts.delete(cacheKey)
    return indexed
  }

  private serializeSubscription(
    subscription: {
      id: string
      userId: string
      channelId: string
      serverId: string
      status: ContentSubscriptionStatus
      includeKinds: ContentFeedKind[]
      excludeMimeTypes: string[]
      minAttachmentSize: number | null
      maxAttachmentSize: number | null
      pushEnabled: boolean
      digestMode: ContentDigestMode
      ruleCustomized: boolean
      lastReadAt: Date | null
      createdAt: Date
      updatedAt: Date
    },
    preferences: ReturnType<ContentFeedService['serializePreferences']>,
  ) {
    return {
      ...subscription,
      includeKinds: subscription.ruleCustomized
        ? subscription.includeKinds
        : preferences.includeKinds,
      pushEnabled: subscription.ruleCustomized ? subscription.pushEnabled : preferences.pushEnabled,
      digestMode: subscription.ruleCustomized ? subscription.digestMode : preferences.digestMode,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
      lastReadAt: subscription.lastReadAt?.toISOString() ?? null,
      isDefault: false,
      isCustomRule: subscription.ruleCustomized,
    }
  }

  private serializeDefaultSubscription(input: {
    userId: string
    channelId: string
    serverId: string
    preferences: ReturnType<ContentFeedService['serializePreferences']>
  }) {
    return {
      id: defaultSubscriptionId(input.channelId),
      userId: input.userId,
      channelId: input.channelId,
      serverId: input.serverId,
      status: 'active' as const,
      includeKinds: input.preferences.includeKinds,
      excludeMimeTypes: [],
      minAttachmentSize: null,
      maxAttachmentSize: null,
      pushEnabled: input.preferences.pushEnabled,
      digestMode: input.preferences.digestMode,
      lastReadAt: null,
      createdAt: DEFAULT_SUBSCRIPTION_DATE.toISOString(),
      updatedAt: DEFAULT_SUBSCRIPTION_DATE.toISOString(),
      isDefault: true,
      isCustomRule: false,
    }
  }

  private serializePreferences(
    userId: string,
    preferences: {
      id: string
      userId: string
      includeKinds: ContentFeedKind[]
      pushEnabled: boolean
      digestMode: ContentDigestMode
      createdAt: Date
      updatedAt: Date
    } | null,
  ) {
    return {
      id: preferences?.id ?? `default:${userId}`,
      userId,
      includeKinds: preferences?.includeKinds ?? DEFAULT_INCLUDE_KINDS,
      pushEnabled: preferences?.pushEnabled ?? DEFAULT_PUSH_ENABLED,
      digestMode: preferences?.digestMode ?? DEFAULT_DIGEST_MODE,
      createdAt: (preferences?.createdAt ?? DEFAULT_SUBSCRIPTION_DATE).toISOString(),
      updatedAt: (preferences?.updatedAt ?? DEFAULT_SUBSCRIPTION_DATE).toISOString(),
      isDefault: !preferences,
    }
  }

  private normalizeSubscriptionUpdate(
    data: Partial<{
      status: ContentSubscriptionStatus
      includeKinds: ContentFeedKind[]
      excludeMimeTypes: string[]
      minAttachmentSize: number | null
      maxAttachmentSize: number | null
      pushEnabled: boolean
      digestMode: ContentDigestMode
      lastReadAt: string | null
      resetRules: boolean
    }>,
  ) {
    const hasRuleData =
      data.includeKinds !== undefined ||
      data.excludeMimeTypes !== undefined ||
      data.minAttachmentSize !== undefined ||
      data.maxAttachmentSize !== undefined ||
      data.pushEnabled !== undefined ||
      data.digestMode !== undefined
    return {
      status: data.status,
      includeKinds: data.resetRules ? DEFAULT_INCLUDE_KINDS : data.includeKinds,
      excludeMimeTypes: data.resetRules ? [] : data.excludeMimeTypes,
      minAttachmentSize: data.resetRules ? null : data.minAttachmentSize,
      maxAttachmentSize: data.resetRules ? null : data.maxAttachmentSize,
      pushEnabled: data.resetRules ? DEFAULT_PUSH_ENABLED : data.pushEnabled,
      digestMode: data.resetRules ? DEFAULT_DIGEST_MODE : data.digestMode,
      ruleCustomized: data.resetRules ? false : hasRuleData ? true : undefined,
      lastReadAt:
        data.lastReadAt === undefined
          ? undefined
          : data.lastReadAt === null
            ? null
            : new Date(data.lastReadAt),
    }
  }

  private serializeFeedRow(row: Awaited<ReturnType<ContentFeedDao['listFeed']>>[number]) {
    const state = row.event?.state
    const lastReadAt = row.subscription?.lastReadAt ?? null
    const readState =
      state && state !== 'hidden' && state !== 'dismissed'
        ? state
        : lastReadAt && row.item.publishedAt <= lastReadAt
          ? 'seen'
          : 'unread'
    return {
      id: row.item.id,
      messageId: row.item.messageId,
      channelId: row.item.channelId,
      serverId: row.item.serverId,
      authorId: row.item.authorId,
      title: row.item.title,
      summary: row.item.summary,
      contentKinds: row.item.contentKinds,
      primaryAttachmentId: row.item.primaryAttachmentId,
      primaryAttachmentContentType: row.item.primaryAttachmentContentType,
      primaryAttachmentSize: row.item.primaryAttachmentSize,
      primaryAttachmentDurationMs: row.primaryAttachmentDurationMs ?? null,
      attachmentIds: row.item.attachmentIds,
      cardRefs: row.item.cardRefs,
      score: row.item.score,
      publishedAt: row.item.publishedAt.toISOString(),
      createdAt: row.item.createdAt.toISOString(),
      updatedAt: row.item.updatedAt.toISOString(),
      readState,
      event: row.event
        ? {
            state: row.event.state,
            lastPosition: row.event.lastPosition,
            updatedAt: row.event.updatedAt.toISOString(),
          }
        : null,
      channel: row.channel,
      server: row.server,
      author: row.author,
      interactions: {
        likeCount: Number(row.likeCount ?? 0),
        viewerLiked: Boolean(row.viewerLiked),
        commentCount: Number(row.commentCount ?? 0),
        viewerSaved: state === 'saved',
      },
    }
  }
}
