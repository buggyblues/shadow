import { type ChannelDao, normalizeDirectPair } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { MessageDao } from '../dao/message.dao'
import type { ServerDao } from '../dao/server.dao'
import { withResolvedAvatarUrl } from '../lib/avatar-url'
import { type ActorInput, actorUserId } from '../security/actor'
import type { CreateChannelInput, UpdateChannelInput } from '../validators/channel.schema'
import { isBuddyInboxTopic } from './buddy-inbox-protocol'
import type { MediaService } from './media.service'
import type { PolicyService } from './policy.service'
import type { ServerService } from './server.service'

type ServerMemberList = Awaited<ReturnType<ServerService['getMembers']>>
type VisibleServerChannel = Awaited<ReturnType<ChannelDao['findByServerId']>>[number] & {
  isMember: boolean
}

export class ChannelService {
  constructor(
    private deps: {
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      serverDao: ServerDao
      serverService: ServerService
      policyService: PolicyService
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
      messageDao?: Pick<MessageDao, 'findChannelListPreviews'>
    },
  ) {}

  private withSignedDirectPeer<T extends { otherUser?: { avatarUrl?: string | null } | null }>(
    channel: T,
  ): T {
    if (!channel.otherUser) return channel
    return {
      ...channel,
      otherUser: withResolvedAvatarUrl(this.deps.mediaService, channel.otherUser),
    }
  }

  /** Generate a unique channel name within a server, appending -2, -3, etc. if needed. */
  private async generateUniqueName(
    serverId: string,
    name: string,
    excludeChannelId?: string,
  ): Promise<string> {
    const existing = await this.deps.channelDao.findByServerIdAndNamePrefix(serverId, name)
    const existingNames = new Set(existing.map((ch) => ch.name.toLowerCase()))
    // If no conflict (or only conflict is the channel being renamed), return as-is
    if (!existingNames.has(name.toLowerCase())) return name
    if (excludeChannelId) {
      // When renaming, check if the only conflict IS the channel itself
      const allChannels = await this.deps.channelDao.findByServerId(serverId)
      const conflicting = allChannels.filter(
        (ch) => ch.name.toLowerCase() === name.toLowerCase() && ch.id !== excludeChannelId,
      )
      if (conflicting.length === 0) return name
    }
    // Find the next available suffix
    for (let i = 2; i < 100; i++) {
      const candidate = `${name}-${i}`
      if (!existingNames.has(candidate.toLowerCase())) return candidate
    }
    return `${name}-${Date.now()}`
  }

  async create(serverId: string, input: CreateChannelInput, creator?: ActorInput) {
    if (!creator) {
      throw Object.assign(new Error('Authenticated actor is required'), { status: 401 })
    }
    await this.deps.policyService.requireServerRole(creator, serverId, 'admin')
    const uniqueName = await this.generateUniqueName(serverId, input.name)
    const channel = await this.deps.channelDao.create({
      name: uniqueName,
      serverId,
      type: input.type,
      topic: input.topic,
      isPrivate: input.isPrivate,
      lastMessageAt: new Date(),
    })

    // Add only the creator to the new channel
    // Other members (including bots) need to be explicitly invited
    if (channel) {
      try {
        await this.deps.channelMemberDao.add(channel.id, actorUserId(creator))
      } catch {
        /* channel_members table may not exist yet, or system actor has no user id */
      }
    }

    return channel
  }

  async getByServerId(serverId: string) {
    return this.deps.channelDao.findByServerId(serverId)
  }

  private async withChannelListPreviews<T extends VisibleServerChannel>(channels: T[]) {
    if (!this.deps.messageDao || channels.length === 0) return channels

    const previewByChannel = await this.deps.messageDao.findChannelListPreviews(
      channels.map((channel) => channel.id),
      6,
    )
    return channels.map((channel) => ({
      ...channel,
      lastMessagePreview: previewByChannel.get(channel.id)?.lastMessagePreview ?? null,
      memberPreviews: previewByChannel.get(channel.id)?.memberPreviews ?? [],
    }))
  }

