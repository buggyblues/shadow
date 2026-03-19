/**
 * OpenClaw IPC Handlers
 *
 * Registers all Electron IPC handlers for the OpenClaw integration.
 * This is the bridge between the renderer process and the unified OpenClawService.
 *
 * All operations go through the service layer to guarantee strict isolation
 * from any system-installed OpenClaw instance.
 */

import { spawn } from 'node:child_process'
import { dialog, ipcMain, shell } from 'electron'
import { getMainWindow } from '../window'
import { createOpenClawService, getOpenClawService } from './service'
import type { BootstrapFileName } from './service/config'
import type { AgentConfig, BuddyConnection, ModelProviderEntry } from './types'

export function setupOpenClawIPC(): void {
  const svc = getOpenClawService()

  // ─── Gateway Lifecycle ──────────────────────────────────────────────

  ipcMain.handle('openclaw:gateway:status', () => svc.gateway.getStatus())
  ipcMain.handle('openclaw:gateway:start', () => svc.gateway.start())
  ipcMain.handle('openclaw:gateway:stop', () => svc.gateway.stop())
  ipcMain.handle('openclaw:gateway:restart', () => svc.gateway.restart())
  ipcMain.handle('openclaw:gateway:install', () => svc.gateway.install())

  ipcMain.handle('openclaw:gateway:open-console', async () => {
    const status = svc.gateway.getStatus()
    if (status.state !== 'running' || !status.port || !status.gatewayToken) return false
    const url = `http://127.0.0.1:${status.port}/#token=${status.gatewayToken}`
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('openclaw:gateway:recent-logs', (_event, limit?: number) =>
    svc.gateway.getRecentLogs(limit ?? 500),
  )

  ipcMain.handle('openclaw:dialog:pick-directory', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath,
      title: '选择工作区目录',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  })

  svc.gateway.onStatusChange((status) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('openclaw:gateway:status-changed', status)
    }
  })

  svc.gateway.onLog((entry) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('openclaw:gateway:log', entry)
    }
  })

  // ─── Config Management ──────────────────────────────────────────────

  ipcMain.handle('openclaw:config:get', () => svc.config.read())
  ipcMain.handle('openclaw:config:save', (_event, config) => svc.config.write(config))

  // ─── Desktop Settings (not stored in openclaw.json) ────────────────

  ipcMain.handle('openclaw:desktop-settings:get', () => svc.config.readDesktopSettings())
  ipcMain.handle('openclaw:desktop-settings:save', (_event, settings) => {
    svc.config.writeDesktopSettings(settings)
    return { success: true }
  })

  // ─── Agents ─────────────────────────────────────────────────────────

  ipcMain.handle('openclaw:agents:list', () => svc.config.getAgents())
  ipcMain.handle('openclaw:agents:get', (_event, id: string) => svc.config.getAgent(id))

  ipcMain.handle('openclaw:agents:create', (_event, agent: AgentConfig) => {
    svc.config.createAgent(agent)
    return { success: true }
  })

  ipcMain.handle('openclaw:agents:update', (_event, id: string, updates: Partial<AgentConfig>) => {
    svc.config.updateAgent(id, updates)
    return { success: true }
  })

  ipcMain.handle('openclaw:agents:delete', (_event, id: string) => {
    svc.config.deleteAgent(id)
    return { success: true }
  })

  // ─── Agent Bootstrap Files ──────────────────────────────────────────

  ipcMain.handle('openclaw:agents:bootstrap:list', (_event, agentId: string) =>
    svc.config.listBootstrapFiles(agentId),
  )

  ipcMain.handle('openclaw:agents:bootstrap:read', (_event, agentId: string, fileName: string) =>
    svc.config.readBootstrapFile(agentId, fileName as BootstrapFileName),
  )

  ipcMain.handle(
    'openclaw:agents:bootstrap:write',
    (_event, agentId: string, fileName: string, content: string) => {
      svc.config.writeBootstrapFile(agentId, fileName as BootstrapFileName, content)
      return { success: true }
    },
  )

  // ─── Channel Configuration ──────────────────────────────────────────

  ipcMain.handle('openclaw:channels:registry', () => svc.getChannelRegistry())
  ipcMain.handle('openclaw:channels:meta', (_event, channelId: string) =>
    svc.getChannelMeta(channelId),
  )
  ipcMain.handle('openclaw:channels:configs', () => svc.config.getChannelConfigs())
  ipcMain.handle('openclaw:channels:config:get', (_event, channelId: string) =>
    svc.config.getChannelConfig(channelId),
  )

  ipcMain.handle(
    'openclaw:channels:config:save',
    (_event, channelType: string, config: unknown) => {
      svc.config.saveChannelConfig(channelType, config)
      return { success: true }
    },
  )

  ipcMain.handle('openclaw:channels:config:delete', (_event, channelId: string) => {
    svc.config.deleteChannelConfig(channelId)
    return { success: true }
  })

  // ─── Model Providers ────────────────────────────────────────────────

  ipcMain.handle('openclaw:models:list', () => svc.config.getModelProviders())

  ipcMain.handle('openclaw:models:save', (_event, id: string, provider: ModelProviderEntry) => {
    svc.config.saveModelProvider(id, provider)
    return { success: true }
  })

  ipcMain.handle('openclaw:models:delete', (_event, id: string) => {
    svc.config.deleteModelProvider(id)
    return { success: true }
  })

  // ─── Cron Config (system-level) ─────────────────────────────────────

  ipcMain.handle('openclaw:cron:config', () => svc.config.getCronConfig())

  ipcMain.handle('openclaw:cron:config:update', (_event, updates: Record<string, unknown>) => {
    svc.config.updateCronConfig(updates)
    return { success: true }
  })

  // ─── Cron Tasks ─────────────────────────────────────────────────────

  ipcMain.handle('openclaw:cron:tasks:list', () => svc.cron.list())

  ipcMain.handle('openclaw:cron:tasks:save', (_event, task: Record<string, unknown>) =>
    svc.cron.save(task as Parameters<typeof svc.cron.save>[0]),
  )

  ipcMain.handle('openclaw:cron:tasks:delete', (_event, id: string) => {
    svc.cron.delete(id)
    return { success: true }
  })

  // ─── Skills ─────────────────────────────────────────────────────────

  ipcMain.handle('openclaw:skills:list', () => svc.config.listInstalledSkills())
  ipcMain.handle('openclaw:skills:config', () => svc.config.getSkillsConfig())

  ipcMain.handle(
    'openclaw:skills:config:update',
    (
      _event,
      skillName: string,
      updates: { enabled?: boolean; apiKey?: string; env?: Record<string, string> },
    ) => {
      svc.config.updateSkillConfig(skillName, updates)
      svc.config.updateSkillEntry(skillName, updates)
      return { success: true }
    },
  )

  ipcMain.handle('openclaw:skills:entry:delete', (_event, name: string) => {
    svc.config.deleteSkillEntry(name)
    return { success: true }
  })

  ipcMain.handle('openclaw:skills:readme', (_event, slug: string) => svc.skillHub.getReadme(slug))

  // ─── SkillHub ───────────────────────────────────────────────────────

  ipcMain.handle(
    'openclaw:skillhub:search',
    (
      _event,
      query: string,
      options?: { registryId?: string; page?: number; pageSize?: number; tags?: string[] },
    ) => svc.skillHub.search(query, options),
  )

  ipcMain.handle('openclaw:skillhub:install', (_event, slug: string, registryId?: string) =>
    svc.skillHub.install(slug, registryId),
  )

  ipcMain.handle('openclaw:skillhub:uninstall', (_event, slug: string) =>
    svc.skillHub.uninstall(slug),
  )

  ipcMain.handle('openclaw:skillhub:registries', () => svc.skillHub.getRegistries())

  ipcMain.handle('openclaw:skillhub:leaderboard', (_event, limit?: number) =>
    svc.skillHub.leaderboard(limit),
  )

  ipcMain.handle('openclaw:skillhub:registries:update', (_event, registries) => {
    svc.skillHub.setRegistries(registries)
    return { success: true }
  })

  // ─── Debug CLI Execution ──────────────────────────────────────────────

  ipcMain.handle(
    'openclaw:cli:exec',
    async (
      _event,
      args: string[],
    ): Promise<{ code: number | null; stdout: string; stderr: string }> => {
      const entryPoint = svc.paths.resolveGatewayEntry()
      if (!entryPoint) {
        return { code: 1, stdout: '', stderr: 'OpenClaw entry point not found' }
      }

      // Use the running gateway's port/token so CLI commands connect to OUR gateway
      const status = svc.gateway.getStatus()
      const port = status.port ?? 0
      const token = status.gatewayToken ?? ''

      const env = svc.paths.buildGatewayEnv(port, token, {
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_NO_ATTACH_CONSOLE: '1',
      })

      return new Promise((resolve) => {
        let stdout = ''
        let stderr = ''
        const proc = spawn(process.execPath, [entryPoint, ...args], {
          cwd: svc.paths.root,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30_000,
        })

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })
        proc.on('error', (err) => {
          resolve({ code: 1, stdout, stderr: stderr || err.message })
        })
        proc.on('close', (code) => {
          resolve({ code, stdout, stderr })
        })
      })
    },
  )

  // ─── Buddy Connections ──────────────────────────────────────────────

  ipcMain.handle('openclaw:buddy:list', () => svc.buddy.list())

  ipcMain.handle('openclaw:buddy:add', (_event, connection: Omit<BuddyConnection, 'status'>) =>
    svc.buddy.add(connection),
  )

  ipcMain.handle('openclaw:buddy:remove', (_event, id: string) => {
    svc.buddy.remove(id)
    return { success: true }
  })

  ipcMain.handle(
    'openclaw:buddy:update',
    (_event, id: string, updates: Partial<BuddyConnection>) => {
      svc.buddy.update(id, updates)
      return { success: true }
    },
  )

  ipcMain.handle('openclaw:buddy:connect', (_event, id: string) => svc.buddy.connect(id))

  ipcMain.handle('openclaw:buddy:disconnect', (_event, id: string) => {
    svc.buddy.disconnect(id)
    return { success: true }
  })

  ipcMain.handle('openclaw:buddy:connect-all', async () => {
    await svc.buddy.connectAll()
    return { success: true }
  })

  ipcMain.handle('openclaw:buddy:probe-all', () => svc.buddy.probeAll())

  svc.buddy.onStatusChange((conns) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('openclaw:buddy:status-changed', conns)
    }
  })
}

/** Initialize all OpenClaw services. Call from app.ready handler. */
export function initOpenClaw(): void {
  const svc = createOpenClawService()
  svc.init()
  setupOpenClawIPC()
}

/** Clean up all OpenClaw services. Call from app.will-quit handler. */
export function cleanupOpenClaw(): void {
  getOpenClawService().cleanup()
}
