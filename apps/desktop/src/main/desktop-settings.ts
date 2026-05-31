import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session } from 'electron'

export type DesktopPetAssetRenderer = 'sprite-sheet' | 'live2d-cubism'

export interface DesktopPetAssetSprite {
  src: string
  frame?: {
    width: number
    height: number
    count: number
    fps: number
  }
  loop?: boolean
}

export interface DesktopPetAssetPack {
  id: string
  version: string
  displayName: Record<string, string>
  description?: Record<string, string> | string
  author?: { name?: string; url?: string }
  license?: { kind?: string; summary?: string }
  compatibility?: {
    shadowDesktop?: string
    renderer?: DesktopPetAssetRenderer[]
    features?: string[]
  }
  entry?: {
    renderer?: DesktopPetAssetRenderer
    pixelRatio?: number
    canvas?: { width?: number; height?: number }
    anchor?: { x?: number; y?: number }
  }
  files?: {
    cover?: string
    thumbnail?: string
  }
  sprites: Record<string, DesktopPetAssetSprite>
  expressions?: Record<string, unknown>
  hitAreas?: Record<string, unknown>
  interactionMap?: Record<string, unknown>
  importedAt: string
  source: 'local' | 'marketplace'
  sourcePath: string
  marketplaceProductId?: string
  marketplaceEntitlementId?: string
  marketplacePaidFileId?: string
}

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

export const DEFAULT_SERVER_BASE_URL = 'https://shadowob.com'
const desktopSettingsAppliedListeners = new Set<(settings: DesktopRuntimeSettings) => void>()

export const defaultDesktopShortcuts: DesktopShortcutSettings = {
  openCommunity: 'CommandOrControl+Alt+Shift+S',
  togglePet: 'CommandOrControl+Alt+Shift+P',
  petVoice: 'CommandOrControl+Alt+Shift+V',
  petChat: 'CommandOrControl+Alt+Shift+C',
  showNotifications: 'CommandOrControl+Alt+Shift+N',
}

const defaultSettings: DesktopRuntimeSettings = {
  serverBaseUrl: '',
  httpProxy: '',
  httpsProxy: '',
  connectorApiKey: '',
  connectorAutoStart: false,
  connectorWorkDir: '',
  connectorBuddyWorkDirs: {},
  ttsProvider: 'system',
  asrProvider: 'sherpa-local',
  shortcuts: defaultDesktopShortcuts,
  desktopPetActivePackId: '',
  desktopPetPacks: [],
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

function normalizeConfiguredServerBaseUrl(value: unknown, fallback: string): string {
  if (value === undefined) return fallback
  if (typeof value !== 'string') return fallback
  const input = value.trim()
  if (!input) return ''
  return normalizeServerBaseUrl(input) ?? fallback
}

export function resolveDesktopServerBaseUrl(
  settings: Pick<DesktopRuntimeSettings, 'serverBaseUrl'> = readDesktopSettings(),
): string {
  return normalizeServerBaseUrl(settings.serverBaseUrl) ?? DEFAULT_SERVER_BASE_URL
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

function normalizeLocaleMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [locale, text] of Object.entries(value)) {
    const normalizedLocale = locale.trim()
    if (normalizedLocale && typeof text === 'string' && text.trim()) {
      result[normalizedLocale] = text.trim()
    }
  }
  return result
}

function normalizeDesktopPetSprite(value: unknown): DesktopPetAssetSprite | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<DesktopPetAssetSprite>
  if (typeof record.src !== 'string' || !record.src.trim()) return null
  const sprite: DesktopPetAssetSprite = { src: record.src.trim() }
  const frame = record.frame
  if (frame && typeof frame === 'object') {
    const width = Math.floor(Number(frame.width))
    const height = Math.floor(Number(frame.height))
    const count = Math.floor(Number(frame.count))
    const fps = Math.floor(Number(frame.fps))
    if (width > 0 && height > 0 && count > 0 && fps > 0) {
      sprite.frame = { width, height, count, fps }
    }
  }
  if (typeof record.loop === 'boolean') sprite.loop = record.loop
  return sprite
}

