// ══════════════════════════════════════════════════════════════
// System — Input (bitECS, per-entity EID)
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../../components/cardDataComponent'
import { Interaction } from '../../components/interactionComponent'
import { Transform } from '../../components/transformComponent'
import type { ViewportData } from '../../components/viewportComponent'

export interface InputState {
  hoveredId: string | null
  activeId: string | null
  selectedIds: Set<string>
  mouseScreenX: number
  mouseScreenY: number
}

/** Sync per-entity interaction state from the central InputState. */
export function inputSystem(
  eid: number,
  input: InputState,
  viewport: ViewportData,
  dt: number,
): void {
  const cardData = cardDataStore[eid]
  if (!cardData) return
  const { card } = cardData

  Interaction.hovered[eid] = input.hoveredId === card.id ? 1 : 0
  const hoverTarget = Interaction.hovered[eid] ? 1 : 0
  const hoverCurrent = Interaction.hoverAmount[eid] ?? hoverTarget
  const hoverRate = hoverTarget > hoverCurrent ? 18 : 8
  const hoverAmount = hoverCurrent + (hoverTarget - hoverCurrent) * (1 - Math.exp(-dt * hoverRate))
  Interaction.hoverAmount[eid] =
    Math.abs(hoverAmount - hoverTarget) < 0.001 ? hoverTarget : hoverAmount
  Interaction.active[eid] = input.activeId === card.id ? 1 : 0
  Interaction.selected[eid] = input.selectedIds.has(card.id) ? 1 : 0
  Interaction.streaming[eid] = card.isStreaming ? 1 : 0

  if (Interaction.hovered[eid]) {
    const worldMX = input.mouseScreenX / viewport.zoom + viewport.offsetX
    const worldMY = input.mouseScreenY / viewport.zoom + viewport.offsetY
    const dx = worldMX - Transform.x[eid]
    const dy = worldMY - Transform.y[eid]
    const angle = Transform.angle[eid]
    const cos = Math.cos(-angle)
    const sin = Math.sin(-angle)
    const lx = (dx * cos - dy * sin) / Transform.width[eid]
    const ly = (dx * sin + dy * cos) / Transform.height[eid]
    Interaction.mouseLocalX[eid] = Math.max(-0.5, Math.min(0.5, lx))
    Interaction.mouseLocalY[eid] = Math.max(-0.5, Math.min(0.5, ly))
  } else if (Interaction.hoverAmount[eid] <= 0.001) {
    Interaction.mouseLocalX[eid] = 0
    Interaction.mouseLocalY[eid] = 0
  }
}
