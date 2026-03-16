import type { MessageDao } from '../dao/message.dao'

export class SearchService {
  constructor(private deps: { messageDao: MessageDao }) {}

  async searchMessages(
    query: string,
    options?: {
      serverId?: string
      channelId?: string
      from?: string
      hasAttachment?: boolean
      limit?: number
    },
  ) {
    if (!query || query.trim().length < 2) {
      throw Object.assign(new Error('Search query must be at least 2 characters'), { status: 400 })
    }

    return this.deps.messageDao.search(query, options)
  }
}
