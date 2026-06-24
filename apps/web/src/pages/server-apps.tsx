import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBridgeAuthorizeOAuthInput,
  type ShadowBridgeEnsureBuddyGrantInput,
  type ShadowBridgeListBuddyInboxesInput,
  type ShadowBridgeOpenBuddyCreatorInput,
  type ShadowBridgeOpenCopilotInput,
  type ShadowBridgeOpenWorkspaceResourceInput,
  type ShadowBridgeRefreshLaunchInput,
  type ShadowBridgeShareAppInput,
  type ShadowBuddyInboxSummary,
} from '@shadowob/sdk/bridge'
import {
  buildServerAppCommunityPath,
  buildServerAppShareUrl,
  normalizeServerAppRoutePath,
  type ServerAppMessageCard,
  serverAppPathFromSearch,
  withServerAppRoutePathSearch,
} from '@shadowob/shared'
import { Button, GlassPanel, Modal, ModalBody, ModalContent, Spinner } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  AppWindow,
  Check,
  Copy,
  ExternalLink,
  Hash,
  Link2,
  MessageSquare,
  Search,
  Send,
  Share2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QuickCreateBuddyModal } from '../components/buddy-management/quick-create-buddy-modal'
import type { Agent } from '../components/buddy-management/types'
import { FilePreviewPanel } from '../components/chat/file-preview-panel'
import { resolveWorkspaceMediaUrl } from '../components/workspace/workspace-media'
import { fetchApi } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import {
  getCopilotChannelIdFromSearch,
  type RouteSearch,
  withCopilotChannelSearch,
} from '../lib/copilot-route'
import { leaveChannel } from '../lib/socket'
import { showToast } from '../lib/toast'
import { useChatStore } from '../stores/chat.store'
import type { WorkspaceNode } from '../stores/workspace.store'

const SERVER_APP_LIST_STALE_MS = 5 * 60 * 1000
const SERVER_APP_LAUNCH_STALE_MS = 9 * 60 * 1000
const SERVER_APP_QUERY_GC_MS = 30 * 60 * 1000
const SERVER_APP_ROUTE_MESSAGE_TYPE = ShadowBridge.routeNavigateType
const SERVER_APP_ROUTE_ACK_MESSAGE_TYPE = ShadowBridge.routeNavigateAckType
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

interface BridgeRefreshLaunchRequest extends ShadowBridgeRefreshLaunchInput {
  requestId: string
}

interface BridgeAuthorizeOAuthRequest extends ShadowBridgeAuthorizeOAuthInput {
  requestId: string
}

interface BridgeShareAppRequest extends ShadowBridgeShareAppInput {
  requestId: string
}

interface BridgeOAuthAuthorizeInfo {
  appId: string
  appName: string
  appLogoUrl: string | null
  homepageUrl: string | null
  scope: string
  redirectUri: string
  state?: string
}

interface BridgeOAuthAuthorizationState {
  request: BridgeAuthorizeOAuthRequest
  appInfo: BridgeOAuthAuthorizeInfo | null
  loading: boolean
  approving: boolean
  error: string | null
}

interface WorkspacePreviewAttachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
}

interface ChannelMeta {
  id: string
  name: string
  type?: string | null
  isArchived?: boolean | null
}

interface ServerAppShareSheetState {
  requestId?: string
  path: string
  title?: string | null
  description?: string | null
  label?: string | null
  data?: Record<string, unknown>
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

function isShadowOAuthAuthorizeUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.origin === window.location.origin &&
      (url.pathname === '/app/oauth/authorize' || url.pathname === '/oauth/authorize')
    )
  } catch {
    return false
  }
}

function shadowOAuthAuthorizeApiPath(authorizeUrl: string) {
  const url = new URL(authorizeUrl)
  const params = new URLSearchParams({
    response_type: url.searchParams.get('response_type') ?? 'code',
    client_id: url.searchParams.get('client_id') ?? '',
    redirect_uri: url.searchParams.get('redirect_uri') ?? '',
    scope: url.searchParams.get('scope') ?? 'user:read',
  })
  const state = url.searchParams.get('state')
  if (state) params.set('state', state)
  return `/api/oauth/authorize?${params.toString()}`
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

function withLaunchParams(
  entry: string,
  launch: LaunchContext | undefined,
  appPath?: string | null,
) {
  if (!launch?.launchToken) return entry
  const url = new URL(entry, window.location.origin)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set('shadow_event_stream', launchEventStreamUrl(launch) ?? '')
  }
  const normalizedAppPath = normalizeServerAppRoutePath(appPath)
  if (normalizedAppPath && normalizedAppPath !== '/') url.hash = normalizedAppPath
  return url.toString()
}

