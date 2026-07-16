import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireConnectorDaemonLock, connectorDaemonLockPath } from '../src/daemon-lock.js'

describe('connector daemon lock', () => {
  it('prevents Desktop and CLI daemons from running against the same server concurrently', () => {
    const home = mkdtempSync(join(tmpdir(), 'shadow-daemon-lock-'))
    const release = acquireConnectorDaemonLock('https://shadowob.com/', {
      home,
      token: 'desktop',
    })

    expect(() =>
      acquireConnectorDaemonLock('https://shadowob.com', { home, token: 'cli' }),
    ).toThrow(/already running/)
    release()
    const releaseCli = acquireConnectorDaemonLock('https://shadowob.com', {
      home,
      token: 'cli',
    })
    releaseCli()
  })

  it('recovers a stale daemon lock', () => {
    const home = mkdtempSync(join(tmpdir(), 'shadow-daemon-lock-'))
    const serverUrl = 'https://shadowob.com'
    writeFileSync(
      connectorDaemonLockPath(serverUrl, home),
      JSON.stringify({
        version: 1,
        pid: 2_147_483_647,
        token: 'stale',
        serverUrl,
        startedAt: '2026-07-14T00:00:00.000Z',
      }),
    )

    const release = acquireConnectorDaemonLock(serverUrl, { home, token: 'replacement' })
    release()
  })
})
