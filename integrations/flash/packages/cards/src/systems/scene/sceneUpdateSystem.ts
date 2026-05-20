// ══════════════════════════════════════════════════════════════
// Scene Update System (bitECS)
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import { glStateStore } from '../../components/glStateComponent'
import { gpuStateStore } from '../../components/gpuStateComponent'
import type { ViewportData } from '../../components/viewportComponent'
import { SceneWorld } from '../../core/world'
import { removeCardTexture } from '../../resources/textureRenderer'
import { flipAnimationSystem } from './flipAnimationSystem'
import { frustumCullSystem } from './frustumCullSystem'
import type { InputState } from './inputSystem'
import { inputSystem } from './inputSystem'
import { runtimeActivationSystem } from './runtimeActivationSystem'
import { runtimePrepareSystem } from './runtimePrepareSystem'

export function sceneUpdateSystem(
  scene: SceneWorld,
  cards: Card[],
  bodiesMap: Map<string, { position: { x: number; y: number }; angle: number }>,
  input: InputState,
  viewport: ViewportData,
  onEntityDestroy: (eid: number, cardId: string) => void,
  dt: number,
  cardW: number,
  cardH: number,
  runtimePrewarmIds?: Set<string>,
): Set<string> {
  const activeIds = new Set<string>()

  // Phase 1 & 2: entity lifecycle + per-entity systems
  for (const card of cards) {
    if (!card || !card.id || !card.kind) continue
    const body = bodiesMap.get(card.id)
    if (!body) continue

    activeIds.add(card.id)
    const eid = scene.getOrCreate(card, cardW, cardH)
    scene.syncTransform(eid, body.position.x, body.position.y, body.angle)

    inputSystem(eid, input, viewport, dt)
    flipAnimationSystem(eid, dt)
    frustumCullSystem(eid, viewport)
    runtimeActivationSystem(eid, runtimePrewarmIds)
    runtimePrepareSystem(eid)
  }

  // Phase 3: GC
  scene.gc(activeIds, onEntityDestroy)

  return activeIds
}
