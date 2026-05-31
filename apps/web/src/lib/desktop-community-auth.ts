export const DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT = 'shadow:desktop-community-auth-updated'

export type DesktopCommunityAuthSyncReason =
  | 'startup'
  | 'storage'
  | 'sync'
  | 'login'
  | 'refresh'
  | 'logout'
  | 'settings'
  | 'revoked'

type DesktopCommunityAuthBridge = {
  getCommunityAuthTokens?: () => Promise<{ accessToken?: string; refreshToken?: string }>
  syncCommunityAuthToken?: (
    accessToken?: string | null,
    refreshToken?: string | null,
    reason?: DesktopCommunityAuthSyncReason,
  ) => void
}

export function syncDesktopCommunityAuthToken(
  accessToken?: string | null,
  refreshToken?: string | null,
  reason: DesktopCommunityAuthSyncReason = 'sync',
): void {
  if (typeof window === 'undefined') return
  const desktopAPI = (window as Window & { desktopAPI?: DesktopCommunityAuthBridge }).desktopAPI
  desktopAPI?.syncCommunityAuthToken?.(accessToken ?? null, refreshToken, reason)
}

export async function readDesktopCommunityAuthTokens(): Promise<{
  accessToken: string
  refreshToken: string
}> {
  if (typeof window === 'undefined') return { accessToken: '', refreshToken: '' }
  const desktopAPI = (window as Window & { desktopAPI?: DesktopCommunityAuthBridge }).desktopAPI
  const tokens = await desktopAPI?.getCommunityAuthTokens?.().catch(() => null)
  return {
    accessToken: typeof tokens?.accessToken === 'string' ? tokens.accessToken : '',
    refreshToken: typeof tokens?.refreshToken === 'string' ? tokens.refreshToken : '',
  }
}
