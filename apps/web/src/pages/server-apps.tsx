import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBridgeEnsureBuddyGrantInput,
  type ShadowBridgeListBuddyInboxesInput,
  type ShadowBridgeOpenBuddyCreatorInput,
  type ShadowBridgeOpenCopilotInput,
  type ShadowBridgeOpenWorkspaceResourceInput,
  type ShadowBuddyInboxSummary,
} from '@shadowob/sdk/bridge'
import { GlassPanel, Spinner } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { AppWindow } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QuickCreateBuddyModal } from '../components/buddy-management/quick-create-buddy-modal'
import type { Agent } from '../components/buddy-management/types'
import { FilePreviewPanel } from '../components/chat/file-preview-panel'
import { resolveWorkspaceMediaUrl } from '../components/workspace/workspace-media'
import { fetchApi } from '../lib/api'
import { type RouteSearch, withCopilotChannelSearch } from '../lib/copilot-route'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'
import type { WorkspaceNode } from '../stores/workspace.store'

const SERVER_APP_LIST_STALE_MS = 5 * 60 * 1000
const SERVER_APP_LAUNCH_STALE_MS = 9 * 60 * 1000
const SERVER_APP_QUERY_GC_MS = 30 * 60 * 1000
const SERVER_APP_ROUTE_MESSAGE_TYPE = 'shadow.app.navigate'
const SERVER_APP_ROUTE_ACK_MESSAGE_TYPE = 'shadow.app.navigate.ack'
const SERVER_APP_ROUTE_ACK_TIMEOUT_MS = 450

interface ServerAppIntegration {
  id: string
  serverId: string
  appKey: string
  name: string
  description?: string | null
  iconUrl: string | null
  iframeEntry?: string | null
  allowedOrigins: string[]
}

interface LaunchContext {
  iframeEntry: string | null
  launchToken: string
  eventStreamPath: string
  expiresIn: number
}

interface BridgeCapabilitiesRequest {
  requestId: string
}

interface BridgeOpenCopilotRequest extends ShadowBridgeOpenCopilotInput {
  requestId: string
}

interface BridgeOpenWorkspaceResourceRequest extends ShadowBridgeOpenWorkspaceResourceInput {
  requestId: string
}

interface BridgeOpenBuddyCreatorRequest extends ShadowBridgeOpenBuddyCreatorInput {
  requestId: string
}

interface BridgeListBuddyInboxesRequest extends ShadowBridgeListBuddyInboxesInput {
  requestId: string
}

interface BridgeEnsureBuddyGrantRequest extends ShadowBridgeEnsureBuddyGrantInput {
  requestId: string
}

interface WorkspacePreviewAttachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function absoluteHostUrl(value?: string | null) {
  if (!value) return undefined
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return value
  }
}

function normalizeBridgeInbox(inbox: ShadowBuddyInboxSummary): ShadowBuddyInboxSummary {
  const user = inbox.agent.user
  if (!user) return inbox
  return {
    ...inbox,
    agent: {
      ...inbox.agent,
      user: {
        ...user,
        avatarUrl: absoluteHostUrl(user.avatarUrl),
      },
    },
  }
}

function bridgeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function bridgeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bridgeWorkspaceNodeId(resource: Record<string, unknown> | null) {
  return bridgeString(resource?.workspaceNodeId) ?? bridgeString(resource?.workspaceFileId) ?? null
}

async function buildWorkspacePreviewAttachment(
  serverSlug: string,
  resource: Record<string, unknown> | null,
): Promise<WorkspacePreviewAttachment | null> {
  const workspaceNodeId = bridgeWorkspaceNodeId(resource)
  if (!workspaceNodeId) return null
  const node = await fetchApi<WorkspaceNode>(
    `/api/servers/${serverSlug}/workspace/files/${encodeURIComponent(workspaceNodeId)}`,
  )
  if (node.kind !== 'file' || !node.contentRef) return null
  const url = await resolveWorkspaceMediaUrl(serverSlug, node.id, {
    disposition: 'inline',
    contentRef: node.contentRef,
  })
  return {
    id: `workspace:${node.id}:${node.contentRef}`,
    filename: node.name || bridgeString(resource?.title) || bridgeString(resource?.name) || 'file',
    url,
    contentType:
      node.mime ??
      bridgeString(resource?.mimeType) ??
      bridgeString(resource?.contentType) ??
      'application/octet-stream',
    size: node.sizeBytes ?? bridgeNumber(resource?.sizeBytes) ?? 0,
  }
}

