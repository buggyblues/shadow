export interface ShadowOAuthConfig {
  /** Your app's client_id from Shadow Developer Portal */
  clientId: string
  /** Your app's client_secret (keep server-side only) */
  clientSecret: string
  /** The redirect URI registered with your app */
  redirectUri: string
  /** Shadow API base URL (default: https://shadowob.com) */
  baseUrl?: string
}

export interface ShadowOAuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  scope: string
}

export interface ShadowOAuthUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  email?: string
}

export type ShadowOAuthScope =
  | 'user:read'
  | 'user:email'
  | 'servers:read'
  | 'servers:write'
  | 'channels:read'
  | 'channels:write'
  | 'messages:read'
  | 'messages:write'
  | 'attachments:read'
  | 'attachments:write'
  | 'workspaces:read'
  | 'workspaces:write'
  | 'buddies:create'
  | 'buddies:manage'

export interface ShadowOAuthServer {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
  isPublic: boolean
}

export interface ShadowOAuthChannel {
  id: string
  name: string
  type: string
  topic: string | null
}

export interface ShadowOAuthMessage {
  id: string
  content: string
  channelId: string
  authorId: string
  createdAt: string
}

export interface ShadowOAuthWorkspace {
  id: string
  name: string
  description: string | null
  serverId: string
}

export interface ShadowOAuthBuddy {
  id: string
  userId: string
  agentId: string
}
