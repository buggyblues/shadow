import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBridgeAuthorizeOAuthInput,
  type ShadowBridgeOpenBuddyCreatorInput,
  type ShadowBridgeOpenChannelInput,
  type ShadowBridgeOpenCopilotInput,
  type ShadowBridgeOpenWorkspaceResourceInput,
  type ShadowBridgeShareSpaceAppInput,
} from '@shadowob/sdk/bridge'
import { buildSpaceAppShareUrl, normalizeSpaceAppRoutePath } from '@shadowob/shared'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ArrowLeft,
  ArrowRight,
  CircleStop,
  ExternalLink,
  type LucideIcon,
  MoreHorizontal,
  RefreshCw,
  Send,
  Share2,
} from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import WebView from 'react-native-webview'
import { OAuthAuthorizationSheet } from '../../src/components/oauth/oauth-authorization-sheet'
import { MobileNavigationBar } from '../../src/components/ui'
import { useShadowOAuthAuthorization } from '../../src/hooks/use-shadow-oauth-authorization'
import { fetchApi, getCachedApiBaseUrl } from '../../src/lib/api'
import { serverChannelHref } from '../../src/lib/routes'
import { showToast } from '../../src/lib/toast'
import { useChatStore } from '../../src/stores/chat.store'
import { useUIStore } from '../../src/stores/ui.store'
import { border, fontSize, iconSize, radius, size, spacing, useColors } from '../../src/theme'

interface BridgeCapabilitiesRequest {
  requestId: string
}

type BridgeOpenCopilotRequest = { requestId: string } & ShadowBridgeOpenCopilotInput

type BridgeOpenChannelRequest = { requestId: string } & ShadowBridgeOpenChannelInput

type BridgeOpenWorkspaceResourceRequest = {
  requestId: string
} & ShadowBridgeOpenWorkspaceResourceInput

type BridgeOpenBuddyCreatorRequest = { requestId: string } & ShadowBridgeOpenBuddyCreatorInput

type BridgeAuthorizeOAuthRequest = { requestId: string } & ShadowBridgeAuthorizeOAuthInput

type BridgeShareSpaceAppRequest = { requestId: string } & ShadowBridgeShareSpaceAppInput

type MobileNavigationMode = 'compat' | 'immersive'

interface MobileNavigationConfig {
  mode?: MobileNavigationMode
  capsule?: {
    backgroundColor?: string
    foregroundColor?: string
    borderColor?: string
  }
}

interface LaunchContext {
  launchToken: string
  eventStreamPath?: string
  expiresIn?: number
}

function bridgeLaunchPayload(launch: LaunchContext) {
  return {
    launchToken: launch.launchToken,
    expiresIn: launch.expiresIn,
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isSafeColor(value: string) {
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))$/.test(value)
}

function colorValue(value: unknown) {
  const color = stringValue(value)
  return color && isSafeColor(color) ? color : undefined
}

function parseMobileNavigationConfig(value?: string | string[] | null): MobileNavigationConfig {
  const rawValue = Array.isArray(value) ? value[0] : value
  if (!rawValue) return {}
  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue))
    const config = recordValue(parsed)
    const capsule = recordValue(config?.capsule)
    const mode = config?.mode === 'immersive' || config?.mode === 'compat' ? config.mode : undefined
    return {
      mode,
      capsule: capsule
        ? {
            backgroundColor: colorValue(capsule.backgroundColor),
            foregroundColor: colorValue(capsule.foregroundColor),
            borderColor: colorValue(capsule.borderColor),
          }
        : undefined,
    }
  } catch {
    return {}
  }
}

