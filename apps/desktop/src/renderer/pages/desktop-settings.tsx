import { Button, Card, CardContent, cn, Input, Switch } from '@shadowob/ui'
import {
  Cable,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Info,
  Keyboard,
  type LucideIcon,
  Mic2,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Unplug,
  UserPlus,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'

interface DesktopRuntimeSettings {
  serverBaseUrl: string
  httpProxy: string
  httpsProxy: string
  connectorApiKey: string
  connectorAutoStart: boolean
  connectorWorkDir: string
  connectorBuddyWorkDirs: Record<string, string>
  ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
  asrProvider: 'sherpa-local' | 'web-speech'
  shortcuts: DesktopShortcutSettings
}

type DesktopShortcutAction =
  | 'openCommunity'
  | 'togglePet'
  | 'petVoice'
  | 'petChat'
  | 'showNotifications'

type DesktopShortcutSettings = Record<DesktopShortcutAction, string>

interface ConnectorDaemonState {
  running: boolean
  pid: number | null
  startedAt: number | null
  uptimeMs: number
  serverBaseUrl: string
  hasApiKey: boolean
  autoStart: boolean
  phase: 'idle' | 'authorizing' | 'connecting' | 'starting' | 'running' | 'stopping' | 'error'
  progress: number
  progressMessage: string
  connections: ConnectorConnection[]
  lastExitCode: number | null
  lastError: string | null
  logTail: string[]
  connectorPath: string | null
}

interface ConnectorConnection {
  agentId: string
  label: string
  runtimeId: string
  runtimeLabel: string
  computerId: string
  computerName: string
  workDir: string
  status: 'running' | 'stopped' | 'error'
}

interface ConnectorRuntimeInfo {
  id: string
  label: string
  kind: 'openclaw' | 'cli'
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  iconId?: string | null
  installCommand?: string | null
  installCommands?: string[]
  helpUrl?: string | null
  detectedAt?: string | null
}

type TtsProvider = DesktopRuntimeSettings['ttsProvider']

interface VoiceProviderStatus {
  installed: boolean
  runtimeInstalled?: boolean
  modelInstalled?: boolean
  name: string
  sourceUrl: string
}

interface VoiceEngineStatus {
  engine: string
  asrProvider: DesktopRuntimeSettings['asrProvider']
  ttsProvider: TtsProvider
  nativeAddonAvailable: boolean
  modelRoot: string
  asr: VoiceProviderStatus
  tts: VoiceProviderStatus
  ttsProviders: Record<TtsProvider, VoiceProviderStatus>
}

type DesktopSettingsTab = 'general' | 'connector' | 'shortcuts' | 'voice' | 'network' | 'about'

const desktopSettingsTabs = new Set<DesktopSettingsTab>([
  'general',
  'connector',
  'shortcuts',
  'voice',
  'network',
  'about',
])

interface DesktopSettingsAPI {
  platform: string
  showCreateBuddy?: () => Promise<void>
  openExternal?: (url: string) => Promise<boolean>
  selectDirectory?: (defaultPath?: string) => Promise<string | null>
  getVersion: () => Promise<string>
  checkForUpdate: () => Promise<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
  }>
  getUpdateSettings: () => Promise<{ autoCheckOnLaunch: boolean }>
  setUpdateSettings: (settings: { autoCheckOnLaunch: boolean }) => Promise<{
    autoCheckOnLaunch: boolean
  }>
  getUpdateState: () => Promise<{
    status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
    checkedAt: number | null
    info: {
      hasUpdate: boolean
      version: string
      downloadUrl: string
      releaseNotes: string
    } | null
    error: string | null
  }>
  onUpdateState?: (
    cb: (data: {
      status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
      checkedAt: number | null
      info: {
        hasUpdate: boolean
        version: string
        downloadUrl: string
        releaseNotes: string
      } | null
      error: string | null
    }) => void,
  ) => () => void
  downloadUpdate: (url: string) => Promise<boolean>
  setOpenAtLogin: (v: boolean) => void
  getOpenAtLogin: () => Promise<boolean>
  quitAndRestart: () => void
  getDesktopSettings: () => Promise<DesktopRuntimeSettings>
  setDesktopSettings: (settings: Partial<DesktopRuntimeSettings>) => Promise<DesktopRuntimeSettings>
  reloadShortcuts?: () => Promise<ShortcutRegistrationResult>
  suspendShortcuts?: () => Promise<ShortcutRegistrationResult>
  resumeShortcuts?: () => Promise<ShortcutRegistrationResult>
  connector: {
    getStatus: () => Promise<ConnectorDaemonState>
    start: (settings?: Partial<DesktopRuntimeSettings>) => Promise<ConnectorDaemonState>
    stop: () => Promise<ConnectorDaemonState>
    scan: () => Promise<{ output: string }>
    scanRuntimes?: () => Promise<{ runtimes: ConnectorRuntimeInfo[] }>
    installRuntime?: (input: { runtimeId: string }) => Promise<{
      runtimes: ConnectorRuntimeInfo[]
      installed?: ConnectorRuntimeInfo | null
    }>
    getConnections: () => Promise<ConnectorConnection[]>
    setConnectionEnabled: (input: {
      agentId: string
      enabled: boolean
    }) => Promise<ConnectorConnection[]>
    setConnectionWorkDir?: (input: {
      agentId: string
      workDir: string
    }) => Promise<ConnectorConnection[]>
  }
  pet?: {
    voiceEngineStatus?: () => Promise<VoiceEngineStatus>
    installVoiceModel?: (input: { provider: TtsProvider }) => Promise<VoiceEngineStatus>
  }
  onConnectorState?: (callback: (state: ConnectorDaemonState) => void) => () => void
  onSettingsTabRequest?: (callback: (tab: DesktopSettingsTab) => void) => () => void
}

