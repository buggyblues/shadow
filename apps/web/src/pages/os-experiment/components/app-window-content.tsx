import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBuddyInboxSummary,
} from '@shadowob/sdk/bridge'
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
import { fetchApi } from '../../../lib/api'
import { ChannelView } from '../../channel-view'
import { OsBuiltinAppIcon } from '../builtin-icons'
import type { LaunchContext, OsWindowState, ServerAppIntegration } from '../types'
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
  normalizeBridgeInbox,
  normalizeBuddyCreatorLanding,
  normalizeOsServerAppRoutePath,
  type OsBridgeBuddyCreatorLanding,
  type OsBridgeBuddyCreatorResult,
  osAppRouteState,
  pushOsAppRouteHistory,
  routeRequestId,
} from './bridge-utils'

export function OsAppWindowContent({
  app,
  appPath,
  focused,
  serverSlug,
  windowId,
  onRouteChange,
  onOpenInbox,
  onOpenBuddyCreator,
}: {
  app: ServerAppIntegration | null
  appPath?: string | null
  focused: boolean
  serverSlug: string
  windowId: string
  onRouteChange?: (id: string, path: string) => void
  onOpenInbox?: (input: { agentId?: string; channelId?: string }) => Promise<boolean>
  onOpenBuddyCreator?: (input: {
    landing?: OsBridgeBuddyCreatorLanding
  }) => Promise<OsBridgeBuddyCreatorResult>
}) {
  const { t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const initialAppPathRef = useRef(appPath)
  const lastRouteRef = useRef(normalizeOsServerAppRoutePath(appPath) ?? '/')
  const {
    data: launch,
    isLoading,
    refetch: refetchLaunch,
  } = useQuery({
    queryKey: ['os-server-app-launch', serverSlug, app?.appKey],
    queryFn: () =>
      fetchApi<LaunchContext>(`/api/servers/${serverSlug}/apps/${app!.appKey}/launch`, {
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

  useEffect(() => {
    lastRouteRef.current = normalizeOsServerAppRoutePath(appPath) ?? '/'
  }, [appPath])

  const postRouteNavigate = useCallback(
    (path: string) => {
      if (!app?.appKey) return
      const normalized = normalizeOsServerAppRoutePath(path) ?? '/'
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
                { ok: true, result: result.data },
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
        if (data.type === ShadowBridge.listBuddyInboxesRequestType) {
          void fetchApi<ShadowBuddyInboxSummary[]>(`/api/servers/${serverSlug}/inboxes`)
            .then((inboxes) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: true, result: { inboxes: inboxes.map(normalizeBridgeInbox) } },
                ShadowBridge.listBuddyInboxesResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                data.requestId as string,
                {
                  ok: false,
                  error: err instanceof Error ? err.message : 'Buddy inbox lookup failed',
                },
                ShadowBridge.listBuddyInboxesResponseType,
              )
            })
          return
        }
        if (data.type === ShadowBridge.ensureBuddyGrantRequestType) {
          const permissions = Array.isArray(data.permissions)
            ? data.permissions.filter(
                (permission): permission is string => typeof permission === 'string',
              )
            : []
          const buddyAgentId = typeof data.buddyAgentId === 'string' ? data.buddyAgentId : ''
          if (!buddyAgentId || permissions.length === 0) {
            postBridgeResponse(
              data.requestId,
              { ok: false, error: 'Missing Buddy grant request' },
              ShadowBridge.ensureBuddyGrantResponseType,
            )
            return
          }
          void fetchApi(`/api/servers/${serverSlug}/apps/${app.appKey}/grants`, {
            method: 'POST',
            body: JSON.stringify({
              buddyAgentId,
              permissions,
              approvalMode: 'none',
              mergePermissions: true,
            }),
          })
            .then((grant) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: true, result: { granted: true, grant } },
                ShadowBridge.ensureBuddyGrantResponseType,
              )
            })
            .catch((err) => {
              postBridgeResponse(
                data.requestId as string,
                { ok: false, error: err instanceof Error ? err.message : 'Buddy grant failed' },
                ShadowBridge.ensureBuddyGrantResponseType,
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
      }
      if (data.type !== ShadowBridge.routeChangedType) return
      const normalized = normalizeOsServerAppRoutePath(data.path)
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
    iframeOrigin,
    onOpenBuddyCreator,
    onOpenInbox,
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
          <p className="mt-2 text-sm font-semibold text-text-muted">{t('serverApps.noIframe')}</p>
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
    <iframe
      ref={iframeRef}
      key={iframeSrc}
      src={iframeSrc}
      title={app.name}
      className="block h-full min-h-0 w-full min-w-0 flex-1 border-0 bg-white"
      allow="clipboard-read; clipboard-write; fullscreen; microphone; camera"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
    />
  )
}
