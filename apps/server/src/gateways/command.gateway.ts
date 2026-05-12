import { type SpawnOptionsWithoutStdio, spawn } from 'node:child_process'
import type { Logger } from 'pino'

export type CommandSpec = {
  command: string
  args?: string[]
  reason: string
  timeoutMs?: number
}

export class CommandGateway {
  constructor(private deps: { logger: Logger }) {}

  spawnAllowed(spec: CommandSpec, options: SpawnOptionsWithoutStdio = {}) {
    if (!spec.reason || spec.reason.length < 8) {
      throw Object.assign(new Error('Command reason is required'), { status: 400 })
    }

    this.deps.logger.warn(
      { command: spec.command, args: spec.args ?? [], reason: spec.reason },
      '[command-gateway] spawning process',
    )

    const proc = spawn(spec.command, spec.args ?? [], {
      ...options,
      stdio: options.stdio ?? 'pipe',
    })

    if (spec.timeoutMs && spec.timeoutMs > 0) {
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGTERM')
        } catch {
          // ignore
        }
      }, spec.timeoutMs)
      proc.once('close', () => clearTimeout(timer))
      proc.once('error', () => clearTimeout(timer))
    }

    return proc
  }
}
