import { mkdtempSync, rmSync } from 'node:fs'
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
        if (path.endsWith('idle.png')) return { width: 512, height: 320 }
        if (path.endsWith('cover.webp')) return { width: 600, height: 400 }
        return { width: 256, height: 320 }
      },
    })),
  },
  net: {
    fetch: vi.fn(),
  },
}))

vi.mock('../src/main/connector-daemon', () => ({
  readCommunityAccessToken: vi.fn(async () => 'token'),
}))

vi.mock('../src/main/desktop-settings', () => ({
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

function metadata() {
  return {
    schemaVersion: 'shadow.desktopPet.pack.v1',
    id: 'creator.lazy',
    version: '1.0.0',
    displayName: { en: 'Lazy Buddy', 'zh-CN': '小懒伙伴' },
    compatibility: {
      shadowDesktop: '>=0.2.1',
      renderer: ['sprite-sheet'],
      features: ['emotion-overrides'],
    },
    entry: {
      renderer: 'sprite-sheet',
      pixelRatio: 2,
      canvas: { width: 256, height: 320 },
      anchor: { x: 0.5, y: 0.88 },
    },
    files: { cover: 'preview/cover.webp' },
    sprites: {
      idle: {
        src: 'sprites/idle.png',
        frame: { width: 256, height: 320, count: 2, fps: 6 },
        loop: true,
      },
    },
  }
}

async function packArchive(prefix = '') {
  const zip = new JSZip()
  zip.file(`${prefix}metadata.json`, JSON.stringify(metadata()))
  zip.file(`${prefix}preview/cover.webp`, 'cover')
  zip.file(`${prefix}sprites/idle.png`, 'sprite')
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
    const { __desktopPetAssetTestHooks } = await import('../src/main/pet-assets')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchive(await packArchive(), {
      source: 'marketplace',
      marketplaceEntitlementId: 'entitlement-1',
      marketplacePaidFileId: 'file-1',
      marketplaceProductId: 'product-1',
    })

    expect(pack).toMatchObject({
      id: 'creator.lazy',
      version: '1.0.0',
      source: 'marketplace',
      marketplaceEntitlementId: 'entitlement-1',
      marketplacePaidFileId: 'file-1',
      marketplaceProductId: 'product-1',
    })
    expect(pack.sprites.idle?.frame).toEqual({ width: 256, height: 320, count: 2, fps: 6 })
    expect(pack.sourcePath).toContain('desktop-pet-packs')
  })

  it('accepts archives with a single top-level pack folder', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/pet-assets')

    const pack = await __desktopPetAssetTestHooks.importPetPackFromArchive(
      await packArchive('pet-pack/'),
      { source: 'local' },
    )

    expect(pack.id).toBe('creator.lazy')
  })

  it('rejects unsafe archive paths before writing outside the temp folder', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/pet-assets')
    const zip = new JSZip()
    zip.file('C:/metadata.json', JSON.stringify(metadata()))

    await expect(
      __desktopPetAssetTestHooks.importPetPackFromArchive(
        Buffer.from(await zip.generateAsync({ type: 'uint8array' })),
        { source: 'local' },
      ),
    ).rejects.toThrow('unsafe path')
  })

  it('rejects executable files in archives', async () => {
    const { __desktopPetAssetTestHooks } = await import('../src/main/pet-assets')
    const zip = new JSZip()
    zip.file('metadata.json', JSON.stringify(metadata()))
    zip.file('sprites/idle.png', 'sprite')
    zip.file('scripts/install.sh', 'echo unsafe')

    await expect(
      __desktopPetAssetTestHooks.importPetPackFromArchive(
        Buffer.from(await zip.generateAsync({ type: 'uint8array' })),
        { source: 'local' },
      ),
    ).rejects.toThrow('blocked file extension')
  })
})
