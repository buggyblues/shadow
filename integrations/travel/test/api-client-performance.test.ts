import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from '../client/services/api-client.js'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { origin: 'http://travel.test' } })
})

afterEach(() => vi.unstubAllGlobals())

describe('travel API client request coalescing', () => {
  it('shares one GET request among concurrent consumers without caching later reads', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )

    const first = apiGet<{ id: string }>('/api/bootstrap')
    const second = apiGet<{ id: string }>('/api/bootstrap')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    resolveResponse?.(
      new Response(JSON.stringify({ ok: true, data: { id: 'shared' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 'shared' },
      { id: 'shared' },
    ])

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: { id: 'fresh' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(apiGet<{ id: string }>('/api/bootstrap')).resolves.toEqual({ id: 'fresh' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
