import type {
  MentionSuggestion,
  MentionSuggestionTrigger,
  MessageMention,
  MessageMentionKind,
} from '@shadowob/shared'
import {
  canonicalizeMentionContent,
  canonicalMentionToken,
  parseCanonicalMentionToken,
} from '@shadowob/shared'
import type { AppIntegrationDao } from '../dao/app-integration.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ServerDao } from '../dao/server.dao'
import type { UserDao } from '../dao/user.dao'
import { resolveAvatarUrl } from '../lib/avatar-url'
import type { MediaService } from './media.service'
import type { NotificationTriggerService } from './notification-trigger.service'

const MAX_MESSAGE_MENTIONS = 20
const DEFAULT_SUGGESTION_LIMIT = 20
const TOKEN_BOUNDARY_RE = /(^|[\s(])([@#])([^\s@#]{1,128})/gu
const MENTION_LIKE_RE = /(^|[\s(])[@#][^\s@#]{1,128}|<[@#!][^>\s]+>/u
const CANONICAL_MENTION_RE = /<[@#!][^>\s]+>/gu
const FENCED_CODE_RE = /```[\s\S]*?```/gu
const INLINE_CODE_RE = /`[^`\n]+`/gu

type SendMessageInputLike = {
  content: string
  threadId?: string
  replyToId?: string
  attachments?: { filename: string; url: string; contentType: string; size: number }[]
  mentions?: MessageMention[]
  metadata?: Record<string, unknown> & { mentions?: MessageMention[] }
}

type ChannelRecord = NonNullable<Awaited<ReturnType<ChannelDao['findById']>>>
type ServerRecord = NonNullable<Awaited<ReturnType<ServerDao['findById']>>>
type ServerMemberRecord = NonNullable<Awaited<ReturnType<ServerDao['getMember']>>>
type ServerAppRecord = Awaited<ReturnType<AppIntegrationDao['listByServer']>>[number]

interface ChannelScope {
  channel: ChannelRecord
  server: ServerRecord
  member: ServerMemberRecord
  canManage: boolean
}

function makeSlugish(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'server'
  )
}

function serverToken(server: Pick<ServerRecord, 'id' | 'slug' | 'name'>): string {
  return server.slug ?? makeSlugish(server.name) ?? server.id
}

function appToken(app: Pick<ServerAppRecord, 'appKey' | 'name'>): string {
  return app.appKey || makeSlugish(app.name)
}

function normalizeQuery(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase()
}

function includesQuery(values: Array<string | null | undefined>, query: string): boolean {
  if (!query) return true
  return values.some((value) => value?.toLocaleLowerCase().includes(query))
}

function mentionKey(mention: Pick<MessageMention, 'kind' | 'targetId'>): string {
  return `${mention.kind}:${mention.targetId}`
}

function mentionOccurrenceKey(mention: MessageMention): string {
  return `${mentionKey(mention)}:${mention.range?.start ?? 'x'}:${mention.range?.end ?? 'x'}`
}

function mentionAppearsInContent(content: string, mention: MessageMention): boolean {
  if (
    content.includes(mention.token) ||
    (mention.sourceToken && content.includes(mention.sourceToken))
  ) {
    return true
  }
  if (!mention.range) return false
  if (mention.range.start < 0 || mention.range.end > content.length) return false
  return mention.range.end > mention.range.start
}

function rangesOverlap(
  a: NonNullable<MessageMention['range']>,
  b: NonNullable<MessageMention['range']>,
) {
  return a.start < b.end && b.start < a.end
}

function mergeMentionOccurrences(...groups: MessageMention[][]): MessageMention[] {
  const mentions: MessageMention[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const mention of group) {
      const key = mentionOccurrenceKey(mention)
      if (seen.has(key)) continue
      if (
        mention.range &&
        mentions.some(
          (candidate) => candidate.range && rangesOverlap(candidate.range, mention.range!),
        )
      ) {
        continue
      }
      seen.add(key)
      mentions.push(mention)
      if (mentions.length >= MAX_MESSAGE_MENTIONS) return mentions
    }
  }

  return mentions
}

function markdownCodeRanges(content: string): MessageMention['range'][] {
  const ranges: MessageMention['range'][] = []
  for (const match of content.matchAll(FENCED_CODE_RE)) {
    const start = match.index ?? 0
    ranges.push({ start, end: start + match[0].length })
  }

  for (const match of content.matchAll(INLINE_CODE_RE)) {
    const start = match.index ?? 0
    const range = { start, end: start + match[0].length }
    if (!ranges.some((candidate) => candidate && rangesOverlap(candidate, range))) {
      ranges.push(range)
    }
  }

  return ranges
}

function isInRanges(index: number, ranges: Array<NonNullable<MessageMention['range']>>) {
  return ranges.some((range) => index >= range.start && index < range.end)
}

export class MentionService {
  constructor(
    private deps: {
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      appIntegrationDao: AppIntegrationDao
      serverDao: ServerDao
      userDao: UserDao
      notificationTriggerService: NotificationTriggerService
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
    },
  ) {}

  async prepareMessageInput<T extends SendMessageInputLike>(
    channelId: string,
    authorId: string,
    input: T,
  ): Promise<T> {
    const channel = await this.deps.channelDao.findById(channelId)
    if (channel?.kind === 'dm') return input
    const mentions = await this.resolveMentions({
      channelId,
      authorId,
      content: input.content,
      clientMentions: input.mentions ?? input.metadata?.mentions,
    })
    const canonical = canonicalizeMentionContent(input.content, mentions)

    const metadata = { ...(input.metadata ?? {}) }
    if (canonical.mentions.length > 0) metadata.mentions = canonical.mentions
    else delete metadata.mentions

    return {
      ...input,
      content: canonical.content,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      mentions: undefined,
    }
  }

  async suggest(input: {
    userId: string
    channelId: string
    trigger: MentionSuggestionTrigger
    query?: string
    limit?: number
  }): Promise<MentionSuggestion[]> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_SUGGESTION_LIMIT, 1), 50)
    const query = normalizeQuery(input.query)
    const currentScope = await this.assertCanAccessChannel(input.channelId, input.userId)

    const suggestions =
      input.trigger === '@'
        ? await this.suggestAtMentions(input.userId, currentScope, query)
        : await this.suggestHashMentions(input.userId, currentScope, query)

    return suggestions.slice(0, limit)
  }

  async resolveMentions(input: {
    channelId: string
    authorId: string
    content: string
    clientMentions?: MessageMention[]
  }): Promise<MessageMention[]> {
    const currentScope = await this.assertCanAccessChannel(input.channelId, input.authorId)
    const clientMentions: MessageMention[] = []

    for (const mention of input.clientMentions ?? []) {
      if (clientMentions.length >= MAX_MESSAGE_MENTIONS) break
      if (!mentionAppearsInContent(input.content, mention)) continue
      const normalized = await this.normalizeClientMention(mention, input.authorId, currentScope)
      clientMentions.push({
        ...normalized,
        sourceToken: mention.sourceToken ?? mention.token,
        ...(mention.range ? { range: mention.range } : {}),
      })
    }

    const inferredMentions = await this.inferMentionsFromContent(
      input.content,
      input.authorId,
      currentScope,
    )

    return mergeMentionOccurrences(clientMentions, inferredMentions).slice(0, MAX_MESSAGE_MENTIONS)
  }

  async createMentionNotifications(input: {
    messageId: string
    channelId: string
    authorId: string
    authorName: string
    content: string
    mentions: MessageMention[]
  }) {
    const mentions =
      input.mentions.length > 0 || !MENTION_LIKE_RE.test(input.content)
        ? input.mentions
        : await this.resolveMentions({
            channelId: input.channelId,
            authorId: input.authorId,
            content: input.content,
          })
    const targetUserIds = await this.getNotificationTargetUserIds(
      mentions,
      input.channelId,
      input.authorId,
    )
    const channel = await this.deps.channelDao.findById(input.channelId)
    if (!channel) return []
    if (channel.kind === 'dm' || !channel.serverId) return []
    const server = await this.deps.serverDao.findById(channel.serverId)
    const notifications = []

    for (const userId of targetUserIds) {
      const notification = await this.deps.notificationTriggerService.triggerMention({
        userId,
        actorId: input.authorId,
        actorName: input.authorName,
        messageId: input.messageId,
        channelId: input.channelId,
        serverId: channel.serverId,
        channelName: channel.name,
        serverName: server?.name,
        preview: input.content.substring(0, 200),
      })
      notifications.push(notification)
    }

    return notifications
  }

  private async suggestAtMentions(
    userId: string,
    currentScope: ChannelScope,
    query: string,
  ): Promise<MentionSuggestion[]> {
    const suggestions: MentionSuggestion[] = []
    const channelMembers = await this.getVisibleMembersForChannel(currentScope.channel.id)
    for (const member of channelMembers) {
      const user = member.user
      if (!user) continue
      const label = user.displayName ?? user.username
      if (!includesQuery([user.username, user.displayName, member.nickname], query)) continue
      suggestions.push({
        id: `${user.isBot ? 'buddy' : 'user'}:${user.id}`,
        kind: user.isBot ? 'buddy' : 'user',
        targetId: user.id,
        token: `@${user.username}`,
        label: `@${label}`,
        description: currentScope.server.name,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: resolveAvatarUrl(this.deps.mediaService, user.avatarUrl),
        isBot: user.isBot,
        serverId: currentScope.server.id,
        serverSlug: currentScope.server.slug,
        serverName: currentScope.server.name,
      })
    }

    const serverApps = await this.deps.appIntegrationDao.listByServer(currentScope.server.id)
    for (const app of serverApps) {
      if (app.status !== 'active') continue
      if (!includesQuery([app.name, app.appKey, app.description], query)) continue
      suggestions.push({
        id: `app:${app.id}`,
        kind: 'app',
        targetId: app.id,
        token: `@${appToken(app)}`,
        label: `@${app.name}`,
        description: currentScope.server.name,
        serverId: currentScope.server.id,
        serverSlug: currentScope.server.slug,
        serverName: currentScope.server.name,
        appId: app.id,
        appKey: app.appKey,
        appName: app.name,
        iconUrl: app.iconUrl,
      })
    }

    if (currentScope.canManage) {
      for (const kind of ['here', 'everyone'] as const) {
        if (includesQuery([kind], query)) {
          suggestions.push({
            id: `${kind}:${currentScope.server.id}`,
            kind,
            targetId: currentScope.server.id,
            token: `@${kind}`,
            label: `@${kind}`,
            description: currentScope.channel.name,
            serverId: currentScope.server.id,
            serverSlug: currentScope.server.slug,
            serverName: currentScope.server.name,
            channelId: currentScope.channel.id,
            channelName: currentScope.channel.name,
          })
        }
      }
    }

    const userServers = await this.deps.serverDao.findByUserId(userId)
    for (const row of userServers) {
      const server = row.server
      if (!includesQuery([server.name, server.slug], query)) continue
      suggestions.push({
        id: `server:${server.id}`,
        kind: 'server',
        targetId: server.id,
        token: `@${serverToken(server)}`,
        label: `@${server.name}`,
        description: 'server',
        serverId: server.id,
        serverSlug: server.slug,
        serverName: server.name,
      })
    }

    return suggestions.sort((a, b) => this.sortSuggestion(a, b, query, currentScope.server.id))
  }

  private async suggestHashMentions(
    userId: string,
    currentScope: ChannelScope,
    query: string,
  ): Promise<MentionSuggestion[]> {
    const suggestions: MentionSuggestion[] = []
    const [serverQuery, channelQuery] = query.includes('/')
      ? (query.split('/', 2) as [string, string])
      : [query, '']
    const userServers = await this.deps.serverDao.findByUserId(userId)
    const sortedServers = [...userServers].sort((a, b) => {
      if (a.server.id === currentScope.server.id) return -1
      if (b.server.id === currentScope.server.id) return 1
      return a.server.name.localeCompare(b.server.name)
    })

    for (const row of sortedServers) {
      const server = row.server
      if (query.includes('/') && !includesQuery([server.name, server.slug], serverQuery)) continue

      const visibleChannels = await this.getVisibleChannelsForServer(server.id, userId)
      for (const channel of visibleChannels) {
        if (channel.name.startsWith('app:')) continue
        const matches = query.includes('/')
          ? includesQuery([channel.name], channelQuery)
          : includesQuery([channel.name, server.name, server.slug], query)
        if (!matches) continue

        const local = server.id === currentScope.server.id
        const token = local ? `#${channel.name}` : `#${serverToken(server)}/${channel.name}`
        suggestions.push({
          id: `channel:${channel.id}`,
          kind: 'channel',
          targetId: channel.id,
          token,
          label: `#${channel.name}`,
          description: server.name,
          serverId: server.id,
          serverSlug: server.slug,
          serverName: server.name,
          channelId: channel.id,
          channelName: channel.name,
          isPrivate: channel.isPrivate,
        })
      }

      if (!query.includes('/') && includesQuery([server.name, server.slug], query)) {
        suggestions.push({
          id: `server:${server.id}`,
          kind: 'server',
          targetId: server.id,
          token: `#${serverToken(server)}`,
          label: `#${server.name}`,
          description: 'server',
          serverId: server.id,
          serverSlug: server.slug,
          serverName: server.name,
        })
      }
    }

    return suggestions.sort((a, b) => this.sortSuggestion(a, b, query, currentScope.server.id))
  }

  private async inferMentionsFromContent(
    content: string,
    authorId: string,
    currentScope: ChannelScope,
  ): Promise<MessageMention[]> {
    const mentions: MessageMention[] = []
    const codeRanges = markdownCodeRanges(content).filter(
      (range): range is NonNullable<MessageMention['range']> => !!range,
    )

    for (const match of content.matchAll(CANONICAL_MENTION_RE)) {
      if (mentions.length >= MAX_MESSAGE_MENTIONS) break
      const token = match[0]
      const start = match.index ?? 0
      if (isInRanges(start, codeRanges)) continue
      const parsed = parseCanonicalMentionToken(token)
      if (!parsed) continue
      const mention = await this.inferCanonicalMention(parsed, token, start, authorId, currentScope)
      if (mention) mentions.push(mention)
    }

    for (const match of content.matchAll(TOKEN_BOUNDARY_RE)) {
      if (mentions.length >= MAX_MESSAGE_MENTIONS) break
      const prefix = match[1] ?? ''
      const trigger = match[2]
      const rawToken = match[3]
      if (!trigger || !rawToken) continue
      const start = (match.index ?? 0) + prefix.length
      if (isInRanges(start, codeRanges)) continue
      const token = `${trigger}${rawToken}`

      if (trigger === '@') {
        const mention = await this.inferAtMention(rawToken, token, start, authorId, currentScope)
        if (mention) mentions.push(mention)
        continue
      }

      if (content[start + token.length] === '/') continue
      const mention = await this.inferHashMention(rawToken, token, start, authorId, currentScope)
      if (mention) mentions.push(mention)
    }

    return mentions
  }

  private async inferCanonicalMention(
    parsed: NonNullable<ReturnType<typeof parseCanonicalMentionToken>>,
    token: string,
    start: number,
    authorId: string,
    currentScope: ChannelScope,
  ): Promise<MessageMention | null> {
    if (parsed.kind === 'user') {
      const mention = await this.normalizeUserMention(
        parsed.targetId,
        authorId,
        currentScope,
        token,
      )
      if (!mention) return null
      return { ...mention, range: { start, end: start + token.length } }
    }

    if (parsed.kind === 'channel') {
      return this.normalizeChannelMention(parsed.targetId, authorId, token, start)
    }

    if (parsed.kind === 'app') {
      const mention = await this.normalizeAppMention(parsed.targetId, authorId, currentScope, token)
      if (!mention) return null
      return { ...mention, range: { start, end: start + token.length } }
    }

    if (parsed.kind === 'server') {
      const serverId = parsed.targetId
      const [member, server] = await Promise.all([
        this.deps.serverDao.getMember(serverId, authorId),
        this.deps.serverDao.findById(serverId),
      ])
      if (!member || !server) return null
      return {
        kind: 'server',
        targetId: server.id,
        token,
        label: `@${server.name}`,
        range: { start, end: start + token.length },
        serverId: server.id,
        serverSlug: server.slug,
        serverName: server.name,
      }
    }

    if (parsed.kind === 'here' || parsed.kind === 'everyone') {
      if (!currentScope.canManage) return null
      if (parsed.targetId && parsed.targetId !== currentScope.server.id) return null
      return {
        kind: parsed.kind,
        targetId: currentScope.server.id,
        token,
        label: `@${parsed.kind}`,
        range: { start, end: start + token.length },
        serverId: currentScope.server.id,
        serverSlug: currentScope.server.slug,
        serverName: currentScope.server.name,
        channelId: currentScope.channel.id,
        channelName: currentScope.channel.name,
      }
    }

    return null
  }

  private async inferAtMention(
    rawToken: string,
    token: string,
    start: number,
    authorId: string,
    currentScope: ChannelScope,
  ): Promise<MessageMention | null> {
    if ((rawToken === 'here' || rawToken === 'everyone') && currentScope.canManage) {
      return {
        kind: rawToken,
        targetId: currentScope.server.id,
        token,
        label: token,
        range: { start, end: start + token.length },
        serverId: currentScope.server.id,
        serverSlug: currentScope.server.slug,
        serverName: currentScope.server.name,
        channelId: currentScope.channel.id,
        channelName: currentScope.channel.name,
      }
    }

    const user = await this.deps.userDao.findByUsername(rawToken)
    if (user) {
      const mention = await this.normalizeUserMention(user.id, authorId, currentScope, token)
      if (mention) return { ...mention, range: { start, end: start + token.length } }
    }

    const app = await this.inferCurrentServerApp(rawToken, currentScope)
    if (app) {
      const mention = await this.normalizeAppMention(app.id, authorId, currentScope, token)
      if (mention) return { ...mention, range: { start, end: start + token.length } }
    }

    const userServers = await this.deps.serverDao.findByUserId(authorId)
    const server = userServers.find(
      (row) => row.server.slug === rawToken || makeSlugish(row.server.name) === rawToken,
    )?.server
    if (!server) return null
    return {
      kind: 'server',
      targetId: server.id,
      token,
      label: `@${server.name}`,
      range: { start, end: start + token.length },
      serverId: server.id,
      serverSlug: server.slug,
      serverName: server.name,
    }
  }

  private async inferHashMention(
    rawToken: string,
    token: string,
    start: number,
    authorId: string,
    currentScope: ChannelScope,
  ): Promise<MessageMention | null> {
    if (rawToken.includes('/')) {
      const [serverPart, channelPart] = rawToken.split('/', 2)
      if (!serverPart || !channelPart) return null
      const userServers = await this.deps.serverDao.findByUserId(authorId)
      const server = userServers.find(
        (row) =>
          row.server.id === serverPart ||
          row.server.slug === serverPart ||
          makeSlugish(row.server.name) === serverPart,
      )?.server
      if (!server) return null
      const visibleChannels = await this.getVisibleChannelsForServer(server.id, authorId)
      const channel = visibleChannels.find((candidate) => candidate.name === channelPart)
      if (!channel) return null
      return this.normalizeChannelMention(channel.id, authorId, token, start)
    }

    const currentChannels = await this.getVisibleChannelsForServer(currentScope.server.id, authorId)
    const channel = currentChannels.find((candidate) => candidate.name === rawToken)
    if (channel) {
      return this.normalizeChannelMention(channel.id, authorId, token, start)
    }

    const userServers = await this.deps.serverDao.findByUserId(authorId)
    const server = userServers.find(
      (row) => row.server.slug === rawToken || makeSlugish(row.server.name) === rawToken,
    )?.server
    if (!server) return null
    return {
      kind: 'server',
      targetId: server.id,
      token,
      label: `#${server.name}`,
      range: { start, end: start + token.length },
      serverId: server.id,
      serverSlug: server.slug,
      serverName: server.name,
    }
  }

  private async normalizeClientMention(
    mention: MessageMention,
    authorId: string,
    currentScope: ChannelScope,
  ): Promise<MessageMention> {
    if (mention.kind === 'user' || mention.kind === 'buddy') {
      const normalized = await this.normalizeUserMention(
        mention.userId ?? mention.targetId,
        authorId,
        currentScope,
        canonicalMentionToken(mention),
      )
      if (!normalized) {
        throw Object.assign(new Error('Mentioned user is not available in this channel'), {
          status: 403,
        })
      }
      return normalized
    }

    if (mention.kind === 'channel') {
      return this.normalizeChannelMention(
        mention.channelId ?? mention.targetId,
        authorId,
        canonicalMentionToken(mention),
      )
    }

    if (mention.kind === 'app') {
      const normalized = await this.normalizeAppMention(
        mention.appId ?? mention.targetId,
        authorId,
        currentScope,
        canonicalMentionToken(mention),
      )
      if (!normalized) {
        throw Object.assign(new Error('Mentioned app is not available in this server'), {
          status: 403,
        })
      }
      return normalized
    }

    if (mention.kind === 'server') {
      const serverId = mention.serverId ?? mention.targetId
      const member = await this.deps.serverDao.getMember(serverId, authorId)
      const server = await this.deps.serverDao.findById(serverId)
      if (!member || !server) {
        throw Object.assign(new Error('Mentioned server is not available'), { status: 403 })
      }
      return {
        kind: 'server',
        targetId: server.id,
        token: canonicalMentionToken({ ...mention, targetId: server.id, serverId: server.id }),
        label: mention.label || `#${server.name}`,
        serverId: server.id,
        serverSlug: server.slug,
        serverName: server.name,
      }
    }

    if (mention.kind === 'here' || mention.kind === 'everyone') {
      if (!currentScope.canManage) {
        throw Object.assign(new Error('You do not have permission to use broadcast mentions'), {
          status: 403,
        })
      }
      return {
        kind: mention.kind,
        targetId: currentScope.server.id,
        token: canonicalMentionToken({
          ...mention,
          targetId: currentScope.server.id,
          serverId: currentScope.server.id,
        }),
        label: mention.token,
        serverId: currentScope.server.id,
        serverSlug: currentScope.server.slug,
        serverName: currentScope.server.name,
        channelId: currentScope.channel.id,
        channelName: currentScope.channel.name,
      }
    }

    throw Object.assign(new Error('Unsupported mention kind'), { status: 400 })
  }

  private async normalizeUserMention(
    targetUserId: string,
    _authorId: string,
    currentScope: ChannelScope,
    token: string,
  ): Promise<MessageMention | null> {
    const [user, serverMember] = await Promise.all([
      this.deps.userDao.findById(targetUserId),
      this.deps.serverDao.getMember(currentScope.server.id, targetUserId),
    ])
    if (!user || !serverMember) return null

    if (currentScope.channel.isPrivate) {
      const channelMember = await this.deps.channelMemberDao.get(
        currentScope.channel.id,
        targetUserId,
      )
      const targetCanManage = serverMember.role === 'owner' || serverMember.role === 'admin'
      if (!channelMember && !targetCanManage) return null
    }

    const label = user.displayName ?? user.username
    return {
      kind: user.isBot ? 'buddy' : 'user',
      targetId: user.id,
      token,
      label: `@${label}`,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: resolveAvatarUrl(this.deps.mediaService, user.avatarUrl),
      isBot: user.isBot,
      serverId: currentScope.server.id,
      serverSlug: currentScope.server.slug,
      serverName: currentScope.server.name,
    }
  }

  private async normalizeChannelMention(
    channelId: string,
    authorId: string,
    token: string,
    start?: number,
  ): Promise<MessageMention> {
    const scope = await this.assertCanAccessChannel(channelId, authorId)
    return {
      kind: 'channel',
      targetId: scope.channel.id,
      token,
      label: `#${scope.channel.name}`,
      ...(start !== undefined ? { range: { start, end: start + token.length } } : {}),
      serverId: scope.server.id,
      serverSlug: scope.server.slug,
      serverName: scope.server.name,
      channelId: scope.channel.id,
      channelName: scope.channel.name,
      isPrivate: scope.channel.isPrivate,
    }
  }

  private async normalizeAppMention(
    appId: string,
    _authorId: string,
    currentScope: ChannelScope,
    token: string,
  ): Promise<MessageMention | null> {
    const app = await this.deps.appIntegrationDao.findById(appId)
    if (!app || app.serverId !== currentScope.server.id || app.status !== 'active') return null

    return {
      kind: 'app',
      targetId: app.id,
      token,
      label: `@${app.name}`,
      serverId: currentScope.server.id,
      serverSlug: currentScope.server.slug,
      serverName: currentScope.server.name,
      appId: app.id,
      appKey: app.appKey,
      appName: app.name,
      iconUrl: app.iconUrl,
    }
  }

  private async inferCurrentServerApp(rawToken: string, currentScope: ChannelScope) {
    const normalized = rawToken.toLocaleLowerCase()
    const apps = await this.deps.appIntegrationDao.listByServer(currentScope.server.id)
    return (
      apps.find(
        (app) =>
          app.status === 'active' &&
          (app.appKey.toLocaleLowerCase() === normalized ||
            makeSlugish(app.name).toLocaleLowerCase() === normalized),
      ) ?? null
    )
  }

  private async assertCanAccessChannel(channelId: string, userId: string): Promise<ChannelScope> {
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel) throw Object.assign(new Error('Channel not found'), { status: 404 })
    if (channel.kind === 'dm') {
      const channelMember = await this.deps.channelMemberDao.get(channel.id, userId)
      if (!channelMember) {
        throw Object.assign(new Error('Not a participant of this direct channel'), { status: 403 })
      }
      throw Object.assign(new Error('Mentions are not available in direct messages'), {
        status: 400,
      })
    }
    if (!channel.serverId) throw Object.assign(new Error('Channel not found'), { status: 404 })

    const [server, member, channelMember] = await Promise.all([
      this.deps.serverDao.findById(channel.serverId),
      this.deps.serverDao.getMember(channel.serverId, userId),
      this.deps.channelMemberDao.get(channel.id, userId),
    ])
    if (!server || !member) {
      throw Object.assign(new Error('Not a member of this server'), { status: 403 })
    }

    const canManage = member.role === 'owner' || member.role === 'admin'
    if (channel.isPrivate && !channelMember && !canManage) {
      throw Object.assign(new Error('Not a member of this channel'), { status: 403 })
    }

    return { channel, server, member, canManage }
  }

  private async getVisibleChannelsForServer(serverId: string, userId: string) {
    const [serverMember, allChannels] = await Promise.all([
      this.deps.serverDao.getMember(serverId, userId),
      this.deps.channelDao.findByServerId(serverId),
    ])
    if (!serverMember) return []

    const canManage = serverMember.role === 'owner' || serverMember.role === 'admin'
    const memberChannelIds = await this.deps.channelMemberDao.getUserChannelIds(
      userId,
      allChannels.map((channel) => channel.id),
    )
    const memberSet = new Set(memberChannelIds)
    return allChannels.filter(
      (channel) => !channel.isPrivate || canManage || memberSet.has(channel.id),
    )
  }

  private async getVisibleMembersForChannel(channelId: string) {
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel) return []
    if (channel.kind === 'dm' || !channel.serverId) return []
    const channelMembers = await this.deps.channelMemberDao.getMembers(channelId)
    const serverMembers = await this.deps.serverDao.getMembers(channel.serverId)
    if (channelMembers.length === 0) return serverMembers
    const channelUserIds = new Set(channelMembers.map((member) => member.userId))
    return serverMembers.filter((member) => channelUserIds.has(member.userId))
  }

  private async getNotificationTargetUserIds(
    mentions: MessageMention[],
    channelId: string,
    authorId: string,
  ): Promise<string[]> {
    const targets = new Set<string>()

    for (const mention of mentions) {
      if ((mention.kind === 'user' || mention.kind === 'buddy') && mention.userId) {
        if (mention.userId !== authorId) targets.add(mention.userId)
      }
      if (mention.kind === 'here' || mention.kind === 'everyone') {
        const members = await this.getVisibleMembersForChannel(channelId)
        for (const member of members) {
          if (member.userId !== authorId) targets.add(member.userId)
        }
      }
    }

    return Array.from(targets)
  }

  private sortSuggestion(
    a: MentionSuggestion,
    b: MentionSuggestion,
    query: string,
    currentServerId: string,
  ): number {
    const aCurrent = a.serverId === currentServerId ? 1 : 0
    const bCurrent = b.serverId === currentServerId ? 1 : 0
    if (aCurrent !== bCurrent) return bCurrent - aCurrent

    const aBot = a.isBot ? 1 : 0
    const bBot = b.isBot ? 1 : 0
    if (aBot !== bBot) return bBot - aBot

    const aLabel = a.label.toLocaleLowerCase()
    const bLabel = b.label.toLocaleLowerCase()
    const aExact = query && aLabel.includes(query) ? 1 : 0
    const bExact = query && bLabel.includes(query) ? 1 : 0
    if (aExact !== bExact) return bExact - aExact

    const kindOrder = new Map<MessageMentionKind, number>([
      ['buddy', 0],
      ['app', 1],
      ['user', 2],
      ['channel', 3],
      ['server', 4],
      ['here', 5],
      ['everyone', 6],
    ])
    return (kindOrder.get(a.kind) ?? 99) - (kindOrder.get(b.kind) ?? 99)
  }
}
