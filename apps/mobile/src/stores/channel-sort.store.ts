import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChannelSortBy, ChannelSortDirection } from '@shadow/shared'

interface ServerSortConfig {
  sortBy: ChannelSortBy
  sortDirection: ChannelSortDirection
}

interface ChannelSortState {
  /** Sort config per server */
  serverSortConfigs: Record<string, ServerSortConfig>
  /** Current server ID */
  currentServerId: string | null
  /** Last accessed timestamps for channels (for lastAccessedAt sorting) */
  lastAccessedAt: Record<string, string>
  /** Set current server */
  setCurrentServer: (serverId: string | null) => void
  /** Get sort config for current server */
  getCurrentSortConfig: () => ServerSortConfig
  /** Set sort criteria for current server */
  setSortBy: (by: ChannelSortBy) => void
  /** Set sort direction for current server */
  setSortDirection: (direction: ChannelSortDirection) => void
  /** Toggle sort direction for current server */
  toggleSortDirection: () => void
  /** Check if current server has custom sorting */
  hasCustomSort: () => boolean
  /** Update last accessed timestamp for a channel */
  updateLastAccessed: (channelId: string) => void
  /** Get last accessed timestamp for a channel */
  getLastAccessed: (channelId: string) => string | undefined
}

const DEFAULT_SORT: ServerSortConfig = {
  sortBy: 'position',
  sortDirection: 'asc',
}

export const useChannelSortStore = create<ChannelSortState>()(
  persist(
    (set, get) => ({
      serverSortConfigs: {},
      currentServerId: null,
      lastAccessedAt: {},

      setCurrentServer: (serverId) => set({ currentServerId: serverId }),

      getCurrentSortConfig: () => {
        const { currentServerId, serverSortConfigs } = get()
        if (!currentServerId) return DEFAULT_SORT
        return serverSortConfigs[currentServerId] ?? DEFAULT_SORT
      },

      setSortBy: (by) => {
        const { currentServerId } = get()
        if (!currentServerId) return
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [currentServerId]: {
              ...state.serverSortConfigs[currentServerId],
              sortBy: by,
            },
          },
        }))
      },

      setSortDirection: (direction) => {
        const { currentServerId } = get()
        if (!currentServerId) return
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [currentServerId]: {
              ...state.serverSortConfigs[currentServerId],
              sortDirection: direction,
            },
          },
        }))
      },

      toggleSortDirection: () => {
        const { currentServerId, serverSortConfigs } = get()
        if (!currentServerId) return
        const current = serverSortConfigs[currentServerId]?.sortDirection ?? 'asc'
        set((state) => ({
          serverSortConfigs: {
            ...state.serverSortConfigs,
            [currentServerId]: {
              ...state.serverSortConfigs[currentServerId],
              sortDirection: current === 'asc' ? 'desc' : 'asc',
            },
          },
        }))
      },

      hasCustomSort: () => {
        const { currentServerId, serverSortConfigs } = get()
        if (!currentServerId) return false
        const config = serverSortConfigs[currentServerId]
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
    }
  )
)
