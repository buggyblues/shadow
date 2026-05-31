type DesktopCommunityAuthBridge = {
  syncCommunityAuthToken?: (accessToken?: string | null) => void
}

export function syncDesktopCommunityAuthToken(accessToken?: string | null): void {
  if (typeof window === 'undefined') return
  const desktopAPI = (window as Window & { desktopAPI?: DesktopCommunityAuthBridge }).desktopAPI
  desktopAPI?.syncCommunityAuthToken?.(accessToken ?? null)
}
