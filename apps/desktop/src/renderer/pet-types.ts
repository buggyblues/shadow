import type {
  RuntimeSessionPetActivity,
  RuntimeSessionPetReaction,
  RuntimeSessionState,
} from '@shadowob/shared/types'
import type { PetAction } from './lib/game'
import type { PetProfile } from './lib/pet-profile'

export type DesktopPetAssetSprite = {
  src: string
  frame?: {
    width: number
    height: number
    count: number
    fps: number
  }
  atlas?: {
    columns: number
    rows: number
    row: number
  }
  loop?: boolean
}

export type CodexPetAnimationKey =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review'

export type DesktopPetAssetPack = {
  id: string
  version?: string
  displayName: Record<string, string>
  description?: Record<string, string> | string
  spritesheetPath: string
  sprites: Record<string, DesktopPetAssetSprite>
  importedAt: string
  source: 'builtin' | 'local' | 'marketplace'
  sourcePath?: string
  marketplaceProductId?: string
  marketplaceEntitlementId?: string
  marketplacePaidFileId?: string
}

export type DesktopPetAssetSettings = {
  desktopPetActivePackId: string
  desktopPetPacks: DesktopPetAssetPack[]
}

export type DesktopPetRuntimeSettings = DesktopPetAssetSettings & {
  connectorRuntimeNotifications?: Record<string, boolean>
}

export type DesktopPetPanelModeLayout = {
  stageOffsetY: number
}

export type DesktopPetApi = {
  getCommunityAuthToken?: () => Promise<string>
  getCommunityAuthTokens?: () => Promise<{ accessToken: string; refreshToken: string }>
  showNotification?: (
    title: string,
    body: string,
    channelId?: string,
    options?: { routePath?: string; messageId?: string; target?: 'community' | 'pet' },
  ) => Promise<void>
  setBadgeCount?: (count: number) => Promise<void>
  communityFetchJson?: <T = unknown>(input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
    optional?: boolean
  }) => Promise<T>
  openExternal?: (url: string) => Promise<boolean>
  openReader?: (input: {
    url: string
    title?: string
    useDefaultApp?: boolean
    attachmentId?: string
  }) => Promise<boolean>
  quit?: () => Promise<void>
  showMainWindow?: () => Promise<void>
  showCommunity?: (path?: string) => Promise<void>
  openCommunityLogin?: (redirect?: string) => Promise<boolean>
  showContextMenu?: () => Promise<void>
  showSettings?: (
    tab?: 'general' | 'connector' | 'shortcuts' | 'voice' | 'pet' | 'network' | 'about',
  ) => Promise<void>
  getDesktopSettings?: () => Promise<DesktopPetRuntimeSettings>
  onDesktopSettingsChanged?: (callback: (settings: DesktopPetRuntimeSettings) => void) => () => void
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
  pet?: {
    hide?: () => Promise<void>
    setPanelMode?: (mode: 'compact' | 'expanded') => Promise<DesktopPetPanelModeLayout>
    beginWindowDrag?: (input: {
      pointerId?: number
      screenX: number
      screenY: number
    }) => Promise<void>
    moveWindow?: (delta: {
      x?: number
      y?: number
      pointerId?: number
      screenX?: number
      screenY?: number
    }) => Promise<void>
    endWindowDrag?: (pointerId?: number) => Promise<void>
    modelProxyStream?: (
      input: { requestId: string; body: Record<string, unknown> },
      onDelta: (delta: string) => void,
    ) => Promise<{ text: string }>
    speak?: (text: string) => Promise<boolean>
    cancelSpeech?: () => Promise<void>
    prewarmVoice?: () => Promise<boolean>
    voiceEngineStatus?: () => Promise<{
      engine: string
      nativeAddonAvailable: boolean
      modelRoot: string
      asr: { installed: boolean; name: string; sourceUrl: string }
      tts: { installed: boolean; name: string; sourceUrl: string }
    }>
    asrStart?: () => Promise<{ ok: boolean }>
    asrAccept?: (input: { samples: ArrayBuffer; sampleRate: number }) => Promise<{ ok: boolean }>
    asrStop?: () => Promise<{ text: string }>
    onAsrPartial?: (callback: (payload: { text: string }) => void) => () => void
    onShortcut?: (
      callback: (action: 'voice' | 'chat' | 'notifications' | 'services' | 'care') => void,
    ) => () => void
    onVoiceModelProgress?: (
      callback: (payload: {
        key: 'asr' | 'tts'
        phase: 'download' | 'extract' | 'ready'
        receivedBytes?: number
        totalBytes?: number
        percent?: number
      }) => void,
    ) => () => void
  }
  connector?: {
    getStatus?: () => Promise<{
      running: boolean
      connections: Array<{
        agentId: string
        label: string
        runtimeId: string
        runtimeLabel: string
        workDir?: string
        status: 'running' | 'stopped' | 'error'
      }>
    }>
    scanRuntimes?: (input?: { force?: boolean }) => Promise<{
      runtimes: Array<{
        id: string
        label: string
        status: 'available' | 'missing'
      }>
      runtimeSessions?: {
        sessions: Array<{
          runtimeId: string
          instanceId: string
          sessionId: string
          title?: string | null
          lastActivityAt?: string | null
          state: RuntimeSessionState
          petReaction?: RuntimeSessionPetReaction
          petActivity?: RuntimeSessionPetActivity
        }>
      } | null
    }>
    scanRuntimeSessions?: (input?: { force?: boolean }) => Promise<{
      runtimes?: Array<{
        id: string
        label: string
        status: 'available' | 'missing'
      }>
      runtimeSessions: {
        runtimeIds: string[]
        sessions: Array<{
          runtimeId: string
          instanceId: string
          sessionId: string
          title?: string | null
          lastActivityAt?: string | null
          state: RuntimeSessionState
          petReaction?: RuntimeSessionPetReaction
          petActivity?: RuntimeSessionPetActivity
        }>
      }
    }>
  }
}

