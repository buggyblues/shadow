import { randomUUID } from 'node:crypto'
import { constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveShadowDeviceIdentitySync } from '@shadowob/shared/node/device-identity'
import { app, BrowserWindow, session } from 'electron'
import {
  type CodexPetSpriteVersion,
  codexPetAtlasRows,
  parseCodexPetSpriteVersion,
} from '../../shared/pet-spritesheet-contract'

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

export interface DesktopPetAssetSprite {
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

export interface DesktopPetAssetPack {
  id: string
  version?: string
  spriteVersionNumber: CodexPetSpriteVersion
  displayName: Record<string, string>
  description?: Record<string, string> | string
  spritesheetPath: string
  sprites: Record<string, DesktopPetAssetSprite>
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
  connectorComputerId: string
  connectorInstallationId: string
  connectorDeviceFingerprint: string
  connectorAutoStart: boolean
  connectorWorkDir: string
  connectorBuddyWorkDirs: Record<string, string>
  connectorDeletedConnectionIds: string[]
  connectorRuntimeNotifications: Record<string, boolean>
  ttsProvider: 'system' | 'moss-tts-nano' | 'sherpa-local' | 'voxcpm2'
  asrProvider: 'sherpa-local' | 'web-speech'
  shortcuts: DesktopShortcutSettings
  desktopPetVisible: boolean
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

const legacyDefaultDesktopShortcuts: Record<DesktopShortcutAction, string[]> = {
  openCommunity: ['CommandOrControl+Shift+S', 'CommandOrControl+Alt+Shift+S'],
  togglePet: ['CommandOrControl+Shift+P', 'CommandOrControl+Alt+Shift+P'],
  petVoice: ['CommandOrControl+Shift+V', 'CommandOrControl+Alt+Shift+V'],
  petChat: ['CommandOrControl+Shift+C', 'CommandOrControl+Alt+Shift+C'],
  showNotifications: ['CommandOrControl+Shift+N', 'CommandOrControl+Alt+Shift+N'],
}

export const defaultDesktopShortcuts: DesktopShortcutSettings = {
  openCommunity: 'CommandOrControl+Alt+Shift+1',
  togglePet: 'CommandOrControl+Alt+Shift+2',
  petVoice: 'CommandOrControl+Alt+Shift+3',
  petChat: 'CommandOrControl+Alt+Shift+4',
  showNotifications: 'CommandOrControl+Alt+Shift+5',
}

const defaultSettings: DesktopRuntimeSettings = {
  serverBaseUrl: '',
  httpProxy: '',
  httpsProxy: '',
  connectorApiKey: '',
  connectorComputerId: '',
  connectorInstallationId: randomUUID(),
  connectorDeviceFingerprint: '',
  connectorAutoStart: true,
  connectorWorkDir: '',
  connectorBuddyWorkDirs: {},
  connectorDeletedConnectionIds: [],
  connectorRuntimeNotifications: {},
  ttsProvider: 'system',
  asrProvider: 'sherpa-local',
  shortcuts: defaultDesktopShortcuts,
  desktopPetVisible: false,
  desktopPetActivePackId: '',
  desktopPetPacks: [],
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'desktop-settings.json')
}

function connectorWorkDirMapFilePath(): string {
  return join(app.getPath('userData'), 'connector-workdirs.json')
}

function normalizeConfiguredBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.search = ''
    url.hash = ''
    const path = url.pathname.replace(/\/+$/, '')
    return path && path !== '/' ? `${url.origin}${path}` : url.origin
  } catch {
    return null
  }
}

function normalizeConfiguredServerBaseUrl(value: unknown, fallback: string): string {
  if (value === undefined) return fallback
  if (typeof value !== 'string') return fallback
  const input = value.trim()
  if (!input) return ''
  return normalizeConfiguredBaseUrl(input) ?? fallback
}

function resolveDesktopAppBaseUrl(
  settings: Pick<DesktopRuntimeSettings, 'serverBaseUrl'> = readDesktopSettings(),
): string {
  const configured = normalizeConfiguredBaseUrl(settings.serverBaseUrl)
  if (!configured) return `${DEFAULT_SERVER_BASE_URL}/app`
  const url = new URL(configured)
  return url.pathname && url.pathname !== '/' ? configured : `${url.origin}/app`
}

