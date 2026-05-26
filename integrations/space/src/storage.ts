import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix, resolve } from 'node:path'
import JSZip from 'jszip'
import type { Client } from 'minio'
import type {
  SpaceCdnProvider,
  SpaceSourceKind,
  SpaceStoredFile,
  SpaceUploadFile,
} from './types.js'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 36 * 1024 * 1024
const MAX_COVER_BYTES = 10 * 1024 * 1024
const MAX_FILES = 140

interface MinioState {
  client: Client
  bucket: string
}

export interface StoredWebPackage {
  sourceKind: SpaceSourceKind
  entryPath: string
  cdnProvider: SpaceCdnProvider
  cdnBaseUrl: string
  files: SpaceStoredFile[]
}

let minioState: Promise<MinioState | null> | null = null

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function publicBaseUrl() {
  return trimTrailingSlash(process.env.SHADOW_APP_PUBLIC_BASE_URL ?? 'http://localhost:4217')
}

function cdnPublicBaseUrl() {
  return trimTrailingSlash(process.env.SPACE_CDN_PUBLIC_BASE_URL ?? `${publicBaseUrl()}/cdn`)
}

function localCdnDir() {
  return resolve(process.env.SPACE_CDN_DIR ?? './data/space-cdn')
}

function cdnPrefix() {
  return (process.env.SPACE_CDN_PREFIX ?? 'space').replace(/^\/+|\/+$/g, '')
}

function minioBucket() {
  return process.env.SPACE_MINIO_BUCKET ?? process.env.MINIO_BUCKET ?? 'shadow'
}

function minioEnabled() {
  if (process.env.SPACE_CDN_DRIVER === 'local') return false
  return !!(process.env.SPACE_MINIO_ENDPOINT ?? process.env.MINIO_ENDPOINT)
}

async function getMinioState(): Promise<MinioState | null> {
  if (!minioEnabled()) return null
  minioState ??= (async () => {
    try {
      const { Client } = await import('minio')
      const client = new Client({
        endPoint: process.env.SPACE_MINIO_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? 'localhost',
        port: Number(process.env.SPACE_MINIO_PORT ?? process.env.MINIO_PORT ?? 9000),
        useSSL: (process.env.SPACE_MINIO_USE_SSL ?? process.env.MINIO_USE_SSL) === 'true',
        accessKey:
          process.env.SPACE_MINIO_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretKey:
          process.env.SPACE_MINIO_SECRET_KEY ?? process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      })
      const bucket = minioBucket()
      if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket)
      return { client, bucket }
    } catch {
      return null
    }
  })()
  return minioState
}

function safeObjectPath(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length) return null
  if (parts.some((part) => part === '.' || part === '..')) return null
  if (parts.some((part) => part.length > 180)) return null
  return parts.join('/')
}

export function contentTypeForPath(path: string) {
  const ext = extname(path).toLowerCase()
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.woff') return 'font/woff'
  if (ext === '.woff2') return 'font/woff2'
  return 'application/octet-stream'
}

function isZipUpload(upload: SpaceUploadFile) {
  const lower = upload.filename.toLowerCase()
  return lower.endsWith('.zip') || upload.contentType.includes('zip')
}

function isHtmlUpload(upload: SpaceUploadFile) {
  const lower = upload.filename.toLowerCase()
  return (
    lower.endsWith('.html') || lower.endsWith('.htm') || upload.contentType.includes('text/html')
  )
}

function isImageUpload(upload: SpaceUploadFile) {
  const lower = upload.filename.toLowerCase()
  return (
    upload.contentType.startsWith('image/') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg')
  )
}

async function putObject(
  provider: SpaceCdnProvider,
  key: string,
  buffer: Buffer,
  contentType: string,
) {
  if (provider === 'minio') {
    const state = await getMinioState()
    if (state) {
      await state.client.putObject(state.bucket, key, buffer, buffer.byteLength, {
        'Content-Type': contentType,
      })
      return
    }
  }
  const target = join(localCdnDir(), key)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, buffer)
}

async function providerForWrite(): Promise<SpaceCdnProvider> {
  return (await getMinioState()) ? 'minio' : 'local'
}

function fileUrl(key: string) {
  return `${cdnPublicBaseUrl()}/${key}`
}

async function storeFile(input: {
  provider: SpaceCdnProvider
  prefix: string
  path: string
  buffer: Buffer
}) {
  const contentType = contentTypeForPath(input.path)
  const key = posix.join(input.prefix, input.path)
  await putObject(input.provider, key, input.buffer, contentType)
  return {
    path: input.path,
    key,
    url: fileUrl(key),
    contentType,
    size: input.buffer.byteLength,
  } satisfies SpaceStoredFile
}

