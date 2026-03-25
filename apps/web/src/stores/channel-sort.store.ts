import type { ChannelSortBy, ChannelSortDirection } from '@shadowob/shared'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ServerSortConfig {
  sortBy: ChannelSortBy
  sortDirection: ChannelSortDirection
}

export interface ChannelSortState {
  /** Sort config per server: serverId -> config */
  serverSortConfigs: Record<string, ServerSortConfig>
  /** Last accessed timestamps for channels: channelId -> timestamp */
  lastAccessedAt: Record<string, string>
  /** Current filter keyword per server */
  serverFilterKeywords: Record<string, string>
  /** Set sort criteria for a server */
  setSortBy: (serverId: string, by: ChannelSortBy) => void
  /** Set sort direction for a server */
  setSortDirection: (serverId: string, direction: ChannelSortDirection) => void
  /** Toggle sort direction for a server */
  toggleSortDirection: (serverId: string) => void
  /** Get sort config for a server */
  getSortConfig: (serverId: string) => ServerSortConfig
  /** Check if server has custom sorting (not default position) */
  hasCustomSort: (serverId: string) => boolean
  /** Update last accessed timestamp for a channel */
  updateLastAccessed: (channelId: string) => void
  /** Get last accessed timestamp for a channel */
  getLastAccessed: (channelId: string) => string | undefined
  /** Set filter keyword for a server */
  setFilterKeyword: (serverId: string, keyword: string) => void
  /** Get filter keyword for a server */
  getFilterKeyword: (serverId: string) => string
  /** Check if server has active filter */
  hasActiveFilter: (serverId: string) => boolean
  /** Clear sort and filter for a server */
  clearSortAndFilter: (serverId: string) => void
}

export const DEFAULT_SORT: ServerSortConfig = {
  sortBy: 'position',
  sortDirection: 'asc',
}

export const useChannelSortStore = create<ChannelSortState>()(
  persist(
    (set, get) => ({
      serverSortConfigs: {},
      lastAccessedAt: {},
      serverFilterKeywords: {},

      setSortBy: (serverId, by) => {
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: {
              ...(state.serverSortConfigs[serverId] ?? DEFAULT_SORT),
              sortBy: by,
            },
          },
        }))
      },

      setSortDirection: (serverId, direction) => {
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: {
              ...(state.serverSortConfigs[serverId] ?? DEFAULT_SORT),
              sortDirection: direction,
            },
          },
        }))
      },

      toggleSortDirection: (serverId) => {
        const current = get().serverSortConfigs[serverId]?.sortDirection ?? 'asc'
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: {
              ...(state.serverSortConfigs[serverId] ?? DEFAULT_SORT),
              sortDirection: current === 'asc' ? 'desc' : 'asc',
            },
          },
        }))
      },

      getSortConfig: (serverId) => {
        return get().serverSortConfigs[serverId] ?? DEFAULT_SORT
      },

      hasCustomSort: (serverId) => {
        const config = get().serverSortConfigs[serverId]
        return config ? config.sortBy !== 'position' : false
      },

      updateLastAccessed: (channelId) => {
        set((state) => ({
          lastAccessedAt: {
            ...state.lastAccessedAt,
            [channelId]: new Date().toISOString(),
          },
        }))
      },

      getLastAccessed: (channelId) => {
        return get().lastAccessedAt[channelId]
      },

      setFilterKeyword: (serverId, keyword) => {
        set((state) => ({
          serverFilterKeywords: {
            ...state.serverFilterKeywords,
            [serverId]: keyword,
          },
        }))
      },

      getFilterKeyword: (serverId) => {
        return get().serverFilterKeywords[serverId] ?? ''
      },

      hasActiveFilter: (serverId) => {
        const keyword = get().serverFilterKeywords[serverId]
        return !!keyword && keyword.trim().length > 0
      },

      clearSortAndFilter: (serverId) => {
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: DEFAULT_SORT,
          },
          serverFilterKeywords: {
            ...state.serverFilterKeywords,
            [serverId]: '',
          },
        }))
      },
    }),
    {
      name: 'shadow-channel-sort',
      partialize: (state) => ({
        serverSortConfigs: state.serverSortConfigs,
        lastAccessedAt: state.lastAccessedAt,
        serverFilterKeywords: state.serverFilterKeywords,
      }),
    },
  ),
)
