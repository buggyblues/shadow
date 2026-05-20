// ══════════════════════════════════════════════════════════════
// System — Runtime Activation (bitECS, per-entity EID)
//
// Converts ECS interaction/visibility plus card metadata into bounded
// dynamic-runtime state. Animation plugins consume Runtime.prepare instead
// of creating GIF/Lottie/Three/Live2D runtimes on their own.
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../../components/cardDataComponent'
import { Interaction } from '../../components/interactionComponent'
import { Runtime, runtimeKindCode } from '../../components/runtimeComponent'
import { Visibility } from '../../components/visibilityComponent'

export function runtimeActivationSystem(eid: number, prewarmIds?: Set<string>): void {
  const cardData = cardDataStore[eid]
  if (!cardData) return

  const { card } = cardData
  const meta = (card.meta ?? {}) as { autoplay?: boolean; preload?: boolean; priority?: number }
  const runtimeKind = runtimeKindCode(card.kind)
  const visible = Visibility.visible[eid] === 1
  const hovered = Interaction.hovered[eid] === 1
  const autoplay = meta.autoplay === true
  const preload = meta.preload === true
  const prewarm = visible && prewarmIds?.has(card.id) === true
  const active = visible && (hovered || autoplay)
  const prepare = preload || active || prewarm

  Runtime.kind[eid] = runtimeKind
  Runtime.active[eid] = active ? 1 : 0
  Runtime.autoplay[eid] = autoplay ? 1 : 0
  Runtime.preload[eid] = preload ? 1 : 0
  Runtime.prewarm[eid] = prewarm ? 1 : 0
  Runtime.prepare[eid] = prepare && runtimeKind !== 0 ? 1 : 0
  Runtime.priority[eid] = meta.priority ?? (hovered ? 100 : autoplay ? 80 : prewarm ? 40 : 0)
}
