import { createHash, randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { connectorHome } from './toolchain.js'

type ConnectorDaemonLock = {
  version: 1
  pid: number
  token: string
  serverUrl: string
  startedAt: string
}

function normalizedServerUrl(serverUrl: string) {
  return serverUrl.trim().replace(/\/+$/, '')
}

export function connectorDaemonLockPath(serverUrl: string, home = connectorHome()) {
  const scope = createHash('sha256')
    .update(normalizedServerUrl(serverUrl))
    .digest('hex')
    .slice(0, 16)
  return resolve(home, `daemon-${scope}.lock`)
}

function readLock(path: string): ConnectorDaemonLock | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ConnectorDaemonLock>
    return value.version === 1 && Number.isInteger(value.pid) && value.pid! > 0 && value.token
      ? (value as ConnectorDaemonLock)
      : null
  } catch {
    return null
  }
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function acquireConnectorDaemonLock(
  serverUrl: string,
  options: { home?: string; pid?: number; token?: string } = {},
): () => void {
  const home = options.home ?? connectorHome()
  const pid = options.pid ?? process.pid
  const token = options.token ?? randomUUID()
  const path = connectorDaemonLockPath(serverUrl, home)
  mkdirSync(home, { recursive: true, mode: 0o700 })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(
          fd,
          `${JSON.stringify({
            version: 1,
            pid,
            token,
            serverUrl: normalizedServerUrl(serverUrl),
            startedAt: new Date().toISOString(),
          })}\n`,
          'utf8',
        )
      } finally {
        closeSync(fd)
      }
      return () => {
        const current = readLock(path)
        if (current?.pid === pid && current.token === token) rmSync(path, { force: true })
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const current = readLock(path)
      if (current && processIsAlive(current.pid)) {
        throw new Error(
          `A Shadow connector daemon is already running for ${normalizedServerUrl(serverUrl)} (pid ${current.pid}).`,
        )
      }
      rmSync(path, { force: true })
    }
  }
  throw new Error(`Unable to acquire the Shadow connector daemon lock at ${path}`)
}