  /** Get channels for a server, filtered to only those the user can see. */
  async getByServerIdForUser(
    serverId: string,
    actor: ActorInput,
    options?: {
      serverMember?: Awaited<ReturnType<PolicyService['requireServerMember']>> | null
    },
  ) {
    const userId = actorUserId(actor)
    const serverMember =
      options?.serverMember ?? (await this.deps.policyService.requireServerMember(actor, serverId))
    const allChannels = (await this.deps.channelDao.findByServerId(serverId)).filter(
      (ch) => !ch.name.startsWith('app:') && !isBuddyInboxTopic(ch.topic),
    )
    if (allChannels.length === 0) return []
    try {
      const canManage = serverMember?.role === 'owner' || serverMember?.role === 'admin'
      const channelIds = allChannels.map((ch) => ch.id)
      const memberChannelIds = await this.deps.channelMemberDao.getUserChannelIds(
        userId,
        channelIds,
      )
      if (canManage) {
        const memberSet = new Set(memberChannelIds)
        return this.withChannelListPreviews(
          allChannels.map((ch) => ({ ...ch, isMember: memberSet.has(ch.id) || ch.isPrivate })),
        )
      }
      // Legacy fallback: if memberships are empty, only expose public channels
      if (memberChannelIds.length === 0) {
        return this.withChannelListPreviews(
          allChannels.filter((ch) => !ch.isPrivate).map((ch) => ({ ...ch, isMember: false })),
        )
      }
      const memberSet = new Set(memberChannelIds)
      return this.withChannelListPreviews(
        allChannels
          .filter((ch) => !ch.isPrivate || memberSet.has(ch.id))
          .map((ch) => ({ ...ch, isMember: memberSet.has(ch.id) })),
      )
    } catch {
      // Table may not exist yet (pre-migration) — do not leak private channels
      return this.withChannelListPreviews(
        allChannels.filter((ch) => !ch.isPrivate).map((ch) => ({ ...ch, isMember: false })),
      )
    }
  }

