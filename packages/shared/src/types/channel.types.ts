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

// ── Voice Channel Types ──────────────────────────────────────────────

export interface VoiceChannelMember {
  userId: string
  username: string
  displayName: string
  muted: boolean
  screenSharing: boolean
  joinedAt: string
}

export interface VoiceChannelState {
  channelId: string
  members: VoiceChannelMember[]
}

/**
 * Buddy voice policy — controls how a buddy behaves in a voice channel.
 * Extends the existing agent_policies config pattern.
 */
export interface BuddyVoicePolicy {
  /** Whether the buddy should listen to the voice channel */
  listen: boolean
  /** Buddy user ID */
  buddyUserId: string
  /** Extensible config for future voice-specific fields */
  config: {
    /** Mode: 'standby' (listen only), 'active' (can speak), 'silent' (ignore) */
    mode?: 'standby' | 'active' | 'silent'
    /** Whether to capture screen share frames */
    captureScreenshots?: boolean
    /** Screenshot interval in seconds (if captureScreenshots is true) */
    screenshotIntervalSec?: number
    [key: string]: unknown
  }
}
