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
import { basename, dirname, extname, join, normalize, relative, sep } from 'node:path'
import { app, net } from 'electron'
import JSZip from 'jszip'
import { DESKTOP_COMMUNITY_AUTH_REQUIRED } from '../../shared/community-auth'
import { connectorDaemonService } from './connector-daemon.service'
import {
  type CodexPetAnimationKey,
  type DesktopPetAssetPack,
  type DesktopPetAssetSprite,
  type DesktopRuntimeSettings,
  desktopSettingsService,
} from './desktop-settings.service'

const PET_JSON_MAX_BYTES = 64 * 1024
const PACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/
const IMAGE_EXTENSIONS = new Set(['.png', '.webp'])
const PACK_ARCHIVE_EXTENSIONS = new Set(['.zip'])
const CODEX_ATLAS_COLUMNS = 8
const CODEX_ATLAS_ROWS = 9
const CODEX_CELL_WIDTH = 192
const CODEX_CELL_HEIGHT = 208
const CODEX_SPRITESHEET_WIDTH = CODEX_ATLAS_COLUMNS * CODEX_CELL_WIDTH
const CODEX_SPRITESHEET_HEIGHT = CODEX_ATLAS_ROWS * CODEX_CELL_HEIGHT
const CODEX_PET_STATES: CodexPetAnimationKey[] = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
]
const CODEX_STATE_FPS: Record<CodexPetAnimationKey, number> = {
  idle: 5,
  'running-right': 8,
  'running-left': 8,
  waving: 6,
  jumping: 6,
  failed: 7,
  waiting: 6,
  running: 7,
  review: 6,
}
const CODEX_STATE_FRAME_COUNTS: Record<CodexPetAnimationKey, number> = {
  idle: 6,
  'running-right': 8,
  'running-left': 8,
  waving: 4,
  jumping: 5,
  failed: 8,
  waiting: 6,
  running: 6,
  review: 6,
}
const CODEX_LOOPING_STATES = new Set<CodexPetAnimationKey>([
  'idle',
  'running-right',
  'running-left',
  'waiting',
  'running',
  'review',
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

function readUInt24LE(buffer: Buffer, offset: number): number | null {
  if (offset + 3 > buffer.byteLength) return null
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16)
}

function pngImageSize(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.byteLength < 24 ||
    buffer[0] !== 0x89 ||
    buffer.toString('ascii', 1, 4) !== 'PNG' ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function webpImageSize(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.byteLength < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null
  }

  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const chunkType = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const dataOffset = offset + 8
    const chunkEnd = dataOffset + chunkSize
    if (chunkEnd > buffer.byteLength) return null

    if (chunkType === 'VP8X') {
      if (chunkSize < 10) return null
      const width = readUInt24LE(buffer, dataOffset + 4)
      const height = readUInt24LE(buffer, dataOffset + 7)
      return width === null || height === null ? null : { width: width + 1, height: height + 1 }
    }

    if (chunkType === 'VP8L') {
      if (chunkSize < 5 || buffer[dataOffset] !== 0x2f) return null
      const width = 1 + (((buffer[dataOffset + 2]! & 0x3f) << 8) | buffer[dataOffset + 1]!)
      const height =
        1 +
        (((buffer[dataOffset + 4]! & 0x0f) << 10) |
          (buffer[dataOffset + 3]! << 2) |
          ((buffer[dataOffset + 2]! & 0xc0) >> 6))
      return { width, height }
    }

    if (chunkType === 'VP8 ') {
      if (
        chunkSize < 10 ||
        buffer[dataOffset + 3] !== 0x9d ||
        buffer[dataOffset + 4] !== 0x01 ||
        buffer[dataOffset + 5] !== 0x2a
      ) {
        return null
      }
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      }
    }

    offset = chunkEnd + (chunkSize % 2)
  }

  return null
}

