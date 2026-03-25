import * as Linking from 'expo-linking'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

interface UseOAuthReturn {
  signInWithGoogle: () => Promise<void>
  signInWithGitHub: () => Promise<void>
  isLoading: boolean
}

/**
 * Hook for handling OAuth authentication in React Native
 * Uses expo-web-browser to open OAuth provider login in a secure web browser,
 * then handles the callback via deep linking.
 *
 * This approach is recommended for React Native apps as it:
 * 1. Uses the provider's official web login (most reliable)
 * 2. Keeps credentials within the secure browser context
 * 3. Works consistently across iOS and Android
 */
export function useOAuth(): UseOAuthReturn {
  const setAuth = useAuthStore((s) => s.setAuth)
  const [isLoading, setIsLoading] = useState(false)
  const authSessionRef = useRef<WebBrowser.WebBrowserAuthSessionResult | null>(null)

  const completeAuthByUrl = useCallback(
    async (url: string) => {
      if (!url.includes('oauth-callback')) return

      const parsedUrl = Linking.parse(url)
      const { access_token, refresh_token, accessToken, refreshToken, error } =
        parsedUrl.queryParams as {
          access_token?: string
          refresh_token?: string
          accessToken?: string
          refreshToken?: string
          error?: string
        }

      if (error) {
        throw new Error(`OAuth error: ${error}`)
      }

      const nextAccessToken = access_token ?? accessToken
      const nextRefreshToken = refresh_token ?? refreshToken
      if (!nextAccessToken || !nextRefreshToken) {
        throw new Error('Missing OAuth tokens in callback URL')
      }

      await SecureStore.setItemAsync('accessToken', nextAccessToken)
      await SecureStore.setItemAsync('refreshToken', nextRefreshToken)

      const user = await fetchApi<{
        id: string
        email: string
        username: string
        displayName: string | null
        avatarUrl: string | null
      }>('/api/auth/me', {
        headers: { Authorization: `Bearer ${nextAccessToken}` },
      })

      setAuth(user, nextAccessToken, nextRefreshToken)
    },
    [setAuth],
  )

  /**
   * Handle OAuth callback from deep link
   * URL format: shadow://oauth-callback?access_token=xxx&refresh_token=xxx&redirect=xxx
   */
  const handleDeepLink = useCallback(
    async (event: { url: string }) => {
      try {
        await completeAuthByUrl(event.url)
      } catch (err) {
        console.error('Failed to complete OAuth login:', err)
      }
    },
    [completeAuthByUrl],
  )

  // Listen for OAuth callback via deep linking
  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink)

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url })
      }
    })

    return () => {
      subscription.remove()
    }
  }, [handleDeepLink])

  /**
   * Start OAuth flow by opening the provider's login page
   */
  const startOAuthFlow = useCallback(
    async (provider: 'google' | 'github') => {
      setIsLoading(true)
      try {
        // Get the API base URL
        const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? 'https://shadowob.com'

        // Works in Expo Go (exp://.../--/oauth-callback) and standalone builds (shadow://oauth-callback)
        const callbackUrl = Linking.createURL('oauth-callback')
        const oauthUrl = `${apiBase}/api/auth/oauth/${provider}?redirect=${encodeURIComponent(callbackUrl)}`

        // Open the OAuth page in a secure browser
        // This will show the provider's native login UI
        const result = await WebBrowser.openAuthSessionAsync(oauthUrl, callbackUrl, {
          showInRecents: true,
          preferEphemeralSession: true, // iOS: don't share cookies with Safari
        })

        authSessionRef.current = result

        if (result.type === 'success' && 'url' in result && result.url) {
          await completeAuthByUrl(result.url)
        } else if (result.type === 'dismiss') {
          // User cancelled the OAuth flow
          console.log('OAuth flow was cancelled')
        }
      } catch (error) {
        console.error('OAuth error:', error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [completeAuthByUrl],
  )

  const signInWithGoogle = useCallback(() => startOAuthFlow('google'), [startOAuthFlow])
  const signInWithGitHub = useCallback(() => startOAuthFlow('github'), [startOAuthFlow])

  return {
    signInWithGoogle,
    signInWithGitHub,
    isLoading,
  }
}
