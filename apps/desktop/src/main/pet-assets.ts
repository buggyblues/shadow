import { randomUUID } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, normalize, relative, sep } from 'node:path'
import { app, dialog, ipcMain, nativeImage, net } from 'electron'
import JSZip from 'jszip'
import { DESKTOP_COMMUNITY_AUTH_REQUIRED } from '../shared/community-auth'
import { readCommunityAccessToken } from './connector-daemon'
import {
  broadcastDesktopSettings,
  type DesktopPetAssetPack,
  type DesktopPetAssetSprite,
  getDesktopServerBaseUrl,
  readDesktopSettings,
  saveDesktopSettings,
} from './desktop-settings'

const PET_PACK_SCHEMA_VERSION = 'shadow.desktopPet.pack.v1'
const METADATA_MAX_BYTES = 128 * 1024
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/
const IMAGE_EXTENSIONS = new Set(['.png', '.webp'])
const PREVIEW_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg'])
const PACK_ARCHIVE_EXTENSIONS = new Set(['.zip', '.shadowpet'])
const STANDARD_EMOTIONS = new Set([
  'excited',
  'content',
  'calm',
  'lonely',
  'hungry',
  'sleepy',
  'sick',
])
const STANDARD_INTERACTIONS = new Set([
  'tap',
  'drag',
  'voice',
  'feed',
  'pet',
  'play',
  'rest',
  'explore',
  'tea',
])
const BLOCKED_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.bin',
  '.cmd',
  '.com',
  '.dylib',
  '.exe',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.node',
  '.ps1',
  '.scr',
  '.sh',
  '.so',
])

type PetPackImportSource = {
  source: 'local' | 'marketplace'
  marketplaceProductId?: string
  marketplaceEntitlementId?: string
  marketplacePaidFileId?: string
}

function petPackRoot(): string {
  return join(app.getPath('userData'), 'desktop-pet-packs')
}

