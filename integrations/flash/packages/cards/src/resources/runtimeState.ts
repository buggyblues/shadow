// ══════════════════════════════════════════════════════════════
// Resource — Runtime State Accessors
//
// Small bridge for content plugins, which render through CONTENT_EID but
// need to read the persistent scene entity's runtime activation state.
// ══════════════════════════════════════════════════════════════

import { Runtime } from '../components/runtimeComponent'
import { getCardEid } from '../core/entity'

export function runtimeShouldPrepare(cardId: string): boolean {
  const eid = getCardEid(cardId)
  return eid !== undefined && Runtime.prepare[eid] === 1
}

export function runtimeIsActive(cardId: string): boolean {
  const eid = getCardEid(cardId)
  return eid !== undefined && Runtime.active[eid] === 1
}

export function runtimeIsPrewarm(cardId: string): boolean {
  const eid = getCardEid(cardId)
  return eid !== undefined && Runtime.prewarm[eid] === 1
}
