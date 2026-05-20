// ══════════════════════════════════════════════════════════════
// System — Runtime Prepare (bitECS)
//
// Materializes dynamic runtimes from ECS activation state. Content systems
// describe layer geometry; this system owns when runtime sources may load.
// ══════════════════════════════════════════════════════════════

import { cardDataStore } from '../../components/cardDataComponent'
import { Runtime } from '../../components/runtimeComponent'
import { animationManager } from '../../resources/animationManager'

export function runtimePrepareSystem(eid: number): void {
  if (Runtime.prepare[eid] !== 1) return

  const cardData = cardDataStore[eid]
  if (!cardData) return

  animationManager.prepareRuntimeCard(cardData.card)
}
