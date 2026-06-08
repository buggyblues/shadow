import { create } from 'zustand'
import {
  type DesktopCommunityAuthSyncReason,
  syncDesktopCommunityAuthToken,
} from '../lib/desktop-community-auth'
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
  logout: (options?: {
    syncDesktop?: boolean
    desktopReason?: Extract<DesktopCommunityAuthSyncReason, 'logout' | 'revoked'>
  }) => void
  setUser: (user: User) => void
}

function authStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

const initialAccessToken = authStorage()?.getItem('accessToken') ?? null

function clearLocalAuthStorage() {
  authStorage()?.removeItem('accessToken')
  authStorage()?.removeItem('refreshToken')
  queryClient.removeQueries()
  queryClient.clear()
  useChatStore.getState().setActiveServer(null)
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: initialAccessToken,
  isAuthenticated: Boolean(initialAccessToken),

  setAuth: (user, accessToken, refreshToken) => {
    authStorage()?.setItem('accessToken', accessToken)
    authStorage()?.setItem('refreshToken', refreshToken)
    syncDesktopCommunityAuthToken(accessToken, refreshToken, 'login')
    queryClient.setQueryData(['me'], user)
    set({ user, accessToken, isAuthenticated: true })
  },

  logout: (options) => {
    clearLocalAuthStorage()
    if (options?.syncDesktop ?? true) {
      syncDesktopCommunityAuthToken(null, null, options?.desktopReason ?? 'logout')
    }
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  setUser: (user) =>
    set((state) => {
      const accessToken = state.accessToken ?? authStorage()?.getItem('accessToken')
      queryClient.setQueryData(['me'], user)
      return { user, accessToken, isAuthenticated: Boolean(accessToken) }
    }),
}))
