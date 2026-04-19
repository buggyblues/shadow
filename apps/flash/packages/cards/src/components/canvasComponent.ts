// ══════════════════════════════════════════════════════════════
// Component — Canvas (AoS, bitECS tag + object store)
// ══════════════════════════════════════════════════════════════

export interface CanvasData {
  readonly ctx: CanvasRenderingContext2D
  readonly width: number
  readonly height: number
}

/** bitECS tag object */
export const CCanvas = {}

/** AoS data store indexed by EID (CONTENT_EID in pipeline) */
export const canvasStore: Array<CanvasData | undefined> = []
