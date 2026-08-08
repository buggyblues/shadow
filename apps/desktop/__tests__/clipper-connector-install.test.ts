import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  appPath: '',
  clipboardWrite: vi.fn(),
  openPath: vi.fn(async () => ''),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  userDataPath: '',
}))

vi.mock('node:child_process', () => ({ spawn: electronState.spawn }))
vi.mock('electron', () => ({
  app: {
    getAppPath: () => electronState.appPath,
    getPath: (name: string) => (name === 'userData' ? electronState.userDataPath : tmpdir()),
  },
  clipboard: { writeText: electronState.clipboardWrite },
  shell: { openExternal: vi.fn(async () => undefined), openPath: electronState.openPath },
}))
vi.mock('@shadowob/connector/local-bridge', () => ({
  createLocalBridge: vi.fn(),
  readLocalBridgeToken: vi.fn(async () => 'admin-token'),
  resolveLocalBridgeRoot: () => join(electronState.userDataPath, 'library'),
}))
vi.mock('../src/main/services/community-session.service', () => ({
  communitySessionService: {
    onAuthChanged: vi.fn(),
    readBridgeSession: vi.fn(async () => ({ accessToken: 'community-token', refreshToken: '' })),
    readStoredAuthTokens: () => ({}),
  },
}))
vi.mock('../src/main/services/logger.service', () => ({
  loggerService: { write: vi.fn() },
}))

function hashDirectory(directory: string): string {
  const digest = createHash('sha256')
  const visit = (current: string, prefix = '') => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )) {
      const path = join(current, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(path, relativePath)
      else if (entry.isFile()) {
        digest.update(relativePath)
        digest.update('\0')
        digest.update(readFileSync(path))
        digest.update('\0')
      }
    }
  }
  visit(directory)
  return digest.digest('hex')
}

