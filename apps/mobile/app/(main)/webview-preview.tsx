import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBridgeEnsureBuddyGrantInput,
  type ShadowBridgeListBuddyInboxesInput,
  type ShadowBridgeOpenBuddyCreatorInput,
  type ShadowBridgeOpenCopilotInput,
  type ShadowBridgeOpenWorkspaceResourceInput,
} from '@shadowob/sdk/bridge'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, X } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import WebView from 'react-native-webview'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { OAuthAuthorizationSheet } from '../../src/components/oauth/oauth-authorization-sheet'
import { useShadowOAuthAuthorization } from '../../src/hooks/use-shadow-oauth-authorization'
import { fetchApi, getCachedApiBaseUrl } from '../../src/lib/api'
import { serverChannelHref } from '../../src/lib/routes'
import { fontSize, palette, spacing, useColors } from '../../src/theme'

interface BridgeCapabilitiesRequest {
  requestId: string
}

type BridgeOpenCopilotRequest = { requestId: string } & ShadowBridgeOpenCopilotInput

type BridgeOpenWorkspaceResourceRequest = {
  requestId: string
} & ShadowBridgeOpenWorkspaceResourceInput

type BridgeOpenBuddyCreatorRequest = { requestId: string } & ShadowBridgeOpenBuddyCreatorInput

type BridgeListBuddyInboxesRequest = { requestId: string } & ShadowBridgeListBuddyInboxesInput

type BridgeEnsureBuddyGrantRequest = {
  requestId: string
} & ShadowBridgeEnsureBuddyGrantInput

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function absoluteMobileHostUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return value
  try {
    return new URL(value, getCachedApiBaseUrl()).toString()
  } catch {
    return value
  }
}

function normalizeBridgeInbox(value: unknown) {
  const inbox = recordValue(value)
  const agent = recordValue(inbox?.agent)
  const user = recordValue(agent?.user)
  if (!inbox || !agent || !user) return value
  return {
    ...inbox,
    agent: {
      ...agent,
      user: {
        ...user,
        avatarUrl: absoluteMobileHostUrl(user.avatarUrl),
      },
    },
  }
}

