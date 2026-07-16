import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let testRoot = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => join(testRoot, name)),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  nativeImage: {
    createFromPath: vi.fn((path: string) => ({
      isEmpty: () => false,
      getSize: () => {
        if (path.endsWith('spritesheet.webp')) return { width: 1536, height: 1872 }
        return { width: 1, height: 1 }
      },
    })),
  },
  net: {
    fetch: vi.fn(),
  },
}))

vi.mock('../src/main/services/connector-daemon.service', () => ({
  readCommunityAccessToken: vi.fn(async () => 'token'),
}))

vi.mock('../src/main/services/desktop-settings.service', () => ({
  broadcastDesktopSettings: vi.fn(),
  getDesktopServerBaseUrl: vi.fn(() => 'http://localhost'),
  readDesktopSettings: vi.fn(() => ({
    desktopPetPacks: [],
    desktopPetActivePackId: '',
  })),
  saveDesktopSettings: vi.fn((patch) => ({
    desktopPetPacks: patch.desktopPetPacks ?? [],
    desktopPetActivePackId: patch.desktopPetActivePackId ?? '',
  })),
}))

function petManifest(spriteVersionNumber?: 1 | 2) {
  return {
    id: 'creator.lazy',
    displayName: 'Lazy Buddy',
    description: 'A Codex pet package.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
    ...(spriteVersionNumber ? { spriteVersionNumber } : {}),
  }
}

function slugNameManifest() {
  return {
    slug: 'boba-buddy',
    name: 'Boba Buddy',
    description: 'A community pet package.',
    kind: 'creature',
  }
}