export type NotificationItem = {
  id: string
  type?: string | null
  referenceId?: string | null
  referenceType?: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  metadata?: Record<string, unknown> | null
  aggregatedCount?: number | null
  title: string
  body?: string | null
  kind?: string | null
  isRead: boolean
  createdAt?: string
}

export type AppTab = 'chat' | 'care' | 'services' | 'community' | 'subscriptions' | 'store'
export type VisibleAppTab = Exclude<AppTab, 'store'>
export type WheelCommand =
  | 'interact'
  | 'services'
  | 'back'
  | 'community'
  | 'panel'
  | 'voice'
  | 'hide'
  | 'connection'
  | 'serviceFocus'
  | 'serviceWater'
  | 'serviceFitness'
  | 'serviceCoding'
  | PetAction
export type WheelLayer = 'main' | 'interactions' | 'services'
export type PetServiceId = 'water' | 'focus' | 'fitness' | 'coding'
export type PetServiceIntervalId = Extract<PetServiceId, 'focus' | 'water' | 'fitness'>
export type PetServiceState = Record<PetServiceId, boolean> & {
  focusEndsAt: number | null
  focusStartedAt: number | null
  focusDurationMs: number
  waterIntervalMs: number
  lastWaterAt: number
  lastWaterReminderAt: number
  fitnessIntervalMs: number
  lastFitnessAt: number
  lastFitnessReminderAt: number
}

export type PetServiceHistoryDay = {
  date: string
  focusMs: number
  waterCount: number
  fitnessCount: number
  codingReadyCount: number
}

export type ConnectorSnapshot = {
  connectorOnline: boolean
  activeRuntimeSessionCount: number
  onlineCount: number
  runtimeSessionReactions: RuntimeSessionPetReaction[]
  readySessions: Array<{
    id: string
    label: string
    runtimeLabel: string
    source: 'buddy' | 'runtime'
  }>
}

export type PetServiceAlertId = 'water' | 'focus' | 'fitness' | 'coding'

export type PetServiceAlert = {
  id: PetServiceAlertId
  createdAt: number
}

export type { PetProfile }

export type ChannelSubscription = {
  id?: string
  channelId: string
  channelName: string
  serverId: string
  serverSlug?: string | null
  serverName: string
  lastSeenAt?: string
  isDefault?: boolean
}

export type CommunityChannelOption = {
  id: string
  name: string
  serverId: string
  serverSlug?: string | null
  serverName: string
}

export type CommunityServerOption = {
  id: string
  slug?: string | null
  name: string
}

export type SubscriptionFile = {
  id: string
  feedItemId?: string
  messageId?: string
  attachmentId?: string
  title: string
  url: string
  contentType: string
  kind?: 'image' | 'html' | 'pdf' | 'file' | 'voice' | 'card'
  appKey?: string
  appPath?: string
  channelId: string
  channelName: string
  serverId?: string
  serverSlug?: string | null
  serverName: string
  createdAt?: string
  unread: boolean
}
