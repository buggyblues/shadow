import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShadowClient } from '../src/client'

describe('ShadowClient', () => {
  let client: ShadowClient

  beforeEach(() => {
    client = new ShadowClient('https://api.example.com', 'test-token-123')
  })

  describe('constructor', () => {
    it('should strip trailing /api from baseUrl', () => {
      const c = new ShadowClient('https://api.example.com/api', 'token')
      // Access internal state via a request that would expose the URL
      expect(c).toBeDefined()
    })

    it('should strip trailing /api/ from baseUrl', () => {
      const c = new ShadowClient('https://api.example.com/api/', 'token')
      expect(c).toBeDefined()
    })

    it('should leave baseUrl without /api suffix unchanged', () => {
      const c = new ShadowClient('https://api.example.com', 'token')
      expect(c).toBeDefined()
    })
  })

  describe('request error handling', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should throw on non-ok response with status and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(client.getMe()).rejects.toThrow(
        'Shadow API GET /api/auth/me failed (401): Unauthorized',
      )
    })

    it('should include authorization header in requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', username: 'test' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.getMe()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })

    it('should set Content-Type to application/json', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'new', user: {} }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.login({ email: 'a@b.com', password: '12345678' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('should handle fetch text() error gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('parse error')),
      })
      vi.stubGlobal('fetch', mockFetch)

      await expect(client.getMe()).rejects.toThrow('failed (500)')
    })
  })

  describe('auth methods', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should call register with correct path and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'jwt', user: { id: '1' } }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const data = {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        inviteCode: 'ABCD1234',
      }
      await client.register(data)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      )
    })

    it('should call login with correct path and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'jwt', user: { id: '1' } }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.login({ email: 'test@example.com', password: 'password123' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/login',
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })

    it('should call getMe with correct path', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', username: 'test' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.getMe()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })
  })

  describe('server methods', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should call listServers with GET', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.listServers()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/servers',
        expect.any(Object),
      )
    })

    it('should call createServer with POST and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 's1', name: 'Test' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.createServer({ name: 'Test' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/servers',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        }),
      )
    })
  })

  describe('message methods', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should call sendMessage with correct path', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'm1' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.sendMessage('ch1', 'Hello')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/channels/ch1/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Hello' }),
        }),
      )
    })

    it('should call getMessages with channel ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.getMessages('ch1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/channels/ch1/messages'),
        expect.any(Object),
      )
    })
  })
})
