export const DESKTOP_PET_PACK_ASSET_TYPE = 'desktop_pet_pack' as const
export const DESKTOP_PET_PACK_MARKETPLACE_TAGS = ['desktop-pet-pack', '虾豆桌面宠物'] as const

const DESKTOP_PET_PACK_TAGS = new Set<string>([
  ...DESKTOP_PET_PACK_MARKETPLACE_TAGS,
  DESKTOP_PET_PACK_ASSET_TYPE,
])

export function isDesktopPetPackTag(tag: string) {
  return DESKTOP_PET_PACK_TAGS.has(tag)
}

export function hasDesktopPetPackTag(tags?: readonly string[] | null) {
  return tags?.some(isDesktopPetPackTag) === true
}

export function withDesktopPetPackTags(tags: readonly string[]) {
  return [...new Set([...tags, ...DESKTOP_PET_PACK_MARKETPLACE_TAGS])]
}

export function isDesktopPetPackFilename(name: string) {
  const normalized = name.trim().toLowerCase()
  return normalized.endsWith('.zip')
}
