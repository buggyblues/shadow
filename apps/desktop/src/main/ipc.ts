import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { AuthRequestInit, LoginCredentials, ShadowNotification } from '../shared/types'
import type { CommunityService } from './services/community'
import type { SessionService } from './services/session'
import { getPetWindow, setPetPanelMode } from './window'

function isSafeExternalUrl(raw: string) {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isAllowedAuthRequestPath(path: string) {
  try {
    const url = new URL(path, 'https://shadowob.app')
    return url.origin === 'https://shadowob.app' && url.pathname.startsWith('/api/auth/')
  } catch {
    return false
  }
}

async function readAuthProxyResponse(response: Response) {
  const text = await response.text()
  const body = text ? tryParseJson(text) : {}
  if (!response.ok) {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const message =
      typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : `Shadow auth request failed (${response.status})`
    throw new Error(message)
  }
  return body
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { text }
  }
}

export function setupIpcHandlers(input: {
  webOrigin: string
  session: SessionService
  community: CommunityService
}) {
  const { webOrigin, session, community } = input

  ipcMain.handle('desktop:config', () => ({
    platform: process.platform,
    version: app.getVersion(),
    webOrigin,
  }))
  ipcMain.handle('desktop:panel-mode', (_event, mode: 'compact' | 'expanded') => {
    setPetPanelMode(mode)
  })
  ipcMain.handle('desktop:move-window', (_event, delta: { x: number; y: number }) => {
    const win = getPetWindow()
    if (!win || win.isDestroyed()) return
    const [x, y] = win.getPosition()
    const dx = Number.isFinite(delta?.x) ? delta.x : 0
    const dy = Number.isFinite(delta?.y) ? delta.y : 0
    win.setPosition(Math.round((x ?? 0) + dx), Math.round((y ?? 0) + dy), false)
  })
  ipcMain.handle('desktop:open-external', (_event, rawUrl: string) => {
    if (!isSafeExternalUrl(rawUrl)) return false
    void shell.openExternal(rawUrl)
    return true
  })
  ipcMain.handle('desktop:quit', () => app.quit())

  ipcMain.handle('auth:get-session', () => session.getPublicSession())
  ipcMain.handle('auth:login', (_event, credentials: LoginCredentials) =>
    session.login(credentials),
  )
  ipcMain.handle('auth:open-login', () => session.openLoginInBrowser())
  ipcMain.handle('auth:import-callback', (_event, rawUrl: string) => session.importCallback(rawUrl))
  ipcMain.handle(
    'auth:accept-session',
    (
      _event,
      input: {
        user: Parameters<SessionService['importSession']>[0]['user']
        accessToken: string
        refreshToken: string
      },
    ) => session.importSession(input),
  )
  ipcMain.handle('auth:request', async (_event, path: string, init?: AuthRequestInit) => {
    if (!isAllowedAuthRequestPath(path)) throw new Error('AUTH_REQUEST_FORBIDDEN')
    const url = new URL(path, webOrigin)
    const response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: init?.body,
    })
    return readAuthProxyResponse(response)
  })
  ipcMain.handle('auth:logout', () => session.logout())

  session.on('changed', (publicSession) => {
    for (const win of electronWindows()) {
      win.webContents.send('auth:changed', publicSession)
    }
  })

  ipcMain.handle('community:servers', () => community.listServers())
  ipcMain.handle('community:channels', (_event, serverId: string) =>
    community.listChannels(serverId),
  )
  ipcMain.handle('community:notifications', (_event, limit?: number) =>
    community.listNotifications(limit),
  )
  ipcMain.handle('community:notification-read', (_event, id: string) =>
    community.markNotificationRead(id),
  )
  ipcMain.handle('community:open-notification', (_event, notification: ShadowNotification) => {
    community.openNotification(notification)
  })
  ipcMain.handle('community:get-subscriptions', () => community.getSubscriptions())
  ipcMain.handle('community:set-subscriptions', (_event, channelIds: string[]) =>
    community.setSubscriptions(channelIds),
  )
}

function electronWindows() {
  return BrowserWindow.getAllWindows()
}
