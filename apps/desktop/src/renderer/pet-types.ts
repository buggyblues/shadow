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
  loop?: boolean
}

export type DesktopPetAssetPack = {
  id: string
  version: string
  displayName: Record<string, string>
  description?: Record<string, string> | string
  author?: { name?: string; url?: string }
  license?: { kind?: string; summary?: string }
  compatibility?: {
    shadowDesktop?: string
    renderer?: Array<'sprite-sheet' | 'live2d-cubism'>
    features?: string[]
  }
  entry?: {
    renderer?: 'sprite-sheet' | 'live2d-cubism'
    pixelRatio?: number
    canvas?: { width?: number; height?: number }
    anchor?: { x?: number; y?: number }
  }
  files?: { cover?: string; thumbnail?: string }
  sprites: Record<string, DesktopPetAssetSprite>
  expressions?: Record<string, unknown>
  hitAreas?: Record<string, unknown>
  interactionMap?: Record<string, unknown>
  importedAt: string
  source: 'local' | 'marketplace'
  sourcePath?: string
  marketplaceProductId?: string
  marketplaceEntitlementId?: string
  marketplacePaidFileId?: string
}

export type DesktopPetAssetSettings = {
  desktopPetActivePackId: string
  desktopPetPacks: DesktopPetAssetPack[]
}

export type DesktopPetApi = {
  getCommunityAuthToken?: () => Promise<string>
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
  showContextMenu?: () => Promise<void>
  showSettings?: (
    tab?: 'general' | 'connector' | 'shortcuts' | 'voice' | 'pet' | 'network' | 'about',
  ) => Promise<void>
  getDesktopSettings?: () => Promise<DesktopPetAssetSettings>
  onDesktopSettingsChanged?: (callback: (settings: DesktopPetAssetSettings) => void) => () => void
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
  pet?: {
    hide?: () => Promise<void>
    setPanelMode?: (mode: 'compact' | 'expanded') => Promise<void>
    moveWindow?: (delta: { x: number; y: number }) => Promise<void>
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
  | 'back'
  | 'community'
  | 'panel'
  | 'voice'
  | 'hide'
  | 'connection'
  | PetAction
export type WheelLayer = 'main' | 'interactions'
export type PetServiceId = 'water' | 'focus' | 'fitness' | 'coding'
export type PetServiceState = Record<PetServiceId, boolean> & {
  focusEndsAt: number | null
  focusStartedAt: number | null
  focusDurationMs: number
  lastWaterAt: number
  lastWaterReminderAt: number
  lastFitnessAt: number
  lastFitnessReminderAt: number
}

export type ConnectorSnapshot = {
  running: boolean
  onlineCount: number
  readySessions: Array<{
    id: string
    label: string
    runtimeLabel: string
  }>
}

export type PetServiceAlertId = 'water' | 'focus' | 'fitness' | 'coding'

export type PetServiceAlert = {
  id: PetServiceAlertId
  createdAt: number
}

export type { PetProfile }

export type ChannelSubscription = {
  channelId: string
  channelName: string
  serverId: string
  serverName: string
  lastSeenAt?: string
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
  attachmentId?: string
  title: string
  url: string
  contentType: string
  channelId: string
  channelName: string
  serverName: string
  createdAt?: string
  unread: boolean
}