describe('Clipper Connector installation', () => {
  beforeEach(() => {
    electronState.appPath = mkdtempSync(join(tmpdir(), 'shadow-desktop-app-'))
    electronState.userDataPath = mkdtempSync(join(tmpdir(), 'shadow-desktop-user-'))
    electronState.clipboardWrite.mockReset()
    electronState.openPath.mockClear()
    electronState.spawn.mockClear()
    const source = join(electronState.appPath, 'dist', 'clipper-extension')
    mkdirSync(source, { recursive: true })
    writeFileSync(
      join(source, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, name: '虾豆剪藏', version: '0.2.0' }),
    )
    writeFileSync(join(source, 'background.js'), 'console.log("current")\n')
    writeFileSync(
      join(source, 'shadow-clipper-build.json'),
      JSON.stringify({
        extensionVersion: '0.2.0',
        protocolVersion: 3,
        ref: 'a'.repeat(40),
        repository: 'buggyblues/clipper',
        sha256: hashDirectory(source),
      }),
    )
    const installed = join(electronState.userDataPath, 'shadow-clipper', 'extension')
    mkdirSync(installed, { recursive: true })
    writeFileSync(join(installed, 'stale.js'), 'obsolete')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            ok: true,
            pairing: { code: `pair_${'x'.repeat(43)}`, expiresAt: new Date().toISOString() },
          },
          { status: 201 },
        ),
      ),
    )
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(electronState.appPath, { force: true, recursive: true })
    rmSync(electronState.userDataPath, { force: true, recursive: true })
  })

  it('atomically replaces stale files and writes only a one-time pairing code', async () => {
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )
    const service = new ClipperConnectorService()
    vi.spyOn(service, 'start').mockResolvedValue({
      browserClients: 0,
      clients: [],
      communitySignedIn: false,
      connectionState: 'waiting',
      connectionToken: 'admin-token',
      extensionPath: null,
      extensionVersion: null,
      files: 0,
      lastSyncedAt: null,
      libraryRoot: join(electronState.userDataPath, 'library'),
      ownedByDesktop: true,
      running: true,
      tokenAvailable: true,
      updateAvailable: false,
      url: 'http://127.0.0.1:32145',
    })

    const result = await service.prepareExtensionInstall()
    const installed = result.extensionPath
    expect(readFileSync(join(installed, 'background.js'), 'utf8')).toContain('current')
    expect(() => readFileSync(join(installed, 'stale.js'), 'utf8')).toThrow()
    const config = JSON.parse(readFileSync(join(installed, 'shadow-connector.json'), 'utf8'))
    expect(config).toMatchObject({
      buildRevision: 'a'.repeat(40),
      extensionVersion: '0.2.0',
      pairingCode: `pair_${'x'.repeat(43)}`,
      version: 2,
    })
    expect(config).not.toHaveProperty('token')
    expect(statSync(join(installed, 'shadow-connector.json')).mode & 0o777).toBe(0o600)
    expect(electronState.clipboardWrite).toHaveBeenCalledWith(installed)

    const original = readFileSync(join(installed, 'background.js'), 'utf8')
    const source = join(electronState.appPath, 'dist', 'clipper-extension')
    writeFileSync(join(source, 'background.js'), 'tampered')
    chmodSync(join(source, 'background.js'), 0o600)
    await expect(service.prepareExtensionInstall()).rejects.toThrow('CLIPPER_EXTENSION_INVALID')
    expect(readFileSync(join(installed, 'background.js'), 'utf8')).toBe(original)
  })

  it('replaces an older running bridge before creating a secure pairing', async () => {
    let pairingRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (!String(input).endsWith('/v1/admin/pairings')) return Response.json({ ok: true })
        pairingRequests += 1
        if (pairingRequests === 1) {
          return Response.json({ error: 'Not found', ok: false }, { status: 404 })
        }
        return Response.json(
          {
            ok: true,
            pairing: { code: `pair_${'y'.repeat(43)}`, expiresAt: new Date().toISOString() },
          },
          { status: 201 },
        )
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )
    const service = new ClipperConnectorService()
    const status = {
      browserClients: 0,
      clients: [],
      communitySignedIn: false,
      connectionState: 'waiting' as const,
      connectionToken: 'admin-token',
      extensionPath: null,
      extensionVersion: null,
      files: 0,
      lastSyncedAt: null,
      libraryRoot: join(electronState.userDataPath, 'library'),
      ownedByDesktop: true,
      running: true,
      tokenAvailable: true,
      updateAvailable: false,
      url: 'http://127.0.0.1:32145',
    }
    const start = vi.spyOn(service, 'start').mockResolvedValue(status)
    const stop = vi.spyOn(service, 'stop').mockResolvedValue(status)

    const result = await service.prepareExtensionInstall()
    const config = JSON.parse(
      readFileSync(join(result.extensionPath, 'shadow-connector.json'), 'utf8'),
    )

    expect(stop).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledTimes(2)
    expect(pairingRequests).toBe(2)
    expect(config).toMatchObject({ pairingCode: `pair_${'y'.repeat(43)}`, version: 2 })
    expect(config).not.toHaveProperty('token')
  })

  it('refreshes an older bridge before syncing the signed-in account', async () => {
    let authorizationRequests = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/v1/health')) {
          return Response.json({ ok: true, service: 'shadow-local-bridge' })
        }
        if (url.endsWith('/v1/library/status')) {
          return Response.json({
            clients: [
              {
                clientId: 'desktop-extension',
                extensionVersion: '0.2.0',
                protocolVersion: 3,
                seenAt: new Date().toISOString(),
              },
            ],
            ok: true,
          })
        }
        if (url.endsWith('/v1/community/session/authorize')) {
          authorizationRequests += 1
          if (authorizationRequests === 1) {
            return Response.json({ error: 'Not found', ok: false }, { status: 404 })
          }
          return Response.json(
            {
              authorization: {
                expiresAt: '2026-08-08T12:10:00.000Z',
                taskId: 'community-session-task',
              },
              ok: true,
            },
            { status: 201 },
          )
        }
        return Response.json({ ok: true })
      }),
    )
    const { ClipperConnectorService } = await import(
      '../src/main/services/clipper-connector.service'
    )
    const service = new ClipperConnectorService()
    const status = {
      browserClients: 1,
      clients: [],
      communitySignedIn: true,
      connectionState: 'connected' as const,
      connectionToken: 'admin-token',
      extensionPath: null,
      extensionVersion: '0.2.0',
      files: 0,
      lastSyncedAt: null,
      libraryRoot: join(electronState.userDataPath, 'library'),
      ownedByDesktop: true,
      running: true,
      tokenAvailable: true,
      updateAvailable: false,
      url: 'http://127.0.0.1:32145',
    }
    const start = vi.spyOn(service, 'start').mockResolvedValue(status)
    const stop = vi.spyOn(service, 'stop').mockResolvedValue(status)

    await expect(service.syncCommunitySession(true)).resolves.toEqual({
      expiresAt: '2026-08-08T12:10:00.000Z',
      taskId: 'community-session-task',
    })
    expect(stop).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
    expect(authorizationRequests).toBe(2)
  })
})
