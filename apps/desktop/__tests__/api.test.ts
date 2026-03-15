import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock query-client
vi.mock('@web/lib/query-client', () => ({
  queryClient: {
    removeQueries: vi.fn(),
    clear: vi.fn(),
  },
}))

beforeEach(() => {
  vi.resetModules()

  // Set VITE_API_BASE
  vi.stubEnv('VITE_API_BASE', 'https://shadowob.com')

  // Setup minimal browser environment
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { hash: '#/', href: '' },
    },
    writable: true,
    configurable: true,
  })

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => {
        if (key === 'accessToken') return 'test-access-token'
        if (key === 'refreshToken') return 'test-refresh-token'
        return null
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    writable: true,
    configurable: true,
  })

  // Mock fetch
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api.ts', () => {
  describe('fetchApi', () => {
    it('should prepend API_BASE to request path', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      }
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const { fetchApi } = await import('../src/renderer/lib/api')
      await fetchApi('/api/test')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.any(Object),
      )
    })

    it('should include Authorization header when token exists', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      }
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const { fetchApi } = await import('../src/renderer/lib/api')
      await fetchApi('/api/test')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      )
    })

    it('should throw on non-OK response with error message', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad request' }),
      }
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const { fetchApi } = await import('../src/renderer/lib/api')
      await expect(fetchApi('/api/test')).rejects.toThrow('Bad request')
    })

    it('should handle Zod validation error format', async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            error: { issues: [{ message: 'Field required' }, { message: 'Invalid type' }] },
          }),
      }
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const { fetchApi } = await import('../src/renderer/lib/api')
      await expect(fetchApi('/api/test')).rejects.toThrow('Field required; Invalid type')
    })

    it('should not double /api in URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }
      ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const { fetchApi } = await import('../src/renderer/lib/api')
      await fetchApi('/api/auth/me')

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      // Should NOT have /api/api/
      expect(calledUrl).not.toContain('/api/api/')
    })
  })
})
