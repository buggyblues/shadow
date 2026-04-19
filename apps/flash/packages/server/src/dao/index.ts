// ═══════════════════════════════════════════════════════════════
// DAO Index — Unified exports
//
// v8: Project-scoped DAOs are lazily initialized per project.
//     Only global stores (skills) need explicit restore at startup.
// ═══════════════════════════════════════════════════════════════

export { cardDao } from './card.dao.js'
export { deckDao } from './deck.dao.js'
export { materialDao } from './material.dao.js'
export type { GlobalConfig } from './project.dao.js'
export { projectDao } from './project.dao.js'
export type { ResearchProgress } from './research.dao.js'
export { researchDao } from './research.dao.js'
export { settingsDao } from './settings.dao.js'
export { skillDao, skillsStore } from './skill.dao.js'
export { taskLogDao } from './task-log.dao.js'

import { skillDao } from './skill.dao.js'

// Ephemeral store (no persistence needed)
export const activeRequests = new Map<string, AbortController>()

/**
 * Restore global stores from disk.
 *
 * v8: Project-scoped stores (cards, materials, decks, checkpoints)
 * are lazily restored when first accessed via getStore(pid).
 * Only the global skill store needs explicit restore.
 */
export function restoreAllStores(): void {
  console.log('📂 Restoring global stores from disk...')
  skillDao.restore()
  console.log('📂 Global store restore complete')
}
