import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DesktopLogExportResult } from '@shadowob/shared'
import { app, dialog } from 'electron'
import type { DesktopSettingsDao } from '../dao/desktop-settings.dao'
import { connectorDaemonService } from './connector-daemon.service'
import { desktopSettingsService } from './desktop-settings.service'
import { loggerService } from './logger.service'
import { processManagerService } from './process-manager.service'

type DiagnosticsServiceDeps = {
  desktopSettingsDao: DesktopSettingsDao
}

export type DesktopDiagnosticsSnapshot = {
  appName: string
  version: string
  platform: NodeJS.Platform
  arch: string
  pid: number
  electron: string
  node: string
  buildId: string
  logFilePath: string
  logFileExists: boolean
  connector: {
    serverBaseUrl: string
    cliPath: string | null
    cliBundled: boolean
    nodeBinary: string
    state: ReturnType<typeof connectorDaemonService.getState>
  }
}

export class DiagnosticsService {
  readonly #desktopSettingsDao: DesktopSettingsDao

  constructor({ desktopSettingsDao }: DiagnosticsServiceDeps) {
    this.#desktopSettingsDao = desktopSettingsDao
  }

  async getSnapshot(): Promise<DesktopDiagnosticsSnapshot> {
    const settings = await this.#desktopSettingsDao.read()
    const logFilePath = loggerService.getLogFilePath()
    const cliPath = await connectorDaemonService.resolveCliPath()
    const nodeBinary = await processManagerService.resolveElectronNodeBinary()
    const snapshot: DesktopDiagnosticsSnapshot = {
      appName: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      electron: process.versions.electron,
      node: process.versions.node,
      buildId:
        process.env.SHADOW_BUILD_ID ||
        process.env.GITHUB_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        '',
      logFilePath,
      logFileExists: existsSync(logFilePath),
      connector: {
        serverBaseUrl: desktopSettingsService.resolveDesktopServerBaseUrl(settings),
        cliPath,
        cliBundled: Boolean(cliPath),
        nodeBinary,
        state: connectorDaemonService.getState(settings),
      },
    }
    loggerService.write('info', 'diagnostics', 'desktop diagnostics snapshot requested', {
      ...snapshot,
      connector: {
        ...snapshot.connector,
        state: {
          running: snapshot.connector.state.running,
          pid: snapshot.connector.state.pid,
          phase: snapshot.connector.state.phase,
          progress: snapshot.connector.state.progress,
          lastExitCode: snapshot.connector.state.lastExitCode,
          lastError: snapshot.connector.state.lastError,
          connectorPath: snapshot.connector.state.connectorPath,
          hasApiKey: snapshot.connector.state.hasApiKey,
          connections: snapshot.connector.state.connections.length,
          logTailLines: snapshot.connector.state.logTail.length,
        },
      },
    })
    return snapshot
  }

  async exportLogs(): Promise<DesktopLogExportResult> {
    const logFilePath = loggerService.getLogFilePath()
    const defaultPath = join(
      app.getPath('downloads'),
      `${app.getName() || 'Shadow'}-${app.getVersion()}-${basename(logFilePath)}`,
    )
    const result = await dialog.showSaveDialog({
      title: 'Export Desktop Logs',
      defaultPath,
      filters: [{ name: 'Log files', extensions: ['log'] }],
    })
    if (result.canceled || !result.filePath) return { filePath: null }
    await copyFile(logFilePath, result.filePath)
    loggerService.write('info', 'diagnostics', 'desktop log exported', {
      source: logFilePath,
      target: result.filePath,
    })
    return { filePath: result.filePath }
  }
}
