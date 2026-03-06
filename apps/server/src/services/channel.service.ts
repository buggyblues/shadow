import type { ChannelDao } from '../dao/channel.dao'
import type { CreateChannelInput, UpdateChannelInput } from '../validators/channel.schema'

export class ChannelService {
  constructor(private deps: { channelDao: ChannelDao }) {}

  async create(serverId: string, input: CreateChannelInput) {
    return this.deps.channelDao.create({
      name: input.name,
      serverId,
      type: input.type,
      topic: input.topic,
    })
  }

  async getByServerId(serverId: string) {
    return this.deps.channelDao.findByServerId(serverId)
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
}
