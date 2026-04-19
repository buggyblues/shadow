// ══════════════════════════════════════════════════════════════
// Component — RenderOrder (SoA, bitECS)
// ══════════════════════════════════════════════════════════════

/** bitECS SoA component: z-order sorting index */
export const RenderOrder = {
  z: [] as number[],
}

/** Legacy alias */
export const CRenderOrder = RenderOrder

export interface RenderOrderData {
  z: number
}
