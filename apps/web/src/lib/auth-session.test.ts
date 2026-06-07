/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth.store'
import {
  applyAuthenticatedSession,
  clearAuthenticatedSession,
  ensureAuthenticatedSession,
  installDesktopCommunityAuthStateListener,
} from './auth-session'
import { DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT } from './desktop-community-auth'
import { disconnectSocket } from './socket'

vi.mock('./socket', () => ({
  disconnectSocket: vi.fn(),
}))

const user = {
  id: 'user-1',
  email: 'admin@shadowob.app',
  username: 'admin',
  displayName: 'Admin',
  avatarUrl: null,
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function testStorage(): Storage {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    })
  }
  return window.localStorage
}

function setDesktopAPI(api: {
  isDesktop?: boolean
  getCommunityAuthTokens?: () => Promise<{ accessToken?: string; refreshToken?: string }>
  syncCommunityAuthToken?: (
    accessToken?: string | null,
    refreshToken?: string | null,
    reason?: string,
  ) => void
}) {
  Object.defineProperty(window, 'desktopAPI', {
    configurable: true,
    value: { isDesktop: true, ...api },
  })
  return api
}

describe('auth session', () => {
  beforeEach(() => {
    testStorage().clear()
    setDesktopAPI({})
    vi.restoreAllMocks()
    vi.mocked(disconnectSocket).mockClear()
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false })
  })

  it('clears the in-memory auth state when the stored token cannot be refreshed', async () => {
    testStorage().setItem('accessToken', 'expired-access')
    useAuthStore.setState({
      user,
      accessToken: 'expired-access',
      isAuthenticated: true,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false }, { status: 401 })))

    await expect(ensureAuthenticatedSession()).resolves.toBeNull()

    expect(testStorage().getItem('accessToken')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(disconnectSocket).toHaveBeenCalled()
  })

  it('hydrates a missing renderer token from the desktop authority before validation', async () => {
    setDesktopAPI({
      getCommunityAuthTokens: vi
        .fn()
        .mockResolvedValue({ accessToken: 'desktop-access', refreshToken: 'desktop-refresh' }),
      syncCommunityAuthToken: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(user)))

    await expect(ensureAuthenticatedSession()).resolves.toEqual(user)

    expect(testStorage().getItem('accessToken')).toBe('desktop-access')
    expect(testStorage().getItem('refreshToken')).toBe('desktop-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'desktop-access',
      isAuthenticated: true,
    })
  })

  it('waits for delayed desktop auth before reporting an empty session', async () => {
    setDesktopAPI({
      getCommunityAuthTokens: vi
        .fn()
        .mockResolvedValueOnce({ accessToken: '', refreshToken: '' })
        .mockResolvedValueOnce({ accessToken: '', refreshToken: '' })
        .mockResolvedValueOnce({ accessToken: 'desktop-access', refreshToken: 'desktop-refresh' }),
      syncCommunityAuthToken: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(user)))

    await expect(ensureAuthenticatedSession()).resolves.toEqual(user)

    expect(testStorage().getItem('accessToken')).toBe('desktop-access')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('does not report logout to desktop when startup has no renderer token', async () => {
    const desktopAPI = setDesktopAPI({
      getCommunityAuthTokens: vi.fn().mockResolvedValue({ accessToken: '', refreshToken: '' }),
      syncCommunityAuthToken: vi.fn(),
    })

    await expect(ensureAuthenticatedSession()).resolves.toBeNull()

    expect(desktopAPI.syncCommunityAuthToken).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('does not clear a login that appears while startup validation is pending', async () => {
    let resolveDesktopTokens!: (tokens: { accessToken?: string; refreshToken?: string }) => void
    setDesktopAPI({
      getCommunityAuthTokens: vi.fn(() => {
        return new Promise<{ accessToken?: string; refreshToken?: string }>((resolve) => {
          resolveDesktopTokens = resolve
        })
      }),
      syncCommunityAuthToken: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(user)))

    const validation = ensureAuthenticatedSession()
    applyAuthenticatedSession({
      user,
      accessToken: 'login-access',
      refreshToken: 'login-refresh',
    })
    resolveDesktopTokens({ accessToken: '', refreshToken: '' })

    await expect(validation).resolves.toEqual(user)
    expect(testStorage().getItem('accessToken')).toBe('login-access')
    expect(testStorage().getItem('refreshToken')).toBe('login-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'login-access',
      isAuthenticated: true,
    })
  })

  it('refreshes an expired access token before marking the user authenticated', async () => {
    testStorage().setItem('accessToken', 'expired-access')
    testStorage().setItem('refreshToken', 'valid-refresh')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(user))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureAuthenticatedSession()).resolves.toEqual(user)

    expect(testStorage().getItem('accessToken')).toBe('new-access')
    expect(testStorage().getItem('refreshToken')).toBe('new-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'new-access',
      isAuthenticated: true,
    })
  })

  it('refreshes from a desktop refresh token when the renderer has no access token', async () => {
    setDesktopAPI({
      getCommunityAuthTokens: vi
        .fn()
        .mockResolvedValue({ accessToken: '', refreshToken: 'desktop-refresh' }),
      syncCommunityAuthToken: vi.fn(),
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse(user))
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureAuthenticatedSession()).resolves.toEqual(user)

    expect(testStorage().getItem('accessToken')).toBe('new-access')
    expect(testStorage().getItem('refreshToken')).toBe('new-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'new-access',
      isAuthenticated: true,
    })
  })

  it('clears all auth state on explicit session clear', () => {
    testStorage().setItem('accessToken', 'access')
    testStorage().setItem('refreshToken', 'refresh')
    useAuthStore.setState({ user, accessToken: 'access', isAuthenticated: true })

    clearAuthenticatedSession()

    expect(testStorage().getItem('accessToken')).toBeNull()
    expect(testStorage().getItem('refreshToken')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(disconnectSocket).toHaveBeenCalled()
  })

  it('applies desktop-pushed token rotations to the web session', async () => {
    installDesktopCommunityAuthStateListener()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(user)))

    window.dispatchEvent(
      new CustomEvent(DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT, {
        detail: {
          accessToken: 'desktop-access',
          refreshToken: 'desktop-refresh',
          authenticated: true,
          reason: 'refresh',
        },
      }),
    )

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
    expect(testStorage().getItem('accessToken')).toBe('desktop-access')
    expect(testStorage().getItem('refreshToken')).toBe('desktop-refresh')
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'desktop-access',
      isAuthenticated: true,
    })
  })

  it('does not revalidate an already current desktop auth echo', () => {
    installDesktopCommunityAuthStateListener()
    testStorage().setItem('accessToken', 'desktop-access')
    testStorage().setItem('refreshToken', 'desktop-refresh')
    useAuthStore.setState({
      user,
      accessToken: 'desktop-access',
      isAuthenticated: true,
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    window.dispatchEvent(
      new CustomEvent(DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT, {
        detail: {
          accessToken: 'desktop-access',
          refreshToken: 'desktop-refresh',
          authenticated: true,
          reason: 'sync',
        },
      }),
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'desktop-access',
      isAuthenticated: true,
    })
  })

  it('clears web auth immediately when desktop reports revocation', () => {
    installDesktopCommunityAuthStateListener()
    window.history.replaceState({}, '', '/app/login')
    testStorage().setItem('accessToken', 'revoked-access')
    testStorage().setItem('refreshToken', 'revoked-refresh')
    useAuthStore.setState({
      user,
      accessToken: 'revoked-access',
      isAuthenticated: true,
    })

    window.dispatchEvent(
      new CustomEvent(DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT, {
        detail: {
          accessToken: '',
          refreshToken: '',
          authenticated: false,
          reason: 'revoked',
        },
      }),
    )

    expect(testStorage().getItem('accessToken')).toBeNull()
    expect(testStorage().getItem('refreshToken')).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    })
    expect(disconnectSocket).toHaveBeenCalled()
  })

  it('ignores passive empty desktop auth snapshots', () => {
    installDesktopCommunityAuthStateListener()
    testStorage().setItem('accessToken', 'access')
    testStorage().setItem('refreshToken', 'refresh')
    useAuthStore.setState({ user, accessToken: 'access', isAuthenticated: true })

    window.dispatchEvent(
      new CustomEvent(DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT, {
        detail: {
          accessToken: '',
          refreshToken: '',
          authenticated: false,
          reason: 'startup',
        },
      }),
    )

    expect(testStorage().getItem('accessToken')).toBe('access')
    expect(testStorage().getItem('refreshToken')).toBe('refresh')
    expect(useAuthStore.getState()).toMatchObject({
      user,
      accessToken: 'access',
      isAuthenticated: true,
    })
    expect(disconnectSocket).not.toHaveBeenCalled()
  })
})
