import { Button, Card, CardContent, cn, Input, Switch } from '@shadowob/ui'
import {
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
  Unplug,
  UserPlus,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ConnectorConnection,
  ConnectorDaemonState,
  ConnectorRuntimeInfo,
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
  gemini: new URL(
    '../../../../web/src/assets/runtime-icons/gemini.svg',
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
  connectorConnections,
  connectorConnectionBusyId,
  connectionWorkDirs,
  runtimes,
  runtimesCollapsed,
  runtimeScanBusy,
  runtimeInstallBusyIds,
  openExternal,
  onConnectorRunningToggle,
  onCreateConnectorBuddy,
  onConnectorConnectionToggle,
  onChooseConnectionWorkDir,
  onToggleRuntimesCollapsed,
  onScanRuntimes,
  onInstallRuntime,
}: {
  connectorRunning: boolean
  connectorBusy: boolean
  connectorStatusCopy: string
  connectorProgressVisible: boolean
  connectorProgressValue: number
  connectorPhaseCopy: string
  connectorState: ConnectorDaemonState | null
  connectorError: string
  connectorConnections: ConnectorConnection[]
  connectorConnectionBusyId: string | null
  connectionWorkDirs: Record<string, string>
  runtimes: ConnectorRuntimeInfo[]
  runtimesCollapsed: boolean
  runtimeScanBusy: boolean
  runtimeInstallBusyIds: string[]
  openExternal?: (url: string) => Promise<boolean>
  onConnectorRunningToggle: (enabled: boolean) => void
  onCreateConnectorBuddy: () => void
  onConnectorConnectionToggle: (connection: ConnectorConnection, enabled: boolean) => void
  onChooseConnectionWorkDir: (connection: ConnectorConnection) => void
  onToggleRuntimesCollapsed: () => void
  onScanRuntimes: () => void
  onInstallRuntime: (runtime: ConnectorRuntimeInfo) => void
}) {
  const { t } = useTranslation()

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
          <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-xs font-semibold text-danger">
            {t('desktop.connectorLastError')}: {connectorError || connectorState?.lastError}
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
            onClick={onCreateConnectorBuddy}
            disabled={connectorBusy}
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
                  className="grid gap-4 rounded-2xl border border-border-subtle bg-bg-primary/35 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-black/45">
                      <RuntimeIcon runtime={connectionRuntime} className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {connection.label} - {connection.runtimeLabel}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {connection.computerName}
                      </p>
                      <p className="mt-1 truncate text-xs text-text-secondary">
                        {workDir || t('desktop.connectorConnectionWorkDirPlaceholder')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={FolderOpen}
                      title={workDir || t('desktop.connectorConnectionWorkDirPlaceholder')}
                      disabled={connectorConnectionBusyId === connection.agentId}
                      onClick={() => onChooseConnectionWorkDir(connection)}
                      className="justify-self-start"
                    >
                      {workDir ? t('desktop.changeFolder') : t('desktop.chooseFolder')}
                    </Button>
                    <Switch
                      checked={connectionRunning}
                      onCheckedChange={(checked) =>
                        onConnectorConnectionToggle(connection, checked)
                      }
                      disabled={connectorConnectionBusyId === connection.agentId}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Unplug}
                      disabled={
                        connectorConnectionBusyId === connection.agentId || !connectionRunning
                      }
                      onClick={() => onConnectorConnectionToggle(connection, false)}
                      className="col-span-2 justify-self-start sm:col-span-1"
                    >
                      {t('desktop.connectorDisconnect')}
                    </Button>
                  </div>
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
            {runtimes.map((runtime) => {
              const installed = runtime.status === 'available'
              const busy = runtimeInstallBusyIds.includes(runtime.id)
              return (
                <div
                  key={runtime.id}
                  className={cn(
                    'grid gap-3 rounded-2xl border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
                    installed
                      ? 'border-border-subtle bg-bg-primary/35'
                      : 'border-border-subtle bg-bg-primary/18 opacity-75',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-black/45">
                      <RuntimeIcon runtime={runtime} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{runtime.label}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {installed
                          ? runtime.version || runtime.command || t('desktop.runtimeInstalled')
                          : t('desktop.runtimeMissing')}
                      </span>
                    </span>
                  </div>
                  {installed ? (
                    <span className="inline-flex items-center justify-self-start gap-1 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-bold text-success sm:justify-self-end">
                      <CircleCheck size={13} />
                      {t('desktop.runtimeInstalled')}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
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
                        disabled={busy || !runtime.installCommand}
                        onClick={() => onInstallRuntime(runtime)}
                      >
                        {t('desktop.runtimeInstall')}
                      </Button>
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
    </>
  )
}

export function ShortcutsSettingsPanel({
  platform,
  shortcuts,
  recordingShortcut,
  shortcutRegistrationError,
  onRecordingShortcut,
}: {
  platform?: string
  shortcuts: DesktopShortcutSettings
  recordingShortcut: DesktopShortcutAction | null
  shortcutRegistrationError: string
  onRecordingShortcut: (action: DesktopShortcutAction | null) => void
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
          placeholder="https://shadowob.com"
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
      <Button type="button" onClick={onRestart} variant="glass" size="sm" icon={RotateCcw}>
        {t('desktop.restart')}
      </Button>
    </SettingsCard>
  )
}
