import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ServerDao } from '../dao/server.dao'

type ChannelRecord = NonNullable<Awaited<ReturnType<ChannelDao['findById']>>>
type ServerMemberRecord = Awaited<ReturnType<ServerDao['getMember']>>
type ChannelMemberRecord = Awaited<ReturnType<ChannelMemberDao['get']>>

export type ChannelAccess = {
  ok: boolean
  status?: 403 | 404
  error?: string
  channel?: ChannelRecord
  serverMember?: ServerMemberRecord | null
  channelMember?: ChannelMemberRecord | null
  canManage: boolean
  canAccess: boolean
  kind?: 'server' | 'dm'
}

export class ChannelAccessService {
  constructor(
    private deps: {
      channelDao: ChannelDao
      serverDao: ServerDao
      channelMemberDao: ChannelMemberDao
    },
  ) {}

  async getAccess(channelId: string, userId: string): Promise<ChannelAccess> {
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel) {
      return {
        ok: false,
        status: 404,
        error: 'Channel not found',
        canManage: false,
        canAccess: false,
      }
    }

    if (channel.kind === 'dm') {
      const channelMember = await this.deps.channelMemberDao.get(channelId, userId)
      const canAccess = Boolean(channelMember)
      return {
        ok: canAccess,
        status: canAccess ? undefined : 403,
        error: canAccess ? undefined : 'Not a participant of this direct channel',
        channel,
        channelMember,
        serverMember: null,
        canManage: false,
        canAccess,
        kind: 'dm',
      }
    }

    if (!channel.serverId) {
      return {
        ok: false,
        status: 404,
        error: 'Channel not found',
        channel,
        canManage: false,
        canAccess: false,
        kind: 'server',
      }
    }

    const serverMember = await this.deps.serverDao.getMember(channel.serverId, userId)
    if (!serverMember) {
      return {
        ok: false,
        status: 403,
        error: 'Not a member of this server',
        channel,
        serverMember,
        canManage: false,
        canAccess: false,
        kind: 'server',
      }
    }

    const channelMember = await this.deps.channelMemberDao.get(channelId, userId)
    const canManage = serverMember.role === 'owner' || serverMember.role === 'admin'
    if (channel.isPrivate && !channelMember && !canManage) {
      return {
        ok: false,
        status: 403,
        error: 'Not a member of this channel',
        channel,
        serverMember,
        channelMember,
        canManage,
        canAccess: false,
        kind: 'server',
      }
    }

    if (!channel.isPrivate && !channelMember) {
      await this.deps.channelMemberDao.add(channelId, userId).catch(() => null)
    }

    return {
      ok: true,
      channel,
      serverMember,
      channelMember,
      canManage,
      canAccess: true,
      kind: 'server',
    }
  }

  async assertCanRead(channelId: string, userId: string) {
    const access = await this.getAccess(channelId, userId)
    if (!access.ok || !access.channel) {
      throw Object.assign(new Error(access.error ?? 'Channel access denied'), {
        status: access.status ?? 403,
      })
    }
    return access.channel
  }

  async assertCanSend(channelId: string, userId: string) {
    return this.assertCanRead(channelId, userId)
  }

  async assertCanManage(channelId: string, userId: string) {
    const access = await this.getAccess(channelId, userId)
    if (!access.ok || !access.channel) {
      throw Object.assign(new Error(access.error ?? 'Channel access denied'), {
        status: access.status ?? 403,
      })
    }
    if (!access.canManage) {
      throw Object.assign(new Error('Requires admin role or higher'), { status: 403 })
    }
    return access.channel
  }
}
