import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { ServerDao } from '../dao/server.dao'
import type { CreateChannelInput, UpdateChannelInput } from '../validators/channel.schema'

export class ChannelService {
  constructor(
    private deps: {
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
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
    })

    // Add creator and bot members to the new channel
    // Other human members need to be explicitly invited
    if (channel) {
      try {
        const channelId = channel.id
        if (creatorUserId) {
          await this.deps.channelMemberDao.add(channelId, creatorUserId)
        }
        // Auto-add bot members so they can respond in the channel
        const members = await this.deps.serverDao.getMembers(serverId)
        for (const m of members) {
          if (m.user?.isBot) {
            await this.deps.channelMemberDao.add(channelId, m.userId)
          }
        }
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
    const allChannels = await this.deps.channelDao.findByServerId(serverId)
    if (allChannels.length === 0) return []
    try {
      const channelIds = allChannels.map((ch) => ch.id)
      const memberChannelIds = await this.deps.channelMemberDao.getUserChannelIds(
        userId,
        channelIds,
      )
      // If user has no channel memberships at all (legacy data), return all channels
      if (memberChannelIds.length === 0) return allChannels
      return allChannels.filter((ch) => memberChannelIds.includes(ch.id))
    } catch {
      // Table may not exist yet (pre-migration) — fall back to all channels
      return allChannels
    }
  }

  async getById(id: string) {
    const channel = await this.deps.channelDao.findById(id)
    if (!channel) {
      throw Object.assign(new Error('Channel not found'), { status: 404 })
    }
    return channel
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
}
