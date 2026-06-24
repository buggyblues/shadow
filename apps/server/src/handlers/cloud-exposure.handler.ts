import { zValidator } from '@hono/zod-validator'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { validateJsonLimits } from '../lib/json-limits'
import { type CloudExposureTokenPayload, verifyCloudExposureToken } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth.middleware'
import type { Actor } from '../security/actor'

declare module 'hono' {
  interface ContextVariableMap {
    cloudExposureToken: CloudExposureTokenPayload
  }
}

const exposurePolicySchema = z
  .object({
    rateLimit: z
      .object({
        requestsPerMinute: z.number().int().min(1).max(60_000).optional(),
        burst: z.number().int().min(1).max(60_000).optional(),
      })
      .optional(),
    bodyLimitBytes: z
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024)
      .optional(),
    allowedMethods: z.array(z.string().min(1).max(16)).max(16).optional(),
    allowIframe: z.boolean().optional(),
  })
  .optional()

const runtimeReconcileSchema = z.object({
  deploymentId: z.string().uuid(),
  agentId: z.string().min(1).max(255),
  desiredRevision: z.string().max(128).optional(),
  exposures: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        port: z.number().int().min(1).max(65535),
        kind: z.enum(['http_service', 'server_app']).optional(),
        displayName: z.string().max(255).optional(),
        visibility: z.enum(['private', 'signed', 'public']).optional(),
        auth: z.enum(['shadow_session', 'signed_link', 'server_app', 'none']).optional(),
        ttlSeconds: z
          .number()
          .int()
          .min(60)
          .max(24 * 60 * 60)
          .optional(),
        healthPath: z.string().max(255).optional(),
        appKey: z.string().max(128).optional(),
        manifestPath: z.string().max(255).optional(),
        policy: exposurePolicySchema,
      }),
    )
    .max(32),
})

const publishSchema = z.object({
  deploymentId: z.string().uuid(),
  agentId: z.string().min(1).max(255),
  serverId: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  manifest: z.unknown().optional(),
  manifestUrl: z.string().url().optional(),
  appKey: z.string().max(128).optional(),
  sourcePath: z.string().max(1024).optional(),
  statePaths: z.array(z.string().max(1024)).max(64).optional(),
  visibility: z.enum(['private', 'signed', 'public']).optional(),
  releaseMode: z.enum(['preview', 'promoted', 'installed']).optional(),
  install: z.boolean().optional(),
  defaultPermissions: z.array(z.string().min(1).max(255)).max(128).optional(),
  defaultApprovalMode: z.enum(['none', 'first_time', 'every_time', 'policy']).optional(),
  buddyGrants: z
    .array(
      z.object({
        buddyAgentId: z.string().uuid(),
        permissions: z.array(z.string().min(1).max(255)).max(128),
        approvalMode: z.enum(['none', 'first_time', 'every_time', 'policy']).optional(),
      }),
    )
    .max(32)
    .optional(),
  backupOnPublish: z.boolean().optional(),
  backupPolicy: z
    .object({
      statePaths: z.array(z.string().max(1024)).max(64).default([]),
      schedule: z.string().max(255).optional(),
      retain: z.number().int().min(1).max(365).optional(),
      backupOnPublish: z.boolean().optional(),
      driver: z.enum(['metadata', 'volumeSnapshot', 'restic', 'git']).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
})

const statusQuerySchema = z.object({
  deploymentId: z.string().uuid().optional(),
  serverId: z.string().min(1).max(255).optional(),
})

const backupSchema = z
  .object({
    deploymentId: z.string().uuid().optional(),
    serverId: z.string().min(1).max(255).optional(),
    deploymentBackupId: z.string().uuid().optional(),
  })
  .default({})

const restoreSchema = z.object({
  deploymentId: z.string().uuid().optional(),
  serverId: z.string().min(1).max(255).optional(),
  backupSetId: z.string().uuid(),
  strategy: z.enum(['in_place', 'new_release']).optional(),
  createSafetyBackup: z.boolean().optional(),
})

const unpublishSchema = z
  .object({
    deploymentId: z.string().uuid().optional(),
    serverId: z.string().min(1).max(255).optional(),
    uninstall: z.boolean().optional(),
  })
  .default({})

function enforceJsonLimits(value: unknown, label: string) {
  const limits = validateJsonLimits(value, {
    maxBytes: 512 * 1024,
    maxDepth: 16,
    maxObjectKeys: 4000,
    maxArrayItems: 1000,
  })
  if (!limits.ok) {
    throw Object.assign(new Error(`${label}: ${limits.error}`), { status: 413 })
  }
}

async function cloudExposureOrActorAuth(c: Context, next: Next): Promise<Response | undefined> {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = verifyCloudExposureToken(authHeader.slice(7))
      c.set('cloudExposureToken', token)
      await next()
      return c.res
    } catch {
      // Fall back to normal user/agent/PAT auth.
    }
  }
  return authMiddleware(c, next)
}

