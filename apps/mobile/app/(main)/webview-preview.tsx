import { useLocalSearchParams, useNavigation } from 'expo-router'
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw, X } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native'
import WebView from 'react-native-webview'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { ApiError, fetchApi } from '../../src/lib/api'
import { useColors } from '../../src/theme'

interface AppCommandApproval {
  appName: string
  commandName: string
  commandTitle: string
  permission: string
  action: string
  dataClass: string
  buddyAgentId?: string | null
  approvalMode: string
}

interface BridgeRequest {
  requestId: string
  commandName: string
  input?: unknown
  channelId?: string
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
  const webViewRef = useRef<WebView>(null)

  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(url ?? '')
  const [pageTitle, setPageTitle] = useState(title ?? '')

  const decodedUrl = url ? decodeURIComponent(url) : ''

  const postBridgeResponse = useCallback(
    (requestId: string, payload: { ok: true; result: unknown } | { ok: false; error: string }) => {
      const message = JSON.stringify({
        type: 'shadow.app.command.response',
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

  const approveAndRetry = useCallback(
    async (request: BridgeRequest, approval: AppCommandApproval) => {
      if (!serverSlug || !appKey) return
      try {
        await fetchApi(`/api/servers/${serverSlug}/apps/${appKey}/approvals`, {
          method: 'POST',
          body: JSON.stringify({
            commandName: request.commandName,
            buddyAgentId: approval.buddyAgentId ?? undefined,
            remember: approval.approvalMode !== 'every_time',
          }),
        })
        const result = await fetchApi(
          `/api/servers/${serverSlug}/apps/${appKey}/commands/${encodeURIComponent(
            request.commandName,
          )}`,
          {
            method: 'POST',
            body: JSON.stringify({ input: request.input ?? {}, channelId: request.channelId }),
          },
        )
        postBridgeResponse(request.requestId, { ok: true, result })
      } catch (error) {
        postBridgeResponse(request.requestId, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [appKey, postBridgeResponse, serverSlug],
  )

  const requestApproval = useCallback(
    (request: BridgeRequest, approval: AppCommandApproval) => {
      Alert.alert(
        t('serverApps.commandApprovalTitle'),
        t('serverApps.commandApprovalMessage', {
          app: approval.appName,
          command: approval.commandTitle || approval.commandName,
          permission: approval.permission,
        }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
            onPress: () =>
              postBridgeResponse(request.requestId, {
                ok: false,
                error: t('serverApps.commandApprovalDenied'),
              }),
          },
          {
            text: t('serverApps.commandApprovalConfirm'),
            onPress: () => {
              void approveAndRetry(request, approval)
            },
          },
        ],
      )
    },
    [approveAndRetry, postBridgeResponse, t],
  )

  const callBridgeCommand = useCallback(
    async (request: BridgeRequest) => {
      if (!serverSlug || !appKey) return
      try {
        const result = await fetchApi(
          `/api/servers/${serverSlug}/apps/${appKey}/commands/${encodeURIComponent(
            request.commandName,
          )}`,
          {
            method: 'POST',
            body: JSON.stringify({ input: request.input ?? {}, channelId: request.channelId }),
          },
        )
        postBridgeResponse(request.requestId, { ok: true, result })
      } catch (error) {
        if (error instanceof ApiError && error.code === 'SERVER_APP_COMMAND_APPROVAL_REQUIRED') {
          const approval = (error.params?.approval ?? null) as AppCommandApproval | null
          if (approval) {
            requestApproval(request, approval)
            return
          }
        }
        postBridgeResponse(request.requestId, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [appKey, postBridgeResponse, requestApproval, serverSlug],
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
      if (message.type !== 'shadow.app.command.request') return
      if (message.appKey && message.appKey !== appKey) return
      if (typeof message.requestId !== 'string' || typeof message.commandName !== 'string') return
      void callBridgeCommand({
        requestId: message.requestId,
        commandName: message.commandName,
        input: message.input,
        channelId: typeof message.channelId === 'string' ? message.channelId : undefined,
      })
    },
    [appKey, callBridgeCommand],
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
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        // Security settings
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // Allow navigation within the webview
        onShouldStartLoadWithRequest={(request) => {
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
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
})
