import {
  Button,
  Card,
  CardContent,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@shadowob/ui'
import { CloudComputerShell } from '@web/components/cloud-computer-shell'
import {
  Bell,
  Cable,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Download,
  ExternalLink,
  FolderOpen,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { pinyin } from 'pinyin-pro'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ConnectorBuddyCreateInput,
  ConnectorConnection,
  ConnectorDaemonState,
  ConnectorRuntimeInfo,
  ConnectorRuntimeInstanceInfo,
  ConnectorRuntimeSessionInfo,
  ConnectorRuntimeSessionSnapshot,
  DesktopRuntimeSettings,
  DesktopShortcutAction,
  DesktopShortcutSettings,
  TtsProvider,
  UpdateChannel,
  VoiceEngineStatus,
} from '../desktop-settings-types'
import { displayShortcut, shortcutActions } from '../desktop-settings-utils'

type UpdateInfo = {
  hasUpdate: boolean
  version: string
  downloadUrl: string
  releaseNotes: string
  channel: UpdateChannel
}

type RuntimeMonitorTone = 'ready' | 'limited' | 'missing' | 'idle' | 'error'

type RuntimeMonitorSummary = {
  tone: RuntimeMonitorTone
  statusKey: string
  detailKey: string
  instance: ConnectorRuntimeInstanceInfo | null
  sessions: ConnectorRuntimeSessionInfo[]
  latestSession: ConnectorRuntimeSessionInfo | null
}

type ConnectorConnectionDeleteOptions = {
  deleteCloudBuddy?: boolean
}

const DESKTOP_RUNTIME_ICON_SOURCES: Record<string, string> = {
  openclaw: new URL(
    '../../../../web/src/assets/runtime-icons/openclaw.svg',
    import.meta.url,
  ).toString(),
  hermes: new URL(
    '../../../../web/src/assets/runtime-icons/hermes-agent.png',
    import.meta.url,
  ).toString(),
  'claude-code': new URL(
    '../../../../web/src/assets/runtime-icons/claude-code.svg',
    import.meta.url,
  ).toString(),
  codex: new URL('../../../../web/src/assets/runtime-icons/codex.svg', import.meta.url).toString(),
  opencode: new URL(
    '../../../../web/src/assets/runtime-icons/opencode.svg',
    import.meta.url,
  ).toString(),
  cursor: new URL(
    '../../../../web/src/assets/runtime-icons/cursor.svg',
    import.meta.url,
  ).toString(),
  kimi: new URL('../../../../web/src/assets/runtime-icons/kimi.png', import.meta.url).toString(),
  copilot: new URL(
    '../../../../web/src/assets/runtime-icons/copilot.svg',
    import.meta.url,
  ).toString(),
  antigravity: new URL(
    '../../../../web/src/assets/runtime-icons/antigravity.png',
    import.meta.url,
  ).toString(),
  'cc-connect': new URL(
    '../../../../web/src/assets/runtime-icons/cc-connect.svg',
    import.meta.url,
  ).toString(),
}

function RuntimeIcon({
  runtime,
  className,
}: {
  runtime: ConnectorRuntimeInfo
  className?: string
}) {
  const src = DESKTOP_RUNTIME_ICON_SOURCES[runtime.iconId ?? runtime.id]
  if (src) {
    return <img src={src} alt="" aria-hidden="true" className={cn('object-contain', className)} />
  }
  return <Cable aria-hidden="true" className={cn('text-current', className)} />
}

function summarizeRuntimeMonitor(
  runtime: ConnectorRuntimeInfo,
  snapshot: ConnectorRuntimeSessionSnapshot | null,
): RuntimeMonitorSummary {
  const sessions =
    snapshot?.sessions
      .filter((session) => session.runtimeId === runtime.id)
      .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')) ?? []
  const instances =
    snapshot?.instances.filter((instance) => instance.runtimeId === runtime.id) ?? []
  const instance =
    instances.find((item) => item.status === 'running') ??
    instances.find((item) => item.status === 'available') ??
    instances[0] ??
    null

  if (runtime.status !== 'available') {
    return {
      tone: 'missing',
      statusKey: 'desktop.runtimeStatusInstallFirst',
      detailKey: 'desktop.runtimeStatusInstallFirstDetail',
      instance,
      sessions,
      latestSession: sessions[0] ?? null,
    }
  }

  if (!snapshot) {
    return {
      tone: 'idle',
      statusKey: 'desktop.runtimeStatusNotScanned',
      detailKey: 'desktop.runtimeStatusNotScannedDetail',
      instance,
      sessions,
      latestSession: sessions[0] ?? null,
    }
  }

  if (!instance) {
    return {
      tone: 'ready',
      statusKey: 'desktop.runtimeStatusConnectReady',
      detailKey: 'desktop.runtimeStatusConnectReadyDetail',
      instance,
      sessions,
      latestSession: sessions[0] ?? null,
    }
  }

  if (instance.status === 'error') {
    return {
      tone: 'error',
      statusKey: 'desktop.runtimeStatusNeedsSetup',
      detailKey: 'desktop.runtimeStatusNeedsSetupDetail',
      instance,
      sessions,
      latestSession: sessions[0] ?? null,
    }
  }

  const canListSessions = instance.capabilities.includes('sessionList')
  const canWatchLive =
    instance.status === 'running' &&
    (instance.capabilities.includes('liveWatch') || instance.capabilities.includes('processWatch'))

  if (canWatchLive) {
    return {
      tone: 'ready',
      statusKey: 'desktop.runtimeStatusReady',
      detailKey: 'desktop.runtimeStatusReadyDetail',
      instance,
      sessions,
      latestSession: sessions[0] ?? null,
    }
  }

  if (canListSessions || sessions.length > 0) {
    return {
      tone: 'limited',
      statusKey: 'desktop.runtimeStatusActivity',
      detailKey: 'desktop.runtimeStatusActivityDetail',
      instance,
      sessions,
      latestSession: sessions[0] ?? null,
    }
  }

  return {
    tone: 'ready',
    statusKey: 'desktop.runtimeStatusConnectReady',
    detailKey: 'desktop.runtimeStatusConnectReadyDetail',
    instance,
    sessions,
    latestSession: sessions[0] ?? null,
  }
}

function buddyUsernameFromName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\u3400-\u9fff]+/g, (chunk) =>
      pinyin(chunk, { toneType: 'none', separator: '_', v: true }),
    )
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
  return normalized.length >= 2 ? normalized : 'buddy'
}

