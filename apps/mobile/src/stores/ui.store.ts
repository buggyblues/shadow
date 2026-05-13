import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'
import { create } from 'zustand'
import { type BackgroundOptionId, DEFAULT_BACKGROUND_ID } from '../lib/backgrounds'

export type ThemeMode = 'dark' | 'light' | 'system'

interface UIState {
  theme: ThemeMode
  effectiveTheme: 'dark' | 'light'
  backgroundImage: BackgroundOptionId
  enableBackgroundMovement: boolean
  pendingAction: string | null
  setTheme: (theme: ThemeMode) => void
  setBackgroundImage: (backgroundImage: BackgroundOptionId) => void
  setEnableBackgroundMovement: (enabled: boolean) => void
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
  backgroundImage: DEFAULT_BACKGROUND_ID,
  enableBackgroundMovement: true,
  pendingAction: null,

  setTheme: (theme) => {
    AsyncStorage.setItem('shadow-theme', theme)
    set({ theme, effectiveTheme: resolveEffective(theme) })
  },

  setBackgroundImage: (backgroundImage) => {
    AsyncStorage.setItem('shadow-bg-image', backgroundImage)
    set({ backgroundImage })
  },

  setEnableBackgroundMovement: (enableBackgroundMovement) => {
    AsyncStorage.setItem('shadow-bg-movement', String(enableBackgroundMovement))
    set({ enableBackgroundMovement })
  },

  setPendingAction: (action) => set({ pendingAction: action }),

  loadPersistedTheme: async () => {
    const saved = (await AsyncStorage.getItem('shadow-theme')) as ThemeMode | null
    const theme = saved ?? 'dark'
    const savedBackground = (await AsyncStorage.getItem(
      'shadow-bg-image',
    )) as BackgroundOptionId | null
    const savedMovement = await AsyncStorage.getItem('shadow-bg-movement')
    set({
      theme,
      effectiveTheme: resolveEffective(theme),
      backgroundImage: savedBackground ?? DEFAULT_BACKGROUND_ID,
      enableBackgroundMovement: savedMovement !== 'false',
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