type ShortcutRegistrationResult = {
  suspended: boolean
  registered: Array<{ action: DesktopShortcutAction; accelerator: string }>
  failed: Array<{ action: DesktopShortcutAction; accelerator: string; reason?: string }>
}

function getAPI(): DesktopSettingsAPI | null {
  if ('desktopAPI' in window) {
    const api = (window as Record<string, unknown>).desktopAPI as Record<string, unknown>
    return {
      platform: api.platform as string,
      showCreateBuddy: api.showCreateBuddy as DesktopSettingsAPI['showCreateBuddy'],
      openExternal: api.openExternal as DesktopSettingsAPI['openExternal'],
      selectDirectory: api.selectDirectory as DesktopSettingsAPI['selectDirectory'],
      getVersion: api.getVersion as DesktopSettingsAPI['getVersion'],
      checkForUpdate: api.checkForUpdate as DesktopSettingsAPI['checkForUpdate'],
      getUpdateSettings: api.getUpdateSettings as DesktopSettingsAPI['getUpdateSettings'],
      setUpdateSettings: api.setUpdateSettings as DesktopSettingsAPI['setUpdateSettings'],
      getUpdateState: api.getUpdateState as DesktopSettingsAPI['getUpdateState'],
      onUpdateState: api.onUpdateState as DesktopSettingsAPI['onUpdateState'],
      downloadUpdate: api.downloadUpdate as DesktopSettingsAPI['downloadUpdate'],
      setOpenAtLogin: api.setOpenAtLogin as DesktopSettingsAPI['setOpenAtLogin'],
      getOpenAtLogin: api.getOpenAtLogin as DesktopSettingsAPI['getOpenAtLogin'],
      quitAndRestart: api.quitAndRestart as DesktopSettingsAPI['quitAndRestart'],
      getDesktopSettings: api.getDesktopSettings as DesktopSettingsAPI['getDesktopSettings'],
      setDesktopSettings: api.setDesktopSettings as DesktopSettingsAPI['setDesktopSettings'],
      reloadShortcuts: api.reloadShortcuts as DesktopSettingsAPI['reloadShortcuts'],
      suspendShortcuts: api.suspendShortcuts as DesktopSettingsAPI['suspendShortcuts'],
      resumeShortcuts: api.resumeShortcuts as DesktopSettingsAPI['resumeShortcuts'],
      connector: api.connector as DesktopSettingsAPI['connector'],
      pet: api.pet as DesktopSettingsAPI['pet'],
      onConnectorState: api.onConnectorState as DesktopSettingsAPI['onConnectorState'],
      onSettingsTabRequest: api.onSettingsTabRequest as DesktopSettingsAPI['onSettingsTabRequest'],
    }
  }
  return null
}

function readInitialSettingsTab(): DesktopSettingsTab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return desktopSettingsTabs.has(tab as DesktopSettingsTab)
    ? (tab as DesktopSettingsTab)
    : 'general'
}

function persistRuntimeSettings(settings: DesktopRuntimeSettings): void {
  localStorage.setItem(
    DESKTOP_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      serverBaseUrl: settings.serverBaseUrl,
      httpProxy: settings.httpProxy,
      httpsProxy: settings.httpsProxy,
    }),
  )
}

