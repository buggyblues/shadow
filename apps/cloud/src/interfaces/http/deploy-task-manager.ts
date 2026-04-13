/**
 * Background deployment task manager.
 *
 * Starts deploys independently from the initiating HTTP connection, persists
 * log lines, and allows later SSE subscribers to replay and follow progress.
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DeploymentDao } from '../../dao/deployment.dao.js'
import type { DeploymentLogDao } from '../../dao/deployment-log.dao.js'
import type { EnvVarDao } from '../../dao/envvar.dao.js'
import type { Deployment } from '../../db/schema.js'
import type { ServiceContainer } from '../../services/container.js'
import { redactSecrets } from '../../utils/redact.js'

function cleanupTmpFile(path: string): void {
  try {
    const { unlinkSync } = require('node:fs')
    unlinkSync(path)
  } catch {
    /* ignore */
  }
}

function shouldSkipProgressLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed === '.' ||
    trimmed === '..' ||
    /^@\s+updating\.+/.test(trimmed) ||
    /^\.\.+$/.test(trimmed)
  )
}

export interface DeployTaskDoneEvent {
  exitCode: number
  error?: string
  result?: {
    namespace?: string
    agentCount?: number
  }
}

export type DeployTaskEvent =
  | { type: 'log'; data: { id: number; message: string; createdAt: string | null } }
  | { type: 'done'; data: DeployTaskDoneEvent }

type DeployTaskListener = (event: DeployTaskEvent) => void | Promise<void>

export class DeployTaskManager {
  private subscribers = new Map<number, Set<DeployTaskListener>>()

  private activeTaskIds = new Set<number>()

  constructor(
    private container: ServiceContainer,
    private deploymentDao: DeploymentDao,
    private deploymentLogDao: DeploymentLogDao,
    private envVarDao: EnvVarDao,
  ) {}

  async start(config: Record<string, unknown>): Promise<Deployment> {
    const task = this.deploymentDao.create({
      namespace: (config.namespace as string) ?? 'shadowob-cloud',
      templateSlug: (config.templateSlug as string) ?? 'unknown',
      status: 'pending',
      config,
      agentCount: 0,
    })

    this.activeTaskIds.add(task.id)
    queueMicrotask(() => {
      void this.run(task.id, config)
    })

    return task
  }

  isActive(taskId: number): boolean {
    return this.activeTaskIds.has(taskId)
  }

  subscribe(taskId: number, listener: DeployTaskListener): () => void {
    const listeners = this.subscribers.get(taskId) ?? new Set<DeployTaskListener>()
    listeners.add(listener)
    this.subscribers.set(taskId, listeners)

    return () => {
      const current = this.subscribers.get(taskId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) {
        this.subscribers.delete(taskId)
      }
    }
  }

  private emit(taskId: number, event: DeployTaskEvent): void {
    const listeners = this.subscribers.get(taskId)
    if (!listeners?.size) return

    for (const listener of listeners) {
      void listener(event)
    }
  }

  private appendLog(taskId: number, message: string): void {
    const sanitized = redactSecrets(message)
    const log = this.deploymentLogDao.create({
      deploymentId: taskId,
      event: 'log',
      message: sanitized,
    })
    this.emit(taskId, {
      type: 'log',
      data: { id: log.id, message: sanitized, createdAt: log.createdAt },
    })
  }

  private appendOutput(taskId: number, output: string): void {
    for (const line of output.split('\n').filter(Boolean)) {
      if (shouldSkipProgressLine(line)) continue
      this.appendLog(taskId, line)
    }
  }

  private buildEnvOverrides(config: Record<string, unknown>): {
    envOverrides: Record<string, string>
    templateConfig: Record<string, unknown>
  } {
    const envOverrides: Record<string, string> = {}
    const savedEnvVars = this.envVarDao.findAllDecrypted()
    Object.assign(envOverrides, savedEnvVars)

    const wizardEnvVars = config.envVars as Record<string, string> | undefined
    if (wizardEnvVars && typeof wizardEnvVars === 'object') {
      for (const [key, value] of Object.entries(wizardEnvVars)) {
        if (typeof value === 'string' && value !== '__SAVED__' && value.trim() !== '') {
          envOverrides[key] = value
        }
      }
    }

    const { envVars: _envVars, ...templateConfig } = config
    return { envOverrides, templateConfig }
  }

  private async run(taskId: number, config: Record<string, unknown>): Promise<void> {
    const originalEnv: Record<string, string | undefined> = {}
    const { envOverrides, templateConfig } = this.buildEnvOverrides(config)
    const tmpFile = join(tmpdir(), `shadowob-deploy-${taskId}-${Date.now()}.json`)

    writeFileSync(tmpFile, JSON.stringify(templateConfig, null, 2), 'utf-8')

    for (const [key, value] of Object.entries(envOverrides)) {
      originalEnv[key] = process.env[key]
      process.env[key] = value
    }

    try {
      this.deploymentDao.update(taskId, {
        status: 'running',
        namespace:
          (templateConfig.namespace as string) ?? (config.namespace as string) ?? 'shadowob-cloud',
        templateSlug: (config.templateSlug as string) ?? 'unknown',
        config,
      })

      this.appendLog(taskId, 'Starting deployment...')

      const result = await this.container.deploy.up({
        filePath: tmpFile,
        namespace: templateConfig.namespace as string | undefined,
        dryRun: templateConfig.dryRun as boolean | undefined,
        onOutput: (output: string) => {
          this.appendOutput(taskId, output)
        },
      })

      this.deploymentDao.update(taskId, {
        namespace: result.namespace ?? (config.namespace as string) ?? 'shadowob-cloud',
        templateSlug: (config.templateSlug as string) ?? 'unknown',
        status: 'deployed',
        config,
        agentCount: result.agentCount ?? 0,
        error: null,
      })

      const doneEvent: DeployTaskDoneEvent = {
        exitCode: 0,
        result: {
          namespace: result.namespace,
          agentCount: result.agentCount,
        },
      }
      this.emit(taskId, { type: 'done', data: doneEvent })
    } catch (error) {
      const message = (error as Error).message
      this.deploymentDao.update(taskId, { status: 'failed', error: message })
      this.appendLog(taskId, `Error: ${message}`)
      this.emit(taskId, { type: 'done', data: { exitCode: 1, error: message } })
    } finally {
      this.activeTaskIds.delete(taskId)
      cleanupTmpFile(tmpFile)

      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  }
}
