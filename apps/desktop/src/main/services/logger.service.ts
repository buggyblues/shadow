import { app } from 'electron'
import log from 'electron-log/main'

export type DesktopLogLevel = 'debug' | 'info' | 'warn' | 'error'

export class LoggerService {
  private installed = false

  install(): void {
    if (this.installed) return
    this.installed = true
    this.configureTransports()
    log.initialize({ spyRendererConsole: true })
    log.errorHandler.startCatching({ showDialog: false })
    Object.assign(console, log.functions)
    log.scope('lifecycle').info('desktop logging initialized', this.runtimeMetadata(), {
      logFile: this.getLogFilePath(),
    })
  }

  getLogFilePath(): string {
    return log.transports.file.getFile().path
  }

  write(level: DesktopLogLevel, scope: string, ...args: unknown[]): void {
    log.scope(scope)[level](...args)
  }

  logRendererMessage(scope: string, payload: unknown): void {
    if (!scope.startsWith('[desktop-')) return
    log.scope(scope).info(payload)
  }

  private configureTransports(): void {
    log.transports.file.level = 'debug'
    log.transports.file.maxSize = 10 * 1024 * 1024
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}'
    log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  }

  private runtimeMetadata(): Record<string, string | number> {
    return {
      app: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      node: process.versions.node,
      electron: process.versions.electron,
      buildId:
        process.env.SHADOW_BUILD_ID ||
        process.env.GITHUB_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        '',
    }
  }
}

export const loggerService = new LoggerService()
export const desktopLog = log
