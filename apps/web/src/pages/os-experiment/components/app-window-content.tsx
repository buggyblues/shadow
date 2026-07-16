import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBridgeAuthorizeOAuthInput,
  type ShadowBridgeOpenWorkspaceResourceInput,
  type ShadowBridgeShareSpaceAppInput,
} from '@shadowob/sdk/bridge'
import { buildSpaceAppShareUrl } from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { AppWindow, FileText, Hash, Inbox, Loader2 } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../components/chat/message-bubble/types'
import {
  BridgeOAuthAuthorizationOverlay,
  type BridgeOAuthAuthorizationState,
} from '../../../components/space-apps/bridge-oauth-authorization'
import { fetchApi } from '../../../lib/api'
import {
  approveBridgeOAuth as approveBridgeOAuthRequest,
  isShadowOAuthAuthorizeUrl,
  loadBridgeOAuthAuthorizeInfo,
  silentAuthorizeBridgeOAuth,
} from '../../../lib/space-app-oauth-bridge'
import { ChannelView } from '../../channel-view'
import { OsBuiltinAppIcon } from '../builtin-icons'
import type { LaunchContext, OsWindowState, SpaceAppInstallation } from '../types'
import {
  clampWindowPosition,
  clampWindowResize,
  DESKTOP_EDGE_PADDING,
  DOCK_RESERVED_HEIGHT,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  OS_GC_MS,
  OS_SNAP_DWELL_MS,
  OS_TOP_BAR_HEIGHT,
  snapWindowToPointer,
  withLaunchParams,
} from '../utils'
import {
  getRecord,
  normalizeBuddyCreatorLanding,
  normalizeOsSpaceAppRoutePath,
  type OsBridgeBuddyCreatorLanding,
  type OsBridgeBuddyCreatorResult,
  osAppRouteState,
  pushOsAppRouteHistory,
  routeRequestId,
} from './bridge-utils'

interface OsBridgeAuthorizeOAuthRequest extends ShadowBridgeAuthorizeOAuthInput {
  requestId: string
}

function bridgeLaunchPayload(launch: LaunchContext) {
  return {
    iframeEntry: launch.iframeEntry,
    launchToken: launch.launchToken,
    expiresIn: launch.expiresIn,
  }
}

interface OsBridgeOpenWorkspaceResourceRequest extends ShadowBridgeOpenWorkspaceResourceInput {
  requestId: string
}

interface OsBridgeShareSpaceAppRequest extends ShadowBridgeShareSpaceAppInput {
  requestId: string
}

