/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchApi } from './api'
import i18n from './i18n'
import { resetInviteCodeGateForTests, setInviteCodeGateHandler } from './invite-code-gate'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('fetchApi', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: {},
    })
    vi.restoreAllMocks()
    resetInviteCodeGateForTests()
  })

  it('sends the current UI language to localized APIs', async () => {
    await i18n.changeLanguage('zh-CN')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchApi('/api/discover/server-apps')).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'Accept-Language': 'zh-CN',
      }),
    })
  })

  it('uses the desktop refresh token when renderer storage lost it', async () => {
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: {
        getCommunityAuthTokens: vi
          .fn()
          .mockResolvedValue({ accessToken: '', refreshToken: 'desktop-refresh' }),
        syncCommunityAuthToken: vi.fn(),
      },
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchApi('/api/me')).resolves.toEqual({ ok: true })

    expect(localStorage.getItem('accessToken')).toBe('new-access')
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ refreshToken: 'desktop-refresh' }),
    })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer new-access',
      }),
    })
  })

  it('requests an invite code and retries invite-required requests once', async () => {
    localStorage.setItem('accessToken', 'access-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: false,
            code: 'INVITE_REQUIRED',
            error: 'Invite code required',
            capability: 'cloud:deploy',
          },
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const inviteHandler = vi.fn().mockResolvedValue({ isMember: true })
    vi.stubGlobal('fetch', fetchMock)
    setInviteCodeGateHandler(inviteHandler)

    await expect(
      fetchApi('/api/cloud-saas/deployments', {
        method: 'POST',
        body: JSON.stringify({ templateSlug: 'demo' }),
      }),
    ).resolves.toEqual({ ok: true })

    expect(inviteHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/cloud-saas/deployments',
        method: 'POST',
        error: expect.objectContaining({
          code: 'INVITE_REQUIRED',
          capability: 'cloud:deploy',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
