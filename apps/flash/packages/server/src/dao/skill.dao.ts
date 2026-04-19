// ═══════════════════════════════════════════════════════════════
// SkillDAO — Global skill storage (not project-scoped)
//
// v8: Skills are global → /data/skills.json
// ═══════════════════════════════════════════════════════════════

import type { SkillRecord } from '@shadowob/flash-types'
import { SKILLS_FILE } from '../config.js'
import { PersistentMap } from './persistent-map.js'

export const skillsStore = new PersistentMap<SkillRecord>('skills', SKILLS_FILE)

export const skillDao = {
  getById(id: string) {
    return skillsStore.get(id)
  },
  getAll() {
    return skillsStore.toArray()
  },
  save(id: string, record: SkillRecord) {
    skillsStore.set(id, record)
  },
  delete(id: string) {
    return skillsStore.delete(id)
  },
  has(id: string) {
    return skillsStore.has(id)
  },
  get size() {
    return skillsStore.size
  },
  values() {
    return skillsStore.values()
  },
  restore() {
    skillsStore.restore()
  },
}
