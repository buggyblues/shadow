import type { DesktopIPCApi } from '@shadowob/shared'
import { desktopIpcProtocol } from '@shadowob/shared'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createIPCClient, ElectronIPCClientTransport } from '../preload/ipc-client'
import {
  DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT,
  isCommunityAuthRequiredError,
  normalizeCommunityAccessToken,
  normalizeCommunityAuthError,
  readCommunityAuthTokensFromStorage,
} from '../shared/community-auth'

const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'
const DEFAULT_DESKTOP_SERVER_BASE_URL = 'https://shadowob.com'
const RENDERER_LOG_REDACTED_KEYS = /token|authorization|password|secret|apikey|api_key/i

type DesktopRuntimeSettingsSnapshot = {
  serverBaseUrl: string
  httpProxy: string
  httpsProxy: string
}

type CommunityAuthSyncReason =
  | 'startup'
  | 'storage'
  | 'sync'
  | 'login'
  | 'refresh'
  | 'logout'
  | 'settings'
  | 'revoked'

function serializeRendererLogValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (!value || typeof value !== 'object') return value
  return redactRendererLogValue(value)
}

function redactRendererLogValue(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (!value || typeof value !== 'object') return value
  if (depth > 4) return '[truncated]'
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactRendererLogValue(item, depth + 1))
  }
  const record = value as Record<string, unknown>
  const redacted: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(record).slice(0, 80)) {
    redacted[key] = RENDERER_LOG_REDACTED_KEYS.test(key)
      ? '[redacted]'
      : redactRendererLogValue(entry, depth + 1)
  }
  return redacted
}

function sendRendererLog(scope: string, payload: unknown): void {
  if (typeof scope !== 'string' || !scope.startsWith('[desktop-')) return
  ipcRenderer.send('desktop:rendererLog', {
    scope,
    payload: serializeRendererLogValue(payload),
  })
}

contextBridge.exposeInMainWorld('desktopPetDebugLog', (scope: string, payload: unknown) => {
  if (typeof scope !== 'string' || !scope.startsWith('[desktop-pet:')) return
  sendRendererLog(scope, payload)
})

function installRendererErrorLogging(): void {
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      sendRendererLog(`[desktop-renderer:${level}]`, {
        url: window.location.href,
        args: args.map(serializeRendererLogValue),
      })
    }
  }

  window.addEventListener('error', (event) => {
    sendRendererLog('[desktop-renderer:error]', {
      url: window.location.href,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: serializeRendererLogValue(event.error),
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    sendRendererLog('[desktop-renderer:unhandledrejection]', {
      url: window.location.href,
      reason: serializeRendererLogValue(event.reason),
    })
  })
}

installRendererErrorLogging()

function applyDesktopDocumentClasses(): void {
  const apply = () => {
    document.documentElement.classList.add(
      'desktop-app',
      `desktop-${process.platform}`,
      'desktop-community-window',
    )
  }
  if (document.documentElement) apply()
  window.addEventListener('DOMContentLoaded', apply, { once: true })
}

function normalizeDesktopRuntimeSettings(settings: unknown): DesktopRuntimeSettingsSnapshot | null {
  if (!settings || typeof settings !== 'object') return null
  const record = settings as Record<string, unknown>
  const serverBaseUrl =
    typeof record.serverBaseUrl === 'string'
      ? normalizeDesktopServerBaseUrl(record.serverBaseUrl)
      : DEFAULT_DESKTOP_SERVER_BASE_URL
  return {
    serverBaseUrl,
    httpProxy: typeof record.httpProxy === 'string' ? record.httpProxy : '',
    httpsProxy: typeof record.httpsProxy === 'string' ? record.httpsProxy : '',
  }
}

function normalizeDesktopServerBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim() || DEFAULT_DESKTOP_SERVER_BASE_URL)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.search = ''
      url.hash = ''
      const path = url.pathname.replace(/\/+$/, '')
      return path && path !== '/' ? `${url.origin}${path}` : url.origin
    }
  } catch {
    // Fall through to the hosted community.
  }
  return DEFAULT_DESKTOP_SERVER_BASE_URL
}

