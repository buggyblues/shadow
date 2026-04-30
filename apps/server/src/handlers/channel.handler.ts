import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { normalizeSlashCommands } from '../services/agent.service'
import {
  channelPositionsSchema,
  createChannelSchema,
  updateChannelSchema,
} from '../validators/channel.schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // POST /api/servers/:serverId/channels
  channelHandler.post(
    '/servers/:serverId/channels',
    zValidator('json', createChannelSchema),
    async (c) => {
      const channelService = container.resolve('channelService')
      const serverId = await resolveServerId(c.req.param('serverId'))
      const input = c.req.valid('json')
      const userId = c.get('user').userId
      const channel = await channelService.create(serverId, input, userId)

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
    const user = c.get('user')
    const channels = await channelService.getByServerIdForUser(serverId, user.userId)
    return c.json(channels)
  })

  // GET /api/channels/:id
  channelHandler.get('/channels/:id', async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    const channel = await channelService.getById(id)
    return c.json(channel)
  })

  // GET /api/channels/:id/members — returns channel members with full user info
  channelHandler.get('/channels/:id/members', async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    const channel = await channelService.getById(id)
    const members = await channelService.getChannelMembers(id, channel.serverId)
    return c.json(members)
  })

  // GET /api/channels/:id/slash-commands — commands registered by Buddies in this channel
  channelHandler.get('/channels/:id/slash-commands', async (c) => {
    const channelService = container.resolve('channelService')
    const serverDao = container.resolve('serverDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const agentDao = container.resolve('agentDao')
    const id = c.req.param('id')
    const requesterId = c.get('user').userId

    try {
      const channel = await channelService.getById(id)
      const requesterServerMember = await serverDao.getMember(channel.serverId, requesterId)
      if (!requesterServerMember) {
        return c.json({ ok: false, error: 'Not a member of this server' }, 403)
      }

      if (channel.isPrivate) {
        const requesterInChannel = await channelMemberDao.get(id, requesterId)
        const requesterCanManageChannel =
          requesterServerMember.role === 'owner' || requesterServerMember.role === 'admin'
        if (!requesterInChannel && !requesterCanManageChannel) {
          return c.json({ ok: false, error: 'Not a member of this channel' }, 403)
        }
      }

      const members = await channelService.getChannelMembers(id, channel.serverId)
      const botMembers = members.filter((member) => member.user?.isBot)
      const botUserIds = botMembers.map((member) => member.userId)
      const agents = await agentDao.findByUserIds(botUserIds)
      const memberByUserId = new Map(botMembers.map((member) => [member.userId, member]))

      const commands = agents.flatMap((agent) => {
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
      })

      return c.json({ commands })
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
    const channel = await channelService.update(id, input)
    return c.json(channel)
  })

  // DELETE /api/channels/:id
  channelHandler.delete('/channels/:id', async (c) => {
    const channelService = container.resolve('channelService')
    const id = c.req.param('id')
    await channelService.delete(id)
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
      const channels = await channelService.updatePositions(serverId, positions)
      return c.json(channels)
    },
  )

  // POST /api/channels/:id/members — add a user (typically a bot) to a channel
  channelHandler.post('/channels/:id/members', async (c) => {
    const channelService = container.resolve('channelService')
    const serverDao = container.resolve('serverDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const id = c.req.param('id')
    const body = await c.req.json<{ userId?: string }>()
    const requesterId = c.get('user').userId

    const targetUserId = body.userId ?? requesterId

    // Make sure channel exists
    const channel = await channelService.getById(id)

    // Both requester and target must be server members
    const [requesterServerMember, targetServerMember] = await Promise.all([
      serverDao.getMember(channel.serverId, requesterId),
      serverDao.getMember(channel.serverId, targetUserId),
    ])
    if (!requesterServerMember) {
      return c.json({ ok: false, error: 'Not a member of this server' }, 403)
    }
    if (!targetServerMember) {
      // If target is a bot, auto-add to server as member
      const userDao = container.resolve('userDao')
      const targetUser = await userDao.findById(targetUserId)
      if (targetUser?.isBot) {
        const serverService = container.resolve('serverService')
        await serverService.addBotMember(channel.serverId, targetUserId)
      } else {
        return c.json({ ok: false, error: 'Target user is not a server member' }, 400)
      }
    }

    const isSelfJoin = requesterId === targetUserId
    const requesterInChannel = await channelMemberDao.get(id, requesterId)
    const requesterCanManageChannel =
      requesterServerMember.role === 'owner' || requesterServerMember.role === 'admin'

    if (isSelfJoin) {
      // Self-join is allowed only for public channels
      if (channel.isPrivate) {
        return c.json({ ok: false, error: 'Private channel requires an invite' }, 403)
      }
    } else {
      // Inviting others requires inviter already in channel
      if (!requesterInChannel && !requesterCanManageChannel) {
        return c.json({ ok: false, error: 'Only channel members can invite others' }, 403)
      }
    }

    // Add member
    await channelService.addMember(id, targetUserId)

    // Broadcast member:joined to the channel
    try {
      const io = container.resolve('io')
      const userDao = container.resolve('userDao')
      const targetUser = await userDao.findById(targetUserId)
      if (targetUser) {
        const payload = {
          serverId: channel.serverId,
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
            serverId: channel.serverId,
            botUserId: targetUserId,
          })
        }
        // Notify the user directly so they can join the channel room
        io.to(`user:${targetUserId}`).emit('channel:member-added', {
          channelId: id,
          serverId: channel.serverId,
        })

        // Send channel invite notification (skip for bots)
        if (!targetUser.isBot) {
          try {
            const notificationService = container.resolve('notificationService')
            const inviter = c.get('user')
            const notification = await notificationService.create({
              userId: targetUserId,
              type: 'system',
              title: `You have been added to channel #${channel.name}`,
              referenceId: id,
              referenceType: 'channel_invite',
              senderId: inviter.userId,
            })
            io.to(`user:${targetUserId}`).emit('notification:new', notification)
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
    await channelService.removeMember(id, targetUserId)

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
    const user = c.get('user')
    const channelId = c.req.param('channelId')
    const agentId = c.req.param('agentId')
    const body = await c.req.json<{
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
    }>()

    // Verify channel exists
    const channel = await channelService.getById(channelId)

    // Verify agent exists and user owns it OR user is server admin/owner
    const agent = await agentService.getById(agentId)
    if (!agent) {
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }
    const serverService = container.resolve('serverService')
    const serverMembers = await serverService.getMembers(channel.serverId)
    const requester = serverMembers.find((m) => m.userId === user.userId)
    const isAdminOrOwner = requester?.role === 'owner' || requester?.role === 'admin'
    if (agent.ownerId !== user.userId && !isAdminOrOwner) {
      return c.json({ ok: false, error: 'Not authorized' }, 403)
    }

    // Determine policy fields based on mode
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
        serverId: channel.serverId,
        channelId,
        listen,
        reply,
        mentionOnly,
        config,
      },
    ])

    // Broadcast policy change to the bot so openclaw can react
    try {
      const io = container.resolve('io')
      io.to(`user:${agent.userId}`).emit('agent:policy-changed', {
        agentId,
        serverId: channel.serverId,
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
    const agent = await agentService.getById(agentId)
    if (!agent) {
      return c.json({ ok: false, error: 'Agent not found' }, 404)
    }

    // Try channel-level policy first, fall back to server default
    const channelPolicy = await agentPolicyDao.findByChannel(agentId, channel.serverId, channelId)
    if (channelPolicy) {
      return c.json({
        mentionOnly: channelPolicy.mentionOnly,
        listen: channelPolicy.listen,
        reply: channelPolicy.reply,
        config: channelPolicy.config ?? {},
      })
    }

    const serverDefault = await agentPolicyDao.findServerDefault(agentId, channel.serverId)
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
    const channel = await channelService.archive(id, userId, body.reason)

    // Broadcast channel update to all users in the channel
    io.to(`channel:${id}`).emit('channel:updated', { id, isArchived: true })

    return c.json({ ok: true, channel })
  })

  // POST /api/channels/:id/unarchive — unarchive a channel
  channelHandler.post('/channels/:id/unarchive', async (c) => {
    const channelService = container.resolve('channelService')
    const io = container.resolve('io')
    const id = c.req.param('id')
    const channel = await channelService.unarchive(id)

    // Broadcast channel update to all users in the channel
    io.to(`channel:${id}`).emit('channel:updated', { id, isArchived: false })

    return c.json({ ok: true, channel })
  })

  // GET /api/servers/:serverId/channels/archived — list archived channels
  channelHandler.get('/servers/:serverId/channels/archived', async (c) => {
    const channelService = container.resolve('channelService')
    const serverId = await resolveServerId(c.req.param('serverId'))
    const channels = await channelService.getArchivedChannels(serverId)
    return c.json(channels)
  })

  return channelHandler
}
