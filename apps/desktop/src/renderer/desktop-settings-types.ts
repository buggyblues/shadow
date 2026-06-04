import type {
  RuntimeSessionPetActivity,
  RuntimeSessionPetReaction,
  RuntimeSessionState,
} from '@shadowob/shared/types'
import type { DesktopPetAssetPack, DesktopPetAssetSettings } from './pet-types'

export interface DesktopRuntimeSettings {
  serverBaseUrl: string
  httpProxy: string
  httpsProxy: string
  connectorApiKey: string
  connectorComputerId: string
  connectorAutoStart: boolean
  connectorWorkDir: string
  connectorBuddyWorkDirs: Record<string, string>
  connectorDeletedConnectionIds: string[]
  connectorRuntimeNotifications: Record<string, boolean>
  ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
  asrProvider: 'sherpa-local' | 'web-speech'
  shortcuts: DesktopShortcutSettings
  desktopPetVisible: boolean
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
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
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

export type ConnectorRuntimeSessionState = RuntimeSessionState

export type ConnectorRuntimeSessionPetReaction = RuntimeSessionPetReaction

export type ConnectorRuntimeInstanceStatus =
  | 'running'
  | 'available'
  | 'stopped'
  | 'missing'
  | 'error'

export interface ConnectorRuntimeInstanceInfo {
  runtimeId: string
  instanceId: string
  label: string
  status: ConnectorRuntimeInstanceStatus
  endpoint?: string | null
  capabilities: string[]
  error?: string | null
  metadata?: Record<string, unknown>
}

export interface ConnectorRuntimeSessionInfo {
  runtimeId: string
  instanceId: string
  sessionId: string
  title?: string | null
  workDir?: string | null
  state: ConnectorRuntimeSessionState
  petReaction?: ConnectorRuntimeSessionPetReaction
  petActivity?: RuntimeSessionPetActivity
  model?: string | null
  lastActivityAt?: string | null
  startedAt?: string | null
  source: string
  native?: Record<string, unknown>
}

export interface ConnectorRuntimeSessionSnapshot {
  scannedAt: string
  runtimeIds: string[]
  instances: ConnectorRuntimeInstanceInfo[]
  sessions: ConnectorRuntimeSessionInfo[]
}

export interface ConnectorRuntimeScanResult {
  runtimes: ConnectorRuntimeInfo[]
  runtimeSessions?: ConnectorRuntimeSessionSnapshot | null
  cached?: boolean
}

export interface ConnectorBuddyCreateInput {
  runtimeId: string
  name: string
  username: string
  description?: string
  avatarUrl?: string | null
}

export interface ConnectorBuddyCreateResult {
  connections: ConnectorConnection[]
  connectionError?: string | null
  agent?: {
    id?: string | null
    userId?: string | null
    buddyUserId?: string | null
    botUser?: {
      id?: string | null
      username?: string | null
      displayName?: string | null
      avatarUrl?: string | null
    } | null
  } | null
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

export type UpdateChannel = 'production' | 'beta'

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
  openCommunityLogin?: (redirect?: string) => Promise<boolean>
  getCommunityAuthToken?: () => Promise<string>
  getCommunityAuthTokens?: () => Promise<{ accessToken: string; refreshToken: string }>
  communityFetchJson?: <T = unknown>(input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
    optional?: boolean
  }) => Promise<T>
  openExternal?: (url: string) => Promise<boolean>
  selectDirectory?: (defaultPath?: string) => Promise<string | null>
  getVersion: () => Promise<string>
  checkForUpdate: () => Promise<{
    hasUpdate: boolean
    version: string
    downloadUrl: string
    releaseNotes: string
    channel: UpdateChannel
  }>
  getUpdateSettings: () => Promise<{ autoCheckOnLaunch: boolean; channel: UpdateChannel }>
  setUpdateSettings: (settings: {
    autoCheckOnLaunch?: boolean
    channel?: UpdateChannel
  }) => Promise<{
    autoCheckOnLaunch: boolean
    channel: UpdateChannel
  }>
  getUpdateState: () => Promise<{
    status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
    checkedAt: number | null
    info: {
      hasUpdate: boolean
      version: string
      downloadUrl: string
      releaseNotes: string
      channel: UpdateChannel
    } | null
    error: string | null
    channel: UpdateChannel
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
        channel: UpdateChannel
      } | null
      error: string | null
      channel: UpdateChannel
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
    importFile?: (file: File) => Promise<DesktopPetAssetSettings>
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
    scanRuntimes?: (input?: { force?: boolean }) => Promise<ConnectorRuntimeScanResult>
    installRuntime?: (input: { runtimeId: string }) => Promise<{
      runtimes: ConnectorRuntimeInfo[]
      runtimeSessions?: ConnectorRuntimeSessionSnapshot | null
      installed?: ConnectorRuntimeInfo | null
    }>
    createBuddy?: (input: ConnectorBuddyCreateInput) => Promise<ConnectorBuddyCreateResult>
    getConnections: () => Promise<ConnectorConnection[]>
    setConnectionEnabled: (input: {
      agentId: string
      enabled: boolean
    }) => Promise<ConnectorConnection[]>
    deleteConnection?: (input: {
      agentId: string
      deleteCloudBuddy?: boolean
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
  onConnectorRuntimeState?: (callback: (state: ConnectorRuntimeScanResult) => void) => () => void
  onDesktopSettingsChanged?: (callback: (settings: DesktopRuntimeSettings) => void) => () => void
  onSettingsTabRequest?: (callback: (tab: DesktopSettingsTab) => void) => () => void
}
