import type { ReaderStateSnapshot } from '@shadowob/shared'
import { BrowserWindow, clipboard, dialog, type IpcMainInvokeEvent, ipcMain, shell } from 'electron'
import { communityAuthSnapshotSchema, rendererLogSchema } from '../validators/ipc.schema'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

type DesktopRuntimeHandlerDependencies = {
  logRendererMessage: (scope: string, payload: unknown) => void
  getMainWindow: () => BrowserWindow | null
  openReader: (input: {
    url?: string
    title?: string
    useDefaultApp?: boolean
    attachmentId?: string
  }) => Promise<boolean>
  getReaderState: () => ReaderStateSnapshot
  activateReader: (id: string) => ReaderStateSnapshot
  closeReader: (id: string) => ReaderStateSnapshot
  openReaderWithDefaultApp: (id: string) => Promise<boolean>
  quit: () => void
  rememberCommunityAuthSnapshot: (input: {
    accessToken?: string
    refreshToken?: string
    reason: 'startup' | 'storage' | 'sync' | 'login' | 'refresh' | 'logout' | 'settings' | 'revoked'
  }) => void
  readCommunityAccessToken: () => Promise<string> | string
  readCommunityAuthTokens: () => Promise<{ accessToken: string; refreshToken: string }>
  fetchCommunityJson: (input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
    optional?: boolean
  }) => Promise<unknown>
  modelProxyStream: (
    event: IpcMainInvokeEvent,
    input: { requestId: string; body: Record<string, unknown> },
  ) => Promise<{ text: string }>
  communityBrowserLoginUrl: (redirect?: string) => string
  showMainWindow: () => void
  showCommunityWindow: (path?: string) => void
  showCreateBuddyWindow: () => void
  showDesktopSettingsWindow: (tab?: string) => void
  showPetWindow: () => void
  hidePetWindow: () => void
  showDesktopContextMenu: (window: BrowserWindow | null) => void
  setPetPanelMode: (mode: 'compact' | 'expanded') => { stageOffsetY: number }
  beginPetWindowDrag: (input: { pointerId?: number; screenX?: number; screenY?: number }) => void
  movePetWindow: (input: {
    x?: number
    y?: number
    pointerId?: number
    screenX?: number
    screenY?: number
  }) => void
  endPetWindowDrag: (pointerId?: number) => void
}

export function registerDesktopRendererLogHandler(
  logRendererMessage: DesktopRuntimeHandlerDependencies['logRendererMessage'],
): void {
  ipcMain.on('desktop:rendererLog', (_event, payload: unknown) => {
    const parsed = rendererLogSchema.safeParse(payload)
    if (!parsed.success) return
    if (!parsed.data.scope.startsWith('[desktop-')) return
    logRendererMessage(parsed.data.scope, parsed.data.payload)
  })
}

export function registerDesktopRuntimeHandlers(deps: DesktopRuntimeHandlerDependencies): void {
  ipcMain.on('desktop:communityAuthSnapshot', (_event, payload: unknown) => {
    const parsed = communityAuthSnapshotSchema.parse(payload)
    deps.rememberCommunityAuthSnapshot({
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      reason: parsed.reason,
    })
  })

  const windowService = {
    minimizeToTray: () => {
      const win = deps.getMainWindow()
      if (win) win.hide()
    },
    openExternal: (input) => {
      try {
        const url = new URL(input)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
        void shell.openExternal(url.toString())
        return true
      } catch {
        return false
      }
    },
    writeClipboardText: (input) => {
      clipboard.writeText(input)
      return true
    },
    selectDirectory: async (input) => {
      const { defaultPath } = input
      const result = await dialog.showOpenDialog({
        title: 'Select Working Directory',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    quit: () => deps.quit(),
    showMainWindow: () => deps.showMainWindow(),
    showCommunity: (input) => deps.showCommunityWindow(input),
    openCommunityLogin: (input) => {
      void shell.openExternal(deps.communityBrowserLoginUrl(input))
      return true
    },
    showCreateBuddy: () => deps.showCreateBuddyWindow(),
    showContextMenu: (_input, event) => {
      deps.showDesktopContextMenu(BrowserWindow.fromWebContents(event.sender))
    },
    showSettings: (input) => deps.showDesktopSettingsWindow(input),
  } satisfies DesktopIPCServiceImplementation<'window'>

  const reader = {
    open: (input) => deps.openReader(input),
    getState: () => deps.getReaderState(),
    activate: (input) => deps.activateReader(input.id),
    close: (input) => deps.closeReader(input.id),
    openDefault: (input) => deps.openReaderWithDefaultApp(input.id),
  } satisfies DesktopIPCServiceImplementation<'reader'>

  const community = {
    getAuthToken: () => deps.readCommunityAccessToken(),
    getAuthTokens: () => deps.readCommunityAuthTokens(),
    fetchJson: (input) => deps.fetchCommunityJson(input),
  } satisfies DesktopIPCServiceImplementation<'community'>

  const petWindow = {
    show: () => deps.showPetWindow(),
    hide: () => deps.hidePetWindow(),
    setPanelMode: (input) => deps.setPetPanelMode(input),
    beginWindowDrag: (input) => {
      deps.beginPetWindowDrag(input)
    },
    moveWindow: (input) => {
      deps.movePetWindow(input)
    },
    endWindowDrag: (input) => {
      deps.endPetWindowDrag(input)
    },
  } satisfies DesktopIPCServiceImplementation<'petWindow'>

  const petModel = {
    modelProxyStream: (input, event) => deps.modelProxyStream(event, input),
  } satisfies DesktopIPCServiceImplementation<'petModel'>

  registerDesktopIPCService('window', windowService)
  registerDesktopIPCService('reader', reader)
  registerDesktopIPCService('community', community)
  registerDesktopIPCService('petWindow', petWindow)
  registerDesktopIPCService('petModel', petModel)
}
