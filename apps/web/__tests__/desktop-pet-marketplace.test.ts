import { describe, expect, it } from 'vitest'
import {
  DESKTOP_PET_PACK_MARKETPLACE_TAGS,
  hasDesktopPetPackTag,
  isDesktopPetPackFilename,
  isDesktopPetPackTag,
  withDesktopPetPackTags,
} from '../src/lib/desktop-pet-marketplace'

describe('desktop pet marketplace helpers', () => {
  it('normalizes desktop pet pack marketplace tags', () => {
    expect(withDesktopPetPackTags(['paid_file', 'desktop-pet-pack'])).toEqual([
      'paid_file',
      ...DESKTOP_PET_PACK_MARKETPLACE_TAGS,
    ])
    expect(hasDesktopPetPackTag(['paid_file'])).toBe(false)
    expect(hasDesktopPetPackTag(['虾豆桌面宠物'])).toBe(true)
    expect(hasDesktopPetPackTag(['desktop_pet_pack'])).toBe(true)
    expect(isDesktopPetPackTag('desktop-pet-pack')).toBe(true)
  })

  it('accepts desktop pet archive filenames only', () => {
    expect(isDesktopPetPackFilename('lazy.shadowpet')).toBe(false)
    expect(isDesktopPetPackFilename('lazy-codex-pet.zip')).toBe(true)
    expect(isDesktopPetPackFilename('lazy.zip')).toBe(true)
    expect(isDesktopPetPackFilename('lazy.png')).toBe(false)
  })
})
