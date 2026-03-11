const KEY = 'shadow:lastChannels'

export function getLastChannelId(serverId: string): string | null {
  try {
    const stored = localStorage.getItem(KEY)
    if (!stored) return null
    const map = JSON.parse(stored) as Record<string, string>
    return map[serverId] ?? null
  } catch {
    return null
  }
}

export function setLastChannelId(serverId: string, channelId: string): void {
  try {
    const stored = localStorage.getItem(KEY)
    const map = (stored ? JSON.parse(stored) : {}) as Record<string, string>
    map[serverId] = channelId
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}