function persistDesktopRuntimeSettings(settings: unknown): void {
  const normalized = normalizeDesktopRuntimeSettings(settings)
  if (!normalized) return
  try {
    window.localStorage?.setItem(DESKTOP_SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent('shadow:desktop-runtime-settings-changed'))
  } catch {
    // Ignore origins where localStorage is unavailable.
  }
}

async function syncDesktopRuntimeSettings(): Promise<void> {
  try {
    persistDesktopRuntimeSettings(await desktopIPC.settings.get())
  } catch {
    // Keep the last persisted runtime settings.
  }
}

ipcRenderer.on('desktop:settingsChanged', (_event, settings) => {
  persistDesktopRuntimeSettings(settings)
})

let lastSyncedCommunityAuthSnapshot: string | null = null

function readCommunityAuthSnapshot(): { accessToken: string; refreshToken: string } {
  return readCommunityAuthTokensFromStorage((key) => window.localStorage?.getItem(key))
}

async function injectCommunityAuthSnapshot(): Promise<void> {
  try {
    const tokens = await desktopIPC.community.getAuthTokens()
    const accessToken = normalizeCommunityAccessToken(tokens?.accessToken)
    const refreshToken = normalizeCommunityAccessToken(tokens?.refreshToken)
    if (!accessToken && !refreshToken) return
    if (accessToken) window.localStorage?.setItem('accessToken', accessToken)
    if (refreshToken) window.localStorage?.setItem('refreshToken', refreshToken)
    lastSyncedCommunityAuthSnapshot = `${accessToken}\n${refreshToken}`
    window.dispatchEvent(
      new CustomEvent('shadow:desktop-community-auth-updated', {
        detail: {
          accessToken,
          refreshToken,
          authenticated: Boolean(accessToken),
          reason: 'startup',
        },
      }),
    )
  } catch {
    // The remote community page can still complete login through the browser callback.
  }
}

function syncCommunityAuthSnapshot(
  options: {
    force?: boolean
    accessToken?: string | null
    refreshToken?: string | null
    reason?: CommunityAuthSyncReason
  } = {},
): void {
  try {
    const storedTokens = readCommunityAuthSnapshot()
    const accessToken =
      options.accessToken === undefined
        ? storedTokens.accessToken
        : normalizeCommunityAccessToken(options.accessToken)
    const refreshToken =
      options.refreshToken === undefined
        ? storedTokens.refreshToken
        : normalizeCommunityAccessToken(options.refreshToken)
    const snapshotKey = `${accessToken}\n${refreshToken}`
    if (!options.force && snapshotKey === lastSyncedCommunityAuthSnapshot) return
    lastSyncedCommunityAuthSnapshot = snapshotKey
    ipcRenderer.send('desktop:communityAuthSnapshot', {
      accessToken,
      refreshToken,
      reason: options.reason ?? 'sync',
      sourceUrl: window.location.href,
    })
  } catch {
    // Ignore origins where localStorage is unavailable.
  }
}

function forceSyncCommunityAuthToken(): void {
  syncCommunityAuthSnapshot({ force: true, reason: 'startup' })
}

function syncCommunityAuthTokenOnStorage(): void {
  syncCommunityAuthSnapshot({ reason: 'storage' })
}

const CODEX_PET_ARCHIVE_PATTERN = /\.zip$/i
const PRELOAD_HANDLED_PET_ASSET_DROP = '__shadowPetAssetDropHandled'
const DESKTOP_PET_ASSET_DROP_EVENT = 'shadow:desktop-pet-asset-drop'

type PreloadHandledDragEvent = DragEvent & {
  [PRELOAD_HANDLED_PET_ASSET_DROP]?: boolean
}

function isDesktopPetAssetDropTarget(): boolean {
  const params = new URLSearchParams(window.location.search)
  const view = params.get('view')
  if (!view || view === 'pet') return true
  return view === 'settings' && params.get('tab') === 'pet'
}

