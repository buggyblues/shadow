export const COPILOT_CHANNEL_SEARCH_PARAM = 'copilot'
const LEGACY_COPILOT_CHANNEL_SEARCH_PARAM = 'copilotChannel'

export type RouteSearch = Record<string, unknown>

export function getCopilotChannelIdFromSearch(search: RouteSearch | null | undefined) {
  const value =
    search?.[COPILOT_CHANNEL_SEARCH_PARAM] ?? search?.[LEGACY_COPILOT_CHANNEL_SEARCH_PARAM]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function withCopilotChannelSearch(
  search: RouteSearch | null | undefined,
  channelId: string | null,
) {
  const next = { ...(search ?? {}) }
  delete next[LEGACY_COPILOT_CHANNEL_SEARCH_PARAM]

  if (channelId) {
    next[COPILOT_CHANNEL_SEARCH_PARAM] = channelId
  } else {
    delete next[COPILOT_CHANNEL_SEARCH_PARAM]
  }

  return next
}