export default function WebViewPreviewScreen() {
  const { url, title, serverSlug, appKey } = useLocalSearchParams<{
    url: string
    title?: string
    serverSlug?: string
    appKey?: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const navigation = useNavigation()
  const router = useRouter()
  const webViewRef = useRef<WebView>(null)

  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(url ?? '')
  const [pageTitle, setPageTitle] = useState(title ?? '')

  const decodedUrl = url ? decodeURIComponent(url) : ''

  const navigateWebView = useCallback((targetUrl: string) => {
    setCurrentUrl(targetUrl)
    webViewRef.current?.injectJavaScript(
      `window.location.assign(${JSON.stringify(targetUrl)}); true;`,
    )
  }, [])

  const oauthAuthorization = useShadowOAuthAuthorization({ onRedirect: navigateWebView })

  const postBridgeResponse = useCallback(
    (
      requestId: string,
      payload: { ok: true; result: unknown } | { ok: false; error: string },
      responseType: string,
    ) => {
      const message = JSON.stringify({
        type: responseType,
        requestId,
        ...payload,
      })
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
          message,
        )} })); true;`,
      )
    },
    [],
  )

  const callBridgeCapabilities = useCallback(
    (request: BridgeCapabilitiesRequest) => {
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { capabilities: [...SHADOW_BRIDGE_CAPABILITIES] } },
        ShadowBridge.capabilitiesResponseType,
      )
    },
    [postBridgeResponse],
  )

  const callBridgeOpenCopilot = useCallback(
    (request: BridgeOpenCopilotRequest) => {
      const channelId = request.delivery?.channelId
      if (!serverSlug || !channelId) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing Copilot channel id' },
          ShadowBridge.openCopilotResponseType,
        )
        return
      }
      router.push(
        serverChannelHref(serverSlug, channelId, {
          messageId: request.delivery.messageId,
        }) as never,
      )
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true } },
        ShadowBridge.openCopilotResponseType,
      )
    },
    [postBridgeResponse, router, serverSlug],
  )

  const callBridgeOpenWorkspaceResource = useCallback(
    (request: BridgeOpenWorkspaceResourceRequest) => {
      if (!serverSlug) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing server context' },
          ShadowBridge.openWorkspaceResourceResponseType,
        )
        return
      }
      router.push(`/(main)/servers/${serverSlug}/workspace` as never)
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true } },
        ShadowBridge.openWorkspaceResourceResponseType,
      )
    },
    [postBridgeResponse, router, serverSlug],
  )

  const callBridgeOpenBuddyCreator = useCallback(
    (request: BridgeOpenBuddyCreatorRequest) => {
      const params = new URLSearchParams()
      if (request.landing?.title) params.set('landingTitle', request.landing.title)
      if (request.landing?.description) {
        params.set('landingDescription', request.landing.description)
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : ''
      router.push(`/(main)/create-buddy${suffix}` as never)
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true, agent: null } },
        ShadowBridge.openBuddyCreatorResponseType,
      )
    },
    [postBridgeResponse, router],
  )

  const callBridgeListBuddyInboxes = useCallback(
    async (request: BridgeListBuddyInboxesRequest) => {
      if (!serverSlug) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing server context' },
          ShadowBridge.listBuddyInboxesResponseType,
        )
        return
      }
      try {
        const inboxes = await fetchApi<unknown[]>(`/api/servers/${serverSlug}/inboxes`)
        postBridgeResponse(
          request.requestId,
          { ok: true, result: { inboxes: inboxes.map(normalizeBridgeInbox) } },
          ShadowBridge.listBuddyInboxesResponseType,
        )
      } catch (err) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: err instanceof Error ? err.message : 'Buddy inbox lookup failed' },
          ShadowBridge.listBuddyInboxesResponseType,
        )
      }
    },
    [postBridgeResponse, serverSlug],
  )

  const callBridgeEnsureBuddyGrant = useCallback(
    async (request: BridgeEnsureBuddyGrantRequest) => {
      if (!serverSlug || !appKey) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing app context' },
          ShadowBridge.ensureBuddyGrantResponseType,
        )
        return
      }
      if (!request.buddyAgentId || request.permissions.length === 0) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing Buddy grant request' },
          ShadowBridge.ensureBuddyGrantResponseType,
        )
        return
      }
      try {
        const grant = await fetchApi(`/api/servers/${serverSlug}/apps/${appKey}/grants`, {
          method: 'POST',
          body: JSON.stringify({
            buddyAgentId: request.buddyAgentId,
            permissions: request.permissions,
            approvalMode: 'none',
            mergePermissions: true,
          }),
        })
        postBridgeResponse(
          request.requestId,
          { ok: true, result: { granted: true, grant } },
          ShadowBridge.ensureBuddyGrantResponseType,
        )
      } catch (err) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: err instanceof Error ? err.message : 'Buddy grant failed' },
          ShadowBridge.ensureBuddyGrantResponseType,
        )
      }
    },
    [appKey, postBridgeResponse, serverSlug],
  )

  const handleWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      let data: unknown
      try {
        data = JSON.parse(event.nativeEvent.data)
      } catch {
        return
      }
      if (!data || typeof data !== 'object') return
      const message = data as Record<string, unknown>
      if (message.appKey && message.appKey !== appKey) return
      if (message.type === ShadowBridge.capabilitiesRequestType) {
        if (typeof message.requestId !== 'string') return
        callBridgeCapabilities({ requestId: message.requestId })
        return
      }
      if (message.type === ShadowBridge.openCopilotRequestType) {
        if (typeof message.requestId !== 'string') return
        callBridgeOpenCopilot({
          requestId: message.requestId,
          delivery:
            message.delivery && typeof message.delivery === 'object'
              ? (message.delivery as BridgeOpenCopilotRequest['delivery'])
              : {},
        })
        return
      }
      if (message.type === ShadowBridge.openWorkspaceResourceRequestType) {
        if (typeof message.requestId !== 'string') return
        callBridgeOpenWorkspaceResource({
          requestId: message.requestId,
          resource:
            message.resource && typeof message.resource === 'object'
              ? (message.resource as BridgeOpenWorkspaceResourceRequest['resource'])
              : {},
        })
        return
      }
      if (message.type === ShadowBridge.openBuddyCreatorRequestType) {
        if (typeof message.requestId !== 'string') return
        callBridgeOpenBuddyCreator({
          requestId: message.requestId,
          landing:
            message.landing && typeof message.landing === 'object'
              ? (message.landing as BridgeOpenBuddyCreatorRequest['landing'])
              : undefined,
        })
        return
      }
      if (message.type === ShadowBridge.listBuddyInboxesRequestType) {
        if (typeof message.requestId !== 'string') return
        void callBridgeListBuddyInboxes({
          requestId: message.requestId,
          refresh: message.refresh === true,
        })
        return
      }
      if (message.type === ShadowBridge.ensureBuddyGrantRequestType) {
        if (typeof message.requestId !== 'string') return
        const permissions = Array.isArray(message.permissions)
          ? message.permissions.filter(
              (permission): permission is string => typeof permission === 'string',
            )
          : []
        void callBridgeEnsureBuddyGrant({
          requestId: message.requestId,
          buddyAgentId: typeof message.buddyAgentId === 'string' ? message.buddyAgentId : '',
          permissions,
          reason: typeof message.reason === 'string' ? message.reason : undefined,
        })
      }
    },
    [
      appKey,
      callBridgeCapabilities,
      callBridgeOpenCopilot,
      callBridgeOpenWorkspaceResource,
      callBridgeOpenBuddyCreator,
      callBridgeListBuddyInboxes,
      callBridgeEnsureBuddyGrant,
    ],
  )

  const handleGoBack = useCallback(() => {
    webViewRef.current?.goBack()
  }, [])

  const handleGoForward = useCallback(() => {
    webViewRef.current?.goForward()
  }, [])

  const handleRefresh = useCallback(() => {
    webViewRef.current?.reload()
  }, [])

  const handleClose = useCallback(() => {
    navigation.goBack()
  }, [navigation])

  const handleOpenInBrowser = useCallback(async () => {
    if (currentUrl) {
      await Linking.openURL(currentUrl)
    }
  }, [currentUrl])

  const onNavigationStateChange = useCallback(
    (navState: { canGoBack: boolean; canGoForward: boolean; url: string; title: string }) => {
      setCanGoBack(navState.canGoBack)
      setCanGoForward(navState.canGoForward)
      setCurrentUrl(navState.url)
      if (navState.title && navState.title !== 'about:blank') {
        setPageTitle(navState.title)
      }
    },
    [],
  )

  useEffect(() => {
    navigation.setOptions({
      title: pageTitle || t('chat.webPreview', '网页预览'),
      headerLeft: () => (
        <HeaderButtonGroup>
          <HeaderButton
            icon={ArrowLeft}
            onPress={handleGoBack}
            disabled={!canGoBack}
            color={canGoBack ? colors.text : colors.textMuted}
          />
          <HeaderButton
            icon={ArrowRight}
            onPress={handleGoForward}
            disabled={!canGoForward}
            color={canGoForward ? colors.text : colors.textMuted}
          />
        </HeaderButtonGroup>
      ),
      headerRight: () => (
        <HeaderButtonGroup>
          <HeaderButton icon={RefreshCw} onPress={handleRefresh} color={colors.text} />
          <HeaderButton icon={ExternalLink} onPress={handleOpenInBrowser} color={colors.text} />
          <HeaderButton icon={X} onPress={handleClose} color={colors.text} />
        </HeaderButtonGroup>
      ),
    })
  }, [
    navigation,
    pageTitle,
    colors,
    t,
    canGoBack,
    canGoForward,
    handleGoBack,
    handleGoForward,
    handleRefresh,
    handleOpenInBrowser,
    handleClose,
  ])

  if (!decodedUrl) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {t('chat.invalidUrl', '无效的链接')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: decodedUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={handleWebViewMessage}
        onNavigationStateChange={onNavigationStateChange}
        onOpenWindow={(event) => {
          const targetUrl = event.nativeEvent.targetUrl
          if (!targetUrl) return
          if (oauthAuthorization.intercept(targetUrl)) return
          Linking.openURL(targetUrl).catch(() => undefined)
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        // Security settings
        javaScriptEnabled={true}
        javaScriptCanOpenWindowsAutomatically={true}
        domStorageEnabled={true}
        // Allow navigation within the webview
        onShouldStartLoadWithRequest={(request) => {
          if (oauthAuthorization.intercept(request.url)) {
            return false
          }
          // Allow internal navigation
          if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
            return true
          }
          // Open other schemes in system browser
          if (request.url.startsWith('tel:') || request.url.startsWith('mailto:')) {
            Linking.openURL(request.url)
            return false
          }
          return true
        }}
      />
      <OAuthAuthorizationSheet
        state={oauthAuthorization}
        onApprove={oauthAuthorization.approve}
        onDeny={oauthAuthorization.deny}
        t={t}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.black,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  errorText: {
    fontSize: fontSize.md,
    textAlign: 'center',
  },
})
