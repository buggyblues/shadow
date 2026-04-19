// ═══════════════════════════════════════════════════════════════
// ProjectService — Project state + task logs + settings + research
//
// v8: Multi-project support, each with its own index.json
// ═══════════════════════════════════════════════════════════════

import { projectDao, researchDao, settingsDao, taskLogDao } from '../dao/index.js'
import type { ResearchProgress } from '../dao/research.dao.js'

// ── Internal types ──

interface TaskWithLogs {
  id: string
  logs?: string[]
  logsCount?: number
  [key: string]: unknown
}

interface ProjectState {
  project?: {
    tasks?: TaskWithLogs[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Service ──

export const projectService = {
  // ── Project State ──

  async load(pid: string, hydrateFull = false): Promise<ProjectState | null> {
    const state = (await projectDao.load(pid)) as ProjectState | null
    if (!state) return null
    return hydrateFull ? this.hydrateLogs(pid, state) : state
  },

  async save(pid: string, state: ProjectState): Promise<{ stateSize: number }> {
    const stripped = await this.stripAndSaveLogs(pid, state)
    await projectDao.save(pid, stripped)
    return { stateSize: JSON.stringify(stripped).length }
  },

  async reset(pid: string): Promise<void> {
    await projectDao.delete(pid)
    await taskLogDao.clearAll(pid)
  },

  /** List all project IDs */
  listProjects() {
    return projectDao.listProjectIds()
  },

  // ── Task Logs ──

  async getTaskLogs(pid: string, taskId: string) {
    const logs = await taskLogDao.read(pid, taskId)
    return { logs, count: logs.length }
  },

  async appendTaskLogs(pid: string, taskId: string, logs: string[]) {
    await taskLogDao.append(pid, taskId, logs)
    return { appended: logs.length }
  },

  async clearTaskLogs(pid: string, taskId: string) {
    await taskLogDao.clear(pid, taskId)
  },

  // ── Settings (global) ──

  async loadSettings() {
    return (await settingsDao.load()) || { userSettings: {} }
  },

  async saveSettings(settings: unknown) {
    await settingsDao.save(settings)
  },

  // ── Research Progress ──

  async loadResearch(pid: string) {
    return researchDao.load(pid)
  },

  async saveResearch(pid: string, data: Partial<ResearchProgress>) {
    const existing = await researchDao.load(pid)
    const merged = { ...existing, ...data, updatedAt: Date.now() }
    await researchDao.save(pid, merged)
  },

  async checkResearchDuplicate(pid: string, topic: string, materialIds: string[]) {
    const progress = await researchDao.load(pid)
    const key = `${topic}::${(materialIds || []).sort().join(',')}`
    const isDuplicate =
      progress.completedTopics?.some(
        (t) => t.key === key && Date.now() - t.completedAt < 3600000,
      ) ?? false
    return { isDuplicate, key }
  },

  // ── Private helpers ──

  async stripAndSaveLogs(pid: string, state: ProjectState): Promise<ProjectState> {
    const tasks = state?.project?.tasks
    if (!Array.isArray(tasks)) return state

    const strippedTasks: TaskWithLogs[] = []
    for (const task of tasks) {
      const logs = task.logs
      if (Array.isArray(logs) && logs.length > 0) {
        await taskLogDao.write(pid, task.id, logs)
      }
      const { logs: _omit, ...rest } = task
      strippedTasks.push({
        ...rest,
        logsCount: Array.isArray(logs) ? logs.length : task.logsCount || 0,
      })
    }

    return {
      ...state,
      project: { ...state.project!, tasks: strippedTasks },
    }
  },

  async hydrateLogs(pid: string, state: ProjectState): Promise<ProjectState> {
    const tasks = state?.project?.tasks
    if (!Array.isArray(tasks)) return state

    const hydratedTasks: TaskWithLogs[] = []
    for (const task of tasks) {
      const logs = await taskLogDao.read(pid, task.id)
      hydratedTasks.push({ ...task, logs, logsCount: logs.length })
    }

    return {
      ...state,
      project: { ...state.project!, tasks: hydratedTasks },
    }
  },
}
