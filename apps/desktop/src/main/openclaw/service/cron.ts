/**
 * OpenClaw Cron Service
 *
 * Manages individual cron tasks stored in ~/.shadowob/cron/jobs.json.
 * Separate from system-level cron config (in openclaw.json, managed by ConfigService).
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { CronTask } from '../types'
import type { OpenClawPaths } from './paths'

interface CronStoreFile {
  version: 1
  jobs: CronTask[]
}

export class CronService {
  constructor(private paths: OpenClawPaths) {}

  list(): CronTask[] {
    return this.readStore().jobs
  }

  get(id: string): CronTask | null {
    return this.readStore().jobs.find((j) => j.id === id) ?? null
  }

  save(task: Omit<CronTask, 'id' | 'createdAtMs' | 'updatedAtMs'> & { id?: string }): CronTask {
    const store = this.readStore()
    const now = Date.now()
    const existing = task.id ? store.jobs.find((j) => j.id === task.id) : null

    if (existing) {
      Object.assign(existing, task, { updatedAtMs: now })
      this.writeStore(store)
      return existing
    }

    const newTask: CronTask = {
      ...task,
      id: task.id || randomUUID(),
      createdAtMs: now,
      updatedAtMs: now,
    }
    store.jobs.push(newTask)
    this.writeStore(store)
    return newTask
  }

  delete(id: string): boolean {
    const store = this.readStore()
    const idx = store.jobs.findIndex((j) => j.id === id)
    if (idx === -1) return false
    store.jobs.splice(idx, 1)
    this.writeStore(store)
    return true
  }

  private readStore(): CronStoreFile {
    const storePath = this.paths.cronJobsFile
    if (!existsSync(storePath)) {
      return { version: 1, jobs: [] }
    }
    try {
      const raw = readFileSync(storePath, 'utf-8')
      const parsed = JSON.parse(raw) as CronStoreFile
      return { version: 1, jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] }
    } catch {
      return { version: 1, jobs: [] }
    }
  }

  private writeStore(store: CronStoreFile): void {
    this.paths.ensureDirs()
    writeFileSync(this.paths.cronJobsFile, JSON.stringify(store, null, 2), 'utf-8')
  }
}
