import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { fetchApi } from '../src/lib/api'
import { useAuthStore } from '../src/stores/auth.store'
import { fontSize, spacing, useColors } from '../src/theme'

export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{
    accessToken?: string
    refreshToken?: string
    access_token?: string
    refresh_token?: string
    error?: string
  }>()
  const colors = useColors()
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const handleCallback = async () => {
      if (params.error) {
        router.replace('/(auth)/login')
        return
      }

      const accessToken = params.accessToken ?? params.access_token
      const refreshToken = params.refreshToken ?? params.refresh_token

      if (accessToken && refreshToken) {
        // Store tokens
        await SecureStore.setItemAsync('accessToken', accessToken)
        await SecureStore.setItemAsync('refreshToken', refreshToken)

        // Fetch user info
        try {
          const user = await fetchApi<{
            id: string
            email: string
            username: string
            displayName: string | null
            avatarUrl: string | null
          }>('/api/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          setAuth(user, accessToken, refreshToken)
          router.replace('/(main)')
        } catch {
          router.replace('/(auth)/login')
        }
      } else {
        router.replace('/(auth)/login')
      }
    }

    handleCallback()
  }, [
    params.accessToken,
    params.refreshToken,
    params.access_token,
    params.refresh_token,
    params.error,
    router.replace,
    setAuth,
  ])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>正在登录...</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { marginTop: spacing.lg, fontSize: fontSize.md },
})
