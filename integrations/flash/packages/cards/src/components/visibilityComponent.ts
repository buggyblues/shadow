// ══════════════════════════════════════════════════════════════
// Component — Visibility (SoA, bitECS)
// ══════════════════════════════════════════════════════════════

/** bitECS SoA component: frustum culling flag + screen coords */
export const Visibility = {
  visible: [] as number[], // 0 = culled, 1 = visible
  screenX: [] as number[],
  screenY: [] as number[],
}

/** Legacy alias */
export const CVisibility = Visibility

export interface VisibilityData {
  visible: boolean
  screenX: number
  screenY: number
}
