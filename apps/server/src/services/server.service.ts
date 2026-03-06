import type { ChannelDao } from '../dao/channel.dao'
import type { ServerDao } from '../dao/server.dao'
import type {
  CreateServerInput,
  UpdateMemberInput,
  UpdateServerInput,
} from '../validators/server.schema'

export class ServerService {
  constructor(private deps: { serverDao: ServerDao; channelDao: ChannelDao }) {}

  async create(input: CreateServerInput, userId: string) {
    const server = await this.deps.serverDao.create({
      name: input.name,
      ownerId: userId,
      iconUrl: input.iconUrl,
      bannerUrl: input.bannerUrl,
      description: input.description,
      slug: input.slug,
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

  async getBySlug(slug: string) {
    const server = await this.deps.serverDao.findBySlug(slug)
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

  async kickMember(serverId: string, targetUserId: string, requesterId: string) {
    const server = await this.deps.serverDao.findById(serverId)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }

    // Check requester has admin or owner role
    const requester = await this.deps.serverDao.getMember(serverId, requesterId)
    if (!requester || (requester.role !== 'admin' && requester.role !== 'owner')) {
      throw Object.assign(new Error('Requires admin role or higher'), { status: 403 })
    }

    // Cannot kick the owner
    const target = await this.deps.serverDao.getMember(serverId, targetUserId)
    if (!target) {
      throw Object.assign(new Error('Member not found'), { status: 404 })
    }
    if (target.role === 'owner') {
      throw Object.assign(new Error('Cannot kick the server owner'), { status: 400 })
    }

    await this.deps.serverDao.removeMember(serverId, targetUserId)
  }

  async updateMember(
    serverId: string,
    targetUserId: string,
    requesterId: string,
    input: UpdateMemberInput,
  ) {
    const server = await this.deps.serverDao.findById(serverId)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }

    // Check requester has admin or owner role
    const requester = await this.deps.serverDao.getMember(serverId, requesterId)
    if (!requester || (requester.role !== 'admin' && requester.role !== 'owner')) {
      throw Object.assign(new Error('Requires admin role or higher'), { status: 403 })
    }

    // Only owner can assign owner role
    if (input.role === 'owner' && requester.role !== 'owner') {
      throw Object.assign(new Error('Only the server owner can assign the owner role'), {
        status: 403,
      })
    }

    // Check target exists
    const target = await this.deps.serverDao.getMember(serverId, targetUserId)
    if (!target) {
      throw Object.assign(new Error('Member not found'), { status: 404 })
    }

    return this.deps.serverDao.updateMember(serverId, targetUserId, input)
  }

  async regenerateInvite(serverId: string, requesterId: string) {
    const server = await this.deps.serverDao.findById(serverId)
    if (!server) {
      throw Object.assign(new Error('Server not found'), { status: 404 })
    }

    // Check requester has admin or owner role
    const requester = await this.deps.serverDao.getMember(serverId, requesterId)
    if (!requester || (requester.role !== 'admin' && requester.role !== 'owner')) {
      throw Object.assign(new Error('Requires admin role or higher'), { status: 403 })
    }

    return this.deps.serverDao.regenerateInviteCode(serverId)
  }

  async discoverPublic(limit = 50, offset = 0) {
    return this.deps.serverDao.findPublic(limit, offset)
  }
}
