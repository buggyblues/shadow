import { type ChildProcess, fork } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { app, ipcMain } from 'electron'

interface ManagedProcess {
  process: ChildProcess
  name: string
  startedAt: number
}

const managedProcesses = new Map<string, ManagedProcess>()
let processIdCounter = 0
let electronNodeBinaryCache: string | null = null

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function resolveElectronNodeBinaryAsync(): Promise<string> {
  if (electronNodeBinaryCache) return electronNodeBinaryCache
  if (process.platform !== 'darwin') {
    electronNodeBinaryCache = process.execPath
    return electronNodeBinaryCache
  }

  const contentsDir = dirname(dirname(app.getPath('exe')))
  const frameworksDir = join(contentsDir, 'Frameworks')

  for (const name of [`${app.getName()} Helper`, 'Shadow Helper', 'Electron Helper']) {
    const helper = join(frameworksDir, `${name}.app`, 'Contents', 'MacOS', name)
    if (await fileExists(helper)) {
      electronNodeBinaryCache = helper
      return helper
    }
  }

  try {
    const entries = await readdir(frameworksDir)
    const entry = entries.find((item) => item.endsWith(' Helper.app') && !item.includes('('))
    if (entry) {
      const name = entry.replace('.app', '')
      const helper = join(frameworksDir, entry, 'Contents', 'MacOS', name)
      if (await fileExists(helper)) {
        electronNodeBinaryCache = helper
        return helper
      }
    }
  } catch {
    // Best effort fallback below.
  }

  electronNodeBinaryCache = process.execPath
  return electronNodeBinaryCache
}

export function setupProcessManager(): void {
  ipcMain.handle(
    'desktop:startAgent',
    async (_event, args: { name: string; scriptPath: string; args?: string[] }) => {
      // Validate scriptPath is within the app directory
      const resolvedPath = resolve(args.scriptPath)
      const appPath = app.getAppPath()
      if (!resolvedPath.startsWith(appPath)) {
        throw new Error('Agent script must be within the application directory')
      }

      const id = `agent-${++processIdCounter}`
      const child = fork(resolvedPath, args.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        silent: true,
        execPath: await resolveElectronNodeBinaryAsync(),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' },
      })

      managedProcesses.set(id, {
        process: child,
        name: args.name,
        startedAt: Date.now(),
      })

      child.on('exit', (code) => {
        managedProcesses.delete(id)
        _event.sender.send('desktop:agentExited', { id, code })
      })

      child.on('error', (err) => {
        console.error(`Agent process ${id} error:`, err)
        managedProcesses.delete(id)
        _event.sender.send('desktop:agentExited', { id, code: 1 })
      })

      child.on('message', (msg) => {
        _event.sender.send('desktop:agentMessage', { id, message: msg })
      })

      return { id, pid: child.pid }
    },
  )

  ipcMain.handle('desktop:stopAgent', (_event, processId: string) => {
    const managed = managedProcesses.get(processId)
    if (managed) {
      managed.process.kill('SIGTERM')
      managedProcesses.delete(processId)
    }
  })

  ipcMain.handle('desktop:getAgentStatus', (_event, processId: string) => {
    const managed = managedProcesses.get(processId)
    if (!managed) return { running: false }
    return {
      running: !managed.process.killed,
      name: managed.name,
      pid: managed.process.pid,
      uptime: Date.now() - managed.startedAt,
    }
  })

  ipcMain.handle('desktop:listAgents', () => {
    return Array.from(managedProcesses.entries()).map(([id, m]) => ({
      id,
      name: m.name,
      pid: m.process.pid,
      running: !m.process.killed,
      uptime: Date.now() - m.startedAt,
    }))
  })
}

export function killAllAgents(): void {
  for (const [id, managed] of managedProcesses) {
    managed.process.kill('SIGTERM')
    managedProcesses.delete(id)
  }
}
