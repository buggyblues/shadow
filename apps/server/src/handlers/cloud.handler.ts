import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { encrypt } from '../lib/kms'
import { authMiddleware } from '../middleware/auth.middleware'

function resolveTemplateI18nDict(
  content: Record<string, unknown>,
  locale: string,
): Record<string, string> {
  const i18n = content.i18n as Record<string, Record<string, string>> | undefined
  if (!i18n) return {}
  const baseLocale = locale.split('-')[0] ?? locale
  return i18n[locale] ?? (baseLocale !== locale ? i18n[baseLocale] : undefined) ?? i18n.en ?? {}
}

function resolveI18nValue(value: unknown, i18nDict: Record<string, string>): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^\$\{i18n:([^}]+)\}$/.exec(value)
  if (!match?.[1]) return value
  return i18nDict[match[1]] ?? value
}

export function createCloudHandler(container: AppContainer) {
  const h = new Hono()

  h.use('*', authMiddleware)

  // ─── Templates ────────────────────────────────────────────────────────────

  h.get('/templates', async (c) => {
    const locale = c.req.query('locale') ?? 'en'
    const dao = container.resolve('cloudTemplateDao')
    const templates = await dao.listApproved()
    return c.json(
      templates.map((template) => {
        const content = template.content as Record<string, unknown>
        const i18nDict = resolveTemplateI18nDict(content, locale)
        return {
          ...template,
          name: template.slug,
          title:
            resolveI18nValue(content.title, i18nDict) ??
            resolveI18nValue(template.name, i18nDict) ??
            template.slug,
          description:
            resolveI18nValue(template.description, i18nDict) ??
            resolveI18nValue(content.description, i18nDict) ??
            null,
        }
      }),
    )
  })

  h.post(
    '/templates',
    zValidator(
      'json',
      z.object({
        slug: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        content: z.record(z.unknown()),
        tags: z.array(z.string()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const dao = container.resolve('cloudTemplateDao')
      const template = await dao.submitCommunity({
        ...input,
        submittedByUserId: user.userId,
      })
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'template_submit',
        meta: { slug: input.slug },
      })
      return c.json(template, 201)
    },
  )

  // ─── Deployments ──────────────────────────────────────────────────────────

  h.get('/deployments', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const dao = container.resolve('cloudDeploymentDao')
    return c.json(await dao.listByUser(user.userId, limit, offset))
  })

  h.post(
    '/deploy',
    zValidator(
      'json',
      z.object({
        namespace: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        clusterId: z.string().uuid().optional(),
        agentCount: z.number().int().min(0).optional(),
        configSnapshot: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const cloudService = container.resolve('cloudService')
      const deployment = await cloudService.createDeployment({
        userId: user.userId,
        ...input,
      })
      return c.json(deployment, 201)
    },
  )

  h.get('/deploy/:deploymentId/stream', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const deploymentDao = container.resolve('cloudDeploymentDao')

    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) {
      return c.json({ ok: false, error: 'Deployment not found' }, 404)
    }

    // Stream existing logs then keep polling for new ones (SSE)
    return c.body(
      new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          const send = (data: unknown) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
          }

          const logs = await deploymentDao.getLogs(deploymentId)
          for (const log of logs) {
            send({ level: log.level, message: log.message, createdAt: log.createdAt })
          }

          // Send current status and close — worker pushes updates separately
          send({ type: 'status', status: deployment.status })
          controller.close()
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    )
  })

  // ─── Configs ──────────────────────────────────────────────────────────────

  h.get('/configs', async (c) => {
    const user = c.get('user') as { userId: string }
    const dao = container.resolve('cloudConfigDao')
    return c.json(await dao.listByUser(user.userId))
  })

  h.post(
    '/configs',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255),
        content: z.record(z.unknown()),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const dao = container.resolve('cloudConfigDao')
      const config = await dao.create({ userId: user.userId, ...input })
      if (!config) return c.json({ ok: false, error: 'Failed to create config' }, 500)
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'config_update',
        meta: { configId: config.id },
      })
      return c.json(config, 201)
    },
  )

  h.put(
    '/configs/:id',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255).optional(),
        content: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const dao = container.resolve('cloudConfigDao')
      const config = await dao.update(id, user.userId, input)
      if (!config) return c.json({ ok: false, error: 'Config not found' }, 404)
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'config_update',
        meta: { configId: id as string },
      })
      return c.json(config)
    },
  )

  h.delete('/configs/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudConfigDao')
    await dao.delete(id, user.userId)
    return c.json({ ok: true })
  })

  // ─── Env Vars ─────────────────────────────────────────────────────────────

  h.get('/env-vars', async (c) => {
    const user = c.get('user') as { userId: string }
    const scope = c.req.query('scope')
    const dao = container.resolve('cloudEnvVarDao')
    const vars = await dao.listByUser(user.userId, scope)
    // Never return decrypted values
    return c.json(
      vars.map((v) => {
        const { encryptedValue: _e, ...rest } = v
        return rest
      }),
    )
  })

  h.post(
    '/env-vars',
    zValidator(
      'json',
      z.object({
        key: z.string().min(1).max(255),
        value: z.string(),
        scope: z.string().optional(),
        groupId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const encryptedValue = encrypt(input.value)
      const dao = container.resolve('cloudEnvVarDao')
      const envVar = await dao.create({
        userId: user.userId,
        key: input.key,
        encryptedValue,
        scope: input.scope,
        groupId: input.groupId,
      })
      if (!envVar) return c.json({ ok: false, error: 'Failed to create env var' }, 500)
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'envvar_update',
        meta: { key: input.key },
      })
      const { encryptedValue: _e2, ...rest } = envVar
      return c.json(rest, 201)
    },
  )

  h.delete('/env-vars/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudEnvVarDao')
    await dao.delete(id, user.userId)
    return c.json({ ok: true })
  })

  // ─── Clusters ─────────────────────────────────────────────────────────────

  h.get('/clusters', async (c) => {
    const user = c.get('user') as { userId: string }
    const dao = container.resolve('cloudClusterDao')
    const clusters = await dao.listByUser(user.userId)
    // Strip encrypted kubeconfig from responses
    return c.json(
      clusters.map((cl) => {
        const { kubeconfigEncrypted: _e, kubeconfigKmsRef: _k, ...rest } = cl
        return rest
      }),
    )
  })

  h.post(
    '/clusters',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255),
        kubeconfig: z.string().min(1),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const cloudService = container.resolve('cloudService')
      const cluster = await cloudService.addCluster({
        userId: user.userId,
        name: input.name,
        kubeconfig: input.kubeconfig,
      })
      const { kubeconfigEncrypted: _e, kubeconfigKmsRef: _k, ...rest } = cluster
      return c.json(rest, 201)
    },
  )

  h.delete('/clusters/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudClusterDao')
    const cluster = await dao.findById(id, user.userId)
    if (!cluster) return c.json({ ok: false, error: 'Cluster not found' }, 404)
    await dao.delete(id, user.userId)
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({ userId: user.userId, type: 'cluster_remove', meta: { clusterId: id } })
    return c.json({ ok: true })
  })

  // ─── Activity ─────────────────────────────────────────────────────────────

  h.get('/activity', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const dao = container.resolve('cloudActivityDao')
    return c.json(await dao.listByUser(user.userId, limit, offset))
  })

  return h
}
