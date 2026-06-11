import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  userDataDir: '',
  windows: [] as Array<{
    isDestroyed: () => boolean
    webContents: {
      isDestroyed: () => boolean
      isLoading: () => boolean
      getURL: () => string
      executeJavaScript: ReturnType<typeof vi.fn>
      once: ReturnType<typeof vi.fn>
    }
  }>,
  fetch: vi.fn(),
}))

const desktopSettingsState = vi.hoisted(() => ({
  serverBaseUrl: 'https://shadowob.com',
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => (name === 'userData' ? electronState.userDataDir : tmpdir())),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => electronState.windows),
  },
  net: {
    fetch: electronState.fetch,
  },
}))

vi.mock('../src/main/services/desktop-settings.service', () => ({
  desktopSettingsService: {
    readSettingsSync: vi.fn(() => ({
      serverBaseUrl: desktopSettingsState.serverBaseUrl,
    })),
    resolveDesktopServerBaseUrl: vi.fn((settings?: { serverBaseUrl?: string }) => {
      const value = settings?.serverBaseUrl ?? desktopSettingsState.serverBaseUrl
      try {
        const url = new URL(value || 'https://shadowob.com')
        return url.origin
      } catch {
        return 'https://shadowob.com'
      }
    }),
  },
}))

vi.mock('../src/main/services/window.service', () => ({
  windowService: {
    getConnectorAuthWindow: vi.fn(() => null),
    getMainWindow: vi.fn(() => null),
    showConnectorAuthWindow: vi.fn(),
  },
}))

vi.mock('../src/main/services/logger.service', () => ({
  loggerService: {
    write: vi.fn(),
  },
}))

function response(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createWindow(url = 'https://shadowob.com/app/discover') {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isLoading: () => false,
      getURL: () => url,
      executeJavaScript: vi.fn(async () => undefined),
      once: vi.fn(),
    },
  }
}

function executedAuthUpdateScript(win: ReturnType<typeof createWindow>): string {
  return (
    win.webContents.executeJavaScript.mock.calls
      .map((call) => String(call[0]))
      .reverse()
      .find((script) => script.includes('shadow:desktop-community-auth-updated')) ?? ''
  )
}

async function loadCommunitySession() {
  const module = await import('../src/main/services/community-session.service')
  module.communitySessionService.resetForTests()
  return module
}

