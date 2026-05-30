import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'
import { queryClient } from '../lib/query-client'
import { getApiBaseUrl } from '../lib/server-url'
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
  isLoading: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  setUser: (user: User) => void
  loadPersistedToken: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, accessToken, refreshToken) => {
    SecureStore.setItemAsync('accessToken', accessToken)
    SecureStore.setItemAsync('refreshToken', refreshToken)
    set({ user, accessToken, isAuthenticated: true, isLoading: false })
  },

  logout: () => {
    SecureStore.deleteItemAsync('accessToken')
    SecureStore.deleteItemAsync('refreshToken')
    queryClient.removeQueries()
    queryClient.clear()
    useChatStore.getState().setActiveServer(null)
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
  },

  setUser: (user) => set({ user }),

  loadPersistedToken: async () => {
    await getApiBaseUrl()
    const token = await SecureStore.getItemAsync('accessToken')
    set({
      accessToken: token,
      isAuthenticated: !!token,
      isLoading: false,
    })
  },
}))
