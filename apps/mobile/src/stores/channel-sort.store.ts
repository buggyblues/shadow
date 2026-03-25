import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ChannelSortBy, ChannelSortDirection } from '@shadowob/shared'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ServerSortConfig {
  sortBy: ChannelSortBy
  sortDirection: ChannelSortDirection
}

export interface ChannelSortState {
  /** Sort config per server: serverId -> config */
  serverSortConfigs: Record<string, ServerSortConfig>
  /** Last accessed timestamps for channels: channelId -> timestamp */
  lastAccessedAt: Record<string, string>
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
}

export const DEFAULT_SORT: ServerSortConfig = {
  sortBy: 'position',
  sortDirection: 'asc',
}

function isTimeSort(by: ChannelSortBy): boolean {
  return by !== 'position'
}

export const useChannelSortStore = create<ChannelSortState>()(
  persist(
    (set, get) => ({
      serverSortConfigs: {},
      lastAccessedAt: {},

      setSortBy: (serverId, by) => {
        const currentConfig = get().serverSortConfigs[serverId] ?? DEFAULT_SORT
        const nextDirection: ChannelSortDirection =
          by === 'position'
            ? 'asc'
            : by !== currentConfig.sortBy && isTimeSort(by)
              ? 'desc'
              : currentConfig.sortDirection

        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: {
              ...DEFAULT_SORT,
              ...state.serverSortConfigs[serverId],
              sortBy: by,
              sortDirection: nextDirection,
            },
          },
        }))
      },

      setSortDirection: (serverId, direction) => {
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: {
              ...DEFAULT_SORT,
              ...state.serverSortConfigs[serverId],
              sortDirection: direction,
            },
          },
        }))
      },

      toggleSortDirection: (serverId) => {
        const currentConfig = get().serverSortConfigs[serverId] ?? DEFAULT_SORT
        const current = currentConfig.sortDirection
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: {
              ...DEFAULT_SORT,
              ...state.serverSortConfigs[serverId],
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
    }),
    {
      name: 'channel-sort-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        serverSortConfigs: state.serverSortConfigs,
        lastAccessedAt: state.lastAccessedAt,
      }),
    },
  ),
)
