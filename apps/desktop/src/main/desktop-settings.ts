import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session } from 'electron'

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
}

export type DesktopShortcutAction =
  | 'openCommunity'
  | 'togglePet'
  | 'petVoice'
  | 'petChat'
  | 'showNotifications'

export type DesktopShortcutSettings = Record<DesktopShortcutAction, string>

const DEFAULT_SERVER_BASE_URL =
  process.env.DESKTOP_API_ORIGIN || process.env.VITE_API_BASE || 'https://shadowob.com'

export const defaultDesktopShortcuts: DesktopShortcutSettings = {
  openCommunity: 'CommandOrControl+Alt+Shift+S',
  togglePet: 'CommandOrControl+Alt+Shift+P',
  petVoice: 'CommandOrControl+Alt+Shift+V',
  petChat: 'CommandOrControl+Alt+Shift+C',
  showNotifications: 'CommandOrControl+Alt+Shift+N',
}

const defaultSettings: DesktopRuntimeSettings = {
  serverBaseUrl: normalizeServerBaseUrl(DEFAULT_SERVER_BASE_URL) ?? 'https://shadowob.com',
  httpProxy: '',
  httpsProxy: '',
  connectorApiKey: '',
  connectorAutoStart: false,
  connectorWorkDir: '',
  connectorBuddyWorkDirs: {},
  ttsProvider: 'system',
  asrProvider: 'sherpa-local',
  shortcuts: defaultDesktopShortcuts,
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'desktop-settings.json')
}

export function connectorWorkDirMapFilePath(): string {
  return join(app.getPath('userData'), 'connector-workdirs.json')
}

function normalizeServerBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function normalizeHttpProxy(value: unknown): string {
  if (typeof value !== 'string') return ''
  const input = value.trim()
  if (!input) return ''
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

function normalizeWorkDir(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeConnectorBuddyWorkDirs(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [agentId, workDir] of Object.entries(value)) {
    const normalizedAgentId = agentId.trim()
    const normalizedWorkDir = normalizeWorkDir(workDir)
    if (normalizedAgentId && normalizedWorkDir) result[normalizedAgentId] = normalizedWorkDir
  }
  return result
}

export function normalizeConnectorApiKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  const input = value.trim()
  if (!input) return ''
  const fromCommand = input.match(/--api-key(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/)
  const candidate = (fromCommand?.[1] ?? fromCommand?.[2] ?? fromCommand?.[3] ?? input).trim()
  return candidate.startsWith('sk_machine_') ? candidate : ''
}

function normalizeTtsProvider(value: unknown): DesktopRuntimeSettings['ttsProvider'] {
  return value === 'moss-tts-nano' ||
    value === 'sherpa-local' ||
    value === 'voxcpm2' ||
    value === 'system'
    ? value
    : defaultSettings.ttsProvider
}

function normalizeAsrProvider(value: unknown): DesktopRuntimeSettings['asrProvider'] {
  return value === 'web-speech' || value === 'sherpa-local' ? value : defaultSettings.asrProvider
}

function normalizeShortcuts(value: unknown): DesktopShortcutSettings {
  const incoming =
    value && typeof value === 'object' ? (value as Partial<DesktopShortcutSettings>) : {}
  return {
    openCommunity:
      typeof incoming.openCommunity === 'string' && incoming.openCommunity.trim()
        ? incoming.openCommunity.trim()
        : defaultDesktopShortcuts.openCommunity,
    togglePet:
      typeof incoming.togglePet === 'string' && incoming.togglePet.trim()
        ? incoming.togglePet.trim()
        : defaultDesktopShortcuts.togglePet,
    petVoice:
      typeof incoming.petVoice === 'string' && incoming.petVoice.trim()
        ? incoming.petVoice.trim()
        : defaultDesktopShortcuts.petVoice,
    petChat:
      typeof incoming.petChat === 'string' && incoming.petChat.trim()
        ? incoming.petChat.trim()
        : defaultDesktopShortcuts.petChat,
    showNotifications:
      typeof incoming.showNotifications === 'string' && incoming.showNotifications.trim()
        ? incoming.showNotifications.trim()
        : defaultDesktopShortcuts.showNotifications,
  }
}

function toProxyRules(httpProxy: string, httpsProxy: string): string {
  const rules: string[] = []
  if (httpProxy) {
    const url = new URL(httpProxy)
    rules.push(`http=${url.host}`)
  }
  if (httpsProxy || httpProxy) {
    const url = new URL(httpsProxy || httpProxy)
    rules.push(`https=${url.host}`)
  }
  return rules.join(';')
}

export function readDesktopSettings(): DesktopRuntimeSettings {
  try {
    const path = settingsFilePath()
    if (!existsSync(path)) return defaultSettings
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DesktopRuntimeSettings>
    return {
      serverBaseUrl: normalizeServerBaseUrl(parsed.serverBaseUrl) ?? defaultSettings.serverBaseUrl,
      httpProxy: normalizeHttpProxy(parsed.httpProxy),
      httpsProxy: normalizeHttpProxy(parsed.httpsProxy),
      connectorApiKey: normalizeConnectorApiKey(parsed.connectorApiKey),
      connectorAutoStart: parsed.connectorAutoStart === true,
      connectorWorkDir: normalizeWorkDir(parsed.connectorWorkDir),
      connectorBuddyWorkDirs: normalizeConnectorBuddyWorkDirs(parsed.connectorBuddyWorkDirs),
      ttsProvider: normalizeTtsProvider(parsed.ttsProvider),
      asrProvider: normalizeAsrProvider(parsed.asrProvider),
      shortcuts: normalizeShortcuts(parsed.shortcuts),
    }
  } catch {
    return defaultSettings
  }
}

export function getDesktopServerBaseUrl(): string {
  return readDesktopSettings().serverBaseUrl
}

export function saveDesktopSettings(
  incoming: Partial<DesktopRuntimeSettings>,
): DesktopRuntimeSettings {
  const current = readDesktopSettings()
  const next: DesktopRuntimeSettings = {
    serverBaseUrl: normalizeServerBaseUrl(incoming.serverBaseUrl) ?? current.serverBaseUrl,
    httpProxy:
      incoming.httpProxy === undefined ? current.httpProxy : normalizeHttpProxy(incoming.httpProxy),
    httpsProxy:
      incoming.httpsProxy === undefined
        ? current.httpsProxy
        : normalizeHttpProxy(incoming.httpsProxy),
    connectorApiKey:
      incoming.connectorApiKey === undefined
        ? current.connectorApiKey
        : normalizeConnectorApiKey(incoming.connectorApiKey),
    connectorAutoStart:
      incoming.connectorAutoStart === undefined
        ? current.connectorAutoStart
        : incoming.connectorAutoStart === true,
    connectorWorkDir:
      incoming.connectorWorkDir === undefined
        ? current.connectorWorkDir
        : normalizeWorkDir(incoming.connectorWorkDir),
    connectorBuddyWorkDirs:
      incoming.connectorBuddyWorkDirs === undefined
        ? current.connectorBuddyWorkDirs
        : normalizeConnectorBuddyWorkDirs(incoming.connectorBuddyWorkDirs),
    ttsProvider:
      incoming.ttsProvider === undefined
        ? current.ttsProvider
        : normalizeTtsProvider(incoming.ttsProvider),
    asrProvider:
      incoming.asrProvider === undefined
        ? current.asrProvider
        : normalizeAsrProvider(incoming.asrProvider),
    shortcuts:
      incoming.shortcuts === undefined ? current.shortcuts : normalizeShortcuts(incoming.shortcuts),
  }

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsFilePath(), JSON.stringify(next, null, 2), 'utf8')
  writeConnectorWorkDirMap(next)
  return next
}

export function writeConnectorWorkDirMap(settings = readDesktopSettings()): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(
    connectorWorkDirMapFilePath(),
    JSON.stringify(
      {
        buddies: settings.connectorBuddyWorkDirs,
      },
      null,
      2,
    ),
    'utf8',
  )
}

function broadcastDesktopSettings(settings: DesktopRuntimeSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('desktop:settingsChanged', settings)
    }
  }
}

export async function applyDesktopNetworkSettings(settings = readDesktopSettings()): Promise<void> {
  if (settings.httpProxy || settings.httpsProxy) {
    await session.defaultSession.setProxy({
      proxyRules: toProxyRules(settings.httpProxy, settings.httpsProxy),
    })
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' })
  }
  broadcastDesktopSettings(settings)
}

export function setupDesktopSettingsHandlers(): void {
  ipcMain.handle('desktop:getSettings', () => readDesktopSettings())

  ipcMain.handle(
    'desktop:setSettings',
    async (_event, incoming: Partial<DesktopRuntimeSettings>) => {
      const next = saveDesktopSettings(incoming)
      await applyDesktopNetworkSettings(next)
      return next
    },
  )
}
