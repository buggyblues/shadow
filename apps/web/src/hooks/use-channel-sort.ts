import type { ChannelSortBy, ChannelSortDirection } from '@shadowob/shared'
import { useCallback, useMemo } from 'react'
import { DEFAULT_SORT, useChannelSortStore } from '../stores/channel-sort.store'

function getSafeTime(value?: string | null): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

/** Minimal channel interface for sorting */
interface SortableChannel {
  id: string
  position?: number
  createdAt?: string
  updatedAt?: string
  lastMessageAt?: string | null
}

export interface UseChannelSortReturn {
  /** Current sort criteria */
  sortBy: ChannelSortBy
  /** Current sort direction */
  sortDirection: ChannelSortDirection
  /** Set sort criteria */
  setSortBy: (by: ChannelSortBy) => void
  /** Set sort direction */
  setSortDirection: (direction: ChannelSortDirection) => void
  /** Toggle sort direction */
  toggleSortDirection: () => void
  /** Check if has custom sort */
  hasCustomSort: boolean
  /** Sort channels based on current settings */
  sortChannels: <T extends SortableChannel>(channels: T[]) => (T & { lastAccessedAt?: string })[]
  /** Update last accessed timestamp for a channel */
  updateLastAccessed: (channelId: string) => void
}

/**
 * Hook for channel sorting functionality
 * @param serverId - Server ID to get/set sort config
 */
export function useChannelSort(serverId?: string): UseChannelSortReturn {
  // Subscribe to store state directly - this will trigger re-render when config changes
  const serverSortConfigs = useChannelSortStore((s) => s.serverSortConfigs)
  const updateLastAccessed = useChannelSortStore((s) => s.updateLastAccessed)
  const getLastAccessed = useChannelSortStore((s) => s.getLastAccessed)
  const storeSetSortBy = useChannelSortStore((s) => s.setSortBy)
  const storeSetSortDirection = useChannelSortStore((s) => s.setSortDirection)
  const storeToggleSortDirection = useChannelSortStore((s) => s.toggleSortDirection)

  // Get current sort config for this server
  const currentConfig = useMemo(() => {
    if (!serverId) return DEFAULT_SORT
    return serverSortConfigs[serverId] ?? DEFAULT_SORT
  }, [serverSortConfigs, serverId])

  const { sortBy, sortDirection } = currentConfig

  // Check if has custom sort
  const hasCustomSort = useMemo(() => {
    if (!serverId) return false
    return sortBy !== 'position'
  }, [sortBy, serverId])

  // Wrapper functions that include serverId
  const setSortBy = useCallback(
    (by: ChannelSortBy) => {
      if (!serverId) return
      storeSetSortBy(serverId, by)
    },
    [serverId, storeSetSortBy],
  )

  const setSortDirection = useCallback(
    (direction: ChannelSortDirection) => {
      if (!serverId) return
      storeSetSortDirection(serverId, direction)
    },
    [serverId, storeSetSortDirection],
  )

  const toggleSortDirection = useCallback(() => {
    if (!serverId) return
    storeToggleSortDirection(serverId)
  }, [serverId, storeToggleSortDirection])

  // Stable sort function that uses current sort config from closure
  const sortChannels = useCallback(
    <T extends SortableChannel>(channels: T[]): (T & { lastAccessedAt?: string })[] => {
      const config = serverId ? (serverSortConfigs[serverId] ?? DEFAULT_SORT) : DEFAULT_SORT
      const currentSortBy = config.sortBy ?? DEFAULT_SORT.sortBy
      const currentSortDirection = config.sortDirection ?? DEFAULT_SORT.sortDirection

      const sorted = [...channels].map((ch) => ({
        ...ch,
        lastAccessedAt: getLastAccessed(ch.id),
      }))

      sorted.sort((a, b) => {
        let comparison = 0

        switch (currentSortBy) {
          case 'createdAt':
            comparison = getSafeTime(a.createdAt) - getSafeTime(b.createdAt)
            break
          case 'updatedAt':
            comparison = getSafeTime(a.updatedAt) - getSafeTime(b.updatedAt)
            break
          case 'lastMessageAt': {
            comparison = getSafeTime(a.lastMessageAt) - getSafeTime(b.lastMessageAt)
            break
          }
          case 'lastAccessedAt': {
            comparison = getSafeTime(a.lastAccessedAt) - getSafeTime(b.lastAccessedAt)
            break
          }
          default:
            comparison = (a.position ?? 0) - (b.position ?? 0)
            break
        }

        if (comparison === 0) {
          comparison = (a.position ?? 0) - (b.position ?? 0)
        }

        if (comparison === 0) {
          comparison = a.id.localeCompare(b.id)
        }

        return currentSortDirection === 'asc' ? comparison : -comparison
      })

      return sorted
    },
    [getLastAccessed, serverId, serverSortConfigs],
  )

  return useMemo(
    () => ({
      sortBy,
      sortDirection,
      setSortBy,
      setSortDirection,
      toggleSortDirection,
      hasCustomSort,
      sortChannels,
      updateLastAccessed,
    }),
    [
      sortBy,
      sortDirection,
      setSortBy,
      setSortDirection,
      toggleSortDirection,
      hasCustomSort,
      sortChannels,
      updateLastAccessed,
    ],
  )
}
