import { Readable } from 'node:stream'
import type { Logger } from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageDao } from '../src/dao/message.dao'
import type { Database } from '../src/db'
import { MediaService } from '../src/services/media.service'
import type { PolicyService } from '../src/services/policy.service'

function createMediaService(
  overrides: Partial<ConstructorParameters<typeof MediaService>[0]> = {},
) {
  return new MediaService({
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
    } as unknown as Logger,
    messageDao: {} as MessageDao,
    policyService: {} as PolicyService,
    ...overrides,
  })
}

function createIdentityAvatarDb(userRows: unknown[] = [], serverRows: unknown[] = []) {
  const results = [userRows, serverRows]
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(results.shift() ?? []),
        })),
      })),
    })),
  } as unknown as Database
}

describe('MediaService signed variants', () => {
  beforeEach(() => {
    vi.stubEnv('MEDIA_SIGNING_SECRET', 'test-media-secret')
  })

  it('resolves avatar content refs to stable public avatar URLs', () => {
    const service = createMediaService()

    expect(
      service.resolveMediaUrl('/shadow/avatars/avatar.png', 'image/png', {
        variant: 'avatar',
      }),
    ).toBe('/api/media/avatar/shadow/avatars/avatar.png')
  })

  it('normalizes legacy signed avatar URLs back to public avatar URLs', () => {
    const service = createMediaService()
    const signed = service.createSignedUrl({
      contentRef: '/shadow/uploads/avatar.png',
      contentType: 'image/png',
      disposition: 'inline',
      filename: 'avatar.png',
      variant: 'avatar',
    })

    expect(service.resolveAvatarUrl(signed.url)).toBe('/api/media/avatar/shadow/uploads/avatar.png')
  })

  it('embeds avatar variants for transformable inline images', () => {
    const service = createMediaService()
    const signed = service.createSignedUrl({
      contentRef: '/shadow/uploads/avatar.png',
      contentType: 'image/png',
      disposition: 'inline',
      filename: 'avatar.png',
      variant: 'avatar',
    })

    const payload = service.verifySignedToken(signed.url.split('/').pop()!)

    expect(payload).toMatchObject({
      bucket: 'shadow',
      key: 'uploads/variants/avatar/avatar.webp',
      contentType: 'image/webp',
      disposition: 'inline',
      filename: 'avatar.png',
      variant: 'avatar',
      sourceKey: 'uploads/avatar.png',
      sourceContentType: 'image/png',
    })
  })

  it('creates persistent image variants during upload', async () => {
    const service = createMediaService()
    const putObject = vi.fn().mockResolvedValue(undefined)
    service.minioClient = {
      putObject,
    } as unknown as typeof service.minioClient
    const { default: sharp } = await import('sharp')
    const image = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: '#ff0000',
      },
    })
      .png()
      .toBuffer()

    await service.upload(image, 'sample.png', 'image/png')

    expect(putObject).toHaveBeenCalledTimes(4)
    expect(putObject.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^uploads\/[0-9a-f-]+\.png$/),
        expect.stringMatching(/^uploads\/variants\/avatar\/[0-9a-f-]+\.webp$/),
        expect.stringMatching(/^uploads\/variants\/preview\/[0-9a-f-]+\.webp$/),
        expect.stringMatching(/^uploads\/variants\/banner\/[0-9a-f-]+\.webp$/),
      ]),
    )
  })

  it('stores avatar uploads under the public identity image prefix', async () => {
    const service = createMediaService()
    const putObject = vi.fn().mockResolvedValue(undefined)
    service.minioClient = {
      putObject,
    } as unknown as typeof service.minioClient
    const { default: sharp } = await import('sharp')
    const image = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: '#ff0000',
      },
    })
      .png()
      .toBuffer()

    const uploaded = await service.upload(image, 'avatar.png', 'image/png', { kind: 'avatar' })

    expect(uploaded.url).toMatch(/^\/shadow\/avatars\/[0-9a-f-]+\.png$/)
    expect(putObject.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^avatars\/[0-9a-f-]+\.png$/),
        expect.stringMatching(/^avatars\/variants\/avatar\/[0-9a-f-]+\.webp$/),
        expect.stringMatching(/^avatars\/variants\/preview\/[0-9a-f-]+\.webp$/),
        expect.stringMatching(/^avatars\/variants\/banner\/[0-9a-f-]+\.webp$/),
      ]),
    )
  })

  it('uses storage-safe object keys when filenames contain unsafe extensions', async () => {
    const service = createMediaService()
    const putObject = vi.fn().mockResolvedValue(undefined)
    service.minioClient = {
      putObject,
    } as unknown as typeof service.minioClient

    const uploaded = await service.upload(
      Buffer.from('pdf'),
      '电商AI选品方法论.数据',
      'application/pdf',
    )

    expect(uploaded.url).toMatch(/^\/shadow\/uploads\/[0-9a-f-]+\.pdf$/)
    expect(putObject).toHaveBeenCalledWith(
      'shadow',
      expect.stringMatching(/^uploads\/[0-9a-f-]+\.pdf$/),
      expect.any(Buffer),
      3,
      { 'Content-Type': 'application/pdf' },
    )
  })

  it('rejects caller supplied private object keys that are not URL-safe', async () => {
    const service = createMediaService()
    service.minioClient = {
      putObject: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof service.minioClient

    await expect(
      service.putPrivateObject('exports/电商AI选品方法论.pdf', Buffer.from('pdf')),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('does not embed variants for active image content', () => {
    const service = createMediaService()
    const signed = service.createSignedUrl({
      contentRef: '/shadow/uploads/icon.svg',
      contentType: 'image/svg+xml',
      disposition: 'inline',
      filename: 'icon.svg',
      variant: 'avatar',
    })

    const payload = service.verifySignedToken(signed.url.split('/').pop()!)

    expect(payload).toMatchObject({
      contentType: 'image/svg+xml',
      disposition: 'attachment',
    })
    expect(payload.variant).toBeUndefined()
  })

  it('serves public avatar objects with public cross-origin cache headers', async () => {
    const service = createMediaService()
    service.minioClient = {
      statObject: vi.fn().mockResolvedValue({ size: 2 }),
      getObject: vi.fn().mockResolvedValue(Readable.from([Buffer.from('ok')])),
    } as unknown as typeof service.minioClient

    const response = await service.getPublicAvatarResponse(
      'shadow',
      'avatars/variants/avatar/avatar.webp',
    )

    expect(response.status).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*')
    expect(response.headers['Cross-Origin-Resource-Policy']).toBe('cross-origin')
    expect(response.headers['Cache-Control']).toContain('public')
  })

  it('serves legacy identity avatar uploads with historical readable filenames', async () => {
    const service = createMediaService({
      db: createIdentityAvatarDb([{ id: 'user-1' }], []),
    })
    const statObject = vi.fn().mockResolvedValue({ size: 2 })
    const getObject = vi.fn().mockResolvedValue(Readable.from([Buffer.from('ok')]))
    service.minioClient = {
      statObject,
      getObject,
    } as unknown as typeof service.minioClient

    const response = await service.getPublicAvatarResponse(
      'shadow',
      'uploads/example-avatar-示例文件 (1).png',
    )

    expect(response.status).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*')
    expect(getObject).toHaveBeenCalledWith(
      'shadow',
      expect.stringMatching(/^uploads\/variants\/avatar\//),
    )
  })

  it('does not expose ordinary uploads through the public avatar route', async () => {
    const service = createMediaService()
    const statObject = vi.fn()
    service.minioClient = {
      statObject,
      getObject: vi.fn(),
    } as unknown as typeof service.minioClient

    await expect(
      service.getPublicAvatarResponse('shadow', 'uploads/photo.png'),
    ).rejects.toMatchObject({
      status: 404,
    })
    expect(statObject).not.toHaveBeenCalled()
  })

  it('serves non-ASCII filenames with an ASCII-safe content disposition header', async () => {
    const service = createMediaService()
    service.minioClient = {
      statObject: vi.fn().mockResolvedValue({ size: 7 }),
      getObject: vi.fn().mockResolvedValue(Readable.from([Buffer.from('%PDF-1')])),
    } as unknown as typeof service.minioClient

    const filename = '电商AI选品方法论_SOP_Reddit案例攻略.pdf'
    const response = await service.getSignedObjectResponse({
      bucket: 'shadow',
      key: 'uploads/report.pdf',
      contentType: 'application/pdf',
      disposition: 'inline',
      filename,
      exp: Math.floor(Date.now() / 1000) + 60,
    })

    const header = response.headers['Content-Disposition']
    expect(header).toMatch(/^inline; filename="[^"]+"; filename\*=UTF-8''/)
    expect(header).not.toMatch(/[^\x00-\x7F]/)
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1]!)).toBe(filename)
  })
})
