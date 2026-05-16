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

export interface VoiceParticipant {
  id: string
  channelId: string
  userId: string
  uid: number
  screenUid: number
  username: string
  displayName: string | null
  avatarUrl: string | null
  isBot: boolean
  isMuted: boolean
  isDeafened: boolean
  isSpeaking: boolean
  isScreenSharing: boolean
  joinedAt: string
  updatedAt: string
  clientId: string | null
}

export interface VoiceChannelCredentials {
  appId: string
  channelId: string
  agoraChannelName: string
  uid: number
  screenUid: number
  token: string | null
  screenToken: string | null
  expiresAt: string | null
}

export interface VoiceChannelState {
  channelId: string
  agoraChannelName: string
  participants: VoiceParticipant[]
  participantCount: number
  emptySince: string | null
  graceEndsAt: string | null
}

export interface VoiceChannelJoinResult {
  credentials: VoiceChannelCredentials
  participant: VoiceParticipant
  state: VoiceChannelState
}

export interface VoiceChannelLeaveResult {
  participant: VoiceParticipant | null
  state: VoiceChannelState
}

export interface VoiceChannelPolicy {
  agentId: string
  channelId: string
  listen: boolean
  autoJoin: boolean
  consumeAudio: boolean
  consumeScreenShare: boolean
  screenshotIntervalSeconds: number | null
}
