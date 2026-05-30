import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import {
  completeOAuthCallback,
  completeOAuthCallbackUrl,
  isOAuthCallbackUrl,
  normalizeOAuthCallbackParams,
} from '../src/lib/oauth-callback'
import { useAuthStore } from '../src/stores/auth.store'
import { fontSize, spacing, useColors } from '../src/theme'

export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{
    accessToken?: string
    refreshToken?: string
    access_token?: string
    refresh_token?: string
    oauth?: string
    provider?: string
    error?: string
  }>()
  const colors = useColors()
  const { t } = useTranslation()
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const currentUrl = Linking.useURL()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const candidateUrls = [currentUrl, await Linking.getInitialURL()]
        for (const url of candidateUrls) {
          if (!url || !isOAuthCallbackUrl(url)) continue
          const result = await completeOAuthCallbackUrl(url, setAuth)
          if (result === 'authenticated') {
            router.replace('/(main)')
            return
          }
          if (result === 'linked') {
            router.replace('/(main)/settings/account')
            return
          }
        }

        const result = await completeOAuthCallback(normalizeOAuthCallbackParams(params), setAuth)
        if (result === 'authenticated') {
          router.replace('/(main)')
          return
        }
        if (result === 'linked') {
          router.replace('/(main)/settings/account')
          return
        }
        router.replace('/(auth)/login')
      } catch {
        router.replace('/(auth)/login')
      }
    }

    handleCallback()
  }, [
    params.accessToken,
    params.refreshToken,
    params.access_token,
    params.refresh_token,
    params.oauth,
    params.error,
    currentUrl,
    router.replace,
    setAuth,
  ])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {t('auth.oauthCallbackSigningIn')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { marginTop: spacing.lg, fontSize: fontSize.md },
})