export function OsAppWindowContent({
  app,
  appPath,
  focused,
  serverSlug,
  windowId,
  onRouteChange,
  onOpenChannel,
  onOpenInbox,
  onOpenBuddyCreator,
  onOpenWorkspaceResource,
}: {
  app: SpaceAppInstallation | null
  appPath?: string | null
  focused: boolean
  serverSlug: string
  windowId: string
  onRouteChange?: (id: string, path: string) => void
  onOpenChannel?: (input: { channelId: string; messageId?: string }) => Promise<boolean>
  onOpenInbox?: (input: { agentId?: string; channelId?: string }) => Promise<boolean>
  onOpenBuddyCreator?: (input: {
    landing?: OsBridgeBuddyCreatorLanding
  }) => Promise<OsBridgeBuddyCreatorResult>
  onOpenWorkspaceResource?: (input: {
    workspaceFileId?: string
    workspaceNodeId?: string
  }) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const initialAppPathRef = useRef(appPath)
  const lastRouteRef = useRef(normalizeOsSpaceAppRoutePath(appPath) ?? '/')
  const oauthAuthorizationRequestIdRef = useRef<string | null>(null)
  const [oauthAuthorization, setOauthAuthorization] =
    useState<BridgeOAuthAuthorizationState<OsBridgeAuthorizeOAuthRequest> | null>(null)
  const {
    data: launch,
    isLoading,
    refetch: refetchLaunch,
  } = useQuery({
    queryKey: ['os-space-app-launch', serverSlug, app?.appKey],
    queryFn: () =>
      fetchApi<LaunchContext>(`/api/servers/${serverSlug}/space-apps/${app!.appKey}/launch`, {
        method: 'POST',
      }),
    enabled: Boolean(serverSlug && app?.appKey && app?.iframeEntry),
    staleTime: 9 * 60 * 1000,
    gcTime: OS_GC_MS,
  })

  const entry = app ? (launch?.iframeEntry ?? app.iframeEntry) : null
  const iframeSrc = entry ? withLaunchParams(entry, launch, initialAppPathRef.current) : null
  const iframeOrigin = useMemo(() => {
    if (!iframeSrc) return '*'
    try {
      return new URL(iframeSrc).origin
    } catch {
      return '*'
    }
  }, [iframeSrc])

  const postLaunchUpdate = useCallback(() => {
    if (!app?.appKey || !launch?.launchToken) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: ShadowBridge.launchUpdatedEventType,
        appKey: app.appKey,
        result: bridgeLaunchPayload(launch),
      },
      iframeOrigin,
    )
  }, [app?.appKey, iframeOrigin, launch])

  useEffect(() => {
    postLaunchUpdate()
  }, [postLaunchUpdate])

  useEffect(() => {
    if (!focused || !launch?.launchToken) return
    const refreshInMs = Math.max(30_000, Math.max(0, (launch.expiresIn ?? 600) * 1_000) - 60_000)
    const timeout = window.setTimeout(() => {
      void refetchLaunch()
    }, refreshInMs)
    return () => window.clearTimeout(timeout)
  }, [focused, launch?.expiresIn, launch?.launchToken, refetchLaunch])

  useEffect(() => {
    lastRouteRef.current = normalizeOsSpaceAppRoutePath(appPath) ?? '/'
  }, [appPath])

  const postRouteNavigate = useCallback(
    (path: string) => {
      if (!app?.appKey) return
      const normalized = normalizeOsSpaceAppRoutePath(path) ?? '/'
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: ShadowBridge.routeNavigateType,
          requestId: routeRequestId(),
          appKey: app.appKey,
          path: normalized,
        },
        iframeOrigin,
      )
      lastRouteRef.current = normalized
      onRouteChange?.(windowId, normalized)
    },
    [app?.appKey, iframeOrigin, onRouteChange, windowId],
  )

  const postBridgeResponse = useCallback(
    (
      requestId: string,
      payload: { ok: true; result: unknown } | { ok: false; error: string },
      responseType: string,
    ) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: responseType,
          requestId,
          ...payload,
        },
        iframeOrigin,
      )
    },
    [iframeOrigin],
  )

  const completeBridgeOAuth = useCallback(
    (request: OsBridgeAuthorizeOAuthRequest, redirectUrl: string) => {
      if (oauthAuthorizationRequestIdRef.current === request.requestId) {
        oauthAuthorizationRequestIdRef.current = null
      }
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true, status: 'opened', redirectUrl } },
        ShadowBridge.authorizeOAuthResponseType,
      )
      setOauthAuthorization(null)
      if (iframeRef.current) iframeRef.current.src = redirectUrl
    },
    [postBridgeResponse],
  )

  const denyBridgeOAuth = useCallback(() => {
    if (!oauthAuthorization) return
    if (oauthAuthorizationRequestIdRef.current === oauthAuthorization.request.requestId) {
      oauthAuthorizationRequestIdRef.current = null
    }
    postBridgeResponse(
      oauthAuthorization.request.requestId,
      { ok: true, result: { opened: false, status: 'denied', error: 'access_denied' } },
      ShadowBridge.authorizeOAuthResponseType,
    )
    setOauthAuthorization(null)
  }, [oauthAuthorization, postBridgeResponse])

  const approveBridgeOAuth = useCallback(async () => {
    if (!oauthAuthorization?.appInfo) return
    setOauthAuthorization((current) =>
      current ? { ...current, approving: true, error: null } : current,
    )
    try {
      const result = await approveBridgeOAuthRequest({
        authorizeUrl: oauthAuthorization.request.authorizeUrl,
        scope: oauthAuthorization.appInfo.scope,
      })
      completeBridgeOAuth(oauthAuthorization.request, result.redirectUrl)
    } catch (err) {
      setOauthAuthorization((current) =>
        current
          ? {
              ...current,
              approving: false,
              error: err instanceof Error ? err.message : 'OAuth authorization failed',
            }
          : current,
      )
    }
  }, [completeBridgeOAuth, oauthAuthorization])

  const callBridgeAuthorizeOAuth = useCallback(
    async (request: OsBridgeAuthorizeOAuthRequest) => {
      if (!request.authorizeUrl || !isShadowOAuthAuthorizeUrl(request.authorizeUrl)) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Unsupported OAuth authorize URL' },
          ShadowBridge.authorizeOAuthResponseType,
        )
        return
      }
      oauthAuthorizationRequestIdRef.current = request.requestId
      setOauthAuthorization((current) => {
        if (current) {
          postBridgeResponse(
            current.request.requestId,
            { ok: true, result: { opened: false, status: 'denied', error: 'superseded' } },
            ShadowBridge.authorizeOAuthResponseType,
          )
        }
        return { request, appInfo: null, loading: true, approving: false, error: null }
      })
      try {
        const appInfo = await loadBridgeOAuthAuthorizeInfo(request)
        try {
          const result = await silentAuthorizeBridgeOAuth({
            authorizeUrl: request.authorizeUrl,
            scope: appInfo.scope,
          })
          if (oauthAuthorizationRequestIdRef.current === request.requestId) {
            completeBridgeOAuth(request, result.redirectUrl)
          }
          return
        } catch {
          // Existing consent is absent or insufficient; the SDK authorization panel handles one click.
        }
        if (oauthAuthorizationRequestIdRef.current !== request.requestId) return
        setOauthAuthorization((current) =>
          current?.request.requestId === request.requestId
            ? { request, appInfo, loading: false, approving: false, error: null }
            : current,
        )
      } catch (err) {
        if (oauthAuthorizationRequestIdRef.current !== request.requestId) return
        setOauthAuthorization((current) =>
          current?.request.requestId === request.requestId
            ? {
                ...current,
                appInfo: null,
                loading: false,
                approving: false,
                error: err instanceof Error ? err.message : 'OAuth authorization failed',
              }
            : current,
        )
      }
    },
    [completeBridgeOAuth, postBridgeResponse],
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!app?.appKey || event.source !== iframeRef.current?.contentWindow) return
      if (iframeOrigin !== '*' && event.origin !== iframeOrigin) return
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : null
      if (!data) return
      if (data.appKey && data.appKey !== app.appKey) return
      if (typeof data.requestId === 'string') {
        if (data.type === ShadowBridge.capabilitiesRequestType) {
          postBridgeResponse(
            data.requestId,
            { ok: true, result: { capabilities: [...SHADOW_BRIDGE_CAPABILITIES] } },
            ShadowBridge.capabilitiesResponseType,
          )
          return
        }
        if (data.type === ShadowBridge.refreshLaunchRequestType) {
          void refetchLaunch()
            .then((result) => {
              if (result.error) throw result.error
              if (!result.data?.launchToken) throw new Error('Launch refresh failed')
              postBridgeResponse(
                data.requestId as string,
                { ok: true, result: bridgeLaunchPayload(result.data) },
                ShadowBridge.refreshLaunchResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                data.requestId as string,
                {
                  ok: false,
                  error: err instanceof Error ? err.message : 'Launch refresh failed',
                },
                ShadowBridge.refreshLaunchResponseType,
              )
            })
          return
        }
        if (data.type === ShadowBridge.openCopilotRequestType) {
          const delivery = getRecord(data.delivery)
          void onOpenInbox?.({
            agentId: typeof delivery?.agentId === 'string' ? delivery.agentId : undefined,
            channelId: typeof delivery?.channelId === 'string' ? delivery.channelId : undefined,
          })
            .then((opened) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: true, result: { opened: Boolean(opened) } },
                ShadowBridge.openCopilotResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: false, error: err instanceof Error ? err.message : 'Open inbox failed' },
                ShadowBridge.openCopilotResponseType,
              )
            })
          return
        }
        if (data.type === ShadowBridge.openChannelRequestType) {
          const channelId = typeof data.channelId === 'string' ? data.channelId : ''
          if (!channelId || !onOpenChannel) {
            postBridgeResponse(
              data.requestId,
              { ok: true, result: { opened: false } },
              ShadowBridge.openChannelResponseType,
            )
            return
          }
          void onOpenChannel({
            channelId,
            messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
          })
            .then((opened) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: true, result: { opened } },
                ShadowBridge.openChannelResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: false, error: err instanceof Error ? err.message : 'Open channel failed' },
                ShadowBridge.openChannelResponseType,
              )
            })
          return
        }
        if (data.type === ShadowBridge.openBuddyCreatorRequestType) {
          if (!onOpenBuddyCreator) {
            postBridgeResponse(
              data.requestId,
              { ok: false, error: 'Buddy creator is unavailable' },
              ShadowBridge.openBuddyCreatorResponseType,
            )
            return
          }
          void onOpenBuddyCreator({ landing: normalizeBuddyCreatorLanding(data.landing) })
            .then((result) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: true, result },
                ShadowBridge.openBuddyCreatorResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: false, error: err instanceof Error ? err.message : t('common.cancel') },
                ShadowBridge.openBuddyCreatorResponseType,
              )
            })
          return
        }
        if (data.type === ShadowBridge.authorizeOAuthRequestType) {
          void callBridgeAuthorizeOAuth({
            requestId: data.requestId,
            authorizeUrl: typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '',
          })
          return
        }
        if (data.type === ShadowBridge.openWorkspaceResourceRequestType) {
          const request = data as unknown as OsBridgeOpenWorkspaceResourceRequest
          const resource = getRecord(request.resource)
          if (!resource || !onOpenWorkspaceResource) {
            postBridgeResponse(
              request.requestId,
              { ok: true, result: { opened: false } },
              ShadowBridge.openWorkspaceResourceResponseType,
            )
            return
          }
          void onOpenWorkspaceResource({
            workspaceFileId:
              typeof resource.workspaceFileId === 'string' ? resource.workspaceFileId : undefined,
            workspaceNodeId:
              typeof resource.workspaceNodeId === 'string' ? resource.workspaceNodeId : undefined,
          })
            .then((opened) => {
              postBridgeResponse(
                request.requestId,
                { ok: true, result: { opened: Boolean(opened) } },
                ShadowBridge.openWorkspaceResourceResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                request.requestId,
                {
                  ok: false,
                  error: err instanceof Error ? err.message : 'Open workspace resource failed',
                },
                ShadowBridge.openWorkspaceResourceResponseType,
              )
            })
          return
        }
        if (data.type === ShadowBridge.shareSpaceAppRequestType) {
          const request = data as unknown as OsBridgeShareSpaceAppRequest
          const path = normalizeOsSpaceAppRoutePath(request.path) ?? lastRouteRef.current
          const url = buildSpaceAppShareUrl({
            origin: window.location.origin,
            serverSlug,
            appKey: app.appKey,
            appPath: path,
          })
          const writePromise = navigator.clipboard?.writeText(url)
          if (!writePromise) {
            postBridgeResponse(
              request.requestId,
              { ok: true, result: { opened: false, url } },
              ShadowBridge.shareSpaceAppResponseType,
            )
            return
          }
          void writePromise
            .then(() => {
              postBridgeResponse(
                request.requestId,
                { ok: true, result: { opened: true, channel: 'clipboard', url } },
                ShadowBridge.shareSpaceAppResponseType,
              )
            })
            .catch(() => {
              postBridgeResponse(
                request.requestId,
                { ok: true, result: { opened: false, url } },
                ShadowBridge.shareSpaceAppResponseType,
              )
            })
          return
        }
      }
      if (data.type !== ShadowBridge.routeChangedType) return
      const normalized = normalizeOsSpaceAppRoutePath(data.path)
      if (!normalized || normalized === lastRouteRef.current) return
      lastRouteRef.current = normalized
      onRouteChange?.(windowId, normalized)
      if (focused) pushOsAppRouteHistory(windowId, app.appKey, normalized)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [
    app?.appKey,
    focused,
    callBridgeAuthorizeOAuth,
    iframeOrigin,
    onOpenBuddyCreator,
    onOpenChannel,
    onOpenInbox,
    onOpenWorkspaceResource,
    onRouteChange,
    postBridgeResponse,
    refetchLaunch,
    serverSlug,
    windowId,
  ])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!focused || !app?.appKey) return
      const routeState = osAppRouteState(event.state)
      if (routeState && (routeState.windowId !== windowId || routeState.appKey !== app.appKey)) {
        return
      }
      const nextPath = routeState?.path ?? '/'
      if (nextPath === lastRouteRef.current) return
      postRouteNavigate(nextPath)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [app?.appKey, focused, postRouteNavigate, windowId])

  if (!app) {
    return (
      <div className="grid h-full min-h-0 w-full min-w-0 place-items-center px-6 text-center text-sm font-bold text-text-muted">
        {t('os.windowUnavailable')}
      </div>
    )
  }

  if (!app.iframeEntry) {
    return (
      <div className="grid h-full min-h-0 w-full min-w-0 place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-bg-secondary/70 text-text-muted">
            <AppWindow size={21} />
          </div>
          <p className="mt-4 text-sm font-black text-text-primary">{app.name}</p>
          <p className="mt-2 text-sm font-semibold text-text-muted">{t('spaceApps.noIframe')}</p>
        </div>
      </div>
    )
  }

  if (isLoading || !iframeSrc) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center text-text-muted">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1">
      <iframe
        ref={iframeRef}
        key={iframeSrc}
        src={iframeSrc}
        title={app.name}
        className="block h-full min-h-0 w-full min-w-0 flex-1 border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen; microphone; camera"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
        onLoad={postLaunchUpdate}
      />
      {oauthAuthorization ? (
        <BridgeOAuthAuthorizationOverlay
          state={oauthAuthorization}
          t={t}
          onApprove={approveBridgeOAuth}
          onDeny={denyBridgeOAuth}
        />
      ) : null}
    </div>
  )
}
