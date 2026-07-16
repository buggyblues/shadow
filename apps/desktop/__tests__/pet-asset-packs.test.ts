import { describe, expect, it } from 'vitest'
import { DEFAULT_CODEX_PET_PACK, spriteSheetStyle } from '../src/renderer/lib/pet-asset-packs'
import type { DesktopPetAssetPack } from '../src/renderer/pet-types'

describe('desktop pet spritesheet contracts', () => {
  it('renders the built-in 虾豆 atlas with the v2 11-row geometry', () => {
    const sprite = DEFAULT_CODEX_PET_PACK.sprites['running-left']!

    expect(DEFAULT_CODEX_PET_PACK.spriteVersionNumber).toBe(2)
    expect(sprite.atlas).toEqual({ columns: 8, rows: 11, row: 2 })
    expect(spriteSheetStyle(DEFAULT_CODEX_PET_PACK, sprite, 3)).toMatchObject({
      backgroundSize: '800% 1100%',
      backgroundPosition: '42.857142857142854% 20%',
    })
  })

  it('keeps imported v1 packs on the legacy 9-row geometry', () => {
    const pack: DesktopPetAssetPack = {
      id: 'legacy',
      spriteVersionNumber: 1,
      displayName: { en: 'Legacy' },
      spritesheetPath: 'spritesheet.webp',
      sprites: {
        idle: {
          src: 'spritesheet.webp',
          frame: { width: 192, height: 208, count: 6, fps: 5 },
          atlas: { columns: 8, rows: 9, row: 0 },
        },
      },
      importedAt: new Date(0).toISOString(),
      source: 'local',
      sourcePath: '/tmp/legacy',
    }

    expect(spriteSheetStyle(pack, pack.sprites.idle!, 0)).toMatchObject({
      backgroundSize: '800% 900%',
      backgroundPosition: '0% 0%',
    })
  })
})
