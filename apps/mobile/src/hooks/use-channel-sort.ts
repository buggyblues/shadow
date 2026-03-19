import { useCallback, useMemo } from 'react'
import type { Channel, ChannelSortBy, ChannelSortDirection } from '@shadow/shared'
import { useChannelSortStore, DEFAULT_SORT } from '../stores/channel-sort.store'

export interface SortedChannel extends Channel {
  lastAccessedAt?: string
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
  sortChannels: (channels: Channel[]) => SortedChannel[]
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
  const setSortBy = useCallback((by: ChannelSortBy) => {
    if (!serverId) return
    storeSetSortBy(serverId, by)
  }, [serverId, storeSetSortBy])

  const setSortDirection = useCallback((direction: ChannelSortDirection) => {
    if (!serverId) return
    storeSetSortDirection(serverId, direction)
  }, [serverId, storeSetSortDirection])

  const toggleSortDirection = useCallback(() => {
    if (!serverId) return
    storeToggleSortDirection(serverId)
  }, [serverId, storeToggleSortDirection])

  // Stable sort function that uses current sort config from closure
  const sortChannels = useCallback(
    (channels: Channel[]): SortedChannel[] => {
      // Get latest config from store directly to ensure fresh values
      const config = serverId 
        ? (serverSortConfigs[serverId] ?? DEFAULT_SORT)
        : DEFAULT_SORT
      const currentSortBy = config.sortBy
      const currentSortDirection = config.sortDirection

      const sorted = [...channels].map((ch) => ({
        ...ch,
        lastAccessedAt: getLastAccessed(ch.id),
      }))

      sorted.sort((a, b) => {
        let comparison = 0

        switch (currentSortBy) {
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

        return currentSortDirection === 'asc' ? comparison : -comparison
      })

      return sorted
    },
    [serverId, serverSortConfigs, getLastAccessed]
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
    [sortBy, sortDirection, setSortBy, setSortDirection, toggleSortDirection, hasCustomSort, sortChannels, updateLastAccessed]
  )
}
