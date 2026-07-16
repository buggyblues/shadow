export const CODEX_PET_ATLAS_COLUMNS = 8
export const CODEX_PET_CELL_WIDTH = 192
export const CODEX_PET_CELL_HEIGHT = 208

export const CODEX_PET_ATLAS_ROWS = {
  1: 9,
  2: 11,
} as const

export type CodexPetSpriteVersion = keyof typeof CODEX_PET_ATLAS_ROWS

export function parseCodexPetSpriteVersion(value: unknown): CodexPetSpriteVersion | null {
  if (value === undefined || value === null) return 1
  return value === 1 || value === 2 ? value : null
}

export function codexPetAtlasRows(spriteVersionNumber: CodexPetSpriteVersion): number {
  return CODEX_PET_ATLAS_ROWS[spriteVersionNumber]
}

export function codexPetSpritesheetSize(spriteVersionNumber: CodexPetSpriteVersion) {
  return {
    width: CODEX_PET_ATLAS_COLUMNS * CODEX_PET_CELL_WIDTH,
    height: codexPetAtlasRows(spriteVersionNumber) * CODEX_PET_CELL_HEIGHT,
  }
}
