import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'
import { normalizeSlashCommands } from '../services/agent.service'
import { canBuddyJoinServer, getBuddyMode } from '../services/buddy-policy'
import {
  channelPositionsSchema,
  createChannelSchema,
  updateChannelSchema,
} from '../validators/channel.schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const reviewJoinRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})
const voiceJoinSchema = z.object({
  clientId: z.string().max(120).nullable().optional(),
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
})
const voiceParticipantSelectorSchema = z.object({
  clientId: z.string().max(120).nullable().optional(),
})
const voiceStatePatchSchema = z.object({
  clientId: z.string().max(120).nullable().optional(),
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
  speaking: z.boolean().optional(),
  screenSharing: z.boolean().optional(),
})
const voicePolicySchema = z.object({
  agentId: z.string().uuid(),
  listen: z.boolean().optional(),
  autoJoin: z.boolean().optional(),
  consumeAudio: z.boolean().optional(),
  consumeScreenShare: z.boolean().optional(),
  screenshotIntervalSeconds: z.number().int().min(5).max(3600).nullable().optional(),
})

type ChannelAgentPolicyBody = {
  mentionOnly?: boolean
  mode?: 'replyAll' | 'mentionOnly' | 'custom' | 'disabled'
  config?: {
    replyToUsers?: string[]
    keywords?: string[]
    mentionOnly?: boolean
    replyToBuddy?: boolean
    maxBuddyChainDepth?: number
    buddyBlacklist?: string[]
    buddyWhitelist?: string[]
    smartReply?: boolean
  }
}

async function resolveSignedMediaUrl(
  mediaService: {
    resolveMediaUrl: (
      mediaUrl: string | null | undefined,
      fallbackContentType?: string,
      options?: { variant?: 'avatar' | 'preview' | 'banner' },
    ) => string | null
  },
  mediaUrl: string | null | undefined,
  options?: { variant?: 'avatar' | 'preview' | 'banner' },
): Promise<string | null> {
  return mediaService.resolveMediaUrl(mediaUrl, 'image/png', options)
}

