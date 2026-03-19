import { useCallback, useEffect, useMemo } from 'react'
import type { Channel, ChannelSortBy, ChannelSortDirection } from '@shadow/shared'
import { useChannelSortStore } from '../stores/channel-sort.store'

export interface SortedChannel extends Channel {
  lastAccessedAt?: string
}

export interface UseChannelSortReturn {
  /** Current sort criteria */
  sortBy: ChannelSortBy
  /** Current sort direction */
  sortDirection: ChannelSortDirection
  /** Set current server context */
  setCurrentServer: (serverId: string | null) => void
  /** Set sort criteria */
  setSortBy: (by: ChannelSortBy) => void
  /** Set sort direction */
  setSortDirection: (direction: ChannelSortDirection) => void
  /** Toggle sort direction */
  toggleSortDirection: () => void
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
  const setCurrentServer = useChannelSortStore((s) => s.setCurrentServer)
  const getCurrentSortConfig = useChannelSortStore((s) => s.getCurrentSortConfig)
  const setSortBy = useChannelSortStore((s) => s.setSortBy)
  const setSortDirection = useChannelSortStore((s) => s.setSortDirection)
  const toggleSortDirection = useChannelSortStore((s) => s.toggleSortDirection)
  const hasCustomSortStore = useChannelSortStore((s) => s.hasCustomSort)
  const updateLastAccessed = useChannelSortStore((s) => s.updateLastAccessed)
  const getLastAccessed = useChannelSortStore((s) => s.getLastAccessed)

  // Set server context when serverId changes
  useEffect(() => {
    setCurrentServer(serverId ?? null)
  }, [serverId, setCurrentServer])

  // Get current sort config
  const { sortBy, sortDirection } = useMemo(() => {
    return getCurrentSortConfig()
  }, [getCurrentSortConfig, serverId])

  const hasCustomSort = useMemo(() => {
    return hasCustomSortStore()
  }, [hasCustomSortStore, sortBy])

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
          case 'position':
          default:
            comparison = a.position - b.position
            break
        }

        return sortDirection === 'asc' ? comparison : -comparison
      })

      return sorted
    },
    [sortBy, sortDirection, getLastAccessed]
  )

  return useMemo(
    () => ({
      sortBy,
      sortDirection,
      setCurrentServer,
      setSortBy,
      setSortDirection,
      toggleSortDirection,
      hasCustomSort,
      sortChannels,
      updateLastAccessed,
    }),
    [sortBy, sortDirection, setCurrentServer, setSortBy, setSortDirection, toggleSortDirection, hasCustomSort, sortChannels, updateLastAccessed]
  )
}
