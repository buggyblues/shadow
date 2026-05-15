import { contextBridge, ipcRenderer } from 'electron'
import type {
  AuthRequestInit,
  CommunityEvent,
  DesktopConfig,
  LoginCredentials,
  PublicSession,
  ShadowChannel,
  ShadowNotification,
  ShadowServerEntry,
} from '../shared/types'

const shadowPet = {
  desktop: {
    getConfig: () => ipcRenderer.invoke('desktop:config') as Promise<DesktopConfig>,
    setPanelMode: (mode: 'compact' | 'expanded') => ipcRenderer.invoke('desktop:panel-mode', mode),
    openExternal: (url: string) =>
      ipcRenderer.invoke('desktop:open-external', url) as Promise<boolean>,
    moveWindow: (delta: { x: number; y: number }) =>
      ipcRenderer.invoke('desktop:move-window', delta) as Promise<void>,
    quit: () => ipcRenderer.invoke('desktop:quit') as Promise<void>,
  },
  auth: {
    getSession: () => ipcRenderer.invoke('auth:get-session') as Promise<PublicSession>,
    login: (credentials: LoginCredentials) =>
      ipcRenderer.invoke('auth:login', credentials) as Promise<PublicSession>,
    openLogin: () => ipcRenderer.invoke('auth:open-login') as Promise<void>,
    importCallback: (url: string) =>
      ipcRenderer.invoke('auth:import-callback', url) as Promise<PublicSession>,
    acceptSession: (session: { user: unknown; accessToken: string; refreshToken: string }) =>
      ipcRenderer.invoke('auth:accept-session', session) as Promise<PublicSession>,
    request: <T>(path: string, init?: AuthRequestInit) =>
      ipcRenderer.invoke('auth:request', path, init) as Promise<T>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<PublicSession>,
    onChanged: (callback: (session: PublicSession) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, session: PublicSession) =>
        callback(session)
      ipcRenderer.on('auth:changed', handler)
      return () => ipcRenderer.removeListener('auth:changed', handler)
    },
  },
  community: {
    listServers: () => ipcRenderer.invoke('community:servers') as Promise<ShadowServerEntry[]>,
    listChannels: (serverId: string) =>
      ipcRenderer.invoke('community:channels', serverId) as Promise<ShadowChannel[]>,
    listNotifications: (limit?: number) =>
      ipcRenderer.invoke('community:notifications', limit) as Promise<ShadowNotification[]>,
    markNotificationRead: (id: string) =>
      ipcRenderer.invoke('community:notification-read', id) as Promise<ShadowNotification>,
    openNotification: (notification: ShadowNotification) =>
      ipcRenderer.invoke('community:open-notification', notification) as Promise<void>,
    getSubscriptions: () => ipcRenderer.invoke('community:get-subscriptions') as Promise<string[]>,
    setSubscriptions: (channelIds: string[]) =>
      ipcRenderer.invoke('community:set-subscriptions', channelIds) as Promise<string[]>,
    onEvent: (callback: (event: CommunityEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: CommunityEvent) =>
        callback(payload)
      ipcRenderer.on('community:event', handler)
      return () => ipcRenderer.removeListener('community:event', handler)
    },
  },
}

contextBridge.exposeInMainWorld('shadowPet', shadowPet)

export type ShadowPetBridge = typeof shadowPet
