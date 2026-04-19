// ═══════════════════════════════════════════════════════════════
// ProjectDAO — Multi-project index management
//
// v8: Each project has /data/projects/{pid}/index.json
//     Global config at /data/global.json
// ═══════════════════════════════════════════════════════════════

import { existsSync, readdirSync } from 'node:fs'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureProjectDirs, GLOBAL_CONFIG, PROJECTS_DIR, projectIndex } from '../config.js'

export interface GlobalConfig {
  activeProjectId?: string
  createdAt?: number
  updatedAt?: number
}

export const projectDao = {
  // ── Global config ──

  async loadGlobalConfig(): Promise<GlobalConfig> {
    try {
      if (existsSync(GLOBAL_CONFIG)) {
        return JSON.parse(await readFile(GLOBAL_CONFIG, 'utf-8'))
      }
    } catch {
      /* ignore */
    }
    return {}
  },

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    try {
      await writeFile(
        GLOBAL_CONFIG,
        JSON.stringify({ ...config, updatedAt: Date.now() }, null, 2),
        'utf-8',
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ProjectDAO] Failed to save global config:', msg)
    }
  },

  // ── Per-project index ──

  async load(pid: string): Promise<unknown | null> {
    const indexPath = projectIndex(pid)
    try {
      if (existsSync(indexPath)) {
        return JSON.parse(await readFile(indexPath, 'utf-8'))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ProjectDAO] Failed to load project ${pid}:`, msg)
    }
    return null
  },

  async save(pid: string, state: unknown): Promise<void> {
    ensureProjectDirs(pid)
    const indexPath = projectIndex(pid)
    try {
      await writeFile(indexPath, JSON.stringify(state, null, 2), 'utf-8')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ProjectDAO] Failed to save project ${pid}:`, msg)
    }
  },

  async delete(pid: string): Promise<void> {
    const indexPath = projectIndex(pid)
    try {
      if (existsSync(indexPath)) await unlink(indexPath)
    } catch {
      /* ignore */
    }
  },

  /** List all project IDs by scanning /data/projects/ */
  listProjectIds(): string[] {
    try {
      if (!existsSync(PROJECTS_DIR)) return []
      return readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch {
      return []
    }
  },

  getIndexPath(pid: string) {
    return projectIndex(pid)
  },
}
