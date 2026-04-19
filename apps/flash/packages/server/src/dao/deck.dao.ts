// ═══════════════════════════════════════════════════════════════
// DeckDAO — Project-scoped deck storage
//
// v8: Each project has its own refs/decks.json
// ═══════════════════════════════════════════════════════════════

import type { DeckRecord } from '@shadowob/flash-types'
import { ensureProjectDirs, projectRefs } from '../config.js'
import { PersistentMap } from './persistent-map.js'

const storeCache = new Map<string, PersistentMap<DeckRecord>>()

function getStore(pid: string): PersistentMap<DeckRecord> {
  let store = storeCache.get(pid)
  if (!store) {
    ensureProjectDirs(pid)
    store = new PersistentMap<DeckRecord>(`decks:${pid}`, projectRefs(pid, 'decks.json'))
    store.restore()
    storeCache.set(pid, store)
  }
  return store
}

export const deckDao = {
  getById(pid: string, id: string) {
    return getStore(pid).get(id)
  },
  getAll(pid: string) {
    return getStore(pid).toArray()
  },
  save(pid: string, id: string, record: DeckRecord) {
    getStore(pid).set(id, record)
  },
  delete(pid: string, id: string) {
    return getStore(pid).delete(id)
  },
  has(pid: string, id: string) {
    return getStore(pid).has(id)
  },
  entries(pid: string) {
    return getStore(pid).entries()
  },
  restore(pid: string) {
    getStore(pid).restore()
  },
  getStore,
  clearCache() {
    storeCache.clear()
  },
}
