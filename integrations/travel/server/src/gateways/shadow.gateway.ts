import { createHash } from 'node:crypto'
import {
  createShadowSpaceAppLaunchPoll,
  deliverShadowSpaceAppLaunchOutbox,
  ensureShadowSpaceAppLaunchChannel,
  fetchShadowSpaceAppLaunchChannels,
  fetchShadowSpaceAppLaunchInboxes,
  fetchShadowSpaceAppLaunchMembers,
  fetchShadowSpaceAppLaunchMessage,
  publishShadowSpaceAppNotification,
  type ShadowSpaceAppInboxDelivery,
  type ShadowSpaceAppInboxTaskOutbox,
  ShadowSpaceAppOutbox,
} from '@shadowob/sdk'
import { badRequest, unauthorized } from '../lib/errors.js'
import { travelShadowApiBaseUrl } from '../security/oauth.js'
import type { RequestContext } from '../types.js'

export interface BuddyTaskInput {
  agentId: string
  agentUserId?: string
  assigneeLabel?: string
  title: string
  body: string
  idempotencyKey: string
  priority?: ShadowSpaceAppInboxTaskOutbox['priority']
  resource: ShadowSpaceAppInboxTaskOutbox['resource']
  data: Record<string, unknown>
}

export interface BuddyTaskStatus {
  note?: string
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'canceled' | 'transferred'
}

export interface ShadowSpaceMember {
  id?: string
  userId?: string
  username?: string
  displayName?: string
  avatarUrl?: string
  role?: string
  kind?: string
  subjectKind?: string
  isBuddy?: boolean
  bot?: boolean
  isBot?: boolean
  nickname?: string
  user?: {
    id?: string
    username?: string
    displayName?: string
    avatarUrl?: string | null
    isBot?: boolean
  }
  agent?: unknown
}

export interface ShadowSpaceChannel {
  id: string
  name: string
  type?: string
  topic?: string | null
  isPrivate?: boolean
  isArchived?: boolean
}

function memberArray(payload: unknown): ShadowSpaceMember[] {
  if (Array.isArray(payload)) return payload as ShadowSpaceMember[]
  const value = record(payload)
  for (const key of ['members', 'items', 'users', 'data']) {
    if (Array.isArray(value?.[key])) return value[key] as ShadowSpaceMember[]
  }
  return []
}

function normalizedHumanMembers(payload: unknown) {
  return memberArray(payload).flatMap((member) => {
    const kind = String(member.kind ?? member.subjectKind ?? '').toLowerCase()
    const isAutomated = Boolean(
      member.isBuddy ||
        member.bot ||
        member.isBot ||
        member.user?.isBot ||
        member.agent ||
        kind === 'buddy' ||
        kind === 'bot' ||
        kind === 'agent',
    )
    if (isAutomated) return []
    return [
      {
        id: member.id,
        userId: member.userId ?? member.user?.id,
        username: member.username ?? member.user?.username,
        displayName:
          member.displayName ??
          member.nickname ??
          member.user?.displayName ??
          member.user?.username,
        avatarUrl: member.avatarUrl ?? member.user?.avatarUrl ?? undefined,
        role: member.role,
        kind: 'user',
      } satisfies ShadowSpaceMember,
    ]
  })
}

function requireLaunchToken(ctx: RequestContext) {
  const token = ctx.launch?.token
  if (!token) throw unauthorized('shadow_launch_token_required')
  return token
}

function shadowCredential(ctx?: RequestContext) {
  return process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN ?? ctx?.launch?.token ?? null
}

const SPACE_MEMBER_CACHE_TTL_MS = 30_000
const SPACE_MEMBER_STALE_TTL_MS = 5 * 60_000
const SHADOW_DIRECTORY_TIMEOUT_MS = 2_500

interface HumanMemberDirectoryResult {
  members: ShadowSpaceMember[]
  connected: boolean
  reason?: string
}

interface HumanMemberDirectoryCacheEntry {
  expiresAt: number
  staleUntil: number
  value: HumanMemberDirectoryResult
}

