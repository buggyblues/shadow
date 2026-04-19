// ══════════════════════════════════════════════════════════════
// Resource — ViewportData (plain data, not a bitECS component)
// Viewport is a singleton resource passed explicitly to systems.
// ══════════════════════════════════════════════════════════════

export interface ViewportData {
  offsetX: number
  offsetY: number
  zoom: number
  dpr: number
  screenW: number
  screenH: number
  zoomSettled: boolean
}

/** (Legacy alias — viewport is not a bitECS component) */
export const CViewport = {}
