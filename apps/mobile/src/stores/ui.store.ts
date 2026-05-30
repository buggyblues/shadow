import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'
import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light' | 'system'

interface UIState {
  theme: ThemeMode
  effectiveTheme: 'dark' | 'light'
  pendingAction: string | null
  setTheme: (theme: ThemeMode) => void
  setPendingAction: (action: string | null) => void
  loadPersistedTheme: () => Promise<void>
}

function resolveEffective(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'system') {
    return Appearance.getColorScheme() === 'light' ? 'light' : 'dark'
  }
  return theme
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  effectiveTheme: 'dark',
  pendingAction: null,

  setTheme: (theme) => {
    AsyncStorage.setItem('shadow-theme', theme)
    set({ theme, effectiveTheme: resolveEffective(theme) })
  },

  setPendingAction: (action) => set({ pendingAction: action }),

  loadPersistedTheme: async () => {
    const saved = (await AsyncStorage.getItem('shadow-theme')) as ThemeMode | null
    const theme = saved ?? 'dark'
    set({
      theme,
      effectiveTheme: resolveEffective(theme),
    })
  },
}))

// Listen for system theme changes
Appearance.addChangeListener(({ colorScheme }) => {
  const state = useUIStore.getState()
  if (state.theme === 'system') {
    useUIStore.setState({ effectiveTheme: colorScheme === 'light' ? 'light' : 'dark' })
  }
})