describe('desktop community session', () => {
  beforeEach(() => {
    electronState.userDataDir = mkdtempSync(join(tmpdir(), 'shadow-community-session-'))
    electronState.windows = []
    electronState.fetch.mockReset()
    desktopSettingsState.serverBaseUrl = 'https://shadowob.com'
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(electronState.userDataDir, { recursive: true, force: true })
  })

  it('keeps passive blank startup snapshots from clearing a valid session', async () => {
    const session = await loadCommunitySession()

    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: '', refreshToken: '' },
      { reason: 'startup' },
    )

    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    })
  })

  it('clears and broadcasts on explicit logout', async () => {
    const win = createWindow()
    electronState.windows = [win]
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )

    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: '', refreshToken: '' },
      { reason: 'logout' },
    )

    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: '',
      refreshToken: '',
    })
    expect(executedAuthUpdateScript(win)).toContain("localStorage.removeItem('accessToken')")
    expect(executedAuthUpdateScript(win)).toContain('logout')
  })

  it('does not let stale passive window snapshots restore a logged-out session', async () => {
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: '', refreshToken: '' },
      { reason: 'logout' },
    )

    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      { reason: 'startup' },
    )

    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: '',
      refreshToken: '',
    })
  })

  it('does not let passive window snapshots overwrite an active session', async () => {
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-new', refreshToken: 'refresh-new' },
      { reason: 'login' },
    )

    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-stale', refreshToken: 'refresh-stale' },
      { reason: 'startup' },
    )

    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
    })
  })

  it('persists sessions by configured server origin', async () => {
    let session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'hosted-access', refreshToken: 'hosted-refresh' },
      { reason: 'login' },
    )

    desktopSettingsState.serverBaseUrl = 'https://self-hosted.example'
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'self-access', refreshToken: 'self-refresh' },
      { reason: 'login' },
    )

    session.communitySessionService.resetForTests()
    session = await loadCommunitySession()

    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: 'self-access',
      refreshToken: 'self-refresh',
    })
    desktopSettingsState.serverBaseUrl = 'https://shadowob.com'
    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: 'hosted-access',
      refreshToken: 'hosted-refresh',
    })
  })

  it('stores sessions in plain desktop config format', async () => {
    const session = await loadCommunitySession()

    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )

    const persisted = JSON.parse(
      readFileSync(join(electronState.userDataDir, 'desktop-community-auth.json'), 'utf8'),
    ) as {
      version?: unknown
      encoding?: unknown
      sessions?: Record<string, { accessToken?: unknown; refreshToken?: unknown }>
    }

    expect(persisted.version).toBe(1)
    expect(persisted.encoding).toBeUndefined()
    expect(persisted.sessions?.['https://shadowob.com']).toMatchObject({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    })
  })

  it('ignores legacy safeStorage sessions without using them as tokens', async () => {
    writeFileSync(
      join(electronState.userDataDir, 'desktop-community-auth.json'),
      JSON.stringify({
        version: 1,
        encoding: 'safeStorage',
        sessions: {
          'https://shadowob.com': {
            accessToken: Buffer.from('access-1').toString('base64'),
            refreshToken: Buffer.from('refresh-1').toString('base64'),
            updatedAt: Date.now(),
          },
        },
      }),
      'utf8',
    )
    const session = await loadCommunitySession()

    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: '',
      refreshToken: '',
    })
  })

  it('broadcasts the active origin session when settings change', async () => {
    const win = createWindow()
    electronState.windows = [win]
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'hosted-access', refreshToken: 'hosted-refresh' },
      { reason: 'login' },
    )

    desktopSettingsState.serverBaseUrl = 'https://self-hosted.example'
    await session.communitySessionService.syncAuthStateToOpenWindows('settings')

    expect(executedAuthUpdateScript(win)).toContain("localStorage.removeItem('accessToken')")
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'self-access', refreshToken: 'self-refresh' },
      { reason: 'login' },
    )
    await session.communitySessionService.syncAuthStateToOpenWindows('settings')

    expect(executedAuthUpdateScript(win)).toContain('self-access')
    expect(executedAuthUpdateScript(win)).toContain('settings')
  })

  it('rotates tickets once and retries a request after access-token expiry', async () => {
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'expired-access', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    electronState.fetch
      .mockResolvedValueOnce(response({ error: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(response({ accessToken: 'access-2', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(response({ ok: true }))

    const result = await session.communitySessionService.fetchWithAuth('/api/ping')

    expect(result.status).toBe(200)
    expect(electronState.fetch).toHaveBeenCalledTimes(3)
    expect(electronState.fetch.mock.calls[0][1]?.headers.Authorization).toBe(
      'Bearer expired-access',
    )
    expect(electronState.fetch.mock.calls[2][1]?.headers.Authorization).toBe('Bearer access-2')
    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    })
  })

  it('serializes concurrent ticket refreshes', async () => {
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: '', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    electronState.fetch.mockResolvedValueOnce(
      response({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    )

    await expect(
      Promise.all([
        session.communitySessionService.refreshAccessToken(),
        session.communitySessionService.refreshAccessToken(),
      ]),
    ).resolves.toEqual(['access-2', 'access-2'])
    expect(electronState.fetch).toHaveBeenCalledTimes(1)
    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    })
  })

  it('keeps refresh tickets and reports auth required when refresh is rejected', async () => {
    const win = createWindow()
    electronState.windows = [win]
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'expired-access', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    electronState.fetch
      .mockResolvedValueOnce(response({ error: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(response({ error: 'revoked' }, { status: 403 }))

    await expect(session.communitySessionService.fetchWithAuth('/api/ping')).rejects.toThrow(
      'AUTH_REQUIRED',
    )
    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: '',
      refreshToken: 'refresh-1',
    })
    expect(executedAuthUpdateScript(win)).toContain('shadow:desktop-community-auth-updated')
    expect(executedAuthUpdateScript(win)).toContain('refresh')
    expect(executedAuthUpdateScript(win)).not.toContain('revoked')
  })

  it('keeps refresh tickets when an authorized request is rejected after refresh cannot rotate', async () => {
    const win = createWindow()
    electronState.windows = [win]
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'expired-access', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    electronState.fetch
      .mockResolvedValueOnce(response({ error: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(response({ error: 'temporary' }, { status: 500 }))

    await expect(session.communitySessionService.fetchWithAuth('/api/ping')).rejects.toThrow(
      'AUTH_REQUIRED',
    )
    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: '',
      refreshToken: 'refresh-1',
    })
    expect(executedAuthUpdateScript(win)).toContain('refresh')
    expect(executedAuthUpdateScript(win)).not.toContain('revoked')
  })

  it('keeps refresh tickets when an authorized request is rejected after refresh cannot rotate', async () => {
    const win = createWindow()
    electronState.windows = [win]
    const session = await loadCommunitySession()
    session.communitySessionService.rememberAuthSnapshot(
      { accessToken: 'expired-access', refreshToken: 'refresh-1' },
      { reason: 'login' },
    )
    electronState.fetch
      .mockResolvedValueOnce(response({ error: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(response({ error: 'temporary' }, { status: 500 }))

    await expect(session.communitySessionService.fetchWithAuth('/api/ping')).rejects.toThrow(
      'AUTH_REQUIRED',
    )
    await expect(session.communitySessionService.readAuthTokens()).resolves.toEqual({
      accessToken: '',
      refreshToken: 'refresh-1',
    })
    expect(executedAuthUpdateScript(win)).toContain('refresh')
    expect(executedAuthUpdateScript(win)).not.toContain('revoked')
  })
})
