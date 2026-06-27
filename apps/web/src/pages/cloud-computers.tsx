import { Button, cn } from '@shadowob/ui'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  AlertCircle,
  Archive,
  Bot,
  ChevronLeft,
  FolderOpen,
  Globe2,
  Loader2,
  type LucideIcon,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Save,
  ScreenShare,
  Settings,
  Square,
  Terminal,
  UserRound,
  Wrench,
} from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createCloudComputerWorkspaceSource, WorkspacePage } from '../components/workspace'
import { ApiError, fetchApi } from '../lib/api'
import { connectSocket, getSocket } from '../lib/socket'

type CloudComputerSummary = {
  id: string
  name: string
  status: string
  agentCount: number
  updatedAt: string | null
  lastActiveAt: string | null
  errorMessage?: string | null
}

type CloudComputersPageProps = {
  embedded?: boolean
  initialComputerId?: string
  initialApp?: CloudComputerApp
}

type CloudComputerApp =
  | 'files'
  | 'browser'
  | 'terminal'
  | 'desktop'
  | 'buddies'
  | 'backups'
  | 'settings'
type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
type VncStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
type BrowserStatus = 'connecting' | 'connected' | 'error'

type CloudComputerVncSession = {
  ok: true
  websocketUrl: string
  expiresAt: string
  runtimeEnsured?: boolean
  repairAvailable?: boolean
  componentStatus?: 'ensured' | 'repairable' | 'not-configured'
}

type CloudComputerRepairResponse = {
  ok: true
  component: 'browser' | 'desktop'
  runtimeEnsured: boolean
  repairAvailable: boolean
  componentStatus: 'ensured' | 'repairable' | 'not-configured'
}

type CloudComputerBrowserPage = {
  title: string
  url: string
}

type CloudComputerBrowserSession = {
  ok: true
  surface: 'cdp'
  token: string
  expiresAt: string
  cloudComputerId: string
  page: CloudComputerBrowserPage | null
  endpoints: {
    screenshot: string
    navigate: string
    click: string
    type: string
    key: string
  }
  runtimeEnsured?: boolean
  repairAvailable?: boolean
  componentStatus?: 'ensured' | 'repairable' | 'not-configured'
}

type CloudComputerBrowserCapture = {
  ok: true
  image: string
  page: CloudComputerBrowserPage
}

type CloudComputerRuntimeRepairResponse = {
  ok?: boolean
  component: 'runtime'
  cloudComputerId: string
  recoveryAction: 'redeploy' | 'resume'
}

type CloudComputerBuddy = {
  id: string
  name: string
  status: string
  kernelType?: string | null
  lastHeartbeat?: string | null
  botUser?: {
    id?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

type CloudComputerBuddiesResponse = {
  ok: true
  cloudComputerId: string
  buddies: CloudComputerBuddy[]
}

type CloudComputerCreateBuddyResponse = {
  ok: true
  cloudComputerId: string
  buddy: CloudComputerBuddy
  redeploy?: unknown
}

type CloudDeploymentBackup = {
  id: string
  agentId?: string | null
  status: string
  driver?: string | null
  phase?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  completedAt?: string | null
}

type CloudComputerBackupsResponse = {
  cloudComputerId: string
  backups: CloudDeploymentBackup[]
}

function statusDotClass(status: string) {
  if (status === 'deployed' || status === 'running' || status === 'ready') return 'bg-emerald-500'
  if (status === 'failed' || status === 'error') return 'bg-rose-500'
  if (status === 'paused') return 'bg-sky-500'
  if (
    status === 'pending' ||
    status === 'deploying' ||
    status === 'resuming' ||
    status === 'cancelling' ||
    status === 'destroying'
  ) {
    return 'bg-amber-400'
  }
  return 'bg-zinc-400'
}

function formatTimestamp(value: string | null | undefined, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function StatusDot({ status }: { status: string }) {
  const { t } = useTranslation()
  const label = t(`cloudComputers.status.${status}`, {
    defaultValue: t('cloudComputers.status.unknown'),
  })
  return (
    <span
      title={label}
      aria-label={label}
      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusDotClass(status))}
    />
  )
}

function CloudComputerGlyph({ active }: { active?: boolean }) {
  return (
    <span
      className={cn(
        'grid h-16 w-16 place-items-center rounded-lg border',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border-subtle bg-bg-secondary text-text-secondary',
      )}
    >
      <Monitor size={30} />
    </span>
  )
}

function DesktopIcon({
  icon: Icon,
  label,
  onOpen,
}: {
  icon: LucideIcon
  label: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onOpen}
      className="group flex w-[92px] flex-col items-center gap-2 rounded-lg p-2 text-center outline-none transition hover:bg-bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="grid h-16 w-16 place-items-center rounded-lg border border-border-subtle bg-bg-secondary text-text-secondary transition group-hover:border-primary/40 group-hover:text-primary">
        <Icon size={28} />
      </span>
      <span className="line-clamp-2 text-xs font-semibold leading-tight text-text-primary">
        {label}
      </span>
    </button>
  )
}

