import {
  Button,
  GlassPanel,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AppWindow, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, fetchApi } from '../lib/api'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

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

interface AppCommandApproval {
  appKey: string
  appName: string
  commandName: string
  commandTitle: string
  commandDescription?: string | null
  permission: string
  action: string
  dataClass: string
  subjectKind: 'user' | 'buddy'
  buddyAgentId?: string | null
  approvalMode: string
  reason: string
}

interface BridgeRequest {
  requestId: string
  commandName: string
  input?: unknown
  channelId?: string
}

interface PendingApproval {
  request: BridgeRequest
  approval: AppCommandApproval
}

function withLaunchParams(entry: string, launch: LaunchContext | undefined) {
  if (!launch?.launchToken) return entry
  const url = new URL(entry, window.location.origin)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      new URL(launch.eventStreamPath, window.location.origin).toString(),
    )
  }
  return url.toString()
}

export function ServerAppsPageRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)
  const [approvalSubmitting, setApprovalSubmitting] = useState(false)
  const { serverSlug, appKey } = useParams({ strict: false }) as {
    serverSlug: string
    appKey?: string
  }

  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['server-apps', serverSlug],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${serverSlug}/apps`),
    enabled: !!serverSlug,
  })

  const activeApp = useMemo(() => apps.find((app) => app.appKey === appKey) ?? null, [appKey, apps])

  useEffect(() => {
    if (!serverSlug || appKey || isLoading || !apps[0]?.appKey) return
    navigate({
      to: '/servers/$serverSlug/apps/$appKey',
      params: { serverSlug, appKey: apps[0].appKey },
      replace: true,
    })
  }, [appKey, apps, isLoading, navigate, serverSlug])

  const { data: launch, isLoading: isLaunchLoading } = useQuery({
    queryKey: ['server-app-launch', serverSlug, activeApp?.appKey],
    queryFn: () =>
      fetchApi<LaunchContext>(`/api/servers/${serverSlug}/apps/${activeApp!.appKey}/launch`, {
        method: 'POST',
      }),
    enabled: !!serverSlug && !!activeApp?.appKey && !!activeApp.iframeEntry,
  })

  const iframeSrc =
    activeApp?.iframeEntry && launch ? withLaunchParams(activeApp.iframeEntry, launch) : null

  const iframeOrigin = useMemo(() => {
    if (!iframeSrc) return '*'
    try {
      return new URL(iframeSrc).origin
    } catch {
      return '*'
    }
  }, [iframeSrc])

  const postBridgeResponse = useCallback(
    (requestId: string, payload: { ok: true; result: unknown } | { ok: false; error: string }) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'shadow.app.command.response',
          requestId,
          ...payload,
        },
        iframeOrigin,
      )
    },
    [iframeOrigin],
  )

  const callBridgeCommand = useCallback(
    async (request: BridgeRequest) => {
      if (!serverSlug || !activeApp?.appKey) return
      try {
        const result = await fetchApi(
          `/api/servers/${serverSlug}/apps/${activeApp.appKey}/commands/${encodeURIComponent(
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
            setPendingApproval({ request, approval })
            return
          }
        }
        postBridgeResponse(request.requestId, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
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
      const data = event.data as Record<string, unknown>
      if (!data || data.type !== 'shadow.app.command.request') return
      if (data.appKey && data.appKey !== activeApp.appKey) return
      if (typeof data.requestId !== 'string' || typeof data.commandName !== 'string') return
      void callBridgeCommand({
        requestId: data.requestId,
        commandName: data.commandName,
        input: data.input,
        channelId: typeof data.channelId === 'string' ? data.channelId : undefined,
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [activeApp, callBridgeCommand])

  const closeApproval = () => {
    if (pendingApproval) {
      postBridgeResponse(pendingApproval.request.requestId, {
        ok: false,
        error: t('serverApps.commandApprovalDenied'),
      })
    }
    setPendingApproval(null)
  }

  const approveAndRetry = async () => {
    if (!pendingApproval || !serverSlug || !activeApp) return
    setApprovalSubmitting(true)
    try {
      await fetchApi(`/api/servers/${serverSlug}/apps/${activeApp.appKey}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          commandName: pendingApproval.request.commandName,
          buddyAgentId: pendingApproval.approval.buddyAgentId ?? undefined,
          remember: pendingApproval.approval.approvalMode !== 'every_time',
        }),
      })
      const request = pendingApproval.request
      setPendingApproval(null)
      await callBridgeCommand(request)
    } catch (error) {
      postBridgeResponse(pendingApproval.request.requestId, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
      setPendingApproval(null)
    } finally {
      setApprovalSubmitting(false)
    }
  }

  if (isLoading || (!appKey && apps.length > 0)) {
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
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
          {t('serverApps.noIframe')}
        </div>
      )}
      <Modal open={!!pendingApproval} onClose={closeApproval}>
        <ModalContent maxWidth="max-w-[460px]">
          <ModalHeader
            title={t('serverApps.commandApprovalTitle')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-tertiary/40 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-text-primary">
                  {pendingApproval?.approval.appName}
                </p>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {pendingApproval?.approval.commandTitle}
                </p>
              </div>
            </div>
            <div className="grid gap-2 text-xs text-text-muted">
              <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
                {t('serverApps.commandApprovalPermission')}:{' '}
                <span className="font-mono text-text-primary">
                  {pendingApproval?.approval.permission}
                </span>
              </div>
              <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
                {t('serverApps.commandApprovalScope')}:{' '}
                <span className="text-text-primary">
                  {pendingApproval?.approval.action} / {pendingApproval?.approval.dataClass}
                </span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button variant="ghost" size="sm" onClick={closeApproval}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={approveAndRetry}
                loading={approvalSubmitting}
                disabled={approvalSubmitting}
              >
                <ShieldCheck size={14} />
                {t('serverApps.commandApprovalConfirm')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </GlassPanel>
  )
}
