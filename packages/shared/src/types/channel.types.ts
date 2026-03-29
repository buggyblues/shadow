export type ChannelType = 'text' | 'voice' | 'announcement'

/** Channel posting rule types */
export type ChannelPostingRuleType =
  | 'everyone'
  | 'humans_only'
  | 'buddies_only'
  | 'specific_users'
  | 'read_only'

/** Channel posting rule configuration */
export interface ChannelPostingRule {
  ruleType: ChannelPostingRuleType
  config?: {
    allowedUserIds?: string[]
  }
}

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
  /** Posting rule for the channel */
  postingRule?: ChannelPostingRule
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
