import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchApi } from './api'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('mobile fetchApi', () => {
  const secureValues = new Map<string, string>()

  beforeEach(() => {
    secureValues.clear()
    vi.restoreAllMocks()
    vi.mocked(SecureStore.getItemAsync).mockImplementation((key) =>
      Promise.resolve(secureValues.get(key) ?? null),
    )
    vi.mocked(SecureStore.setItemAsync).mockImplementation((key, value) => {
      secureValues.set(key, value)
      return Promise.resolve()
    })
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation((key) => {
      secureValues.delete(key)
      return Promise.resolve()
    })
  })

  it('keeps auth storage when token refresh is temporarily unavailable', async () => {
    secureValues.set('accessToken', 'expired-access')
    secureValues.set('refreshToken', 'valid-refresh')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: 'expired', code: 'ACCESS_TOKEN_INVALID' }, { status: 401 }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'restarting' }, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchApi('/api/me')).rejects.toMatchObject({
      status: 401,
      code: 'ACCESS_TOKEN_INVALID',
    })

    expect(secureValues.get('accessToken')).toBe('expired-access')
    expect(secureValues.get('refreshToken')).toBe('valid-refresh')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('clears auth storage when the refresh token is rejected', async () => {
    secureValues.set('accessToken', 'expired-access')
    secureValues.set('refreshToken', 'revoked-refresh')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: 'expired', code: 'ACCESS_TOKEN_INVALID' }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'Invalid refresh token', code: 'REFRESH_TOKEN_INVALID' },
          { status: 401 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchApi('/api/me')).rejects.toMatchObject({
      status: 401,
      code: 'ACCESS_TOKEN_INVALID',
    })

    expect(secureValues.get('accessToken')).toBeUndefined()
    expect(secureValues.get('refreshToken')).toBeUndefined()
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login')
  })
})