function SettingsCard({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card variant="glassCard" className={cn('p-0', className)}>
      <CardContent className={cn('space-y-5 p-5', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export function GeneralSettingsPanel({
  openAtLogin,
  connectorAutoStart,
  autoCheckOnLaunch,
  installedRuntimeCount,
  runtimeCount,
  connectorRunning,
  connectorStatusCopy,
  onOpenAtLoginToggle,
  onConnectorAutoStartToggle,
  onAutoCheckToggle,
}: {
  openAtLogin: boolean
  connectorAutoStart: boolean
  autoCheckOnLaunch: boolean
  installedRuntimeCount: number
  runtimeCount: number
  connectorRunning: boolean
  connectorStatusCopy: string
  onOpenAtLoginToggle: (enabled: boolean) => void
  onConnectorAutoStartToggle: (enabled: boolean) => void
  onAutoCheckToggle: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const connectorStatusClass = connectorRunning
    ? 'border-success/30 bg-success/10 text-success'
    : 'border-border-subtle bg-bg-primary/45 text-text-secondary'

  return (
    <>
      <SettingsCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{t('desktop.openAtLogin')}</p>
            <p className="mt-0.5 text-xs text-text-muted">{t('desktop.openAtLoginDesc')}</p>
          </div>
          <Switch checked={openAtLogin} onCheckedChange={onOpenAtLoginToggle} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{t('desktop.connectorAutoStart')}</p>
            <p className="mt-0.5 text-xs text-text-muted">{t('desktop.connectorAutoStartDesc')}</p>
          </div>
          <Switch checked={connectorAutoStart} onCheckedChange={onConnectorAutoStartToggle} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{t('desktop.autoCheckOnLaunch')}</p>
            <p className="mt-0.5 text-xs text-text-muted">{t('desktop.autoCheckOnLaunchDesc')}</p>
          </div>
          <Switch checked={autoCheckOnLaunch} onCheckedChange={onAutoCheckToggle} />
        </div>
      </SettingsCard>
      <SettingsCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('desktop.connectorTitle')}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {t('desktop.connectorSummary', {
                count: installedRuntimeCount,
                total: runtimeCount,
              })}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold',
              connectorStatusClass,
            )}
          >
            {connectorRunning ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
            {connectorStatusCopy}
          </span>
        </div>
      </SettingsCard>
    </>
  )
}

export function ConnectorSettingsPanel({
  connectorRunning,
  connectorRunningToggleChecked,
  connectorBusy,
  connectorToggleBusy,
  connectorStatusCopy,
  connectorProgressVisible,
  connectorProgressValue,
  connectorPhaseCopy,
  connectorState,
  connectorError,
  connectorNotice,
  connectorConnections,
  highlightedConnectionId,
  connectorConnectionBusyId,
  connectorConnectionErrors,
  connectionWorkDirs,
  connectorRuntimeNotifications,
  runtimes,
  runtimeSessions,
  runtimeScanBusy,
  runtimeInstallBusyIds,
  runtimeInstallErrorIds,
  runtimeNotificationBusyIds,
  openExternal,
  onOpenShadow,
  onOpenBuddyDm,
  onConnectorRunningToggle,
  onConnectorConnectionToggle,
  onConnectorConnectionDelete,
  onChooseConnectionWorkDir,
  onScanRuntimes,
  onInstallRuntime,
  onRuntimeNotificationToggle,
  onCreateConnectorBuddy,
}: {
  connectorRunning: boolean
  connectorRunningToggleChecked: boolean
  connectorBusy: boolean
  connectorToggleBusy: boolean
  connectorStatusCopy: string
  connectorProgressVisible: boolean
  connectorProgressValue: number
  connectorPhaseCopy: string
  connectorState: ConnectorDaemonState | null
  connectorError: string
  connectorNotice: string
  connectorConnections: ConnectorConnection[]
  highlightedConnectionId: string | null
  connectorConnectionBusyId: string | null
  connectorConnectionErrors: Record<string, string>
  connectionWorkDirs: Record<string, string>
  connectorRuntimeNotifications: Record<string, boolean>
  runtimes: ConnectorRuntimeInfo[]
  runtimeSessions: ConnectorRuntimeSessionSnapshot | null
  runtimeScanBusy: boolean
  runtimeInstallBusyIds: string[]
  runtimeInstallErrorIds: string[]
  runtimeNotificationBusyIds: string[]
  openExternal?: (url: string) => Promise<boolean>
  onOpenShadow: () => void
  onOpenBuddyDm: (connection: ConnectorConnection) => void
  onConnectorRunningToggle: (enabled: boolean) => void
  onConnectorConnectionToggle: (connection: ConnectorConnection, enabled: boolean) => void
  onConnectorConnectionDelete: (
    connection: ConnectorConnection,
    options?: ConnectorConnectionDeleteOptions,
  ) => void
  onChooseConnectionWorkDir: (connection: ConnectorConnection) => void
  onScanRuntimes: () => void
  onInstallRuntime: (runtime: ConnectorRuntimeInfo) => void
  onRuntimeNotificationToggle: (runtime: ConnectorRuntimeInfo, enabled: boolean) => void
  onCreateConnectorBuddy: (
    runtime: ConnectorRuntimeInfo,
    input: ConnectorBuddyCreateInput,
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const [createRuntime, setCreateRuntime] = useState<ConnectorRuntimeInfo | null>(null)
  const [buddyName, setBuddyName] = useState('')
  const [buddyNameEdited, setBuddyNameEdited] = useState(false)
  const [buddyDescription, setBuddyDescription] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ConnectorConnection | null>(null)
  const [deleteCloudBuddy, setDeleteCloudBuddy] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [connectorView, setConnectorView] = useState<'buddies' | 'runtimes'>('buddies')
  const connectorActionBusy = connectorBusy || connectorToggleBusy
  const connectionRefs = useRef(new Map<string, HTMLElement>())
  const availableRuntimes = runtimes.filter((runtime) => runtime.status === 'available')
  const firstAvailableRuntime = availableRuntimes[0] ?? null
  const currentComputerName =
    connectorConnections.find((connection) => connection.computerName)?.computerName ||
    t('desktop.connectorThisComputer')
  const currentComputerDisplayName =
    currentComputerName.split(/\s+\/\s+/)[0]?.trim() || currentComputerName
  const selectedConnection =
    connectorConnections.find((connection) => connection.agentId === selectedConnectionId) ??
    connectorConnections[0] ??
    null
  const selectedConnectionRunning = Boolean(
    selectedConnection && connectorRunning && selectedConnection.status === 'running',
  )
  const selectedConnectionBusy = Boolean(
    selectedConnection && connectorConnectionBusyId === selectedConnection.agentId,
  )
  const selectedConnectionWorkDir = selectedConnection
    ? (connectionWorkDirs[selectedConnection.agentId] ?? selectedConnection.workDir)
    : ''
  const selectedConnectionRuntime = selectedConnection
    ? (runtimes.find((runtime) => runtime.id === selectedConnection.runtimeId) ?? {
        id: selectedConnection.runtimeId,
        label: selectedConnection.runtimeLabel,
        kind: 'cli',
        status: 'available',
        iconId: selectedConnection.runtimeId,
      })
    : null
  const openCreateBuddy = (runtime: ConnectorRuntimeInfo | null) => {
    if (!runtime) return
    const defaultName = t('desktop.connectorDefaultBuddyName', { runtime: runtime.label })
    setCreateRuntime(runtime)
    setBuddyName(defaultName)
    setBuddyNameEdited(false)
    setBuddyDescription('')
    setCreateError('')
  }
  const selectCreateRuntime = (runtimeId: string) => {
    const runtime = availableRuntimes.find((candidate) => candidate.id === runtimeId)
    if (!runtime) return
    setCreateRuntime(runtime)
    if (!buddyNameEdited) {
      setBuddyName(t('desktop.connectorDefaultBuddyName', { runtime: runtime.label }))
    }
  }
  const closeCreateBuddy = () => {
    if (createBusy) return
    setCreateRuntime(null)
    setCreateError('')
  }
  const openDeleteConnection = (connection: ConnectorConnection) => {
    if (connectorConnectionBusyId || connectorActionBusy) return
    setDeleteTarget(connection)
    setDeleteCloudBuddy(false)
  }
  const closeDeleteConnection = () => {
    if (deleteTarget && connectorConnectionBusyId === deleteTarget.agentId) return
    setDeleteTarget(null)
    setDeleteCloudBuddy(false)
  }
  const confirmDeleteConnection = () => {
    if (!deleteTarget) return
    onConnectorConnectionDelete(deleteTarget, { deleteCloudBuddy })
    setDeleteTarget(null)
    setDeleteCloudBuddy(false)
  }
  const submitCreateBuddy = async () => {
    if (!createRuntime || createBusy) return
    setCreateBusy(true)
    setCreateError('')
    try {
      await onCreateConnectorBuddy(createRuntime, {
        runtimeId: createRuntime.id,
        name: buddyName.trim(),
        username: buddyUsernameFromName(buddyName),
        description: buddyDescription.trim() || undefined,
      })
      setCreateRuntime(null)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    } finally {
      setCreateBusy(false)
    }
  }

  useEffect(() => {
    if (!highlightedConnectionId) return
    setSelectedConnectionId(highlightedConnectionId)
    const node = connectionRefs.current.get(highlightedConnectionId)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedConnectionId, connectorConnections.length])

  useEffect(() => {
    if (!createRuntime && !deleteTarget) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (deleteTarget) closeDeleteConnection()
      else closeCreateBuddy()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createRuntime, deleteTarget, closeCreateBuddy, closeDeleteConnection])

  return (
    <>
      <div className="grid h-full min-h-[360px] grid-rows-[82px_minmax(0,1fr)] gap-3">
        <section className="relative flex min-w-0 items-center overflow-visible rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_12%_40%,rgba(34,211,238,0.18),transparent_26%),linear-gradient(110deg,#15212b_0%,#10161e_42%,#0c1016_100%)] px-3.5 shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-8 -top-14 h-32 w-32 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative grid w-[72px] shrink-0 place-items-center">
            <CloudComputerShell
              color="aqua"
              status={connectorRunning ? 'ready' : 'paused'}
              size="sm"
              label={currentComputerDisplayName}
            />
          </div>
          <div className="relative min-w-0 flex-1 pl-1">
            <h2
              className="truncate text-sm font-bold text-text-primary"
              title={currentComputerName}
            >
              {currentComputerDisplayName}
            </h2>
            <span
              className="mt-1 inline-flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-text-muted"
              title={connectorNotice || connectorStatusCopy}
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  connectorRunning
                    ? 'bg-success shadow-[0_0_9px_rgba(52,211,153,0.75)]'
                    : 'bg-text-muted',
                )}
              />
              <span className="truncate">{connectorStatusCopy}</span>
            </span>
          </div>
          <label className="relative ml-3 flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-2xl bg-white/[0.075] px-3 transition hover:bg-white/[0.1]">
            <span className="hidden text-[10px] font-bold text-text-secondary min-[700px]:inline">
              {t('desktop.connectorRemoteAccessShort')}
            </span>
            <Switch
              checked={connectorRunningToggleChecked}
              disabled={connectorBusy}
              onCheckedChange={onConnectorRunningToggle}
              aria-label={t('desktop.connectorRemoteAccess')}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={ExternalLink}
            onClick={onOpenShadow}
            aria-label={t('desktop.connectorOpenShadow')}
            title={t('desktop.connectorOpenShadow')}
            className="relative ml-2 h-10 shrink-0 rounded-2xl bg-black/15 px-3 text-[10px] hover:bg-black/25"
          >
            <span className="hidden normal-case tracking-normal min-[700px]:inline">
              {t('common.open')}
            </span>
          </Button>

          {connectorError ||
          connectorState?.lastError ||
          (connectorState && !connectorState.connectorPath) ? (
            <details className="group relative ml-1 shrink-0">
              <summary
                className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full text-warning transition hover:bg-warning/10 [&::-webkit-details-marker]:hidden"
                title={t('desktop.connectorDiagnosticsTitle')}
              >
                <CircleAlert size={14} />
              </summary>
              <div className="absolute right-0 top-10 z-30 grid w-72 gap-2 rounded-2xl border border-white/10 bg-[#171a21]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                <strong className="text-xs text-text-primary">
                  {t('desktop.connectorDiagnosticsTitle')}
                </strong>
                {connectorState && !connectorState.connectorPath ? (
                  <div className="rounded-xl bg-warning/10 px-2.5 py-2 text-[10px] font-semibold text-warning">
                    {t('desktop.connectorMissingBundle')}
                  </div>
                ) : null}
                {connectorError || connectorState?.lastError ? (
                  <div className="max-h-28 overflow-y-auto break-words rounded-xl bg-danger/10 px-2.5 py-2 text-[10px] font-semibold leading-4 text-danger">
                    {connectorError || connectorState?.lastError}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}

          {connectorProgressVisible ? (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${connectorProgressValue}%` }}
                title={`${connectorPhaseCopy} · ${connectorProgressValue}%`}
              />
            </div>
          ) : null}
        </section>

        {connectorView === 'buddies' ? (
          <section className="grid min-h-0 overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#11151c] shadow-[0_16px_40px_rgba(0,0,0,0.2)] min-[680px]:grid-cols-[238px_minmax(0,1fr)]">
            <aside className="flex min-h-[190px] flex-col border-b border-white/[0.07] p-3.5 min-[680px]:min-h-0 min-[680px]:border-b-0 min-[680px]:border-r">
              <div className="flex h-8 shrink-0 items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-text-primary">
                  {t('desktop.connectorBuddyLabel')}
                </h3>
                <Button
                  type="button"
                  onClick={() => openCreateBuddy(firstAvailableRuntime)}
                  disabled={connectorActionBusy || !firstAvailableRuntime}
                  variant="ghost"
                  size="icon"
                  icon={UserPlus}
                  loading={connectorActionBusy && !connectorRunning}
                  aria-label={t('desktop.connectorAddBuddy')}
                  title={t('desktop.connectorAddBuddy')}
                  className="h-8 w-8 shrink-0 rounded-full text-primary"
                />
              </div>

              {connectorConnections.length ? (
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto py-2">
                  {connectorConnections.map((connection) => {
                    const connectionRunning = connectorRunning && connection.status === 'running'
                    const connectionErrored = connectorRunning && connection.status === 'error'
                    const connectionRuntime: ConnectorRuntimeInfo = runtimes.find(
                      (runtime) => runtime.id === connection.runtimeId,
                    ) ?? {
                      id: connection.runtimeId,
                      label: connection.runtimeLabel,
                      kind: 'cli',
                      status: 'available',
                      iconId: connection.runtimeId,
                    }
                    const selected = selectedConnection?.agentId === connection.agentId
                    return (
                      <article
                        key={connection.agentId}
                        ref={(node) => {
                          if (node) connectionRefs.current.set(connection.agentId, node)
                          else connectionRefs.current.delete(connection.agentId)
                        }}
                        className="h-[62px] w-full shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedConnectionId(connection.agentId)}
                          className={cn(
                            'flex h-full w-full items-center gap-2.5 rounded-2xl px-2.5 text-left transition',
                            selected
                              ? 'bg-white/[0.09] shadow-inner shadow-white/[0.03]'
                              : 'hover:bg-white/[0.05]',
                          )}
                        >
                          <span className="relative grid h-10 w-10 shrink-0 overflow-hidden rounded-[15px] bg-white/5">
                            {connection.avatarUrl ? (
                              <img
                                src={connection.avatarUrl}
                                alt=""
                                aria-hidden="true"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-xs font-black text-primary">
                                {(connection.displayName || connection.username || connection.label)
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </span>
                            )}
                            <span
                              className={cn(
                                'absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#11151c]',
                                connectionRunning
                                  ? 'bg-success'
                                  : connectionErrored
                                    ? 'bg-danger'
                                    : 'bg-text-muted',
                              )}
                              title={connectorConnectionErrors[connection.agentId]}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-text-primary">
                              {connection.displayName || connection.label}
                            </span>
                            <span className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-text-muted">
                              <RuntimeIcon
                                runtime={connectionRuntime}
                                className="h-3.5 w-3.5 shrink-0"
                              />
                              <span className="truncate">{connection.runtimeLabel}</span>
                            </span>
                          </span>
                        </button>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center py-5">
                  <Button
                    type="button"
                    onClick={() => openCreateBuddy(firstAvailableRuntime)}
                    disabled={connectorActionBusy || !firstAvailableRuntime}
                    variant="ghost"
                    size="sm"
                    icon={UserPlus}
                    loading={connectorActionBusy && !connectorRunning}
                    className="h-9 rounded-full bg-primary/10 px-4 text-primary hover:bg-primary/15"
                  >
                    {t('desktop.connectorAddBuddy')}
                  </Button>
                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Settings2}
                onClick={() => setConnectorView('runtimes')}
                className="h-9 shrink-0 justify-start rounded-xl px-2.5 text-[11px] font-semibold normal-case tracking-normal text-text-muted hover:text-text-primary"
              >
                {t('desktop.connectorManageCodingTools')}
              </Button>
            </aside>

            <div className="flex min-h-[280px] min-w-0 flex-col">
              {selectedConnection && selectedConnectionRuntime ? (
                <>
                  <div className="flex min-w-0 items-center gap-3 px-4 py-3">
                    <span className="relative grid h-12 w-12 shrink-0 overflow-hidden rounded-[17px] bg-white/[0.06]">
                      {selectedConnection.avatarUrl ? (
                        <img
                          src={selectedConnection.avatarUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-lg font-black text-primary">
                          {(
                            selectedConnection.displayName ||
                            selectedConnection.username ||
                            selectedConnection.label
                          )
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                      )}
                      <span
                        className={cn(
                          'absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-[#11151c]',
                          selectedConnectionRunning ? 'bg-success' : 'bg-text-muted',
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold text-text-primary">
                        {selectedConnection.displayName || selectedConnection.label}
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                        <RuntimeIcon
                          runtime={selectedConnectionRuntime}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="truncate">{selectedConnection.runtimeLabel}</span>
                      </span>
                      {connectorConnectionErrors[selectedConnection.agentId] ? (
                        <span className="mt-1 block truncate text-[10px] font-semibold text-danger">
                          {connectorConnectionErrors[selectedConnection.agentId]}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      icon={MessageCircle}
                      disabled={selectedConnectionBusy || connectorActionBusy}
                      onClick={() => onOpenBuddyDm(selectedConnection)}
                      className="h-9 shrink-0 rounded-full px-3 font-semibold normal-case tracking-normal"
                    >
                      {t('desktop.connectorMessageBuddy')}
                    </Button>
                  </div>

                  <div className="flex min-w-0 items-center gap-3 border-t border-white/[0.07] px-4 py-3">
                    <FolderOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-text-primary">
                        {t('desktop.connectorConnectionWorkDir')}
                      </span>
                      <span
                        className="mt-1 block truncate text-[11px] text-text-secondary"
                        title={selectedConnectionWorkDir}
                      >
                        {selectedConnectionWorkDir ||
                          t('desktop.connectorConnectionWorkDirPlaceholder')}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={selectedConnectionBusy || connectorActionBusy || !connectorRunning}
                      onClick={() => onChooseConnectionWorkDir(selectedConnection)}
                      className="h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold normal-case tracking-normal"
                    >
                      {selectedConnectionWorkDir
                        ? t('desktop.changeFolder')
                        : t('desktop.chooseFolder')}
                    </Button>
                  </div>

                  <label className="flex min-w-0 items-center gap-3 border-t border-white/[0.07] px-4 py-3">
                    <Cable className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-text-primary">
                        {t('desktop.connectorBuddyRemoteTasks')}
                      </span>
                    </span>
                    <Switch
                      checked={selectedConnectionRunning}
                      onCheckedChange={(checked) =>
                        onConnectorConnectionToggle(selectedConnection, checked)
                      }
                      disabled={selectedConnectionBusy || connectorActionBusy || !connectorRunning}
                      aria-label={t('desktop.connectorBuddyAvailability', {
                        name: selectedConnection.displayName || selectedConnection.label,
                      })}
                    />
                  </label>

                  <div className="mt-auto flex justify-end border-t border-white/[0.07] px-4 py-2.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      disabled={selectedConnectionBusy || connectorActionBusy || !connectorRunning}
                      onClick={() => openDeleteConnection(selectedConnection)}
                      className="h-8 rounded-full px-3 text-[11px] font-semibold normal-case tracking-normal text-text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      {t('desktop.connectorConnectionDelete')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
                  <div>
                    <p className="text-sm font-black text-text-primary">
                      {t('desktop.connectorNoConnections')}
                    </p>
                    <Button
                      type="button"
                      onClick={() => openCreateBuddy(firstAvailableRuntime)}
                      disabled={connectorActionBusy || !firstAvailableRuntime}
                      size="sm"
                      icon={UserPlus}
                      className="mt-4 rounded-full"
                    >
                      {t('desktop.connectorAddBuddy')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#11151c] px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
            <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] pb-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                icon={ChevronLeft}
                onClick={() => setConnectorView('buddies')}
                aria-label={t('common.back')}
                title={t('common.back')}
                className="h-9 w-9 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black text-text-primary">
                  {t('desktop.connectorManageCodingTools')}
                </h3>
                <p className="mt-0.5 truncate text-[10px] text-text-muted">
                  {t('desktop.connectorManageCodingToolsDesc')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                loading={runtimeScanBusy}
                disabled={runtimeScanBusy}
                onClick={onScanRuntimes}
                className="h-9 shrink-0 rounded-full px-3"
              >
                {t('desktop.runtimeScan')}
              </Button>
            </div>

            {runtimes.length ? (
              <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto py-3 min-[620px]:grid-cols-2">
                {runtimes.map((runtime) => {
                  const installed = runtime.status === 'available'
                  const busy = runtimeInstallBusyIds.includes(runtime.id)
                  const installErrored = runtimeInstallErrorIds.includes(runtime.id)
                  const notificationBusy = runtimeNotificationBusyIds.includes(runtime.id)
                  const monitor = summarizeRuntimeMonitor(runtime, runtimeSessions)
                  return (
                    <article
                      key={runtime.id}
                      className={cn(
                        'flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3',
                        installErrored && 'desktop-settings-error-shake border-danger/30',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-black/20">
                          <RuntimeIcon runtime={runtime} className="h-8 w-8" />
                          <span
                            className={cn(
                              'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#151921]',
                              !installed
                                ? 'bg-text-muted'
                                : monitor.tone === 'error'
                                  ? 'bg-danger'
                                  : monitor.tone === 'ready'
                                    ? 'bg-success'
                                    : 'bg-primary',
                            )}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-black text-text-primary">
                            {runtime.label}
                          </span>
                          <span className="mt-1 block truncate text-[10px] text-text-muted">
                            {installed ? t(monitor.statusKey) : t('desktop.runtimeMissing')}
                          </span>
                        </span>
                      </div>

                      <div className="mt-3 flex min-h-9 items-center justify-end gap-2 border-t border-white/[0.06] pt-2.5">
                        {installed ? (
                          <>
                            <label className="mr-auto inline-flex min-w-0 items-center gap-2 text-[10px] font-semibold text-text-secondary">
                              {notificationBusy ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <Bell size={12} />
                              )}
                              <span className="truncate">{t('desktop.runtimeNotify')}</span>
                              <Switch
                                checked={connectorRuntimeNotifications[runtime.id] !== false}
                                disabled={connectorActionBusy || notificationBusy}
                                onCheckedChange={(checked) =>
                                  onRuntimeNotificationToggle(runtime, checked)
                                }
                                aria-label={t('desktop.runtimeNotify')}
                              />
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={UserPlus}
                              disabled={connectorActionBusy}
                              onClick={() => openCreateBuddy(runtime)}
                              className="h-8 shrink-0 rounded-full bg-primary/10 px-3 text-[10px] text-primary hover:bg-primary/15"
                            >
                              {t('desktop.connectorAddBuddy')}
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={runtime.installCommand ? Download : ExternalLink}
                            loading={busy}
                            disabled={
                              busy ||
                              connectorActionBusy ||
                              (!runtime.installCommand && !runtime.helpUrl)
                            }
                            onClick={() => {
                              if (runtime.installCommand) onInstallRuntime(runtime)
                              else if (runtime.helpUrl) void openExternal?.(runtime.helpUrl)
                            }}
                            className="h-8 rounded-full px-3 text-[10px]"
                          >
                            {runtime.installCommand
                              ? t('desktop.runtimeInstall')
                              : t('desktop.runtimeHelp')}
                          </Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={RefreshCw}
                  loading={runtimeScanBusy}
                  disabled={runtimeScanBusy}
                  onClick={onScanRuntimes}
                  className="h-9 rounded-full px-4"
                >
                  {t('desktop.runtimeScan')}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 px-4"
          data-no-drag
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteConnection()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="connector-delete-connection-title"
            className="w-full max-w-[460px] overflow-hidden rounded-[18px] border border-white/10 bg-[#101215] shadow-[0_24px_80px_rgba(0,0,0,0.72)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
              <div className="min-w-0">
                <p id="connector-delete-connection-title" className="text-base font-semibold">
                  {t('desktop.connectorDeleteLocalTitle')}
                </p>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {t('desktop.connectorDeleteLocalDesc', {
                    name: deleteTarget.displayName || deleteTarget.label,
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                icon={X}
                aria-label={t('common.cancel')}
                onClick={closeDeleteConnection}
              />
            </div>

            <div className="grid gap-3 px-5 py-4">
              <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-primary/35 p-3">
                <input
                  type="checkbox"
                  checked={deleteCloudBuddy}
                  onChange={(event) => setDeleteCloudBuddy(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    {t('desktop.connectorDeleteCloudBuddy')}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-text-muted">
                    {t('desktop.connectorDeleteCloudBuddyDesc')}
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-black/20 px-5 py-4">
              <Button type="button" variant="ghost" onClick={closeDeleteConnection}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant={deleteCloudBuddy ? 'danger' : 'primary'}
                icon={Trash2}
                disabled={connectorConnectionBusyId === deleteTarget.agentId}
                loading={connectorConnectionBusyId === deleteTarget.agentId}
                onClick={confirmDeleteConnection}
              >
                {deleteCloudBuddy
                  ? t('desktop.connectorDeleteConfirmCloud')
                  : t('desktop.connectorDeleteConfirmLocal')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {createRuntime ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 px-4 backdrop-blur-[2px]"
          data-no-drag
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateBuddy()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="connector-create-buddy-title"
            className="flex max-h-[calc(100vh-24px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#101215] shadow-[0_24px_90px_rgba(0,0,0,0.78)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
              <div className="min-w-0">
                <p id="connector-create-buddy-title" className="text-base font-semibold">
                  {t('desktop.connectorCreateBuddy')}
                </p>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {t('desktop.connectorCreateBuddyDesc', { runtime: createRuntime.label })}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                icon={X}
                onClick={closeCreateBuddy}
              />
            </div>

            <div className="grid min-h-0 gap-3 overflow-y-auto px-5 py-4">
              <div className="grid gap-1.5">
                <span className="text-sm font-medium text-text-secondary">
                  {t('desktop.connectorBuddyRuntime')}
                </span>
                <Select value={createRuntime.id} onValueChange={selectCreateRuntime}>
                  <SelectTrigger
                    aria-label={t('desktop.connectorBuddyRuntime')}
                    className="h-12 rounded-xl border-white/10 bg-black/25 px-3 normal-case tracking-normal"
                  >
                    <SelectValue>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <RuntimeIcon runtime={createRuntime} className="h-7 w-7 shrink-0" />
                        <span className="truncate text-sm font-bold">{createRuntime.label}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="z-[70] border-white/10 bg-[#171a21]/98">
                    {availableRuntimes.map((runtime) => (
                      <SelectItem
                        key={runtime.id}
                        value={runtime.id}
                        className="normal-case tracking-normal"
                      >
                        <span className="flex min-w-0 items-center gap-2.5 pr-6">
                          <RuntimeIcon runtime={runtime} className="h-6 w-6 shrink-0" />
                          <span className="truncate">{runtime.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label={t('desktop.connectorBuddyName')}
                value={buddyName}
                onChange={(event) => {
                  setBuddyNameEdited(true)
                  setBuddyName(event.target.value)
                }}
                placeholder={t('desktop.connectorBuddyNamePlaceholder')}
              />
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-text-secondary">
                  {t('desktop.connectorBuddyDescription')}
                </span>
                <textarea
                  value={buddyDescription}
                  onChange={(event) => setBuddyDescription(event.target.value.slice(0, 500))}
                  placeholder={t('desktop.connectorBuddyDescriptionPlaceholder')}
                  className="min-h-24 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/60"
                />
              </label>
              {createError ? (
                <div className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
                  {createError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-black/20 px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={closeCreateBuddy}
                disabled={createBusy}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                icon={UserPlus}
                loading={createBusy}
                disabled={createBusy || buddyName.trim().length === 0}
                onClick={() => void submitCreateBuddy()}
              >
                {t('desktop.connectorCreateBuddySubmit')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function ShortcutsSettingsPanel({
  platform,
  shortcuts,
  recordingShortcut,
  shortcutRegistrationError,
  onRecordingShortcut,
  onClearShortcut,
}: {
  platform?: string
  shortcuts: DesktopShortcutSettings
  recordingShortcut: DesktopShortcutAction | null
  shortcutRegistrationError: string
  onRecordingShortcut: (action: DesktopShortcutAction | null) => void
  onClearShortcut: (action: DesktopShortcutAction) => void
}) {
  const { t } = useTranslation()

  return (
    <SettingsCard>
      <div>
        <p className="text-base font-semibold">{t('desktop.shortcutsTitle')}</p>
        <p className="mt-1 text-sm leading-6 text-text-muted">{t('desktop.shortcutsDesc')}</p>
        {shortcutRegistrationError ? (
          <p className="mt-2 text-xs text-warning">{shortcutRegistrationError}</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        {shortcutActions.map((action) => {
          const recording = recordingShortcut === action
          return (
            <div
              key={action}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-primary/35 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t(`desktop.shortcut_${action}`)}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {t(`desktop.shortcut_${action}_desc`)}
                </p>
              </div>
              <div className="flex min-w-[190px] items-center justify-end gap-2">
                <button
                  type="button"
                  data-no-drag
                  className={cn(
                    'min-w-[150px] rounded-lg border px-3 py-2 text-center font-mono text-sm transition',
                    recording
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border-subtle bg-black/35 text-text-primary hover:bg-white/8',
                  )}
                  onClick={() => onRecordingShortcut(recording ? null : action)}
                >
                  {recording
                    ? t('desktop.shortcutRecording')
                    : shortcuts[action]
                      ? displayShortcut(shortcuts[action], platform)
                      : t('desktop.shortcutUnassigned')}
                </button>
                <button
                  type="button"
                  data-no-drag
                  aria-label={t('desktop.shortcutClear')}
                  title={t('desktop.shortcutClear')}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-black/25 text-text-muted transition hover:bg-white/8 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!shortcuts[action] || recording}
                  onClick={() => onClearShortcut(action)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </SettingsCard>
  )
}

export function VoiceSettingsPanel({
  ttsProvider,
  asrProvider,
  voiceStatus,
  voiceError,
  voiceInstallBusyProvider,
  onSelectTtsProvider,
  onSelectAsrProvider,
  onInstallTtsProvider,
}: {
  ttsProvider: TtsProvider
  asrProvider: DesktopRuntimeSettings['asrProvider']
  voiceStatus: VoiceEngineStatus | null
  voiceError: string
  voiceInstallBusyProvider: TtsProvider | null
  onSelectTtsProvider: (provider: TtsProvider) => void
  onSelectAsrProvider: (provider: DesktopRuntimeSettings['asrProvider']) => void
  onInstallTtsProvider: (provider: TtsProvider) => void
}) {
  const { t } = useTranslation()

  return (
    <SettingsCard>
      <div>
        <p className="text-base font-semibold">{t('desktop.voiceTitle')}</p>
        <p className="mt-1 text-sm leading-6 text-text-muted">{t('desktop.voiceDesc')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-text-muted">
            {t('desktop.ttsProvider')}
          </p>
          {(['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2'] as const).map((provider) => (
            <div
              key={provider}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
                ttsProvider === provider
                  ? 'border-primary/50 bg-primary/12 text-primary'
                  : 'border-border-subtle bg-bg-primary/35 text-text-secondary hover:bg-bg-primary/60',
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                disabled={provider !== 'system' && !voiceStatus?.ttsProviders[provider]?.installed}
                onClick={() => onSelectTtsProvider(provider)}
              >
                <span className="block font-semibold">{t(`desktop.ttsProvider_${provider}`)}</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {t(`desktop.ttsProvider_${provider}_desc`)}
                </span>
                {provider !== 'system' ? (
                  <span className="mt-1 block text-[11px] font-bold text-text-muted">
                    {voiceStatus?.ttsProviders[provider]?.installed
                      ? t('desktop.voiceModelInstalled')
                      : t('desktop.voiceModelNotInstalled')}
                  </span>
                ) : null}
              </button>
              {provider !== 'system' && voiceStatus?.ttsProviders[provider]?.installed !== true ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  disabled={voiceInstallBusyProvider !== null}
                  loading={voiceInstallBusyProvider === provider}
                  onClick={() => onInstallTtsProvider(provider)}
                >
                  {t('desktop.voiceModelInstall')}
                </Button>
              ) : null}
            </div>
          ))}
          {voiceError ? <p className="text-xs text-danger">{voiceError}</p> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-text-muted">
            {t('desktop.asrProvider')}
          </p>
          {(['sherpa-local', 'web-speech'] as const).map((provider) => (
            <button
              key={provider}
              type="button"
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-left text-sm transition',
                asrProvider === provider
                  ? 'border-primary/50 bg-primary/12 text-primary'
                  : 'border-border-subtle bg-bg-primary/35 text-text-secondary hover:bg-bg-primary/60',
              )}
              onClick={() => onSelectAsrProvider(provider)}
            >
              <span className="block font-semibold">{t(`desktop.asrProvider_${provider}`)}</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                {t(`desktop.asrProvider_${provider}_desc`)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </SettingsCard>
  )
}

export function NetworkSettingsPanel({
  serverBaseUrl,
  httpProxy,
  httpsProxy,
  networkSaved,
  savingNetwork,
  onServerBaseUrlChange,
  onHttpProxyChange,
  onHttpsProxyChange,
  onSaveNetwork,
}: {
  serverBaseUrl: string
  httpProxy: string
  httpsProxy: string
  networkSaved: boolean
  savingNetwork: boolean
  onServerBaseUrlChange: (value: string) => void
  onHttpProxyChange: (value: string) => void
  onHttpsProxyChange: (value: string) => void
  onSaveNetwork: () => void
}) {
  const { t } = useTranslation()

  return (
    <SettingsCard>
      <div className="grid gap-2">
        <Input
          label={t('desktop.serverBaseUrl')}
          value={serverBaseUrl}
          onChange={(event) => onServerBaseUrlChange(event.target.value)}
          placeholder="https://shadowob.com/app"
        />
        <span className="text-xs text-text-muted">{t('desktop.serverBaseUrlDesc')}</span>
      </div>

      <div className="grid gap-2">
        <Input
          label={t('desktop.httpProxy')}
          value={httpProxy}
          onChange={(event) => onHttpProxyChange(event.target.value)}
          placeholder="http://127.0.0.1:7890"
        />
        <span className="text-xs text-text-muted">{t('desktop.httpProxyDesc')}</span>
      </div>

      <div className="grid gap-2">
        <Input
          label={t('desktop.httpsProxy')}
          value={httpsProxy}
          onChange={(event) => onHttpsProxyChange(event.target.value)}
          placeholder="http://127.0.0.1:7890"
        />
        <span className="text-xs text-text-muted">{t('desktop.httpsProxyDesc')}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">
          {networkSaved ? t('desktop.networkSaved') : t('desktop.networkSaveHint')}
        </span>
        <Button
          type="button"
          onClick={onSaveNetwork}
          disabled={savingNetwork}
          size="sm"
          icon={Save}
          loading={savingNetwork}
        >
          {t('desktop.saveNetwork')}
        </Button>
      </div>
    </SettingsCard>
  )
}

export function AboutSettingsPanel({
  version,
  platformLabel,
  checking,
  updateChannel,
  updateInfo,
  onUpdateChannelChange,
  onCheckUpdate,
  onDownload,
  onRestart,
  exportingLogs,
  exportedLogPath,
  onExportLogs,
}: {
  version: string
  platformLabel: string
  checking: boolean
  updateChannel: UpdateChannel
  updateInfo: UpdateInfo | null
  onUpdateChannelChange: (channel: UpdateChannel) => void
  onCheckUpdate: () => void
  onDownload: () => void
  onRestart: () => void
  exportingLogs: boolean
  exportedLogPath: string | null
  onExportLogs: () => void
}) {
  const { t } = useTranslation()

  return (
    <SettingsCard>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-primary/35 px-4 py-3">
          <span className="text-sm text-text-secondary">{t('desktop.currentVersion')}</span>
          <span className="font-mono text-sm">v{version || '...'}</span>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-primary/35 px-4 py-3">
          <span className="text-sm text-text-secondary">{t('desktop.platform')}</span>
          <span className="text-sm">{platformLabel}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-primary/35 px-4 py-3">
        <div>
          <p className="text-sm font-medium">{t('desktop.checkUpdate')}</p>
          <p className="mt-0.5 text-xs text-text-muted">{t('desktop.checkUpdateDesc')}</p>
        </div>
        <Button
          type="button"
          onClick={onCheckUpdate}
          disabled={checking}
          size="sm"
          icon={RefreshCw}
          loading={checking}
        >
          {checking ? t('desktop.checking') : t('desktop.checkNow')}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-primary/35 px-4 py-3">
        <div>
          <p className="text-sm font-medium">{t('desktop.updateChannel')}</p>
          <p className="mt-0.5 text-xs text-text-muted">{t('desktop.updateChannelDesc')}</p>
        </div>
        <select
          value={updateChannel}
          onChange={(event) => onUpdateChannelChange(event.target.value as UpdateChannel)}
          className="h-9 rounded-lg border border-border-subtle bg-bg-secondary px-3 text-sm text-text-primary outline-none transition hover:border-primary/40 focus:border-primary"
        >
          <option value="production">{t('desktop.updateChannelProduction')}</option>
          <option value="beta">{t('desktop.updateChannelBeta')}</option>
        </select>
      </div>
      {updateInfo ? (
        <div
          className={cn(
            'rounded-xl border p-3',
            updateInfo.hasUpdate
              ? 'border-primary/25 bg-primary/10'
              : 'border-success/25 bg-success/10',
          )}
        >
          {updateInfo.hasUpdate ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t('desktop.newVersion')}: v{updateInfo.version}
              </p>
              {updateInfo.releaseNotes ? (
                <p className="text-xs text-text-secondary">{updateInfo.releaseNotes}</p>
              ) : null}
              <Button type="button" onClick={onDownload} size="sm" icon={Download}>
                {t('desktop.downloadUpdate')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-success">{t('desktop.upToDate')}</p>
          )}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-primary/35 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('desktop.exportLogs')}</p>
          <p className="mt-0.5 text-xs text-text-muted">{t('desktop.exportLogsDesc')}</p>
          {exportedLogPath ? (
            <p className="mt-1 truncate font-mono text-[11px] text-text-secondary">
              {exportedLogPath}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={onExportLogs}
          disabled={exportingLogs}
          size="sm"
          icon={Download}
          loading={exportingLogs}
        >
          {exportingLogs ? t('desktop.exportingLogs') : t('desktop.exportLogsAction')}
        </Button>
      </div>
      <Button type="button" onClick={onRestart} variant="glass" size="sm" icon={RotateCcw}>
        {t('desktop.restart')}
      </Button>
    </SettingsCard>
  )
}