function safeInsetParam(value: number) {
  return String(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
}

function appPathFromUrl(value?: string | null) {
  if (!value) return null
  try {
    const hash = new URL(value).hash
    if (!hash) return null
    return normalizeSpaceAppRoutePath(decodeURIComponent(hash.slice(1)))
  } catch {
    return null
  }
}

function webViewRuntimeUrl(
  inputUrl: string,
  config: MobileNavigationConfig,
  insets: { top: number; right: number; bottom: number; left: number },
) {
  if (!inputUrl || !config.mode) return inputUrl
  try {
    const url = new URL(inputUrl)
    url.searchParams.set('shadow_mobile_app', '1')
    if (config.mode) url.searchParams.set('shadow_mobile_navigation', config.mode)
    url.searchParams.set('shadow_safe_top', safeInsetParam(insets.top))
    url.searchParams.set('shadow_safe_right', safeInsetParam(insets.right))
    url.searchParams.set('shadow_safe_bottom', safeInsetParam(insets.bottom))
    url.searchParams.set('shadow_safe_left', safeInsetParam(insets.left))
    return url.toString()
  } catch {
    return inputUrl
  }
}

function CapsuleButton({
  icon: Icon,
  label,
  onPress,
  color,
  disabled,
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  color: string
  disabled?: boolean
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={spacing.tight}
      style={({ pressed }) => [
        styles.capsuleButton,
        pressed && !disabled && { backgroundColor: colors.inputBackground },
      ]}
      onPress={onPress}
    >
      <Icon size={iconSize.xl} color={color} strokeWidth={2.35} />
    </Pressable>
  )
}

function WebMenuItem({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.webMenuItem,
        { backgroundColor: pressed && !disabled ? colors.inputBackground : 'transparent' },
      ]}
    >
      <Icon
        size={iconSize.lg}
        color={disabled ? colors.textMuted : colors.text}
        strokeWidth={2.35}
      />
      <Text style={[styles.webMenuItemText, { color: disabled ? colors.textMuted : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  )
}

export default function WebViewPreviewScreen() {
  const { url, serverSlug, appKey, appPath, mobileNavigation } = useLocalSearchParams<{
    url: string
    serverSlug?: string
    appKey?: string
    appPath?: string
    mobileNavigation?: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const setActiveServer = useChatStore((s) => s.setActiveServer)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  const webViewRef = useRef<WebView>(null)
  const pendingOAuthBridgeRequestRef = useRef<{ requestId: string } | null>(null)

  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(url ?? '')
  const [reportedAppPath, setReportedAppPath] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [launch, setLaunch] = useState<LaunchContext | null>(null)

  const decodedUrl = url ? decodeURIComponent(url) : ''
  const initialAppPath =
    normalizeSpaceAppRoutePath(Array.isArray(appPath) ? appPath[0] : appPath) ??
    appPathFromUrl(decodedUrl)
  const currentAppPath = reportedAppPath ?? appPathFromUrl(currentUrl) ?? initialAppPath ?? '/'
  const shareTargetUrl =
    serverSlug && appKey
      ? buildSpaceAppShareUrl({
          origin: getCachedApiBaseUrl(),
          serverSlug,
          appKey,
          appPath: currentAppPath,
        })
      : currentUrl
  const mobileNavigationConfig = parseMobileNavigationConfig(mobileNavigation)
  const webViewUrl = webViewRuntimeUrl(decodedUrl, mobileNavigationConfig, insets)
  const immersiveNavigation = mobileNavigationConfig.mode === 'immersive'
  const capsuleBackgroundColor =
    mobileNavigationConfig.capsule?.backgroundColor ?? colors.frostedPanelStrong
  const capsuleForegroundColor = mobileNavigationConfig.capsule?.foregroundColor ?? colors.text
  const capsuleBorderColor = mobileNavigationConfig.capsule?.borderColor ?? colors.frostedBorder

  const navigateWebView = useCallback((targetUrl: string) => {
    setCurrentUrl(targetUrl)
    webViewRef.current?.injectJavaScript(
      `window.location.assign(${JSON.stringify(targetUrl)}); true;`,
    )
  }, [])

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

  const postLaunchUpdate = useCallback(
    (nextLaunch: LaunchContext | null = launch) => {
      if (!appKey || !nextLaunch?.launchToken) return
      const message = JSON.stringify({
        type: ShadowBridge.launchUpdatedEventType,
        appKey,
        result: bridgeLaunchPayload(nextLaunch),
      })
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
          message,
        )} })); true;`,
      )
    },
    [appKey, launch],
  )

  const refreshLaunch = useCallback(async () => {
    if (!serverSlug || !appKey) throw new Error('Missing app context')
    const nextLaunch = await fetchApi<LaunchContext>(
      `/api/servers/${encodeURIComponent(serverSlug)}/space-apps/${encodeURIComponent(appKey)}/launch`,
      { method: 'POST' },
    )
    setLaunch(nextLaunch)
    return nextLaunch
  }, [appKey, serverSlug])

  useEffect(() => {
    if (!serverSlug || !appKey) return
    void refreshLaunch().catch(() => undefined)
  }, [appKey, refreshLaunch, serverSlug])

  useEffect(() => {
    postLaunchUpdate()
  }, [postLaunchUpdate])

  useEffect(() => {
    if (!launch?.launchToken) return
    const refreshInMs = Math.max(30_000, Math.max(0, (launch.expiresIn ?? 600) * 1_000) - 60_000)
    const timeout = setTimeout(() => {
      void refreshLaunch().catch(() => undefined)
    }, refreshInMs)
    return () => clearTimeout(timeout)
  }, [launch?.expiresIn, launch?.launchToken, refreshLaunch])

  const handleOAuthRedirect = useCallback(
    (redirectUrl: string) => {
      const pendingOAuthBridgeRequest = pendingOAuthBridgeRequestRef.current
      if (pendingOAuthBridgeRequest) {
        pendingOAuthBridgeRequestRef.current = null
        postBridgeResponse(
          pendingOAuthBridgeRequest.requestId,
          { ok: true, result: { opened: true, redirectUrl } },
          ShadowBridge.authorizeOAuthResponseType,
        )
      }
      navigateWebView(redirectUrl)
    },
    [navigateWebView, postBridgeResponse],
  )

  const oauthAuthorization = useShadowOAuthAuthorization({ onRedirect: handleOAuthRedirect })

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

  const callBridgeOpenChannel = useCallback(
    (request: BridgeOpenChannelRequest) => {
      if (!serverSlug || !request.channelId) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing channel context' },
          ShadowBridge.openChannelResponseType,
        )
        return
      }
      router.push(
        serverChannelHref(serverSlug, request.channelId, {
          messageId: request.messageId,
        }) as never,
      )
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true } },
        ShadowBridge.openChannelResponseType,
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
      setActiveServer(serverSlug)
      setPendingAction(`open-home-workspace:${serverSlug}`)
      router.push('/(main)' as never)
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true } },
        ShadowBridge.openWorkspaceResourceResponseType,
      )
    },
    [postBridgeResponse, router, serverSlug, setActiveServer, setPendingAction],
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

  const callBridgeAuthorizeOAuth = useCallback(
    (request: BridgeAuthorizeOAuthRequest) => {
      if (!request.authorizeUrl) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing OAuth authorize URL' },
          ShadowBridge.authorizeOAuthResponseType,
        )
        return
      }
      const previous = pendingOAuthBridgeRequestRef.current
      if (previous) {
        postBridgeResponse(
          previous.requestId,
          { ok: false, error: 'OAuth authorization superseded' },
          ShadowBridge.authorizeOAuthResponseType,
        )
      }
      pendingOAuthBridgeRequestRef.current = { requestId: request.requestId }
      if (oauthAuthorization.intercept(request.authorizeUrl)) return
      pendingOAuthBridgeRequestRef.current = null
      postBridgeResponse(
        request.requestId,
        { ok: false, error: 'Unsupported OAuth authorize URL' },
        ShadowBridge.authorizeOAuthResponseType,
      )
    },
    [oauthAuthorization.intercept, postBridgeResponse],
  )

  const callBridgeShareSpaceApp = useCallback(
    async (request: BridgeShareSpaceAppRequest) => {
      if (!serverSlug || !appKey) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing app context' },
          ShadowBridge.shareSpaceAppResponseType,
        )
        return
      }
      const requestedPath = normalizeSpaceAppRoutePath(request.path, currentAppPath) ?? '/'
      const targetUrl = buildSpaceAppShareUrl({
        origin: getCachedApiBaseUrl(),
        serverSlug,
        appKey,
        appPath: requestedPath,
      })
      try {
        await Share.share({ message: targetUrl, url: targetUrl, title: request.title })
        postBridgeResponse(
          request.requestId,
          { ok: true, result: { opened: true, channel: 'native', url: targetUrl } },
          ShadowBridge.shareSpaceAppResponseType,
        )
      } catch {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Share failed' },
          ShadowBridge.shareSpaceAppResponseType,
        )
        showToast(t('chat.shareFailed'), 'error')
      }
    },
    [appKey, currentAppPath, postBridgeResponse, serverSlug, t],
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
      if (message.type === ShadowBridge.routeChangedType) {
        const nextPath = normalizeSpaceAppRoutePath(message.path)
        if (nextPath) setReportedAppPath(nextPath)
        return
      }
      if (message.type === ShadowBridge.capabilitiesRequestType) {
        if (typeof message.requestId !== 'string') return
        callBridgeCapabilities({ requestId: message.requestId })
        return
      }
      if (message.type === ShadowBridge.refreshLaunchRequestType) {
        if (typeof message.requestId !== 'string') return
        void refreshLaunch()
          .then((nextLaunch) => {
            postBridgeResponse(
              message.requestId as string,
              { ok: true, result: bridgeLaunchPayload(nextLaunch) },
              ShadowBridge.refreshLaunchResponseType,
            )
          })
          .catch((error) => {
            postBridgeResponse(
              message.requestId as string,
              {
                ok: false,
                error: error instanceof Error ? error.message : 'Launch refresh failed',
              },
              ShadowBridge.refreshLaunchResponseType,
            )
          })
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
      if (message.type === ShadowBridge.openChannelRequestType) {
        if (typeof message.requestId !== 'string' || typeof message.channelId !== 'string') return
        callBridgeOpenChannel({
          requestId: message.requestId,
          channelId: message.channelId,
          messageId: typeof message.messageId === 'string' ? message.messageId : undefined,
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
      if (message.type === ShadowBridge.authorizeOAuthRequestType) {
        if (typeof message.requestId !== 'string') return
        callBridgeAuthorizeOAuth({
          requestId: message.requestId,
          authorizeUrl: typeof message.authorizeUrl === 'string' ? message.authorizeUrl : '',
        })
        return
      }
      if (message.type === ShadowBridge.shareSpaceAppRequestType) {
        if (typeof message.requestId !== 'string') return
        void callBridgeShareSpaceApp({
          requestId: message.requestId,
          path: typeof message.path === 'string' ? message.path : undefined,
          title: typeof message.title === 'string' ? message.title : undefined,
          description: typeof message.description === 'string' ? message.description : undefined,
          label: typeof message.label === 'string' ? message.label : undefined,
          data:
            message.data && typeof message.data === 'object' && !Array.isArray(message.data)
              ? (message.data as Record<string, unknown>)
              : undefined,
        })
      }
    },
    [
      appKey,
      callBridgeCapabilities,
      callBridgeOpenCopilot,
      callBridgeOpenChannel,
      callBridgeOpenWorkspaceResource,
      callBridgeOpenBuddyCreator,
      callBridgeAuthorizeOAuth,
      callBridgeShareSpaceApp,
      postBridgeResponse,
      refreshLaunch,
    ],
  )

  const handleGoBack = useCallback(() => {
    webViewRef.current?.goBack()
  }, [])

  const handleGoForward = useCallback(() => {
    webViewRef.current?.goForward()
  }, [])

  const handleRefresh = useCallback(() => {
    setShowMenu(false)
    webViewRef.current?.reload()
  }, [])

  const handleClose = useCallback(() => {
    router.back()
  }, [router])

  const handleOpenInBrowser = useCallback(async () => {
    setShowMenu(false)
    if (currentUrl) {
      try {
        await Linking.openURL(currentUrl)
      } catch {
        showToast(t('common.error'), 'error')
      }
    }
  }, [currentUrl, t])

  const handleShare = useCallback(async () => {
    setShowMenu(false)
    if (!shareTargetUrl) return
    try {
      await Share.share({ message: shareTargetUrl, url: shareTargetUrl })
    } catch {
      showToast(t('chat.shareFailed'), 'error')
    }
  }, [shareTargetUrl, t])

  const handleForward = useCallback(async () => {
    setShowMenu(false)
    if (!shareTargetUrl) return
    try {
      await Share.share({ message: shareTargetUrl, url: shareTargetUrl })
    } catch {
      showToast(t('chat.shareFailed'), 'error')
    }
  }, [shareTargetUrl, t])

  const onNavigationStateChange = useCallback(
    (navState: { canGoBack: boolean; canGoForward: boolean; url: string; title: string }) => {
      setCanGoBack(navState.canGoBack)
      setCanGoForward(navState.canGoForward)
      setCurrentUrl(navState.url)
    },
    [],
  )

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
      {immersiveNavigation ? (
        <View
          pointerEvents="box-none"
          style={[styles.floatingChrome, { top: insets.top + spacing.sm }]}
        >
          <View
            style={[
              styles.capsule,
              {
                backgroundColor: capsuleBackgroundColor,
                borderColor: capsuleBorderColor,
                shadowColor: colors.shadowStrong,
              },
            ]}
          >
            <CapsuleButton
              icon={MoreHorizontal}
              label={t('common.more')}
              color={capsuleForegroundColor}
              onPress={() => setShowMenu((value) => !value)}
            />
            <View style={[styles.capsuleDivider, { backgroundColor: capsuleBorderColor }]} />
            <CapsuleButton
              icon={CircleStop}
              label={t('common.close')}
              color={capsuleForegroundColor}
              onPress={handleClose}
            />
          </View>
        </View>
      ) : (
        <MobileNavigationBar
          title={<View />}
          left={
            <View
              style={[styles.capsule, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <CapsuleButton
                icon={ArrowLeft}
                label={t('common.back')}
                disabled={!canGoBack}
                color={canGoBack ? colors.text : colors.textMuted}
                onPress={handleGoBack}
              />
              <CapsuleButton
                icon={ArrowRight}
                label={t('common.forward')}
                disabled={!canGoForward}
                color={canGoForward ? colors.text : colors.textMuted}
                onPress={handleGoForward}
              />
            </View>
          }
          right={
            <View
              style={[styles.capsule, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <CapsuleButton
                icon={MoreHorizontal}
                label={t('common.more')}
                color={colors.text}
                onPress={() => setShowMenu((value) => !value)}
              />
              <View style={[styles.capsuleDivider, { backgroundColor: colors.border }]} />
              <CapsuleButton
                icon={CircleStop}
                label={t('common.close')}
                color={colors.text}
                onPress={handleClose}
              />
            </View>
          }
        />
      )}
      {showMenu ? (
        <View style={styles.webMenuLayer} pointerEvents="box-none">
          <Pressable style={styles.webMenuDismiss} onPress={() => setShowMenu(false)} />
          <View
            style={[
              styles.webMenu,
              {
                top: immersiveNavigation
                  ? insets.top + spacing.sm + size.controlSm + spacing.xs
                  : insets.top + size.navBar + spacing.xs,
                backgroundColor: colors.frostedPanelStrong,
                borderColor: colors.frostedBorder,
                shadowColor: colors.shadowStrong,
              },
            ]}
          >
            {immersiveNavigation ? (
              <>
                <WebMenuItem
                  icon={ArrowLeft}
                  label={t('common.back')}
                  disabled={!canGoBack}
                  onPress={handleGoBack}
                />
                <WebMenuItem
                  icon={ArrowRight}
                  label={t('common.forward')}
                  disabled={!canGoForward}
                  onPress={handleGoForward}
                />
              </>
            ) : null}
            <WebMenuItem icon={RefreshCw} label={t('common.refresh')} onPress={handleRefresh} />
            <WebMenuItem icon={Share2} label={t('common.share')} onPress={handleShare} />
            <WebMenuItem icon={Send} label={t('feed.share')} onPress={handleForward} />
            <WebMenuItem
              icon={ExternalLink}
              label={t('common.openInBrowser')}
              onPress={handleOpenInBrowser}
            />
          </View>
        </View>
      ) : null}
      <View style={styles.webviewFrame}>
        <WebView
          ref={webViewRef}
          source={{ uri: webViewUrl }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false)
            postLaunchUpdate()
          }}
          onMessage={handleWebViewMessage}
          onNavigationStateChange={onNavigationStateChange}
          onOpenWindow={(event) => {
            const targetUrl = event.nativeEvent.targetUrl
            if (!targetUrl) return
            if (oauthAuthorization.intercept(targetUrl)) return
            Linking.openURL(targetUrl).catch(() => undefined)
          }}
          startInLoadingState
          allowsBackForwardNavigationGestures
          hideKeyboardAccessoryView
          renderLoading={() => (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
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
        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </View>
      <OAuthAuthorizationSheet
        state={oauthAuthorization}
        onApprove={oauthAuthorization.approve}
        onDeny={oauthAuthorization.deny}
        t={t}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  capsule: {
    minHeight: size.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: border.hairline,
    borderRadius: radius.full,
    overflow: 'hidden',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.xs },
    elevation: 28,
  },
  floatingChrome: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 35,
    elevation: 35,
  },
  capsuleButton: {
    width: size.controlSm,
    height: size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleDivider: {
    width: border.hairline,
    height: size.badgeLg,
  },
  webMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  webMenuDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  webMenu: {
    position: 'absolute',
    right: spacing.md,
    width: size.actionMinWidth + spacing.xl,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.xs,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.xs },
    elevation: 32,
  },
  webMenuItem: {
    minHeight: size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  webMenuItemText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  webviewFrame: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
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
