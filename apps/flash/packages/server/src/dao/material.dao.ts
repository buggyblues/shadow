// ═══════════════════════════════════════════════════════════════
// MaterialDAO — Project-scoped material storage
//
// v8: Each project has its own refs/materials.json
// ═══════════════════════════════════════════════════════════════

import type { MaterialRecord } from '@shadowob/flash-types'
import { ensureProjectDirs, projectRefs } from '../config.js'
import { PersistentMap } from './persistent-map.js'

// Project-scoped store cache
const storeCache = new Map<string, PersistentMap<MaterialRecord>>()

function getStore(pid: string): PersistentMap<MaterialRecord> {
  let store = storeCache.get(pid)
  if (!store) {
    ensureProjectDirs(pid)
    store = new PersistentMap<MaterialRecord>(
      `materials:${pid}`,
      projectRefs(pid, 'materials.json'),
    )
    store.restore()
    storeCache.set(pid, store)
  }
  return store
}

export const materialDao = {
  getById(pid: string, id: string) {
    return getStore(pid).get(id)
  },
  getAll(pid: string) {
    return getStore(pid).toArray()
  },
  save(pid: string, id: string, record: MaterialRecord) {
    getStore(pid).set(id, record)
  },
  delete(pid: string, id: string) {
    return getStore(pid).delete(id)
  },
  has(pid: string, id: string) {
    return getStore(pid).has(id)
  },
  restore(pid: string) {
    getStore(pid).restore()
  },
  getStore,
  clearCache() {
    storeCache.clear()
  },
}