const DESKTOP_RUNTIME_ICON_SOURCES: Record<string, string> = {
  openclaw: new URL(
    '../../../../web/src/assets/runtime-icons/openclaw.svg',
    import.meta.url,
  ).toString(),
  hermes: new URL(
    '../../../../web/src/assets/runtime-icons/hermes-agent.svg',
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

const shortcutActions: DesktopShortcutAction[] = [
  'openCommunity',
  'togglePet',
  'petVoice',
  'petChat',
  'showNotifications',
]

function displayShortcut(value: string, platform: string | undefined): string {
  const isMac = platform === 'darwin'
  const parts = value.split('+').filter(Boolean)
  const labels = parts.map((part) => {
    if (part === 'CommandOrControl') return isMac ? '⌘' : 'Ctrl'
    if (part === 'Command') return isMac ? '⌘' : 'Win'
    if (part === 'Control') return isMac ? '⌃' : 'Ctrl'
    if (part === 'Alt') return isMac ? '⌥' : 'Alt'
    if (part === 'Shift') return isMac ? '⇧' : 'Shift'
    if (part === 'Space') return isMac ? 'Space' : 'Space'
    return part.replace(/^Arrow/, '')
  })
  return isMac ? labels.join('') : labels.join(' + ')
}

function shortcutFromKeyboardEvent(
  event: KeyboardEvent,
  platform: string | undefined,
): string | null {
  const key = event.key
  if (!key || ['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null
  const parts: string[] = []
  if (platform === 'darwin') {
    if (event.metaKey) parts.push('CommandOrControl')
    else if (event.ctrlKey) parts.push('Control')
  } else if (event.ctrlKey || event.metaKey) {
    parts.push('CommandOrControl')
  }
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null
  const normalizedKey =
    key === ' '
      ? 'Space'
      : key.startsWith('Arrow')
        ? key
        : key.length === 1
          ? key.toUpperCase()
          : key
  parts.push(normalizedKey)
  return parts.join('+')
}

export function DesktopSettingsPage() {
  const { t } = useTranslation()
  const api = useMemo(() => getAPI(), [])

  const [activeTab, setActiveTab] = useState<DesktopSettingsTab>(() => readInitialSettingsTab())
  const [version, setVersion] = useState('')
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [checking, setChecking] = useState(false)
  const [savingNetwork, setSavingNetwork] = useState(false)
  const [networkSaved, setNetworkSaved] = useState(false)
  const [autoCheckOnLaunch, setAutoCheckOnLaunch] = useState(true)
  const [serverBaseUrl, setServerBaseUrl] = useState('https://shadowob.com')
  const [httpProxy, setHttpProxy] = useState('')
  const [httpsProxy, setHttpsProxy] = useState('')
  const [connectorApiKey, setConnectorApiKey] = useState('')
  const [connectorAutoStart, setConnectorAutoStart] = useState(false)
  const [shortcuts, setShortcuts] = useState<DesktopShortcutSettings>({
    openCommunity: 'CommandOrControl+Alt+Shift+S',
    togglePet: 'CommandOrControl+Alt+Shift+P',
    petVoice: 'CommandOrControl+Alt+Shift+V',
    petChat: 'CommandOrControl+Alt+Shift+C',
    showNotifications: 'CommandOrControl+Alt+Shift+N',
  })
  const [recordingShortcut, setRecordingShortcut] = useState<DesktopShortcutAction | null>(null)
  const [shortcutRegistrationError, setShortcutRegistrationError] = useState('')
  const [ttsProvider, setTtsProvider] = useState<DesktopRuntimeSettings['ttsProvider']>('system')
  const [asrProvider, setAsrProvider] =
    useState<DesktopRuntimeSettings['asrProvider']>('sherpa-local')
  const [voiceStatus, setVoiceStatus] = useState<VoiceEngineStatus | null>(null)
  const [voiceInstallBusyProvider, setVoiceInstallBusyProvider] = useState<TtsProvider | null>(null)
  const [voiceError, setVoiceError] = useState('')
  const [connectorState, setConnectorState] = useState<ConnectorDaemonState | null>(null)
  const [connectorBusy, setConnectorBusy] = useState(false)
  const [connectorConnectionBusyId, setConnectorConnectionBusyId] = useState<string | null>(null)
  const [connectorError, setConnectorError] = useState('')
  const [connectionWorkDirs, setConnectionWorkDirs] = useState<Record<string, string>>({})
  const [runtimes, setRuntimes] = useState<ConnectorRuntimeInfo[]>([])
  const [runtimesCollapsed, setRuntimesCollapsed] = useState(false)
  const [runtimeScanBusy, setRuntimeScanBusy] = useState(false)
  const [runtimeInstallBusyIds, setRuntimeInstallBusyIds] = useState<string[]>([])
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
  } | null>(null)

  const refreshVoiceStatus = useCallback(async () => {
    const status = await api?.pet?.voiceEngineStatus?.().catch(() => null)
    if (status) setVoiceStatus(status)
    return status
  }, [api])

  useEffect(() => {
    api?.getVersion().then(setVersion)
    api?.getOpenAtLogin().then(setOpenAtLogin)
    api?.getUpdateSettings().then((s) => setAutoCheckOnLaunch(s.autoCheckOnLaunch))
    api?.getDesktopSettings().then((settings) => {
      setServerBaseUrl(settings.serverBaseUrl)
      setHttpProxy(settings.httpProxy)
      setHttpsProxy(settings.httpsProxy)
      setConnectorApiKey(settings.connectorApiKey)
      setConnectorAutoStart(settings.connectorAutoStart)
      setTtsProvider(settings.ttsProvider)
      setAsrProvider(settings.asrProvider)
      setShortcuts(settings.shortcuts)
      persistRuntimeSettings(settings)
    })
    void refreshVoiceStatus()
    api?.connector.getStatus().then(setConnectorState)
    api?.connector.scanRuntimes?.().then((result) => setRuntimes(result.runtimes))
    api?.connector.getConnections?.().then((connections) => {
      setConnectorState((state) => (state ? { ...state, connections } : state))
    })
    api?.getUpdateState().then((state) => {
      if (state.info) setUpdateInfo(state.info)
      setChecking(state.status === 'checking')
    })

    const unsubscribe = api?.onUpdateState?.((state) => {
      if (state.info) setUpdateInfo(state.info)
      setChecking(state.status === 'checking')
    })
    const unsubscribeConnector = api?.onConnectorState?.((state) => {
      setConnectorState(state)
      if (state.lastError) setConnectorError(state.lastError)
    })
    return () => {
      unsubscribe?.()
      unsubscribeConnector?.()
    }
  }, [api, refreshVoiceStatus])

  useEffect(() => {
    return api?.onSettingsTabRequest?.((tab) => setActiveTab(tab))
  }, [api])

  useEffect(() => {
    if (!api || !voiceStatus || ttsProvider === 'system') return
    if (voiceStatus.ttsProviders[ttsProvider]?.installed) return
    setTtsProvider('system')
    void api
      .setDesktopSettings({ ttsProvider: 'system', asrProvider })
      .then((settings) => {
        setTtsProvider(settings.ttsProvider)
        setAsrProvider(settings.asrProvider)
      })
      .catch(() => {})
  }, [api, asrProvider, ttsProvider, voiceStatus])

  const handleCheckUpdate = useCallback(async () => {
    if (!api || checking) return
    setChecking(true)
    try {
      const info = await api.checkForUpdate()
      setUpdateInfo(info)
    } finally {
      setChecking(false)
    }
  }, [api, checking])

  const handleDownload = useCallback(() => {
    if (!updateInfo?.downloadUrl || !api) return
    api.downloadUpdate(updateInfo.downloadUrl)
  }, [api, updateInfo])

  const handleOpenAtLoginToggle = useCallback(
    (v: boolean) => {
      setOpenAtLogin(v)
      api?.setOpenAtLogin(v)
    },
    [api],
  )

  const handleAutoCheckToggle = useCallback(
    async (v: boolean) => {
      setAutoCheckOnLaunch(v)
      await api?.setUpdateSettings({ autoCheckOnLaunch: v })
    },
    [api],
  )

  const handleSaveNetwork = useCallback(async () => {
    if (!api || savingNetwork) return
    setSavingNetwork(true)
    setNetworkSaved(false)
    try {
      const next = await api.setDesktopSettings({ serverBaseUrl, httpProxy, httpsProxy })
      setServerBaseUrl(next.serverBaseUrl)
      setHttpProxy(next.httpProxy)
      setHttpsProxy(next.httpsProxy)
      persistRuntimeSettings(next)
      setNetworkSaved(true)
    } finally {
      setSavingNetwork(false)
    }
  }, [api, httpProxy, httpsProxy, savingNetwork, serverBaseUrl])

  const handleConnectorAutoStartToggle = useCallback(
    async (v: boolean) => {
      setConnectorAutoStart(v)
      setConnectorError('')
      try {
        const next = await api?.setDesktopSettings({
          connectorApiKey,
          connectorAutoStart: v,
        })
        if (!next) return
        setConnectorApiKey(next.connectorApiKey)
        setConnectorAutoStart(next.connectorAutoStart)
        persistRuntimeSettings(next)
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      }
    },
    [api, connectorApiKey],
  )

  const handleStartConnector = useCallback(async () => {
    if (!api || connectorBusy) return
    setConnectorBusy(true)
    setConnectorError('')
    try {
      const next = await api.setDesktopSettings({
        serverBaseUrl,
        httpProxy,
        httpsProxy,
        connectorApiKey,
        connectorAutoStart,
      })
      setServerBaseUrl(next.serverBaseUrl)
      setHttpProxy(next.httpProxy)
      setHttpsProxy(next.httpsProxy)
      setConnectorApiKey(next.connectorApiKey)
      setConnectorAutoStart(next.connectorAutoStart)
      persistRuntimeSettings(next)
      const state = await api.connector.start(next)
      setConnectorState(state)
      const authorizedSettings = await api.getDesktopSettings()
      setConnectorApiKey(authorizedSettings.connectorApiKey)
      setConnectorAutoStart(authorizedSettings.connectorAutoStart)
      persistRuntimeSettings(authorizedSettings)
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectorBusy(false)
    }
  }, [
    api,
    connectorApiKey,
    connectorAutoStart,
    connectorBusy,
    httpProxy,
    httpsProxy,
    serverBaseUrl,
  ])

  const handleStopConnector = useCallback(async () => {
    if (!api || connectorBusy) return
    setConnectorBusy(true)
    setConnectorError('')
    try {
      const state = await api.connector.stop()
      setConnectorState(state)
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectorBusy(false)
    }
  }, [api, connectorBusy])

  const handleConnectorRunningToggle = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        void handleStartConnector()
      } else {
        void handleStopConnector()
      }
    },
    [handleStartConnector, handleStopConnector],
  )

  const handleCreateConnectorBuddy = useCallback(async () => {
    if (!api || connectorBusy) return
    setConnectorBusy(true)
    setConnectorError('')
    try {
      const next = await api.connector.start({
        serverBaseUrl,
        httpProxy,
        httpsProxy,
        connectorApiKey,
        connectorAutoStart,
      })
      setConnectorState(next)
      const authorizedSettings = await api.getDesktopSettings()
      setConnectorApiKey(authorizedSettings.connectorApiKey)
      setConnectorAutoStart(authorizedSettings.connectorAutoStart)
      persistRuntimeSettings(authorizedSettings)
      await api.showCreateBuddy?.()
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectorBusy(false)
    }
  }, [
    api,
    connectorApiKey,
    connectorAutoStart,
    connectorBusy,
    httpProxy,
    httpsProxy,
    serverBaseUrl,
  ])

  const handleConnectorConnectionToggle = useCallback(
    async (connection: ConnectorConnection, enabled: boolean) => {
      if (!api || connectorConnectionBusyId) return
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorError('')
      try {
        const connections = await api.connector.setConnectionEnabled({
          agentId: connection.agentId,
          enabled,
        })
        setConnectorState((state) => (state ? { ...state, connections } : state))
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setConnectorConnectionBusyId(null)
      }
    },
    [api, connectorConnectionBusyId],
  )

  const handleConnectionWorkDirChange = useCallback((agentId: string, workDir: string) => {
    setConnectionWorkDirs((current) => ({ ...current, [agentId]: workDir }))
  }, [])

  const handleSaveConnectionWorkDir = useCallback(
    async (connection: ConnectorConnection, workDir: string) => {
      if (!api?.connector.setConnectionWorkDir || connectorConnectionBusyId) return
      setConnectorConnectionBusyId(connection.agentId)
      setConnectorError('')
      try {
        const connections = await api.connector.setConnectionWorkDir({
          agentId: connection.agentId,
          workDir,
        })
        setConnectorState((state) => (state ? { ...state, connections } : state))
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setConnectorConnectionBusyId(null)
      }
    },
    [api, connectorConnectionBusyId],
  )

  const handleChooseConnectionWorkDir = useCallback(
    async (connection: ConnectorConnection) => {
      if (!api?.selectDirectory) return
      const currentWorkDir = connectionWorkDirs[connection.agentId] ?? connection.workDir
      const selected = await api.selectDirectory(currentWorkDir)
      if (!selected) return
      handleConnectionWorkDirChange(connection.agentId, selected)
      await handleSaveConnectionWorkDir(connection, selected)
    },
    [api, connectionWorkDirs, handleConnectionWorkDirChange, handleSaveConnectionWorkDir],
  )

  const handleSaveVoice = useCallback(
    async (incoming: Partial<Pick<DesktopRuntimeSettings, 'ttsProvider' | 'asrProvider'>>) => {
      if (!api) return
      const nextTtsProvider = incoming.ttsProvider ?? ttsProvider
      const providerStatus = voiceStatus?.ttsProviders[nextTtsProvider]
      if (nextTtsProvider !== 'system' && !providerStatus?.installed) {
        setVoiceError(t('desktop.voiceProviderRequiresInstall'))
        return
      }
      const next = await api.setDesktopSettings({
        ttsProvider,
        asrProvider,
        ...incoming,
      })
      setTtsProvider(next.ttsProvider)
      setAsrProvider(next.asrProvider)
      setVoiceError('')
      void refreshVoiceStatus()
    },
    [api, asrProvider, refreshVoiceStatus, t, ttsProvider, voiceStatus],
  )

  const handleInstallTtsProvider = useCallback(
    async (provider: TtsProvider) => {
      if (!api?.pet?.installVoiceModel || voiceInstallBusyProvider) return
      setVoiceInstallBusyProvider(provider)
      setVoiceError('')
      try {
        const status = await api.pet.installVoiceModel({ provider })
        setVoiceStatus(status)
      } catch (error) {
        setVoiceError(error instanceof Error ? error.message : String(error))
      } finally {
        setVoiceInstallBusyProvider(null)
      }
    },
    [api, voiceInstallBusyProvider],
  )

  const handleSaveShortcut = useCallback(
    async (action: DesktopShortcutAction, accelerator: string) => {
      if (!api) return
      const nextShortcuts = { ...shortcuts, [action]: accelerator }
      for (const candidate of shortcutActions) {
        if (candidate !== action && nextShortcuts[candidate] === accelerator) {
          nextShortcuts[candidate] = ''
        }
      }
      setShortcuts(nextShortcuts)
      const next = await api.setDesktopSettings({ shortcuts: nextShortcuts })
      setShortcuts(next.shortcuts)
      const result = await api.reloadShortcuts?.()
      const failed = result?.failed ?? []
      setShortcutRegistrationError(
        failed.length
          ? t('desktop.shortcutRegistrationFailed', {
              shortcuts: failed
                .map((entry) => displayShortcut(entry.accelerator, api.platform))
                .join(', '),
            })
          : '',
      )
    },
    [api, shortcuts, t],
  )

  useEffect(() => {
    if (!recordingShortcut) return
    void api?.suspendShortcuts?.()
    const handler = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecordingShortcut(null)
        return
      }
      const next = shortcutFromKeyboardEvent(event, api?.platform)
      if (!next) return
      void handleSaveShortcut(recordingShortcut, next)
      setRecordingShortcut(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      void api?.resumeShortcuts?.()
    }
  }, [api, handleSaveShortcut, recordingShortcut])

  const handleScanRuntimes = useCallback(async () => {
    if (!api?.connector.scanRuntimes || runtimeScanBusy) return
    setRuntimeScanBusy(true)
    setConnectorError('')
    try {
      const result = await api.connector.scanRuntimes()
      setRuntimes(result.runtimes)
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : String(error))
    } finally {
      setRuntimeScanBusy(false)
    }
  }, [api, runtimeScanBusy])

  const handleInstallRuntime = useCallback(
    async (runtime: ConnectorRuntimeInfo) => {
      if (!api?.connector.installRuntime || runtimeInstallBusyIds.includes(runtime.id)) return
      setRuntimeInstallBusyIds((current) => [...current, runtime.id])
      setConnectorError('')
      try {
        const result = await api.connector.installRuntime({ runtimeId: runtime.id })
        setRuntimes(result.runtimes)
      } catch (error) {
        setConnectorError(error instanceof Error ? error.message : String(error))
      } finally {
        setRuntimeInstallBusyIds((current) => current.filter((id) => id !== runtime.id))
      }
    },
    [api, runtimeInstallBusyIds],
  )

  const platformLabel =
    api?.platform === 'darwin' ? 'macOS' : api?.platform === 'win32' ? 'Windows' : 'Linux'
  const connectorRunning = connectorState?.running === true
  const connectorStatusCopy = connectorRunning
    ? t('desktop.connectorRunning')
    : t('desktop.connectorStopped')
  const connectorStatusClass = connectorRunning
    ? 'border-success/30 bg-success/10 text-success'
    : 'border-border-subtle bg-bg-primary/45 text-text-secondary'
  const connectorPhase = connectorState?.phase ?? (connectorRunning ? 'running' : 'idle')
  const connectorProgressVisible =
    connectorBusy ||
    connectorPhase === 'authorizing' ||
    connectorPhase === 'connecting' ||
    connectorPhase === 'starting' ||
    connectorPhase === 'stopping'
  const connectorProgressValue = connectorProgressVisible
    ? Math.max(connectorState?.progress ?? 12, 8)
    : connectorRunning
      ? 100
      : 0
  const connectorConnections = connectorState?.connections ?? []
  useEffect(() => {
    setConnectionWorkDirs((current) => {
      const next: Record<string, string> = {}
      for (const connection of connectorState?.connections ?? []) {
        next[connection.agentId] = current[connection.agentId] ?? connection.workDir ?? ''
      }
      return next
    })
  }, [connectorState?.connections])
  const connectorPhaseCopy = t(`desktop.connectorPhase_${connectorPhase}`)
  const installedRuntimeCount = runtimes.filter((runtime) => runtime.status === 'available').length
  const settingsTabs: Array<{
    id: DesktopSettingsTab
    label: string
    icon: LucideIcon
  }> = [
    { id: 'general', label: t('desktop.tabGeneral'), icon: Settings },
    { id: 'connector', label: t('desktop.tabConnector'), icon: Cable },
    { id: 'shortcuts', label: t('desktop.tabShortcuts'), icon: Keyboard },
    { id: 'voice', label: t('desktop.tabVoice'), icon: Mic2 },
    { id: 'network', label: t('desktop.tabNetwork'), icon: Globe },
    { id: 'about', label: t('desktop.tabAbout'), icon: Info },
  ]

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-black text-text-primary">
      <header className="desktop-drag-titlebar desktop-settings-titlebar sticky top-0 z-20 shrink-0 border-b border-border-subtle bg-[#1f1f1f]/95 px-4 pb-3 pt-3">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2">
          <h1 className="text-sm font-bold text-text-secondary">{t('desktop.settingsTitle')}</h1>
          <nav className="flex items-end gap-2" aria-label={t('desktop.settingsTitle')}>
            {settingsTabs.map((tab) => {
              const Icon = tab.icon
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-no-drag
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex min-w-[78px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition',
                    selected
                      ? 'bg-white/12 text-white'
                      : 'text-text-muted hover:bg-white/7 hover:text-text-primary',
                  )}
                >
                  <Icon size={22} strokeWidth={2.3} />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto grid max-w-[920px] gap-4">
          {activeTab === 'general' ? (
            <>
              <SettingsCard>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{t('desktop.openAtLogin')}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{t('desktop.openAtLoginDesc')}</p>
                  </div>
                  <Switch checked={openAtLogin} onCheckedChange={handleOpenAtLoginToggle} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{t('desktop.connectorAutoStart')}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {t('desktop.connectorAutoStartDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={connectorAutoStart}
                    onCheckedChange={handleConnectorAutoStartToggle}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{t('desktop.autoCheckOnLaunch')}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {t('desktop.autoCheckOnLaunchDesc')}
                    </p>
                  </div>
                  <Switch checked={autoCheckOnLaunch} onCheckedChange={handleAutoCheckToggle} />
                </div>
              </SettingsCard>
              <SettingsCard>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{t('desktop.connectorTitle')}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {t('desktop.connectorSummary', {
                        count: installedRuntimeCount,
                        total: runtimes.length,
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
          ) : null}

          {activeTab === 'connector' ? (
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
                        onCheckedChange={handleConnectorRunningToggle}
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
                    onClick={handleCreateConnectorBuddy}
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
                      const connectionRuntime = runtimes.find(
                        (runtime) => runtime.id === connection.runtimeId,
                      ) ?? {
                        id: connection.runtimeId,
                        label: connection.runtimeLabel,
                        kind: 'cli' as const,
                        status: 'available' as const,
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
                              onClick={() => handleChooseConnectionWorkDir(connection)}
                              className="justify-self-start"
                            >
                              {workDir ? t('desktop.changeFolder') : t('desktop.chooseFolder')}
                            </Button>
                            <Switch
                              checked={connectionRunning}
                              onCheckedChange={(checked) =>
                                handleConnectorConnectionToggle(connection, checked)
                              }
                              disabled={connectorConnectionBusyId === connection.agentId}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={Unplug}
                              disabled={
                                connectorConnectionBusyId === connection.agentId ||
                                !connectionRunning
                              }
                              onClick={() => handleConnectorConnectionToggle(connection, false)}
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
                    onClick={() => setRuntimesCollapsed((value) => !value)}
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
                      <span className="block text-base font-semibold">
                        {t('desktop.runtimesTitle')}
                      </span>
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
                    onClick={handleScanRuntimes}
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
                              <span className="block truncate text-sm font-semibold">
                                {runtime.label}
                              </span>
                              <span className="block truncate text-xs text-text-muted">
                                {installed
                                  ? runtime.version ||
                                    runtime.command ||
                                    t('desktop.runtimeInstalled')
                                  : t('desktop.runtimeMissing')}
                              </span>
                            </span>
                          </div>
                          {installed ? (
                            <span className="inline-flex justify-self-start items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-bold text-success sm:justify-self-end">
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
                                  onClick={() => api?.openExternal?.(runtime.helpUrl || '')}
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
                                onClick={() => handleInstallRuntime(runtime)}
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
          ) : null}

          {activeTab === 'shortcuts' ? (
            <SettingsCard>
              <div>
                <p className="text-base font-semibold">{t('desktop.shortcutsTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {t('desktop.shortcutsDesc')}
                </p>
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
                        onClick={() => setRecordingShortcut(recording ? null : action)}
                      >
                        {recording
                          ? t('desktop.shortcutRecording')
                          : shortcuts[action]
                            ? displayShortcut(shortcuts[action], api?.platform)
                            : t('desktop.shortcutUnassigned')}
                      </button>
                    </div>
                  )
                })}
              </div>
            </SettingsCard>
          ) : null}

          {activeTab === 'voice' ? (
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
                  {(['system', 'moss-tts-nano', 'sherpa-local', 'voxcpm2'] as const).map(
                    (provider) => (
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
                          disabled={
                            provider !== 'system' && !voiceStatus?.ttsProviders[provider]?.installed
                          }
                          onClick={() => {
                            setTtsProvider(provider)
                            void handleSaveVoice({ ttsProvider: provider })
                          }}
                        >
                          <span className="block font-semibold">
                            {t(`desktop.ttsProvider_${provider}`)}
                          </span>
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
                        {provider !== 'system' &&
                        voiceStatus?.ttsProviders[provider]?.installed !== true ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={Download}
                            disabled={voiceInstallBusyProvider !== null}
                            loading={voiceInstallBusyProvider === provider}
                            onClick={() => handleInstallTtsProvider(provider)}
                          >
                            {t('desktop.voiceModelInstall')}
                          </Button>
                        ) : null}
                      </div>
                    ),
                  )}
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
                      onClick={() => {
                        setAsrProvider(provider)
                        void handleSaveVoice({ asrProvider: provider })
                      }}
                    >
                      <span className="block font-semibold">
                        {t(`desktop.asrProvider_${provider}`)}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted">
                        {t(`desktop.asrProvider_${provider}_desc`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </SettingsCard>
          ) : null}

          {activeTab === 'network' ? (
            <SettingsCard>
              <div className="grid gap-2">
                <Input
                  label={t('desktop.serverBaseUrl')}
                  value={serverBaseUrl}
                  onChange={(event) => {
                    setNetworkSaved(false)
                    setServerBaseUrl(event.target.value)
                  }}
                  placeholder="https://shadowob.com"
                />
                <span className="text-xs text-text-muted">{t('desktop.serverBaseUrlDesc')}</span>
              </div>

              <div className="grid gap-2">
                <Input
                  label={t('desktop.httpProxy')}
                  value={httpProxy}
                  onChange={(event) => {
                    setNetworkSaved(false)
                    setHttpProxy(event.target.value)
                  }}
                  placeholder="http://127.0.0.1:7890"
                />
                <span className="text-xs text-text-muted">{t('desktop.httpProxyDesc')}</span>
              </div>

              <div className="grid gap-2">
                <Input
                  label={t('desktop.httpsProxy')}
                  value={httpsProxy}
                  onChange={(event) => {
                    setNetworkSaved(false)
                    setHttpsProxy(event.target.value)
                  }}
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
                  onClick={handleSaveNetwork}
                  disabled={savingNetwork}
                  size="sm"
                  icon={Save}
                  loading={savingNetwork}
                >
                  {t('desktop.saveNetwork')}
                </Button>
              </div>
            </SettingsCard>
          ) : null}

          {activeTab === 'about' ? (
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
                  onClick={handleCheckUpdate}
                  disabled={checking}
                  size="sm"
                  icon={RefreshCw}
                  loading={checking}
                >
                  {checking ? t('desktop.checking') : t('desktop.checkNow')}
                </Button>
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
                      <Button type="button" onClick={handleDownload} size="sm" icon={Download}>
                        {t('desktop.downloadUpdate')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-success">{t('desktop.upToDate')}</p>
                  )}
                </div>
              ) : null}
              <Button
                type="button"
                onClick={() => api?.quitAndRestart()}
                variant="glass"
                size="sm"
                icon={RotateCcw}
              >
                {t('desktop.restart')}
              </Button>
            </SettingsCard>
          ) : null}
        </div>
      </main>
    </div>
  )
}
