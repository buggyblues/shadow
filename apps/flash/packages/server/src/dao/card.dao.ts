// ═══════════════════════════════════════════════════════════════
// CardDAO — Project-scoped card storage
//
// v8: Each project has its own refs/cards.json
// ═══════════════════════════════════════════════════════════════

import type { CardRecord } from '@shadowob/flash-types'
import { ensureProjectDirs, projectRefs } from '../config.js'
import { PersistentMap } from './persistent-map.js'

// Project-scoped store cache: pid → PersistentMap<CardRecord>
const storeCache = new Map<string, PersistentMap<CardRecord>>()

function getStore(pid: string): PersistentMap<CardRecord> {
  let store = storeCache.get(pid)
  if (!store) {
    ensureProjectDirs(pid)
    store = new PersistentMap<CardRecord>(`cards:${pid}`, projectRefs(pid, 'cards.json'))
    store.restore()
    storeCache.set(pid, store)
  }
  return store
}

export const cardDao = {
  getById(pid: string, id: string) {
    return getStore(pid).get(id)
  },
  getAll(pid: string) {
    return getStore(pid).toArray()
  },
  save(pid: string, id: string, record: CardRecord) {
    getStore(pid).set(id, record)
  },
  delete(pid: string, id: string) {
    return getStore(pid).delete(id)
  },
  has(pid: string, id: string) {
    return getStore(pid).has(id)
  },

  /** Restore a specific project's card store from disk */
  restore(pid: string) {
    getStore(pid).restore()
  },

  /** Get the underlying PersistentMap for advanced operations */
  getStore,

  /** Clear cache (for testing / shutdown) */
  clearCache() {
    storeCache.clear()
  },
}
