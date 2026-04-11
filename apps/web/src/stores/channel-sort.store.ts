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
  sortBy: 'lastMessageAt',
  sortDirection: 'desc',
}

function coerceSortBy(by: ChannelSortBy | undefined): ServerSortConfig['sortBy'] {
  return by === 'position' ? 'position' : 'lastMessageAt'
}

function getDirectionForSort(by: ServerSortConfig['sortBy']): ChannelSortDirection {
  return by === 'position' ? 'asc' : 'desc'
}

export function normalizeServerSortConfig(config?: Partial<ServerSortConfig>): ServerSortConfig {
  const sortBy = coerceSortBy(config?.sortBy)

  return {
    sortBy,
    sortDirection: getDirectionForSort(sortBy),
  }
}

export const useChannelSortStore = create<ChannelSortState>()(
  persist(
    (set, get) => ({
      serverSortConfigs: {},
      lastAccessedAt: {},

      setSortBy: (serverId, by) => {
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: normalizeServerSortConfig({ sortBy: by }),
          },
        }))
      },

      setSortDirection: (serverId, direction) => {
        const currentConfig = normalizeServerSortConfig(get().serverSortConfigs[serverId])
        const sortBy =
          currentConfig.sortBy === 'position' && direction === 'asc' ? 'position' : 'lastMessageAt'

        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: normalizeServerSortConfig({ sortBy }),
          },
        }))
      },

      toggleSortDirection: (serverId) => {
        const currentConfig = normalizeServerSortConfig(get().serverSortConfigs[serverId])
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [serverId]: normalizeServerSortConfig({
              sortBy: currentConfig.sortBy === 'lastMessageAt' ? 'position' : 'lastMessageAt',
            }),
          },
        }))
      },

      getSortConfig: (serverId) => {
        return normalizeServerSortConfig(get().serverSortConfigs[serverId])
      },

      hasCustomSort: (serverId) => {
        const config = normalizeServerSortConfig(get().serverSortConfigs[serverId])
        return (
          config.sortBy !== DEFAULT_SORT.sortBy ||
          config.sortDirection !== DEFAULT_SORT.sortDirection
        )
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
      partialize: (state) => ({
        serverSortConfigs: state.serverSortConfigs,
        lastAccessedAt: state.lastAccessedAt,
      }),
    },
  ),
)