function credentialCacheKey(serverId: string, token: string) {
  const credentialHash = createHash('sha256').update(token).digest('base64url').slice(0, 16)
  return `${serverId}:${credentialHash}`
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function shadowDeliveries(value: unknown, depth = 0): ShadowSpaceAppInboxDelivery[] {
  if (depth > 4) return []
  const current = record(value)
  if (!current) return []
  const shadow = record(current.shadow)
  const outbox = record(shadow?.outbox)
  if (Array.isArray(outbox?.deliveries)) {
    return outbox.deliveries as ShadowSpaceAppInboxDelivery[]
  }
  return shadowDeliveries(current.result, depth + 1)
}

function channelDeliveries(value: unknown, depth = 0) {
  if (depth > 4) return []
  const current = record(value)
  if (!current) return []
  const shadow = record(current.shadow)
  const outbox = record(shadow?.outbox)
  if (Array.isArray(outbox?.channelMessageDeliveries)) return outbox.channelMessageDeliveries
  return channelDeliveries(current.result, depth + 1)
}

export class ShadowGateway {
  private readonly humanMemberCache = new Map<string, HumanMemberDirectoryCacheEntry>()
  private readonly humanMemberRequests = new Map<string, Promise<HumanMemberDirectoryResult>>()

  async ensureTripMemberChannel(
    input: {
      serverId: string
      tripId: string
      tripTitle: string
      memberUserIds: string[]
      preferredChannelId?: string
    },
    ctx?: RequestContext,
  ) {
    if (ctx?.launch?.token) {
      const normalizedTitle = input.tripTitle
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72)
      const channel = await ensureShadowSpaceAppLaunchChannel({
        launchToken: ctx.launch.token,
        shadowApiBaseUrl: travelShadowApiBaseUrl(),
        input: {
          dedupeKey: `travel-trip:${input.tripId}`,
          isPrivate: true,
          memberUserIds: input.memberUserIds,
          name: `旅行-${normalizedTitle || input.tripId.slice(-8)}`,
          syncMembers: true,
          topic: input.tripTitle,
        },
      })
      return { channelId: channel.channelId, name: channel.name }
    }
    const token = shadowCredential(ctx)
    if (!token) throw unauthorized('shadow_credential_required')
    const headers = {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    }
    const apiBase = travelShadowApiBaseUrl()
    const topicMarker = `travel-trip:${input.tripId}`
    const normalizedTitle = input.tripTitle
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72)
    const name = `旅行-${normalizedTitle || input.tripId.slice(-8)}`
    let channel: ShadowSpaceChannel | undefined
    if (input.preferredChannelId) {
      channel = { id: input.preferredChannelId, name, isPrivate: true }
    } else {
      const response = await fetch(
        `${apiBase}/api/servers/${encodeURIComponent(input.serverId)}/channels`,
        { headers, signal: AbortSignal.timeout(8000) },
      )
      if (!response.ok) throw badRequest('Could not list trip discussion channels')
      const channels = memberArray(await response.json().catch(() => null)) as ShadowSpaceChannel[]
      channel = channels.find(
        (candidate) =>
          candidate.topic?.includes(topicMarker) ||
          (candidate.name === name && candidate.isPrivate !== false),
      )
      if (!channel) {
        const created = await fetch(
          `${apiBase}/api/servers/${encodeURIComponent(input.serverId)}/channels`,
          {
            body: JSON.stringify({
              isPrivate: true,
              name,
              topic: `${topicMarker} · ${input.tripTitle}`,
              type: 'text',
            }),
            headers,
            method: 'POST',
            signal: AbortSignal.timeout(8000),
          },
        )
        if (!created.ok) throw badRequest('Could not create the trip member channel')
        channel = (await created.json().catch(() => null)) as ShadowSpaceChannel | undefined
      }
    }
    if (!channel?.id) throw badRequest('Trip member channel is unavailable')
    const membersResponse = await fetch(
      `${apiBase}/api/channels/${encodeURIComponent(channel.id)}/members`,
      { headers, signal: AbortSignal.timeout(8000) },
    )
    if (!membersResponse.ok) throw badRequest('Could not list trip channel members')
    const currentUserIds = new Set(
      normalizedHumanMembers(await membersResponse.json().catch(() => null)).flatMap((member) =>
        member.userId ? [member.userId] : [],
      ),
    )
    const desiredUserIds = new Set(input.memberUserIds.filter(Boolean))
    const requests = [
      ...[...desiredUserIds]
        .filter((userId) => !currentUserIds.has(userId))
        .map((userId) => ({ method: 'POST', userId })),
      ...[...currentUserIds]
        .filter((userId) => !desiredUserIds.has(userId))
        .map((userId) => ({ method: 'DELETE', userId })),
    ]
    for (const request of requests) {
      const base = `${apiBase}/api/channels/${encodeURIComponent(channel.id)}/members`
      const response = await fetch(
        request.method === 'DELETE' ? `${base}/${encodeURIComponent(request.userId)}` : base,
        {
          ...(request.method === 'POST'
            ? { body: JSON.stringify({ userId: request.userId }) }
            : {}),
          headers,
          method: request.method,
          signal: AbortSignal.timeout(8000),
        },
      )
      if (!response.ok) throw badRequest('Could not synchronize trip channel members')
    }
    return { channelId: channel.id, name: channel.name }
  }

  async publishNotification(
    ctx: RequestContext,
    notification: {
      topicKey: string
      recipientUserIds: string[]
      title: string
      body?: string | null
      idempotencyKey: string
      actionPath?: string | null
      metadata?: Record<string, unknown>
    },
  ) {
    if (!ctx.launch?.token)
      return { ok: false, skipped: true, reason: 'shadow_launch_token_required' }
    try {
      return await publishShadowSpaceAppNotification({
        launchToken: ctx.launch.token,
        shadowApiBaseUrl: travelShadowApiBaseUrl(),
        notification,
      })
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        reason: error instanceof Error ? error.message : 'notification_publish_failed',
      }
    }
  }

  async listBuddyInboxes(ctx: RequestContext) {
    const result = await fetchShadowSpaceAppLaunchInboxes({
      launchToken: requireLaunchToken(ctx),
      shadowApiBaseUrl: travelShadowApiBaseUrl(),
    })
    return {
      inboxes: result.inboxes.map((inbox) => ({
        agentId: inbox.agent.id,
        agentUserId: inbox.agent.user?.id,
        userId: inbox.agent.user?.id,
        channelId: inbox.channel?.id,
        username: inbox.agent.user?.username,
        displayName: inbox.agent.user?.displayName ?? inbox.agent.user?.username,
        avatarUrl: inbox.agent.user?.avatarUrl,
      })),
    }
  }

  async listHumanMembers(ctx: RequestContext) {
    const installationToken = process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN
    const token = installationToken ?? ctx.launch?.token
    if (!token) return { members: [], connected: false, reason: 'shadow_credential_required' }
    const key = credentialCacheKey(ctx.serverId, token)
    const now = Date.now()
    const cached = this.humanMemberCache.get(key)
    if (cached && cached.expiresAt > now) return cached.value
    const inFlight = this.humanMemberRequests.get(key)
    if (inFlight) return inFlight

    const request = (async (): Promise<HumanMemberDirectoryResult> => {
      const payload = installationToken
        ? await fetch(
            `${travelShadowApiBaseUrl()}/api/servers/${encodeURIComponent(ctx.serverId)}/members`,
            {
              headers: {
                accept: 'application/json',
                Authorization: `Bearer ${installationToken}`,
              },
              signal: AbortSignal.timeout(SHADOW_DIRECTORY_TIMEOUT_MS),
            },
          )
            .then(async (response) => (response.ok ? response.json() : null))
            .catch(() => null)
        : await fetchShadowSpaceAppLaunchMembers({
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                signal: AbortSignal.timeout(SHADOW_DIRECTORY_TIMEOUT_MS),
              }),
            launchToken: token,
            shadowApiBaseUrl: travelShadowApiBaseUrl(),
          })
            .then((result) => result.members)
            .catch(() => null)
      if (!payload) {
        if (cached && cached.staleUntil > Date.now()) return cached.value
        return { members: [], connected: false, reason: 'shadow_members_request_failed' }
      }
      const value: HumanMemberDirectoryResult = {
        members: normalizedHumanMembers(payload),
        connected: true,
      }
      const cachedAt = Date.now()
      this.humanMemberCache.set(key, {
        expiresAt: cachedAt + SPACE_MEMBER_CACHE_TTL_MS,
        staleUntil: cachedAt + SPACE_MEMBER_STALE_TTL_MS,
        value,
      })
      return value
    })().finally(() => this.humanMemberRequests.delete(key))
    this.humanMemberRequests.set(key, request)
    return request
  }

  async listChannels(ctx: RequestContext, options: { includePrivate?: boolean } = {}) {
    const token = process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN ?? ctx.launch?.token
    if (!token) return { channels: [], connected: false, reason: 'shadow_credential_required' }
    const payload = ctx.launch?.token
      ? await fetchShadowSpaceAppLaunchChannels({
          launchToken: ctx.launch.token,
          shadowApiBaseUrl: travelShadowApiBaseUrl(),
        })
          .then((result) => result.channels)
          .catch(() => null)
      : await fetch(
          `${travelShadowApiBaseUrl()}/api/servers/${encodeURIComponent(ctx.serverId)}/channels`,
          {
            headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          },
        )
          .then(async (response) => (response.ok ? response.json() : null))
          .catch(() => null)
    if (!payload) {
      return { channels: [], connected: false, reason: 'shadow_channels_request_failed' }
    }
    const channels = memberArray(payload)
      .filter((item) => {
        const channel = item as unknown as ShadowSpaceChannel
        return (
          !channel.isArchived &&
          (options.includePrivate || !channel.isPrivate) &&
          (!channel.type || channel.type === 'text')
        )
      })
      .map((item) => {
        const channel = item as unknown as ShadowSpaceChannel
        return {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          ...(channel.topic ? { topic: channel.topic } : {}),
        }
      })
    return { channels, connected: true }
  }

  async ensureDiscussionChannel(
    ctx: RequestContext,
    input: { preferredChannelId?: string; tripId: string; tripTitle: string },
  ): Promise<{ id?: string; name: string }> {
    if (input.preferredChannelId) {
      return { id: input.preferredChannelId, name: `trip-${input.tripId}` }
    }
    if (ctx.launch?.token) {
      const normalizedTitle = input.tripTitle
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72)
      const channel = await ensureShadowSpaceAppLaunchChannel({
        launchToken: ctx.launch.token,
        shadowApiBaseUrl: travelShadowApiBaseUrl(),
        input: {
          dedupeKey: `travel-trip:${input.tripId}`,
          isPrivate: true,
          name: `旅行-${normalizedTitle || input.tripId.slice(-8)}`,
          topic: input.tripTitle,
        },
      }).catch((error) => {
        throw badRequest('A private trip discussion channel could not be provisioned', error)
      })
      return { id: channel.channelId, name: channel.name }
    }
    const listed = await this.listChannels(ctx, { includePrivate: true })
    if (!listed.connected) {
      throw badRequest('A private trip discussion channel must be provisioned by the Space host')
    }

    const topicMarker = `travel-trip:${input.tripId}`
    const normalizedTitle = input.tripTitle
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72)
    const name = `旅行-${normalizedTitle || input.tripId.slice(-8)}`
    const existing = listed.channels.find(
      (channel) => channel.topic?.includes(topicMarker) || channel.name === name,
    )
    if (existing) return existing

    const token = process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN ?? ctx.launch?.token
    if (!token) throw unauthorized('shadow_credential_required')
    const response = await fetch(
      `${travelShadowApiBaseUrl()}/api/servers/${encodeURIComponent(ctx.serverId)}/channels`,
      {
        body: JSON.stringify({
          isPrivate: true,
          name,
          topic: `${topicMarker} · ${input.tripTitle}`,
          type: 'text',
        }),
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(8000),
      },
    ).catch(() => null)
    if (response?.ok) {
      const channel = (await response.json().catch(() => null)) as ShadowSpaceChannel | null
      if (channel?.id) return channel
    }

    throw badRequest('A discussion channel could not be created or reused')
  }

  async dispatchBuddyTask(ctx: RequestContext, input: BuddyTaskInput) {
    const result = new ShadowSpaceAppOutbox()
      .enqueueInboxTask({
        agentId: input.agentId,
        ...(input.agentUserId ? { agentUserId: input.agentUserId } : {}),
        ...(input.assigneeLabel ? { assigneeLabel: input.assigneeLabel } : {}),
        title: input.title,
        body: input.body,
        priority: input.priority ?? 'normal',
        idempotencyKey: input.idempotencyKey,
        resource: input.resource,
        privacy: { dataClass: 'server-private', redactionRequired: true },
        requirements: {
          capabilities: ['travel.trips:read', 'travel.itinerary:write'],
          tools: [
            { kind: 'space-app-command', name: 'travel.contextPack', required: true },
            { kind: 'space-app-command', name: 'travel.proposePlan', required: true },
          ],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'travel.plan-draft', required: true }],
          submitCommand: { appKey: 'travel', command: 'travel.proposePlan' },
        },
        data: input.data,
        required: true,
      })
      .attachTo({ task: { idempotencyKey: input.idempotencyKey } })
    const delivered = await deliverShadowSpaceAppLaunchOutbox({
      launchToken: requireLaunchToken(ctx),
      shadowApiBaseUrl: travelShadowApiBaseUrl(),
      commandName: 'travel.dispatchBuddyPlan',
      result,
    })
    const delivery = shadowDeliveries(delivered)[0]
    if (!delivery || (!delivery.messageId && !delivery.pendingId)) {
      throw badRequest('Buddy task was not accepted by the community', delivered)
    }
    return { delivery, raw: delivered }
  }

  ensureChannel(
    ctx: RequestContext,
    input: {
      dedupeKey: string
      name: string
      topic?: string
      isPrivate?: boolean
      memberUserIds?: string[]
      syncMembers?: boolean
    },
  ) {
    return ensureShadowSpaceAppLaunchChannel({
      launchToken: requireLaunchToken(ctx),
      shadowApiBaseUrl: travelShadowApiBaseUrl(),
      input,
    })
  }

  createPoll(
    ctx: RequestContext,
    input: {
      channelId: string
      question: string
      answers: Array<string | { text: string; emoji?: string }>
      allowMultiselect?: boolean
      durationHours?: number
    },
  ) {
    return createShadowSpaceAppLaunchPoll({
      launchToken: requireLaunchToken(ctx),
      shadowApiBaseUrl: travelShadowApiBaseUrl(),
      input,
    })
  }

  async getBuddyTaskStatus(
    ctx: RequestContext,
    delivery: { messageId?: string; cardId?: string | null },
  ): Promise<BuddyTaskStatus | null> {
    if (!delivery.messageId || !delivery.cardId) return null
    const raw = await fetchShadowSpaceAppLaunchMessage({
      launchToken: requireLaunchToken(ctx),
      messageId: delivery.messageId,
      shadowApiBaseUrl: travelShadowApiBaseUrl(),
    }).catch(() => null)
    if (!raw) return null
    const payload = record(raw)
    const message = record(payload?.data) ?? payload
    const metadata = record(message?.metadata)
    const cards = Array.isArray(metadata?.cards) ? metadata.cards : []
    const card = cards.map(record).find((item) => item?.id === delivery.cardId)
    const status = card?.status
    if (
      status !== 'queued' &&
      status !== 'claimed' &&
      status !== 'running' &&
      status !== 'completed' &&
      status !== 'failed' &&
      status !== 'canceled' &&
      status !== 'transferred'
    ) {
      return null
    }
    const progress = Array.isArray(card?.progress) ? card.progress.map(record).filter(Boolean) : []
    const latest = progress.at(-1)
    return {
      status,
      ...(typeof latest?.note === 'string' && latest.note.trim()
        ? { note: latest.note.trim() }
        : {}),
    }
  }

  async shareToChannel(
    ctx: RequestContext,
    input: {
      channelId?: string
      channelName?: string
      content: string
      idempotencyKey: string
      metadata: Record<string, unknown>
    },
  ) {
    if (!input.channelId && !input.channelName) {
      throw badRequest('Community channel target is required')
    }
    const result = new ShadowSpaceAppOutbox()
      .sendChannelMessage({
        ...(input.channelId ? { channelId: input.channelId } : {}),
        ...(input.channelName ? { channelName: input.channelName } : {}),
        content: input.content,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      })
      .attachTo({ share: { idempotencyKey: input.idempotencyKey } })
    const delivered = await deliverShadowSpaceAppLaunchOutbox({
      launchToken: requireLaunchToken(ctx),
      shadowApiBaseUrl: travelShadowApiBaseUrl(),
      commandName: 'travel.shareToCommunity',
      result,
    })
    const delivery = record(channelDeliveries(delivered)[0])
    if (!delivery?.messageId) throw badRequest('Community share was not delivered', delivered)
    return {
      channelId: String(delivery.channelId ?? input.channelId ?? ''),
      messageId: String(delivery.messageId),
    }
  }

  async createWorkspaceFileRef(
    _ctx: RequestContext,
    input: {
      workspaceNodeId?: string
      fileName: string
      mimeType?: string
      sizeBytes?: number
    },
  ) {
    return input
  }
}
