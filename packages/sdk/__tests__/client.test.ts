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

  describe('connector computers', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('calls connector computer endpoints', async () => {
      const mockFetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ computers: [], command: 'npx', agent: { id: 'a1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      )
      globalThis.fetch = mockFetch as typeof fetch

      await client.listConnectorComputers()
      await client.createConnectorBootstrap({ serverUrl: 'https://shadowob.com', name: 'Laptop' })
      await client.createAgentOnConnectorComputer('pc-1', {
        runtimeId: 'codex',
        serverUrl: 'https://shadowob.com',
        name: 'Alice',
        username: 'alice',
      })
      await client.configureAgentOnConnectorComputer('pc-1', 'agent-1', {
        runtimeId: 'claude-code',
        serverUrl: 'https://shadowob.com',
      })

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/connector/computers',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/connector/computers/bootstrap',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ serverUrl: 'https://shadowob.com', name: 'Laptop' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/connector/computers/pc-1/buddies',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            runtimeId: 'codex',
            serverUrl: 'https://shadowob.com',
            name: 'Alice',
            username: 'alice',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/api/connector/computers/pc-1/buddies/agent-1/configure',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            runtimeId: 'claude-code',
            serverUrl: 'https://shadowob.com',
          }),
        }),
      )
    })
  })

  describe('media helpers', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('resolves attachment media URLs with image variants', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            url: '/api/media/signed/token',
            expiresAt: '2026-05-13T04:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.resolveAttachmentMediaUrl('attachment-1', {
        disposition: 'inline',
        variant: 'preview',
      })

      expect(result.url).toBe('/api/media/signed/token')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/attachments/attachment-1/media-url?disposition=inline&variant=preview',
        expect.any(Object),
      )
    })

    it('downloads Shadow content refs with bearer auth before re-uploading', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              'content-disposition': 'inline; filename="private.png"',
              'content-type': 'image/png',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ url: '/shadow/uploads/new.png', key: 'new.png', size: 3 }),
            {
              status: 201,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.uploadMediaFromUrl('/shadow/uploads/private.png', 'message-1')

      expect(result).toEqual({ url: '/shadow/uploads/new.png', key: 'new.png', size: 3 })
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/shadow/uploads/private.png',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
          redirect: 'follow',
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/media/upload',
        expect.objectContaining({
          method: 'POST',
          headers: { Authorization: 'Bearer test-token-123' },
        }),
      )
    })

    it('downloads same-origin signed media URLs with bearer-compatible downloader', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Uint8Array([4, 5]), {
            status: 200,
            headers: {
              'content-disposition': 'inline; filename="signed.jpg"',
              'content-type': 'image/jpeg',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              url: '/shadow/uploads/signed-copy.jpg',
              key: 'signed-copy.jpg',
              size: 2,
            }),
            {
              status: 201,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
      globalThis.fetch = mockFetch as typeof fetch

      await client.uploadMediaFromUrl('https://api.example.com/api/media/signed/short-token')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/media/signed/short-token',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })

    it('downloads workspace files through signed media URLs', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              url: '/api/media/signed/workspace-file-token',
              expiresAt: '2026-05-13T04:00:00.000Z',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([7, 8, 9]), {
            status: 200,
            headers: {
              'content-disposition': 'attachment; filename="brief.md"',
              'content-type': 'text/markdown',
            },
          }),
        )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.downloadWorkspaceFile('server-1', 'file-1')

      expect(result.filename).toBe('brief.md')
      expect(result.contentType).toBe('text/markdown')
      expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([7, 8, 9]))
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/servers/server-1/workspace/files/file-1/media-url?disposition=attachment',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/media/signed/workspace-file-token',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })
  })

  describe('OAuth commerce entitlement helpers', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('checks app-scoped entitlement access with query params', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: true,
            status: 'active',
            reasonCode: null,
            resourceType: 'external_app',
            resourceId: 'app-1:premium',
            capability: 'use',
            app: { id: 'app-1' },
            entitlement: { id: 'entitlement-1', status: 'active', capability: 'use' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.getOAuthCommerceEntitlementAccess({
        resourceType: 'external_app',
        resourceId: 'app-1:premium',
        capability: 'use',
      })

      expect(result.allowed).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/oauth/commerce/entitlements?resourceType=external_app&resourceId=app-1%3Apremium&capability=use',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })

    it('redeems app-scoped entitlement with idempotency payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            redeemed: true,
            resourceType: 'external_app',
            resourceId: 'app-1:premium',
            capability: 'use',
            app: { id: 'app-1' },
            entitlement: { id: 'entitlement-1', status: 'active', capability: 'use' },
            redemption: {
              appId: 'app-1',
              resourceType: 'external_app',
              resourceId: 'app-1:premium',
              capability: 'use',
              idempotencyKey: 'redeem-key-1',
              redeemedAt: '2026-05-17T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.redeemOAuthCommerceEntitlement({
        idempotencyKey: 'redeem-key-1',
        resourceId: 'app-1:premium',
        metadata: { providerOrderId: 'provider-order-1' },
      })

      expect(result.redeemed).toBe(true)
      const init = mockFetch.mock.calls[0]?.[1] as RequestInit
      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        'https://api.example.com/api/oauth/commerce/entitlements/redeem',
      )
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        idempotencyKey: 'redeem-key-1',
        resourceId: 'app-1:premium',
        metadata: { providerOrderId: 'provider-order-1' },
      })
    })
  })

  describe('channel bootstrap', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('requests channel bootstrap data with a message limit', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access: { canAccess: true },
            channel: { id: 'channel-1' },
            server: null,
            channels: [],
            members: [],
            messages: { messages: [], hasMore: false },
            slashCommands: { commands: [] },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      globalThis.fetch = mockFetch as typeof fetch

      await client.getChannelBootstrap('channel-1', { messagesLimit: 50 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/channels/channel-1/bootstrap?messagesLimit=50',
        expect.any(Object),
      )
    })
  })

  describe('voice channel APIs', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('joins a voice channel with RTC options', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            credentials: { appId: 'agora-app', uid: 1 },
            participant: { userId: 'user-1' },
            state: { participants: [] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.joinVoiceChannel('channel-1', { clientId: 'sdk', muted: true })

      expect(result.credentials.appId).toBe('agora-app')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/channels/channel-1/voice/join',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ clientId: 'sdk', muted: true }),
        }),
      )
    })

    it('renews and leaves a voice channel with a client id', async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = []
      const mockFetch = vi.fn().mockImplementation((url, init) => {
        calls.push({ url: String(url), init })
        return Promise.resolve(
          new Response(JSON.stringify({ credentials: { appId: 'agora-app' }, state: {} }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.renewVoiceCredentials('channel-1', { clientId: 'sdk' })
      await client.leaveVoiceChannel('channel-1', { clientId: 'sdk' })

      expect(calls.map((call) => call.url)).toEqual([
        'https://api.example.com/api/channels/channel-1/voice/renew',
        'https://api.example.com/api/channels/channel-1/voice/leave',
      ])
      expect(calls.map((call) => call.init?.body)).toEqual([
        JSON.stringify({ clientId: 'sdk' }),
        JSON.stringify({ clientId: 'sdk' }),
      ])
    })

    it('updates voice policy for a Buddy', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agentId: 'agent-1',
            channelId: 'channel-1',
            autoJoin: true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      globalThis.fetch = mockFetch as typeof fetch

      await client.updateVoicePolicy('channel-1', {
        agentId: 'agent-1',
        autoJoin: true,
        consumeScreenShare: true,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/channels/channel-1/voice-policy',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            agentId: 'agent-1',
            autoJoin: true,
            consumeScreenShare: true,
          }),
        }),
      )
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

    it('should call email-code auth endpoints', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, expiresIn: 600 }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.startEmailLogin({ email: 'test@example.com', locale: 'en' })
      await client.verifyEmailLogin({ email: 'test@example.com', code: '123456' })
      await client.startPasswordReset({ email: 'test@example.com', locale: 'en' })
      await client.completePasswordReset({
        token: 'reset-token',
        newPassword: 'new-password-123',
        confirmPassword: 'new-password-123',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/email/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', locale: 'en' }),
        }),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/email/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
        }),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/password-reset/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', locale: 'en' }),
        }),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/password-reset/complete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'reset-token',
            newPassword: 'new-password-123',
            confirmPassword: 'new-password-123',
          }),
        }),
      )
    })

    it('should call membership and play launch endpoints', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'visitor', capabilities: [] }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.getMembership()
      await client.redeemInviteCode('ABCD1234')
      await client.launchPlay({
        playId: 'daily-brief',
        launchSessionId: 'launch-session-1',
        inviteCode: 'ABCD1234',
      })
      await client.getPlayCatalog()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/membership/me',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/membership/redeem-invite',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ code: 'ABCD1234' }),
        }),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/play/launch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            playId: 'daily-brief',
            launchSessionId: 'launch-session-1',
            inviteCode: 'ABCD1234',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/play/catalog',
        expect.any(Object),
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
        metadata: {
          collaboration: {
            id: 'collab-1',
            rootMessageId: 'root-1',
            buddyId: 'buddy-1',
            turn: 1,
          },
        },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/threads/thread-1/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'Thread reply',
            metadata: {
              collaboration: {
                id: 'collab-1',
                rootMessageId: 'root-1',
                buddyId: 'buddy-1',
                turn: 1,
              },
            },
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

    it('should call getMessagesAround with channel and message IDs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [], hasMore: false }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.getMessagesAround('ch1', 'msg1', 25)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/channels/ch1/messages/around/msg1?limit=25'),
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

    it('should fetch server-side interactive state for a source message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sourceMessageId: 'message-1',
            blockId: 'office-hour',
            submitted: true,
          }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.getInteractiveState('message-1', 'office-hour')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/messages/message-1/interactive-state?blockId=office-hour',
        expect.any(Object),
      )
    })

    it('should include replyToId when sending to a thread', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'tm1' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.sendToThread('thread-1', 'Thread reply', {
        replyToId: 'message-1',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/threads/thread-1/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'Thread reply',
            replyToId: 'message-1',
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
        listen: false,
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
                listen: false,
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

  describe('mentions', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should call mention suggestion endpoint with encoded trigger', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ suggestions: [] }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.suggestMentions({
        channelId: 'channel-1',
        trigger: '#',
        query: 'general',
        limit: 10,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/mentions/suggest?channelId=channel-1&trigger=%23&q=general&limit=10',
        expect.objectContaining({
          headers: expect.any(Object),
        }),
      )
    })

    it('should include mentions when sending a message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-1', content: 'hello @alice' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.sendMessage('channel-1', 'hello @alice', {
        mentions: [
          {
            kind: 'user',
            targetId: 'user-1',
            userId: 'user-1',
            token: '<@user-1>',
            sourceToken: '@alice',
            label: '@Alice',
          },
        ],
      })

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual(
        expect.objectContaining({
          mentions: [
            expect.objectContaining({
              kind: 'user',
              targetId: 'user-1',
              sourceToken: '@alice',
            }),
          ],
        }),
      )
    })

    it('should include mentions when sending a thread message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-1', content: 'hello @alice' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.sendToThread('thread-1', 'hello @alice', {
        mentions: [
          {
            kind: 'user',
            targetId: 'user-1',
            userId: 'user-1',
            token: '<@user-1>',
            sourceToken: '@alice',
            label: '@Alice',
          },
        ],
      })

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual(
        expect.objectContaining({
          content: 'hello @alice',
          mentions: [expect.objectContaining({ targetId: 'user-1' })],
        }),
      )
    })
  })

  describe('channel access methods', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should request and review private channel access', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, status: 'pending', requestId: 'req-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        })
      globalThis.fetch = mockFetch as typeof fetch

      await client.requestChannelAccess('ch1')
      await client.reviewChannelJoinRequest('req-1', 'approved')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/channels/ch1/join-requests',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/channel-join-requests/req-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' }),
        }),
      )
    })
  })

  describe('server access methods', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should fetch, request, and review private server access', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              server: { id: 'srv-1', name: 'Private', slug: 'private' },
              isMember: false,
              canManage: false,
              canAccess: false,
              requiresApproval: true,
              joinRequestStatus: null,
              joinRequestId: null,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, status: 'pending', requestId: 'req-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        })
      globalThis.fetch = mockFetch as typeof fetch

      await client.getServerAccess('private')
      await client.requestServerAccess('private')
      await client.reviewServerJoinRequest('req-1', 'approved')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/servers/private/access',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/servers/private/join-requests',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/servers/join-requests/req-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' }),
        }),
      )
    })
  })

  describe('notification methods', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should mark all notifications read with POST', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.markAllNotificationsRead()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/notifications/read-all',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('should include channelId when marking a notification scope read', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ updated: 1 }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.markScopeRead({ channelId: 'channel-1' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/notifications/read-scope',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ channelId: 'channel-1' }),
        }),
      )
    })

    it('should update channel preferences and register push tokens', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.updateNotificationChannelPreference({
        kind: 'commerce.renewal_failed',
        channel: 'mobile_push',
        enabled: false,
      })
      await client.registerPushToken({
        platform: 'ios',
        token: 'ExponentPushToken[abc]',
        deviceName: 'iPhone',
      })

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/notifications/channel-preferences',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            kind: 'commerce.renewal_failed',
            channel: 'mobile_push',
            enabled: false,
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/notifications/push-tokens',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            platform: 'ios',
            token: 'ExponentPushToken[abc]',
            deviceName: 'iPhone',
          }),
        }),
      )
    })
  })

  describe('commerce methods', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should fetch product picker cards and purchase with idempotency', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ cards: [] }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.listCommerceProductCards({ target: 'channel', channelId: 'channel-1', limit: 3 })
      await client.getCommerceOfferCheckoutPreview('offer-1', {
        skuId: 'sku-1',
        viewerUserId: 'user-2',
      })
      await client.purchaseShopProduct('shop-1', 'prod-1', { idempotencyKey: 'idem-1' })
      await client.createShopAssetDefinition('shop-1', {
        assetType: 'badge',
        name: 'Founder',
        status: 'active',
      })
      await client.updateShopAssetDefinition('shop-1', 'asset-def-1', {
        status: 'paused',
      })
      await client.createCommerceDeliverable('shop-1', 'offer-1', {
        kind: 'community_asset',
        resourceType: 'community_asset_definition',
        resourceId: 'asset-def-1',
      })

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/commerce/product-picker?target=channel&channelId=channel-1&limit=3',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/commerce/offers/offer-1/checkout-preview?skuId=sku-1&viewerUserId=user-2',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/shops/shop-1/products/prod-1/purchase',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: 'idem-1' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/api/shops/shop-1/assets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ assetType: 'badge', name: 'Founder', status: 'active' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        5,
        'https://api.example.com/api/shops/shop-1/assets/asset-def-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'paused' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        6,
        'https://api.example.com/api/shops/shop-1/offers/offer-1/deliverables',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            kind: 'community_asset',
            resourceType: 'community_asset_definition',
            resourceId: 'asset-def-1',
          }),
        }),
      )
    })

    it('should call community economy endpoints with idempotency keys', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.listCommunityAssets()
      await client.consumeCommunityAsset('grant-1', { idempotencyKey: 'consume-idem-1' })
      await client.lockCommunityAsset('grant-1', { idempotencyKey: 'lock-idem-1' })
      await client.unlockCommunityAsset('grant-1', { idempotencyKey: 'unlock-idem-1' })
      await client.revokeCommunityAsset('grant-1', {
        idempotencyKey: 'revoke-idem-1',
        reason: 'cleanup',
      })
      await client.sendTip({
        recipientUserId: 'user-2',
        amount: 10,
        idempotencyKey: 'tip-idem-1',
      })
      await client.sendGift({
        recipientUserId: 'user-2',
        currencies: [{ currencyCode: 'shrimp_coin', amount: 5 }],
        idempotencyKey: 'gift-idem-1',
      })
      await client.listSettlements({ limit: 20, offset: 40 })
      await client.settleAvailableSettlements()

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/economy/assets',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/economy/assets/grant-1/consume',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: 'consume-idem-1' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/economy/assets/grant-1/lock',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: 'lock-idem-1' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/api/economy/assets/grant-1/unlock',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: 'unlock-idem-1' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        5,
        'https://api.example.com/api/economy/assets/grant-1/revoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: 'revoke-idem-1', reason: 'cleanup' }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        6,
        'https://api.example.com/api/economy/tips',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            recipientUserId: 'user-2',
            amount: 10,
            idempotencyKey: 'tip-idem-1',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        7,
        'https://api.example.com/api/economy/gifts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            recipientUserId: 'user-2',
            currencies: [{ currencyCode: 'shrimp_coin', amount: 5 }],
            idempotencyKey: 'gift-idem-1',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        8,
        'https://api.example.com/api/economy/settlements?limit=20&offset=40',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        9,
        'https://api.example.com/api/economy/settlements/settle',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('should create server shop orders with idempotency', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'order-1' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.createOrder('server-1', {
        idempotencyKey: 'order-idem-1',
        items: [{ productId: 'prod-1', skuId: 'sku-1', quantity: 2 }],
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/servers/server-1/shop/orders',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: 'order-idem-1',
            items: [{ productId: 'prod-1', skuId: 'sku-1', quantity: 2 }],
          }),
        }),
      )
    })

    it('should create recharge intents with idempotency', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            clientSecret: 'secret',
            paymentIntentId: 'pi_1',
            orderNo: 'RC-1',
            amount: { shrimpCoins: 1000, usdCents: 1000 },
          }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.createRechargeIntent({ tier: '1000', idempotencyKey: 'recharge-idem-1' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/recharge/create-intent',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tier: '1000', idempotencyKey: 'recharge-idem-1' }),
        }),
      )
    })

    it('should cancel entitlements through the scope-neutral endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.cancelEntitlement('ent-1', 'user_cancelled')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/entitlements/ent-1/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'user_cancelled' }),
        }),
      )
    })

    it('should stop entitlement renewal without cancelling current access', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, renewalCancelled: true }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.cancelEntitlementRenewal('ent-1', 'buyer_cancelled_auto_renewal')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/entitlements/ent-1/cancel-renewal',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'buyer_cancelled_auto_renewal' }),
        }),
      )
    })

    it('should pass wallet transaction display filters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.getWalletTransactions({
        audience: 'consumer',
        direction: 'income',
        limit: 20,
        offset: 40,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/wallet/transactions?audience=consumer&direction=income&limit=20&offset=40',
        expect.any(Object),
      )
    })
  })

  describe('buddy inbox helpers', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('uses canonical Buddy Inbox API paths', async () => {
      await client.listBuddyInboxes()
      await client.listServerBuddyInboxes('shadow-plays')
      await client.ensureBuddyInbox('shadow-plays', 'agent-1')
      await client.updateBuddyInboxAdmissionPolicy('shadow-plays', 'agent-1', {
        defaultMode: 'allow',
        rules: [],
      })
      await client.listBuddyInboxAdmissionPending('shadow-plays', 'agent-1')
      await client.approveBuddyInboxAdmissionPending('shadow-plays', 'agent-1', 'pending-1')
      await client.rejectBuddyInboxAdmissionPending('shadow-plays', 'agent-1', 'pending-2')
      await client.enqueueInboxTaskForAgent('shadow-plays', 'agent-1', {
        title: 'Install',
        idempotencyKey: 'skills:install:x',
      })
      await client.enqueueInboxTask('channel-1', { title: 'Review' })

      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.map((call) => call[0])).toEqual([
        'https://api.example.com/api/buddy-inboxes',
        'https://api.example.com/api/servers/shadow-plays/inboxes',
        'https://api.example.com/api/servers/shadow-plays/inboxes/agent-1',
        'https://api.example.com/api/servers/shadow-plays/inboxes/agent-1/admission-policy',
        'https://api.example.com/api/servers/shadow-plays/inboxes/agent-1/admission-pending',
        'https://api.example.com/api/servers/shadow-plays/inboxes/agent-1/admission-pending/pending-1/approve',
        'https://api.example.com/api/servers/shadow-plays/inboxes/agent-1/admission-pending/pending-2/reject',
        'https://api.example.com/api/servers/shadow-plays/inboxes/agent-1/tasks',
        'https://api.example.com/api/channels/channel-1/inbox/tasks',
      ])
      expect(calls[3]?.[1]).toMatchObject({ method: 'PUT' })
      expect(calls[5]?.[1]).toMatchObject({ method: 'POST' })
      expect(calls[6]?.[1]).toMatchObject({ method: 'POST' })
      expect(calls[7]?.[1]).toMatchObject({ method: 'POST' })
      expect(calls[8]?.[1]).toMatchObject({ method: 'POST' })
    })
  })

  describe('cloud deployment runtime helpers', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('creates cloud templates and deployments through typed helpers', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              slug: 'team-template',
              name: 'Team Template',
              content: { version: '1.0.0' },
            }),
            {
              status: 201,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'deployment-1',
              namespace: 'team-namespace',
              name: 'Team Runtime',
              status: 'pending',
            }),
            {
              status: 201,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'deployment-1',
              namespace: 'team-namespace',
              name: 'Team Runtime',
              status: 'deployed',
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        )

      globalThis.fetch = mockFetch as typeof fetch

      await client.createCloudTemplate({
        slug: 'team-template',
        name: 'Team Template',
        content: { version: '1.0.0' },
      })
      await client.createCloudDeployment({
        namespace: 'team-namespace',
        name: 'Team Runtime',
        templateSlug: 'team-template',
        resourceTier: 'lightweight',
        agentCount: 1,
        configSnapshot: { version: '1.0.0' },
        runtimeContext: { locale: 'zh-CN', timezone: 'Asia/Shanghai' },
      })
      await client.getCloudDeployment('deployment-1')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/cloud-saas/templates',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            slug: 'team-template',
            name: 'Team Template',
            content: { version: '1.0.0' },
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/cloud-saas/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            namespace: 'team-namespace',
            name: 'Team Runtime',
            templateSlug: 'team-template',
            resourceTier: 'lightweight',
            agentCount: 1,
            configSnapshot: { version: '1.0.0' },
            runtimeContext: { locale: 'zh-CN', timezone: 'Asia/Shanghai' },
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/cloud-saas/deployments/deployment-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })

    it('lists cloud deployments with pagination parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      globalThis.fetch = mockFetch as typeof fetch

      await client.listCloudDeployments({ includeHistory: true, limit: 20, offset: 40 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/cloud-saas/deployments?includeHistory=1&limit=20&offset=40',
        expect.any(Object),
      )
    })

    it('reads cloud templates and cancels deployments', async () => {
      const jsonResponse = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      const responseBodies = [
        [],
        { slug: 'web-app' },
        { template: 'web-app', requiredEnvVars: [], fields: [], autoDetectedEnvVars: [] },
        [],
        { slug: 'my-template' },
        { ok: true },
      ]
      const mockFetch = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse(responseBodies.shift())))
      globalThis.fetch = mockFetch as typeof fetch

      await client.listCloudTemplates({ q: 'web', locale: 'zh-CN' })
      await client.getCloudTemplate('web-app', { locale: 'zh-CN' })
      await client.getCloudTemplateEnvRefs('web-app')
      await client.listMyCloudTemplates()
      await client.getMyCloudTemplate('my-template')
      await client.cancelCloudDeployment('deployment-1')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/cloud-saas/templates?q=web&locale=zh-CN',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/cloud-saas/templates/web-app?locale=zh-CN',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/api/cloud-saas/templates/web-app/env-refs',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/api/cloud-saas/templates/mine',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        5,
        'https://api.example.com/api/cloud-saas/templates/mine/my-template',
        expect.any(Object),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        6,
        'https://api.example.com/api/cloud-saas/deployments/deployment-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('queues cloud deployment destruction with DELETE', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, taskId: 'deployment-1', status: 'destroying' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      globalThis.fetch = mockFetch as typeof fetch

      const result = await client.destroyCloudDeployment('deployment-1')

      expect(result).toMatchObject({
        ok: true,
        success: true,
        taskId: 'deployment-1',
        status: 'destroying',
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/cloud-saas/deployments/deployment-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      )
    })
  })

  describe('OAuth authorization helpers', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn() as typeof fetch
    })

    afterEach(() => {
      restoreStubbedGlobals()
    })

    it('should send OAuth authorization approvals with the server camelCase body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: 'https://app.test/callback?code=abc' }),
      })
      globalThis.fetch = mockFetch as typeof fetch

      await client.approveOAuthAuthorization({
        client_id: 'shadow_client',
        redirect_uri: 'https://app.test/callback',
        scope: 'user:read',
        state: 'state-1',
      })
      await client.approveOAuthAuthorizationSilently({
        clientId: 'shadow_client',
        redirectUri: 'https://app.test/callback',
        scope: 'user:read',
        state: 'state-1',
      })

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/api/oauth/authorize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            clientId: 'shadow_client',
            redirectUri: 'https://app.test/callback',
            scope: 'user:read',
            state: 'state-1',
          }),
        }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/api/oauth/authorize/silent',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            clientId: 'shadow_client',
            redirectUri: 'https://app.test/callback',
            scope: 'user:read',
            state: 'state-1',
          }),
        }),
      )
    })
  })
})
