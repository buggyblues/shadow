import type { ChannelDao } from '../dao/channel.dao'
import type { ServerDao } from '../dao/server.dao'
import type { CreateServerInput, UpdateServerInput } from '../validators/server.schema'

export class ServerService {
  constructor(private deps: { serverDao: ServerDao; channelDao: ChannelDao }) {}

  async create(input: CreateServerInput, userId: string) {
    const server = await this.deps.serverDao.create({
      name: input.name,
      ownerId: userId,
      iconUrl: input.iconUrl,
      description: input.description,
      isPublic: input.isPublic,
    })

    // Add owner as member with 'owner' role
    await this.deps.serverDao.addMember(server.id, userId, 'owner')

    // Create default #general channel
    await this.deps.channelDao.create({
      name: 'general',
      serverId: server.id,
      type: 'text',
      topic: 'General discussion',
    })

    return server
  }

  async getById(id: string) {
    const server = await this.deps.serverDao.findById(id)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }
    return server
  }

  async getByInviteCode(code: string) {
    const server = await this.deps.serverDao.findByInviteCode(code)
    if (!server) {
      throw Object.assign(new Error('Invalid invite code'), { status: 404 })
    }
    return server
  }

  async getUserServers(userId: string) {
    return this.deps.serverDao.findByUserId(userId)
  }

  async update(id: string, input: UpdateServerInput, _userId: string) {
    const server = await this.deps.serverDao.findById(id)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }

    return this.deps.serverDao.update(id, input)
  }

  async delete(id: string, userId: string) {
    const server = await this.deps.serverDao.findById(id)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }
    if (server.ownerId !== userId) {
      throw Object.assign(new Error('Only the owner can delete this server'), { status: 403 })
    }

    await this.deps.serverDao.delete(id)
  }

  async join(inviteCode: string, userId: string) {
    const server = await this.deps.serverDao.findByInviteCode(inviteCode)
    if (!server) {
      throw Object.assign(new Error('Invalid invite code'), { status: 404 })
    }

    const existingMember = await this.deps.serverDao.getMember(server.id, userId)
    if (existingMember) {
      throw Object.assign(new Error('Already a member of this server'), { status: 409 })
    }

    await this.deps.serverDao.addMember(server.id, userId, 'member')
    return server
  }

  async leave(serverId: string, userId: string) {
    const server = await this.deps.serverDao.findById(serverId)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }
    if (server.ownerId === userId) {
      throw Object.assign(new Error('Owner cannot leave the server'), { status: 400 })
    }

    await this.deps.serverDao.removeMember(serverId, userId)
  }

  async getMembers(serverId: string) {
    return this.deps.serverDao.getMembers(serverId)
  }

  async discoverPublic(limit = 50, offset = 0) {
    return this.deps.serverDao.findPublic(limit, offset)
  }
}
