import type {
  CodexPetAnimationKey,
  DesktopPetAssetPack,
  DesktopPetAssetSettings,
  DesktopPetAssetSprite,
} from '../pet-types'

export const CODEX_PET_STATES: CodexPetAnimationKey[] = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
]

export const CODEX_PETS_GALLERY_URL = 'https://codex-pets.net/#/?page=2&kind=creature'

const DEFAULT_CODEX_SPRITESHEET_PATH = 'spritesheet.webp'
const CODEX_ATLAS_COLUMNS = 8
const CODEX_ATLAS_ROWS = 9
const CODEX_CELL_WIDTH = 192
const CODEX_CELL_HEIGHT = 208
const CODEX_STATE_FPS: Record<CodexPetAnimationKey, number> = {
  idle: 5,
  'running-right': 8,
  'running-left': 8,
  waving: 6,
  jumping: 6,
  failed: 7,
  waiting: 6,
  running: 7,
  review: 6,
}
const CODEX_STATE_FRAME_COUNTS: Record<CodexPetAnimationKey, number> = {
  idle: 6,
  'running-right': 8,
  'running-left': 8,
  waving: 4,
  jumping: 5,
  failed: 8,
  waiting: 6,
  running: 6,
  review: 6,
}
const CODEX_LOOPING_STATES = new Set<CodexPetAnimationKey>([
  'idle',
  'running-right',
  'running-left',
  'waiting',
  'running',
  'review',
])

function codexSprite(src: string, state: CodexPetAnimationKey, row: number): DesktopPetAssetSprite {
  return {
    src,
    frame: {
      width: CODEX_CELL_WIDTH,
      height: CODEX_CELL_HEIGHT,
      count: CODEX_STATE_FRAME_COUNTS[state],
      fps: CODEX_STATE_FPS[state],
    },
    atlas: {
      columns: CODEX_ATLAS_COLUMNS,
      rows: CODEX_ATLAS_ROWS,
      row,
    },
    loop: CODEX_LOOPING_STATES.has(state),
  }
}

export const DEFAULT_CODEX_PET_PACK: DesktopPetAssetPack = {
  id: 'shadow-xiao-lan',
  displayName: {
    en: 'Xiao Lan',
    'zh-CN': '小懒',
  },
  description: {
    en: 'The official Codex-format Shadow desktop pet.',
    'zh-CN': '官方 Codex 格式 Shadow 桌宠。',
  },
  spritesheetPath: DEFAULT_CODEX_SPRITESHEET_PATH,
  sprites: Object.fromEntries(
    CODEX_PET_STATES.map((state, row) => [
      state,
      codexSprite(DEFAULT_CODEX_SPRITESHEET_PATH, state, row),
    ]),
  ),
  importedAt: '',
  source: 'builtin',
}

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
  if (pack.source === 'builtin') return `/pet/codex/${path}`
  return `shadow-pet-asset://${encodeURIComponent(pack.id)}/${path}`
}

export function getPetSprite(pack: DesktopPetAssetPack | null, animation: string) {
  if (!pack) return null
  const motionSprite = pack.sprites[animation]
  return motionSprite ?? pack.sprites.idle ?? null
}

export function spriteSheetStyle(
  pack: DesktopPetAssetPack,
  sprite: DesktopPetAssetSprite,
  frameIndex: number,
) {
  const count = Math.max(1, sprite.frame?.count ?? 1)
  const atlas = sprite.atlas
  const columns = Math.max(1, atlas?.columns ?? count)
  const rows = Math.max(1, atlas?.rows ?? 1)
  const frameWidth = Math.max(1, sprite.frame?.width ?? CODEX_CELL_WIDTH)
  const frameHeight = Math.max(1, sprite.frame?.height ?? CODEX_CELL_HEIGHT)
  const row = Math.max(0, Math.min(rows - 1, atlas?.row ?? 0))
  const frame = Math.max(0, Math.min(columns - 1, frameIndex % count))
  return {
    backgroundImage: `url("${petPackAssetUrl(pack, sprite.src)}")`,
    backgroundSize: `${columns * frameWidth}px ${rows * frameHeight}px`,
    backgroundPosition: `-${frame * frameWidth}px -${row * frameHeight}px`,
    transformOrigin: '50% 88%',
  }
}
