// ══════════════════════════════════════════════════════════════
// Component — GLState (AoS, bitECS tag + object store)
// ══════════════════════════════════════════════════════════════

export interface GLStateData {
  texture: WebGLTexture
  lastVersion: number
  lastLod: number
}

/** bitECS tag object */
export const CGLState = {}

/** AoS data store indexed by EID */
export const glStateStore: Array<GLStateData | undefined> = []
