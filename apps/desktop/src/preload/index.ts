import { contextBridge, ipcRenderer } from 'electron'

const desktopAPI = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  isDesktop: true as const,

  // Notifications
  showNotification: (title: string, body: string, channelId?: string) => {
    ipcRenderer.invoke('desktop:showNotification', { title, body, channelId })
  },
  setBadgeCount: (count: number) => {
    ipcRenderer.invoke('desktop:setBadgeCount', count)
  },
  setNotificationMode: (mode: 'all' | 'mentions' | 'none') => {
    ipcRenderer.invoke('desktop:setNotificationMode', mode)
  },

  // Window
  minimizeToTray: () => {
    ipcRenderer.invoke('desktop:minimizeToTray')
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
  downloadUpdate: (url: string) =>
    ipcRenderer.invoke('desktop:downloadUpdate', url) as Promise<boolean>,
  setOpenAtLogin: (v: boolean) => {
    ipcRenderer.invoke('desktop:setOpenAtLogin', v)
  },
  getOpenAtLogin: () => ipcRenderer.invoke('desktop:getOpenAtLogin') as Promise<boolean>,
  quitAndRestart: () => {
    ipcRenderer.invoke('desktop:quitAndRestart')
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
}

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI)

export type DesktopAPI = typeof desktopAPI
