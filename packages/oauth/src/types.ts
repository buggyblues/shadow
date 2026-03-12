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

export type ShadowOAuthScope = 'user:read' | 'user:email'
