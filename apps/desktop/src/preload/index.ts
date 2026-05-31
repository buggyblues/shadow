import { contextBridge, ipcRenderer } from 'electron'
import {
  DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT,
  isCommunityAuthRequiredError,
  normalizeCommunityAccessToken,
  normalizeCommunityAuthError,
  readCommunityAuthTokensFromStorage,
} from '../shared/community-auth'

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

let lastSyncedCommunityAuthSnapshot: string | null = null

function readCommunityAuthSnapshot(): { accessToken: string; refreshToken: string } {
  return readCommunityAuthTokensFromStorage((key) => window.localStorage?.getItem(key))
}

function syncCommunityAuthSnapshot(
  options: { force?: boolean; accessToken?: string | null; refreshToken?: string | null } = {},
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
      sourceUrl: window.location.href,
    })
  } catch {
    // Ignore origins where localStorage is unavailable.
  }
}

function forceSyncCommunityAuthToken(): void {
  syncCommunityAuthSnapshot({ force: true })
}

function syncCommunityAuthTokenOnStorage(): void {
  syncCommunityAuthSnapshot()
}

function dispatchCommunityAuthRequired(): void {
  try {
    window.dispatchEvent(new CustomEvent(DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT))
  } catch {
    // Ignore pages where DOM event dispatching is unavailable.
  }
}

