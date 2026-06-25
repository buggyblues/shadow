import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { eq, or } from 'drizzle-orm'
import { lookup, extension as mimeExtension } from 'mime-types'
import type { Logger } from 'pino'
import type { MessageDao } from '../dao/message.dao'
import type { Database } from '../db'
import { servers, users } from '../db/schema'
import type { ActorInput } from '../security/actor'
import type { PolicyService } from './policy.service'

type MediaDisposition = 'inline' | 'attachment'
export type MediaVariant = 'avatar' | 'preview' | 'banner'
type ActiveInlinePolicy = 'wallpaper'

type MediaTokenPayload = {
  bucket: string
  key: string
  contentType: string
  disposition: MediaDisposition
  activeInlinePolicy?: ActiveInlinePolicy
  filename?: string
  variant?: MediaVariant
  sourceKey?: string
  sourceContentType?: string
  exp: number
}

const SIGNED_MEDIA_TTL_SECONDS = Number(process.env.SIGNED_MEDIA_TTL_SECONDS ?? 300)
const TRANSFORMED_MEDIA_SOURCE_MAX_BYTES = Number(
  process.env.TRANSFORMED_MEDIA_SOURCE_MAX_BYTES ?? 25 * 1024 * 1024,
)
const PUBLIC_AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const UPLOAD_OBJECT_PREFIX = 'uploads/'
const VOICE_OBJECT_PREFIX = 'voice/'
const AVATAR_OBJECT_PREFIX = 'avatars/'

const mediaVariantConfig = {
  avatar: { width: 96, height: 96, fit: 'cover' as const, quality: 76 },
  preview: { width: 640, height: 640, fit: 'inside' as const, quality: 74 },
  banner: { width: 1280, height: 480, fit: 'cover' as const, quality: 74 },
} satisfies Record<
  MediaVariant,
  { width: number; height: number; fit: 'cover' | 'inside'; quality: number }
>

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function mediaSigningSecret(): string {
  const secret = process.env.MEDIA_SIGNING_SECRET ?? process.env.JWT_SECRET
  if (!secret) {
    throw Object.assign(new Error('Media signing secret is not configured'), { status: 500 })
  }
  return secret
}

function parseContentRef(contentRef: string): { bucket: string; key: string } | null {
  const match = contentRef.match(/^\/([^/]+)\/(.+)$/)
  if (!match?.[1] || !match[2]) return null
  return { bucket: match[1], key: match[2] }
}

function publicAvatarUrlForObject(object: { bucket: string; key: string }): string {
  const encodedPath = [object.bucket, ...object.key.split('/')].map(encodeURIComponent).join('/')
  return `/api/media/avatar/${encodedPath}`
}

function mediaPathFromUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value.split(/[?#]/)[0] ?? value
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

function parseSignedMediaContentRef(value: string): string | null {
  const path = mediaPathFromUrl(value)
  const token = path.match(/^\/api\/media\/signed\/([^/]+)$/)?.[1]
  const encoded = token?.split('.')[0]
  if (!encoded) return null

  try {
    const payload = JSON.parse(
      base64UrlDecode(encoded).toString('utf8'),
    ) as Partial<MediaTokenPayload>
    const key = payload.sourceKey ?? payload.key
    if (
      !payload.bucket ||
      !key ||
      (!key.startsWith(UPLOAD_OBJECT_PREFIX) &&
        !key.startsWith(VOICE_OBJECT_PREFIX) &&
        !key.startsWith(AVATAR_OBJECT_PREFIX))
    ) {
      return null
    }
    return `/${payload.bucket}/${key}`
  } catch {
    return null
  }
}

function isUploadedContentRef(value: string): boolean {
  return /^\/[^/]+\/(?:uploads|voice|avatars)\/.+/.test(value)
}

function normalizeReadableObjectKey(key: string): string | null {
  const normalizedKey = key.replace(/^\/+/, '')
  const segments = normalizedKey.split('/')
  if (
    !normalizedKey ||
    normalizedKey.length > 2048 ||
    normalizedKey.includes('\\') ||
    /[\0-\x1F\x7F]/u.test(normalizedKey) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null
  }
  return normalizedKey
}

function isPublicAvatarKey(key: string): boolean {
  if (key.startsWith(AVATAR_OBJECT_PREFIX)) {
    return !key.startsWith(`${AVATAR_OBJECT_PREFIX}variants/`) || isAvatarVariantKey(key)
  }
  return key.startsWith(UPLOAD_OBJECT_PREFIX) && !key.startsWith(`${UPLOAD_OBJECT_PREFIX}variants/`)
}

function isAvatarVariantKey(key: string): boolean {
  return key.startsWith(`${AVATAR_OBJECT_PREFIX}variants/avatar/`)
}

function isActiveContent(contentType: string): boolean {
  return /(?:html|xml|svg|javascript|ecmascript)/i.test(contentType)
}

function allowInline(contentType: string): boolean {
  return (
    /^(image\/|audio\/|video\/|application\/pdf$)/i.test(contentType) &&
    !isActiveContent(contentType)
  )
}

function allowActiveInline(contentType: string, policy: ActiveInlinePolicy | undefined): boolean {
  return policy === 'wallpaper' && /^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)
}

function canTransformImage(contentType: string): boolean {
  return /^image\/(?:png|jpe?g|webp|avif)$/i.test(contentType)
}

function activeInlineSecurityHeaders(
  policy: ActiveInlinePolicy | undefined,
): Record<string, string> {
  if (policy !== 'wallpaper') return {}
  return {
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
      "style-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
      'img-src data: blob: https:',
      'media-src data: blob: https:',
      'font-src data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com',
      "connect-src 'none'",
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; '),
  }
}

const SAFE_OBJECT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/
const SAFE_EXTENSION_RE = /^\.[a-z0-9]{1,16}$/

export function buildContentDispositionHeader(disposition: MediaDisposition, filename?: string) {
  if (!filename) return disposition
  const safeName = filename.replace(/[\0"\\/\r\n]/g, '_')
  const fallbackName = safeName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[;]/g, '_')
    .trim()
  const asciiName = fallbackName || `download${safeStorageExtension(safeName)}`
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

function safeStorageExtension(filename: string, contentType?: string): string {
  const rawExt = extname(filename).toLowerCase()
  if (SAFE_EXTENSION_RE.test(rawExt)) return rawExt

  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  const inferred = mediaType ? mimeExtension(mediaType) : false
  if (typeof inferred === 'string' && /^[a-z0-9]{1,16}$/.test(inferred)) return `.${inferred}`
  return ''
}

function normalizeWritableObjectKey(key: string): string {
  const normalizedKey = key.replace(/^\/+/, '')
  const segments = normalizedKey.split('/')
  if (
    !normalizedKey ||
    normalizedKey.includes('..') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    !SAFE_OBJECT_KEY_RE.test(normalizedKey)
  ) {
    throw Object.assign(new Error('Invalid object key'), { status: 400 })
  }
  return normalizedKey
}

function mediaVariantObjectKey(sourceKey: string, variant: MediaVariant): string {
  const slashIndex = sourceKey.lastIndexOf('/')
  const dir = slashIndex >= 0 ? sourceKey.slice(0, slashIndex) : ''
  const filename = slashIndex >= 0 ? sourceKey.slice(slashIndex + 1) : sourceKey
  const dotIndex = filename.lastIndexOf('.')
  const stem = (dotIndex > 0 ? filename.slice(0, dotIndex) : filename).replace(
    /[^A-Za-z0-9_-]/g,
    '_',
  )
  return `${dir}/variants/${variant}/${stem}.webp`.replace(/^\/+/, '')
}

function parseRange(header: string | undefined, size: number) {
  if (!header) return null
  const match = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return 'invalid' as const
  const startText = match[1] ?? ''
  const endText = match[2] ?? ''
  if (!startText && !endText) return 'invalid' as const

  let start: number
  let end: number
  if (!startText) {
    const suffix = Number(endText)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid' as const
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText ? Number(endText) : size - 1
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return 'invalid' as const
  }
  return { start, end: Math.min(end, size - 1) }
}

/** MinIO / S3 compatible storage service */
export class MediaService {
  // MinIO client will be initialized when service starts
  minioClient: import('minio').Client | null = null

  constructor(
    private deps: {
      db?: Database
      logger: Logger
      messageDao: MessageDao
      policyService: PolicyService
    },
  ) {}

  async init() {
    try {
      const { Client } = await import('minio')
      this.minioClient = new Client({
        endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
        port: Number(process.env.MINIO_PORT ?? 9000),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      })

      // Ensure bucket exists
      const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
      const exists = await this.minioClient.bucketExists(bucketName)
      if (!exists) {
        await this.minioClient.makeBucket(bucketName)
      }

      this.deps.logger.info('MinIO storage initialized with private bucket policy')
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'MinIO not available, file upload disabled')
    }
  }

  async upload(
    file: Buffer,
    filename: string,
    contentType: string,
    options?: { kind?: 'voice' | 'file' | 'image' | 'avatar' },
  ): Promise<{ url: string; size: number }> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }

    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const ext = safeStorageExtension(filename, contentType)
    const prefix =
      options?.kind === 'voice' ? 'voice' : options?.kind === 'avatar' ? 'avatars' : 'uploads'
    const key = `${prefix}/${randomUUID()}${ext}`

    await this.minioClient.putObject(bucketName, key, file, file.length, {
      'Content-Type': contentType,
    })
    await this.createImageVariants(bucketName, key, file, contentType)

    const url = `/${bucketName}/${key}`
    return { url, size: file.length }
  }

  async getPresignedUrl(key: string): Promise<string> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }

    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    return this.minioClient.presignedGetObject(bucketName, key, 3600)
  }

  async putPrivateObject(
    key: string,
    file: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<{ contentRef: string; size: number }> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }
    const normalizedKey = normalizeWritableObjectKey(key)

    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    await this.minioClient.putObject(bucketName, normalizedKey, file, file.length, {
      'Content-Type': contentType,
    })
    return { contentRef: `/${bucketName}/${normalizedKey}`, size: file.length }
  }

  async getPrivateObjectBuffer(keyOrContentRef: string): Promise<Buffer | null> {
    if (!this.minioClient) return null
    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const prefix = `/${bucketName}/`
    const key = keyOrContentRef.startsWith(prefix)
      ? keyOrContentRef.slice(prefix.length)
      : keyOrContentRef.replace(/^\/+/, '')
    if (!key || key.includes('..')) return null

    try {
      const stream = await this.minioClient.getObject(bucketName, key)
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
      }
      return Buffer.concat(chunks)
    } catch {
      return null
    }
  }

  async deletePrivateObject(keyOrContentRef: string): Promise<boolean> {
    if (!this.minioClient) return false
    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const prefix = `/${bucketName}/`
    const key = keyOrContentRef.startsWith(prefix)
      ? keyOrContentRef.slice(prefix.length)
      : keyOrContentRef.replace(/^\/+/, '')
    if (!key || key.includes('..')) return false

    try {
      await this.minioClient.removeObject(bucketName, key)
      return true
    } catch (err) {
      this.deps.logger.warn({ err, key }, 'Failed to delete private media object')
      return false
    }
  }

  normalizeMediaUrl(mediaUrl: string | null | undefined): string | null {
    if (!mediaUrl) return null
    return parseSignedMediaContentRef(mediaUrl) ?? mediaUrl
  }

  resolveAvatarUrl(mediaUrl: string | null | undefined): string | null {
    const normalized = this.normalizeMediaUrl(mediaUrl)
    if (!normalized) return null
    const object = parseContentRef(normalized)
    if (!object || !isPublicAvatarKey(object.key)) return normalized
    return publicAvatarUrlForObject(object)
  }

  resolveMediaUrl(
    mediaUrl: string | null | undefined,
    fallbackContentType = 'image/png',
    options?: { variant?: MediaVariant },
  ): string | null {
    if (options?.variant === 'avatar') return this.resolveAvatarUrl(mediaUrl)
    const normalized = this.normalizeMediaUrl(mediaUrl)
    if (!normalized || !isUploadedContentRef(normalized)) return normalized
    try {
      return this.createSignedUrl({
        contentRef: normalized,
        contentType: (lookup(normalized) as string | false) || fallbackContentType,
        disposition: 'inline',
        variant: options?.variant,
      }).url
    } catch {
      return normalized
    }
  }

  async resolveAttachmentMediaUrl(input: {
    actor: ActorInput
    attachmentId: string
    disposition: MediaDisposition
    variant?: MediaVariant
  }): Promise<{ url: string; expiresAt: string }> {
    const attachment = await this.deps.messageDao.findAttachmentById(input.attachmentId)
    if (!attachment) throw Object.assign(new Error('Attachment not found'), { status: 404 })
    const message = await this.deps.messageDao.findById(attachment.messageId)
    if (!message) throw Object.assign(new Error('Message not found'), { status: 404 })
    await this.deps.policyService.requireChannelRead(input.actor, message.channelId)
    return this.createSignedUrl({
      contentRef: attachment.url,
      contentType: attachment.contentType,
      disposition: input.disposition,
      filename: attachment.filename,
      variant: input.variant,
    })
  }

  createSignedUrl(input: {
    contentRef: string
    contentType: string
    disposition: MediaDisposition
    filename?: string
    variant?: MediaVariant
    activeInlinePolicy?: ActiveInlinePolicy
  }): { url: string; expiresAt: string } {
    const object = parseContentRef(input.contentRef)
    if (!object) throw Object.assign(new Error('Invalid media reference'), { status: 400 })

    const now = Math.floor(Date.now() / 1000)
    const exp =
      Math.ceil(now / SIGNED_MEDIA_TTL_SECONDS) * SIGNED_MEDIA_TTL_SECONDS +
      SIGNED_MEDIA_TTL_SECONDS
    const activeInlinePolicy = allowActiveInline(input.contentType, input.activeInlinePolicy)
      ? input.activeInlinePolicy
      : undefined
    const disposition =
      input.disposition === 'inline' &&
      (allowInline(input.contentType) || Boolean(activeInlinePolicy))
        ? 'inline'
        : 'attachment'
    const variant =
      disposition === 'inline' && input.variant && canTransformImage(input.contentType)
        ? input.variant
        : undefined
    const deliveryObject = variant
      ? { bucket: object.bucket, key: mediaVariantObjectKey(object.key, variant) }
      : object
    const payload: MediaTokenPayload = {
      ...deliveryObject,
      contentType: variant ? 'image/webp' : input.contentType || 'application/octet-stream',
      disposition,
      activeInlinePolicy: disposition === 'inline' ? activeInlinePolicy : undefined,
      filename: input.filename,
      variant,
      ...(variant
        ? {
            sourceKey: object.key,
            sourceContentType: input.contentType || 'application/octet-stream',
          }
        : {}),
      exp,
    }
    const encoded = base64UrlEncode(JSON.stringify(payload))
    const sig = createHmac('sha256', mediaSigningSecret()).update(encoded).digest('base64url')
    return {
      url: `/api/media/signed/${encoded}.${sig}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    }
  }

  verifySignedToken(token: string): MediaTokenPayload {
    const [encoded, sig] = token.split('.')
    if (!encoded || !sig) throw Object.assign(new Error('Invalid media token'), { status: 401 })
    const expected = createHmac('sha256', mediaSigningSecret()).update(encoded).digest()
    const actual = base64UrlDecode(sig)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw Object.assign(new Error('Invalid media token'), { status: 401 })
    }

    const payload = JSON.parse(base64UrlDecode(encoded).toString('utf8')) as MediaTokenPayload
    if (!payload.bucket || !payload.key || !payload.exp || Date.now() / 1000 >= payload.exp) {
      throw Object.assign(new Error('Expired media token'), { status: 401 })
    }
    return payload
  }

  private async buildImageVariant(input: Buffer, variant: MediaVariant): Promise<Buffer> {
    const { default: sharp } = await import('sharp')
    const config = mediaVariantConfig[variant]
    return sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: config.width,
        height: config.height,
        fit: config.fit,
        withoutEnlargement: true,
      })
      .webp({ quality: config.quality, effort: 4 })
      .toBuffer()
  }

  private async createImageVariants(
    bucketName: string,
    sourceKey: string,
    source: Buffer,
    contentType: string,
  ) {
    if (!this.minioClient || !canTransformImage(contentType)) return
    if (source.length > TRANSFORMED_MEDIA_SOURCE_MAX_BYTES) {
      this.deps.logger.warn(
        { key: sourceKey, size: source.length },
        'Skipping image variants because source is too large',
      )
      return
    }

    await Promise.all(
      (Object.keys(mediaVariantConfig) as MediaVariant[]).map(async (variant) => {
        try {
          const body = await this.buildImageVariant(source, variant)
          await this.minioClient!.putObject(
            bucketName,
            mediaVariantObjectKey(sourceKey, variant),
            body,
            body.length,
            {
              'Content-Type': 'image/webp',
              'X-Shadow-Source-Key': sourceKey,
            },
          )
        } catch (err) {
          this.deps.logger.warn(
            { err, key: sourceKey, variant },
            'Failed to create image variant during upload',
          )
        }
      }),
    )
  }

  private async ensureImageVariantObject(payload: MediaTokenPayload & { variant: MediaVariant }) {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }
    if (!payload.sourceKey) {
      throw Object.assign(new Error('Variant source is not available'), { status: 404 })
    }

    try {
      await this.minioClient.statObject(payload.bucket, payload.key)
      return
    } catch {
      // Missing persistent variant for legacy uploads. Build it once and store it in MinIO.
    }

    const stat = await this.minioClient.statObject(payload.bucket, payload.sourceKey)
    const sourceSize = Number(stat.size)
    if (
      !Number.isFinite(sourceSize) ||
      sourceSize <= 0 ||
      sourceSize > TRANSFORMED_MEDIA_SOURCE_MAX_BYTES
    ) {
      throw Object.assign(new Error('Image source is too large for variant transform'), {
        status: 413,
      })
    }

    const stream = await this.minioClient.getObject(payload.bucket, payload.sourceKey)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }

    const body = await this.buildImageVariant(Buffer.concat(chunks), payload.variant)
    await this.minioClient.putObject(payload.bucket, payload.key, body, body.length, {
      'Content-Type': 'image/webp',
      'X-Shadow-Source-Key': payload.sourceKey,
    })
  }

  private async getObjectResponse(
    payload: Omit<MediaTokenPayload, 'variant' | 'sourceKey' | 'sourceContentType'>,
    rangeHeader?: string,
    options?: { cacheControl?: string; publicCrossOrigin?: boolean },
  ): Promise<{
    body: ReadableStream<Uint8Array>
    status: 200 | 206
    headers: Record<string, string>
  }> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }

    const stat = await this.minioClient.statObject(payload.bucket, payload.key)
    const size = Number(stat.size)
    const statRecord = stat as { etag?: unknown; lastModified?: unknown }
    const rawEtag =
      typeof statRecord.etag === 'string' && statRecord.etag
        ? statRecord.etag.replace(/^"|"$/g, '')
        : null
    const lastModified =
      statRecord.lastModified instanceof Date
        ? statRecord.lastModified.toUTCString()
        : typeof statRecord.lastModified === 'string'
          ? statRecord.lastModified
          : null
    const range = parseRange(rangeHeader, size)
    if (range === 'invalid') {
      throw Object.assign(new Error('Invalid range'), {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      })
    }

    const stream = range
      ? await this.minioClient.getPartialObject(
          payload.bucket,
          payload.key,
          range.start,
          range.end - range.start + 1,
        )
      : await this.minioClient.getObject(payload.bucket, payload.key)
    const status = range ? 206 : 200
    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': options?.cacheControl ?? 'private, max-age=300',
      'Content-Disposition': buildContentDispositionHeader(payload.disposition, payload.filename),
      'Content-Length': String(range ? range.end - range.start + 1 : size),
      'Content-Type': payload.contentType || 'application/octet-stream',
      ...(rawEtag ? { ETag: `"${rawEtag}"` } : {}),
      ...(lastModified ? { 'Last-Modified': lastModified } : {}),
      'X-Content-Type-Options': 'nosniff',
      ...(options?.publicCrossOrigin
        ? {
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          }
        : {}),
      ...activeInlineSecurityHeaders(payload.activeInlinePolicy),
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    }

    return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array>, status, headers }
  }

  async getSignedObjectResponse(
    payload: MediaTokenPayload,
    rangeHeader?: string,
  ): Promise<{
    body: ReadableStream<Uint8Array>
    status: 200 | 206
    headers: Record<string, string>
  }> {
    if (payload.variant && payload.sourceKey) {
      try {
        await this.ensureImageVariantObject(
          payload as MediaTokenPayload & { variant: MediaVariant },
        )
      } catch (err) {
        this.deps.logger.warn(
          { err, key: payload.sourceKey, variant: payload.variant },
          'Failed to resolve persistent media variant; falling back to original object',
        )
        return this.getObjectResponse(
          {
            bucket: payload.bucket,
            key: payload.sourceKey,
            contentType: payload.sourceContentType ?? 'application/octet-stream',
            disposition: payload.disposition,
            filename: payload.filename,
            exp: payload.exp,
          },
          rangeHeader,
        )
      }
    }

    return this.getObjectResponse(payload, rangeHeader)
  }

  async getPublicAvatarResponse(
    bucket: string,
    key: string,
    rangeHeader?: string,
  ): Promise<{
    body: ReadableStream<Uint8Array>
    status: 200 | 206
    headers: Record<string, string>
  }> {
    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const normalizedKey = normalizeReadableObjectKey(key)
    if (
      bucket !== bucketName ||
      !normalizedKey ||
      !(await this.isPublicAvatarObject(bucket, normalizedKey))
    ) {
      throw Object.assign(new Error('Avatar not found'), { status: 404 })
    }

    const sourceContentType = (lookup(normalizedKey) as string | false) || 'image/png'
    if (!sourceContentType.startsWith('image/') || isActiveContent(sourceContentType)) {
      throw Object.assign(new Error('Avatar not found'), { status: 404 })
    }

    const publicOptions = {
      cacheControl: PUBLIC_AVATAR_CACHE_CONTROL,
      publicCrossOrigin: true,
    }

    if (canTransformImage(sourceContentType) && !isAvatarVariantKey(normalizedKey)) {
      const variantPayload: MediaTokenPayload & { variant: MediaVariant } = {
        bucket,
        key: mediaVariantObjectKey(normalizedKey, 'avatar'),
        contentType: 'image/webp',
        disposition: 'inline',
        variant: 'avatar',
        sourceKey: normalizedKey,
        sourceContentType,
        exp: Math.floor(Date.now() / 1000) + 60,
      }

      try {
        await this.ensureImageVariantObject(variantPayload)
        return this.getObjectResponse(variantPayload, rangeHeader, publicOptions)
      } catch (err) {
        this.deps.logger.warn(
          { err, key: normalizedKey },
          'Failed to resolve public avatar variant; falling back to source object',
        )
      }
    }

    return this.getObjectResponse(
      {
        bucket,
        key: normalizedKey,
        contentType: sourceContentType,
        disposition: 'inline',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      rangeHeader,
      publicOptions,
    )
  }

  async getObjectStream(
    contentRef: string,
    rangeHeader?: string,
  ): Promise<{
    body: ReadableStream<Uint8Array>
    status: 200 | 206
    headers: Record<string, string>
  } | null> {
    const object = parseContentRef(contentRef)
    if (!object) return null
    return this.getSignedObjectResponse(
      {
        ...object,
        contentType: 'application/octet-stream',
        disposition: 'attachment',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      rangeHeader,
    ).catch(() => null)
  }

  /** Retrieve file content from MinIO by its contentRef (e.g. /shadow/uploads/... or /shadow/voice/...) */
  async getFileBuffer(contentRef: string): Promise<Buffer | null> {
    if (!this.minioClient) return null
    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const prefix = `/${bucketName}/`
    if (!contentRef.startsWith(prefix)) return null
    const key = contentRef.slice(prefix.length)

    try {
      const stream = await this.minioClient.getObject(bucketName, key)
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk))
      }
      return Buffer.concat(chunks)
    } catch {
      return null
    }
  }

  private async isPublicAvatarObject(bucket: string, key: string): Promise<boolean> {
    if (!isPublicAvatarKey(key)) return false
    if (key.startsWith(AVATAR_OBJECT_PREFIX)) return true
    return this.isLegacyIdentityAvatarRef(bucket, key)
  }

  private async isLegacyIdentityAvatarRef(bucket: string, key: string): Promise<boolean> {
    if (!this.deps.db || !key.startsWith(UPLOAD_OBJECT_PREFIX)) return false
    const contentRef = `/${bucket}/${key}`
    const publicPath = publicAvatarUrlForObject({ bucket, key })

    const [userMatch, serverMatch] = await Promise.all([
      this.deps.db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.avatarUrl, contentRef), eq(users.avatarUrl, publicPath)))
        .limit(1),
      this.deps.db
        .select({ id: servers.id })
        .from(servers)
        .where(or(eq(servers.iconUrl, contentRef), eq(servers.iconUrl, publicPath)))
        .limit(1),
    ])

    return userMatch.length > 0 || serverMatch.length > 0
  }
}
