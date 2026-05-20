// ══════════════════════════════════════════════════════════════
// Component — GPUState (AoS, bitECS tag + object store)
// ══════════════════════════════════════════════════════════════

export interface GPUStateData {
  layerIndex: number
  lastVersion: number
  stagingCanvas: HTMLCanvasElement
  lastLod?: number
}

/** bitECS tag object */
export const CGPUState = {}

/** AoS data store indexed by EID */
export const gpuStateStore: Array<GPUStateData | undefined> = []
