import type { DesktopPetAssetPack, DesktopPetAssetSettings } from './pet-types'

export interface DesktopRuntimeSettings {
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
  desktopPetActivePackId: string
  desktopPetPacks: DesktopPetAssetPack[]
}

export type DesktopShortcutAction =
  | 'openCommunity'
  | 'togglePet'
  | 'petVoice'
  | 'petChat'
  | 'showNotifications'

export type DesktopShortcutSettings = Record<DesktopShortcutAction, string>

export interface ConnectorDaemonState {
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

export interface ConnectorConnection {
  agentId: string
  label: string
  runtimeId: string
  runtimeLabel: string
  computerId: string
  computerName: string
  workDir: string
  status: 'running' | 'stopped' | 'error'
}

export interface ConnectorRuntimeInfo {
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

export type TtsProvider = DesktopRuntimeSettings['ttsProvider']

export interface VoiceProviderStatus {
  installed: boolean
  runtimeInstalled?: boolean
  modelInstalled?: boolean
  name: string
  sourceUrl: string
}

export interface VoiceEngineStatus {
  engine: string
  asrProvider: DesktopRuntimeSettings['asrProvider']
  ttsProvider: TtsProvider
  nativeAddonAvailable: boolean
  modelRoot: string
  asr: VoiceProviderStatus
  tts: VoiceProviderStatus
  ttsProviders: Record<TtsProvider, VoiceProviderStatus>
}

export type DesktopSettingsTab =
  | 'general'
  | 'connector'
  | 'shortcuts'
  | 'voice'
  | 'pet'
  | 'network'
  | 'about'

export type ShortcutRegistrationResult = {
  suspended: boolean
  registered: Array<{ action: DesktopShortcutAction; accelerator: string }>
  failed: Array<{ action: DesktopShortcutAction; accelerator: string; reason?: string }>
}

export interface DesktopSettingsAPI {
  platform: string
  showCreateBuddy?: () => Promise<void>
  showMainWindow?: () => Promise<void>
  showCommunity?: (path?: string) => Promise<void>
  getCommunityAuthToken?: () => Promise<string>
  communityFetchJson?: <T = unknown>(input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
  }) => Promise<T>
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
  petAssets?: {
    importDirectory?: (path?: string) => Promise<DesktopPetAssetSettings>
    importMarketplace?: (input: {
      entitlementId: string
      fileId: string
      productId?: string
    }) => Promise<DesktopPetAssetSettings>
    setActive?: (packId: string) => Promise<DesktopPetAssetSettings>
    remove?: (packId: string) => Promise<DesktopPetAssetSettings>
  }
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
  onDesktopSettingsChanged?: (callback: (settings: DesktopRuntimeSettings) => void) => () => void
  onSettingsTabRequest?: (callback: (tab: DesktopSettingsTab) => void) => () => void
}
