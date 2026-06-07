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
  isDesktop?: boolean
  getCommunityAuthTokens?: () => Promise<{ accessToken?: string; refreshToken?: string }>
  syncCommunityAuthToken?: (
    accessToken?: string | null,
    refreshToken?: string | null,
    reason?: DesktopCommunityAuthSyncReason,
  ) => void
}

const DESKTOP_AUTH_EMPTY_RETRY_MS = 120
const DESKTOP_AUTH_EMPTY_RETRY_ATTEMPTS = 8

function normalizeDesktopAuthTokens(
  tokens: {
    accessToken?: unknown
    refreshToken?: unknown
  } | null,
): {
  accessToken: string
  refreshToken: string
} {
  return {
    accessToken: typeof tokens?.accessToken === 'string' ? tokens.accessToken.trim() : '',
    refreshToken: typeof tokens?.refreshToken === 'string' ? tokens.refreshToken.trim() : '',
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function readRendererAuthTokens(): {
  accessToken: string
  refreshToken: string
} {
  try {
    return normalizeDesktopAuthTokens({
      accessToken: window.localStorage?.getItem('accessToken'),
      refreshToken: window.localStorage?.getItem('refreshToken'),
    })
  } catch {
    return { accessToken: '', refreshToken: '' }
  }
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
  if (!desktopAPI?.getCommunityAuthTokens) return { accessToken: '', refreshToken: '' }
  const tokens = normalizeDesktopAuthTokens(
    await desktopAPI.getCommunityAuthTokens().catch(() => null),
  )
  if (tokens.accessToken || tokens.refreshToken || !desktopAPI.isDesktop) return tokens
  for (let attempt = 0; attempt < DESKTOP_AUTH_EMPTY_RETRY_ATTEMPTS; attempt += 1) {
    const rendererTokens = readRendererAuthTokens()
    if (rendererTokens.accessToken || rendererTokens.refreshToken) return rendererTokens
    await delay(DESKTOP_AUTH_EMPTY_RETRY_MS)
    const retried = normalizeDesktopAuthTokens(
      await desktopAPI.getCommunityAuthTokens().catch(() => null),
    )
    if (retried.accessToken || retried.refreshToken) return retried
  }
  return { accessToken: '', refreshToken: '' }
}
