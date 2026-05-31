import { create } from 'zustand'
import { syncDesktopCommunityAuthToken } from '../lib/desktop-community-auth'
import { queryClient } from '../lib/query-client'
import { useChatStore } from './chat.store'

interface User {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status?: string
  membership?: {
    status: string
    tier?: {
      id: string
      level: number
      label: string
      capabilities: string[]
    }
    level?: number
    isMember: boolean
    memberSince?: string | null
    inviteCodeId?: string | null
    capabilities: string[]
  }
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  isAuthenticated: !!localStorage.getItem('accessToken'),

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    syncDesktopCommunityAuthToken(accessToken, refreshToken)
    set({ user, accessToken, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    syncDesktopCommunityAuthToken(null, null)
    // Clear all query cache to prevent stale data leaking across sessions
    queryClient.removeQueries()
    queryClient.clear()
    // Reset chat state (activeServerId, activeChannelId, etc.)
    useChatStore.getState().setActiveServer(null)
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  setUser: (user) =>
    set((state) => {
      const accessToken = state.accessToken ?? localStorage.getItem('accessToken')
      return { user, accessToken, isAuthenticated: Boolean(accessToken) }
    }),
}))