function codexVp8lSpritesheetHeader(height = 1872) {
  const widthMinusOne = 1535
  const heightMinusOne = height - 1
  const buffer = Buffer.alloc(26)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(buffer.byteLength - 8, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8L', 12, 'ascii')
  buffer.writeUInt32LE(5, 16)
  buffer[20] = 0x2f
  buffer[21] = widthMinusOne & 0xff
  buffer[22] = ((widthMinusOne >> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6)
  buffer[23] = (heightMinusOne >> 2) & 0xff
  buffer[24] = (heightMinusOne >> 10) & 0x0f
  return buffer
}

async function packArchive(prefix = '', spriteVersionNumber?: 1 | 2) {
  const zip = new JSZip()
  zip.file(`${prefix}pet.json`, JSON.stringify(petManifest(spriteVersionNumber)))
  zip.file(
    `${prefix}spritesheet.webp`,
    codexVp8lSpritesheetHeader(spriteVersionNumber === 2 ? 2288 : 1872),
  )
  zip.file(`${prefix}preview.webp`, 'preview')
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}

async function slugNamePackArchive(prefix = '') {
  const zip = new JSZip()
  zip.file(`${prefix}pet.json`, JSON.stringify(slugNameManifest()))
  zip.file(`${prefix}spritesheet.webp`, codexVp8lSpritesheetHeader())
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}

describe('desktop pet asset pack import', () => {
  beforeEach(() => {
    vi.resetModules()
    testRoot = mkdtempSync(join(tmpdir(), 'shadow-pet-assets-'))
  })

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true })
  })

  it('imports a marketplace archive and records source ids', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchive(await packArchive(), {
      source: 'marketplace',
      marketplaceEntitlementId: 'entitlement-1',
      marketplacePaidFileId: 'file-1',
      marketplaceProductId: 'product-1',
    })

    expect(pack).toMatchObject({
      id: 'creator.lazy',
      spriteVersionNumber: 1,
      displayName: { en: 'Lazy Buddy' },
      description: 'A Codex pet package.',
      spritesheetPath: 'spritesheet.webp',
      source: 'marketplace',
      marketplaceEntitlementId: 'entitlement-1',
      marketplacePaidFileId: 'file-1',
      marketplaceProductId: 'product-1',
    })
    expect(pack.sprites.idle?.frame).toEqual({ width: 192, height: 208, count: 6, fps: 5 })
    expect(pack.sprites.idle?.atlas).toEqual({ columns: 8, rows: 9, row: 0 })
    expect(pack.sprites.waving?.frame).toEqual({ width: 192, height: 208, count: 4, fps: 6 })
    expect(pack.sprites.review?.atlas).toEqual({ columns: 8, rows: 9, row: 8 })
    expect(pack.sourcePath).toContain('desktop-pet-packs')
  })

  it('imports a v2 archive with 11 atlas rows', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchive(
      await packArchive('', 2),
      { source: 'local' },
    )

    expect(pack.spriteVersionNumber).toBe(2)
    expect(pack.sprites.idle?.atlas).toEqual({ columns: 8, rows: 11, row: 0 })
    expect(pack.sprites.review?.atlas).toEqual({ columns: 8, rows: 11, row: 8 })
  })

  it('rejects an atlas whose height does not match its declared sprite version', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')
    const zip = new JSZip()
    zip.file('pet.json', JSON.stringify(petManifest(2)))
    zip.file('spritesheet.webp', codexVp8lSpritesheetHeader())

    await expect(
      __desktopPetAssetTestHooks.importPetPackFromArchive(
        Buffer.from(await zip.generateAsync({ type: 'uint8array' })),
        { source: 'local' },
      ),
    ).rejects.toThrow('spritesheet must be 1536x2288 for spriteVersionNumber 2')
  })

  it('accepts archives with a single top-level pack folder', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchive(
      await packArchive('pet-pack/'),
      { source: 'local' },
    )

    expect(pack.id).toBe('creator.lazy')
  })

  it('imports manifests with slug and name aliases', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchive(
      await slugNamePackArchive(),
      { source: 'local' },
    )

    expect(pack).toMatchObject({
      id: 'boba-buddy',
      displayName: { en: 'Boba Buddy' },
      description: 'A community pet package.',
      source: 'local',
      spritesheetPath: 'spritesheet.webp',
    })
    expect(pack.sprites.review?.atlas).toEqual({ columns: 8, rows: 9, row: 8 })
  })

  it('imports a local codex-pet zip path without requiring manual extraction', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')
    const archivePath = join(testRoot, 'lazy.codex-pet.zip')
    writeFileSync(archivePath, await packArchive())

    const pack = await __desktopPetAssetTestHooks.importPetPackFromPath(archivePath, {
      source: 'local',
    })

    expect(pack).toMatchObject({
      id: 'creator.lazy',
      displayName: { en: 'Lazy Buddy' },
      source: 'local',
      spritesheetPath: 'spritesheet.webp',
    })
    expect(pack.sourcePath).toContain('desktop-pet-packs')
  })

  it('imports a dropped codex-pet zip from archive bytes when no file path is available', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchiveData({
      name: 'lazy.codex-pet.zip',
      data: await packArchive(),
    })

    expect(pack).toMatchObject({
      id: 'creator.lazy',
      displayName: { en: 'Lazy Buddy' },
      source: 'local',
      spritesheetPath: 'spritesheet.webp',
    })
  })

  it('rejects unsafe archive paths before writing outside the temp folder', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')
    const zip = new JSZip()
    zip.file('C:/pet.json', JSON.stringify(petManifest()))

    await expect(
      __desktopPetAssetTestHooks.importPetPackFromArchive(
        Buffer.from(await zip.generateAsync({ type: 'uint8array' })),
        { source: 'local' },
      ),
    ).rejects.toThrow('unsafe path')
  })

  it('rejects executable files in archives', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')
    const zip = new JSZip()
    zip.file('pet.json', JSON.stringify(petManifest()))
    zip.file('spritesheet.webp', codexVp8lSpritesheetHeader())
    zip.file('scripts/install.sh', 'echo unsafe')

    await expect(
      __desktopPetAssetTestHooks.importPetPackFromArchive(
        Buffer.from(await zip.generateAsync({ type: 'uint8array' })),
        { source: 'local' },
      ),
    ).rejects.toThrow('blocked file extension')
  })

  it('rejects archives with unreadable spritesheet bytes', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/services/pet-assets.service')
    const zip = new JSZip()
    zip.file('pet.json', JSON.stringify(petManifest()))
    zip.file('spritesheet.webp', 'not a webp image')

    await expect(
      __desktopPetAssetTestHooks.importPetPackFromArchive(
        Buffer.from(await zip.generateAsync({ type: 'uint8array' })),
        { source: 'local' },
      ),
    ).rejects.toThrow('spritesheetPath is not a readable image')
  })
})
