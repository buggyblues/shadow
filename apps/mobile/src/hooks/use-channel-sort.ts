import type { Channel, ChannelSortBy, ChannelSortDirection } from '@shadow/shared'
import { useCallback, useEffect, useMemo } from 'react'
import { DEFAULT_SORT, useChannelSortStore } from '../stores/channel-sort.store'

export interface SortedChannel extends Channel {
  lastAccessedAt?: string
}

export interface UseChannelSortReturn {
  /** Current sort criteria */
  sortBy: ChannelSortBy
  /** Current sort direction */
  sortDirection: ChannelSortDirection
  /** Set sort criteria for a server */
  setSortBy: (serverId: string, by: ChannelSortBy) => void
  /** Set sort direction for a server */
  setSortDirection: (serverId: string, direction: ChannelSortDirection) => void
  /** Toggle sort direction for a server */
  toggleSortDirection: (serverId: string) => void
  /** Check if has custom sort */
  hasCustomSort: boolean
  /** Sort channels based on current settings */
  sortChannels: (channels: Channel[]) => SortedChannel[]
  /** Update last accessed timestamp for a channel */
  updateLastAccessed: (channelId: string) => void
}

/**
 * Hook for channel sorting functionality
 * @param serverId - Optional server ID to set context automatically
 */
export function useChannelSort(serverId?: string): UseChannelSortReturn {
  const getSortConfig = useChannelSortStore((s) => s.getSortConfig)
  const setSortByStore = useChannelSortStore((s) => s.setSortBy)
  const setSortDirectionStore = useChannelSortStore((s) => s.setSortDirection)
  const toggleSortDirectionStore = useChannelSortStore((s) => s.toggleSortDirection)
  const hasCustomSortStore = useChannelSortStore((s) => s.hasCustomSort)
  const updateLastAccessed = useChannelSortStore((s) => s.updateLastAccessed)
  const getLastAccessed = useChannelSortStore((s) => s.getLastAccessed)

  // Get current sort config
  const { sortBy, sortDirection } = useMemo(() => {
    if (!serverId) return DEFAULT_SORT
    return getSortConfig(serverId)
  }, [serverId, getSortConfig])

  const hasCustomSort = useMemo(() => {
    if (!serverId) return false
    return hasCustomSortStore(serverId)
  }, [serverId, hasCustomSortStore])

  const sortChannels = useCallback(
    (channels: Channel[]): SortedChannel[] => {
      const sorted = [...channels].map((ch) => ({
        ...ch,
        lastAccessedAt: getLastAccessed(ch.id),
      }))

      sorted.sort((a, b) => {
        let comparison = 0

        switch (sortBy) {
          case 'createdAt':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            break
          case 'updatedAt':
            comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
            break
          case 'lastMessageAt': {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
            comparison = aTime - bTime
            break
          }
          case 'lastAccessedAt': {
            const aTime = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
            const bTime = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
            comparison = aTime - bTime
            break
          }
          default:
            comparison = a.position - b.position
            break
        }

        return sortDirection === 'asc' ? comparison : -comparison
      })

      return sorted
    },
    [sortBy, sortDirection, getLastAccessed],
  )

  // Wrapped functions that include serverId
  const setSortBy = useCallback(
    (by: ChannelSortBy) => {
      if (!serverId) return
      setSortByStore(serverId, by)
    },
    [serverId, setSortByStore],
  )

  const setSortDirection = useCallback(
    (direction: ChannelSortDirection) => {
      if (!serverId) return
      setSortDirectionStore(serverId, direction)
    },
    [serverId, setSortDirectionStore],
  )

  const toggleSortDirection = useCallback(
    () => {
      if (!serverId) return
      toggleSortDirectionStore(serverId)
    },
    [serverId, toggleSortDirectionStore],
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
