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

  /**
   * Handle OAuth callback from deep link
   * URL format: shadow://oauth-callback?access_token=xxx&refresh_token=xxx&redirect=xxx
   */
  const handleDeepLink = useCallback(
    async (event: { url: string }) => {
      const url = event.url

      // Check if this is an OAuth callback
      if (!url.includes('oauth-callback')) {
        return
      }

      // Parse the URL
      const parsedUrl = Linking.parse(url)
      const { access_token, refresh_token, error } = parsedUrl.queryParams as {
        access_token?: string
        refresh_token?: string
        error?: string
      }

      if (error) {
        console.error('OAuth error:', error)
        return
      }

      if (access_token && refresh_token) {
        try {
          // Store tokens
          await SecureStore.setItemAsync('accessToken', access_token)
          await SecureStore.setItemAsync('refreshToken', refresh_token)

          // Fetch user info
          const user = await fetchApi<{
            id: string
            email: string
            username: string
            displayName: string | null
            avatarUrl: string | null
          }>('/api/auth/me', {
            headers: { Authorization: `Bearer ${access_token}` },
          })

          // Update auth state
          setAuth(user, access_token, refresh_token)
        } catch (err) {
          console.error('Failed to complete OAuth login:', err)
        }
      }
    },
    [setAuth],
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
  const startOAuthFlow = useCallback(async (provider: 'google' | 'github') => {
    setIsLoading(true)
    try {
      // Get the API base URL
      const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? 'https://shadowob.com'

      // Construct OAuth URL with mobile redirect
      // The server will redirect to shadow://oauth-callback after authentication
      const redirectUri = encodeURIComponent('shadow://oauth-callback')
      const oauthUrl = `${apiBase}/api/auth/oauth/${provider}?redirect=${redirectUri}`

      // Open the OAuth page in a secure browser
      // This will show the provider's native login UI
      const result = await WebBrowser.openAuthSessionAsync(oauthUrl, 'shadow://oauth-callback', {
        showInRecents: true,
        preferEphemeralSession: true, // iOS: don't share cookies with Safari
      })

      authSessionRef.current = result

      // The result will be handled by the deep link listener
      // But if the browser was dismissed without completing, we should handle that
      if (result.type === 'dismiss') {
        // User cancelled the OAuth flow
        console.log('OAuth flow was cancelled')
      }
    } catch (error) {
      console.error('OAuth error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signInWithGoogle = useCallback(() => startOAuthFlow('google'), [startOAuthFlow])
  const signInWithGitHub = useCallback(() => startOAuthFlow('github'), [startOAuthFlow])

  return {
    signInWithGoogle,
    signInWithGitHub,
    isLoading,
  }
}
