import { loggerService } from '../services/logger.service'

type MaybePromise<T> = T | Promise<T>

export type DesktopTask = {
  name: string
  run: () => MaybePromise<void>
  continueOnError?: boolean
}

export class DesktopTaskQueue {
  readonly #scope: string

  constructor(scope: string) {
    this.#scope = scope
  }

  async runSerial(tasks: DesktopTask[]): Promise<void> {
    for (const task of tasks) {
      await this.#runTask(task)
    }
  }

  runBackground(task: DesktopTask): void {
    void this.#runTask({ ...task, continueOnError: true })
  }

  async #runTask(task: DesktopTask): Promise<void> {
    const startedAt = Date.now()
    loggerService.write('debug', this.#scope, 'task starting', { task: task.name })
    try {
      await task.run()
      loggerService.write('debug', this.#scope, 'task finished', {
        task: task.name,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      loggerService.write('error', this.#scope, 'task failed', {
        task: task.name,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      })
      if (!task.continueOnError) throw error
    }
  }
}