function normalizeDesktopPetPacks(value: unknown): DesktopPetAssetPack[] {
  if (!Array.isArray(value)) return []
  const packs: DesktopPetAssetPack[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Partial<DesktopPetAssetPack>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const version = typeof record.version === 'string' ? record.version.trim() : ''
    const sourcePath = typeof record.sourcePath === 'string' ? record.sourcePath.trim() : ''
    const displayName = normalizeLocaleMap(record.displayName)
    const sprites: Record<string, DesktopPetAssetSprite> = {}
    if (record.sprites && typeof record.sprites === 'object' && !Array.isArray(record.sprites)) {
      for (const [key, sprite] of Object.entries(record.sprites)) {
        const normalized = normalizeDesktopPetSprite(sprite)
        if (key.trim() && normalized) sprites[key.trim()] = normalized
      }
    }
    if (!id || !version || !sourcePath || !displayName.en || !sprites.idle || seen.has(id)) {
      continue
    }
    seen.add(id)
    packs.push({
      id,
      version,
      displayName,
      description:
        typeof record.description === 'string'
          ? record.description
          : normalizeLocaleMap(record.description),
      author: record.author && typeof record.author === 'object' ? record.author : undefined,
      license: record.license && typeof record.license === 'object' ? record.license : undefined,
      compatibility:
        record.compatibility && typeof record.compatibility === 'object'
          ? record.compatibility
          : undefined,
      entry: record.entry && typeof record.entry === 'object' ? record.entry : undefined,
      files: record.files && typeof record.files === 'object' ? record.files : undefined,
      sprites,
      expressions:
        record.expressions && typeof record.expressions === 'object'
          ? record.expressions
          : undefined,
      hitAreas:
        record.hitAreas && typeof record.hitAreas === 'object' ? record.hitAreas : undefined,
      interactionMap:
        record.interactionMap && typeof record.interactionMap === 'object'
          ? record.interactionMap
          : undefined,
      importedAt:
        typeof record.importedAt === 'string' && record.importedAt.trim()
          ? record.importedAt.trim()
          : new Date().toISOString(),
      source: record.source === 'marketplace' ? 'marketplace' : 'local',
      sourcePath,
      marketplaceProductId:
        typeof record.marketplaceProductId === 'string' ? record.marketplaceProductId : undefined,
      marketplaceEntitlementId:
        typeof record.marketplaceEntitlementId === 'string'
          ? record.marketplaceEntitlementId
          : undefined,
      marketplacePaidFileId:
        typeof record.marketplacePaidFileId === 'string' ? record.marketplacePaidFileId : undefined,
    })
  }
  return packs
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
      serverBaseUrl: normalizeConfiguredServerBaseUrl(
        parsed.serverBaseUrl,
        defaultSettings.serverBaseUrl,
      ),
      httpProxy: normalizeHttpProxy(parsed.httpProxy),
      httpsProxy: normalizeHttpProxy(parsed.httpsProxy),
      connectorApiKey: normalizeConnectorApiKey(parsed.connectorApiKey),
      connectorAutoStart: parsed.connectorAutoStart === true,
      connectorWorkDir: normalizeWorkDir(parsed.connectorWorkDir),
      connectorBuddyWorkDirs: normalizeConnectorBuddyWorkDirs(parsed.connectorBuddyWorkDirs),
      ttsProvider: normalizeTtsProvider(parsed.ttsProvider),
      asrProvider: normalizeAsrProvider(parsed.asrProvider),
      shortcuts: normalizeShortcuts(parsed.shortcuts),
      desktopPetPacks: normalizeDesktopPetPacks(parsed.desktopPetPacks),
      desktopPetActivePackId:
        typeof parsed.desktopPetActivePackId === 'string' ? parsed.desktopPetActivePackId : '',
    }
  } catch {
    return defaultSettings
  }
}

export function getDesktopServerBaseUrl(): string {
  return resolveDesktopServerBaseUrl()
}

export function saveDesktopSettings(
  incoming: Partial<DesktopRuntimeSettings>,
): DesktopRuntimeSettings {
  const current = readDesktopSettings()
  const next: DesktopRuntimeSettings = {
    serverBaseUrl: normalizeConfiguredServerBaseUrl(incoming.serverBaseUrl, current.serverBaseUrl),
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
    desktopPetPacks:
      incoming.desktopPetPacks === undefined
        ? current.desktopPetPacks
        : normalizeDesktopPetPacks(incoming.desktopPetPacks),
    desktopPetActivePackId:
      incoming.desktopPetActivePackId === undefined
        ? current.desktopPetActivePackId
        : typeof incoming.desktopPetActivePackId === 'string'
          ? incoming.desktopPetActivePackId
          : '',
  }
  if (
    next.desktopPetActivePackId &&
    !next.desktopPetPacks.some((pack) => pack.id === next.desktopPetActivePackId)
  ) {
    next.desktopPetActivePackId = ''
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

export function broadcastDesktopSettings(settings: DesktopRuntimeSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('desktop:settingsChanged', settings)
    }
  }
}

export function onDesktopSettingsApplied(
  listener: (settings: DesktopRuntimeSettings) => void,
): () => void {
  desktopSettingsAppliedListeners.add(listener)
  return () => desktopSettingsAppliedListeners.delete(listener)
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
  for (const listener of desktopSettingsAppliedListeners) listener(settings)
}

export function setupDesktopSettingsHandlers(): void {
  ipcMain.on('desktop:getSettingsSync', (event) => {
    event.returnValue = readDesktopSettings()
  })

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
