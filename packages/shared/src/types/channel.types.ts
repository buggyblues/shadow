export type ChannelType = 'text' | 'voice' | 'announcement'

export interface Channel {
  id: string
  name: string
  type: ChannelType
  serverId: string
  topic: string | null
  position: number
  createdAt: string
  updatedAt: string
  /** Last message timestamp for sorting by activity */
  lastMessageAt?: string | null
}

export interface CreateChannelRequest {
  name: string
  type?: ChannelType
  topic?: string
}

export interface UpdateChannelRequest {
  name?: string
  topic?: string
  position?: number
}

/** Channel sorting options */
export type ChannelSortBy =
  | 'position'
  | 'createdAt'
  | 'updatedAt'
  | 'lastMessageAt'
  | 'lastAccessedAt'

export type ChannelSortDirection = 'asc' | 'desc'

export interface ChannelSortOptions {
  by: ChannelSortBy
  direction: ChannelSortDirection
}
