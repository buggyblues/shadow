// ══════════════════════════════════════════════════════════════
// Component — CardData (AoS, bitECS tag + object store)
// ══════════════════════════════════════════════════════════════

import type { Card } from '../../types'

export interface CardDataData {
  readonly card: Card
}

/** bitECS tag object (used as component identity in query) */
export const CCardData = {}

/** AoS data store indexed by EID */
export const cardDataStore: Array<CardDataData | undefined> = []
