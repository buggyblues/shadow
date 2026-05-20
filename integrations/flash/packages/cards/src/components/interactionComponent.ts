// ══════════════════════════════════════════════════════════════
// Component — Interaction (SoA, bitECS)
// ══════════════════════════════════════════════════════════════

/** bitECS SoA component: user input / selection state (booleans as 0/1) */
export const Interaction = {
  hovered: [] as number[],
  hoverAmount: [] as number[],
  active: [] as number[],
  selected: [] as number[],
  streaming: [] as number[],
  mouseLocalX: [] as number[],
  mouseLocalY: [] as number[],
}

/** Legacy alias */
export const CInteraction = Interaction

export interface InteractionData {
  hovered: boolean
  hoverAmount: number
  active: boolean
  selected: boolean
  streaming: boolean
  mouseLocalX: number
  mouseLocalY: number
}

export function createInteraction(overrides?: Partial<InteractionData>): InteractionData {
  return {
    hovered: false,
    hoverAmount: 0,
    active: false,
    selected: false,
    streaming: false,
    mouseLocalX: 0,
    mouseLocalY: 0,
    ...overrides,
  }
}