function appPathFromSearch(search: RouteSearch | null | undefined) {
  const value = search?.appPath
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  return trimmed.slice(0, 240)
}

function withLaunchParams(
  entry: string,
  launch: LaunchContext | undefined,
  appPath?: string | null,
) {
  if (!launch?.launchToken) return entry
  const url = new URL(entry, window.location.origin)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      new URL(launch.eventStreamPath, window.location.origin).toString(),
    )
  }
  if (appPath) url.hash = appPath
  return url.toString()
}

interface ServerAppsPageRouteProps {
  active?: boolean
  appKeyOverride?: string
  preserveActiveChannel?: boolean
}

export function ServerAppsPageRoute({
  active = true,
  appKeyOverride,
  preserveActiveChannel = false,
}: ServerAppsPageRouteProps = {}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const routeSearch = useSearch({ strict: false }) as RouteSearch
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const iframeFrameKeyRef = useRef<string | null>(null)
  const iframeLastRouteRef = useRef<string | null>(null)
  const routeAckHandlersRef = useRef<Map<string, () => void>>(new Map())
  const [lastActiveApp, setLastActiveApp] = useState<{
    serverSlug: string
    appKey: string
  } | null>(null)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [buddyCreatorRequest, setBuddyCreatorRequest] =
    useState<BridgeOpenBuddyCreatorRequest | null>(null)
  const [workspacePreviewFile, setWorkspacePreviewFile] =
    useState<WorkspacePreviewAttachment | null>(null)
  const { serverSlug, appKey } = useParams({ strict: false }) as {
    serverSlug: string
    appKey?: string
  }
  const effectiveAppKey = appKeyOverride ?? appKey

  useLayoutEffect(() => {
    if (!active || preserveActiveChannel) return
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [active, preserveActiveChannel])

  useEffect(() => {
    if (active && serverSlug && effectiveAppKey) {
      setLastActiveApp({ serverSlug, appKey: effectiveAppKey })
    }
  }, [active, effectiveAppKey, serverSlug])

  const lastActiveAppKey =
    lastActiveApp?.serverSlug === serverSlug ? lastActiveApp.appKey : undefined
  const visibleAppKey = active ? effectiveAppKey : lastActiveAppKey

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['server-apps', serverSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${serverSlug}/apps`),
    enabled: !!serverSlug && (active || !!lastActiveAppKey),
    staleTime: SERVER_APP_LIST_STALE_MS,
    gcTime: SERVER_APP_QUERY_GC_MS,
  })

  const activeApp = useMemo(
    () => apps.find((app) => app.appKey === visibleAppKey) ?? null,
    [apps, visibleAppKey],
  )

  useEffect(() => {
    if (!active) return
    if (!serverSlug || effectiveAppKey || isLoading || !apps[0]?.appKey) return
    navigate({
      to: '/servers/$serverSlug/apps/$appKey',
      params: { serverSlug, appKey: apps[0].appKey },
      search: routeSearch,
      replace: true,
    })
  }, [active, effectiveAppKey, apps, isLoading, navigate, routeSearch, serverSlug])

  const { data: launch, isLoading: isLaunchLoading } = useQuery({
    queryKey: ['server-app-launch', serverSlug, activeApp?.appKey],
    queryFn: () =>
      fetchApi<LaunchContext>(`/api/servers/${serverSlug}/apps/${activeApp!.appKey}/launch`, {
        method: 'POST',
      }),
    enabled: !!serverSlug && !!activeApp?.appKey && !!activeApp.iframeEntry,
    staleTime: SERVER_APP_LAUNCH_STALE_MS,
    gcTime: SERVER_APP_QUERY_GC_MS,
    refetchOnReconnect: false,
  })

  const appPath = appPathFromSearch(routeSearch)
  const iframeFrameKey =
    activeApp?.iframeEntry && launch
      ? `${serverSlug}:${activeApp.appKey}:${launch.launchToken}`
      : null

  useEffect(() => {
    if (!activeApp?.iframeEntry || !launch || !iframeFrameKey) {
      iframeFrameKeyRef.current = null
      iframeLastRouteRef.current = null
      setIframeSrc(null)
      return
    }
    if (iframeFrameKeyRef.current === iframeFrameKey) return
    iframeFrameKeyRef.current = iframeFrameKey
    iframeLastRouteRef.current = appPath
    setIframeSrc(withLaunchParams(activeApp.iframeEntry, launch, appPath))
  }, [activeApp?.appKey, activeApp?.iframeEntry, appPath, iframeFrameKey, launch, serverSlug])

  const iframeOrigin = useMemo(() => {
    if (!iframeSrc) return '*'
    try {
      return new URL(iframeSrc).origin
    } catch {
      return '*'
    }
  }, [iframeSrc])

  useEffect(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!activeApp?.iframeEntry || !launch || !iframeSrc || !contentWindow) return
    if (iframeLastRouteRef.current === appPath) return
    iframeLastRouteRef.current = appPath
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}:${Math.random()}`
    let acknowledged = false
    const clearAck = () => {
      acknowledged = true
      routeAckHandlersRef.current.delete(requestId)
    }
    routeAckHandlersRef.current.set(requestId, clearAck)
    contentWindow.postMessage(
      {
        type: SERVER_APP_ROUTE_MESSAGE_TYPE,
        requestId,
        path: appPath ?? '/',
      },
      iframeOrigin,
    )
    const timeout = window.setTimeout(() => {
      routeAckHandlersRef.current.delete(requestId)
      if (acknowledged) return
      setIframeSrc(withLaunchParams(activeApp.iframeEntry!, launch, appPath))
    }, SERVER_APP_ROUTE_ACK_TIMEOUT_MS)
    return () => {
      window.clearTimeout(timeout)
      routeAckHandlersRef.current.delete(requestId)
    }
  }, [activeApp?.iframeEntry, appPath, iframeOrigin, iframeSrc, launch])

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
      if (!serverSlug || !activeApp?.appKey || !channelId) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing Copilot channel id' },
          ShadowBridge.openCopilotResponseType,
        )
        return
      }
      navigate({
        to: '/servers/$serverSlug/apps/$appKey',
        params: { serverSlug, appKey: activeApp.appKey },
        search: withCopilotChannelSearch(routeSearch, channelId),
        replace: true,
      })
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true } },
        ShadowBridge.openCopilotResponseType,
      )
    },
    [activeApp?.appKey, navigate, postBridgeResponse, routeSearch, serverSlug],
  )

  const callBridgeOpenWorkspaceResource = useCallback(
    async (request: BridgeOpenWorkspaceResourceRequest) => {
      if (!serverSlug) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing server context' },
          ShadowBridge.openWorkspaceResourceResponseType,
        )
        return
      }
      const resource = getRecord(request.resource)
      const workspaceNodeId = bridgeWorkspaceNodeId(resource)
      const rawUri = [
        typeof resource?.uri === 'string' ? resource.uri.trim() : '',
        typeof resource?.path === 'string' ? resource.path.trim() : '',
      ].find((value) => value.startsWith('workspace://'))
      const workspacePath =
        typeof resource?.path === 'string' &&
        resource.path.trim() &&
        !resource.path.trim().startsWith('workspace://')
          ? resource.path.trim()
          : null
      const workspaceUri = rawUri || null

      try {
        const preview = await buildWorkspacePreviewAttachment(serverSlug, resource)
        if (preview) {
          setWorkspacePreviewFile(preview)
          postBridgeResponse(
            request.requestId,
            { ok: true, result: { opened: true, mode: 'preview' } },
            ShadowBridge.openWorkspaceResourceResponseType,
          )
          return
        }
      } catch {
        // Fall through to workspace navigation so the user still lands on the resource context.
      }

      navigate({
        to: '/servers/$serverSlug/workspace',
        params: { serverSlug },
        search: {
          ...(workspaceNodeId ? { workspaceNodeId } : {}),
          ...(workspacePath ? { workspacePath } : {}),
          ...(workspaceUri ? { workspaceUri } : {}),
        },
      })
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true, mode: 'workspace' } },
        ShadowBridge.openWorkspaceResourceResponseType,
      )
    },
    [navigate, postBridgeResponse, serverSlug],
  )

  const callBridgeOpenBuddyCreator = useCallback((request: BridgeOpenBuddyCreatorRequest) => {
    setBuddyCreatorRequest(request)
  }, [])

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
        const inboxes = await fetchApi<ShadowBuddyInboxSummary[]>(
          `/api/servers/${serverSlug}/inboxes`,
        )
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
      if (!serverSlug || !activeApp?.appKey) {
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
        const grant = await fetchApi(`/api/servers/${serverSlug}/apps/${activeApp.appKey}/grants`, {
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
    [activeApp?.appKey, postBridgeResponse, serverSlug],
  )

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!activeApp || event.source !== iframeRef.current?.contentWindow) return
      if (activeApp.allowedOrigins.length > 0 && !activeApp.allowedOrigins.includes(event.origin)) {
        return
      }
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : null
      if (!data) return
      if (data.appKey && data.appKey !== activeApp.appKey) return
      if (data.type === SERVER_APP_ROUTE_ACK_MESSAGE_TYPE) {
        if (typeof data.requestId !== 'string') return
        routeAckHandlersRef.current.get(data.requestId)?.()
        return
      }
      if (data.type === ShadowBridge.capabilitiesRequestType) {
        if (typeof data.requestId !== 'string') return
        callBridgeCapabilities({ requestId: data.requestId })
        return
      }
      if (data.type === ShadowBridge.openCopilotRequestType) {
        if (typeof data.requestId !== 'string') return
        callBridgeOpenCopilot({
          requestId: data.requestId,
          delivery: getRecord(data.delivery) as BridgeOpenCopilotRequest['delivery'],
        })
        return
      }
      if (data.type === ShadowBridge.openWorkspaceResourceRequestType) {
        if (typeof data.requestId !== 'string') return
        void callBridgeOpenWorkspaceResource({
          requestId: data.requestId,
          resource: getRecord(data.resource) as BridgeOpenWorkspaceResourceRequest['resource'],
        })
        return
      }
      if (data.type === ShadowBridge.openBuddyCreatorRequestType) {
        if (typeof data.requestId !== 'string') return
        callBridgeOpenBuddyCreator({
          requestId: data.requestId,
          landing: getRecord(data.landing) as BridgeOpenBuddyCreatorRequest['landing'],
        })
        return
      }
      if (data.type === ShadowBridge.listBuddyInboxesRequestType) {
        if (typeof data.requestId !== 'string') return
        void callBridgeListBuddyInboxes({
          requestId: data.requestId,
          refresh: data.refresh === true,
        })
        return
      }
      if (data.type === ShadowBridge.ensureBuddyGrantRequestType) {
        if (typeof data.requestId !== 'string') return
        const permissions = Array.isArray(data.permissions)
          ? data.permissions.filter(
              (permission): permission is string => typeof permission === 'string',
            )
          : []
        void callBridgeEnsureBuddyGrant({
          requestId: data.requestId,
          buddyAgentId: typeof data.buddyAgentId === 'string' ? data.buddyAgentId : '',
          permissions,
          reason: typeof data.reason === 'string' ? data.reason : undefined,
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [
    activeApp,
    callBridgeCapabilities,
    callBridgeOpenCopilot,
    callBridgeOpenWorkspaceResource,
    callBridgeOpenBuddyCreator,
    callBridgeListBuddyInboxes,
    callBridgeEnsureBuddyGrant,
  ])

  const closeBuddyCreator = () => {
    if (buddyCreatorRequest) {
      postBridgeResponse(
        buddyCreatorRequest.requestId,
        { ok: false, error: t('common.cancel') },
        ShadowBridge.openBuddyCreatorResponseType,
      )
    }
    setBuddyCreatorRequest(null)
  }

  const handleBuddyCreated = (agent: Agent) => {
    if (buddyCreatorRequest) {
      postBridgeResponse(
        buddyCreatorRequest.requestId,
        { ok: true, result: { opened: true, agent } },
        ShadowBridge.openBuddyCreatorResponseType,
      )
    }
    setBuddyCreatorRequest(null)
  }

  if (active && (isLoading || (!appKey && apps.length > 0))) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center text-text-muted">
        <Spinner size="sm" />
      </GlassPanel>
    )
  }

  if (!activeApp) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-bg-tertiary/60">
            <AppWindow size={20} />
          </div>
          <span>
            {apps.length === 0 ? t('serverApps.noInstalled') : t('serverApps.selectFromSidebar')}
          </span>
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-1 min-w-0 overflow-hidden">
      {isLaunchLoading && activeApp.iframeEntry ? (
        <div className="grid flex-1 place-items-center text-text-muted">
          <Spinner size="sm" />
        </div>
      ) : iframeSrc ? (
        <iframe
          ref={iframeRef}
          title={activeApp.name}
          src={iframeSrc}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
          {t('serverApps.noIframe')}
        </div>
      )}
      <QuickCreateBuddyModal
        open={!!buddyCreatorRequest}
        onClose={closeBuddyCreator}
        onSuccess={handleBuddyCreated}
        landing={{
          title: buddyCreatorRequest?.landing?.title,
          description: buddyCreatorRequest?.landing?.description,
        }}
      />
      {workspacePreviewFile ? (
        <FilePreviewPanel
          attachment={workspacePreviewFile}
          presentation="overlay"
          onClose={() => setWorkspacePreviewFile(null)}
        />
      ) : null}
    </GlassPanel>
  )
}