function isDesktopPetAssetDragEvent(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? [])
  return types.some((type) => {
    const normalized = type.toLowerCase()
    return (
      normalized === 'files' ||
      normalized === 'text/uri-list' ||
      normalized === 'public.file-url' ||
      normalized.includes('file')
    )
  })
}

function codexPetArchiveFile(files: FileList): File | null {
  return Array.from(files).find((file) => CODEX_PET_ARCHIVE_PATTERN.test(file.name)) ?? null
}

function filePathFromFileUri(value: string): string {
  if (value.startsWith('/')) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return ''
    return decodeURIComponent(url.pathname)
  } catch {
    return ''
  }
}

function codexPetArchiveUriPath(event: DragEvent): string {
  const transfer = event.dataTransfer
  for (const type of ['text/uri-list', 'public.file-url', 'text/plain']) {
    const uriList = transfer?.getData(type) ?? ''
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const path = filePathFromFileUri(trimmed)
      if (path && CODEX_PET_ARCHIVE_PATTERN.test(path)) return path
    }
  }
  return ''
}

function markPetAssetDropHandled(event: DragEvent): void {
  ;(event as PreloadHandledDragEvent)[PRELOAD_HANDLED_PET_ASSET_DROP] = true
}

function dispatchDesktopPetAssetDropStatus(status: 'started' | 'imported' | 'failed'): void {
  window.dispatchEvent(new CustomEvent(DESKTOP_PET_ASSET_DROP_EVENT, { detail: { status } }))
}

async function importDesktopPetAssetFile(file: File): Promise<unknown> {
  const path = webUtils.getPathForFile(file)
  if (path) return desktopIPC.petAssets.importDirectory({ path })
  return desktopIPC.petAssets.importArchiveBuffer({
    name: file.name,
    data: await file.arrayBuffer(),
  })
}