function actorFromContext(c: Context) {
  return c.get('actor') as Actor
}

export function createCloudExposureHandler(container: AppContainer) {
  const h = new Hono()

  h.post(
    '/runtime/reconcile',
    cloudExposureOrActorAuth,
    zValidator('json', runtimeReconcileSchema),
    async (c) => {
      const input = c.req.valid('json')
      enforceJsonLimits(input, 'runtime exposure desired state')
      const service = container.resolve('cloudExposureService')
      let sidecar: CloudExposureTokenPayload | undefined
      try {
        sidecar = c.get('cloudExposureToken')
      } catch {
        sidecar = undefined
      }
      return c.json(
        await service.reconcileRuntimeExposures(input, {
          sidecar,
          actor: sidecar ? undefined : actorFromContext(c),
        }),
      )
    },
  )

  h.post('/server-apps/publish', authMiddleware, zValidator('json', publishSchema), async (c) => {
    const input = c.req.valid('json')
    enforceJsonLimits(input.manifest ?? input.metadata ?? {}, 'cloud app publish payload')
    const service = container.resolve('cloudExposureService')
    return c.json(await service.publishApp(actorFromContext(c), input), 201)
  })

  h.get(
    '/server-apps/:appKey/status',
    authMiddleware,
    zValidator('query', statusQuerySchema),
    async (c) => {
      const service = container.resolve('cloudExposureService')
      return c.json(
        await service.status(actorFromContext(c), c.req.param('appKey'), c.req.valid('query')),
      )
    },
  )

  h.post(
    '/server-apps/:appKey/backup',
    authMiddleware,
    zValidator('json', backupSchema),
    async (c) => {
      const service = container.resolve('cloudExposureService')
      return c.json(
        await service.backup(actorFromContext(c), c.req.param('appKey'), c.req.valid('json')),
        202,
      )
    },
  )

  h.post(
    '/server-apps/:appKey/restore',
    authMiddleware,
    zValidator('json', restoreSchema),
    async (c) => {
      const service = container.resolve('cloudExposureService')
      return c.json(
        await service.restore(actorFromContext(c), c.req.param('appKey'), c.req.valid('json')),
        202,
      )
    },
  )

  h.post(
    '/server-apps/:appKey/unpublish',
    authMiddleware,
    zValidator('json', unpublishSchema),
    async (c) => {
      const service = container.resolve('cloudExposureService')
      return c.json(
        await service.unpublish(actorFromContext(c), c.req.param('appKey'), c.req.valid('json')),
      )
    },
  )

  h.get('/gateway/manifest/:host', async (c) => {
    const service = container.resolve('cloudExposureService')
    return c.json(await service.gatewayManifest(c.req.param('host')))
  })

  h.all('/gateway/:host', authMiddleware, async (c) => {
    const service = container.resolve('cloudExposureService')
    return service.gatewayProxy(c.req.param('host')!, c.req.raw, new URL(c.req.url).search || '/')
  })

  h.all('/gateway/:host/*', authMiddleware, async (c) => {
    const service = container.resolve('cloudExposureService')
    const rest = c.req.param('*')
    const search = new URL(c.req.url).search
    return service.gatewayProxy(c.req.param('host')!, c.req.raw, `/${rest}${search}`)
  })

  return h
}
