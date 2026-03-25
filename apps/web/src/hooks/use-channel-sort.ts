import type { ChannelSortBy, ChannelSortDirection } from '@shadowob/shared'
import { useCallback, useMemo } from 'react'
import { DEFAULT_SORT, useChannelSortStore } from '../stores/channel-sort.store'

export interface SortedChannel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  position: number
  isPrivate: boolean
  isMember?: boolean
  createdAt?: string
  updatedAt?: string
  lastMessageAt?: string | null
  lastAccessedAt?: string
}

export interface UseChannelSortReturn {
  /** Current sort criteria */
  sortBy: ChannelSortBy
  /** Current sort direction */
  sortDirection: ChannelSortDirection
  /** Current filter keyword */
  filterKeyword: string
  /** Set sort criteria */
  setSortBy: (by: ChannelSortBy) => void
  /** Set sort direction */
  setSortDirection: (direction: ChannelSortDirection) => void
  /** Toggle sort direction */
  toggleSortDirection: () => void
  /** Check if has custom sort */
  hasCustomSort: boolean
  /** Sort channels based on current settings */
  sortChannels: (channels: SortedChannel[]) => SortedChannel[]
  /** Update last accessed timestamp for a channel */
  updateLastAccessed: (channelId: string) => void
  /** Set filter keyword */
  setFilterKeyword: (keyword: string) => void
  /** Check if has active filter */
  hasActiveFilter: boolean
  /** Check if any sort or filter is active */
  isActive: boolean
  /** Clear all sort and filter settings */
  clearAll: () => void
}

/**
 * Hook for channel sorting functionality
 * @param serverId - Server ID to get/set sort config
 */
export function useChannelSort(serverId?: string): UseChannelSortReturn {
  // Subscribe to store state directly
  const serverSortConfigs = useChannelSortStore((s) => s.serverSortConfigs)
  const serverFilterKeywords = useChannelSortStore((s) => s.serverFilterKeywords)
  const updateLastAccessed = useChannelSortStore((s) => s.updateLastAccessed)
  const getLastAccessed = useChannelSortStore((s) => s.getLastAccessed)
  const storeSetSortBy = useChannelSortStore((s) => s.setSortBy)
  const storeSetSortDirection = useChannelSortStore((s) => s.setSortDirection)
  const storeToggleSortDirection = useChannelSortStore((s) => s.toggleSortDirection)
  const storeSetFilterKeyword = useChannelSortStore((s) => s.setFilterKeyword)
  const storeHasActiveFilter = useChannelSortStore((s) => s.hasActiveFilter)
  const storeHasCustomSort = useChannelSortStore((s) => s.hasCustomSort)
  const storeClearSortAndFilter = useChannelSortStore((s) => s.clearSortAndFilter)

  // Get current sort config for this server
  const currentConfig = useMemo(() => {
    if (!serverId) return DEFAULT_SORT
    return serverSortConfigs[serverId] ?? DEFAULT_SORT
  }, [serverSortConfigs, serverId])

  const { sortBy, sortDirection } = currentConfig

  // Get current filter keyword
  const filterKeyword = useMemo(() => {
    if (!serverId) return ''
    return serverFilterKeywords[serverId] ?? ''
  }, [serverFilterKeywords, serverId])

  // Check if has custom sort
  const hasCustomSort = useMemo(() => {
    if (!serverId) return false
    return storeHasCustomSort(serverId)
  }, [serverId, storeHasCustomSort])

  // Check if has active filter
  const hasActiveFilter = useMemo(() => {
    if (!serverId) return false
    return storeHasActiveFilter(serverId)
  }, [serverId, storeHasActiveFilter])

  // Check if any sort or filter is active
  const isActive = useMemo(() => {
    return hasCustomSort || hasActiveFilter
  }, [hasCustomSort, hasActiveFilter])

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

  const setFilterKeyword = useCallback(
    (keyword: string) => {
      if (!serverId) return
      storeSetFilterKeyword(serverId, keyword)
    },
    [serverId, storeSetFilterKeyword],
  )

  const clearAll = useCallback(() => {
    if (!serverId) return
    storeClearSortAndFilter(serverId)
  }, [serverId, storeClearSortAndFilter])

  // Stable sort function that uses current sort config from closure
  const sortChannels = useCallback(
    (channels: SortedChannel[]): SortedChannel[] => {
      // Get latest config from store directly to ensure fresh values
      const config = serverId ? (serverSortConfigs[serverId] ?? DEFAULT_SORT) : DEFAULT_SORT
      const currentSortBy = config.sortBy
      const currentSortDirection = config.sortDirection

      const sorted = [...channels].map((ch) => ({
        ...ch,
        lastAccessedAt: getLastAccessed(ch.id),
      }))

      sorted.sort((a, b) => {
        let comparison = 0

        switch (currentSortBy) {
          case 'createdAt': {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
            comparison = aTime - bTime
            break
          }
          case 'updatedAt': {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
            comparison = aTime - bTime
            break
          }
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

        return currentSortDirection === 'asc' ? comparison : -comparison
      })

      return sorted
    },
    [serverId, serverSortConfigs, getLastAccessed],
  )

  return useMemo(
    () => ({
      sortBy,
      sortDirection,
      filterKeyword,
      setSortBy,
      setSortDirection,
      toggleSortDirection,
      hasCustomSort,
      sortChannels,
      updateLastAccessed,
      setFilterKeyword,
      hasActiveFilter,
      isActive,
      clearAll,
    }),
    [
      sortBy,
      sortDirection,
      filterKeyword,
      setSortBy,
      setSortDirection,
      toggleSortDirection,
      hasCustomSort,
      sortChannels,
      updateLastAccessed,
      setFilterKeyword,
      hasActiveFilter,
      isActive,
      clearAll,
    ],
  )
}
