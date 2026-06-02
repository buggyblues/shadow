import { describe, expect, it } from 'vitest'
import {
  filterMarketplacePetPackEntitlements,
  installedMarketplacePack,
  isDesktopPetPackEntitlement,
  normalizeMarketplaceEntitlement,
} from '../src/renderer/lib/desktop-pet-marketplace'
import type { DesktopPetAssetSettings } from '../src/renderer/pet-types'

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entitlement-1',
    status: 'active',
    isActive: true,
    resourceType: 'workspace_file',
    resourceId: 'file-1',
    capability: 'download',
    metadata: {
      productAssetType: 'desktop_pet_pack',
      productTags: ['desktop-pet-pack'],
    },
    product: {
      id: 'product-1',
      name: 'Lazy Pack',
      summary: 'A desktop pet pack',
      tags: [],
    },
    paidFile: {
      id: 'file-1',
      name: 'lazy-codex-pet.zip',
      mime: 'application/zip',
      sizeBytes: 1024,
    },
    shop: { name: 'Creator Shop' },
    ...overrides,
  }
}

describe('desktop pet marketplace entitlements', () => {
  it('keeps purchased desktop pet packs marked by entitlement metadata', () => {
    const normalized = normalizeMarketplaceEntitlement(
      entitlement({
        product: { id: 'product-1', name: 'Lazy Pack', tags: [] },
        metadata: { productAssetType: 'desktop_pet_pack' },
      }),
    )

    expect(normalized).not.toBeNull()
    expect(isDesktopPetPackEntitlement(normalized!)).toBe(true)
  })

  it('keeps packs marked by product tags or archive filename', () => {
    expect(
      filterMarketplacePetPackEntitlements([
        entitlement({
          id: 'tagged',
          product: { id: 'product-2', name: 'Tagged Pack', tags: ['虾豆桌面宠物'] },
          paidFile: { id: 'file-2', name: 'bundle.zip' },
          metadata: {},
        }),
        entitlement({
          id: 'filename',
          product: { id: 'product-3', name: 'Filename Pack', tags: [] },
          paidFile: { id: 'file-3', name: 'bundle.codex-pet.zip' },
          metadata: {},
        }),
      ]).map((item) => item.id),
    ).toEqual(['tagged', 'filename'])
  })

  it('filters inactive or non-file entitlements out of the install list', () => {
    expect(
      filterMarketplacePetPackEntitlements([
        entitlement({ id: 'inactive', isActive: false }),
        entitlement({ id: 'cancelled', status: 'cancelled' }),
        entitlement({ id: 'service', resourceType: 'service', paidFile: null }),
      ]),
    ).toEqual([])
  })

  it('matches installed packs by entitlement, product, or paid file ids', () => {
    const settings: DesktopPetAssetSettings = {
      desktopPetActivePackId: 'pack-1',
      desktopPetPacks: [
        {
          id: 'pack-1',
          version: '1.0.0',
          displayName: { en: 'Installed' },
          importedAt: new Date(0).toISOString(),
          source: 'marketplace',
          marketplaceProductId: 'product-1',
          marketplacePaidFileId: 'file-1',
          spritesheetPath: 'spritesheet.webp',
          sprites: {
            idle: {
              src: 'spritesheet.webp',
              frame: { width: 192, height: 208, count: 6, fps: 5 },
              atlas: { columns: 8, rows: 9, row: 0 },
            },
          },
        },
      ],
    }

    expect(
      installedMarketplacePack(settings, normalizeMarketplaceEntitlement(entitlement())!)?.id,
    ).toBe('pack-1')
  })
})
