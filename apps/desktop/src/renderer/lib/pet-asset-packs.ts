import {
  CODEX_PET_ATLAS_COLUMNS,
  CODEX_PET_CELL_HEIGHT,
  CODEX_PET_CELL_WIDTH,
  type CodexPetSpriteVersion,
  codexPetAtlasRows,
} from '../../shared/pet-spritesheet-contract'
import type {
  CodexPetAnimationKey,
  DesktopPetAssetPack,
  DesktopPetAssetSettings,
  DesktopPetAssetSprite,
} from '../pet-types'
import { codexPetBackgroundPosition } from './codex-pet-renderer'

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

const DEFAULT_CODEX_SPRITESHEET_PATH = 'spritesheet.webp'
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

function codexSprite(
  src: string,
  state: CodexPetAnimationKey,
  row: number,
  spriteVersionNumber: CodexPetSpriteVersion,
): DesktopPetAssetSprite {
  return {
    src,
    frame: {
      width: CODEX_PET_CELL_WIDTH,
      height: CODEX_PET_CELL_HEIGHT,
      count: CODEX_STATE_FRAME_COUNTS[state],
      fps: CODEX_STATE_FPS[state],
    },
    atlas: {
      columns: CODEX_PET_ATLAS_COLUMNS,
      rows: codexPetAtlasRows(spriteVersionNumber),
      row,
    },
    loop: CODEX_LOOPING_STATES.has(state),
  }
}

export const DEFAULT_CODEX_PET_PACK: DesktopPetAssetPack = {
  id: 'shadow-xiadou',
  spriteVersionNumber: 2,
  displayName: {
    en: 'Shadow',
    'zh-CN': '虾豆',
    'zh-TW': '蝦豆',
    ja: 'Shadow',
    ko: 'Shadow',
  },
  description: {
    en: "Shadow's official black-cat desktop companion, inspired by the animal orchestra on the website homepage.",
    'zh-CN': '虾豆的官方黑猫桌面伙伴，形象来自官网首页的动物乐团。',
    'zh-TW': '蝦豆的官方黑貓桌面夥伴，形象來自官網首頁的動物樂團。',
    ja: 'Web サイトのトップページにある動物オーケストラをもとにした、Shadow 公式の黒猫デスクトップコンパニオンです。',
    ko: '웹사이트 홈페이지의 동물 오케스트라를 바탕으로 만든 Shadow 공식 검은 고양이 데스크톱 동반자입니다.',
  },
  spritesheetPath: DEFAULT_CODEX_SPRITESHEET_PATH,
  sprites: Object.fromEntries(
    CODEX_PET_STATES.map((state, row) => [
      state,
      codexSprite(DEFAULT_CODEX_SPRITESHEET_PATH, state, row, 2),
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
  rowIndex?: number,
) {
  const count = Math.max(1, sprite.frame?.count ?? 1)
  const atlas = sprite.atlas
  const columns = Math.max(1, atlas?.columns ?? count)
  const rows = Math.max(1, atlas?.rows ?? 1)
  const frameWidth = Math.max(1, sprite.frame?.width ?? CODEX_PET_CELL_WIDTH)
  const frameHeight = Math.max(1, sprite.frame?.height ?? CODEX_PET_CELL_HEIGHT)
  const row = Math.max(0, Math.min(rows - 1, rowIndex ?? atlas?.row ?? 0))
  const frame = Math.max(0, Math.min(columns - 1, frameIndex))
  return {
    backgroundImage: `url("${petPackAssetUrl(pack, sprite.src)}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: codexPetBackgroundPosition(
      { columnIndex: frame, rowIndex: row },
      columns,
      rows,
    ),
    transformOrigin: '50% 88%',
  }
}
