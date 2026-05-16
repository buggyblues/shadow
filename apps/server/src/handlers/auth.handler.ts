import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { getRedisClient, presenceKeys } from '../lib/redis'
import { authMiddleware } from '../middleware/auth.middleware'
import { createRateLimitMiddleware } from '../middleware/rate-limit.middleware'
import {
  changePasswordSchema,
  emailLoginStartSchema,
  emailLoginVerifySchema,
  googleIdTokenSchema,
  loginSchema,
  registerSchema,
} from '../validators/auth.schema'
import { forceDisconnectUser } from '../ws/presence.gateway'

const OAUTH_REDIRECT_BASE = process.env.OAUTH_BASE_URL ?? 'http://localhost:3000'

async function resolveLiveUserStatus(
  userId: string,
  fallback: 'online' | 'idle' | 'dnd' | 'offline',
): Promise<'online' | 'idle' | 'dnd' | 'offline'> {
  try {
    const redis = await getRedisClient()
    if (!redis) return fallback
    const sockets = await redis.sCard(presenceKeys.onlineSockets(userId))
    return sockets > 0 ? 'online' : fallback
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to resolve live user presence')
    return fallback
  }
}

async function resolveSignedMediaUrl(
  mediaService: {
    resolveMediaUrl: (
      mediaUrl: string | null | undefined,
      fallbackContentType?: string,
      options?: { variant?: 'avatar' | 'preview' | 'banner' },
    ) => string | null
  },
  mediaUrl: string | null | undefined,
  options?: { variant?: 'avatar' | 'preview' | 'banner' },
): Promise<string | null> {
  return mediaService.resolveMediaUrl(mediaUrl, 'image/png', options)
}

function requestDeviceInfo(c: { req: { header: (name: string) => string | undefined } }) {
  const userAgent = c.req.header('user-agent') ?? null
  const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  const ipAddress = forwardedFor ?? c.req.header('x-real-ip') ?? null
  const deviceName = c.req.header('x-shadow-device-name') ?? null
  return { userAgent, ipAddress, deviceName }
}