async function filesFromZip(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const files: Array<{ path: string; buffer: Buffer }> = []
  let totalBytes = 0
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const path = safeObjectPath(entry.name)
    if (!path || path.startsWith('__MACOSX/')) continue
    if (files.length >= MAX_FILES) throw Object.assign(new Error('too_many_files'), { status: 400 })
    const data = Buffer.from(await entry.async('uint8array'))
    totalBytes += data.byteLength
    if (totalBytes > MAX_EXTRACTED_BYTES) {
      throw Object.assign(new Error('extracted_package_too_large'), { status: 413 })
    }
    files.push({ path, buffer: data })
  }
  if (!files.length) throw Object.assign(new Error('empty_zip_package'), { status: 400 })
  return files
}

function chooseEntryPath(files: Array<{ path: string }>) {
  const rootIndex = files.find((file) => file.path.toLowerCase() === 'index.html')
  if (rootIndex) return rootIndex.path
  const htmlFiles = files
    .filter((file) => file.path.toLowerCase().endsWith('.html'))
    .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
  const firstHtml = htmlFiles[0]
  if (!firstHtml) throw Object.assign(new Error('zip_missing_html_entry'), { status: 400 })
  return firstHtml.path
}

export async function storeWebPackage(input: {
  artworkId: string
  versionId: string
  upload: SpaceUploadFile
}): Promise<StoredWebPackage> {
  if (input.upload.size > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error('upload_too_large'), { status: 413 })
  }
  const buffer = Buffer.from(input.upload.dataBase64, 'base64')
  if (buffer.byteLength !== input.upload.size) {
    throw Object.assign(new Error('upload_size_mismatch'), { status: 400 })
  }
  const provider = await providerForWrite()
  const prefix = posix.join(cdnPrefix(), 'artworks', input.artworkId, 'versions', input.versionId)
  if (isZipUpload(input.upload)) {
    const extracted = await filesFromZip(buffer)
    const entryPath = chooseEntryPath(extracted)
    const files = []
    for (const file of extracted) {
      files.push(await storeFile({ provider, prefix, path: file.path, buffer: file.buffer }))
    }
    return {
      sourceKind: 'zip',
      entryPath,
      cdnProvider: provider,
      cdnBaseUrl: `${cdnPublicBaseUrl()}/${prefix}`,
      files,
    }
  }
  if (!isHtmlUpload(input.upload)) {
    throw Object.assign(new Error('unsupported_upload_type'), { status: 415 })
  }
  const path = 'index.html'
  return {
    sourceKind: 'html',
    entryPath: path,
    cdnProvider: provider,
    cdnBaseUrl: `${cdnPublicBaseUrl()}/${prefix}`,
    files: [await storeFile({ provider, prefix, path, buffer })],
  }
}

export async function storeCoverImage(input: {
  targetType: 'profile' | 'artwork'
  targetId: string
  upload: SpaceUploadFile
}) {
  if (input.upload.size > MAX_COVER_BYTES) {
    throw Object.assign(new Error('cover_too_large'), { status: 413 })
  }
  if (!isImageUpload(input.upload)) {
    throw Object.assign(new Error('unsupported_cover_type'), { status: 415 })
  }
  const buffer = Buffer.from(input.upload.dataBase64, 'base64')
  if (buffer.byteLength !== input.upload.size) {
    throw Object.assign(new Error('upload_size_mismatch'), { status: 400 })
  }
  const safeName = input.upload.filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
  const provider = await providerForWrite()
  const key = posix.join(
    cdnPrefix(),
    'covers',
    input.targetType,
    input.targetId,
    `${Date.now()}-${safeName || 'cover'}`,
  )
  const contentType = input.upload.contentType || contentTypeForPath(input.upload.filename)
  await putObject(provider, key, buffer, contentType)
  return {
    path: safeName || 'cover',
    key,
    url: fileUrl(key),
    contentType,
    size: buffer.byteLength,
  } satisfies SpaceStoredFile
}

export async function readStoredObject(provider: SpaceCdnProvider, key: string) {
  if (provider === 'minio') {
    const state = await getMinioState()
    if (!state) throw Object.assign(new Error('minio_unavailable'), { status: 503 })
    const stream = await state.client.getObject(state.bucket, key)
    const chunks: Buffer[] = []
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return Buffer.concat(chunks)
  }
  return readFile(join(localCdnDir(), key))
}
