import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import type { AppContainer } from './container'
import { createAdminHandler } from './handlers/admin.handler'
import { createAgentHandler } from './handlers/agent.handler'
import { createAgentDashboardHandler } from './handlers/agent-dashboard.handler'
import { createApiTokenHandler } from './handlers/api-token.handler'
import { createAppIntegrationHandler } from './handlers/app-integration.handler'
import { createAuthHandler } from './handlers/auth.handler'
import { createBuddyInboxHandler } from './handlers/buddy-inbox.handler'
import { createChannelHandler } from './handlers/channel.handler'
import { createCloudHandler } from './handlers/cloud.handler'
import { createCloudExposureHandler } from './handlers/cloud-exposure.handler'
import { createCloudSaasHandler } from './handlers/cloud-saas.handler'
import { createConfigHandler } from './handlers/config.handler'
import { createConnectorHandler } from './handlers/connector.handler'
import { createContentFeedHandler } from './handlers/content-feed.handler'
import { createDesktopReleaseHandler } from './handlers/desktop-release.handler'
import { createDiscoverHandler } from './handlers/discover.handler'
import { createEconomyHandler } from './handlers/economy.handler'
import { createFeatureFlagsHandler } from './handlers/feature-flags.handler'
import { createFriendshipHandler } from './handlers/friendship.handler'
import { createInviteHandler } from './handlers/invite.handler'
import {
  createAttachmentMediaHandler,
  createMediaHandler,
  createSignedMediaHandler,
} from './handlers/media.handler'
import { createMembershipHandler } from './handlers/membership.handler'
import { createMentionHandler } from './handlers/mention.handler'
import { createMessageHandler } from './handlers/message.handler'
import { createModelProxyHandler } from './handlers/model-proxy.handler'
import { createNotificationHandler } from './handlers/notification.handler'
import { createOAuthHandler } from './handlers/oauth.handler'
import { createPaidFileHandler } from './handlers/paid-file.handler'
import { createPlayHandler } from './handlers/play.handler'
import { createProfileCommentHandler } from './handlers/profile-comment.handler'
import { createRechargeHandler } from './handlers/recharge.handler'
import { createRentalHandler } from './handlers/rental.handler'
import { createSearchHandler } from './handlers/search.handler'
import { createServerHandler } from './handlers/server.handler'
import { createShopHandler } from './handlers/shop.handler'
import { createStripeWebhookHandler } from './handlers/stripe-webhook.handler'
import { createTaskCenterHandler } from './handlers/task-center.handler'
import { createVoiceEnhanceHandler } from './handlers/voice-enhance.handler'
import { createVoiceMessageHandler } from './handlers/voice-message.handler'
import { createWorkspaceHandler } from './handlers/workspace.handler'
import { cloudExposureHostFromRequestHost } from './lib/cloud-exposure-gateway'
import { logger } from './lib/logger'
import {
  authMiddleware,
  createPatMiddleware,
  createStoredAgentTokenMiddleware,
} from './middleware/auth.middleware'
import { loggerMiddleware } from './middleware/logger.middleware'
import { securityHeadersMiddleware } from './middleware/security-headers.middleware'

