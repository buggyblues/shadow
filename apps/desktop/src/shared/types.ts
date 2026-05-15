export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export type ShadowUser = {
  id: string
  email?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export type PublicSession = {
  authenticated: boolean
  user: ShadowUser | null
  webOrigin: string
}

export type LoginCredentials = {
  emailOrUsername: string
  password: string
}

export type AuthRequestInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export type ShadowServerEntry = {
  role?: string
  server: {
    id: string
    name: string
    slug?: string | null
    iconUrl?: string | null
  }
}

export type ShadowChannel = {
  id: string
  name: string
  serverId?: string | null
  kind?: string
  isPrivate?: boolean
}

export type ShadowNotification = {
  id: string
  userId?: string
  type?: 'mention' | 'reply' | 'dm' | 'system' | string
  kind?: string | null
  title: string
  body?: string | null
  referenceId?: string | null
  referenceType?: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  aggregatedCount?: number | null
  isRead: boolean
  createdAt?: string
  lastAggregatedAt?: string | null
  senderAvatarUrl?: string | null
}

export type ShadowMessage = {
  id: string
  channelId: string
  content: string
  authorId?: string
  createdAt?: string
  author?: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  }
}

export type CommunityEvent =
  | { type: 'socket-status'; status: 'connected' | 'connecting' | 'disconnected' | 'error' }
  | { type: 'notification'; notification: ShadowNotification }
  | { type: 'message'; message: ShadowMessage }

export type DesktopConfig = {
  platform: DesktopPlatform
  version: string
  webOrigin: string
}
