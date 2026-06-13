import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import '../src/i18n'
import { ToastViewport } from '../src/components/common/toast-viewport'
import { queryClient } from '../src/lib/query-client'
import { useAuthStore } from '../src/stores/auth.store'
import { useUIStore } from '../src/stores/ui.store'

export default function RootLayout() {
  const effectiveTheme = useUIStore((s) => s.effectiveTheme)
  const loadPersistedTheme = useUIStore((s) => s.loadPersistedTheme)
  const loadPersistedToken = useAuthStore((s) => s.loadPersistedToken)

  useEffect(() => {
    loadPersistedTheme()
    loadPersistedToken()
  }, [loadPersistedTheme, loadPersistedToken])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(main)" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <ToastViewport />
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