export function createChannelHandler(container: AppContainer) {
  const channelHandler = new Hono()

  channelHandler.use('*', authMiddleware)

  // Helper: resolve serverId param (UUID or slug) to UUID
  async function resolveServerId(param: string): Promise<string> {
    if (UUID_RE.test(param)) return param
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findBySlug(param)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return server.id
  }

  function requireServerChannel(channel: { kind: string; serverId: string | null }) {
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('This operation only supports server channels'), {
        status: 400,
      })
    }
    return channel.serverId
  }

  async function getAccessStatus(channelId: string, userId: string) {
    const channelService = container.resolve('channelService')
    const channelJoinRequestDao = container.resolve('channelJoinRequestDao')
    const channelAccessService = container.resolve('channelAccessService')
    const access = await channelAccessService.getAccess(channelId, userId)
    if (!access.channel)
      throw Object.assign(new Error(access.error ?? 'Channel not found'), {
        status: access.status ?? 404,
      })
    const channel = access.channel
    const serverMember = access.serverMember ?? null
    const channelMember = access.channelMember ?? null
    const canManage = access.canManage
    const canAccess = access.canAccess
    const joinRequest =
      channel.kind === 'server' && serverMember && channel.isPrivate && !channelMember && !canManage
        ? await channelJoinRequestDao.findByChannelAndUser(channelId, userId)
        : null

    return {
      channel,
      serverMember,
      channelMember,
      isServerMember: Boolean(serverMember),
      isChannelMember: Boolean(channelMember),
      canManage,
      canAccess,
      requiresApproval: Boolean(serverMember && channel.isPrivate && !channelMember && !canManage),
      joinRequestStatus: joinRequest?.status ?? null,
      joinRequestId: joinRequest?.id ?? null,
    }
  }

  function publicAccessStatus<T extends { serverMember?: unknown; channelMember?: unknown }>(
    access: T,
  ) {
    const { serverMember: _serverMember, channelMember: _channelMember, ...publicAccess } = access
    return publicAccess
  }

  async function getSlashCommandsForChannel(id: string, requesterId: string) {
    const channelService = container.resolve('channelService')
    const serverDao = container.resolve('serverDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const channel = await channelService.getById(id)

    if (channel.kind === 'dm') {
      await channelService.getDirectChannelById(id, requesterId)
      const peer = await channelService.findDirectPeer(id, requesterId)
      if (!peer?.isBot) return { commands: [] }

      const agentDao = container.resolve('agentDao')
      const agents = await agentDao.findByUserIds([peer.id])
      return {
        commands: agents.flatMap((agent) =>
          normalizeSlashCommands((agent.config as Record<string, unknown>)?.slashCommands).map(
            (command) => ({
              ...command,
              agentId: agent.id,
              botUserId: agent.userId,
              botUsername: peer.username,
              botDisplayName: peer.displayName ?? peer.username ?? null,
            }),
          ),
        ),
      }
    }

    const serverId = requireServerChannel(channel)
    const requesterServerMember = await serverDao.getMember(serverId, requesterId)
    if (!requesterServerMember) {
      throw Object.assign(new Error('Not a member of this server'), { status: 403 })
    }

    if (channel.isPrivate) {
      const requesterInChannel = await channelMemberDao.get(id, requesterId)
      const requesterCanManageChannel =
        requesterServerMember.role === 'owner' || requesterServerMember.role === 'admin'
      if (!requesterInChannel && !requesterCanManageChannel) {
        throw Object.assign(new Error('Not a member of this channel'), { status: 403 })
      }
    }

    const members = await channelService.getChannelMembers(id, serverId)
    return getSlashCommandsForServerMembers(members)
  }

  async function getSlashCommandsForServerMembers(
    members: Array<{
      userId: string
      user?: {
        isBot?: boolean | null
        username?: string | null
        displayName?: string | null
      } | null
    }>,
  ) {
    const agentDao = container.resolve('agentDao')
    const botMembers = members.filter((member) => member.user?.isBot)
    const botUserIds = botMembers.map((member) => member.userId)
    if (botUserIds.length === 0) return { commands: [] }

    const agents = await agentDao.findByUserIds(botUserIds)
    const memberByUserId = new Map(botMembers.map((member) => [member.userId, member]))

    return {
      commands: agents.flatMap((agent) => {
        const member = memberByUserId.get(agent.userId)
        const memberUser = member?.user
        if (!memberUser) return []
        return normalizeSlashCommands((agent.config as Record<string, unknown>)?.slashCommands).map(
          (command) => ({
            ...command,
            agentId: agent.id,
            botUserId: agent.userId,
            botUsername: memberUser.username,
            botDisplayName: memberUser.displayName ?? memberUser.username ?? null,
          }),
        )
      }),
    }
  }

  async function notifyChannelJoinRequestReviewers(input: {
    channelId: string
    channelName: string
    serverId: string
    requestId: string
    requesterId: string
  }) {
    const serverDao = container.resolve('serverDao')
    const userDao = container.resolve('userDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const notificationTriggerService = container.resolve('notificationTriggerService')
    const requester = await userDao.findById(input.requesterId)
    const requesterName = requester?.displayName ?? requester?.username ?? 'Someone'
    const [members, channelMembers, server] = await Promise.all([
      serverDao.getMembers(input.serverId),
      channelMemberDao.getMembers(input.channelId),
      serverDao.findById(input.serverId),
    ])
    const reviewerIds = new Set<string>()
    for (const member of members) {
      if (member.role === 'owner' || member.role === 'admin') reviewerIds.add(member.userId)
    }
    for (const member of channelMembers) {
      reviewerIds.add(member.userId)
    }

    await notificationTriggerService.triggerChannelAccessRequest({
      reviewerIds: Array.from(reviewerIds),
      requesterId: input.requesterId,
      requesterName,
      requestId: input.requestId,
      channelId: input.channelId,
      channelName: input.channelName,
      serverId: input.serverId,
      serverName: server?.name,
    })
  }

  async function notifyChannelJoinRequestDecision(input: {
    channelId: string
    channelName: string
    serverId: string
    userId: string
    reviewerId: string
    approved: boolean
  }) {
    const notificationTriggerService = container.resolve('notificationTriggerService')
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findById(input.serverId)
    await notificationTriggerService.triggerChannelAccessDecision({
      userId: input.userId,
      reviewerId: input.reviewerId,
      approved: input.approved,
      channelId: input.channelId,
      channelName: input.channelName,
      serverId: input.serverId,
      serverName: server?.name,
    })
    try {
      const io = container.resolve('io')
      if (input.approved) {
        io.to(`user:${input.userId}`).emit('channel:member-added', {
          channelId: input.channelId,
          serverId: input.serverId,
        })
      }
    } catch {
      /* non-critical */
    }
  }

  // POST /api/servers/:serverId/channels
  channelHandler.post(
    '/servers/:serverId/channels',
    zValidator('json', createChannelSchema),
    async (c) => {
      const channelService = container.resolve('channelService')
      const serverId = await resolveServerId(c.req.param('serverId'))
      const input = c.req.valid('json')
      const userId = c.get('user').userId
      const channel = await channelService.create(serverId, input, c.get('actor'))

      // Broadcast channel:created to non-bot members of the server via their user rooms
      try {
        const io = container.resolve('io')
        const serverDao = container.resolve('serverDao')
        const members = await serverDao.getMembers(serverId)
        const payload = { ...channel, serverId }
        for (const member of members) {
          if (!member.user?.isBot) {
            io.to(`user:${member.userId}`).emit('channel:created', payload)
          }
        }
      } catch {
        /* non-critical broadcast failure */
      }

      return c.json(channel, 201)
    },
  )

  // GET /api/servers/:serverId/channels
  channelHandler.get('/servers/:serverId/channels', async (c) => {
    const channelService = container.resolve('channelService')
    const serverId = await resolveServerId(c.req.param('serverId'))
    const channels = await channelService.getByServerIdForUser(serverId, c.get('actor'))
    return c.json(channels)
  })

  // POST /api/channels/dm
  channelHandler.post(
    '/channels/dm',
    zValidator('json', z.object({ userId: z.string().uuid() })),
    async (c) => {
      const userDao = container.resolve('userDao')
      const channelService = container.resolve('channelService')
      const peerUserId = c.req.valid('json').userId
      const user = c.get('user')
      const peer = await userDao.findById(peerUserId)
      if (!peer) return c.json({ ok: false, error: 'User not found' }, 404)
      if (peer.isBot) {
        const agentDao = container.resolve('agentDao')
        const rentalService = container.resolve('rentalService')
        const agent = await agentDao.findByUserId(peerUserId)
        if (!agent) return c.json({ ok: false, error: 'Buddy not found' }, 404)
        const access = await rentalService.canUseAgent(agent.id, user.userId)
        if (!access.canUse) {
          return c.json(
            { ok: false, error: 'Only the Buddy owner or active tenant can DM this Buddy' },
            403,
          )
        }
      }
      const channel = await channelService.getOrCreateDirectChannel(user.userId, peerUserId)
      if (peer.isBot) {
        try {
          const io = container.resolve('io')
          io.to(`user:${peerUserId}`).emit('channel:member-added', {
            channelId: channel.id,
          })
        } catch {
          /* non-critical */
        }
      }
      return c.json(channel, 201)
    },
  )

  // GET /api/channels/dm
  channelHandler.get('/channels/dm', async (c) => {
    const channelService = container.resolve('channelService')
    const user = c.get('user')
    return c.json(await channelService.listDirectChannels(user.userId))
  })

  // GET /api/channels/:id/bootstrap — aggregate first-paint channel data for chat routes.
  channelHandler.get('/channels/:id/bootstrap', async (c) => {
    const channelService = container.resolve('channelService')
    const serverService = container.resolve('serverService')
    const messageService = container.resolve('messageService')
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    const userId = c.get('user').userId
    const limit = Math.min(Math.max(Number(c.req.query('messagesLimit') ?? '50') || 50, 1), 100)
    const access = await getAccessStatus(id, userId)

    if (!access.canAccess) {
      if (access.channel.kind === 'server' && access.channel.serverId && access.isServerMember) {
        const buddyInboxService = container.resolve('buddyInboxService')
        const appIntegrationService = container.resolve('appIntegrationService')
        const actor = c.get('actor')
        const server = await serverService.getById(access.channel.serverId)
        const [channels, buddyInboxes, appSummaries] = await Promise.all([
          channelService.getByServerIdForUser(access.channel.serverId, actor, {
            serverMember: access.serverMember,
          }),
          buddyInboxService.listForServer(access.channel.serverId, actor, {
            serverMember: access.serverMember,
          }),
          appIntegrationService.listSummaries(access.channel.serverId, actor, {
            serverMember: access.serverMember,
          }),
        ])
        return c.json({
          access: publicAccessStatus(access),
          channel: access.channel,
          server: {
            ...server,
            iconUrl: await resolveSignedMediaUrl(mediaService, server.iconUrl, {
              variant: 'avatar',
            }),
            bannerUrl: await resolveSignedMediaUrl(mediaService, server.bannerUrl, {
              variant: 'banner',
            }),
          },
          channels,
          buddyInboxes,
          appSummaries,
          members: [],
          messages: { messages: [], hasMore: false },
          slashCommands: { commands: [] },
        })
      }

      return c.json({
        access: publicAccessStatus(access),
        channel: access.channel,
        server: null,
        channels: [],
        buddyInboxes: [],
        appSummaries: [],
        members: [],
        messages: { messages: [], hasMore: false },
        slashCommands: { commands: [] },
      })
    }

    const channel =
      access.channel.kind === 'dm'
        ? await channelService.getDirectChannelById(id, userId)
        : await channelService.getById(id)

    if (access.channel.kind !== 'server' || !access.channel.serverId) {
      const [messages, slashCommands] = await Promise.all([
        messageService.getByChannelId(id, limit, undefined, userId),
        getSlashCommandsForChannel(id, userId),
      ])
      return c.json({
        access: publicAccessStatus(access),
        channel,
        server: null,
        channels: [],
        buddyInboxes: [],
        appSummaries: [],
        members: [],
        messages,
        slashCommands,
      })
    }

    const serverId = access.channel.serverId
    const actor = c.get('actor')
    const buddyInboxService = container.resolve('buddyInboxService')
    const appIntegrationService = container.resolve('appIntegrationService')
    const serverMembersPromise = serverService.getMembers(serverId)
    const membersPromise = serverMembersPromise.then((serverMembers) =>
      channelService.getChannelMembers(id, serverId, {
        channel: access.channel,
        serverMembers,
      }),
    )
    const buddyInboxesPromise = serverMembersPromise.then((serverMembers) =>
      buddyInboxService.listForServer(serverId, actor, {
        serverMember: access.serverMember,
        serverMembers,
      }),
    )
    const [messages, server, channels, members, buddyInboxes, appSummaries] = await Promise.all([
      messageService.getByChannelId(id, limit, undefined, userId),
      serverService.getById(serverId),
      channelService.getByServerIdForUser(serverId, actor, {
        serverMember: access.serverMember,
      }),
      membersPromise,
      buddyInboxesPromise,
      appIntegrationService.listSummaries(serverId, actor, {
        serverMember: access.serverMember,
      }),
    ])
    const [slashCommands, signedMembers, serverIconUrl, serverBannerUrl] = await Promise.all([
      getSlashCommandsForServerMembers(members),
      Promise.all(
        members.map(async (member) => ({
          ...member,
          user: member.user
            ? {
                ...member.user,
                avatarUrl: await resolveSignedMediaUrl(mediaService, member.user.avatarUrl, {
                  variant: 'avatar',
                }),
              }
            : null,
        })),
      ),
      resolveSignedMediaUrl(mediaService, server.iconUrl, { variant: 'avatar' }),
      resolveSignedMediaUrl(mediaService, server.bannerUrl, {
        variant: 'banner',
      }),
    ])

    return c.json({
      access: publicAccessStatus(access),
      channel,
      server: {
        ...server,
        iconUrl: serverIconUrl,
        bannerUrl: serverBannerUrl,
      },
      channels,
      buddyInboxes,
      appSummaries,
      members: signedMembers,
      messages,
      slashCommands,
    })
  })

  // GET /api/channels/:id
  channelHandler.get('/channels/:id', async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    const access = await getAccessStatus(id, c.get('user').userId)
    if (!access.canAccess) {
      return c.json({ ok: false, error: 'Not a member of this channel' }, 403)
    }
    const channel =
      access.channel.kind === 'dm'
        ? await channelService.getDirectChannelById(id, c.get('user').userId)
        : await channelService.getById(id)
    return c.json(channel)
  })

  // GET /api/channels/:id/access — access gate status for private-channel mentions/deep links
  channelHandler.get('/channels/:id/access', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').userId
    const access = await getAccessStatus(id, userId)
    return c.json(publicAccessStatus(access))
  })

  // GET /api/channels/:id/voice/state — current voice presence for a voice channel.
  channelHandler.get('/channels/:id/voice/state', async (c) => {
    const id = c.req.param('id')
    const state = await container.resolve('voiceChannelService').getState(c.get('actor'), id)
    return c.json(state)
  })

  // POST /api/channels/:id/voice/join — issue Agora credentials and mark actor connected.
  channelHandler.post('/channels/:id/voice/join', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const input = voiceJoinSchema.parse(body)
    const result = await container.resolve('voiceChannelService').join(c.get('actor'), id, input)
    try {
      container
        .resolve('io')
        .to([`voice:${id}`, `channel:${id}`])
        .emit(result.joined ? 'voice:participant-joined' : 'voice:participant-updated', {
          channelId: id,
          participant: result.participant,
          state: result.state,
        })
    } catch {
      /* non-critical */
    }
    return c.json(result)
  })

  // POST /api/channels/:id/voice/renew — issue fresh Agora credentials for a live client.
  channelHandler.post('/channels/:id/voice/renew', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const input = voiceParticipantSelectorSchema.parse(body)
    const result = await container
      .resolve('voiceChannelService')
      .renewCredentials(c.get('actor'), id, input)
    return c.json(result)
  })

  // POST /api/channels/:id/voice/leave — leave Agora voice state.
  channelHandler.post('/channels/:id/voice/leave', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const input = voiceParticipantSelectorSchema.parse(body)
    const result = await container.resolve('voiceChannelService').leave(c.get('actor'), id, input)
    try {
      if (result.left) {
        container
          .resolve('io')
          .to([`voice:${id}`, `channel:${id}`])
          .emit('voice:participant-left', {
            channelId: id,
            participant: result.participant,
            state: result.state,
          })
      }
    } catch {
      /* non-critical */
    }
    return c.json(result)
  })

  // PATCH /api/channels/:id/voice/state — mute/deafen/speaking/screen-share state.
  channelHandler.patch('/channels/:id/voice/state', async (c) => {
    const id = c.req.param('id')
    const input = voiceStatePatchSchema.parse(await c.req.json())
    const result = await container.resolve('voiceChannelService').updateParticipant(
      c.get('actor'),
      id,
      {
        isMuted: input.muted,
        isDeafened: input.deafened,
        isSpeaking: input.speaking,
        isScreenSharing: input.screenSharing,
      },
      { clientId: input.clientId },
    )
    try {
      container
        .resolve('io')
        .to([`voice:${id}`, `channel:${id}`])
        .emit('voice:participant-updated', {
          channelId: id,
          participant: result.participant,
          state: result.state,
        })
    } catch {
      /* non-critical */
    }
    return c.json(result)
  })

  // GET /api/channels/:id/voice-policy?agentId=... — Buddy voice standby policy.
  channelHandler.get('/channels/:id/voice-policy', async (c) => {
    const id = c.req.param('id')
    const agentId = c.req.query('agentId')
    if (!agentId) return c.json({ ok: false, error: 'agentId is required' }, 400)
    const channelService = container.resolve('channelService')
    const agentPolicyDao = container.resolve('agentPolicyDao')
    const channel = await channelService.getById(id)
    const serverId = requireServerChannel(channel)
    await container.resolve('policyService').requireChannelRead(c.get('actor'), id)
    const policy = await agentPolicyDao.findByChannel(agentId, serverId, id)
    const config = (policy?.config ?? {}) as Record<string, unknown>
    return c.json({
      agentId,
      channelId: id,
      listen: Boolean(config.voiceListen ?? policy?.listen ?? true),
      autoJoin: Boolean(config.voiceAutoJoin ?? false),
      consumeAudio: Boolean(config.voiceConsumeAudio ?? true),
      consumeScreenShare: Boolean(config.voiceConsumeScreenShare ?? true),
      screenshotIntervalSeconds:
        typeof config.voiceScreenshotIntervalSeconds === 'number'
          ? config.voiceScreenshotIntervalSeconds
          : null,
    })
  })

  // PUT /api/channels/:id/voice-policy — configure Buddy voice standby policy.
  channelHandler.put('/channels/:id/voice-policy', async (c) => {
    const id = c.req.param('id')
    const input = voicePolicySchema.parse(await c.req.json())
    const channelService = container.resolve('channelService')
    const agentPolicyService = container.resolve('agentPolicyService')
    const channel = await channelService.getById(id)
    const serverId = requireServerChannel(channel)
    await container.resolve('policyService').requireChannelManage(c.get('actor'), id)
    const [policy] = await agentPolicyService.upsertPolicies(input.agentId, [
      {
        serverId,
        channelId: id,
        listen: input.listen ?? input.consumeAudio ?? true,
        reply: false,
        mentionOnly: false,
        config: {
          voiceListen: input.listen ?? input.consumeAudio ?? true,
          voiceAutoJoin: input.autoJoin ?? false,
          voiceConsumeAudio: input.consumeAudio ?? true,
          voiceConsumeScreenShare: input.consumeScreenShare ?? true,
          ...(input.screenshotIntervalSeconds === undefined
            ? {}
            : { voiceScreenshotIntervalSeconds: input.screenshotIntervalSeconds }),
        },
      },
    ])
    try {
      container.resolve('io').to(`channel:${id}`).emit('voice:policy-updated', {
        channelId: id,
        agentId: input.agentId,
      })
    } catch {
      /* non-critical */
    }
    return c.json(policy)
  })

  // GET /api/channels/:id/members — returns channel members with full user info
  channelHandler.get('/channels/:id/members', async (c) => {
    const channelService = container.resolve('channelService')
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    const userId = c.get('user').userId
    const channel = await channelService.getById(id)
    const access = await getAccessStatus(id, userId)
    if (!access.canAccess) {
      return c.json({ ok: false, error: 'Not a member of this channel' }, 403)
    }
    const members = await channelService.getChannelMembers(id, channel.serverId)
    const signedMembers = await Promise.all(
      members.map(async (member) => ({
        ...member,
        user: member.user
          ? {
              ...member.user,
              avatarUrl: await resolveSignedMediaUrl(mediaService, member.user.avatarUrl, {
                variant: 'avatar',
              }),
            }
          : null,
      })),
    )
    return c.json(signedMembers)
  })

  // POST /api/channels/:id/join-requests — request approval to enter a private channel
  channelHandler.post('/channels/:id/join-requests', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').userId
    const access = await getAccessStatus(id, userId)

    if (!access.isServerMember) {
      return c.json({ ok: false, error: 'Join the server before requesting this channel' }, 403)
    }
    if (!access.channel.isPrivate) {
      if (!access.isChannelMember) {
        const channelUseCase = container.resolve('channelUseCase')
        await channelUseCase.requestChannelAccess({
          ctx: createActorContext(c.get('actor'), { route: c.req.path }),
          channelId: id,
          isPrivate: false,
        })
      }
      return c.json({ ok: true, status: 'approved' }, access.isChannelMember ? 200 : 201)
    }
    if (access.canAccess) return c.json({ ok: true, status: 'approved' })
    const serverId = requireServerChannel(access.channel)

    const channelUseCase = container.resolve('channelUseCase')
    const result = await channelUseCase.requestChannelAccess({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      channelId: id,
      isPrivate: true,
    })

    if (result.isNewRequest) {
      try {
        await notifyChannelJoinRequestReviewers({
          channelId: id,
          channelName: access.channel.name,
          serverId,
          requestId: result.requestId!,
          requesterId: userId,
        })
      } catch {
        /* non-critical */
      }
    }

    return c.json({ ok: true, status: 'pending', requestId: result.requestId }, 202)
  })

  // PATCH /api/channel-join-requests/:requestId — approve/reject a private-channel request
  channelHandler.patch(
    '/channel-join-requests/:requestId',
    zValidator('json', reviewJoinRequestSchema),
    async (c) => {
      const requestId = c.req.param('requestId')
      const userId = c.get('user').userId
      const { status } = c.req.valid('json')

      const channelUseCase = container.resolve('channelUseCase')
      const result = await channelUseCase.reviewChannelJoinRequest({
        ctx: createActorContext(c.get('actor'), { route: c.req.path }),
        requestId,
        status,
      })

      try {
        await notifyChannelJoinRequestDecision({
          channelId: result.channel.id,
          channelName: result.channel.name,
          serverId: result.serverId,
          userId: result.userId,
          reviewerId: userId,
          approved: result.approved,
        })
        await container
          .resolve('notificationService')
          .markReferenceAsRead(userId, 'channel_join_request', requestId)
      } catch {
        /* non-critical */
      }

      return c.json({ ok: true, request: result.request })
    },
  )

  // GET /api/channels/:id/slash-commands — commands registered by Buddies in this channel
  channelHandler.get('/channels/:id/slash-commands', async (c) => {
    const id = c.req.param('id')
    const requesterId = c.get('user').userId

    try {
      return c.json(await getSlashCommandsForChannel(id, requesterId))
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, error: (err as Error).message }, status as 403 | 404 | 500)
    }
  })

  // PATCH /api/channels/:id
  channelHandler.patch('/channels/:id', zValidator('json', updateChannelSchema), async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const channel = await channelService.update(id, input, c.get('actor'))
    return c.json(channel)
  })

  // DELETE /api/channels/:id
  channelHandler.delete('/channels/:id', async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    await channelService.delete(id, c.get('actor'))
    return c.json({ ok: true })
  })

  // PATCH /api/servers/:serverId/channels/positions
  channelHandler.patch(
    '/servers/:serverId/channels/positions',
    zValidator('json', channelPositionsSchema),
    async (c) => {
      const channelService = container.resolve('channelService')
      const serverId = await resolveServerId(c.req.param('serverId'))
      const { positions } = c.req.valid('json')
      const channels = await channelService.updatePositions(serverId, positions, c.get('actor'))
      return c.json(channels)
    },
  )

  // POST /api/channels/:id/members — add a user (typically a bot) to a channel
  channelHandler.post('/channels/:id/members', async (c) => {
    const serverDao = container.resolve('serverDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const id = c.req.param('id')
    const body = await c.req.json<{ userId?: string }>()
    const requesterId = c.get('user').userId

    const targetUserId = body.userId ?? requesterId

    // Make sure channel exists
    const channelService = container.resolve('channelService')
    const channel = await channelService.getById(id)
    const serverId = requireServerChannel(channel)

    // Both requester and target must be server members
    const [requesterServerMember, targetServerMember] = await Promise.all([
      serverDao.getMember(serverId, requesterId),
      serverDao.getMember(serverId, targetUserId),
    ])
    if (!requesterServerMember) {
      return c.json({ ok: false, error: 'Not a member of this server' }, 403)
    }
    const agentDao = container.resolve('agentDao')
    const targetAgent = await agentDao.findByUserId(targetUserId)
    if (targetAgent) {
      const rentalService = container.resolve('rentalService')
      const access = await rentalService.canUseAgent(targetAgent.id, requesterId)
      if (!access.canUse) {
        return c.json({ ok: false, error: 'Not the Buddy owner or active tenant' }, 403)
      }
      if (access.role === 'tenant' && getBuddyMode(targetAgent.config) !== 'shareable') {
        return c.json({ ok: false, error: 'Private Buddy cannot be added by tenants' }, 403)
      }
      if (!canBuddyJoinServer(targetAgent.config, serverId)) {
        return c.json({ ok: false, error: 'Private Buddy is not allowlisted for this server' }, 403)
      }
    }

    if (!targetServerMember) {
      if (targetAgent) {
        const serverService = container.resolve('serverService')
        await serverService.addBotMember(serverId, targetUserId)
      } else {
        const userDao = container.resolve('userDao')
        const targetUser = await userDao.findById(targetUserId)
        if (targetUser?.isBot) {
          return c.json({ ok: false, error: 'Buddy not found' }, 404)
        }
        return c.json({ ok: false, error: 'Target user is not a server member' }, 400)
      }
    }

    const isSelfJoin = requesterId === targetUserId
    const requesterInChannel = await channelMemberDao.get(id, requesterId)
    const requesterCanManageChannel =
      requesterServerMember.role === 'owner' || requesterServerMember.role === 'admin'

    if (isSelfJoin) {
      // Self-join to a private channel creates an approval request instead of bypassing the wall.
      if (channel.isPrivate) {
        const channelUseCase = container.resolve('channelUseCase')
        const result = await channelUseCase.requestChannelAccess({
          ctx: createActorContext(c.get('actor'), { route: c.req.path }),
          channelId: id,
          isPrivate: true,
        })
        if (result.isNewRequest) {
          try {
            await notifyChannelJoinRequestReviewers({
              channelId: id,
              channelName: channel.name,
              serverId,
              requestId: result.requestId!,
              requesterId,
            })
          } catch {
            /* non-critical */
          }
        }
        return c.json({ ok: true, status: 'pending', requestId: result.requestId }, 202)
      }
    } else {
      // Inviting others requires inviter already in channel
      if (!requesterInChannel && !requesterCanManageChannel) {
        return c.json({ ok: false, error: 'Only channel members can invite others' }, 403)
      }
    }

    // Add member via UseCase (handles authorization for non-self-join)
    const channelUseCase = container.resolve('channelUseCase')
    await channelUseCase.addChannelMember({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      channelId: id,
      targetUserId,
    })

    // Broadcast member:joined to the channel
    try {
      const io = container.resolve('io')
      const userDao = container.resolve('userDao')
      const targetUser = await userDao.findById(targetUserId)
      if (targetUser) {
        const payload = {
          serverId,
          channelId: id,
          userId: targetUserId,
          username: targetUser.username ?? 'unknown',
          displayName: targetUser.displayName ?? targetUser.username ?? 'unknown',
          avatarUrl: targetUser.avatarUrl ?? null,
          isBot: targetUser.isBot ?? false,
        }
        io.to(`channel:${id}`).emit('member:joined', payload)
        if (targetUser.isBot) {
          io.to(`channel:${id}`).emit('channel:slash-commands-updated', {
            channelId: id,
            serverId,
            botUserId: targetUserId,
          })
        }
        // Notify the user directly so they can join the channel room
        io.to(`user:${targetUserId}`).emit('channel:member-added', {
          channelId: id,
          serverId,
        })
        if (targetUser.isBot) {
          const agentDao = container.resolve('agentDao')
          const agent = await agentDao.findByUserId(targetUserId)
          if (agent) {
            io.to(`user:${targetUserId}`).emit('agent:policy-changed', {
              agentId: agent.id,
              serverId,
              channelId: id,
            })
          }
        }

        // Send channel invite notification (skip for bots)
        if (!targetUser.isBot) {
          try {
            const notificationTriggerService = container.resolve('notificationTriggerService')
            const inviter = c.get('user')
            const server = await serverDao.findById(serverId)
            await notificationTriggerService.triggerChannelMemberAdded({
              userId: targetUserId,
              actorId: inviter.userId,
              channelId: id,
              channelName: channel.name,
              serverId,
              serverName: server?.name,
            })
          } catch {
            /* non-critical */
          }
        }
      }
    } catch {
      /* non-critical */
    }

    return c.json({ ok: true }, 201)
  })

  // DELETE /api/channels/:id/members/:userId — remove a user from a channel
  channelHandler.delete('/channels/:id/members/:userId', async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    const targetUserId = c.req.param('userId')

    // Make sure channel exists
    const channel = await channelService.getById(id)

    // Remove member
    await channelService.removeMember(id, targetUserId, c.get('actor'))

    // Broadcast member:left to the channel
    try {
      const io = container.resolve('io')
      io.to(`channel:${id}`).emit('member:left', {
        serverId: channel.serverId,
        channelId: id,
        userId: targetUserId,
      })
      // Notify the user to leave the channel room
      io.to(`user:${targetUserId}`).emit('channel:member-removed', {
        channelId: id,
        serverId: channel.serverId,
      })
      const agentDao = container.resolve('agentDao')
      const agent = await agentDao.findByUserId(targetUserId)
      if (agent) {
        io.to(`user:${targetUserId}`).emit('agent:policy-changed', {
          agentId: agent.id,
          serverId: channel.serverId,
          channelId: id,
        })
      }
    } catch {
      /* non-critical */
    }

    return c.json({ ok: true })
  })

  // PUT /api/channels/:channelId/agents/:agentId/policy — set buddy policy for a channel
  channelHandler.put('/channels/:channelId/agents/:agentId/policy', async (c) => {
    const agentPolicyService = container.resolve('agentPolicyService')
    const agentService = container.resolve('agentService')
    const channelService = container.resolve('channelService')
    const rentalService = container.resolve('rentalService')
    const user = c.get('user')
    const channelId = c.req.param('channelId')
    const agentId = c.req.param('agentId')
    const body = await c.req
      .json<ChannelAgentPolicyBody>()
      .catch(() => ({}) as ChannelAgentPolicyBody)

    // Verify channel exists
    const channel = await channelService.getById(channelId)
    const serverId = requireServerChannel(channel)

    // Verify agent exists and the requester can use this Buddy as owner or active tenant.
    const agent = await agentService.getById(agentId)
    if (!agent) {
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }
    const access = await rentalService.canUseAgent(agentId, user.userId)
    if (!access.canUse) {
      return c.json({ ok: false, error: 'Not the Buddy owner or active tenant' }, 403)
    }

    // Determine policy fields based on mode.
    const listen = true
    let reply = true
    let mentionOnly = body.mentionOnly ?? false
    const config: Record<string, unknown> = {}

    if (body.mode) {
      switch (body.mode) {
        case 'replyAll':
          mentionOnly = false
          break
        case 'mentionOnly':
          mentionOnly = true
          break
        case 'disabled':
          mentionOnly = false
          reply = false
          break
        case 'custom':
          mentionOnly = body.config?.mentionOnly === true
          if (body.config?.replyToUsers?.length) {
            config.replyToUsers = body.config.replyToUsers
          }
          if (body.config?.keywords?.length) {
            config.keywords = body.config.keywords
          }
          if (typeof body.config?.replyToBuddy === 'boolean') {
            config.replyToBuddy = body.config.replyToBuddy
          }
          if (typeof body.config?.maxBuddyChainDepth === 'number') {
            config.maxBuddyChainDepth = body.config.maxBuddyChainDepth
          }
          if (body.config?.buddyBlacklist?.length) {
            config.buddyBlacklist = body.config.buddyBlacklist
          }
          if (body.config?.buddyWhitelist?.length) {
            config.buddyWhitelist = body.config.buddyWhitelist
          }
          if (typeof body.config?.smartReply === 'boolean') {
            config.smartReply = body.config.smartReply
          }
          config.mentionOnly = mentionOnly
          break
      }
    }

    // Upsert channel-level policy
    const policy = await agentPolicyService.upsertPolicies(agentId, [
      {
        serverId,
        channelId,
        listen,
        reply,
        mentionOnly,
        config,
      },
    ])

    // Broadcast policy change to the Buddy runtime so OpenClaw can react.
    try {
      const io = container.resolve('io')
      io.to(`user:${agent.userId}`).emit('agent:policy-changed', {
        agentId,
        serverId,
        channelId,
        mentionOnly,
        reply,
        config,
      })
    } catch {
      /* non-critical */
    }

    return c.json(policy)
  })

  // GET /api/channels/:channelId/agents/:agentId/policy — get buddy policy for a channel
  channelHandler.get('/channels/:channelId/agents/:agentId/policy', async (c) => {
    const agentPolicyDao = container.resolve('agentPolicyDao')
    const agentService = container.resolve('agentService')
    const channelService = container.resolve('channelService')
    const channelId = c.req.param('channelId')
    const agentId = c.req.param('agentId')

    const channel = await channelService.getById(channelId)
    const serverId = requireServerChannel(channel)
    const agent = await agentService.getById(agentId)
    if (!agent) {
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }

    // Try channel-level policy first, fall back to server default
    const channelPolicy = await agentPolicyDao.findByChannel(agentId, serverId, channelId)
    if (channelPolicy) {
      return c.json({
        mentionOnly: channelPolicy.mentionOnly,
        listen: channelPolicy.listen,
        reply: channelPolicy.reply,
        config: channelPolicy.config ?? {},
      })
    }

    const serverDefault = await agentPolicyDao.findServerDefault(agentId, serverId)
    return c.json({
      mentionOnly: serverDefault?.mentionOnly ?? false,
      listen: serverDefault?.listen ?? true,
      reply: serverDefault?.reply ?? true,
      config: serverDefault?.config ?? {},
    })
  })

  // POST /api/channels/:id/archive — archive a channel
  channelHandler.post('/channels/:id/archive', async (c) => {
    const channelService = container.resolve('channelService')
    const io = container.resolve('io')
    const id = c.req.param('id')
    const userId = c.get('user').userId
    const body = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string })
    const channel = await channelService.archive(id, c.get('actor'), body.reason)

    // Broadcast channel update to all users in the channel
    io.to(`channel:${id}`).emit('channel:updated', { id, isArchived: true })

    return c.json({ ok: true, channel })
  })

  // POST /api/channels/:id/unarchive — unarchive a channel
  channelHandler.post('/channels/:id/unarchive', async (c) => {
    const channelService = container.resolve('channelService')
    const io = container.resolve('io')
    const id = c.req.param('id')
    const channel = await channelService.unarchive(id, c.get('actor'))

    // Broadcast channel update to all users in the channel
    io.to(`channel:${id}`).emit('channel:updated', { id, isArchived: false })

    return c.json({ ok: true, channel })
  })

  // GET /api/servers/:serverId/channels/archived — list archived channels
  channelHandler.get('/servers/:serverId/channels/archived', async (c) => {
    const channelService = container.resolve('channelService')
    const serverId = await resolveServerId(c.req.param('serverId'))
    const channels = await channelService.getArchivedChannels(serverId, c.get('actor'))
    return c.json(channels)
  })

  return channelHandler
}