function resolveDesktopServerBaseUrl(
  settings: Pick<DesktopRuntimeSettings, 'serverBaseUrl'> = readDesktopSettings(),
): string {
  const configured = normalizeConfiguredBaseUrl(settings.serverBaseUrl)
  return configured ? new URL(configured).origin : DEFAULT_SERVER_BASE_URL
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

function normalizeConnectorDeletedConnectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function normalizeConnectorRuntimeNotifications(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, boolean> = {}
  for (const [key, enabled] of Object.entries(value)) {
    const id = key.trim()
    if (!id || id.length > 80) continue
    next[id] = enabled !== false
  }
  return next
}

function normalizeConnectorApiKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  const input = value.trim()
  if (!input) return ''
  const fromCommand = input.match(/--api-key(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/)
  const candidate = (fromCommand?.[1] ?? fromCommand?.[2] ?? fromCommand?.[3] ?? input).trim()
  return candidate.startsWith('sk_machine_') ? candidate : ''
}

function normalizeConnectorComputerId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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

function normalizeShortcutValue(action: DesktopShortcutAction, value: unknown): string {
  if (typeof value !== 'string') return defaultDesktopShortcuts[action]
  const trimmed = value.trim()
  if (!trimmed) return ''
  return legacyDefaultDesktopShortcuts[action].includes(trimmed)
    ? defaultDesktopShortcuts[action]
    : trimmed
}

function normalizeShortcuts(value: unknown): DesktopShortcutSettings {
  const incoming =
    value && typeof value === 'object' ? (value as Partial<DesktopShortcutSettings>) : {}
  return {
    openCommunity: normalizeShortcutValue('openCommunity', incoming.openCommunity),
    togglePet: normalizeShortcutValue('togglePet', incoming.togglePet),
    petVoice: normalizeShortcutValue('petVoice', incoming.petVoice),
    petChat: normalizeShortcutValue('petChat', incoming.petChat),
    showNotifications: normalizeShortcutValue('showNotifications', incoming.showNotifications),
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
  const atlas = record.atlas
  if (atlas && typeof atlas === 'object') {
    const columns = Math.floor(Number(atlas.columns))
    const rows = Math.floor(Number(atlas.rows))
    const row = Math.floor(Number(atlas.row))
    if (columns > 0 && rows > 0 && row >= 0 && row < rows) {
      sprite.atlas = { columns, rows, row }
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
    const version = typeof record.version === 'string' ? record.version.trim() : undefined
    const sourcePath = typeof record.sourcePath === 'string' ? record.sourcePath.trim() : ''
    const spritesheetPath =
      typeof record.spritesheetPath === 'string' ? record.spritesheetPath.trim() : ''
    const displayName = normalizeLocaleMap(record.displayName)
    const sprites: Record<string, DesktopPetAssetSprite> = {}
    if (record.sprites && typeof record.sprites === 'object' && !Array.isArray(record.sprites)) {
      for (const [key, sprite] of Object.entries(record.sprites)) {
        const normalized = normalizeDesktopPetSprite(sprite)
        if (key.trim() && normalized) sprites[key.trim()] = normalized
      }
    }
    const spriteVersionNumber =
      record.spriteVersionNumber === undefined || record.spriteVersionNumber === null
        ? record.sprites?.idle?.atlas?.rows === codexPetAtlasRows(2)
          ? 2
          : 1
        : (parseCodexPetSpriteVersion(record.spriteVersionNumber) ?? 1)
    if (
      !id ||
      !sourcePath ||
      !spritesheetPath ||
      !displayName.en ||
      !sprites.idle?.atlas ||
      seen.has(id)
    ) {
      continue
    }
    seen.add(id)
    packs.push({
      id,
      version,
      spriteVersionNumber,
      displayName,
      description:
        typeof record.description === 'string'
          ? record.description
          : normalizeLocaleMap(record.description),
      spritesheetPath,
      sprites,
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

function normalizeDesktopSettings(parsed: Partial<DesktopRuntimeSettings>): DesktopRuntimeSettings {
  const deviceIdentity = resolveShadowDeviceIdentitySync({
    legacyFingerprint: parsed.connectorDeviceFingerprint || parsed.connectorInstallationId,
    createdBy: 'desktop',
  })
  return {
    serverBaseUrl: normalizeConfiguredServerBaseUrl(
      parsed.serverBaseUrl,
      defaultSettings.serverBaseUrl,
    ),
    httpProxy: normalizeHttpProxy(parsed.httpProxy),
    httpsProxy: normalizeHttpProxy(parsed.httpsProxy),
    connectorApiKey: normalizeConnectorApiKey(parsed.connectorApiKey),
    connectorComputerId: normalizeConnectorComputerId(parsed.connectorComputerId),
    connectorInstallationId:
      typeof parsed.connectorInstallationId === 'string' && parsed.connectorInstallationId.trim()
        ? parsed.connectorInstallationId.trim()
        : defaultSettings.connectorInstallationId,
    connectorDeviceFingerprint: deviceIdentity.fingerprint,
    connectorAutoStart:
      parsed.connectorAutoStart === undefined
        ? defaultSettings.connectorAutoStart
        : parsed.connectorAutoStart === true,
    connectorWorkDir: normalizeWorkDir(parsed.connectorWorkDir),
    connectorBuddyWorkDirs: normalizeConnectorBuddyWorkDirs(parsed.connectorBuddyWorkDirs),
    connectorDeletedConnectionIds: normalizeConnectorDeletedConnectionIds(
      parsed.connectorDeletedConnectionIds,
    ),
    connectorRuntimeNotifications: normalizeConnectorRuntimeNotifications(
      parsed.connectorRuntimeNotifications,
    ),
    ttsProvider: normalizeTtsProvider(parsed.ttsProvider),
    asrProvider: normalizeAsrProvider(parsed.asrProvider),
    shortcuts: normalizeShortcuts(parsed.shortcuts),
    desktopPetVisible: parsed.desktopPetVisible === true,
    desktopPetPacks: normalizeDesktopPetPacks(parsed.desktopPetPacks),
    desktopPetActivePackId:
      typeof parsed.desktopPetActivePackId === 'string' ? parsed.desktopPetActivePackId : '',
  }
}

function mergeDesktopSettings(
  current: DesktopRuntimeSettings,
  incoming: Partial<DesktopRuntimeSettings>,
): DesktopRuntimeSettings {
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
    connectorComputerId:
      incoming.connectorComputerId === undefined
        ? current.connectorComputerId
        : normalizeConnectorComputerId(incoming.connectorComputerId),
    connectorInstallationId:
      incoming.connectorInstallationId === undefined
        ? current.connectorInstallationId
        : incoming.connectorInstallationId.trim() || current.connectorInstallationId,
    connectorDeviceFingerprint: current.connectorDeviceFingerprint,
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
    connectorDeletedConnectionIds:
      incoming.connectorDeletedConnectionIds === undefined
        ? current.connectorDeletedConnectionIds
        : normalizeConnectorDeletedConnectionIds(incoming.connectorDeletedConnectionIds),
    connectorRuntimeNotifications:
      incoming.connectorRuntimeNotifications === undefined
        ? current.connectorRuntimeNotifications
        : normalizeConnectorRuntimeNotifications(incoming.connectorRuntimeNotifications),
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
    desktopPetVisible:
      incoming.desktopPetVisible === undefined
        ? current.desktopPetVisible
        : incoming.desktopPetVisible === true,
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
  return next
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function readDesktopSettings(): DesktopRuntimeSettings {
  try {
    const path = settingsFilePath()
    if (!existsSync(path)) return defaultSettings
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DesktopRuntimeSettings>
    return normalizeDesktopSettings(parsed)
  } catch {
    return defaultSettings
  }
}

async function readDesktopSettingsAsync(): Promise<DesktopRuntimeSettings> {
  try {
    const path = settingsFilePath()
    if (!(await fileExists(path))) return defaultSettings
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<DesktopRuntimeSettings>
    return normalizeDesktopSettings(parsed)
  } catch {
    return defaultSettings
  }
}

function getDesktopServerBaseUrl(): string {
  return resolveDesktopServerBaseUrl()
}

function saveDesktopSettings(incoming: Partial<DesktopRuntimeSettings>): DesktopRuntimeSettings {
  const current = readDesktopSettings()
  const next = mergeDesktopSettings(current, incoming)
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsFilePath(), JSON.stringify(next, null, 2), 'utf8')
  writeConnectorWorkDirMap(next)
  return next
}

async function saveDesktopSettingsAsync(
  incoming: Partial<DesktopRuntimeSettings>,
): Promise<DesktopRuntimeSettings> {
  const current = await readDesktopSettingsAsync()
  const next = mergeDesktopSettings(current, incoming)
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsFilePath(), JSON.stringify(next, null, 2), 'utf8')
  await writeConnectorWorkDirMapAsync(next)
  return next
}

function writeConnectorWorkDirMap(settings = readDesktopSettings()): void {
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

async function writeConnectorWorkDirMapAsync(settings: DesktopRuntimeSettings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(
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

function onDesktopSettingsApplied(
  listener: (settings: DesktopRuntimeSettings) => void,
): () => void {
  desktopSettingsAppliedListeners.add(listener)
  return () => desktopSettingsAppliedListeners.delete(listener)
}

async function applyDesktopNetworkSettings(settings?: DesktopRuntimeSettings): Promise<void> {
  const resolvedSettings = settings ?? (await readDesktopSettingsAsync())
  if (resolvedSettings.httpProxy || resolvedSettings.httpsProxy) {
    await session.defaultSession.setProxy({
      proxyRules: toProxyRules(resolvedSettings.httpProxy, resolvedSettings.httpsProxy),
    })
  } else {
    await session.defaultSession.setProxy({ mode: 'system' })
  }
  broadcastDesktopSettings(resolvedSettings)
  for (const listener of desktopSettingsAppliedListeners) listener(resolvedSettings)
}

export class DesktopSettingsService {
  connectorWorkDirMapFilePath(): string {
    return connectorWorkDirMapFilePath()
  }

  resolveDesktopAppBaseUrl(settings: DesktopRuntimeSettings = readDesktopSettings()): string {
    return resolveDesktopAppBaseUrl(settings)
  }

  resolveDesktopServerBaseUrl(settings: DesktopRuntimeSettings = readDesktopSettings()): string {
    return resolveDesktopServerBaseUrl(settings)
  }

  normalizeConnectorApiKey(value: unknown): string {
    return normalizeConnectorApiKey(value)
  }

  readSettingsSync(): DesktopRuntimeSettings {
    return readDesktopSettings()
  }

  getSettings(): Promise<DesktopRuntimeSettings> {
    return readDesktopSettingsAsync()
  }

  getDesktopServerBaseUrl(): string {
    return getDesktopServerBaseUrl()
  }

  saveSettingsSync(incoming: Partial<DesktopRuntimeSettings>): DesktopRuntimeSettings {
    return saveDesktopSettings(incoming)
  }

  async setSettings(incoming: Partial<DesktopRuntimeSettings>): Promise<DesktopRuntimeSettings> {
    const next = await saveDesktopSettingsAsync(incoming)
    await applyDesktopNetworkSettings(next)
    return next
  }

  applyNetworkSettings(settings?: DesktopRuntimeSettings): Promise<void> {
    return applyDesktopNetworkSettings(settings)
  }

  writeConnectorWorkDirMap(settings = readDesktopSettings()): void {
    writeConnectorWorkDirMap(settings)
  }

  writeConnectorWorkDirMapAsync(settings = readDesktopSettings()): Promise<void> {
    return writeConnectorWorkDirMapAsync(settings)
  }

  broadcastSettings(settings: DesktopRuntimeSettings): void {
    broadcastDesktopSettings(settings)
  }

  onApplied(listener: (settings: DesktopRuntimeSettings) => void): () => void {
    return onDesktopSettingsApplied(listener)
  }
}

export const desktopSettingsService = new DesktopSettingsService()