export function createApp(container: AppContainer) {
  const app = new Hono()

  // Global error handler (Hono's onError ensures proper JSON responses)
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const appError = error as {
      status?: number
      code?: string
      params?: Record<string, unknown>
      capability?: string
      membership?: unknown
      requiredAmount?: number
      balance?: number
      shortfall?: number
      nextAction?: string
    }
    const status = appError.status ?? 500
    const errorCode = appError.code ?? (status >= 500 ? 'INTERNAL_ERROR' : undefined)

    logger.error({ err: error, path: c.req.path, method: c.req.method }, message)

    return c.json(
      {
        ok: false,
        error: errorCode ?? message,
        ...(errorCode ? { code: errorCode } : {}),
        ...(appError.params ? { params: appError.params } : {}),
        ...(appError.capability ? { capability: appError.capability } : {}),
        ...(appError.membership ? { membership: appError.membership } : {}),
        ...(typeof appError.requiredAmount === 'number'
          ? { requiredAmount: appError.requiredAmount }
          : {}),
        ...(typeof appError.balance === 'number' ? { balance: appError.balance } : {}),
        ...(typeof appError.shortfall === 'number' ? { shortfall: appError.shortfall } : {}),
        ...(appError.nextAction ? { nextAction: appError.nextAction } : {}),
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

  app.use('*', async (c, next) => {
    const exposureHost = cloudExposureHostFromRequestHost(c.req.header('host'))
    if (!exposureHost) return next()
    const service = container.resolve('cloudExposureService')
    const url = new URL(c.req.url)
    return service.gatewayProxy(exposureHost, c.req.raw, `${url.pathname}${url.search}`)
  })

  // PAT token resolution (must run before route-level authMiddleware)
  app.use('*', createPatMiddleware(container))
  app.use('*', createStoredAgentTokenMiddleware(container))

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // Public desktop release links. These intentionally live outside /api auth so website,
  // SDK, and docs can point users to stable platform-specific desktop downloads.
  app.route('/', createDesktopReleaseHandler())

  // Raw object refs, e.g. /shadow/uploads/file.txt, are intentionally not served directly.
  // Private media must be resolved through /api/attachments/:id/media-url or /api/media/signed/:token,
  // where object-level authorization has already happened before token issuance. Identity images
  // are served through the public avatar route instead of exposing raw object refs.
  app.get('/:bucket/uploads/:filename', authMiddleware, async (c) => {
    return c.json({ ok: false, error: 'File not found' }, 404)
  })

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

  // Token-authenticated media delivery is intentionally outside authenticated /api sub-apps so
  // browser <img>/<a> requests do not need Authorization headers. Mount this before any broad
  // /api handler that uses authMiddleware for all child paths.
  app.route('/api', createSignedMediaHandler(container))

  // Public config endpoints (must be registered before handlers that apply global auth)
  // Feature flags first so /v1/config/flags isn't caught by config's /:schemaName param
  app.route('/api', createFeatureFlagsHandler(container))
  app.route('/api', createConfigHandler(container))

  // API routes
  app.route('/api/auth', createAuthHandler(container))
  app.route('/api/oauth', createOAuthHandler(container))
  app.route('/api/ai/v1', createModelProxyHandler(container))
  app.route('/api/ai/anthropic', createModelProxyHandler(container))
  app.route('/api/play', createPlayHandler(container))
  app.route('/api/tokens', createApiTokenHandler(container))
  // Paid file viewer URLs are authorized by short-lived grant tokens, so this handler must be
  // mounted before broad /api sub-app auth middleware.
  app.route('/api', createPaidFileHandler(container))
  app.route('/api', createAppIntegrationHandler(container))
  // Connector daemon routes use machine-token auth and must be mounted before broad /api
  // handlers that apply user auth middleware to every child path.
  app.route('/api', createConnectorHandler(container))
  // Runtime sidecars authenticate with scoped exposure tokens. Mount before broad /api
  // handlers so user auth middleware does not pre-empt the sidecar token path.
  app.route('/api/cloud/exposures', createCloudExposureHandler(container))
  // Mount workspace before /api/servers so nested /api/servers/:serverId/workspace/*
  // routes are not pre-empted by server auth middleware.
  app.route('/api', createWorkspaceHandler(container))
  app.route('/api/servers', createServerHandler(container))
  app.route('/api', createChannelHandler(container))
  app.route('/api', createBuddyInboxHandler(container))
  app.route('/api', createMentionHandler(container))
  app.route('/api', createVoiceMessageHandler(container))
  app.route('/api', createMessageHandler(container))
  app.route('/api', createContentFeedHandler(container))
  app.route('/api/search', createSearchHandler(container))
  app.route('/api/friends', createFriendshipHandler(container))
  app.route('/api', createAttachmentMediaHandler(container))
  app.route('/api/notifications', createNotificationHandler(container))
  app.route('/api/media', createMediaHandler(container))
  app.route('/api/agents', createAgentHandler(container))
  app.route('/api/agents', createAgentDashboardHandler(container))
  app.route('/api/invite-codes', createInviteHandler(container))
  app.route('/api/membership', createMembershipHandler(container))
  app.route('/api/admin', createAdminHandler(container))
  app.route('/api', createTaskCenterHandler(container))
  app.route('/api', createShopHandler(container))
  app.route('/api/economy', createEconomyHandler(container))
  app.route('/api', createRentalHandler(container))
  app.route('/api/profile-comments', createProfileCommentHandler(container))
  app.route('/api/voice', createVoiceEnhanceHandler(container))

  // Recharge (Stripe) endpoints
  app.route('/api/v1/recharge', createRechargeHandler(container))
  app.route('/api/v1/webhooks/stripe', createStripeWebhookHandler(container))

  // Discover endpoints (public)
  app.route('/api/discover', createDiscoverHandler(container))

  // Cloud SaaS endpoints
  app.route('/api/cloud', createCloudHandler(container))
  app.route('/api/cloud-saas', createCloudSaasHandler(container))

  // 404 handler
  app.notFound((c) => c.json({ ok: false, error: 'Not Found' }, 404))

  return app
}
