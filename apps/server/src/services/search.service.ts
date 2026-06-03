import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { MessageDao } from '../dao/message.dao'
import type { ServerDao } from '../dao/server.dao'
import { resolveAvatarUrl } from '../lib/avatar-url'
import type { ActorInput } from '../security/actor'
import type { MediaService } from './media.service'
import type { PolicyService } from './policy.service'

export class SearchService {
  constructor(
    private deps: {
      messageDao: MessageDao
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      serverDao: ServerDao
      policyService: PolicyService
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
    },
  ) {}

  async getAccessibleChannelIds(actor: ActorInput, serverId?: string): Promise<string[]> {
    return this.deps.policyService.accessibleChannelIds(actor, serverId)
  }

  async searchMessages(
    query: string,
    options?: {
      serverId?: string
      channelId?: string
      accessibleChannelIds?: string[]
      from?: string
      hasAttachment?: boolean
      limit?: number
      offset?: number
    },
  ) {
    const normalizedQuery = query.trim()
    if (!normalizedQuery || normalizedQuery.length < 2) {
      throw Object.assign(new Error('Search query must be at least 2 characters'), { status: 400 })
    }

    if (!options?.accessibleChannelIds) {
      throw Object.assign(new Error('Message search requires an access-controlled channel set'), {
        status: 500,
      })
    }

    if (options.accessibleChannelIds.length === 0) return []

    const messages = await this.deps.messageDao.search(normalizedQuery, options)
    return messages.map((message) => {
      if (!message.author) return message
      return {
        ...message,
        author: {
          ...message.author,
          avatarUrl: resolveAvatarUrl(this.deps.mediaService, message.author.avatarUrl),
        },
      }
    })
  }
}
