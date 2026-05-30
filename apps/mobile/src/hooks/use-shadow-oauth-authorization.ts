import {
  buildShadowOAuthDenyRedirect,
  parseShadowOAuthAuthorizeUrl,
  type ShadowOAuthAuthorizationRequest,
  shadowOAuthAuthorizeApiPath,
} from '@shadowob/oauth'
import { useCallback, useState } from 'react'
import { fetchApi, getCachedApiBaseUrl } from '../lib/api'

export interface ShadowOAuthAuthorizeInfo {
  appId: string
  appName: string
  appLogoUrl: string | null
  homepageUrl: string | null
  scope: string
  redirectUri: string
  state?: string
}

export interface ShadowOAuthAuthorizationState {
  request: ShadowOAuthAuthorizationRequest | null
  appInfo: ShadowOAuthAuthorizeInfo | null
  loading: boolean
  approving: boolean
  error: string | null
}

export function useShadowOAuthAuthorization({ onRedirect }: { onRedirect: (url: string) => void }) {
  const [state, setState] = useState<ShadowOAuthAuthorizationState>({
    request: null,
    appInfo: null,
    loading: false,
    approving: false,
    error: null,
  })

  const clear = useCallback(() => {
    setState({
      request: null,
      appInfo: null,
      loading: false,
      approving: false,
      error: null,
    })
  }, [])

  const begin = useCallback(async (request: ShadowOAuthAuthorizationRequest) => {
    setState({
      request,
      appInfo: null,
      loading: true,
      approving: false,
      error: null,
    })
    try {
      const appInfo = await fetchApi<ShadowOAuthAuthorizeInfo>(shadowOAuthAuthorizeApiPath(request))
      setState({
        request,
        appInfo: { ...appInfo, state: request.state },
        loading: false,
        approving: false,
        error: null,
      })
    } catch (error) {
      setState({
        request,
        appInfo: null,
        loading: false,
        approving: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  const intercept = useCallback(
    (url: string) => {
      const request = parseShadowOAuthAuthorizeUrl(url, {
        allowedOrigins: [getCachedApiBaseUrl(), 'https://shadowob.com'],
      })
      if (!request) return false
      void begin(request)
      return true
    },
    [begin],
  )

  const deny = useCallback(() => {
    if (!state.request) {
      clear()
      return
    }
    const redirectUrl = buildShadowOAuthDenyRedirect(state.request)
    clear()
    onRedirect(redirectUrl)
  }, [clear, onRedirect, state.request])

  const approve = useCallback(async () => {
    if (!state.request || !state.appInfo) return
    setState((current) => ({ ...current, approving: true, error: null }))
    try {
      const result = await fetchApi<{ redirectUrl: string }>('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({
          clientId: state.request.clientId,
          redirectUri: state.request.redirectUri,
          scope: state.appInfo.scope,
          state: state.request.state,
        }),
      })
      clear()
      onRedirect(result.redirectUrl)
    } catch (error) {
      setState((current) => ({
        ...current,
        approving: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [clear, onRedirect, state.appInfo, state.request])

  return {
    ...state,
    visible: Boolean(state.request),
    intercept,
    approve,
    deny,
    clear,
  }
}
