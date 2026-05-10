import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { lookup } from 'mime-types'
import type { Logger } from 'pino'
import type { MessageDao } from '../dao/message.dao'
import type { ActorInput } from '../security/actor'
import type { PolicyService } from './policy.service'

type MediaDisposition = 'inline' | 'attachment'
type MediaTokenPayload = {
  bucket: string
  key: string
  contentType: string
  disposition: MediaDisposition
  filename?: string
  exp: number
}

const SIGNED_MEDIA_TTL_SECONDS = Number(process.env.SIGNED_MEDIA_TTL_SECONDS ?? 300)

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
    if (!payload.bucket || !payload.key || !payload.key.startsWith('uploads/')) return null
    return `/${payload.bucket}/${payload.key}`
  } catch {
    return null
  }
}

function isUploadedContentRef(value: string): boolean {
  return /^\/[^/]+\/uploads\/.+/.test(value)
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

function contentDisposition(disposition: MediaDisposition, filename?: string) {
  const safeName = filename?.replace(/["\r\n]/g, '_')
  return safeName ? `${disposition}; filename="${safeName}"` : disposition
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
  ): Promise<{ url: string; size: number }> {
    if (!this.minioClient) {
      throw Object.assign(new Error('File storage not available'), { status: 503 })
    }

    const bucketName = process.env.MINIO_BUCKET ?? 'shadow'
    const ext = extname(filename) || ''
    const key = `uploads/${randomUUID()}${ext}`

    await this.minioClient.putObject(bucketName, key, file, file.length, {
      'Content-Type': contentType,
    })

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

  normalizeMediaUrl(mediaUrl: string | null | undefined): string | null {
    if (!mediaUrl) return null
    return parseSignedMediaContentRef(mediaUrl) ?? mediaUrl
  }

  resolveMediaUrl(
    mediaUrl: string | null | undefined,
    fallbackContentType = 'image/png',
  ): string | null {
    const normalized = this.normalizeMediaUrl(mediaUrl)
    if (!normalized || !isUploadedContentRef(normalized)) return normalized
    try {
      return this.createSignedUrl({
        contentRef: normalized,
        contentType: (lookup(normalized) as string | false) || fallbackContentType,
        disposition: 'inline',
      }).url
    } catch {
      return normalized
    }
  }

  async resolveAttachmentMediaUrl(input: {
    actor: ActorInput
    attachmentId: string
    disposition: MediaDisposition
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
    })
  }

  createSignedUrl(input: {
    contentRef: string
    contentType: string
    disposition: MediaDisposition
    filename?: string
  }): { url: string; expiresAt: string } {
    const object = parseContentRef(input.contentRef)
    if (!object) throw Object.assign(new Error('Invalid media reference'), { status: 400 })

    const exp = Math.floor(Date.now() / 1000) + SIGNED_MEDIA_TTL_SECONDS
    const disposition =
      input.disposition === 'inline' && allowInline(input.contentType) ? 'inline' : 'attachment'
    const payload: MediaTokenPayload = {
      ...object,
      contentType: input.contentType || 'application/octet-stream',
      disposition,
      filename: input.filename,
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

  async getSignedObjectResponse(
    payload: MediaTokenPayload,
    rangeHeader?: string,
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
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': contentDisposition(payload.disposition, payload.filename),
      'Content-Length': String(range ? range.end - range.start + 1 : size),
      'Content-Type': payload.contentType || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    }

    return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array>, status, headers }
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

  /** Retrieve file content from MinIO by its contentRef (e.g. /shadow/uploads/...) */
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
}
