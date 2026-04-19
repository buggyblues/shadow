// ══════════════════════════════════════════════════════════════
// ECS Core — bitECS worlds + entity / card-ID mapping
//
// Two worlds:
//   sceneWorld   — persistent card entities across frames
//   contentWorld — ephemeral per-pipeline-call entities
// ══════════════════════════════════════════════════════════════

import { addEntity, createWorld, removeEntity } from 'bitecs'

// ── Worlds (module-level singletons) ──

export const sceneWorld = createWorld()
export const contentWorld = createWorld()

// ── Scene world: cardId ↔ EID mapping ──

const _cardIdToEid = new Map<string, number>()
const _eidToCardId = new Map<number, string>()

export function getCardEid(cardId: string): number | undefined {
  return _cardIdToEid.get(cardId)
}

export function getEidCardId(eid: number): string | undefined {
  return _eidToCardId.get(eid)
}

export function createSceneEntity(cardId: string): number {
  const eid = addEntity(sceneWorld)
  _cardIdToEid.set(cardId, eid)
  _eidToCardId.set(eid, cardId)
  return eid
}

export function destroySceneEntity(cardId: string): void {
  const eid = _cardIdToEid.get(cardId)
  if (eid === undefined) return
  removeEntity(sceneWorld, eid)
  _cardIdToEid.delete(cardId)
  _eidToCardId.delete(eid)
}

export function allSceneEids(): IterableIterator<number> {
  return _eidToCardId.keys()
}

// ── Content world: single reusable EID for the rendering pipeline ──

export const CONTENT_EID = addEntity(contentWorld)
