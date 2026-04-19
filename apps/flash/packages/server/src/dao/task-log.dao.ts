// ═══════════════════════════════════════════════════════════════
// TaskLogDAO — Project-scoped task logs
//
// v8: Logs stored at /data/projects/{pid}/logs/task-{taskId}.jsonl
// ═══════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs'
import { appendFile, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureProjectDirs, projectLogs } from '../config.js'

function safePath(pid: string, taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_-]/g, '')
  ensureProjectDirs(pid)
  return projectLogs(pid, `task-${safe}.jsonl`)
}

export const taskLogDao = {
  async read(pid: string, taskId: string): Promise<string[]> {
    const fp = safePath(pid, taskId)
    try {
      if (!existsSync(fp)) return []
      const raw = await readFile(fp, 'utf-8')
      return raw.trim().split('\n').filter(Boolean)
    } catch {
      return []
    }
  },

  async append(pid: string, taskId: string, logs: string[]): Promise<void> {
    if (!logs.length) return
    const fp = safePath(pid, taskId)
    const chunk = logs.join('\n') + '\n'
    try {
      await appendFile(fp, chunk, 'utf-8')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[TaskLogDAO] Append failed ${taskId}:`, msg)
    }
  },

  async write(pid: string, taskId: string, logs: string[]): Promise<void> {
    const fp = safePath(pid, taskId)
    try {
      await writeFile(fp, logs.join('\n') + '\n', 'utf-8')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[TaskLogDAO] Write failed ${taskId}:`, msg)
    }
  },

  async clear(pid: string, taskId: string): Promise<void> {
    const fp = safePath(pid, taskId)
    try {
      if (existsSync(fp)) await unlink(fp)
    } catch {
      /* ignore */
    }
  },

  async clearAll(pid: string): Promise<void> {
    try {
      const logsDir = projectLogs(pid)
      const files = await readdir(logsDir)
      for (const f of files) {
        await unlink(join(logsDir, f)).catch(() => {})
      }
    } catch {
      /* dir might not exist */
    }
  },
}
