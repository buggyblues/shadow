import type { ChannelPostingRule } from '@shadowob/shared'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ChannelPostingRuleDao } from '../dao/channel-posting-rule.dao'
import type { ServerDao } from '../dao/server.dao'
import type { CreateChannelInput, UpdateChannelInput } from '../validators/channel.schema'

export class ChannelService {
  constructor(
    private deps: {
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      channelPostingRuleDao: ChannelPostingRuleDao
      serverDao: ServerDao
    },
  ) {}

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

  async create(serverId: string, input: CreateChannelInput, creatorUserId?: string) {
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
    if (channel && creatorUserId) {
      try {
        await this.deps.channelMemberDao.add(channel.id, creatorUserId)
      } catch {
        /* channel_members table may not exist yet */
      }
    }

    return channel
  }

  async getByServerId(serverId: string) {
    return this.deps.channelDao.findByServerId(serverId)
  }

  /** Get channels for a server, filtered to only those the user is a member of. */
  async getByServerIdForUser(serverId: string, userId: string) {
    const allChannels = (await this.deps.channelDao.findByServerId(serverId)).filter(
      (ch) => !ch.name.startsWith('app:'),
    )
    if (allChannels.length === 0) return []

    // Load posting rules for all channels
    const postingRules = await Promise.all(
      allChannels.map((ch) => this.deps.channelPostingRuleDao.findByChannelId(ch.id)),
    )

    try {
      const channelIds = allChannels.map((ch) => ch.id)
      const memberChannelIds = await this.deps.channelMemberDao.getUserChannelIds(
        userId,
        channelIds,
      )
      // Legacy fallback: if memberships are empty, only expose public channels
      if (memberChannelIds.length === 0) {
        return allChannels
          .filter((ch) => !ch.isPrivate)
          .map((ch, idx) => ({ ...ch, isMember: false, postingRule: postingRules[idx] }))
      }
      const memberSet = new Set(memberChannelIds)
      return allChannels
        .filter((ch) => !ch.isPrivate || memberSet.has(ch.id))
        .map((ch, idx) => ({
          ...ch,
          isMember: memberSet.has(ch.id),
          postingRule: postingRules[idx],
        }))
    } catch {
      // Table may not exist yet (pre-migration) — do not leak private channels
      return allChannels
        .filter((ch) => !ch.isPrivate)
        .map((ch, idx) => ({ ...ch, isMember: false, postingRule: postingRules[idx] }))
    }
  }

  async getById(id: string) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    // Load posting rule if exists
    const postingRule = await this.deps.channelPostingRuleDao.findByChannelId(id)
    return { ...channel, postingRule }
  }

  async update(id: string, input: UpdateChannelInput) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    // Auto-rename if the new name conflicts with an existing channel in the same server
    if (input.name) {
      input = { ...input, name: await this.generateUniqueName(channel.serverId, input.name, id) }
    }
    return this.deps.channelDao.update(id, input)
  }

  async delete(id: string) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    await this.deps.channelDao.delete(id)
  }

  async updatePositions(serverId: string, positions: { id: string; position: number }[]) {
    if (positions.length === 0) {
      throw Object.assign(new Error('Positions array cannot be empty'), { status: 400 })
    }
    await this.deps.channelDao.updatePositions(positions)
    return this.deps.channelDao.findByServerId(serverId)
  }

  /** Add a user to a channel. */
  async addMember(channelId: string, userId: string) {
    return this.deps.channelMemberDao.add(channelId, userId)
  }

  /** Remove a user from a channel. */
  async removeMember(channelId: string, userId: string) {
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
  async getChannelMembers(channelId: string, serverId: string) {
    try {
      // Get channel member user IDs
      const channelMemberRows = await this.deps.channelMemberDao.getMembers(channelId)
      const channelUserIds = channelMemberRows.map((r) => r.userId)

      if (channelUserIds.length === 0) {
        // No channel members found — either empty or legacy data without channel_members.
        // Fall back to server members.
        return this.deps.serverDao.getMembers(serverId)
      }

      // Get full server member data (role, nickname, user info)
      const allServerMembers = await this.deps.serverDao.getMembers(serverId)

      // Filter to only those in the channel
      return allServerMembers.filter((m) => channelUserIds.includes(m.userId))
    } catch {
      // channel_members table may not exist — fall back to server members
      return this.deps.serverDao.getMembers(serverId)
    }
  }

  /** Archive a channel */
  async archive(id: string, userId: string, _reason?: string) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    if (channel.isArchived) {
      throw Object.assign(new Error('Channel is already archived'), { status: 400 })
    }
    return this.deps.channelDao.archive(id, userId)
  }

  /** Unarchive a channel */
  async unarchive(id: string) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    if (!channel.isArchived) {
      throw Object.assign(new Error('Channel is not archived'), { status: 400 })
    }
    return this.deps.channelDao.unarchive(id)
  }

  /** Get archived channels for a server */
  async getArchivedChannels(serverId: string) {
    return this.deps.channelDao.findArchivedByServerId(serverId)
  }
}
