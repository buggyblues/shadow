import type {
  DesktopPetAssetPack,
  DesktopPetAssetSettings,
  DesktopPetAssetSprite,
} from '../pet-types'

export function activePetAssetPack(settings?: DesktopPetAssetSettings) {
  if (!settings?.desktopPetActivePackId) return null
  return (
    settings.desktopPetPacks.find((pack) => pack.id === settings.desktopPetActivePackId) ?? null
  )
}

export function petPackAssetUrl(pack: DesktopPetAssetPack, relativePath: string) {
  const path = relativePath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `shadow-pet-asset://${encodeURIComponent(pack.id)}/${path}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function expressionSprite(pack: DesktopPetAssetPack, emotion?: string) {
  if (!emotion) return null
  const rawExpression = pack.expressions?.[emotion]
  if (typeof rawExpression === 'string' && pack.sprites[rawExpression]) {
    return pack.sprites[rawExpression]
  }
  const expression = asRecord(rawExpression)
  const candidates = [expression.sprite, expression.motion, emotion]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && pack.sprites[candidate]) return pack.sprites[candidate]
  }
  return null
}

export function getPetSprite(
  pack: DesktopPetAssetPack | null,
  animation: string,
  emotion?: string,
) {
  if (!pack) return null
  const motionSprite = pack.sprites[animation]
  if (animation !== 'idle' && motionSprite) return motionSprite
  return expressionSprite(pack, emotion) ?? motionSprite ?? pack.sprites.idle ?? null
}

export function spriteSheetStyle(
  pack: DesktopPetAssetPack,
  sprite: DesktopPetAssetSprite,
  frameIndex: number,
) {
  const count = Math.max(1, sprite.frame?.count ?? 1)
  const anchor = pack.entry?.anchor
  const anchorX = typeof anchor?.x === 'number' ? Math.max(0, Math.min(1, anchor.x)) : 0.5
  const anchorY = typeof anchor?.y === 'number' ? Math.max(0, Math.min(1, anchor.y)) : 0.88
  return {
    backgroundImage: `url("${petPackAssetUrl(pack, sprite.src)}")`,
    backgroundSize: `${count * 100}% 100%`,
    backgroundPosition: count <= 1 ? '0% 0%' : `${(frameIndex / (count - 1)) * 100}% 0%`,
    transformOrigin: `${anchorX * 100}% ${anchorY * 100}%`,
  }
}