function installDesktopPetAssetDropFallback(): void {
  if (!isDesktopPetAssetDropTarget()) return

  window.addEventListener(
    'dragenter',
    (event) => {
      if (!isDesktopPetAssetDragEvent(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    },
    true,
  )

  window.addEventListener(
    'dragover',
    (event) => {
      if (!isDesktopPetAssetDragEvent(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    },
    true,
  )

  window.addEventListener(
    'drop',
    (event) => {
      if (!isDesktopPetAssetDragEvent(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      const file = event.dataTransfer?.files ? codexPetArchiveFile(event.dataTransfer.files) : null
      const uriPath = file ? '' : codexPetArchiveUriPath(event)
      if (!file && !uriPath) return
      markPetAssetDropHandled(event)
      event.stopImmediatePropagation()
      dispatchDesktopPetAssetDropStatus('started')
      const importTask = file
        ? importDesktopPetAssetFile(file)
        : desktopIPC.petAssets.importDirectory({ path: uriPath })
      void importTask
        .then(() => dispatchDesktopPetAssetDropStatus('imported'))
        .catch(() => dispatchDesktopPetAssetDropStatus('failed'))
    },
    true,
  )
}

function dispatchCommunityAuthRequired(): void {
  try {
    window.dispatchEvent(new CustomEvent(DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT))
  } catch {
    // Ignore pages where DOM event dispatching is unavailable.
  }
}

const desktopIPC: DesktopIPCApi = createIPCClient(
  desktopIpcProtocol,
  new ElectronIPCClientTransport(),
)

async function invokeCommunityCall<Result>(call: () => Promise<Result>): Promise<Result> {
  try {
    return await call()
  } catch (error) {
    const normalized = normalizeCommunityAuthError(error)
    if (isCommunityAuthRequiredError(normalized)) dispatchCommunityAuthRequired()
    throw normalized
  }
}

const desktopAPI = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  isDesktop: true as const,

  // Notifications
  showNotification: (
    title: string,
    body: string,
    channelId?: string,
    options?: { routePath?: string; messageId?: string; target?: 'community' | 'pet' },
  ) => {
    return desktopIPC.notifications.show({
      title,
      body,
      channelId,
      routePath: options?.routePath,
      messageId: options?.messageId,
      target: options?.target,
    }) as Promise<void>
  },
  setBadgeCount: (count: number) => {
    return desktopIPC.notifications.setBadgeCount(count)
  },
  setNotificationMode: (mode: 'all' | 'mentions' | 'none') => {
    void desktopIPC.notifications.setMode(mode)
  },

  // Window
  minimizeToTray: () => {
    void desktopIPC.window.minimizeToTray()
  },
  openExternal: (url: string) => {
    return desktopIPC.window.openExternal(url)
  },
  writeClipboardText: (text: string) => {
    return desktopIPC.window.writeClipboardText(text)
  },
  openReader: (input: {
    url: string
    title?: string
    useDefaultApp?: boolean
    attachmentId?: string
  }) => {
    return desktopIPC.reader.open(input)
  },
  selectDirectory: (defaultPath?: string) => {
    return desktopIPC.window.selectDirectory({ defaultPath })
  },
  quit: () => {
    return desktopIPC.window.quit()
  },
  getCommunityAuthToken: () => {
    return desktopIPC.community.getAuthToken()
  },
  getCommunityAuthTokens: () => {
    return desktopIPC.community.getAuthTokens()
  },
  diagnostics: {
    getSnapshot: () => {
      return desktopIPC.diagnostics.getSnapshot()
    },
    exportLogs: () => {
      return desktopIPC.diagnostics.exportLogs()
    },
  },
  syncCommunityAuthToken: (
    accessToken?: string | null,
    refreshToken?: string | null,
    reason?: CommunityAuthSyncReason,
  ) => {
    syncCommunityAuthSnapshot({ force: true, accessToken, refreshToken, reason: reason ?? 'sync' })
  },
  communityFetchJson: (input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
    optional?: boolean
  }) => {
    return invokeCommunityCall(() => desktopIPC.community.fetchJson(input))
  },
  showMainWindow: () => {
    return desktopIPC.window.showMainWindow()
  },
  showCommunity: (path?: string) => {
    return desktopIPC.window.showCommunity(path)
  },
  openCommunityLogin: (redirect?: string) => {
    return desktopIPC.window.openCommunityLogin(redirect)
  },
  showCreateBuddy: () => {
    return desktopIPC.window.showCreateBuddy()
  },
  showContextMenu: () => {
    return desktopIPC.window.showContextMenu()
  },
  showSettings: (
    tab?: 'general' | 'connector' | 'shortcuts' | 'voice' | 'pet' | 'network' | 'about',
  ) => {
    return desktopIPC.window.showSettings(tab)
  },
  reader: {
    getState: () => {
      return desktopIPC.reader.getState()
    },
    activate: (id: string) => {
      return desktopIPC.reader.activate({ id })
    },
    close: (id: string) => {
      return desktopIPC.reader.close({ id })
    },
    openDefault: (id: string) => {
      return desktopIPC.reader.openDefault({ id })
    },
    onState: (
      callback: (state: {
        activeId: string | null
        tabs: Array<{
          id: string
          title: string
          sourceUrl: string
          displayAddress: string
          contentType: string
          fileName: string
          assetUrl: string
          createdAt: number
        }>
      }) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: {
          activeId: string | null
          tabs: Array<{
            id: string
            title: string
            sourceUrl: string
            displayAddress: string
            contentType: string
            fileName: string
            assetUrl: string
            createdAt: number
          }>
        },
      ) => callback(state)
      ipcRenderer.on('desktop:reader:state', handler)
      return () => ipcRenderer.removeListener('desktop:reader:state', handler)
    },
  },
  pet: {
    show: () => {
      return desktopIPC.petWindow.show()
    },
    hide: () => {
      return desktopIPC.petWindow.hide()
    },
    setPanelMode: (mode: 'compact' | 'expanded') => {
      return desktopIPC.petWindow.setPanelMode(mode)
    },
    beginWindowDrag: (input: { pointerId?: number; screenX: number; screenY: number }) => {
      return desktopIPC.petWindow.beginWindowDrag(input)
    },
    moveWindow: (delta: {
      x?: number
      y?: number
      pointerId?: number
      screenX?: number
      screenY?: number
    }) => {
      return desktopIPC.petWindow.moveWindow(delta)
    },
    endWindowDrag: (pointerId?: number) => {
      return desktopIPC.petWindow.endWindowDrag(pointerId)
    },
    modelProxyStream: (
      input: { requestId: string; body: Record<string, unknown> },
      onDelta: (delta: string) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId: string; delta: string },
      ) => {
        if (payload.requestId === input.requestId) onDelta(payload.delta)
      }
      ipcRenderer.on('desktop:pet:modelProxyDelta', handler)
      return invokeCommunityCall(() => desktopIPC.petModel.modelProxyStream(input)).finally(() =>
        ipcRenderer.removeListener('desktop:pet:modelProxyDelta', handler),
      )
    },
    speak: (text: string) => {
      return desktopIPC.petVoice.speak(text)
    },
    cancelSpeech: () => {
      return desktopIPC.petVoice.cancelSpeech()
    },
    voiceEngineStatus: () => {
      return desktopIPC.petVoice.voiceEngineStatus()
    },
    prewarmVoice: () => {
      return desktopIPC.petVoice.prewarmVoice()
    },
    installVoiceModel: (input: { provider: 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2' }) => {
      return desktopIPC.petVoice.installVoiceModel(input)
    },
    asrStart: () => {
      return desktopIPC.petVoice.asrStart()
    },
    asrAccept: (input: { samples: ArrayBuffer; sampleRate: number }) => {
      return desktopIPC.petVoice.asrAccept(input)
    },
    asrStop: () => {
      return desktopIPC.petVoice.asrStop()
    },
    onAsrPartial: (callback: (payload: { text: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { text: string }) =>
        callback(payload)
      ipcRenderer.on('desktop:pet:asrPartial', handler)
      return () => ipcRenderer.removeListener('desktop:pet:asrPartial', handler)
    },
    onVoiceModelProgress: (
      callback: (payload: {
        key: 'asr' | 'tts'
        phase: 'download' | 'extract' | 'ready'
        receivedBytes?: number
        totalBytes?: number
        percent?: number
      }) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: {
          key: 'asr' | 'tts'
          phase: 'download' | 'extract' | 'ready'
          receivedBytes?: number
          totalBytes?: number
          percent?: number
        },
      ) => callback(payload)
      ipcRenderer.on('desktop:pet:voiceModelProgress', handler)
      return () => ipcRenderer.removeListener('desktop:pet:voiceModelProgress', handler)
    },
    onShortcut: (
      callback: (action: 'voice' | 'chat' | 'notifications' | 'services' | 'care') => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        action: 'voice' | 'chat' | 'notifications' | 'services' | 'care',
      ) => callback(action)
      ipcRenderer.on('desktop:pet:shortcut', handler)
      return () => ipcRenderer.removeListener('desktop:pet:shortcut', handler)
    },
  },

  // Process Management
  startAgent: (config: { name: string; scriptPath: string; args?: string[] }) => {
    return desktopIPC.agents.start(config)
  },
  stopAgent: (processId: string) => {
    return desktopIPC.agents.stop(processId)
  },
  getAgentStatus: (processId: string) => {
    return desktopIPC.agents.getStatus(processId)
  },
  listAgents: () => {
    return desktopIPC.agents.list()
  },

  // Event listeners
  onNavigateToChannel: (callback: (channelId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, channelId: string) => callback(channelId)
    ipcRenderer.on('desktop:navigateToChannel', handler)
    return () => ipcRenderer.removeListener('desktop:navigateToChannel', handler)
  },

  // Auto-update & Settings
  getVersion: () => desktopIPC.app.getVersion(),
  checkForUpdate: () => desktopIPC.updates.check(),
  getUpdateState: () => desktopIPC.updates.getState(),
  getUpdateSettings: () => desktopIPC.updates.getSettings(),
  setUpdateSettings: (settings: { autoCheckOnLaunch?: boolean; channel?: 'production' | 'beta' }) =>
    desktopIPC.updates.setSettings(settings),
  downloadUpdate: (url: string) => desktopIPC.updates.download(url),
  setOpenAtLogin: (v: boolean) => {
    void desktopIPC.app.setOpenAtLogin(v)
  },
  getOpenAtLogin: () => desktopIPC.app.getOpenAtLogin(),
  quitAndRestart: () => {
    void desktopIPC.app.quitAndRestart()
  },
  getDesktopSettings: () => desktopIPC.settings.get(),
  setDesktopSettings: (settings: {
    serverBaseUrl?: string
    httpProxy?: string
    httpsProxy?: string
    connectorApiKey?: string
    connectorComputerId?: string
    connectorAutoStart?: boolean
    connectorWorkDir?: string
    connectorBuddyWorkDirs?: Record<string, string>
    connectorRuntimeNotifications?: Record<string, boolean>
    ttsProvider?: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
    asrProvider?: 'sherpa-local' | 'web-speech'
    shortcuts?: {
      openCommunity?: string
      togglePet?: string
      petVoice?: string
      petChat?: string
      showNotifications?: string
    }
    desktopPetVisible?: boolean
    desktopPetActivePackId?: string
    desktopPetPacks?: Array<Record<string, unknown>>
  }) => desktopIPC.settings.set(settings),
  petAssets: {
    importDirectory: (path?: string) => desktopIPC.petAssets.importDirectory({ path }),
    importFile: (file: File) => importDesktopPetAssetFile(file),
    importMarketplace: (input: { entitlementId: string; fileId: string; productId?: string }) =>
      invokeCommunityCall(() => desktopIPC.petAssets.importMarketplace(input)),
    setActive: (packId: string) => desktopIPC.petAssets.setActive({ packId }),
    remove: (packId: string) => desktopIPC.petAssets.remove({ packId }),
  },
  connector: {
    getStatus: () => desktopIPC.connector.getStatus(),
    start: (settings?: {
      serverBaseUrl?: string
      httpProxy?: string
      httpsProxy?: string
      connectorApiKey?: string
      connectorComputerId?: string
      connectorAutoStart?: boolean
      connectorWorkDir?: string
    }) => desktopIPC.connector.start(settings ?? {}),
    stop: () => desktopIPC.connector.stop(),
    scan: () => desktopIPC.connector.scan(),
    scanRuntimes: (input?: { force?: boolean }) =>
      desktopIPC.connector.scanRuntimes(input ?? {}) as Promise<{
        runtimes: Array<{
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
        }>
        runtimeSessions?: {
          scannedAt: string
          runtimeIds: string[]
          instances: Array<{
            runtimeId: string
            instanceId: string
            label: string
            status: 'running' | 'available' | 'stopped' | 'missing' | 'error'
            endpoint?: string | null
            capabilities: string[]
            error?: string | null
            metadata?: Record<string, unknown>
          }>
          sessions: Array<{
            runtimeId: string
            instanceId: string
            sessionId: string
            title?: string | null
            workDir?: string | null
            state:
              | 'idle'
              | 'running'
              | 'streaming'
              | 'tool_call'
              | 'waiting_for_approval'
              | 'blocked'
              | 'completed'
              | 'failed'
              | 'stopped'
              | 'unknown'
            model?: string | null
            lastActivityAt?: string | null
            startedAt?: string | null
            source: string
            petReaction?:
              | 'idle'
              | 'thinking'
              | 'working'
              | 'editing'
              | 'running'
              | 'testing'
              | 'waiting'
              | 'waving'
              | 'success'
              | 'error'
              | 'celebrating'
            petActivity?: {
              kind:
                | 'thinking'
                | 'reading'
                | 'working'
                | 'editing'
                | 'running'
                | 'testing'
                | 'tool_call'
                | 'approval'
                | 'waiting'
                | 'success'
                | 'error'
              label?: string | null
            }
            native?: Record<string, unknown>
          }>
        } | null
        cached?: boolean
      }>,
    scanRuntimeSessions: (input?: { force?: boolean }) =>
      desktopIPC.connector.scanRuntimeSessions(input ?? {}) as Promise<{
        runtimes?: Array<{
          id: string
          label: string
          status: 'available' | 'missing'
        }>
        runtimeSessions: {
          scannedAt: string
          runtimeIds: string[]
          instances: Array<{
            runtimeId: string
            instanceId: string
            label: string
            status: 'running' | 'available' | 'stopped' | 'missing' | 'error'
            endpoint?: string | null
            capabilities: string[]
            error?: string | null
            metadata?: Record<string, unknown>
          }>
          sessions: Array<{
            runtimeId: string
            instanceId: string
            sessionId: string
            title?: string | null
            lastActivityAt?: string | null
            state:
              | 'idle'
              | 'running'
              | 'streaming'
              | 'tool_call'
              | 'waiting_for_approval'
              | 'blocked'
              | 'completed'
              | 'failed'
              | 'stopped'
              | 'unknown'
            petReaction?:
              | 'idle'
              | 'thinking'
              | 'working'
              | 'editing'
              | 'running'
              | 'testing'
              | 'waiting'
              | 'waving'
              | 'success'
              | 'error'
              | 'celebrating'
            petActivity?: {
              kind:
                | 'thinking'
                | 'reading'
                | 'working'
                | 'editing'
                | 'running'
                | 'testing'
                | 'tool_call'
                | 'approval'
                | 'waiting'
                | 'success'
                | 'error'
              label?: string | null
            }
          }>
        }
        cached?: boolean
      }>,
    installRuntime: (input: { runtimeId: string }) =>
      desktopIPC.connector.installRuntime(input) as Promise<{
        runtimes: Array<{
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
        }>
      }>,
    createBuddy: (input: {
      runtimeId: string
      name: string
      username: string
      description?: string
      avatarUrl?: string | null
    }) =>
      desktopIPC.connector.createBuddy({
        ...input,
        avatarUrl: input.avatarUrl ?? null,
      }) as Promise<{
        connections: Array<{
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
        }>
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
      }>,
    getConnections: () => desktopIPC.connector.getConnections(),
    setConnectionEnabled: (input: { agentId: string; enabled: boolean }) =>
      desktopIPC.connector.setConnectionEnabled(input),
    deleteConnection: (input: { agentId: string; deleteCloudBuddy?: boolean }) =>
      desktopIPC.connector.deleteConnection(input),
    setConnectionWorkDir: (input: { agentId: string; workDir: string }) =>
      desktopIPC.connector.setConnectionWorkDir(input),
  },

  // Agent event listeners
  onAgentMessage: (callback: (data: { id: string; message: unknown }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; message: unknown }) =>
      callback(data)
    ipcRenderer.on('desktop:agentMessage', handler)
    return () => ipcRenderer.removeListener('desktop:agentMessage', handler)
  },
  onAgentExited: (callback: (data: { id: string; code: number | null }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { id: string; code: number | null },
    ) => callback(data)
    ipcRenderer.on('desktop:agentExited', handler)
    return () => ipcRenderer.removeListener('desktop:agentExited', handler)
  },
  onUpdateState: (
    callback: (data: {
      status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
      checkedAt: number | null
      info: {
        hasUpdate: boolean
        version: string
        downloadUrl: string
        releaseNotes: string
        channel: 'production' | 'beta'
      } | null
      error: string | null
      channel: 'production' | 'beta'
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
        checkedAt: number | null
        info: {
          hasUpdate: boolean
          version: string
          downloadUrl: string
          releaseNotes: string
          channel: 'production' | 'beta'
        } | null
        error: string | null
        channel: 'production' | 'beta'
      },
    ) => callback(data)
    ipcRenderer.on('desktop:updateState', handler)
    return () => ipcRenderer.removeListener('desktop:updateState', handler)
  },
  onDesktopSettingsChanged: (
    callback: (settings: {
      serverBaseUrl: string
      httpProxy: string
      httpsProxy: string
      connectorApiKey: string
      connectorComputerId: string
      connectorAutoStart: boolean
      connectorWorkDir: string
      connectorBuddyWorkDirs: Record<string, string>
      connectorRuntimeNotifications: Record<string, boolean>
      shortcuts: {
        openCommunity: string
        togglePet: string
        petVoice: string
        petChat: string
        showNotifications: string
      }
      desktopPetVisible: boolean
      desktopPetActivePackId: string
      desktopPetPacks: Array<Record<string, unknown>>
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      settings: {
        serverBaseUrl: string
        httpProxy: string
        httpsProxy: string
        connectorApiKey: string
        connectorComputerId: string
        connectorAutoStart: boolean
        connectorWorkDir: string
        connectorBuddyWorkDirs: Record<string, string>
        connectorRuntimeNotifications: Record<string, boolean>
        ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
        asrProvider: 'sherpa-local' | 'web-speech'
        shortcuts: {
          openCommunity: string
          togglePet: string
          petVoice: string
          petChat: string
          showNotifications: string
        }
        desktopPetVisible: boolean
        desktopPetActivePackId: string
        desktopPetPacks: Array<Record<string, unknown>>
      },
    ) => callback(settings)
    ipcRenderer.on('desktop:settingsChanged', handler)
    return () => ipcRenderer.removeListener('desktop:settingsChanged', handler)
  },
  onConnectorState: (callback: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('desktop:connectorState', handler)
    return () => ipcRenderer.removeListener('desktop:connectorState', handler)
  },
  onConnectorRuntimeState: (callback: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('desktop:connectorRuntimeState', handler)
    return () => ipcRenderer.removeListener('desktop:connectorRuntimeState', handler)
  },
  onSettingsTabRequest: (
    callback: (
      tab: 'general' | 'connector' | 'shortcuts' | 'voice' | 'pet' | 'network' | 'about',
    ) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      tab: 'general' | 'connector' | 'shortcuts' | 'voice' | 'pet' | 'network' | 'about',
    ) => callback(tab)
    ipcRenderer.on('desktop:settings:selectTab', handler)
    return () => ipcRenderer.removeListener('desktop:settings:selectTab', handler)
  },
  reloadShortcuts: () => desktopIPC.shortcuts.reload(),
  suspendShortcuts: () => desktopIPC.shortcuts.suspend(),
  resumeShortcuts: () => desktopIPC.shortcuts.resume(),
}

contextBridge.exposeInMainWorld('desktopIPC', desktopIPC)
contextBridge.exposeInMainWorld('desktopAPI', desktopAPI)
applyDesktopDocumentClasses()
installDesktopPetAssetDropFallback()
void syncDesktopRuntimeSettings()
void injectCommunityAuthSnapshot().then(() => forceSyncCommunityAuthToken())
window.addEventListener('DOMContentLoaded', () => void syncDesktopRuntimeSettings())
window.addEventListener(
  'DOMContentLoaded',
  () => void injectCommunityAuthSnapshot().then(() => forceSyncCommunityAuthToken()),
)
window.addEventListener('load', () => void syncDesktopRuntimeSettings())
window.addEventListener('load', forceSyncCommunityAuthToken)
window.addEventListener('focus', () => void syncDesktopRuntimeSettings())
window.addEventListener('focus', forceSyncCommunityAuthToken)
window.addEventListener('storage', syncCommunityAuthTokenOnStorage)
window.setInterval(syncCommunityAuthSnapshot, 5000)

export type DesktopAPI = typeof desktopAPI
export type DesktopIPC = typeof desktopIPC
