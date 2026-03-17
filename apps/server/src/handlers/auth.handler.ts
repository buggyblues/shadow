import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { authMiddleware } from '../middleware/auth.middleware'
import { loginSchema, registerSchema } from '../validators/auth.schema'
import { forceDisconnectUser } from '../ws/presence.gateway'

export function createAuthHandler(container: AppContainer) {
  const authHandler = new Hono()

  // POST /api/auth/register
  authHandler.post('/register', zValidator('json', registerSchema), async (c) => {
    const authService = container.resolve('authService')
    const input = c.req.valid('json')
    const result = await authService.register(input)
    return c.json(result, 201)
  })

  // POST /api/auth/login
  authHandler.post('/login', zValidator('json', loginSchema), async (c) => {
    const authService = container.resolve('authService')
    const input = c.req.valid('json')
    const result = await authService.login(input)
    return c.json(result)
  })

  // POST /api/auth/refresh
  authHandler.post(
    '/refresh',
    zValidator('json', z.object({ refreshToken: z.string() })),
    async (c) => {
      const authService = container.resolve('authService')
      const { refreshToken } = c.req.valid('json')
      const result = await authService.refresh(refreshToken)
      return c.json(result)
    },
  )

  // GET /api/auth/me
  authHandler.get('/me', authMiddleware, async (c) => {
    const authService = container.resolve('authService')
    const user = c.get('user')
    const result = await authService.getMe(user.userId)
    return c.json(result)
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
      const user = c.get('user')
      const input = c.req.valid('json')
      const result = await authService.updateProfile(user.userId, input)
      return c.json(result)
    },
  )

  // GET /api/auth/users/:id — public user profile (limited fields)
  authHandler.get('/users/:id', authMiddleware, async (c) => {
    const userDao = container.resolve('userDao')
    const agentDao = container.resolve('agentDao')
    const id = c.req.param('id')
    if (!id) {
      return c.json({ error: 'Missing user id' }, 400)
    }
    const user = await userDao.findById(id)
    if (!user) return c.json({ error: 'User not found' }, 404)

    // If the user is a bot, also return agent info + owner profile
    let agent = null
    let ownerProfile: {
      id: string
      username: string
      displayName: string
      avatarUrl: string | null
    } | null = null
    if (user.isBot) {
      agent = await agentDao.findByUserId(user.id)
      if (agent?.ownerId) {
        const owner = await userDao.findById(agent.ownerId)
        if (owner) {
          ownerProfile = {
            id: owner.id,
            username: owner.username,
            displayName: owner.displayName ?? owner.username,
            avatarUrl: owner.avatarUrl,
          }
        }
      }
    }

    // If the user is a regular user, return their owned agents
    let ownedAgents: Array<{
      id: string
      userId: string
      status: string
      totalOnlineSeconds: number
      botUser?: { id: string; username: string; displayName: string; avatarUrl: string | null }
    }> = []
    if (!user.isBot) {
      const agents = await agentDao.findByOwnerId(user.id)
      ownedAgents = await Promise.all(
        agents.map(async (a) => {
          const botUser = await userDao.findById(a.userId)
          return {
            id: a.id,
            userId: a.userId,
            status: a.status,
            totalOnlineSeconds: a.totalOnlineSeconds ?? 0,
            botUser: botUser
              ? {
                  id: botUser.id,
                  username: botUser.username,
                  displayName: botUser.displayName ?? botUser.username,
                  avatarUrl: botUser.avatarUrl,
                }
              : undefined,
          }
        }),
      )
    }

    return c.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? user.username,
      avatarUrl: user.avatarUrl,
      isBot: user.isBot,
      status: user.status,
      createdAt: user.createdAt,
      agent: agent
        ? {
            id: agent.id,
            ownerId: agent.ownerId,
            status: agent.status,
            totalOnlineSeconds: agent.totalOnlineSeconds ?? 0,
            config: { description: (agent.config as Record<string, unknown>)?.description },
          }
        : undefined,
      ownerProfile,
      ownedAgents,
    })
  })

  // GET /api/auth/dashboard — aggregated user stats for dashboard page
  authHandler.get('/dashboard', authMiddleware, async (c) => {
    const user = c.get('user') as { userId: string }
    const userId = user.userId
    const serverDao = container.resolve('serverDao')
    const agentDao = container.resolve('agentDao')
    const walletService = container.resolve('walletService')
    const taskCenterService = container.resolve('taskCenterService')
    const userDao = container.resolve('userDao')

    // Parallel queries for performance
    const [userServers, agents, wallet, taskCenter, referral, userInfo] = await Promise.all([
      serverDao.findByUserId(userId),
      agentDao.findByOwnerId(userId),
      walletService.getOrCreateWallet(userId).catch(() => ({ balance: 0 })),
      taskCenterService
        .getTaskCenter(userId)
        .catch(() => ({ summary: { totalTasks: 0, claimableTasks: 0, completedTasks: 0 } })),
      taskCenterService
        .getReferralSummary(userId)
        .catch(() => ({ successfulInvites: 0, totalInviteRewards: 0 })),
      userDao.findById(userId),
    ])

    const serversOwned = userServers.filter(
      (s: { member: { role: string } }) => s.member.role === 'owner',
    ).length
    const serversJoined = userServers.length

    // Buddy total online time
    const totalBuddyOnlineSeconds = agents.reduce((sum, a) => sum + (a.totalOnlineSeconds ?? 0), 0)

    return c.json({
      serversOwned,
      serversJoined,
      buddyCount: agents.length,
      buddyOnlineHours: Math.round(totalBuddyOnlineSeconds / 3600),
      walletBalance: wallet.balance ?? 0,
      tasksCompleted: taskCenter.summary?.completedTasks ?? 0,
      tasksTotal: taskCenter.summary?.totalTasks ?? 0,
      referralCount: referral.successfulInvites ?? 0,
      referralRewards: referral.totalInviteRewards ?? 0,
      memberSince: userInfo?.createdAt ?? null,
    })
  })

  // POST /api/auth/disconnect — beacon-based disconnect on page close
  authHandler.post('/disconnect', async (c) => {
    try {
      const body = await c.req.json<{ token?: string }>()
      if (body.token) {
        const payload = verifyToken(body.token)
        if (payload.userId) {
          const io = container.resolve('io')
          forceDisconnectUser(payload.userId, io, container)
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
    const url = externalOAuthService.getAuthorizeUrl(provider, redirect)
    return c.redirect(url)
  })

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
      const result = await externalOAuthService.handleCallback(provider, code, state)
      // Redirect to frontend callback page with tokens in hash
      const callbackUrl = `/app/oauth-callback#access_token=${encodeURIComponent(result.accessToken)}&refresh_token=${encodeURIComponent(result.refreshToken)}&redirect=${encodeURIComponent(result.redirect)}`
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
      return c.json({ error: 'Missing accountId' }, 400)
    }
    await externalOAuthService.unlinkAccount(user.userId, accountId)
    return c.json({ ok: true })
  })

  return authHandler
}