function imageSize(path: string): { width: number; height: number } | null {
  try {
    const buffer = readFileSync(path)
    return pngImageSize(buffer) ?? webpImageSize(buffer)
  } catch {
    return null
  }
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

function validateCodexSpritesheet(packDir: string, value: unknown): string {
  const src = validateReferencedFile(packDir, value, IMAGE_EXTENSIONS, 'spritesheetPath')
  const fullPath = resolvePackFile(packDir, src)
  const size = fullPath ? imageSize(fullPath) : null
  if (!size) throw new Error('spritesheetPath is not a readable image')
  if (size.width !== CODEX_SPRITESHEET_WIDTH || size.height !== CODEX_SPRITESHEET_HEIGHT) {
    throw new Error(`spritesheet must be ${CODEX_SPRITESHEET_WIDTH}x${CODEX_SPRITESHEET_HEIGHT}`)
  }
  return src
}

function defaultCodexSpritesheetPath(packDir: string): string | null {
  for (const candidate of ['spritesheet.webp', 'spritesheet.png']) {
    if (existsSync(join(packDir, candidate))) return candidate
  }
  return null
}

function codexSprites(src: string): Record<string, DesktopPetAssetSprite> {
  const sprites: Record<string, DesktopPetAssetSprite> = {}
  for (const [row, state] of CODEX_PET_STATES.entries()) {
    sprites[state] = {
      src,
      frame: {
        width: CODEX_CELL_WIDTH,
        height: CODEX_CELL_HEIGHT,
        count: CODEX_STATE_FRAME_COUNTS[state],
        fps: CODEX_STATE_FPS[state],
      },
      atlas: {
        columns: CODEX_ATLAS_COLUMNS,
        rows: CODEX_ATLAS_ROWS,
        row,
      },
      loop: CODEX_LOOPING_STATES.has(state),
    }
  }
  return sprites
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

function parseCodexPetManifest(
  packDir: string,
  sourcePath: string,
  importSource: PetPackImportSource = { source: 'local' },
): DesktopPetAssetPack {
  const manifestPath = join(packDir, 'pet.json')
  if (!existsSync(manifestPath)) throw new Error('pet.json is required')
  if (statSync(manifestPath).size > PET_JSON_MAX_BYTES) {
    throw new Error('pet.json exceeds 64 KB')
  }
  const manifest = asRecord(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const id =
    typeof manifest.id === 'string'
      ? manifest.id.trim()
      : typeof manifest.slug === 'string'
        ? manifest.slug.trim()
        : ''
  if (!PACK_ID_PATTERN.test(id)) throw new Error('id must be a lowercase Codex pet slug')
  const displayName =
    typeof manifest.displayName === 'string'
      ? manifest.displayName.trim()
      : typeof manifest.name === 'string'
        ? manifest.name.trim()
        : ''
  if (!displayName) throw new Error('displayName is required')
  const description = typeof manifest.description === 'string' ? manifest.description.trim() : ''
  const spritesheetPath = validateCodexSpritesheet(
    packDir,
    manifest.spritesheetPath ??
      manifest.spriteSheetPath ??
      manifest.spritesheet ??
      defaultCodexSpritesheetPath(packDir),
  )
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : undefined

  return {
    id,
    version,
    displayName: { en: displayName },
    description,
    spritesheetPath,
    sprites: codexSprites(spritesheetPath),
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
  const draft = parseCodexPetManifest(sourceDir, sourceDir, importSource)
  const targetDir = join(petPackRoot(), sanitizeFolderName(draft.id))
  mkdirSync(petPackRoot(), { recursive: true })
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
  cpSync(sourceDir, targetDir, { recursive: true })
  return parseCodexPetManifest(targetDir, targetDir, importSource)
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
  if (existsSync(join(tempDir, 'pet.json'))) return tempDir
  const entries = readdirSync(tempDir)
    .map((entry) => join(tempDir, entry))
    .filter((entryPath) => lstatSync(entryPath).isDirectory())
  if (entries.length === 1 && existsSync(join(entries[0]!, 'pet.json'))) return entries[0]!
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

async function importPetPackFromPath(
  inputPath: string,
  importSource: PetPackImportSource = { source: 'local' },
): Promise<DesktopPetAssetPack> {
  const sourcePath = normalize(inputPath)
  if (!existsSync(sourcePath)) throw new Error('pet pack path does not exist')
  const stats = statSync(sourcePath)
  if (stats.isDirectory()) return importPetPackFromDirectory(sourcePath, importSource)
  if (!stats.isFile()) throw new Error('pet pack path must be a file or directory')
  const extension = extname(sourcePath).toLowerCase()
  if (!PACK_ARCHIVE_EXTENSIONS.has(extension)) {
    throw new Error('pet pack file must be a .zip archive')
  }
  if (stats.size > 80 * 1024 * 1024) throw new Error('pet pack exceeds 80 MB')
  return importPetPackFromArchive(readFileSync(sourcePath), importSource)
}

function bufferFromIpc(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  throw new Error('pet pack archive data is required')
}

async function importPetPackFromArchiveData(
  input?: { name?: unknown; data?: unknown },
  importSource: PetPackImportSource = { source: 'local' },
): Promise<DesktopPetAssetPack> {
  const fileName = typeof input?.name === 'string' ? input.name : 'pet.codex-pet.zip'
  const extension = extname(fileName).toLowerCase()
  if (!PACK_ARCHIVE_EXTENSIONS.has(extension)) {
    throw new Error('pet pack file must be a .zip archive')
  }
  const buffer = bufferFromIpc(input?.data)
  if (buffer.byteLength > 80 * 1024 * 1024) throw new Error('pet pack exceeds 80 MB')
  return importPetPackFromArchive(buffer, importSource)
}

async function fetchMarketplaceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await connectorDaemonService.fetchCommunityWithAuth(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
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
  const url = new URL(opened.viewerUrl, desktopSettingsService.getDesktopServerBaseUrl())
  const headers: Record<string, string> = {}
  if (typeof opened.grantToken === 'string' && opened.grantToken) {
    headers['x-paid-file-grant-token'] = opened.grantToken
  }
  const response = await net.fetch(url.toString(), { headers })
  if (response.status === 401 || response.status === 403) {
    connectorDaemonService.forgetCommunityAccessToken()
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  }
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

function savePetPack(nextPack: DesktopPetAssetPack): DesktopRuntimeSettings {
  const settings = desktopSettingsService.readSettingsSync()
  const desktopPetPacks = [
    nextPack,
    ...settings.desktopPetPacks.filter((pack) => pack.id !== nextPack.id),
  ]
  const next = desktopSettingsService.saveSettingsSync({
    desktopPetPacks,
    desktopPetActivePackId: nextPack.id,
  })
  desktopSettingsService.broadcastSettings(next)
  return next
}

function resolveDesktopPetAssetPath(packId: string, relativePath: string): string | null {
  const pack = desktopSettingsService
    .readSettingsSync()
    .desktopPetPacks.find((item) => item.id === packId)
  if (!pack) return null
  const safePath = safeRelativePath(relativePath)
  if (!safePath) return null
  const fullPath = resolvePackFile(pack.sourcePath, safePath)
  if (!fullPath || !existsSync(fullPath)) return null
  return fullPath
}

export class PetAssetsService {
  getSettings() {
    return desktopSettingsService.readSettingsSync()
  }

  async importDirectory(packDir: string) {
    if (!packDir) return desktopSettingsService.readSettingsSync()
    return savePetPack(await importPetPackFromPath(packDir))
  }

  async importMarketplace(input: { entitlementId?: string; fileId: string; productId?: string }) {
    const buffer = await downloadMarketplacePaidFile(input.fileId)
    const pack = await importPetPackFromArchive(buffer, {
      source: 'marketplace',
      marketplaceEntitlementId: input.entitlementId,
      marketplacePaidFileId: input.fileId,
      marketplaceProductId: input.productId,
    })
    return savePetPack(pack)
  }

  async importArchiveBuffer(input?: { name?: unknown; data?: unknown }) {
    return savePetPack(await importPetPackFromArchiveData(input))
  }

  setActive(packId: string) {
    const settings = desktopSettingsService.readSettingsSync()
    if (packId && !settings.desktopPetPacks.some((pack) => pack.id === packId)) {
      throw new Error('pet pack is not installed')
    }
    const next = desktopSettingsService.saveSettingsSync({ desktopPetActivePackId: packId })
    desktopSettingsService.broadcastSettings(next)
    return next
  }

  remove(packId: string) {
    const settings = desktopSettingsService.readSettingsSync()
    const removed = settings.desktopPetPacks.find((pack) => pack.id === packId)
    const desktopPetPacks = settings.desktopPetPacks.filter((pack) => pack.id !== packId)
    if (removed?.sourcePath.startsWith(petPackRoot())) {
      rmSync(removed.sourcePath, { recursive: true, force: true })
    }
    const next = desktopSettingsService.saveSettingsSync({
      desktopPetPacks,
      desktopPetActivePackId:
        settings.desktopPetActivePackId === packId ? '' : settings.desktopPetActivePackId,
    })
    desktopSettingsService.broadcastSettings(next)
    return next
  }

  resolveAssetPath(packId: string, relativePath: string): string | null {
    return resolveDesktopPetAssetPath(packId, relativePath)
  }
}

export const __desktopPetAssetTestHooks = {
  importPetPackFromArchive,
  importPetPackFromArchiveData,
  importPetPackFromDirectory,
  importPetPackFromPath,
  parseCodexPetManifest,
  resolveExtractedPetPackDir,
  safeRelativePath,
}