export function createAuthHandler(container: AppContainer) {
  const authHandler = new Hono()
  const authEntryRateLimit = createRateLimitMiddleware({
    namespace: 'auth-entry',
    windowMs: 60_000,
    limit: 20,
  })
  const emailCodeRateLimit = createRateLimitMiddleware({
    namespace: 'auth-email-code',
    windowMs: 10 * 60_000,
    limit: 5,
  })

  // POST /api/auth/register
  authHandler.post(
    '/register',
    authEntryRateLimit,
    zValidator('json', registerSchema),
    async (c) => {
      const authService = container.resolve('authService')
      const mediaService = container.resolve('mediaService')
      const input = c.req.valid('json')
      const result = await authService.register(input, requestDeviceInfo(c))
      const userAvatarUrl = await resolveSignedMediaUrl(mediaService, result.user.avatarUrl, {
        variant: 'avatar',
      })
      return c.json(
        {
          ...result,
          user: {
            ...result.user,
            avatarUrl: userAvatarUrl,
          },
        },
        201,
      )
    },
  )

  // POST /api/auth/login
  authHandler.post('/login', authEntryRateLimit, zValidator('json', loginSchema), async (c) => {
    const authService = container.resolve('authService')
    const mediaService = container.resolve('mediaService')
    const input = c.req.valid('json')
    const result = await authService.login(input, requestDeviceInfo(c))
    const userAvatarUrl = await resolveSignedMediaUrl(mediaService, result.user.avatarUrl, {
      variant: 'avatar',
    })
    return c.json({
      ...result,
      user: {
        ...result.user,
        avatarUrl: userAvatarUrl,
      },
    })
  })

  // POST /api/auth/email/start — send a one-time email verification code
  authHandler.post(
    '/email/start',
    emailCodeRateLimit,
    zValidator('json', emailLoginStartSchema),
    async (c) => {
      const authService = container.resolve('authService')
      const input = c.req.valid('json')
      const result = await authService.startEmailLogin(input)
      return c.json(result)
    },
  )

  // POST /api/auth/email/verify — verify code and sign in or create a visitor account
  authHandler.post(
    '/email/verify',
    authEntryRateLimit,
    zValidator('json', emailLoginVerifySchema),
    async (c) => {
      const authService = container.resolve('authService')
      const mediaService = container.resolve('mediaService')
      const input = c.req.valid('json')
      const result = await authService.verifyEmailLogin(input, requestDeviceInfo(c))
      const userAvatarUrl = await resolveSignedMediaUrl(mediaService, result.user.avatarUrl, {
        variant: 'avatar',
      })
      return c.json({
        ...result,
        user: {
          ...result.user,
          avatarUrl: userAvatarUrl,
        },
      })
    },
  )

  // POST /api/auth/google/id-token — Google One Tap credential login
  authHandler.post(
    '/google/id-token',
    authEntryRateLimit,
    zValidator('json', googleIdTokenSchema),
    async (c) => {
      const externalOAuthService = container.resolve('externalOAuthService')
      const { credential } = c.req.valid('json')
      const result = await externalOAuthService.handleGoogleIdToken(
        credential,
        requestDeviceInfo(c),
      )
      return c.json(result)
    },
  )

  // POST /api/auth/refresh
  authHandler.post(
    '/refresh',
    zValidator('json', z.object({ refreshToken: z.string() })),
    async (c) => {
      const authService = container.resolve('authService')
      const { refreshToken } = c.req.valid('json')
      const result = await authService.refresh(refreshToken, requestDeviceInfo(c))
      return c.json(result)
    },
  )

  // GET /api/auth/me
  authHandler.get('/me', authMiddleware, async (c) => {
    const authService = container.resolve('authService')
    const mediaService = container.resolve('mediaService')
    const user = c.get('user')
    const result = await authService.getMe(user.userId)
    const status = await resolveLiveUserStatus(result.id, result.status)
    const avatarUrl = await resolveSignedMediaUrl(mediaService, result.avatarUrl, {
      variant: 'avatar',
    })
    return c.json({ ...result, status, avatarUrl })
  })

  // PATCH /api/auth/me — update profile
  authHandler.patch(
    '/me',
    authMiddleware,
    zValidator(
      'json',
      z.object({
        displayName: z.string().max(64).optional(),
        avatarUrl: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const authService = container.resolve('authService')
      const mediaService = container.resolve('mediaService')
      const user = c.get('user')
      const input = c.req.valid('json')
      const result = await authService.updateProfile(user.userId, {
        ...input,
        ...(input.avatarUrl !== undefined
          ? { avatarUrl: mediaService.normalizeMediaUrl(input.avatarUrl) }
          : {}),
      })
      const avatarUrl = await resolveSignedMediaUrl(mediaService, result.avatarUrl, {
        variant: 'avatar',
      })
      return c.json({ ...result, avatarUrl })
    },
  )

  // PUT /api/auth/password — change password
  authHandler.put(
    '/password',
    authMiddleware,
    zValidator('json', changePasswordSchema),
    async (c) => {
      const authService = container.resolve('authService')
      const user = c.get('user')
      const input = c.req.valid('json')
      // Extract IP and User-Agent for logging
      const ipAddress =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip')
      const userAgent = c.req.header('user-agent')
      await authService.changePassword(user.userId, input, {
        ipAddress,
        userAgent,
      })
      return c.json({ ok: true })
    },
  )

  // GET /api/auth/users/:id — public user profile (limited fields)
  authHandler.get('/users/:id', authMiddleware, async (c) => {
    const authUseCase = container.resolve('authUseCase')
    const actor = c.get('actor')
    const id = c.req.param('id')
    if (!id) {
      return c.json({ ok: false, error: 'Missing user id' }, 400)
    }
    const result = await authUseCase.getUserPublicProfile(actor, id)
    if (!result) return c.json({ ok: false, error: 'User not found' }, 404)
    return c.json(result)
  })

  // GET /api/auth/dashboard — aggregated user stats for dashboard page
  authHandler.get('/dashboard', authMiddleware, async (c) => {
    const authUseCase = container.resolve('authUseCase')
    const actor = c.get('actor')
    const result = await authUseCase.getDashboard(actor)
    return c.json(result)
  })

  // GET /api/auth/sessions — list devices/sessions for the current user
  authHandler.get('/sessions', authMiddleware, async (c) => {
    const authService = container.resolve('authService')
    const user = c.get('user')
    return c.json(await authService.listSessions(user.userId, user.sessionId))
  })

  // DELETE /api/auth/sessions/:sessionId — revoke a device/session
  authHandler.delete('/sessions/:sessionId', authMiddleware, async (c) => {
    const authService = container.resolve('authService')
    const io = container.resolve('io')
    const user = c.get('user')
    const sessionId = c.req.param('sessionId')
    if (!sessionId) {
      return c.json({ ok: false, error: 'Missing sessionId' }, 400)
    }
    const session = await authService.revokeSession(user.userId, sessionId)
    io.to(`session:${session.id}`).emit('auth:session-revoked', {
      sessionId: session.id,
      current: user.sessionId === session.id,
    })
    return c.json({ ok: true })
  })

  // POST /api/auth/disconnect — beacon-based disconnect on page close
  authHandler.post('/disconnect', async (c) => {
    try {
      const body = await c.req.json<{ token?: string }>()
      if (body.token) {
        const payload = verifyToken(body.token, 'access')
        if (payload.userId) {
          const io = container.resolve('io')
          forceDisconnectUser(payload.userId, io, container, null)
        }
      }
    } catch {
      // Silently ignore — beacon fires on best-effort basis
    }
    return c.json({ ok: true })
  })

  // ─── External OAuth (Google, GitHub) ──────────────

  // GET /api/auth/oauth/:provider — redirect to provider login
  authHandler.get('/oauth/:provider', (c) => {
    const externalOAuthService = container.resolve('externalOAuthService')
    const provider = c.req.param('provider')
    const redirect = c.req.query('redirect')
    const inviteCode = c.req.query('inviteCode')
    const url = externalOAuthService.getAuthorizeUrl(provider, redirect, inviteCode)
    return c.redirect(url)
  })

  // GET /api/auth/oauth/:provider/link — connect a Google/GitHub account to the logged-in user
  authHandler.get('/oauth/:provider/link', authMiddleware, (c) => {
    const externalOAuthService = container.resolve('externalOAuthService')
    const provider = c.req.param('provider')
    const redirect = c.req.query('redirect')
    const user = c.get('user')
    if (!provider) {
      return c.json({ ok: false, error: 'Missing provider' }, 400)
    }
    const url = externalOAuthService.getLinkAuthorizeUrl(provider, user.userId, redirect)
    return c.redirect(url)
  })

  // POST /api/auth/oauth/:provider/link — returns a provider URL for clients using bearer auth
  authHandler.post(
    '/oauth/:provider/link',
    authMiddleware,
    zValidator('json', z.object({ redirect: z.string().optional() })),
    (c) => {
      const externalOAuthService = container.resolve('externalOAuthService')
      const provider = c.req.param('provider')
      const { redirect } = c.req.valid('json')
      const user = c.get('user')
      if (!provider) {
        return c.json({ ok: false, error: 'Missing provider' }, 400)
      }
      const url = externalOAuthService.getLinkAuthorizeUrl(provider, user.userId, redirect)
      return c.json({ url })
    },
  )

  // GET /api/auth/oauth/:provider/callback — provider callback
  authHandler.get('/oauth/:provider/callback', async (c) => {
    const externalOAuthService = container.resolve('externalOAuthService')
    const provider = c.req.param('provider')
    const code = c.req.query('code')
    const state = c.req.query('state')

    if (!code) {
      return c.redirect('/app/login?error=oauth_failed')
    }

    try {
      const result = await externalOAuthService.handleCallback(
        provider,
        code,
        state,
        requestDeviceInfo(c),
      )

      if (result.mode === 'link') {
        const redirectUrl = new URL(result.redirect, OAUTH_REDIRECT_BASE)
        redirectUrl.searchParams.set('oauth', 'linked')
        redirectUrl.searchParams.set('provider', result.provider)
        return c.redirect(
          result.redirect.startsWith('/')
            ? `${redirectUrl.pathname}${redirectUrl.search}`
            : redirectUrl.toString(),
        )
      }

      // Check if this is a mobile OAuth flow (redirect starts with custom scheme like shadow://)
      if (
        result.redirect.startsWith('shadow://') ||
        result.redirect.startsWith('com.shadowob.mobile://')
      ) {
        // Mobile: redirect with tokens as query params for deep linking
        const callbackUrl = `${result.redirect}?access_token=${encodeURIComponent(
          result.accessToken,
        )}&refresh_token=${encodeURIComponent(result.refreshToken)}`
        return c.redirect(callbackUrl)
      }

      // Web: redirect to frontend callback page with tokens in hash
      const callbackUrl = `/app/oauth-callback#access_token=${encodeURIComponent(
        result.accessToken,
      )}&refresh_token=${encodeURIComponent(
        result.refreshToken,
      )}&redirect=${encodeURIComponent(result.redirect)}${
        result.inviteCode ? `&invite_code=${encodeURIComponent(result.inviteCode)}` : ''
      }`
      return c.redirect(callbackUrl)
    } catch (error) {
      logger.warn({ err: error, provider }, 'External OAuth callback failed')
      return c.redirect('/app/login?error=oauth_failed')
    }
  })

  // GET /api/auth/oauth/accounts — list linked OAuth accounts
  authHandler.get('/oauth/accounts', authMiddleware, async (c) => {
    const externalOAuthService = container.resolve('externalOAuthService')
    const user = c.get('user')
    const result = await externalOAuthService.listLinkedAccounts(user.userId)
    return c.json(result)
  })

  // DELETE /api/auth/oauth/accounts/:accountId — unlink an OAuth account
  authHandler.delete('/oauth/accounts/:accountId', authMiddleware, async (c) => {
    const externalOAuthService = container.resolve('externalOAuthService')
    const user = c.get('user')
    const { accountId } = c.req.param()
    if (!accountId) {
      return c.json({ ok: false, error: 'Missing accountId' }, 400)
    }
    await externalOAuthService.unlinkAccount(user.userId, accountId)
    return c.json({ ok: true })
  })

  return authHandler
}
