import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import type { AppContainer } from './container'
import { createAdminHandler } from './handlers/admin.handler'
import { createAgentHandler } from './handlers/agent.handler'
import { createAgentDashboardHandler } from './handlers/agent-dashboard.handler'
import { createApiTokenHandler } from './handlers/api-token.handler'
import { createAppHandler } from './handlers/app.handler'
import { createAuthHandler } from './handlers/auth.handler'
import { createChannelHandler } from './handlers/channel.handler'
import { createDiscoverHandler } from './handlers/discover.handler'
import { createDmHandler } from './handlers/dm.handler'
import { createFriendshipHandler } from './handlers/friendship.handler'
import { createInviteHandler } from './handlers/invite.handler'
import { createMediaHandler } from './handlers/media.handler'
import { createMessageHandler } from './handlers/message.handler'
import { createNotificationHandler } from './handlers/notification.handler'
import { createOAuthHandler } from './handlers/oauth.handler'
import { createProfileCommentHandler } from './handlers/profile-comment.handler'
import { createRechargeHandler } from './handlers/recharge.handler'
import { createRentalHandler } from './handlers/rental.handler'
import { createSearchHandler } from './handlers/search.handler'
import { createServerHandler } from './handlers/server.handler'
import { createShopHandler } from './handlers/shop.handler'
import { createStripeWebhookHandler } from './handlers/stripe-webhook.handler'
import { createTaskCenterHandler } from './handlers/task-center.handler'
import { createVoiceEnhanceHandler } from './handlers/voice-enhance.handler'
import { createWorkspaceHandler } from './handlers/workspace.handler'
import { logger } from './lib/logger'
import { createPatMiddleware } from './middleware/auth.middleware'
import { loggerMiddleware } from './middleware/logger.middleware'
import { securityHeadersMiddleware } from './middleware/security-headers.middleware'

export function createApp(container: AppContainer) {
  const app = new Hono()

  // Global error handler (Hono's onError ensures proper JSON responses)
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500

    logger.error({ err: error, path: c.req.path, method: c.req.method }, message)

    return c.json(
      {
        ok: false,
        error: status >= 500 ? 'Internal Server Error' : message,
      },
      status as 400,
    )
  })

  // Determine allowed CORS origins
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : process.env.NODE_ENV === 'production'
      ? undefined
      : ['http://localhost:3000']

  if (process.env.NODE_ENV === 'production' && !corsOrigin) {
    throw new Error(
      'CORS_ORIGIN environment variable is required in production. Set it to a comma-separated list of allowed origins.',
    )
  }

  // Global middleware
  app.use(
    '*',
    cors({
      origin: corsOrigin!,
      credentials: true,
    }),
  )
  app.use('*', securityHeadersMiddleware)
  app.use('*', loggerMiddleware)
  app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 })) // 50MB

  // PAT token resolution (must run before route-level authMiddleware)
  app.use('*', createPatMiddleware(container))

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // Public endpoint for homepage / Buddy Market (no auth required)
  app.get('/api/public/marketplace', async (c) => {
    const rentalService = container.resolve('rentalService')
    const sortBy = c.req.query('sortBy') || 'popular'
    const keyword = c.req.query('keyword') || undefined
    const deviceTier = c.req.query('deviceTier') || undefined
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const allowedSort = ['popular', 'newest', 'price-asc', 'price-desc'] as const
    const result = await rentalService.browseListings({
      sortBy: allowedSort.includes(sortBy as (typeof allowedSort)[number])
        ? (sortBy as (typeof allowedSort)[number])
        : 'popular',
      keyword,
      deviceTier:
        deviceTier && ['high_end', 'mid_range', 'low_end'].includes(deviceTier)
          ? deviceTier
          : undefined,
      limit,
      offset,
    })
    return c.json(result)
  })

  // API routes
  app.route('/api/auth', createAuthHandler(container))
  app.route('/api/oauth', createOAuthHandler(container))
  app.route('/api/tokens', createApiTokenHandler(container))
  // IMPORTANT: Mount app/workspace handlers before /api/servers base handler
  // so nested routes like /api/servers/:serverId/apps/* and
  // /api/servers/:serverId/workspace/* are not pre-empted by server auth middleware.
  app.route('/api', createAppHandler(container))
  app.route('/api', createWorkspaceHandler(container))
  app.route('/api/servers', createServerHandler(container))
  app.route('/api', createChannelHandler(container))
  app.route('/api', createMessageHandler(container))
  app.route('/api/search', createSearchHandler(container))
  app.route('/api/dm', createDmHandler(container))
  app.route('/api/friends', createFriendshipHandler(container))
  app.route('/api/notifications', createNotificationHandler(container))
  app.route('/api/media', createMediaHandler(container))
  app.route('/api/agents', createAgentHandler(container))
  app.route('/api/agents', createAgentDashboardHandler(container))
  app.route('/api/invite-codes', createInviteHandler(container))
  app.route('/api/admin', createAdminHandler(container))
  app.route('/api', createTaskCenterHandler(container))
  app.route('/api', createShopHandler(container))
  app.route('/api', createRentalHandler(container))
  app.route('/api/profile-comments', createProfileCommentHandler(container))
  app.route('/api/voice', createVoiceEnhanceHandler(container))

  // Recharge (Stripe) endpoints
  app.route('/api/v1/recharge', createRechargeHandler(container))
  app.route('/api/v1/webhooks/stripe', createStripeWebhookHandler(container))

  // Discover endpoints (public)
  app.route('/api/discover', createDiscoverHandler(container))

  // 404 handler
  app.notFound((c) => c.json({ ok: false, error: 'Not Found' }, 404))

  return app
}
