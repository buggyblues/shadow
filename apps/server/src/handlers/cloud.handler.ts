import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { validateJsonLimits } from '../lib/json-limits'
import { encrypt } from '../lib/kms'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'

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

const K8S_NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/

export function createCloudHandler(container: AppContainer) {
  const h = new Hono()

  h.use('*', authMiddleware)

  // ─── Templates ────────────────────────────────────────────────────────────

  h.get('/templates', async (c) => {
    const locale = c.req.query('locale') ?? 'en'
    const useCase = container.resolve('cloudUseCase')
    const templates = await useCase.listTemplates({ ctx: createActorContext(c.get('actor')) })
    // Apply i18n localization (keeping existing logic in the handler)
    return c.json(
      templates.map((template: Record<string, unknown>) => {
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
      const useCase = container.resolve('cloudUseCase')
      const template = await useCase.submitCommunityTemplate({
        ctx: createActorContext(c.get('actor')),
        payload: { ...input, content: input.content as Record<string, unknown> },
      })
      return c.json(template, 201)
    },
  )

  // ─── Deployments ──────────────────────────────────────────────────────────

  h.get('/deployments', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const useCase = container.resolve('cloudUseCase')
    return c.json(
      await useCase.listDeployments({ ctx: createActorContext(c.get('actor')), limit, offset }),
    )
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
      await container.resolve('membershipService').requireMember(user.userId, 'cloud:deploy')
      if (!K8S_NAMESPACE_RE.test(input.namespace)) {
        return c.json({ ok: false, error: 'Invalid deployment namespace' }, 422)
      }
      if (input.configSnapshot) {
        const limits = validateJsonLimits(input.configSnapshot, {
          maxBytes: 256 * 1024,
          maxDepth: 16,
          maxObjectKeys: 2000,
          maxArrayItems: 500,
        })
        if (!limits.ok) return c.json({ ok: false, error: limits.error }, 413)
      }
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
    const useCase = container.resolve('cloudUseCase')
    const result = await useCase.getDeploymentStream({
      ctx: createActorContext(c.get('actor')),
      deploymentId,
    })

    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 404)
    }

    // Stream existing logs then close (SSE)
    return c.body(
      new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          const send = (data: unknown) => {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
          }

          for (const log of result.logs) {
            send({ level: log.level, message: log.message, createdAt: log.createdAt })
          }

          // Send current status and close
          send({ type: 'status', status: result.deployment.status })
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
    const useCase = container.resolve('cloudUseCase')
    return c.json(await useCase.listConfigs({ ctx: createActorContext(c.get('actor')) }))
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
      const useCase = container.resolve('cloudUseCase')
      const result = await useCase.createConfig({
        ctx: createActorContext(c.get('actor')),
        payload: { name: input.name, content: input.content as Record<string, unknown> },
      })
      if (!result.ok) return c.json({ ok: false, error: result.error }, 500)
      return c.json(result.config, 201)
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
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const useCase = container.resolve('cloudUseCase')
      const result = await useCase.updateConfig({
        ctx: createActorContext(c.get('actor')),
        configId: id as string,
        payload: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.content !== undefined && { content: input.content as Record<string, unknown> }),
        },
      })
      if (!result.ok) return c.json({ ok: false, error: result.error }, 404)
      return c.json(result.config)
    },
  )

  h.delete('/configs/:id', async (c) => {
    const id = c.req.param('id')
    const useCase = container.resolve('cloudUseCase')
    await useCase.deleteConfig({ ctx: createActorContext(c.get('actor')), configId: id as string })
    return c.json({ ok: true })
  })

  // ─── Env Vars ─────────────────────────────────────────────────────────────

  h.get('/env-vars', async (c) => {
    const scope = c.req.query('scope')
    const useCase = container.resolve('cloudUseCase')
    return c.json(await useCase.listEnvVars({ ctx: createActorContext(c.get('actor')), scope }))
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
      const input = c.req.valid('json')
      const useCase = container.resolve('cloudUseCase')
      const result = await useCase.createEnvVar({
        ctx: createActorContext(c.get('actor')),
        key: input.key,
        value: input.value,
        scope: input.scope,
        groupId: input.groupId,
      })
      if (!result.ok) return c.json({ ok: false, error: result.error }, 500)
      return c.json(result.envVar, 201)
    },
  )

  h.delete('/env-vars/:id', async (c) => {
    const id = c.req.param('id')
    const useCase = container.resolve('cloudUseCase')
    await useCase.deleteEnvVar({ ctx: createActorContext(c.get('actor')), envVarId: id as string })
    return c.json({ ok: true })
  })

  // ─── Clusters ─────────────────────────────────────────────────────────────

  h.get('/clusters', async (c) => {
    const useCase = container.resolve('cloudUseCase')
    return c.json(await useCase.listClusters({ ctx: createActorContext(c.get('actor')) }))
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
    const id = c.req.param('id')
    const useCase = container.resolve('cloudUseCase')
    const result = await useCase.deleteCluster({
      ctx: createActorContext(c.get('actor')),
      clusterId: id as string,
    })
    if (!result.ok) return c.json({ ok: false, error: result.error }, 404)
    return c.json({ ok: true })
  })

  // ─── Activity ─────────────────────────────────────────────────────────────

  h.get('/activity', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const useCase = container.resolve('cloudUseCase')
    return c.json(
      await useCase.listActivity({ ctx: createActorContext(c.get('actor')), limit, offset }),
    )
  })

  return h
}
