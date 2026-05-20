// ══════════════════════════════════════════════════════════════
// Component — Transform (SoA, bitECS)
// ══════════════════════════════════════════════════════════════

/** bitECS SoA component: world-space position, rotation, size */
export const Transform = {
  x: [] as number[],
  y: [] as number[],
  angle: [] as number[],
  width: [] as number[],
  height: [] as number[],
}

/** Legacy alias kept for non-bitECS external uses */
export const CTransform = Transform

export interface TransformData {
  x: number
  y: number
  angle: number
  width: number
  height: number
}