async function invokeCommunityIpc<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T
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
    return ipcRenderer.invoke('desktop:showNotification', {
      title,
      body,
      channelId,
      routePath: options?.routePath,
      messageId: options?.messageId,
      target: options?.target,
    }) as Promise<void>
  },
  setBadgeCount: (count: number) => {
    return ipcRenderer.invoke('desktop:setBadgeCount', count) as Promise<void>
  },
  setNotificationMode: (mode: 'all' | 'mentions' | 'none') => {
    ipcRenderer.invoke('desktop:setNotificationMode', mode)
  },

  // Window
  minimizeToTray: () => {
    ipcRenderer.invoke('desktop:minimizeToTray')
  },
  openExternal: (url: string) => {
    return ipcRenderer.invoke('desktop:openExternal', url) as Promise<boolean>
  },
  openReader: (input: {
    url: string
    title?: string
    useDefaultApp?: boolean
    attachmentId?: string
  }) => {
    return ipcRenderer.invoke('desktop:openReader', input) as Promise<boolean>
  },
  selectDirectory: (defaultPath?: string) => {
    return ipcRenderer.invoke('desktop:selectDirectory', { defaultPath }) as Promise<string | null>
  },
  quit: () => {
    return ipcRenderer.invoke('desktop:quit') as Promise<void>
  },
  getCommunityAuthToken: () => {
    return ipcRenderer.invoke('desktop:getCommunityAuthToken') as Promise<string>
  },
  syncCommunityAuthToken: (accessToken?: string | null, refreshToken?: string | null) => {
    syncCommunityAuthSnapshot({ force: true, accessToken, refreshToken })
  },
  communityFetchJson: (input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
  }) => {
    return invokeCommunityIpc('desktop:community:fetchJson', input)
  },
  showMainWindow: () => {
    return ipcRenderer.invoke('desktop:showMainWindow') as Promise<void>
  },
  showCommunity: (path?: string) => {
    return ipcRenderer.invoke('desktop:showCommunity', { path }) as Promise<void>
  },
  showCreateBuddy: () => {
    return ipcRenderer.invoke('desktop:showCreateBuddy') as Promise<void>
  },
  showContextMenu: () => {
    return ipcRenderer.invoke('desktop:showContextMenu') as Promise<void>
  },
  showSettings: (
    tab?: 'general' | 'connector' | 'shortcuts' | 'voice' | 'pet' | 'network' | 'about',
  ) => {
    return ipcRenderer.invoke('desktop:showSettings', { tab }) as Promise<void>
  },
  reader: {
    getState: () => {
      return ipcRenderer.invoke('desktop:reader:getState') as Promise<{
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
      }>
    },
    activate: (id: string) => {
      return ipcRenderer.invoke('desktop:reader:activate', { id }) as Promise<{
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
      }>
    },
    close: (id: string) => {
      return ipcRenderer.invoke('desktop:reader:close', { id }) as Promise<{
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
      }>
    },
    openDefault: (id: string) => {
      return ipcRenderer.invoke('desktop:reader:openDefault', { id }) as Promise<boolean>
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
      return ipcRenderer.invoke('desktop:pet:show') as Promise<void>
    },
    hide: () => {
      return ipcRenderer.invoke('desktop:pet:hide') as Promise<void>
    },
    setPanelMode: (mode: 'compact' | 'expanded') => {
      return ipcRenderer.invoke('desktop:pet:panel-mode', mode) as Promise<void>
    },
    moveWindow: (delta: { x: number; y: number }) => {
      return ipcRenderer.invoke('desktop:pet:move-window', delta) as Promise<void>
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
      return invokeCommunityIpc<{ text: string }>('desktop:pet:modelProxyStream', input).finally(
        () => ipcRenderer.removeListener('desktop:pet:modelProxyDelta', handler),
      )
    },
    speak: (text: string) => {
      return ipcRenderer.invoke('desktop:pet:speak', text) as Promise<boolean>
    },
    cancelSpeech: () => {
      return ipcRenderer.invoke('desktop:pet:cancelSpeech') as Promise<void>
    },
    voiceEngineStatus: () => {
      return ipcRenderer.invoke('desktop:pet:voiceEngineStatus') as Promise<{
        engine: string
        asrProvider: 'sherpa-local' | 'web-speech'
        ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
        nativeAddonAvailable: boolean
        modelRoot: string
        asr: { installed: boolean; name: string; sourceUrl: string }
        tts: { installed: boolean; name: string; sourceUrl: string }
        ttsProviders: Record<
          'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2',
          {
            installed: boolean
            runtimeInstalled?: boolean
            modelInstalled?: boolean
            name: string
            sourceUrl: string
          }
        >
      }>
    },
    prewarmVoice: () => {
      return ipcRenderer.invoke('desktop:pet:prewarmVoice') as Promise<boolean>
    },
    installVoiceModel: (input: { provider: 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2' }) => {
      return ipcRenderer.invoke('desktop:pet:installVoiceModel', input) as Promise<{
        engine: string
        asrProvider: 'sherpa-local' | 'web-speech'
        ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
        nativeAddonAvailable: boolean
        modelRoot: string
        asr: { installed: boolean; name: string; sourceUrl: string }
        tts: { installed: boolean; name: string; sourceUrl: string }
        ttsProviders: Record<
          'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2',
          {
            installed: boolean
            runtimeInstalled?: boolean
            modelInstalled?: boolean
            name: string
            sourceUrl: string
          }
        >
      }>
    },
    asrStart: () => {
      return ipcRenderer.invoke('desktop:pet:asrStart') as Promise<{ ok: boolean }>
    },
    asrAccept: (input: { samples: ArrayBuffer; sampleRate: number }) => {
      return ipcRenderer.invoke('desktop:pet:asrAccept', input) as Promise<{ ok: boolean }>
    },
    asrStop: () => {
      return ipcRenderer.invoke('desktop:pet:asrStop') as Promise<{ text: string }>
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
    return ipcRenderer.invoke('desktop:startAgent', config) as Promise<{ id: string; pid: number }>
  },
  stopAgent: (processId: string) => {
    return ipcRenderer.invoke('desktop:stopAgent', processId)
  },
  getAgentStatus: (processId: string) => {
    return ipcRenderer.invoke('desktop:getAgentStatus', processId)
  },
  listAgents: () => {
    return ipcRenderer.invoke('desktop:listAgents')
  },

  // Event listeners
  onNavigateToChannel: (callback: (channelId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, channelId: string) => callback(channelId)
    ipcRenderer.on('desktop:navigateToChannel', handler)
    return () => ipcRenderer.removeListener('desktop:navigateToChannel', handler)
  },

  // Auto-update & Settings
  getVersion: () => ipcRenderer.invoke('desktop:getVersion') as Promise<string>,
  checkForUpdate: () =>
    ipcRenderer.invoke('desktop:checkForUpdate') as Promise<{
      hasUpdate: boolean
      version: string
      downloadUrl: string
      releaseNotes: string
    }>,
  getUpdateState: () =>
    ipcRenderer.invoke('desktop:getUpdateState') as Promise<{
      status: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
      checkedAt: number | null
      info: {
        hasUpdate: boolean
        version: string
        downloadUrl: string
        releaseNotes: string
      } | null
      error: string | null
    }>,
  getUpdateSettings: () =>
    ipcRenderer.invoke('desktop:getUpdateSettings') as Promise<{ autoCheckOnLaunch: boolean }>,
  setUpdateSettings: (settings: { autoCheckOnLaunch: boolean }) =>
    ipcRenderer.invoke('desktop:setUpdateSettings', settings) as Promise<{
      autoCheckOnLaunch: boolean
    }>,
  downloadUpdate: (url: string) =>
    ipcRenderer.invoke('desktop:downloadUpdate', url) as Promise<boolean>,
  setOpenAtLogin: (v: boolean) => {
    ipcRenderer.invoke('desktop:setOpenAtLogin', v)
  },
  getOpenAtLogin: () => ipcRenderer.invoke('desktop:getOpenAtLogin') as Promise<boolean>,
  quitAndRestart: () => {
    ipcRenderer.invoke('desktop:quitAndRestart')
  },
  getDesktopSettings: () =>
    ipcRenderer.invoke('desktop:getSettings') as Promise<{
      serverBaseUrl: string
      httpProxy: string
      httpsProxy: string
      connectorApiKey: string
      connectorAutoStart: boolean
      connectorWorkDir: string
      connectorBuddyWorkDirs: Record<string, string>
      ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
      asrProvider: 'sherpa-local' | 'web-speech'
      shortcuts: {
        openCommunity: string
        togglePet: string
        petVoice: string
        petChat: string
        showNotifications: string
      }
      desktopPetActivePackId: string
      desktopPetPacks: Array<Record<string, unknown>>
    }>,
  setDesktopSettings: (settings: {
    serverBaseUrl?: string
    httpProxy?: string
    httpsProxy?: string
    connectorApiKey?: string
    connectorAutoStart?: boolean
    connectorWorkDir?: string
    connectorBuddyWorkDirs?: Record<string, string>
    ttsProvider?: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
    asrProvider?: 'sherpa-local' | 'web-speech'
    shortcuts?: {
      openCommunity?: string
      togglePet?: string
      petVoice?: string
      petChat?: string
      showNotifications?: string
    }
    desktopPetActivePackId?: string
    desktopPetPacks?: Array<Record<string, unknown>>
  }) =>
    ipcRenderer.invoke('desktop:setSettings', settings) as Promise<{
      serverBaseUrl: string
      httpProxy: string
      httpsProxy: string
      connectorApiKey: string
      connectorAutoStart: boolean
      connectorWorkDir: string
      connectorBuddyWorkDirs: Record<string, string>
      ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
      asrProvider: 'sherpa-local' | 'web-speech'
      shortcuts: {
        openCommunity: string
        togglePet: string
        petVoice: string
        petChat: string
        showNotifications: string
      }
      desktopPetActivePackId: string
      desktopPetPacks: Array<Record<string, unknown>>
    }>,
  petAssets: {
    importDirectory: (path?: string) =>
      ipcRenderer.invoke('desktop:petAssets:importDirectory', { path }) as Promise<unknown>,
    importMarketplace: (input: { entitlementId: string; fileId: string; productId?: string }) =>
      invokeCommunityIpc('desktop:petAssets:importMarketplace', input),
    setActive: (packId: string) =>
      ipcRenderer.invoke('desktop:petAssets:setActive', { packId }) as Promise<unknown>,
    remove: (packId: string) =>
      ipcRenderer.invoke('desktop:petAssets:remove', { packId }) as Promise<unknown>,
  },
  connector: {
    getStatus: () => ipcRenderer.invoke('desktop:connector:getStatus'),
    start: (settings?: {
      serverBaseUrl?: string
      httpProxy?: string
      httpsProxy?: string
      connectorApiKey?: string
      connectorAutoStart?: boolean
      connectorWorkDir?: string
    }) => ipcRenderer.invoke('desktop:connector:start', settings),
    stop: () => ipcRenderer.invoke('desktop:connector:stop'),
    scan: () => ipcRenderer.invoke('desktop:connector:scan') as Promise<{ output: string }>,
    scanRuntimes: () =>
      ipcRenderer.invoke('desktop:connector:scanRuntimes') as Promise<{
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
    installRuntime: (input: { runtimeId: string }) =>
      ipcRenderer.invoke('desktop:connector:installRuntime', input) as Promise<{
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
    getConnections: () => ipcRenderer.invoke('desktop:connector:getConnections'),
    setConnectionEnabled: (input: { agentId: string; enabled: boolean }) =>
      ipcRenderer.invoke('desktop:connector:setConnectionEnabled', input),
    setConnectionWorkDir: (input: { agentId: string; workDir: string }) =>
      ipcRenderer.invoke('desktop:connector:setConnectionWorkDir', input),
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
      } | null
      error: string | null
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
        } | null
        error: string | null
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
      connectorAutoStart: boolean
      connectorWorkDir: string
      connectorBuddyWorkDirs: Record<string, string>
      shortcuts: {
        openCommunity: string
        togglePet: string
        petVoice: string
        petChat: string
        showNotifications: string
      }
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
        connectorAutoStart: boolean
        connectorWorkDir: string
        connectorBuddyWorkDirs: Record<string, string>
        ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
        asrProvider: 'sherpa-local' | 'web-speech'
        shortcuts: {
          openCommunity: string
          togglePet: string
          petVoice: string
          petChat: string
          showNotifications: string
        }
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
  reloadShortcuts: () => ipcRenderer.invoke('desktop:shortcuts:reload'),
  suspendShortcuts: () => ipcRenderer.invoke('desktop:shortcuts:suspend'),
  resumeShortcuts: () => ipcRenderer.invoke('desktop:shortcuts:resume'),
}

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI)

applyDesktopDocumentClasses()
forceSyncCommunityAuthToken()
window.addEventListener('DOMContentLoaded', forceSyncCommunityAuthToken)
window.addEventListener('load', forceSyncCommunityAuthToken)
window.addEventListener('focus', forceSyncCommunityAuthToken)
window.addEventListener('storage', syncCommunityAuthTokenOnStorage)
window.setInterval(syncCommunityAuthSnapshot, 5000)

export type DesktopAPI = typeof desktopAPI
