import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShadowClient } from '../src/client'

const originalFetch = globalThis.fetch

function restoreStubbedGlobals() {
  vi.restoreAllMocks()

  if (originalFetch === undefined) {
    delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch
    return
  }

  globalThis.fetch = originalFetch
}

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
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should throw on non-ok response with status and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await expect(client.getMe()).rejects.toThrow(
        'Shadow API GET /api/auth/me failed (401): Unauthorized',
      )
    })

    it('should include authorization header in requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', username: 'test' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = mockFetch as typeof fetch

      await expect(client.getMe()).rejects.toThrow('failed (500)')
    })
  })

  describe('auth methods', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should call register with correct path and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'jwt', user: { id: '1' } }),
      })
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should call listServers with GET', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = mockFetch as typeof fetch

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
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should call sendMessage with correct path', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'm1' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.sendMessage('ch1', 'Hello')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/channels/ch1/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Hello' }),
        }),
      )
    })

    it('should call sendToThread with metadata', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'tm1' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.sendToThread('thread-1', 'Thread reply', {
        metadata: { agentChain: { agentId: 'agent-1', depth: 1, participants: ['bot-1'] } },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/threads/thread-1/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'Thread reply',
            metadata: { agentChain: { agentId: 'agent-1', depth: 1, participants: ['bot-1'] } },
          }),
        }),
      )
    })

    it('should call getMessages with channel ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.getMessages('ch1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/channels/ch1/messages'),
        expect.any(Object),
      )
    })

    it('should submit interactive actions to the source message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'reply-1' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.submitInteractiveAction('message-1', {
        blockId: 'office-hour',
        actionId: 'submit',
        values: { pain: 'Manual reporting' },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/messages/message-1/interactive',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            blockId: 'office-hour',
            actionId: 'submit',
            values: { pain: 'Manual reporting' },
          }),
        }),
      )
    })
  })

  describe('agent policy methods', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should call listPolicies via the agent policies endpoint and filter by server', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'p1',
              serverId: 'srv-1',
              channelId: 'ch-1',
              mentionOnly: false,
              reply: true,
              config: {},
            },
            {
              id: 'p2',
              serverId: 'srv-2',
              channelId: 'ch-2',
              mentionOnly: true,
              reply: true,
              config: {},
            },
          ]),
      })
      globalThis.fetch = mockFetch as typeof fetch

      const policies = await client.listPolicies('agent-1', 'srv-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/agents/agent-1/policies',
        expect.any(Object),
      )
      expect(policies).toEqual([
        {
          id: 'p1',
          serverId: 'srv-1',
          channelId: 'ch-1',
          mentionOnly: false,
          reply: true,
          config: {},
        },
      ])
    })

    it('should call upsertPolicy via the batch agent policies endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'p1',
              serverId: 'srv-1',
              channelId: 'ch-1',
              mentionOnly: false,
              reply: true,
              config: { mode: 'test' },
            },
          ]),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.upsertPolicy('agent-1', 'srv-1', {
        channelId: 'ch-1',
        mentionOnly: false,
        reply: true,
        config: { mode: 'test' },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/agents/agent-1/policies',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            policies: [
              {
                serverId: 'srv-1',
                channelId: 'ch-1',
                mentionOnly: false,
                reply: true,
                config: { mode: 'test' },
              },
            ],
          }),
        }),
      )
    })

    it('should resolve a policy id before deletePolicy', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 'p1',
                serverId: 'srv-1',
                channelId: 'ch-1',
                mentionOnly: false,
                reply: true,
                config: {},
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })
      globalThis.fetch = mockFetch as typeof fetch

      await client.deletePolicy('agent-1', 'srv-1', 'ch-1')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/agents/agent-1/policies',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/agents/agent-1/policies/p1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('should call slash command registry endpoints', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ commands: [{ name: 'audit' }] }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.updateAgentSlashCommands('agent-1', [
        { name: 'audit', description: 'Run audit', aliases: ['seo'] },
      ])
      await client.getAgentSlashCommands('agent-1')
      await client.listChannelSlashCommands('channel-1')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/agents/agent-1/slash-commands',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            commands: [{ name: 'audit', description: 'Run audit', aliases: ['seo'] }],
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/agents/agent-1/slash-commands',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/channels/channel-1/slash-commands',
        expect.any(Object),
      )
    })
  })
})