function sanitizeFolderName(value: string): string {
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || 'pet-pack'
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asLocaleMap(value: unknown): Record<string, string> {
  const record = asRecord(value)
  const result: Record<string, string> = {}
  for (const [locale, text] of Object.entries(record)) {
    if (typeof text === 'string' && locale.trim() && text.trim())
      result[locale.trim()] = text.trim()
  }
  return result
}

function safeRelativePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim().replace(/\\/g, '/')
  if (trimmed.includes('\0')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return null
  if (/^[a-zA-Z]:\//.test(trimmed)) return null
  if (trimmed.startsWith('/') || trimmed.split('/').includes('..')) return null
  return trimmed
}

function resolvePackFile(packDir: string, relativePath: string): string | null {
  const normalizedPackDir = normalize(packDir)
  const resolved = normalize(join(normalizedPackDir, relativePath))
  const pathDelta = relative(normalizedPackDir, resolved)
  if (pathDelta.startsWith('..') || pathDelta.includes(`..${sep}`)) return null
  return resolved
}

function imageSize(path: string): { width: number; height: number } | null {
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return null
  return image.getSize()
}

function validateReferencedFile(
  packDir: string,
  value: unknown,
  allowedExtensions: Set<string>,
  field: string,
): string {
  const relativePath = safeRelativePath(value)
  if (!relativePath) throw new Error(`${field} must be a safe relative path`)
  const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase()
  if (!allowedExtensions.has(extension)) throw new Error(`${field} has unsupported extension`)
  const fullPath = resolvePackFile(packDir, relativePath)
  if (!fullPath || !existsSync(fullPath)) throw new Error(`${field} does not exist`)
  const stats = statSync(fullPath)
  if (!stats.isFile()) throw new Error(`${field} must be a file`)
  return relativePath
}

function parseSprite(packDir: string, key: string, value: unknown): DesktopPetAssetSprite {
  const record = asRecord(value)
  const src = validateReferencedFile(packDir, record.src, IMAGE_EXTENSIONS, `sprites.${key}.src`)
  const frame = asRecord(record.frame)
  const width = Math.floor(Number(frame.width))
  const height = Math.floor(Number(frame.height))
  const count = Math.floor(Number(frame.count))
  const fps = Math.floor(Number(frame.fps))
  if (width <= 0 || height <= 0 || count <= 0 || fps <= 0) {
    throw new Error(`sprites.${key}.frame width, height, count, and fps are required`)
  }
  if (count > 60 || fps > 30) throw new Error(`sprites.${key}.frame exceeds animation caps`)
  const fullPath = resolvePackFile(packDir, src)
  const size = fullPath ? imageSize(fullPath) : null
  if (!size) throw new Error(`sprites.${key}.src is not a readable image`)
  if (size.width !== width * count || size.height !== height) {
    throw new Error(
      `sprites.${key} sheet is ${size.width}x${size.height}; expected ${width * count}x${height}`,
    )
  }
  return {
    src,
    frame: { width, height, count, fps },
    loop: typeof record.loop === 'boolean' ? record.loop : key === 'idle',
  }
}

function referencedSpriteKey(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  const record = asRecord(value)
  for (const key of ['sprite', 'motion']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function parseExpressionMap(
  value: unknown,
  sprites: Record<string, DesktopPetAssetSprite>,
): Record<string, unknown> | undefined {
  const input = asRecord(value)
  const result: Record<string, unknown> = {}
  for (const [rawKey, rawEntry] of Object.entries(input)) {
    const key = rawKey.trim()
    if (!key) continue
    if (!STANDARD_EMOTIONS.has(key)) throw new Error(`expressions.${key} is not supported`)
    const spriteKey = referencedSpriteKey(rawEntry)
    if (spriteKey && !sprites[spriteKey]) {
      throw new Error(`expressions.${key}.sprite references unknown sprite: ${spriteKey}`)
    }
    result[key] = typeof rawEntry === 'string' ? { sprite: spriteKey } : asRecord(rawEntry)
  }
  return Object.keys(result).length ? result : undefined
}

function parseInteractionMap(
  value: unknown,
  sprites: Record<string, DesktopPetAssetSprite>,
): Record<string, unknown> | undefined {
  const input = asRecord(value)
  const result: Record<string, unknown> = {}
  for (const [rawKey, rawEntry] of Object.entries(input)) {
    const key = rawKey.trim()
    if (!key) continue
    if (!STANDARD_INTERACTIONS.has(key)) {
      throw new Error(`interactionMap.${key} is not a supported interaction`)
    }
    const spriteKey = referencedSpriteKey(rawEntry)
    if (spriteKey && !sprites[spriteKey]) {
      throw new Error(`interactionMap.${key}.sprite references unknown sprite: ${spriteKey}`)
    }
    result[key] = typeof rawEntry === 'string' ? { sprite: spriteKey } : asRecord(rawEntry)
  }
  return Object.keys(result).length ? result : undefined
}

function parseHitAreas(value: unknown): Record<string, unknown> | undefined {
  const input = asRecord(value)
  const result: Record<string, unknown> = {}
  for (const [rawKey, rawEntry] of Object.entries(input)) {
    const key = rawKey.trim()
    const entry = asRecord(rawEntry)
    const x = Number(entry.x)
    const y = Number(entry.y)
    const width = Number(entry.width)
    const height = Number(entry.height)
    if (!key) continue
    if (![x, y, width, height].every((part) => Number.isFinite(part))) {
      throw new Error(`hitAreas.${key} requires x, y, width, and height`)
    }
    if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > 1 || y + height > 1) {
      throw new Error(`hitAreas.${key} must stay within normalized 0..1 bounds`)
    }
    const actions = Array.isArray(entry.actions)
      ? entry.actions.filter(
          (action): action is string =>
            typeof action === 'string' && STANDARD_INTERACTIONS.has(action),
        )
      : []
    result[key] = actions.length ? { x, y, width, height, actions } : { x, y, width, height }
  }
  return Object.keys(result).length ? result : undefined
}

function parseEntry(value: unknown): DesktopPetAssetPack['entry'] {
  const entry = asRecord(value)
  if (entry.renderer !== 'sprite-sheet') {
    throw new Error('only sprite-sheet packs are supported now')
  }
  const result: NonNullable<DesktopPetAssetPack['entry']> = { renderer: 'sprite-sheet' }
  const pixelRatio = Number(entry.pixelRatio)
  if (Number.isFinite(pixelRatio) && pixelRatio > 0 && pixelRatio <= 4) {
    result.pixelRatio = pixelRatio
  }
  const canvas = asRecord(entry.canvas)
  const canvasWidth = Math.floor(Number(canvas.width))
  const canvasHeight = Math.floor(Number(canvas.height))
  if (canvasWidth > 0 && canvasHeight > 0) {
    if (canvasWidth > 1024 || canvasHeight > 1024) {
      throw new Error('entry.canvas exceeds 1024 px per side')
    }
    result.canvas = { width: canvasWidth, height: canvasHeight }
  }
  const anchor = asRecord(entry.anchor)
  const anchorX = Number(anchor.x)
  const anchorY = Number(anchor.y)
  if (Number.isFinite(anchorX) || Number.isFinite(anchorY)) {
    if (
      !Number.isFinite(anchorX) ||
      !Number.isFinite(anchorY) ||
      anchorX < 0 ||
      anchorY < 0 ||
      anchorX > 1 ||
      anchorY > 1
    ) {
      throw new Error('entry.anchor must use normalized 0..1 coordinates')
    }
    result.anchor = { x: anchorX, y: anchorY }
  }
  return result
}

function scanPackSurface(packDir: string): void {
  const stack = [packDir]
  let totalSize = 0
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const stats = lstatSync(current)
    if (stats.isSymbolicLink()) throw new Error('pet pack must not contain symlinks')
    if (stats.isDirectory()) {
      for (const child of readdirSync(current)) {
        stack.push(join(current, child))
      }
      continue
    }
    if (!stats.isFile()) continue
    totalSize += stats.size
    const extension = current.slice(current.lastIndexOf('.')).toLowerCase()
    if (BLOCKED_EXTENSIONS.has(extension)) {
      throw new Error(`blocked file extension in pack: ${basename(current)}`)
    }
  }
  if (totalSize > 80 * 1024 * 1024) throw new Error('pet pack exceeds 80 MB')
}

function parsePetPackMetadata(
  packDir: string,
  sourcePath: string,
  importSource: PetPackImportSource = { source: 'local' },
): DesktopPetAssetPack {
  const metadataPath = join(packDir, 'metadata.json')
  if (!existsSync(metadataPath)) throw new Error('metadata.json is required')
  if (statSync(metadataPath).size > METADATA_MAX_BYTES) {
    throw new Error('metadata.json exceeds 128 KB')
  }
  const metadata = asRecord(JSON.parse(readFileSync(metadataPath, 'utf8')))
  if (metadata.schemaVersion !== PET_PACK_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${PET_PACK_SCHEMA_VERSION}`)
  }
  const id = typeof metadata.id === 'string' ? metadata.id.trim() : ''
  const version = typeof metadata.version === 'string' ? metadata.version.trim() : ''
  if (!PACK_ID_PATTERN.test(id)) throw new Error('id must be a lowercase pet pack slug')
  if (!SEMVER_PATTERN.test(version)) throw new Error('version must be semver')
  const displayName = asLocaleMap(metadata.displayName)
  if (!displayName.en) throw new Error('displayName.en is required')
  const compatibility = asRecord(metadata.compatibility)
  if (!Object.keys(compatibility).length) throw new Error('compatibility is required')
  const compatibilityRenderers = Array.isArray(compatibility.renderer) ? compatibility.renderer : []
  if (!compatibilityRenderers.includes('sprite-sheet')) {
    throw new Error('compatibility.renderer must include sprite-sheet')
  }
  const entry = parseEntry(metadata.entry)
  const spritesInput = asRecord(metadata.sprites)
  const sprites: Record<string, DesktopPetAssetSprite> = {}
  for (const [key, sprite] of Object.entries(spritesInput)) {
    if (key.trim()) sprites[key.trim()] = parseSprite(packDir, key.trim(), sprite)
  }
  if (!sprites.idle) throw new Error('sprites.idle is required')

  const files = asRecord(metadata.files)
  const cover = files.cover
    ? validateReferencedFile(packDir, files.cover, PREVIEW_EXTENSIONS, 'files.cover')
    : undefined
  const thumbnail = files.thumbnail
    ? validateReferencedFile(packDir, files.thumbnail, PREVIEW_EXTENSIONS, 'files.thumbnail')
    : undefined

  return {
    id,
    version,
    displayName,
    description:
      typeof metadata.description === 'string'
        ? metadata.description
        : asLocaleMap(metadata.description),
    author: asRecord(metadata.author),
    license: asRecord(metadata.license),
    compatibility: compatibility as DesktopPetAssetPack['compatibility'],
    entry,
    files: { cover, thumbnail },
    sprites,
    expressions: parseExpressionMap(metadata.expressions, sprites),
    hitAreas: parseHitAreas(metadata.hitAreas),
    interactionMap: parseInteractionMap(metadata.interactionMap, sprites),
    importedAt: new Date().toISOString(),
    source: importSource.source,
    sourcePath,
    marketplaceProductId: importSource.marketplaceProductId,
    marketplaceEntitlementId: importSource.marketplaceEntitlementId,
    marketplacePaidFileId: importSource.marketplacePaidFileId,
  }
}

function importPetPackFromDirectory(
  packDir: string,
  importSource: PetPackImportSource = { source: 'local' },
): DesktopPetAssetPack {
  const sourceDir = normalize(packDir)
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error('pet pack directory does not exist')
  }
  scanPackSurface(sourceDir)
  const draft = parsePetPackMetadata(sourceDir, sourceDir, importSource)
  const targetDir = join(petPackRoot(), sanitizeFolderName(`${draft.id}-${draft.version}`))
  mkdirSync(petPackRoot(), { recursive: true })
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
  cpSync(sourceDir, targetDir, { recursive: true })
  return parsePetPackMetadata(targetDir, targetDir, importSource)
}

async function extractPetPackArchive(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const tempDir = join(app.getPath('temp'), 'shadow-pet-pack-imports', randomUUID())
  mkdirSync(tempDir, { recursive: true })
  try {
    let totalSize = 0
    for (const entry of Object.values(zip.files)) {
      const safePath = safeRelativePath(entry.name)
      if (!safePath) throw new Error('pet pack archive contains an unsafe path')
      const targetPath = resolvePackFile(tempDir, safePath)
      if (!targetPath) throw new Error('pet pack archive contains an unsafe path')
      if (entry.dir) {
        mkdirSync(targetPath, { recursive: true })
        continue
      }
      const extension = safePath.slice(safePath.lastIndexOf('.')).toLowerCase()
      if (BLOCKED_EXTENSIONS.has(extension)) {
        throw new Error(`blocked file extension in pack: ${basename(safePath)}`)
      }
      const data = Buffer.from(await entry.async('uint8array'))
      totalSize += data.byteLength
      if (totalSize > 80 * 1024 * 1024) throw new Error('pet pack exceeds 80 MB')
      mkdirSync(dirname(targetPath), { recursive: true })
      writeFileSync(targetPath, data)
    }
    return tempDir
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }
}

function resolveExtractedPetPackDir(tempDir: string): string {
  if (existsSync(join(tempDir, 'metadata.json'))) return tempDir
  const entries = readdirSync(tempDir)
    .map((entry) => join(tempDir, entry))
    .filter((entryPath) => lstatSync(entryPath).isDirectory())
  if (entries.length === 1 && existsSync(join(entries[0]!, 'metadata.json'))) return entries[0]!
  return tempDir
}

async function importPetPackFromArchive(
  buffer: Buffer,
  importSource: PetPackImportSource,
): Promise<DesktopPetAssetPack> {
  const tempDir = await extractPetPackArchive(buffer)
  try {
    return importPetPackFromDirectory(resolveExtractedPetPackDir(tempDir), importSource)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function fetchMarketplaceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await readCommunityAccessToken()
  if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  const response = await net.fetch(`${getDesktopServerBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  if (response.status === 401 || response.status === 403)
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  if (!response.ok) throw new Error(text || `REQUEST_FAILED_${response.status}`)
  return (text ? JSON.parse(text) : null) as T
}

async function downloadMarketplacePaidFile(fileId: string): Promise<Buffer> {
  const opened = await fetchMarketplaceJson<{
    viewerUrl?: unknown
    grantToken?: unknown
  }>(`/api/paid-files/${encodeURIComponent(fileId)}/open`, { method: 'POST' })
  if (typeof opened.viewerUrl !== 'string' || !opened.viewerUrl) {
    throw new Error('paid file viewer url is missing')
  }
  const url = new URL(opened.viewerUrl, getDesktopServerBaseUrl())
  const headers: Record<string, string> = {}
  if (typeof opened.grantToken === 'string' && opened.grantToken) {
    headers['x-paid-file-grant-token'] = opened.grantToken
  }
  const response = await net.fetch(url.toString(), { headers })
  if (response.status === 401 || response.status === 403)
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  if (!response.ok) throw new Error(`PAID_FILE_DOWNLOAD_FAILED_${response.status}`)
  const fileName = url.pathname.split('/').pop()?.toLowerCase() ?? ''
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (
    !PACK_ARCHIVE_EXTENSIONS.has(fileName.slice(fileName.lastIndexOf('.'))) &&
    !contentType.includes('zip') &&
    !contentType.includes('octet-stream')
  ) {
    throw new Error('paid file is not a desktop pet archive')
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > 80 * 1024 * 1024) throw new Error('pet pack exceeds 80 MB')
  return buffer
}

function savePetPack(nextPack: DesktopPetAssetPack): ReturnType<typeof readDesktopSettings> {
  const settings = readDesktopSettings()
  const desktopPetPacks = [
    nextPack,
    ...settings.desktopPetPacks.filter((pack) => pack.id !== nextPack.id),
  ]
  const next = saveDesktopSettings({
    desktopPetPacks,
    desktopPetActivePackId: nextPack.id,
  })
  broadcastDesktopSettings(next)
  return next
}

export function resolveDesktopPetAssetPath(packId: string, relativePath: string): string | null {
  const pack = readDesktopSettings().desktopPetPacks.find((item) => item.id === packId)
  if (!pack) return null
  const safePath = safeRelativePath(relativePath)
  if (!safePath) return null
  const fullPath = resolvePackFile(pack.sourcePath, safePath)
  if (!fullPath || !existsSync(fullPath)) return null
  return fullPath
}

export function setupDesktopPetAssetHandlers(): void {
  ipcMain.handle(
    'desktop:petAssets:importDirectory',
    async (_event, input?: { path?: unknown }) => {
      let packDir = typeof input?.path === 'string' ? input.path : ''
      if (!packDir) {
        const result = await dialog.showOpenDialog({
          title: 'Import Desktop Pet Pack',
          properties: ['openDirectory'],
        })
        if (result.canceled) return readDesktopSettings()
        packDir = result.filePaths[0] ?? ''
      }
      if (!packDir) return readDesktopSettings()
      return savePetPack(importPetPackFromDirectory(packDir))
    },
  )

  ipcMain.handle(
    'desktop:petAssets:importMarketplace',
    async (_event, input?: { entitlementId?: unknown; fileId?: unknown; productId?: unknown }) => {
      const fileId = typeof input?.fileId === 'string' ? input.fileId.trim() : ''
      if (!fileId) throw new Error('paid file id is required')
      const buffer = await downloadMarketplacePaidFile(fileId)
      const pack = await importPetPackFromArchive(buffer, {
        source: 'marketplace',
        marketplaceEntitlementId:
          typeof input?.entitlementId === 'string' ? input.entitlementId : undefined,
        marketplacePaidFileId: fileId,
        marketplaceProductId: typeof input?.productId === 'string' ? input.productId : undefined,
      })
      return savePetPack(pack)
    },
  )

  ipcMain.handle('desktop:petAssets:setActive', (_event, input: { packId?: unknown }) => {
    const packId = typeof input?.packId === 'string' ? input.packId : ''
    const settings = readDesktopSettings()
    if (packId && !settings.desktopPetPacks.some((pack) => pack.id === packId)) {
      throw new Error('pet pack is not installed')
    }
    const next = saveDesktopSettings({ desktopPetActivePackId: packId })
    broadcastDesktopSettings(next)
    return next
  })

  ipcMain.handle('desktop:petAssets:remove', (_event, input: { packId?: unknown }) => {
    const packId = typeof input?.packId === 'string' ? input.packId : ''
    const settings = readDesktopSettings()
    const removed = settings.desktopPetPacks.find((pack) => pack.id === packId)
    const desktopPetPacks = settings.desktopPetPacks.filter((pack) => pack.id !== packId)
    if (removed?.sourcePath.startsWith(petPackRoot())) {
      rmSync(removed.sourcePath, { recursive: true, force: true })
    }
    const next = saveDesktopSettings({
      desktopPetPacks,
      desktopPetActivePackId:
        settings.desktopPetActivePackId === packId ? '' : settings.desktopPetActivePackId,
    })
    broadcastDesktopSettings(next)
    return next
  })
}

export const __desktopPetAssetTestHooks = {
  importPetPackFromArchive,
  importPetPackFromDirectory,
  parsePetPackMetadata,
  resolveExtractedPetPackDir,
  safeRelativePath,
}