  async getById(id: string) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    return channel
  }

  async update(id: string, input: UpdateChannelInput, actor: ActorInput) {
    const channel = await this.deps.policyService.requireChannelManage(actor, id)
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Direct channels cannot be managed through server routes'), {
        status: 400,
      })
    }
    // Auto-rename if the new name conflicts with an existing channel in the same server
    if (input.name) {
      input = { ...input, name: await this.generateUniqueName(channel.serverId, input.name, id) }
    }
    const updated = await this.deps.channelDao.update(id, input)
    if (!updated) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    return updated
  }

  async delete(id: string, actor: ActorInput) {
    const channel = await this.deps.policyService.requireChannelManage(actor, id)
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Direct channels cannot be managed through server routes'), {
        status: 400,
      })
    }
    await this.deps.channelDao.delete(id)
  }

  async updatePositions(
    serverId: string,
    positions: { id: string; position: number }[],
    actor: ActorInput,
  ) {
    if (positions.length === 0) {
      throw Object.assign(new Error('Positions array cannot be empty'), { status: 400 })
    }
    await this.deps.policyService.requireServerRole(actor, serverId, 'admin')
    await this.deps.channelDao.updatePositions(positions)
    return this.deps.channelDao.findByServerId(serverId)
  }

  /** Add a user to a channel. */
  async addMember(channelId: string, userId: string) {
    return this.deps.channelMemberDao.add(channelId, userId)
  }

  /** Remove a user from a channel. */
  async removeMember(channelId: string, userId: string, actor?: ActorInput) {
    const requesterUserId = actor ? actorUserId(actor) : null
    if (actor && requesterUserId !== userId) {
      await this.deps.policyService.requireChannelManage(actor, channelId)
    }
    return this.deps.channelMemberDao.remove(channelId, userId)
  }

  /** Add a user to all channels in a server. */
  async addMemberToAllChannels(serverId: string, userId: string) {
    const channels = await this.deps.channelDao.findByServerId(serverId)
    const channelIds = channels.map((ch) => ch.id)
    await this.deps.channelMemberDao.addBulk(channelIds, userId)
  }

  /**
   * Get members of a channel with full user info and server role.
   * Falls back to server members if channel_members table doesn't exist.
   */
  async getChannelMembers(
    channelId: string,
    serverId: string | null,
    options?: {
      channel?: { kind: string } | null
      serverMembers?: ServerMemberList
    },
  ) {
    const channel =
      options && 'channel' in options
        ? options.channel
        : await this.deps.channelDao.findById(channelId)
    if (channel?.kind === 'dm') {
      return this.deps.channelMemberDao.getMembersWithUsers(channelId)
    }
    if (!serverId) return []
    try {
      // Get channel member user IDs
      const channelMemberRows = await this.deps.channelMemberDao.getMembers(channelId)
      const channelUserIds = channelMemberRows.map((r) => r.userId)

      if (channelUserIds.length === 0) {
        // No channel members found — either empty or legacy data without channel_members.
        // Fall back to server members.
        return options?.serverMembers ?? this.deps.serverService.getMembers(serverId)
      }

      // Get full server member data (role, nickname, user info)
      const allServerMembers =
        options?.serverMembers ?? (await this.deps.serverService.getMembers(serverId))
      const channelUserIdSet = new Set(channelUserIds)

      // Filter to only those in the channel
      return allServerMembers.filter((m) => channelUserIdSet.has(m.userId))
    } catch {
      // channel_members table may not exist — fall back to server members
      return options?.serverMembers ?? this.deps.serverService.getMembers(serverId)
    }
  }

  /** Archive a channel */
  async archive(id: string, actor: ActorInput, _reason?: string) {
    const channel = await this.deps.policyService.requireChannelManage(actor, id)
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Direct channels cannot be managed through server routes'), {
        status: 400,
      })
    }
    if (channel.isArchived) {
      throw Object.assign(new Error('Channel is already archived'), { status: 400 })
    }
    const archived = await this.deps.channelDao.archive(id, actorUserId(actor))
    if (!archived) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    return archived
  }

  /** Unarchive a channel */
  async unarchive(id: string, actor: ActorInput) {
    const channel = await this.deps.policyService.requireChannelManage(actor, id)
    if (channel.kind !== 'server' || !channel.serverId) {
      throw Object.assign(new Error('Direct channels cannot be managed through server routes'), {
        status: 400,
      })
    }
    if (!channel.isArchived) {
      throw Object.assign(new Error('Channel is not archived'), { status: 400 })
    }
    const unarchived = await this.deps.channelDao.unarchive(id)
    if (!unarchived) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    return unarchived
  }

  /** Get archived channels for a server */
  async getArchivedChannels(serverId: string, actor: ActorInput) {
    await this.deps.policyService.requireServerMember(actor, serverId)
    return this.deps.channelDao.findArchivedByServerId(serverId)
  }

  async getOrCreateDirectChannel(viewerUserId: string, peerUserId: string) {
    if (viewerUserId === peerUserId) {
      throw Object.assign(new Error('Cannot create a direct channel with yourself'), {
        status: 400,
      })
    }
    const pair = normalizeDirectPair(viewerUserId, peerUserId)
    const existing = await this.deps.channelDao.findDirectByPair(pair.userAId, pair.userBId)
    if (existing) {
      return { channel: await this.withDirectPeer(existing, viewerUserId), created: false }
    }

    const channel = await this.deps.channelDao.createDirectChannel(pair)
    if (!channel) {
      const refetched = await this.deps.channelDao.findDirectByPair(pair.userAId, pair.userBId)
      if (!refetched) {
        throw Object.assign(new Error('Failed to create direct channel'), { status: 500 })
      }
      return { channel: await this.withDirectPeer(refetched, viewerUserId), created: false }
    }

    await this.deps.channelMemberDao.add(channel.id, pair.userAId)
    await this.deps.channelMemberDao.add(channel.id, pair.userBId)
    return { channel: await this.withDirectPeer(channel, viewerUserId), created: true }
  }

  async listDirectChannels(userId: string) {
    const channels = await this.deps.channelDao.findDirectChannelsForUser(userId)
    return channels.map((channel) => this.withSignedDirectPeer(channel))
  }

  async getDirectChannelById(channelId: string, viewerUserId: string) {
    const channel = await this.deps.channelDao.findById(channelId)
    if (!channel || channel.kind !== 'dm') {
      throw Object.assign(new Error('Direct channel not found'), { status: 404 })
    }
    const member = await this.deps.channelMemberDao.get(channelId, viewerUserId)
    if (!member) {
      throw Object.assign(new Error('Not a participant of this direct channel'), { status: 403 })
    }
    return this.withDirectPeer(channel, viewerUserId)
  }

  async findDirectPeer(channelId: string, viewerUserId: string) {
    const peer = await this.deps.channelDao.findDirectPeer(channelId, viewerUserId)
    return peer ? withResolvedAvatarUrl(this.deps.mediaService, peer) : null
  }

  private async withDirectPeer<T extends { id: string; kind: string }>(
    channel: T,
    viewerUserId: string,
  ) {
    if (channel.kind !== 'dm') return channel
    const otherUser = await this.deps.channelDao.findDirectPeer(channel.id, viewerUserId)
    return this.withSignedDirectPeer({ ...channel, otherUser })
  }
}
