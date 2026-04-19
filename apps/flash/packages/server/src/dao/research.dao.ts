// ═══════════════════════════════════════════════════════════════
// ResearchDAO — Project-scoped research progress
//
// v8: Stored at /data/projects/{pid}/refs/research.json
// ═══════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { ensureProjectDirs, projectRefs } from '../config.js'

export interface ResearchProgress {
  completedTopics?: Array<{ key: string; completedAt: number }>
  lastResearchAt?: number
  sessions?: unknown[]
  updatedAt?: number
}

export const researchDao = {
  async load(pid: string): Promise<ResearchProgress> {
    const filePath = projectRefs(pid, 'research.json')
    try {
      if (existsSync(filePath)) {
        return JSON.parse(await readFile(filePath, 'utf-8'))
      }
    } catch {
      /* ignore */
    }
    return { completedTopics: [], lastResearchAt: 0, sessions: [] }
  },

  async save(pid: string, progress: ResearchProgress): Promise<void> {
    ensureProjectDirs(pid)
    const filePath = projectRefs(pid, 'research.json')
    try {
      await writeFile(filePath, JSON.stringify(progress, null, 2), 'utf-8')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ResearchDAO] Save failed:', msg)
    }
  },
}