function launchEventStreamUrl(launch: LaunchContext | undefined) {
  if (!launch?.eventStreamPath) return null
  return new URL(launch.eventStreamPath, window.location.origin).toString()
}

function bridgeLaunchPayload(launch: LaunchContext) {
  return {
    iframeEntry: launch.iframeEntry,
    launchToken: launch.launchToken,
    eventStreamPath: launch.eventStreamPath,
    expiresIn: launch.expiresIn,
  }
}

interface ServerAppsPageRouteProps {
  active?: boolean
  appKeyOverride?: string
  preserveActiveChannel?: boolean
  sharePage?: boolean
}

export function ServerAppsPageRoute({
  active = true,
  appKeyOverride,
  preserveActiveChannel = false,
  sharePage = false,
}: ServerAppsPageRouteProps = {}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const routeSearch = useSearch({ strict: false }) as RouteSearch
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const iframeFrameKeyRef = useRef<string | null>(null)
  const iframeLastRouteRef = useRef<string | null>(null)
  const routeAckHandlersRef = useRef<Map<string, () => void>>(new Map())
  const oauthAuthorizationRequestIdRef = useRef<string | null>(null)
  const [lastActiveApp, setLastActiveApp] = useState<{
    serverSlug: string
    appKey: string
  } | null>(null)
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [buddyCreatorRequest, setBuddyCreatorRequest] =
    useState<BridgeOpenBuddyCreatorRequest | null>(null)
  const [workspacePreviewFile, setWorkspacePreviewFile] =
    useState<WorkspacePreviewAttachment | null>(null)
  const [oauthAuthorization, setOauthAuthorization] =
    useState<BridgeOAuthAuthorizationState | null>(null)
  const [shareSheet, setShareSheet] = useState<ServerAppShareSheetState | null>(null)
  const [shareChannelId, setShareChannelId] = useState('')
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

  const {
    data: launch,
    isLoading: isLaunchLoading,
    refetch: refetchLaunch,
  } = useQuery({
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

  useEffect(() => {
    if (!active || !activeApp?.iframeEntry || !launch?.launchToken) return
    const expiresInMs = Math.max(0, launch.expiresIn * 1000)
    const refreshInMs = Math.max(30_000, expiresInMs - 60_000)
    const timeout = window.setTimeout(() => {
      void refetchLaunch()
    }, refreshInMs)
    return () => window.clearTimeout(timeout)
  }, [active, activeApp?.iframeEntry, launch?.expiresIn, launch?.launchToken, refetchLaunch])

  useEffect(() => {
    if (!active || !activeApp?.iframeEntry) return
    const refreshLaunchIfVisible = () => {
      if (document.visibilityState === 'hidden') return
      void refetchLaunch()
    }
    window.addEventListener('focus', refreshLaunchIfVisible)
    window.addEventListener('pageshow', refreshLaunchIfVisible)
    document.addEventListener('visibilitychange', refreshLaunchIfVisible)
    return () => {
      window.removeEventListener('focus', refreshLaunchIfVisible)
      window.removeEventListener('pageshow', refreshLaunchIfVisible)
      document.removeEventListener('visibilitychange', refreshLaunchIfVisible)
    }
  }, [active, activeApp?.iframeEntry, refetchLaunch])

  const appPath = serverAppPathFromSearch(routeSearch)
  const appRoutePath = appPath ?? '/'
  const routeCopilotChannelId = getCopilotChannelIdFromSearch(routeSearch)

  const navigateServerAppShell = useCallback(
    (nextSearch: RouteSearch, replace = true) => {
      if (!serverSlug || !activeApp?.appKey) return
      if (sharePage) {
        navigate({
          to: '/share/server-app/$serverSlug/$appKey',
          params: { serverSlug, appKey: activeApp.appKey },
          search: nextSearch,
          replace,
        })
        return
      }
      navigate({
        to: '/servers/$serverSlug/apps/$appKey',
        params: { serverSlug, appKey: activeApp.appKey },
        search: nextSearch,
        replace,
      })
    },
    [activeApp?.appKey, navigate, serverSlug, sharePage],
  )

  const { data: shareChannels = [], isLoading: isShareChannelsLoading } = useQuery({
    queryKey: ['server-app-share-channels', serverSlug],
    queryFn: () => fetchApi<ChannelMeta[]>(`/api/servers/${serverSlug}/channels`),
    enabled: !!serverSlug && !!shareSheet,
    staleTime: SERVER_APP_LIST_STALE_MS,
    gcTime: SERVER_APP_QUERY_GC_MS,
  })

  const shareableChannels = useMemo(
    () =>
      shareChannels.filter((channel) => channel.type !== 'voice' && channel.isArchived !== true),
    [shareChannels],
  )
  const selectedShareChannel =
    shareableChannels.find((channel) => channel.id === shareChannelId) ?? null

  useEffect(() => {
    if (!shareSheet) return
    if (shareChannelId && shareableChannels.some((channel) => channel.id === shareChannelId)) {
      return
    }
    setShareChannelId(
      (routeCopilotChannelId &&
        shareableChannels.find((channel) => channel.id === routeCopilotChannelId)?.id) ||
        shareableChannels[0]?.id ||
        '',
    )
  }, [routeCopilotChannelId, shareableChannels, shareChannelId, shareSheet])
  const iframeFrameKey =
    activeApp?.iframeEntry && launch
      ? `${serverSlug}:${activeApp.appKey}:${activeApp.iframeEntry}`
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
    iframeLastRouteRef.current = appRoutePath
    setIframeSrc(withLaunchParams(activeApp.iframeEntry, launch, appPath))
  }, [
    activeApp?.appKey,
    activeApp?.iframeEntry,
    appPath,
    appRoutePath,
    iframeFrameKey,
    launch,
    serverSlug,
  ])

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
    if (!activeApp?.iframeEntry || !launch?.launchToken || !iframeSrc || !contentWindow) return
    contentWindow.postMessage(
      {
        type: ShadowBridge.launchUpdateType,
        appKey: activeApp.appKey,
        launchToken: launch.launchToken,
        eventStreamUrl: launchEventStreamUrl(launch),
        expiresIn: launch.expiresIn,
      },
      iframeOrigin,
    )
  }, [
    activeApp?.appKey,
    activeApp?.iframeEntry,
    iframeOrigin,
    iframeSrc,
    launch?.eventStreamPath,
    launch?.expiresIn,
    launch?.launchToken,
  ])

  useEffect(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!activeApp?.iframeEntry || !launch || !iframeSrc || !contentWindow) return
    if (iframeLastRouteRef.current === appRoutePath) return
    iframeLastRouteRef.current = appRoutePath
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
        appKey: activeApp.appKey,
        path: appRoutePath,
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
  }, [activeApp?.iframeEntry, appPath, appRoutePath, iframeOrigin, iframeSrc, launch])

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
    if (!activeApp?.appKey || !launch?.launchToken || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      {
        type: ShadowBridge.launchUpdatedEventType,
        appKey: activeApp.appKey,
        result: bridgeLaunchPayload(launch),
      },
      iframeOrigin,
    )
  }, [
    activeApp?.appKey,
    iframeOrigin,
    launch?.eventStreamPath,
    launch?.expiresIn,
    launch?.iframeEntry,
    launch?.launchToken,
  ])

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

  const callBridgeRefreshLaunch = useCallback(
    async (request: BridgeRefreshLaunchRequest) => {
      if (!serverSlug || !activeApp?.appKey || !activeApp.iframeEntry) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing app launch context' },
          ShadowBridge.refreshLaunchResponseType,
        )
        return
      }
      try {
        const result = await refetchLaunch()
        if (result.error) throw result.error
        if (!result.data?.launchToken) throw new Error('Launch refresh failed')
        postBridgeResponse(
          request.requestId,
          { ok: true, result: bridgeLaunchPayload(result.data) },
          ShadowBridge.refreshLaunchResponseType,
        )
      } catch (err) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: err instanceof Error ? err.message : 'Launch refresh failed' },
          ShadowBridge.refreshLaunchResponseType,
        )
      }
    },
    [activeApp?.appKey, activeApp?.iframeEntry, postBridgeResponse, refetchLaunch, serverSlug],
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

  const completeBridgeOAuth = useCallback(
    (request: BridgeAuthorizeOAuthRequest, redirectUrl: string) => {
      if (oauthAuthorizationRequestIdRef.current === request.requestId) {
        oauthAuthorizationRequestIdRef.current = null
      }
      postBridgeResponse(
        request.requestId,
        { ok: true, result: { opened: true, redirectUrl } },
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
      { ok: false, error: 'access_denied' },
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
      const url = new URL(oauthAuthorization.request.authorizeUrl)
      const result = await fetchApi<{ redirectUrl: string }>('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({
          clientId: url.searchParams.get('client_id'),
          redirectUri: url.searchParams.get('redirect_uri'),
          scope: oauthAuthorization.appInfo.scope,
          state: url.searchParams.get('state') ?? undefined,
        }),
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
    async (request: BridgeAuthorizeOAuthRequest) => {
      if (!request.authorizeUrl || !isShadowOAuthAuthorizeUrl(request.authorizeUrl)) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Unsupported OAuth authorize URL' },
          ShadowBridge.authorizeOAuthResponseType,
        )
        return
      }
      if (!iframeRef.current) {
        postBridgeResponse(
          request.requestId,
          { ok: false, error: 'Missing app frame' },
          ShadowBridge.authorizeOAuthResponseType,
        )
        return
      }
      oauthAuthorizationRequestIdRef.current = request.requestId
      setOauthAuthorization((current) => {
        if (current) {
          postBridgeResponse(
            current.request.requestId,
            { ok: false, error: 'OAuth authorization superseded' },
            ShadowBridge.authorizeOAuthResponseType,
          )
        }
        return null
      })
      try {
        const appInfo = await fetchApi<BridgeOAuthAuthorizeInfo>(
          shadowOAuthAuthorizeApiPath(request.authorizeUrl),
        )
        const state = new URL(request.authorizeUrl).searchParams.get('state') ?? undefined
        try {
          const url = new URL(request.authorizeUrl)
          const result = await fetchApi<{ redirectUrl: string }>('/api/oauth/authorize/silent', {
            method: 'POST',
            body: JSON.stringify({
              clientId: url.searchParams.get('client_id'),
              redirectUri: url.searchParams.get('redirect_uri'),
              scope: appInfo.scope,
              state,
            }),
          })
          if (oauthAuthorizationRequestIdRef.current === request.requestId) {
            completeBridgeOAuth(request, result.redirectUrl)
          }
          return
        } catch {
          // Missing or insufficient prior consent falls through to the visible authorization overlay.
        }
        if (oauthAuthorizationRequestIdRef.current !== request.requestId) return
        setOauthAuthorization((current) =>
          current?.request.requestId === request.requestId
            ? {
                request,
                appInfo: { ...appInfo, state },
                loading: false,
                approving: false,
                error: null,
              }
            : {
                request,
                appInfo: { ...appInfo, state },
                loading: false,
                approving: false,
                error: null,
              },
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
            : {
                request,
                appInfo: null,
                loading: false,
                approving: false,
                error: err instanceof Error ? err.message : 'OAuth authorization failed',
              },
        )
      }
    },
    [completeBridgeOAuth, postBridgeResponse],
  )

  const callBridgeRouteChanged = useCallback(
    (path: unknown) => {
      const nextPath = normalizeServerAppRoutePath(path)
      if (!nextPath || nextPath === appRoutePath) return
      navigateServerAppShell(withServerAppRoutePathSearch(routeSearch, nextPath), true)
    },
    [appRoutePath, navigateServerAppShell, routeSearch],
  )

  const openShareSheet = useCallback(
    (request?: BridgeShareAppRequest) => {
      const nextPath = normalizeServerAppRoutePath(request?.path, appRoutePath) ?? '/'
      setShareSheet({
        requestId: request?.requestId,
        path: nextPath,
        title: bridgeString(request?.title),
        description: bridgeString(request?.description),
        label: bridgeString(request?.label),
        data: getRecord(request?.data) ?? undefined,
      })
    },
    [appRoutePath],
  )

  const respondShareRequest = useCallback(
    (
      state: ServerAppShareSheetState | null,
      payload: { ok: true; result: unknown } | { ok: false; error: string },
    ) => {
      if (!state?.requestId) return
      postBridgeResponse(state.requestId, payload, ShadowBridge.shareAppResponseType)
    },
    [postBridgeResponse],
  )

  const dismissShareSheet = useCallback(() => {
    setShareSheet((current) => {
      respondShareRequest(current, { ok: false, error: 'canceled' })
      return null
    })
  }, [respondShareRequest])

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
      if (data.type === ShadowBridge.routeChangedType) {
        callBridgeRouteChanged(data.path)
        return
      }
      if (data.type === ShadowBridge.capabilitiesRequestType) {
        if (typeof data.requestId !== 'string') return
        callBridgeCapabilities({ requestId: data.requestId })
        return
      }
      if (data.type === ShadowBridge.refreshLaunchRequestType) {
        if (typeof data.requestId !== 'string') return
        void callBridgeRefreshLaunch({
          requestId: data.requestId,
          reason: typeof data.reason === 'string' ? data.reason : undefined,
        })
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
        return
      }
      if (data.type === ShadowBridge.authorizeOAuthRequestType) {
        if (typeof data.requestId !== 'string') return
        callBridgeAuthorizeOAuth({
          requestId: data.requestId,
          authorizeUrl: typeof data.authorizeUrl === 'string' ? data.authorizeUrl : '',
        })
        return
      }
      if (data.type === ShadowBridge.shareAppRequestType) {
        if (typeof data.requestId !== 'string') return
        openShareSheet({
          requestId: data.requestId,
          path: typeof data.path === 'string' ? data.path : undefined,
          title: typeof data.title === 'string' ? data.title : undefined,
          description: typeof data.description === 'string' ? data.description : undefined,
          label: typeof data.label === 'string' ? data.label : undefined,
          data: getRecord(data.data) ?? undefined,
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
    callBridgeRefreshLaunch,
    callBridgeListBuddyInboxes,
    callBridgeEnsureBuddyGrant,
    callBridgeAuthorizeOAuth,
    callBridgeRouteChanged,
    openShareSheet,
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

  const sharePath = normalizeServerAppRoutePath(shareSheet?.path, appRoutePath) ?? '/'
  const shareTitle = shareSheet?.title || activeApp?.name || ''
  const shareDescription = shareSheet?.description ?? activeApp?.description ?? undefined
  const shareLabel = shareSheet?.label || t('chat.appCard.open')
  const shareUrl =
    activeApp && serverSlug && typeof window !== 'undefined'
      ? buildServerAppShareUrl({
          origin: window.location.origin,
          serverSlug,
          appKey: activeApp.appKey,
          appPath: sharePath,
        })
      : ''
  const communityUrl =
    activeApp && serverSlug && typeof window !== 'undefined'
      ? new URL(
          buildServerAppCommunityPath({
            serverSlug,
            appKey: activeApp.appKey,
            appPath: sharePath,
          }),
          window.location.origin,
        ).toString()
      : ''
  const shareCard = useMemo<ServerAppMessageCard | null>(() => {
    if (!activeApp || !shareTitle) return null
    return {
      kind: 'server_app',
      version: 1,
      appKey: activeApp.appKey,
      title: shareTitle,
      ...(shareDescription ? { description: shareDescription } : {}),
      label: shareLabel,
      action: { mode: 'open_app', path: sharePath },
      data: {
        ...(shareSheet?.data ?? {}),
        shareUrl,
        communityUrl,
        serverApp: {
          id: activeApp.id,
          appKey: activeApp.appKey,
          name: activeApp.name,
          iconUrl: activeApp.iconUrl,
        },
      },
    }
  }, [
    activeApp,
    communityUrl,
    shareDescription,
    shareLabel,
    sharePath,
    shareSheet?.data,
    shareTitle,
    shareUrl,
  ])

  const completeShareSheet = useCallback(
    (
      result: ShadowBridgeShareAppInput & {
        opened: boolean
        channel?: string
        channelId?: string
        url?: string
      },
    ) => {
      respondShareRequest(shareSheet, { ok: true, result })
      setShareSheet(null)
    },
    [respondShareRequest, shareSheet],
  )

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return
    const copied = await copyToClipboard(shareUrl, {
      successMessage: t('serverApps.shareCopied'),
      errorMessage: t('serverApps.shareFailed'),
    })
    if (copied) {
      completeShareSheet({ opened: true, channel: 'clipboard', url: shareUrl })
    }
  }, [completeShareSheet, shareUrl, t])

  const nativeShareApp = useCallback(async () => {
    if (!shareUrl || typeof navigator === 'undefined' || !navigator.share) {
      showToast(t('serverApps.shareUnavailable'), 'error')
      return
    }
    try {
      await navigator.share({
        title: shareTitle,
        text: shareDescription,
        url: shareUrl,
      })
      completeShareSheet({ opened: true, channel: 'native', url: shareUrl })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      showToast(t('serverApps.shareFailed'), 'error')
    }
  }, [completeShareSheet, shareDescription, shareTitle, shareUrl, t])

  const sendShareToChannel = useCallback(async () => {
    if (!shareCard || !selectedShareChannel) return
    try {
      await fetchApi(`/api/channels/${selectedShareChannel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: t('serverApps.shareMessage', {
            appName: activeApp?.name ?? shareTitle,
            title: shareTitle,
          }),
          metadata: { cards: [shareCard] },
        }),
      })
      showToast(t('serverApps.shareSent'), 'success')
      completeShareSheet({
        opened: true,
        channel: 'channel',
        channelId: selectedShareChannel.id,
        url: shareUrl,
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('serverApps.shareFailed'), 'error')
    }
  }, [
    activeApp?.name,
    completeShareSheet,
    selectedShareChannel,
    shareCard,
    shareTitle,
    shareUrl,
    t,
  ])

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
    <GlassPanel className="relative flex flex-1 min-w-0 overflow-hidden">
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
          allow="clipboard-write"
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
      {oauthAuthorization ? (
        <BridgeOAuthAuthorizationOverlay
          state={oauthAuthorization}
          t={t}
          onApprove={approveBridgeOAuth}
          onDeny={denyBridgeOAuth}
        />
      ) : null}
      <ServerAppShareSheet
        open={!!shareSheet}
        title={shareTitle}
        description={shareDescription}
        appName={activeApp.name}
        appIconUrl={activeApp.iconUrl}
        appPath={sharePath}
        shareUrl={shareUrl}
        channels={shareableChannels}
        selectedChannelId={shareChannelId}
        channelsLoading={isShareChannelsLoading}
        serverSlug={serverSlug}
        nativeShareAvailable={
          typeof navigator !== 'undefined' && typeof navigator.share === 'function'
        }
        t={t}
        onSelectedChannelChange={setShareChannelId}
        onCopyLink={() => void copyShareLink()}
        onNativeShare={() => void nativeShareApp()}
        onSendToChannel={() => void sendShareToChannel()}
        onClose={dismissShareSheet}
      />
    </GlassPanel>
  )
}

export function ServerAppSharePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { serverSlug, appKey } = useParams({ strict: false }) as {
    serverSlug: string
    appKey: string
  }

  return (
    <main className="relative flex h-dvh min-h-0 bg-bg-deep p-3 text-text-primary sm:p-5">
      <ServerAppsPageRoute active appKeyOverride={appKey} sharePage />
      <button
        type="button"
        className="fixed bottom-5 left-1/2 z-40 inline-flex h-11 max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-bg-secondary/92 px-4 text-sm font-black text-text-primary shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur transition hover:border-primary/45 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
        onClick={() =>
          navigate({
            to: '/servers/$serverSlug',
            params: { serverSlug },
          })
        }
      >
        <MessageSquare size={16} />
        <span className="truncate">{t('serverApps.shareOpenCommunity')}</span>
      </button>
    </main>
  )
}

function ServerAppShareSheet({
  open,
  title,
  description,
  appName,
  appIconUrl,
  appPath,
  shareUrl,
  channels,
  selectedChannelId,
  channelsLoading,
  serverSlug,
  nativeShareAvailable,
  t,
  onSelectedChannelChange,
  onCopyLink,
  onNativeShare,
  onSendToChannel,
  onClose,
}: {
  open: boolean
  title: string
  description?: string | null
  appName: string
  appIconUrl?: string | null
  appPath: string
  shareUrl: string
  channels: ChannelMeta[]
  selectedChannelId: string
  channelsLoading: boolean
  serverSlug: string
  nativeShareAvailable: boolean
  t: TFunction
  onSelectedChannelChange: (channelId: string) => void
  onCopyLink: () => void
  onNativeShare: () => void
  onSendToChannel: () => void
  onClose: () => void
}) {
  const [channelQuery, setChannelQuery] = useState('')
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? null
  const filteredChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase()
    if (!query) return channels
    return channels.filter((channel) => channel.name.toLowerCase().includes(query))
  }, [channelQuery, channels])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent
        maxWidth="max-w-[760px]"
        className="rounded-2xl border-border bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)]"
        aria-label={t('serverApps.shareTitle')}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <Share2 size={19} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-text-primary">
                {t('serverApps.shareTitle')}
              </h2>
              <p className="truncate text-xs font-bold text-text-muted">{serverSlug}</p>
            </div>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border-subtle bg-bg-secondary text-text-muted transition hover:border-primary/35 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <ModalBody className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_280px] md:p-5">
          <section className="min-w-0 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase text-text-muted">
                  {t('serverApps.shareLinkLabel')}
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-secondary px-3 text-xs font-black text-text-primary transition hover:border-primary/35 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  onClick={onCopyLink}
                >
                  <Copy size={14} />
                  {t('serverApps.shareCopy')}
                </button>
              </div>
              <div className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3">
                <Link2 size={16} className="shrink-0 text-primary" />
                <input
                  readOnly
                  value={shareUrl}
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-text-secondary outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-black uppercase text-text-muted">
                {t('serverApps.shareChannelLabel')}
              </span>
              <div className="rounded-xl border border-border-subtle bg-bg-secondary/80">
                <label className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
                  <Search size={15} className="shrink-0 text-text-muted" />
                  <input
                    value={channelQuery}
                    onChange={(event) => setChannelQuery(event.target.value)}
                    placeholder={t('common.search')}
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-text-primary outline-none placeholder:text-text-muted"
                  />
                </label>
                <div className="max-h-[230px] overflow-y-auto p-1.5">
                  {channelsLoading ? (
                    <div className="grid min-h-24 place-items-center text-sm font-semibold text-text-muted">
                      {t('common.loading')}
                    </div>
                  ) : filteredChannels.length === 0 ? (
                    <div className="grid min-h-24 place-items-center px-4 text-center text-sm font-semibold text-text-muted">
                      {t('serverApps.shareNoChannels')}
                    </div>
                  ) : (
                    filteredChannels.map((channel) => {
                      const selected = channel.id === selectedChannelId
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          className={`flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            selected
                              ? 'bg-primary/15 text-primary'
                              : 'text-text-primary hover:bg-bg-tertiary'
                          }`}
                          onClick={() => onSelectedChannelChange(channel.id)}
                        >
                          <Hash size={15} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                          {selected ? <Check size={15} className="shrink-0" /> : null}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="glass" onClick={onNativeShare} disabled={!nativeShareAvailable}>
                <ExternalLink size={15} />
                {t('serverApps.shareNative')}
              </Button>
              <Button
                variant="primary"
                onClick={onSendToChannel}
                disabled={!selectedChannel || channels.length === 0}
              >
                <Send size={15} />
                {t('serverApps.shareSendToChannel')}
              </Button>
            </div>
          </section>

          <aside className="min-w-0 rounded-xl border border-border-subtle bg-bg-secondary p-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/25 bg-bg-primary text-primary">
                {appIconUrl ? (
                  <img src={appIconUrl} alt={appName} className="h-full w-full object-cover" />
                ) : (
                  <AppWindow size={20} />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-primary">{appName}</p>
                <h3 className="mt-1 line-clamp-2 text-base font-black leading-6 text-text-primary">
                  {title}
                </h3>
              </div>
            </div>
            {description ? (
              <p className="mt-4 line-clamp-3 text-sm font-semibold leading-6 text-text-secondary">
                {description}
              </p>
            ) : null}
            <div className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs font-black text-primary">
              <Link2 size={13} />
              <span className="truncate">{appPath}</span>
            </div>
          </aside>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

function bridgeOAuthScopeLabel(scope: string, t: TFunction) {
  const labels: Record<string, string> = {
    'user:read': t(
      'oauth.scopeUserRead',
      'Read your basic profile (username, display name, avatar)',
    ),
    'user:email': t('oauth.scopeUserEmail', 'Read your email address'),
    'servers:read': t('oauth.scopeServersRead', 'View your server list'),
    'servers:write': t('oauth.scopeServersWrite', 'Create servers and invite users'),
    'channels:read': t('oauth.scopeChannelsRead', 'View channel list'),
    'channels:write': t('oauth.scopeChannelsWrite', 'Create channels'),
    'messages:read': t('oauth.scopeMessagesRead', 'Read message history'),
    'messages:write': t('oauth.scopeMessagesWrite', 'Send messages'),
    'attachments:read': t('oauth.scopeAttachmentsRead', 'View attachments'),
    'attachments:write': t('oauth.scopeAttachmentsWrite', 'Upload attachments'),
    'workspaces:read': t('oauth.scopeWorkspacesRead', 'View workspace information'),
    'workspaces:write': t('oauth.scopeWorkspacesWrite', 'Modify workspace files'),
    'buddies:create': t('oauth.scopeBuddiesCreate', 'Create Buddy bots'),
    'buddies:manage': t('oauth.scopeBuddiesManage', 'Manage Buddy bots and send messages'),
    'commerce:read': t('oauth.scopeCommerceRead', 'Check purchases for this app'),
    'commerce:write': t('oauth.scopeCommerceWrite', 'Redeem purchases for this app'),
  }
  return labels[scope] ?? scope
}

function BridgeOAuthAuthorizationOverlay({
  state,
  t,
  onApprove,
  onDeny,
}: {
  state: BridgeOAuthAuthorizationState
  t: TFunction
  onApprove: () => void
  onDeny: () => void
}) {
  const appInfo = state.appInfo
  const scopes = (appInfo?.scope ?? 'user:read')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="w-full max-w-[480px] rounded-xl border border-border bg-bg-secondary p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <img src="/Logo.svg" alt="Shadow" className="mx-auto mb-3 h-10 w-10" />
          <h2 className="text-xl font-black text-text-primary">
            {t('oauth.authorizeTitle', 'Authorize Application')}
          </h2>
        </div>

        {state.loading ? (
          <div className="grid min-h-40 place-items-center">
            <Spinner size="md" />
          </div>
        ) : (
          <>
            {state.error ? (
              <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {state.error}
              </div>
            ) : null}

            {appInfo ? (
              <>
                <div className="mb-5 flex items-center gap-3 rounded-md bg-bg-tertiary p-4">
                  {appInfo.appLogoUrl ? (
                    <img
                      src={appInfo.appLogoUrl}
                      alt={appInfo.appName}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary font-black text-white">
                      {appInfo.appName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text-primary">{appInfo.appName}</p>
                    {appInfo.homepageUrl ? (
                      <p className="truncate text-xs text-text-muted">{appInfo.homepageUrl}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="mb-3 text-sm text-text-secondary">
                    {t(
                      'oauth.permissionsLabel',
                      'This application requests the following permissions:',
                    )}
                  </p>
                  <ul className="space-y-2">
                    {scopes.map((scope) => (
                      <li key={scope} className="flex items-center gap-2 text-sm text-text-primary">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-success/15 text-xs font-black text-success">
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <span>{bridgeOAuthScopeLabel(scope, t)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}

            <div className="flex gap-3">
              <Button
                variant="glass"
                className="flex-1"
                disabled={state.approving}
                onClick={onDeny}
              >
                {t('oauth.deny', 'Deny')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={state.approving || !appInfo}
                loading={state.approving}
                onClick={onApprove}
              >
                {state.approving
                  ? t('oauth.authorizing', 'Authorizing...')
                  : t('oauth.authorize', 'Authorize')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
