import { Button, Card, CardContent, cn, Input, Switch } from '@shadowob/ui'
import {
  Activity,
  ArrowRight,
  Bell,
  Cable,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Save,
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

function runtimeMonitorToneClass(tone: RuntimeMonitorTone): string {
  if (tone === 'ready') return 'border-success/25 bg-success/10 text-success'
  if (tone === 'limited') return 'border-primary/25 bg-primary/10 text-primary'
  if (tone === 'error') return 'border-warning/25 bg-warning/10 text-warning'
  if (tone === 'missing') return 'border-border-subtle bg-bg-primary/35 text-text-muted'
  return 'border-border-subtle bg-bg-primary/45 text-text-secondary'
}

function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card variant="glassCard" className={cn('p-0', className)}>
      <CardContent className="space-y-5 p-5">{children}</CardContent>
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
  connectorBusy,
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
  runtimesCollapsed,
  runtimeScanBusy,
  runtimeInstallBusyIds,
  runtimeInstallErrorIds,
  runtimeNotificationBusyIds,
  openExternal,
  onConnectorRunningToggle,
  onConnectorConnectionToggle,
  onConnectorConnectionDelete,
  onChooseConnectionWorkDir,
  onToggleRuntimesCollapsed,
  onScanRuntimes,
  onInstallRuntime,
  onRuntimeNotificationToggle,
  onCreateConnectorBuddy,
}: {
  connectorRunning: boolean
  connectorBusy: boolean
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
  runtimesCollapsed: boolean
  runtimeScanBusy: boolean
  runtimeInstallBusyIds: string[]
  runtimeInstallErrorIds: string[]
  runtimeNotificationBusyIds: string[]
  openExternal?: (url: string) => Promise<boolean>
  onConnectorRunningToggle: (enabled: boolean) => void
  onConnectorConnectionToggle: (connection: ConnectorConnection, enabled: boolean) => void
  onConnectorConnectionDelete: (
    connection: ConnectorConnection,
    options?: ConnectorConnectionDeleteOptions,
  ) => void
  onChooseConnectionWorkDir: (connection: ConnectorConnection) => void
  onToggleRuntimesCollapsed: () => void
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
  const [buddyUsername, setBuddyUsername] = useState('')
  const [buddyUsernameTouched, setBuddyUsernameTouched] = useState(false)
  const [buddyDescription, setBuddyDescription] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ConnectorConnection | null>(null)
  const [deleteCloudBuddy, setDeleteCloudBuddy] = useState(false)
  const connectionRefs = useRef(new Map<string, HTMLDivElement>())
  const monitorSummaries = runtimes.map((runtime) =>
    summarizeRuntimeMonitor(runtime, runtimeSessions),
  )
  const installedRuntimeCount = runtimes.filter((runtime) => runtime.status === 'available').length
  const firstAvailableRuntime = runtimes.find((runtime) => runtime.status === 'available') ?? null
  const watchableRuntimeCount = monitorSummaries.filter(
    (summary) => summary.tone === 'ready' || summary.tone === 'limited',
  ).length
  const openCreateBuddy = (runtime: ConnectorRuntimeInfo | null) => {
    if (!runtime) return
    const defaultName = runtime.label ? `${runtime.label} Buddy` : 'Local Buddy'
    setCreateRuntime(runtime)
    setBuddyName(defaultName)
    setBuddyUsername(buddyUsernameFromName(defaultName))
    setBuddyUsernameTouched(false)
    setBuddyDescription('')
    setCreateError('')
  }
  const closeCreateBuddy = () => {
    if (createBusy) return
    setCreateRuntime(null)
    setCreateError('')
  }
  const openDeleteConnection = (connection: ConnectorConnection) => {
    if (connectorConnectionBusyId || connectorBusy) return
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
        username: buddyUsername.trim(),
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
      <SettingsCard>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <Cable size={21} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold">{t('desktop.connectorTitle')}</p>
                <p className="mt-0.5 max-w-xl text-sm leading-6 text-text-muted">
                  {t('desktop.connectorDesc')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-start md:justify-end">
            <div className="inline-flex items-center gap-3 rounded-full border border-border-subtle bg-bg-primary/55 px-3 py-2 shadow-black/20">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-bold',
                  connectorRunning ? 'text-success' : 'text-text-secondary',
                )}
              >
                {connectorRunning ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
                {connectorStatusCopy}
              </span>
              <Switch
                checked={connectorRunning}
                disabled={connectorBusy}
                onCheckedChange={onConnectorRunningToggle}
              />
            </div>
          </div>
        </div>

        {connectorProgressVisible ? (
          <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/8 p-3">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-primary">
              <span>{connectorPhaseCopy}</span>
              <span>{connectorProgressValue}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-deep">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${connectorProgressValue}%` }}
              />
            </div>
          </div>
        ) : null}
        {connectorState && !connectorState.connectorPath ? (
          <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-xs font-semibold text-warning">
            {t('desktop.connectorMissingBundle')}
          </div>
        ) : null}
        {connectorError || connectorState?.lastError ? (
          <div
            key={connectorError || connectorState?.lastError}
            className="desktop-settings-error-shake rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs font-semibold text-danger"
          >
            {t('desktop.connectorLastError')}: {connectorError || connectorState?.lastError}
          </div>
        ) : null}
        {connectorNotice ? (
          <div className="rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-xs font-semibold text-success">
            {connectorNotice}
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{t('desktop.connectorConnections')}</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {t('desktop.connectorConnectionsDesc')}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => openCreateBuddy(firstAvailableRuntime)}
            disabled={connectorBusy || !firstAvailableRuntime}
            variant="glass"
            size="sm"
            icon={UserPlus}
            loading={connectorBusy && !connectorRunning}
            className="justify-self-start sm:justify-self-end"
          >
            {t('desktop.connectorCreateBuddy')}
          </Button>
        </div>

        {connectorConnections.length ? (
          <div className="grid gap-3">
            {connectorConnections.map((connection) => {
              const connectionRunning = connection.status === 'running'
              const connectionErrored = connection.status === 'error'
              const connectionBusy = connectorConnectionBusyId === connection.agentId
              const connectionError = connectorConnectionErrors[connection.agentId]
              const workDir = connectionWorkDirs[connection.agentId] ?? connection.workDir
              const connectionRuntime: ConnectorRuntimeInfo = runtimes.find(
                (runtime) => runtime.id === connection.runtimeId,
              ) ?? {
                id: connection.runtimeId,
                label: connection.runtimeLabel,
                kind: 'cli',
                status: 'available',
                iconId: connection.runtimeId,
              }
              return (
                <div
                  key={connection.agentId}
                  ref={(node) => {
                    if (node) connectionRefs.current.set(connection.agentId, node)
                    else connectionRefs.current.delete(connection.agentId)
                  }}
                  className={cn(
                    'grid gap-4 rounded-2xl border p-4 transition xl:grid-cols-[minmax(0,1fr)_minmax(268px,auto)] xl:items-center',
                    highlightedConnectionId === connection.agentId
                      ? 'border-primary/55 bg-primary/10 shadow-[0_0_0_1px_rgba(34,211,238,0.28),0_18px_45px_rgba(34,211,238,0.16)]'
                      : 'border-border-subtle bg-bg-primary/35',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="flex shrink-0 items-center gap-2 pt-1">
                      <span className="grid h-11 w-11 overflow-hidden rounded-2xl border border-border-subtle bg-bg-primary/60">
                        {connection.avatarUrl ? (
                          <img
                            src={connection.avatarUrl}
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-sm font-bold text-primary">
                            {(connection.displayName || connection.username || connection.label)
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-text-muted" aria-hidden="true">
                        <span className="h-px w-5 bg-border-subtle" />
                        <ArrowRight size={15} />
                        <span className="h-px w-5 bg-border-subtle" />
                      </span>
                      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-border-subtle bg-black/45">
                        <RuntimeIcon runtime={connectionRuntime} className="h-5 w-5" />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {connection.displayName || connection.label}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {connection.username ? `@${connection.username}` : connection.computerName}
                      </p>
                      <p className="mt-1 truncate text-xs text-text-secondary">
                        {connection.runtimeLabel} · {connection.computerName}
                      </p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-black/20 px-3 py-2 text-xs text-text-muted">
                        <FolderOpen size={13} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {workDir || t('desktop.connectorConnectionWorkDirPlaceholder')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3 xl:justify-end xl:border-t-0 xl:pt-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={FolderOpen}
                      title={workDir || t('desktop.connectorConnectionWorkDirPlaceholder')}
                      disabled={connectionBusy}
                      onClick={() => onChooseConnectionWorkDir(connection)}
                    >
                      {workDir ? t('desktop.changeFolder') : t('desktop.chooseFolder')}
                    </Button>
                    <label className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/45 px-3 text-xs font-semibold text-text-secondary">
                      {connectionBusy ? (
                        <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                      ) : null}
                      <span>
                        {connectionBusy
                          ? t('desktop.connectorConnectionWorking')
                          : connectionErrored
                            ? t('desktop.connectorConnectionErrorState')
                            : connectionRunning
                              ? t('desktop.connectorConnectionRunningState')
                              : t('desktop.connectorConnectionStoppedState')}
                      </span>
                      <Switch
                        checked={connectionRunning}
                        onCheckedChange={(checked) =>
                          onConnectorConnectionToggle(connection, checked)
                        }
                        disabled={connectionBusy || connectorBusy}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      icon={Trash2}
                      aria-label={t('desktop.connectorConnectionDelete')}
                      title={t('desktop.connectorConnectionDelete')}
                      disabled={connectionBusy || connectorBusy}
                      onClick={() => openDeleteConnection(connection)}
                      className="h-10 w-10 text-danger hover:bg-danger/10 hover:text-danger"
                    />
                  </div>
                  {connectionError ? (
                    <div
                      key={connectionError}
                      className="desktop-settings-error-shake rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger xl:col-span-2"
                    >
                      {connectionError}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-primary/25 px-4 py-8 text-center text-sm text-text-muted">
            {t('desktop.connectorNoConnections')}
          </div>
        )}
      </SettingsCard>

      <SettingsCard>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <button
            type="button"
            data-no-drag
            className="flex min-w-0 items-center gap-3 rounded-xl text-left transition hover:text-text-primary"
            onClick={onToggleRuntimesCollapsed}
            aria-expanded={!runtimesCollapsed}
          >
            <ChevronDown
              size={18}
              className={cn(
                'shrink-0 text-text-muted transition-transform',
                runtimesCollapsed ? '-rotate-90' : 'rotate-0',
              )}
            />
            <span className="min-w-0">
              <span className="block text-base font-semibold">{t('desktop.runtimesTitle')}</span>
              <span className="mt-1 block text-sm leading-6 text-text-muted">
                {t('desktop.runtimesDesc')}
              </span>
            </span>
          </button>
          <Button
            type="button"
            variant="glass"
            size="sm"
            icon={RefreshCw}
            loading={runtimeScanBusy}
            disabled={runtimeScanBusy}
            onClick={onScanRuntimes}
            className="justify-self-start sm:justify-self-end"
          >
            {t('desktop.runtimeScan')}
          </Button>
        </div>
        {!runtimesCollapsed ? (
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-bg-primary/30 px-4 py-3">
                <p className="text-xs font-semibold text-text-muted">
                  {t('desktop.runtimeOverviewInstalled')}
                </p>
                <p className="mt-1 text-lg font-bold text-text-primary">{installedRuntimeCount}</p>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-bg-primary/30 px-4 py-3">
                <p className="text-xs font-semibold text-text-muted">
                  {t('desktop.runtimeOverviewWatchable')}
                </p>
                <p className="mt-1 text-lg font-bold text-text-primary">{watchableRuntimeCount}</p>
              </div>
            </div>
            {runtimes.map((runtime) => {
              const installed = runtime.status === 'available'
              const busy = runtimeInstallBusyIds.includes(runtime.id)
              const installErrored = runtimeInstallErrorIds.includes(runtime.id)
              const notificationBusy = runtimeNotificationBusyIds.includes(runtime.id)
              const monitor = summarizeRuntimeMonitor(runtime, runtimeSessions)
              const showMonitorBadge =
                installed && monitor.statusKey !== 'desktop.runtimeStatusConnectReady'
              const runtimeDetail = monitor.latestSession?.title
                ? t('desktop.runtimeSessionLatest', {
                    title: monitor.latestSession.title,
                  })
                : showMonitorBadge
                  ? t(monitor.detailKey, { name: runtime.label })
                  : ''
              return (
                <div
                  key={runtime.id}
                  className={cn(
                    'grid gap-4 rounded-2xl border px-4 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] xl:items-center',
                    installErrored
                      ? 'desktop-settings-error-shake border-danger/40 bg-danger/8'
                      : installed
                        ? 'border-border-subtle bg-bg-primary/35'
                        : 'border-border-subtle bg-bg-primary/18 opacity-75',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-black/45">
                      <RuntimeIcon runtime={runtime} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{runtime.label}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {installed
                          ? runtime.version || runtime.command || t('desktop.runtimeInstalled')
                          : t('desktop.runtimeMissing')}
                      </span>
                      {installed && runtimeDetail ? (
                        <span className="mt-1 block truncate text-xs text-text-secondary">
                          {runtimeDetail}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {installed ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3 xl:justify-end xl:border-t-0 xl:pt-0">
                      {showMonitorBadge ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold',
                            runtimeMonitorToneClass(monitor.tone),
                          )}
                          title={
                            monitor.instance?.error ||
                            t(monitor.detailKey, {
                              name: runtime.label,
                            })
                          }
                        >
                          {monitor.tone === 'ready' ? (
                            <Activity size={13} />
                          ) : monitor.tone === 'error' ? (
                            <CircleAlert size={13} />
                          ) : (
                            <CircleCheck size={13} />
                          )}
                          {t(monitor.statusKey)}
                        </span>
                      ) : null}
                      <label className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/45 px-3 text-xs font-semibold text-text-secondary">
                        {notificationBusy ? (
                          <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Bell size={13} aria-hidden="true" />
                        )}
                        <span className="max-w-[13rem] truncate">{t('desktop.runtimeNotify')}</span>
                        <Switch
                          checked={connectorRuntimeNotifications[runtime.id] !== false}
                          disabled={connectorBusy || notificationBusy}
                          onCheckedChange={(checked) =>
                            onRuntimeNotificationToggle(runtime, checked)
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Cable}
                        disabled={connectorBusy}
                        onClick={() => openCreateBuddy(runtime)}
                      >
                        {t('desktop.runtimeConnect')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3 sm:justify-end xl:border-t-0 xl:pt-0">
                      {runtime.helpUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={ExternalLink}
                          onClick={() => openExternal?.(runtime.helpUrl || '')}
                        >
                          {t('desktop.runtimeHelp')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        icon={Download}
                        loading={busy}
                        disabled={busy || connectorBusy || !runtime.installCommand}
                        onClick={() => onInstallRuntime(runtime)}
                      >
                        {busy ? t('desktop.runtimeInstalling') : t('desktop.runtimeInstall')}
                      </Button>
                      {installErrored ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger/10 px-2.5 py-1 text-xs font-bold text-danger">
                          <CircleAlert size={13} aria-hidden="true" />
                          {t('desktop.runtimeInstallFailed')}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
            {runtimes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-primary/25 px-4 py-8 text-center text-sm text-text-muted">
                {t('desktop.runtimesEmpty')}
              </div>
            ) : null}
          </div>
        ) : null}
      </SettingsCard>

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
            className="w-full max-w-[560px] overflow-hidden rounded-[18px] border border-white/10 bg-[#101215] shadow-[0_24px_90px_rgba(0,0,0,0.78)]"
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

            <div className="grid gap-3 px-5 py-4">
              <Input
                label={t('desktop.connectorBuddyName')}
                value={buddyName}
                onChange={(event) => {
                  const value = event.target.value
                  setBuddyName(value)
                  if (!buddyUsernameTouched) setBuddyUsername(buddyUsernameFromName(value))
                }}
                placeholder={t('desktop.connectorBuddyNamePlaceholder')}
              />
              <Input
                label={t('desktop.connectorBuddyUsername')}
                value={buddyUsername}
                onChange={(event) => {
                  setBuddyUsernameTouched(true)
                  setBuddyUsername(buddyUsernameFromName(event.target.value))
                }}
                placeholder="claude_code_buddy"
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
                disabled={
                  createBusy || buddyName.trim().length === 0 || buddyUsername.trim().length < 2
                }
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
