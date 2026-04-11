import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createOAuthAuthMiddleware,
  oauthScopeMiddleware,
} from '../middleware/oauth-auth.middleware'
import {
  authorizeApproveSchema,
  authorizeQuerySchema,
  createOAuthAppSchema,
  revokeConsentSchema,
  tokenExchangeSchema,
  updateOAuthAppSchema,
} from '../validators/oauth.schema'

export function createOAuthHandler(container: AppContainer) {
  const oauthHandler = new Hono()
  const oauthAuthMiddleware = createOAuthAuthMiddleware(container)

  // ─── App Management (authenticated) ───────────────

  // POST /api/oauth/apps — create an OAuth app
  oauthHandler.post(
    '/apps',
    authMiddleware,
    zValidator('json', createOAuthAppSchema),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const user = c.get('user')
      const input = c.req.valid('json')
      const result = await oauthService.createApp(user.userId, input)
      return c.json(result, 201)
    },
  )

  // GET /api/oauth/apps — list my OAuth apps
  oauthHandler.get('/apps', authMiddleware, async (c) => {
    const oauthService = container.resolve('oauthService')
    const user = c.get('user')
    const result = await oauthService.listApps(user.userId)
    return c.json(result)
  })

  // PATCH /api/oauth/apps/:appId — update an OAuth app
  oauthHandler.patch(
    '/apps/:appId',
    authMiddleware,
    zValidator('json', updateOAuthAppSchema),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const user = c.get('user')
      const { appId } = c.req.param()
      const input = c.req.valid('json')
      const result = await oauthService.updateApp(user.userId, appId, input)
      return c.json(result)
    },
  )

  // DELETE /api/oauth/apps/:appId — delete an OAuth app
  oauthHandler.delete('/apps/:appId', authMiddleware, async (c) => {
    const oauthService = container.resolve('oauthService')
    const user = c.get('user')
    const appId = c.req.param('appId')!
    await oauthService.deleteApp(user.userId, appId)
    return c.json({ ok: true })
  })

  // POST /api/oauth/apps/:appId/reset-secret — reset client secret
  oauthHandler.post('/apps/:appId/reset-secret', authMiddleware, async (c) => {
    const oauthService = container.resolve('oauthService')
    const user = c.get('user')
    const appId = c.req.param('appId')!
    const result = await oauthService.resetSecret(user.userId, appId)
    return c.json(result)
  })

  // ─── Authorization Endpoint ───────────────────────

  // GET /api/oauth/authorize — validate & return app info (for authorization page)
  oauthHandler.get('/authorize', authMiddleware, async (c) => {
    const oauthService = container.resolve('oauthService')
    const query = authorizeQuerySchema.parse({
      response_type: c.req.query('response_type'),
      client_id: c.req.query('client_id'),
      redirect_uri: c.req.query('redirect_uri'),
      scope: c.req.query('scope'),
      state: c.req.query('state'),
    })
    const result = await oauthService.validateAuthorizeRequest(
      query.client_id,
      query.redirect_uri,
      query.scope,
    )
    return c.json({ ...result, redirectUri: query.redirect_uri, state: query.state })
  })

  // POST /api/oauth/authorize — user approves authorization
  oauthHandler.post(
    '/authorize',
    authMiddleware,
    zValidator('json', authorizeApproveSchema),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const user = c.get('user')
      const input = c.req.valid('json')
      const result = await oauthService.approveAuthorization(user.userId, input)

      // Build redirect URL with code
      const url = new URL(input.redirectUri)
      url.searchParams.set('code', result.code)
      if (result.state) {
        url.searchParams.set('state', result.state)
      }
      return c.json({ redirectUrl: url.toString() })
    },
  )

  // ─── Token Endpoint ───────────────────────────────

  // POST /api/oauth/token — exchange code or refresh token
  oauthHandler.post('/token', zValidator('json', tokenExchangeSchema), async (c) => {
    const oauthService = container.resolve('oauthService')
    const input = c.req.valid('json')

    if (input.grant_type === 'authorization_code') {
      const result = await oauthService.exchangeAuthorizationCode(
        input.code,
        input.client_id,
        input.client_secret,
        input.redirect_uri,
      )
      return c.json(result)
    }

    // refresh_token
    const result = await oauthService.refreshAccessToken(
      input.refresh_token,
      input.client_id,
      input.client_secret,
    )
    return c.json(result)
  })

  // ─── UserInfo Endpoint ────────────────────────────

  // GET /api/oauth/userinfo — get user info with OAuth token
  oauthHandler.get('/userinfo', async (c) => {
    const oauthService = container.resolve('oauthService')
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Missing access token' }, 401)
    }
    const token = authHeader.slice(7)
    const result = await oauthService.getUserInfo(token)
    return c.json(result)
  })

  // ─── Consent Management ───────────────────────────

  // GET /api/oauth/consents — list user's authorized apps
  oauthHandler.get('/consents', authMiddleware, async (c) => {
    const oauthService = container.resolve('oauthService')
    const user = c.get('user')
    const result = await oauthService.listUserConsents(user.userId)
    return c.json(result)
  })

  // POST /api/oauth/revoke — revoke consent for an app
  oauthHandler.post(
    '/revoke',
    authMiddleware,
    zValidator('json', revokeConsentSchema),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const user = c.get('user')
      const { appId } = c.req.valid('json')
      await oauthService.revokeConsent(user.userId, appId)
      return c.json({ ok: true })
    },
  )

  // ─── OAuth API Endpoints (token-authenticated) ────

  // GET /api/oauth/servers — list user's servers
  oauthHandler.get(
    '/servers',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['servers:read']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const token = c.get('oauthToken')
      const result = await oauthService.getServers(token.userId)
      return c.json(result)
    },
  )

  // POST /api/oauth/servers — create a server
  oauthHandler.post(
    '/servers',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['servers:write']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const token = c.get('oauthToken')
      const body = await c.req.json<{ name: string; description?: string }>()
      const result = await oauthService.createServer(token.userId, body)
      return c.json(result, 201)
    },
  )

  // POST /api/oauth/servers/:id/invite — invite user to server
  oauthHandler.post(
    '/servers/:id/invite',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['servers:write']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const serverId = c.req.param('id')!
      const body = await c.req.json<{ userId: string }>()
      const result = await oauthService.inviteToServer(serverId, body.userId)
      return c.json(result)
    },
  )

  // GET /api/oauth/servers/:id/channels — list channels
  oauthHandler.get(
    '/servers/:id/channels',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['channels:read']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const serverId = c.req.param('id')!
      const result = await oauthService.getChannels(serverId)
      return c.json(result)
    },
  )

  // POST /api/oauth/channels — create a channel
  oauthHandler.post(
    '/channels',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['channels:write']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const token = c.get('oauthToken')
      const body = await c.req.json<{ serverId: string; name: string; type?: string }>()
      const result = await oauthService.createChannel(token.userId, body)
      return c.json(result, 201)
    },
  )

  // GET /api/oauth/channels/:id/messages — get message history
  oauthHandler.get(
    '/channels/:id/messages',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['messages:read']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const channelId = c.req.param('id')!
      const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined
      const cursor = c.req.query('cursor') ?? undefined
      const result = await oauthService.getMessages(channelId, limit, cursor)
      return c.json(result)
    },
  )

  // POST /api/oauth/channels/:id/messages — send a message
  oauthHandler.post(
    '/channels/:id/messages',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['messages:write']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const token = c.get('oauthToken')
      const channelId = c.req.param('id')!
      const body = await c.req.json<{ content: string }>()
      const result = await oauthService.sendMessage(channelId, token.userId, body)
      return c.json(result, 201)
    },
  )

  // GET /api/oauth/workspaces/:id — get workspace info
  oauthHandler.get(
    '/workspaces/:id',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['workspaces:read']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const workspaceId = c.req.param('id')!
      const result = await oauthService.getWorkspace(workspaceId)
      return c.json(result)
    },
  )

  // POST /api/oauth/buddies — create a Buddy bot
  oauthHandler.post(
    '/buddies',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['buddies:create']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const token = c.get('oauthToken')
      const body = await c.req.json<{ name: string; kernelType?: string }>()
      const result = await oauthService.createBuddy(token.userId, token.appId, body)
      return c.json(result, 201)
    },
  )

  // POST /api/oauth/buddies/:id/messages — Buddy sends a message
  oauthHandler.post(
    '/buddies/:id/messages',
    oauthAuthMiddleware,
    oauthScopeMiddleware(['buddies:manage']),
    async (c) => {
      const oauthService = container.resolve('oauthService')
      const buddyId = c.req.param('id')!
      const body = await c.req.json<{ channelId: string; content: string }>()
      const result = await oauthService.sendBuddyMessage(buddyId, body)
      return c.json(result, 201)
    },
  )

  return oauthHandler
}
