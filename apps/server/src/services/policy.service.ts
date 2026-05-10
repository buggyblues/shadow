import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ServerDao } from '../dao/server.dao'
import { type Actor, type ActorInput, actorHasScope, actorUserId } from '../security/actor'

type ServerRole = 'owner' | 'admin' | 'member'

const ROLE_WEIGHT: Record<ServerRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
}

export class PolicyService {
  constructor(
    private deps: {
      serverDao: ServerDao
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
    },
  ) {}

  requireCapability(actor: Actor, capability: string) {
    if (!actorHasScope(actor, capability)) {
      throw Object.assign(new Error(`Requires capability: ${capability}`), { status: 403 })
    }
  }

  async requireServerMember(actor: ActorInput, serverId: string) {
    const userId = actorUserId(actor)
    const member = await this.deps.serverDao.getMember(serverId, userId)
    if (!member) {
      throw Object.assign(new Error('Not a member of this server'), { status: 403 })
    }
    return member
  }

  async requireServerRole(actor: ActorInput, serverId: string, minRole: ServerRole) {
    const member = await this.requireServerMember(actor, serverId)
    if ((ROLE_WEIGHT[member.role] ?? 0) < ROLE_WEIGHT[minRole]) {
      throw Object.assign(new Error(`Requires ${minRole} role or higher`), { status: 403 })
    }
    return member
  }

  async requireServerOwner(actor: ActorInput, serverId: string) {
    return this.requireServerRole(actor, serverId, 'owner')
  }

  async requireChannelRead(actor: ActorInput, channelId: string) {
    const userId = actorUserId(actor)
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel) throw Object.assign(new Error('Channel not found'), { status: 404 })

    if (channel.kind === 'dm') {
      const channelMember = await this.deps.channelMemberDao.get(channelId, userId)
      if (!channelMember) {
        throw Object.assign(new Error('Not a participant of this direct channel'), { status: 403 })
      }
      return { channel, serverMember: null, channelMember }
    }

    if (!channel.serverId) throw Object.assign(new Error('Channel not found'), { status: 404 })
    const serverMember = await this.deps.serverDao.getMember(channel.serverId, userId)
    if (!serverMember) {
      throw Object.assign(new Error('Not a member of this server'), { status: 403 })
    }
    if (!channel.isPrivate || serverMember.role === 'owner' || serverMember.role === 'admin') {
      return { channel, serverMember }
    }

    const channelMember = await this.deps.channelMemberDao.get(channelId, userId)
    if (!channelMember) {
      throw Object.assign(new Error('Not a member of this channel'), { status: 403 })
    }
    return { channel, serverMember, channelMember }
  }

  async requireChannelManage(actor: ActorInput, channelId: string) {
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel) throw Object.assign(new Error('Channel not found'), { status: 404 })
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Direct channels cannot be managed through server policy'), {
        status: 403,
      })
    }
    await this.requireServerRole(actor, channel.serverId, 'admin')
    return channel
  }

  async accessibleChannelIds(actor: ActorInput, serverId?: string): Promise<string[]> {
    const userId = actorUserId(actor)
    const serverRows = serverId
      ? [{ server: await this.deps.serverDao.findById(serverId) }]
      : await this.deps.serverDao.findByUserId(userId)

    const channelIds = new Set<string>()
    for (const row of serverRows) {
      const server = row.server
      if (!server) continue

      const member = await this.deps.serverDao.getMember(server.id, userId)
      if (!member) {
        if (serverId) {
          throw Object.assign(new Error('Not a member of this server'), { status: 403 })
        }
        continue
      }

      const channels = await this.deps.channelDao.findByServerId(server.id)
      const privateChannels = channels.filter((channel) => channel.isPrivate)
      const publicChannels = channels.filter((channel) => !channel.isPrivate)
      for (const channel of publicChannels) channelIds.add(channel.id)

      if (member.role === 'owner' || member.role === 'admin') {
        for (const channel of privateChannels) channelIds.add(channel.id)
        continue
      }

      const privateIds = privateChannels.map((channel) => channel.id)
      const joined = await this.deps.channelMemberDao.getUserChannelIds(userId, privateIds)
      for (const channelId of joined) channelIds.add(channelId)
    }

    if (!serverId) {
      const directChannelIds = await this.deps.channelMemberDao.getAllChannelIds(userId)
      for (const channelId of directChannelIds) {
        const channel = await this.deps.channelDao.findById(channelId)
        if (channel?.kind === 'dm') channelIds.add(channelId)
      }
    }

    return [...channelIds]
  }
}