function ComputerDesktopIcon({
  computer,
  onOpen,
}: {
  computer: CloudComputerSummary
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onOpen()
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={t('cloudComputers.openComputer', { name: computer.name })}
      className="group flex w-[112px] flex-col items-center gap-2 rounded-lg p-2 text-center outline-none transition hover:bg-bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
    >
      <CloudComputerGlyph />
      <span className="flex max-w-full items-center gap-1.5">
        <StatusDot status={computer.status} />
        <span className="truncate text-xs font-semibold text-text-primary">{computer.name}</span>
      </span>
    </button>
  )
}

function LoadingDesktop() {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center text-sm font-semibold text-text-muted">
      <span className="inline-flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        {t('common.loading')}
      </span>
    </div>
  )
}

function EmptyDesktop({
  creating,
  error,
  onCreate,
}: {
  creating: boolean
  error: string | null
  onCreate: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="flex max-w-xs flex-col items-center">
        <CloudComputerGlyph />
        <h2 className="mt-4 text-lg font-bold text-text-primary">
          {t('cloudComputers.emptyTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-muted">{t('cloudComputers.emptyDesc')}</p>
        {error ? <p className="mt-3 text-sm font-bold text-danger">{error}</p> : null}
        <Button variant="primary" size="sm" className="mt-4" disabled={creating} onClick={onCreate}>
          {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {t('cloudComputers.createComputer')}
        </Button>
      </div>
    </div>
  )
}

function ComputerChooser({
  computers,
  onOpen,
  onRefresh,
  refreshing,
  onCreate,
  creating,
  error,
}: {
  computers: CloudComputerSummary[]
  onOpen: (computer: CloudComputerSummary) => void
  onRefresh: () => void
  refreshing: boolean
  onCreate: () => void
  creating: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
        <h1 className="text-base font-bold text-text-primary">{t('cloudComputers.title')}</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          aria-label={t('cloudComputers.refresh')}
          title={t('cloudComputers.refresh')}
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,112px))] content-start gap-4">
          {computers.map((computer) => (
            <ComputerDesktopIcon
              key={computer.id}
              computer={computer}
              onOpen={() => onOpen(computer)}
            />
          ))}
          <DesktopIcon
            icon={creating ? Loader2 : Plus}
            label={t('cloudComputers.createComputer')}
            onOpen={onCreate}
          />
        </div>
        {error ? (
          <div className="mt-4 inline-flex rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CloudComputerTerminalPanel({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [restartKey, setRestartKey] = useState(0)
  const repairRuntime = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerRuntimeRepairResponse>(
        `/api/cloud-computers/${computer.id}/runtime/repair`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setError(null)
      setStatus('connecting')
      setRestartKey((value) => value + 1)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return

    const terminal = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      theme: {
        background: '#09090b',
        foreground: '#f4f4f5',
        cursor: '#f4f4f5',
        selectionBackground: '#3f3f46',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    terminal.focus()
    fitAddon.fit()
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    connectSocket()
    const socket = getSocket()

    const handleData = (payload: { sessionId?: string; data?: string }) => {
      if (payload.sessionId !== sessionIdRef.current || typeof payload.data !== 'string') return
      terminal.write(payload.data)
    }
    const handleExit = (payload: { sessionId?: string; exitCode?: number }) => {
      if (payload.sessionId !== sessionIdRef.current) return
      sessionIdRef.current = null
      setStatus('disconnected')
      terminal.writeln('')
      terminal.writeln(t('cloudComputers.terminalSessionEnded', { code: payload.exitCode ?? 0 }))
    }

    socket.on('cloud-computer:terminal:data', handleData)
    socket.on('cloud-computer:terminal:exit', handleExit)

    const startTerminal = () => {
      setStatus('connecting')
      socket.emit(
        'cloud-computer:terminal:start',
        {
          computerId: computer.id,
          cols: terminal.cols,
          rows: terminal.rows,
        },
        (response: { ok: true; sessionId: string } | { ok: false; error: string }) => {
          if (!response.ok) {
            setStatus('error')
            setError(response.error)
            terminal.writeln(t('cloudComputers.terminalStartFailed', { error: response.error }))
            return
          }
          sessionIdRef.current = response.sessionId
          setStatus('connected')
          setError(null)
          terminal.writeln(t('cloudComputers.terminalConnected'))
        },
      )
    }

    const dataDisposable = terminal.onData((data) => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      socket.emit('cloud-computer:terminal:input', { sessionId, data })
    })
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      socket.emit('cloud-computer:terminal:resize', {
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
    })
    resizeObserver.observe(host)
    startTerminal()

    return () => {
      const sessionId = sessionIdRef.current
      if (sessionId) socket.emit('cloud-computer:terminal:stop', { sessionId })
      sessionIdRef.current = null
      socket.off('cloud-computer:terminal:data', handleData)
      socket.off('cloud-computer:terminal:exit', handleExit)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [computer.id, restartKey, t])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
        <span className="text-xs font-bold text-zinc-300">
          {t(`cloudComputers.terminalStatus.${status}`)}
        </span>
        {error ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs text-danger">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-zinc-200"
              disabled={repairRuntime.isPending}
              onClick={() => repairRuntime.mutate()}
              title={t('cloudComputers.runtimeRepairHint')}
            >
              {repairRuntime.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wrench size={13} />
              )}
              {t('cloudComputers.installOrRepair')}
            </Button>
          </span>
        ) : null}
      </div>
      <div ref={terminalHostRef} className="min-h-0 flex-1 overflow-hidden p-2" />
    </section>
  )
}

function CloudComputerVncPanel({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<{ disconnect: () => void; focus?: () => void } | null>(null)
  const connectedOnceRef = useRef(false)
  const [status, setStatus] = useState<VncStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [runtimeHint, setRuntimeHint] = useState<string | null>(null)
  const [repairAvailable, setRepairAvailable] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const repairComponent = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerRepairResponse>(`/api/cloud-computers/${computer.id}/desktop/repair`, {
        method: 'POST',
      }),
    onSuccess: (response) => {
      setError(null)
      setRepairAvailable(Boolean(response.repairAvailable))
      setRuntimeHint(t('cloudComputers.desktopRepairHint'))
      setRetryKey((value) => value + 1)
    },
    onError: (err: Error) => {
      setStatus('error')
      setError(err.message)
    },
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    connectedOnceRef.current = false
    setStatus('connecting')
    setError(null)
    setRuntimeHint(null)
    setRepairAvailable(false)

    const connectVnc = async () => {
      try {
        const session = await fetchApi<CloudComputerVncSession>(
          `/api/cloud-computers/${computer.id}/desktop/session`,
          { method: 'POST' },
        )
        if (disposed) return
        setRepairAvailable(Boolean(session.repairAvailable))
        if (!session.runtimeEnsured) {
          setRuntimeHint(
            session.repairAvailable
              ? t('cloudComputers.desktopRepairHint')
              : t('cloudComputers.desktopRuntimeHint'),
          )
        }
        const { default: RFB } = await import('@novnc/novnc')
        if (disposed) return
        host.replaceChildren()
        const rfb = new RFB(host, session.websocketUrl, { shared: true })
        rfb.scaleViewport = true
        rfb.resizeSession = true
        rfb.clipViewport = true
        rfb.addEventListener('connect', () => {
          connectedOnceRef.current = true
          setStatus('connected')
          setError(null)
          setRuntimeHint(null)
          rfb.focus()
        })
        rfb.addEventListener('disconnect', () => {
          if (disposed) return
          if (!connectedOnceRef.current) {
            setStatus('error')
            setError(t('cloudComputers.desktopServiceUnavailable'))
            return
          }
          setStatus('disconnected')
        })
        rfb.addEventListener('securityfailure', (event) => {
          const detail = (event as CustomEvent<{ reason?: string }>).detail
          setStatus('error')
          setError(detail?.reason ?? t('cloudComputers.desktopConnectionFailed'))
        })
        rfbRef.current = rfb
      } catch (err) {
        if (disposed) return
        setStatus('error')
        setRepairAvailable(false)
        if (err instanceof ApiError && err.status === 404) {
          setError(t('cloudComputers.desktopInstallRequired'))
        } else {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void connectVnc()

    return () => {
      disposed = true
      rfbRef.current?.disconnect()
      rfbRef.current = null
      host.replaceChildren()
    }
  }, [computer.id, retryKey, t])

  const statusLabel = t(`cloudComputers.desktopStatus.${status}`)
  const connectionFailed = t('cloudComputers.desktopConnectionFailed')

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden bg-black [&_canvas]:h-full [&_canvas]:w-full"
      />
      {status === 'error' || runtimeHint ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-3 py-2 text-xs',
            status === 'error' ? 'text-danger' : 'text-zinc-400',
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">
              {status === 'error' ? (error ?? connectionFailed) : runtimeHint}
            </span>
          </span>
          {repairAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={repairComponent.isPending}
              onClick={() => repairComponent.mutate()}
              title={statusLabel}
            >
              {repairComponent.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wrench size={13} />
              )}
              {t('cloudComputers.installOrRepair')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function CloudComputerBrowserPanel({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<BrowserStatus>('connecting')
  const [image, setImage] = useState<string | null>(null)
  const [page, setPage] = useState<CloudComputerBrowserPage | null>(null)
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [runtimeHint, setRuntimeHint] = useState<string | null>(null)
  const [repairAvailable, setRepairAvailable] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [actionPending, setActionPending] = useState(false)

  const repairComponent = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerRepairResponse>(`/api/cloud-computers/${computer.id}/browser/repair`, {
        method: 'POST',
      }),
    onSuccess: (response) => {
      setError(null)
      setRepairAvailable(Boolean(response.repairAvailable))
      setRuntimeHint(t('cloudComputers.browserRepairHint'))
      setRetryKey((value) => value + 1)
    },
    onError: (err: Error) => {
      setStatus('error')
      setError(err.message)
    },
  })

  const applyCapture = (capture: CloudComputerBrowserCapture) => {
    setImage(capture.image)
    setPage(capture.page)
    setAddress(capture.page.url)
    setStatus('connected')
    setError(null)
    setRuntimeHint(null)
  }

  const runBrowserAction = async (
    action: 'screenshot' | 'navigate' | 'click' | 'type' | 'key',
    body?: unknown,
  ) => {
    setActionPending(true)
    try {
      const capture = await fetchApi<CloudComputerBrowserCapture>(
        `/api/cloud-computers/${computer.id}/browser/${action}`,
        {
          method: 'POST',
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      )
      applyCapture(capture)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setActionPending(false)
    }
  }

  useEffect(() => {
    let disposed = false
    setStatus('connecting')
    setImage(null)
    setPage(null)
    setError(null)
    setRuntimeHint(null)
    setRepairAvailable(false)

    const startBrowser = async () => {
      try {
        const session = await fetchApi<CloudComputerBrowserSession>(
          `/api/cloud-computers/${computer.id}/browser/session`,
          { method: 'POST' },
        )
        if (disposed) return
        setRepairAvailable(Boolean(session.repairAvailable))
        if (!session.runtimeEnsured) {
          setRuntimeHint(
            session.repairAvailable
              ? t('cloudComputers.browserRepairHint')
              : t('cloudComputers.browserRuntimeHint'),
          )
        }
        const capture = await fetchApi<CloudComputerBrowserCapture>(
          `/api/cloud-computers/${computer.id}/browser/screenshot`,
          { method: 'POST' },
        )
        if (disposed) return
        applyCapture(capture)
      } catch (err) {
        if (disposed) return
        setStatus('error')
        if (err instanceof ApiError && err.status === 404) {
          setError(t('cloudComputers.browserInstallRequired'))
        } else {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void startBrowser()
    return () => {
      disposed = true
    }
  }, [computer.id, retryKey, t])

  const navigate = () => {
    const nextUrl = address.trim()
    if (!nextUrl || actionPending) return
    void runBrowserAction('navigate', { url: nextUrl })
  }

  const handleImageClick = (event: MouseEvent<HTMLImageElement>) => {
    if (actionPending) return
    const imageElement = event.currentTarget
    const rect = imageElement.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * imageElement.naturalWidth
    const y = ((event.clientY - rect.top) / rect.height) * imageElement.naturalHeight
    void runBrowserAction('click', { x, y })
  }

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (actionPending || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key.length === 1) {
      event.preventDefault()
      void runBrowserAction('type', { text: event.key })
      return
    }
    if (
      [
        'Enter',
        'Backspace',
        'Tab',
        'Escape',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ].includes(event.key)
    ) {
      event.preventDefault()
      void runBrowserAction('key', { key: event.key })
    }
  }

  const statusLabel = t(`cloudComputers.browserStatus.${status}`)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-primary">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-secondary px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={actionPending}
          onClick={() => void runBrowserAction('screenshot')}
          title={t('common.refresh')}
        >
          {actionPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </Button>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') navigate()
          }}
          placeholder={t('cloudComputers.browserAddressPlaceholder')}
          className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-base px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
        />
        <Button size="sm" disabled={actionPending || !address.trim()} onClick={navigate}>
          <Globe2 size={14} />
          {t('cloudComputers.browserGo')}
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto bg-black"
        tabIndex={0}
        onKeyDown={handleSurfaceKeyDown}
        title={page?.title || statusLabel}
      >
        {image ? (
          <img
            src={image}
            alt={page?.title || t('cloudComputers.browser')}
            className="mx-auto block max-w-full cursor-crosshair select-none"
            draggable={false}
            onClick={handleImageClick}
          />
        ) : (
          <LoadingDesktop />
        )}
      </div>
      {status === 'error' || runtimeHint ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle bg-bg-secondary px-3 py-2 text-xs',
            status === 'error' ? 'text-danger' : 'text-text-muted',
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">
              {status === 'error'
                ? (error ?? t('cloudComputers.browserConnectionFailed'))
                : runtimeHint}
            </span>
          </span>
          {repairAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={repairComponent.isPending}
              onClick={() => repairComponent.mutate()}
              title={statusLabel}
            >
              {repairComponent.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wrench size={13} />
              )}
              {t('cloudComputers.installOrRepair')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function buddyDisplayName(agent: CloudComputerBuddy) {
  return agent.name || agent.botUser?.displayName || agent.botUser?.username || agent.id
}

function buddyStatusDotClass(status: string) {
  if (status === 'running') return 'bg-emerald-500'
  if (status === 'error') return 'bg-rose-500'
  return 'bg-zinc-400'
}

function CloudComputerBuddiesApp({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const [buddyName, setBuddyName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const buddiesQuery = useQuery({
    queryKey: ['cloud-computer-buddies', computer.id],
    queryFn: () =>
      fetchApi<CloudComputerBuddiesResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`,
      ),
  })
  const toggleBuddy = useMutation({
    mutationFn: (agent: CloudComputerBuddy) =>
      fetchApi<{ ok: true; buddy: CloudComputerBuddy | null }>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies/${encodeURIComponent(
          agent.id,
        )}/${agent.status === 'running' ? 'stop' : 'start'}`,
        {
          method: 'POST',
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-buddies', computer.id] })
    },
  })
  const createBuddy = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerCreateBuddyResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`,
        {
          method: 'POST',
          body: JSON.stringify({ name: buddyName.trim() }),
        },
      ),
    onSuccess: () => {
      setMessage(t('cloudComputers.buddyCreateQueued'))
      setShowCreateBuddy(false)
      setBuddyName('')
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-buddies', computer.id] })
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
    onError: (error: Error) => setMessage(error.message || t('cloudComputers.buddyCreateFailed')),
  })
  const buddies = buddiesQuery.data?.buddies ?? []
  const canCreateBuddy = buddyName.trim().length > 0 && !createBuddy.isPending

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-bg-primary p-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                {t('cloudComputers.buddyAccounts')}
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                {t('cloudComputers.buddyAccountsDesc')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setMessage(null)
                setShowCreateBuddy((value) => !value)
              }}
            >
              <Plus size={14} />
              {t('cloudComputers.addBuddy')}
            </Button>
          </div>
          {showCreateBuddy ? (
            <form
              className="mb-3 rounded-lg border border-border-subtle bg-bg-secondary p-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (canCreateBuddy) createBuddy.mutate()
              }}
            >
              <label
                className="mb-2 block text-xs font-semibold text-text-muted"
                htmlFor={`cloud-computer-buddy-name-${computer.id}`}
              >
                {t('cloudComputers.buddyName')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={`cloud-computer-buddy-name-${computer.id}`}
                  value={buddyName}
                  onChange={(event) => setBuddyName(event.target.value)}
                  placeholder={t('cloudComputers.buddyNamePlaceholder')}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-base px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
                  maxLength={80}
                />
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowCreateBuddy(false)
                      setBuddyName('')
                    }}
                  >
                    {t('cloudComputers.cancelCreateBuddy')}
                  </Button>
                  <Button type="submit" size="sm" disabled={!canCreateBuddy}>
                    {createBuddy.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                    {createBuddy.isPending
                      ? t('cloudComputers.creatingBuddy')
                      : t('cloudComputers.createBuddy')}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
          {message ? <p className="mb-3 text-sm text-text-muted">{message}</p> : null}
          {buddiesQuery.isLoading ? (
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <LoadingDesktop />
            </div>
          ) : buddies.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4 text-sm text-text-muted">
              {t('cloudComputers.noBuddyAccounts')}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {buddies.map((agent) => {
                const isRunning = agent.status === 'running'
                return (
                  <div
                    key={agent.id}
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-border-subtle bg-bg-secondary p-3"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border-subtle bg-bg-base text-text-secondary">
                      <UserRound size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-bold text-text-primary">
                          {buddyDisplayName(agent)}
                        </span>
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            buddyStatusDotClass(agent.status),
                          )}
                        />
                      </div>
                      <p className="truncate text-xs text-text-muted">
                        {agent.kernelType || t('cloudComputers.agentRuntimeUnknown')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggleBuddy.isPending}
                      onClick={() => toggleBuddy.mutate(agent)}
                    >
                      {isRunning ? <Square size={14} /> : <Play size={14} />}
                      {isRunning ? t('cloudComputers.stopBuddy') : t('cloudComputers.startBuddy')}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function CloudComputerBackupsApp({ computer }: { computer: CloudComputerSummary }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)

  const backupsQuery = useQuery({
    queryKey: ['cloud-computer-backups', computer.id],
    queryFn: () =>
      fetchApi<CloudComputerBackupsResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/backups`,
      ),
  })

  const createBackup = useMutation({
    mutationFn: () =>
      fetchApi<{ ok: true }>(`/api/cloud-computers/${encodeURIComponent(computer.id)}/backups`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      setMessage(t('cloudComputers.backupQueued'))
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-backups', computer.id] })
    },
    onError: (error: Error) => setMessage(error.message),
  })

  const restoreBackup = useMutation({
    mutationFn: (backupId: string) =>
      fetchApi<{ ok: true }>(`/api/cloud-computers/${encodeURIComponent(computer.id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ backupId }),
      }),
    onSuccess: () => {
      setMessage(t('cloudComputers.restoreQueued'))
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-backups', computer.id] })
    },
    onError: (error: Error) => setMessage(error.message),
  })

  const backups = backupsQuery.data?.backups ?? []
  const canCreateBackup = computer.status === 'deployed' || computer.status === 'paused'
  const unavailableMessage = t('cloudComputers.backupUnavailable')

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg-primary p-4">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t('cloudComputers.backupsDesc')}</p>
        <Button
          variant="primary"
          size="sm"
          disabled={!canCreateBackup || createBackup.isPending}
          onClick={() => createBackup.mutate()}
          title={!canCreateBackup ? unavailableMessage : undefined}
        >
          {createBackup.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Archive size={15} />
          )}
          {t('cloudComputers.createBackup')}
        </Button>
      </div>
      {!canCreateBackup ? (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-secondary">
          {unavailableMessage}
        </div>
      ) : null}
      {message ? (
        <div className="mb-3 rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
          {message}
        </div>
      ) : null}
      {backupsQuery.isLoading ? (
        <LoadingDesktop />
      ) : backups.length === 0 ? (
        <div className="grid h-full place-items-center text-center">
          <div className="max-w-sm">
            <Archive size={34} className="mx-auto text-text-muted" />
            <h3 className="mt-3 text-base font-bold text-text-primary">
              {t('cloudComputers.noBackupsTitle')}
            </h3>
            <p className="mt-2 text-sm text-text-muted">{t('cloudComputers.noBackupsDesc')}</p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-secondary p-3"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-info/12 text-info">
                  <Archive size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold text-text-primary">
                      {backup.agentId ?? t('cloudComputers.sharedWorkspace')}
                    </span>
                    <span className="text-xs text-text-muted">{backup.status}</span>
                  </div>
                  <p className="truncate text-xs text-text-muted">
                    {formatTimestamp(
                      backup.completedAt ?? backup.updatedAt ?? backup.createdAt,
                      i18n.language,
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={backup.status !== 'succeeded' || restoreBackup.isPending}
                  onClick={() => restoreBackup.mutate(backup.id)}
                >
                  {t('cloudComputers.restoreBackup')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function CloudComputerSettingsApp({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(computer.name)
  const updateSettings = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerSummary>(`/api/cloud-computers/${computer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      )
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })

  useEffect(() => {
    setName(computer.name)
  }, [computer.name])

  const trimmedName = name.trim()

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-bg-primary p-4">
      <div className="mx-auto w-full max-w-xl rounded-lg border border-border-subtle bg-bg-secondary p-4">
        <Settings size={28} className="text-text-muted" />
        <h3 className="mt-3 text-base font-bold text-text-primary">
          {t('cloudComputers.settingsTitle')}
        </h3>
        <p className="mt-2 text-sm text-text-muted">{t('cloudComputers.settingsDesc')}</p>
        <label className="mt-4 block text-left text-xs font-semibold text-text-muted">
          {t('cloudComputers.computerName')}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-label={t('cloudComputers.computerName')}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!trimmedName || trimmedName === computer.name || updateSettings.isPending}
            onClick={() => updateSettings.mutate()}
          >
            {updateSettings.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {t('common.save')}
          </Button>
        </div>
        {updateSettings.error ? (
          <p className="mt-2 text-left text-sm text-danger">{updateSettings.error.message}</p>
        ) : null}
        <div className="mt-4 rounded-lg border border-border-subtle bg-bg-base p-3 text-left">
          <p className="text-xs font-semibold text-text-muted">{t('cloudComputers.computerId')}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-text-muted">{computer.id}</p>
        </div>
      </div>
    </section>
  )
}

function cloudComputerApps(t: TFunction) {
  return [
    { key: 'files' as const, icon: FolderOpen, label: t('cloudComputers.files') },
    { key: 'browser' as const, icon: Globe2, label: t('cloudComputers.browser') },
    { key: 'terminal' as const, icon: Terminal, label: t('cloudComputers.terminal') },
    { key: 'desktop' as const, icon: ScreenShare, label: t('cloudComputers.desktop') },
    { key: 'buddies' as const, icon: Bot, label: t('cloudComputers.buddies') },
    { key: 'backups' as const, icon: Archive, label: t('cloudComputers.backups') },
    { key: 'settings' as const, icon: Settings, label: t('cloudComputers.settings') },
  ] satisfies Array<{ key: CloudComputerApp; icon: LucideIcon; label: string }>
}

function CloudComputerBreadcrumbs({
  computer,
  appLabel,
  canBack,
  onBack,
  onComputerHome,
}: {
  computer: CloudComputerSummary
  appLabel?: string
  canBack: boolean
  onBack: () => void
  onComputerHome: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-base px-3">
      {canBack ? (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ChevronLeft size={18} />
        </Button>
      ) : null}
      <nav
        className="flex min-w-0 items-center gap-2 text-sm"
        aria-label={t('cloudComputers.path')}
      >
        <button
          type="button"
          className="shrink-0 font-semibold text-text-muted hover:text-text-primary"
          onClick={onBack}
        >
          {t('cloudComputers.title')}
        </button>
        <span className="text-text-muted">/</span>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 font-semibold text-text-primary hover:text-primary"
          onClick={onComputerHome}
        >
          <StatusDot status={computer.status} />
          <span className="truncate">{computer.name}</span>
        </button>
        {appLabel ? (
          <>
            <span className="text-text-muted">/</span>
            <span className="truncate font-semibold text-text-primary">{appLabel}</span>
          </>
        ) : null}
      </nav>
    </div>
  )
}

function CloudComputerAppView({
  app,
  computer,
  canBack,
  onBack,
  onComputerHome,
}: {
  app: CloudComputerApp
  computer: CloudComputerSummary
  canBack: boolean
  onBack: () => void
  onComputerHome: () => void
}) {
  const { t } = useTranslation()
  const filesSource = useMemo(() => createCloudComputerWorkspaceSource(computer.id), [computer.id])
  const currentApp = cloudComputerApps(t).find((item) => item.key === app)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base">
      <CloudComputerBreadcrumbs
        computer={computer}
        appLabel={currentApp?.label ?? t('cloudComputers.settings')}
        canBack={canBack}
        onBack={onBack}
        onComputerHome={onComputerHome}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {app === 'files' ? (
          <WorkspacePage
            key={filesSource.id}
            source={filesSource}
            embedded
            collapsibleSidebar
            onClose={onComputerHome}
          />
        ) : app === 'browser' ? (
          <CloudComputerBrowserPanel computer={computer} />
        ) : app === 'terminal' ? (
          <CloudComputerTerminalPanel computer={computer} />
        ) : app === 'desktop' ? (
          <CloudComputerVncPanel computer={computer} />
        ) : app === 'buddies' ? (
          <CloudComputerBuddiesApp computer={computer} />
        ) : app === 'backups' ? (
          <CloudComputerBackupsApp computer={computer} />
        ) : (
          <CloudComputerSettingsApp computer={computer} />
        )}
      </div>
    </section>
  )
}

function CloudComputerDesktop({
  computer,
  activeApp,
  canBack,
  onBack,
  onOpenApp,
  onComputerHome,
}: {
  computer: CloudComputerSummary
  activeApp: CloudComputerApp | null
  canBack: boolean
  onBack: () => void
  onOpenApp: (app: CloudComputerApp) => void
  onComputerHome: () => void
}) {
  const { t } = useTranslation()
  const apps = cloudComputerApps(t)

  if (activeApp) {
    return (
      <CloudComputerAppView
        app={activeApp}
        computer={computer}
        canBack={canBack}
        onBack={onBack}
        onComputerHome={onComputerHome}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base">
      <CloudComputerBreadcrumbs
        computer={computer}
        canBack={canBack}
        onBack={onBack}
        onComputerHome={onComputerHome}
      />
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,92px))] content-start gap-4">
          {apps.map((app) => (
            <DesktopIcon
              key={app.key}
              icon={app.icon}
              label={app.label}
              onOpen={() => onOpenApp(app.key)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function CloudComputersPage({
  embedded = false,
  initialComputerId,
  initialApp,
}: CloudComputersPageProps = {}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [desktopComputerId, setDesktopComputerId] = useState<string | null>(
    initialComputerId ?? null,
  )
  const [activeApp, setActiveApp] = useState<CloudComputerApp | null>(initialApp ?? null)

  const computersQuery = useQuery({
    queryKey: ['cloud-computers'],
    queryFn: () => fetchApi<CloudComputerSummary[]>('/api/cloud-computers?limit=100&offset=0'),
  })

  const computers = computersQuery.data ?? []

  useEffect(() => {
    if (initialComputerId) {
      setDesktopComputerId(initialComputerId)
      setActiveApp(initialApp ?? null)
      return
    }
    if (computers.length === 1) {
      setDesktopComputerId(computers[0]?.id ?? null)
      return
    }
    setDesktopComputerId((current) =>
      current && computers.some((computer) => computer.id === current) ? current : null,
    )
  }, [computers, initialApp, initialComputerId])

  const desktopComputer = computers.find((computer) => computer.id === desktopComputerId) ?? null

  const createComputer = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerSummary>('/api/cloud-computers', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (computer) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) => {
        const existing = current ?? []
        return existing.some((item) => item.id === computer.id) ? existing : [computer, ...existing]
      })
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
      setDesktopComputerId(computer.id)
      setActiveApp(null)
      if (!embedded) {
        navigate({ to: '/cloud-computers/$computerId', params: { computerId: computer.id } })
      }
    },
  })

  const openComputer = (computer: CloudComputerSummary) => {
    setDesktopComputerId(computer.id)
    setActiveApp(null)
    if (!embedded) {
      navigate({ to: '/cloud-computers/$computerId', params: { computerId: computer.id } })
    }
  }

  const openApp = (app: CloudComputerApp) => {
    if (!desktopComputerId) return
    setActiveApp(app)
    if (!embedded) {
      navigate({
        to: '/cloud-computers/$computerId/$appKey',
        params: { computerId: desktopComputerId, appKey: app },
      })
    }
  }

  const backToComputerHome = () => {
    setActiveApp(null)
    if (!embedded && desktopComputerId) {
      navigate({ to: '/cloud-computers/$computerId', params: { computerId: desktopComputerId } })
    }
  }

  const backToComputers = () => {
    setDesktopComputerId(null)
    setActiveApp(null)
    if (!embedded) navigate({ to: '/cloud-computers' })
  }

  const startCreateComputer = () => {
    if (!createComputer.isPending) createComputer.mutate()
  }

  return (
    <div
      className={cn(
        'h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg-base text-text-primary',
        embedded ? '' : 'rounded-lg border border-border-subtle',
      )}
    >
      {computersQuery.isLoading ? (
        <LoadingDesktop />
      ) : computers.length === 0 ? (
        <EmptyDesktop
          creating={createComputer.isPending}
          error={createComputer.error?.message ?? null}
          onCreate={startCreateComputer}
        />
      ) : desktopComputer ? (
        <CloudComputerDesktop
          computer={desktopComputer}
          activeApp={activeApp}
          canBack={computers.length > 1 || Boolean(initialComputerId)}
          onBack={backToComputers}
          onOpenApp={openApp}
          onComputerHome={backToComputerHome}
        />
      ) : (
        <ComputerChooser
          computers={computers}
          onOpen={openComputer}
          onRefresh={() => computersQuery.refetch()}
          refreshing={computersQuery.isFetching}
          onCreate={startCreateComputer}
          creating={createComputer.isPending}
          error={createComputer.error?.message ?? null}
        />
      )}
    </div>
  )
}
