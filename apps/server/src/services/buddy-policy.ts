export type BuddyMode = 'private' | 'shareable'

export const DEFAULT_BUDDY_MODE: BuddyMode = 'private'
export const BUDDY_MODES: BuddyMode[] = ['private', 'shareable']

function uniqueStrings(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (seen.size >= max) break
  }
  return [...seen]
}

export function getBuddyMode(config: unknown): BuddyMode {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return DEFAULT_BUDDY_MODE
  const mode = (config as Record<string, unknown>).buddyMode
  return mode === 'shareable' ? 'shareable' : DEFAULT_BUDDY_MODE
}

export function getBuddyAllowedServerIds(config: unknown): string[] {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return []
  const record = config as Record<string, unknown>
  return uniqueStrings(record.allowedServerIds ?? record.serverWhitelist)
}

export function canBuddyJoinServer(config: unknown, serverId: string): boolean {
  const mode = getBuddyMode(config)
  if (mode === 'shareable') return true
  return getBuddyAllowedServerIds(config).includes(serverId)
}

export function applyBuddyAccessConfig(
  config: Record<string, unknown> | null | undefined,
  input: {
    buddyMode?: BuddyMode
    allowedServerIds?: string[]
  },
) {
  const next: Record<string, unknown> = { ...(config ?? {}) }

  if (input.buddyMode !== undefined) {
    next.buddyMode = input.buddyMode
  } else if (!next.buddyMode) {
    next.buddyMode = DEFAULT_BUDDY_MODE
  }

  if (input.allowedServerIds !== undefined) {
    next.allowedServerIds = uniqueStrings(input.allowedServerIds)
  } else if (!Array.isArray(next.allowedServerIds)) {
    next.allowedServerIds = getBuddyAllowedServerIds(next)
  }

  delete next.serverWhitelist
  return next
}
