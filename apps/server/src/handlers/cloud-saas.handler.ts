import { zValidator } from '@hono/zod-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { cloudDeployments, cloudTemplates } from '../db/schema'
import { authMiddleware } from '../middleware/auth.middleware'

// ─── Resource tier cost map (Shrimp Coins / month) ──────────────────────────

const TIER_COST: Record<string, number> = {
  lightweight: 500,
  standard: 1200,
  pro: 2800,
}

export function createCloudSaasHandler(container: AppContainer) {
  const h = new Hono()

  h.use('*', authMiddleware)

  // ─── Templates ─────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/templates
   * List all approved templates (official + community).
   * Supports optional `category` and `q` (search) query params.
   */
  h.get('/templates', async (c) => {
    const category = c.req.query('category')
    const q = c.req.query('q')?.toLowerCase()
    const dao = container.resolve('cloudTemplateDao')
    let templates = await dao.listApproved()
    if (category) {
      templates = templates.filter((t) => t.category === category)
    }
    if (q) {
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.tags as string[] | null)?.some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    return c.json(templates)
  })

  /**
   * GET /api/cloud-saas/templates/mine
   * List templates authored by the current user (any review status).
   */
  h.get('/templates/mine', async (c) => {
    const user = c.get('user') as { userId: string }
    const db = container.resolve('db')
    const { eq, and, ne } = await import('drizzle-orm')
    const templates = await db
      .select()
      .from(cloudTemplates)
      .where(and(eq(cloudTemplates.authorId, user.userId), ne(cloudTemplates.source, 'official')))
      .orderBy(cloudTemplates.updatedAt)
    return c.json(templates)
  })

  /**
   * GET /api/cloud-saas/templates/mine/:slug
   * Get a single template authored by the current user (any review status).
   */
  h.get('/templates/mine/:slug', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const db = container.resolve('db')
    const { eq, and, ne } = await import('drizzle-orm')
    const [template] = await db
      .select()
      .from(cloudTemplates)
      .where(
        and(
          eq(cloudTemplates.slug, slug),
          eq(cloudTemplates.authorId, user.userId),
          ne(cloudTemplates.source, 'official'),
        ),
      )
      .limit(1)
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    return c.json(template)
  })

  /**
   * GET /api/cloud-saas/templates/:slug
   * Get a single approved template by slug.
   */
  h.get('/templates/:slug', async (c) => {
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template || template.reviewStatus !== 'approved') {
      return c.json({ ok: false, error: 'Template not found' }, 404)
    }
    return c.json(template)
  })

  /**
   * POST /api/cloud-saas/templates
   * Submit a new community template (pending review).
   */
  h.post(
    '/templates',
    zValidator(
      'json',
      z.object({
        slug: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase kebab-case'),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        content: z.record(z.unknown()),
        tags: z.array(z.string()).optional(),
        category: z.string().max(64).optional(),
        baseCost: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const dao = container.resolve('cloudTemplateDao')
      const existing = await dao.findBySlug(input.slug)
      if (existing) {
        return c.json({ ok: false, error: 'Template slug already exists' }, 409)
      }
      const db = container.resolve('db')
      const [template] = await db
        .insert(cloudTemplates)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          content: input.content,
          tags: input.tags ?? [],
          source: 'community',
          reviewStatus: 'pending',
          submittedByUserId: user.userId,
          authorId: user.userId,
          category: input.category ?? null,
          baseCost: input.baseCost ?? null,
        })
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'template_submit',
        meta: { slug: input.slug },
      })
      return c.json(template, 201)
    },
  )

  /**
   * PUT /api/cloud-saas/templates/:slug
   * Update own community template (only if still pending or rejected).
   */
  h.put(
    '/templates/:slug',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        content: z.record(z.unknown()).optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().max(64).optional(),
        baseCost: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const slug = c.req.param('slug')
      const input = c.req.valid('json')
      const dao = container.resolve('cloudTemplateDao')
      const template = await dao.findBySlug(slug)
      if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
      if (template.authorId !== user.userId) {
        return c.json({ ok: false, error: 'Forbidden' }, 403)
      }
      if (template.reviewStatus === 'approved') {
        return c.json({ ok: false, error: 'Cannot edit an approved template' }, 422)
      }
      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudTemplates)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.content !== undefined && { content: input.content }),
          ...(input.tags !== undefined && { tags: input.tags }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.baseCost !== undefined && { baseCost: input.baseCost }),
          reviewStatus: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(cloudTemplates.slug, slug))
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'template_update',
        meta: { slug },
      })
      return c.json(updated)
    },
  )

  /**
   * POST /api/cloud-saas/templates/:slug/submit
   * Re-submit a draft/rejected template for review.
   */
  h.post('/templates/:slug/submit', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    if (template.authorId !== user.userId) return c.json({ ok: false, error: 'Forbidden' }, 403)
    if (template.reviewStatus === 'pending') {
      return c.json({ ok: false, error: 'Already pending review' }, 422)
    }
    const updated = await dao.updateReviewStatus(template.id, 'pending')
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'template_submit',
      meta: { slug },
    })
    return c.json(updated)
  })

  // ─── Deployments ───────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/deployments
   * List current user's deployments (SaaS mode only).
   */
  h.get('/deployments', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(cloudDeployments.createdAt)
      .limit(limit)
      .offset(offset)
    return c.json(rows)
  })

  /**
   * GET /api/cloud-saas/deployments/:id
   * Get deployment detail.
   */
  h.get('/deployments/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    return c.json(deployment)
  })

  /**
   * POST /api/cloud-saas/deployments
   * Create a new SaaS deployment. Deducts Shrimp Coins from the user's wallet.
   */
  h.post(
    '/deployments',
    zValidator(
      'json',
      z.object({
        namespace: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        templateSlug: z.string().min(1),
        resourceTier: z.enum(['lightweight', 'standard', 'pro']),
        agentCount: z.number().int().min(0).optional(),
        configSnapshot: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')

      // Verify template exists
      const templateDao = container.resolve('cloudTemplateDao')
      const template = await templateDao.findBySlug(input.templateSlug)
      if (!template || template.reviewStatus !== 'approved') {
        return c.json({ ok: false, error: 'Template not found or not approved' }, 404)
      }

      const baseCost = template.baseCost ?? 0
      const monthlyCost = (TIER_COST[input.resourceTier] ?? 0) + baseCost

      // Deduct Shrimp Coins
      const walletService = container.resolve('walletService')
      const deployRefId = crypto.randomUUID()
      await walletService.debit(
        user.userId,
        monthlyCost,
        deployRefId,
        'cloud_deploy',
        `部署 ${template.name} (${input.resourceTier})`,
      )

      // Get or use platform cluster
      const clusterDao = container.resolve('cloudClusterDao')
      const clusters = await clusterDao.listByUser(user.userId)
      const platformCluster = clusters.find((cl) => cl.isPlatform) ?? null

      // Create deployment record
      const deploymentDao = container.resolve('cloudDeploymentDao')
      const deployment = await deploymentDao.create({
        userId: user.userId,
        clusterId: platformCluster?.id ?? null,
        namespace: input.namespace,
        name: input.name,
        agentCount: input.agentCount,
        configSnapshot: input.configSnapshot,
      })

      // Set SaaS fields
      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudDeployments)
        .set({
          templateSlug: input.templateSlug,
          resourceTier: input.resourceTier,
          monthlyCost,
          saasMode: true,
        })
        .where(eq(cloudDeployments.id, deployment!.id))
        .returning()

      // Increment template deploy_count
      await db
        .update(cloudTemplates)
        .set({ deployCount: sql`${cloudTemplates.deployCount} + 1` })
        .where(eq(cloudTemplates.slug, input.templateSlug))

      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'deploy',
        namespace: input.namespace,
        meta: { templateSlug: input.templateSlug, resourceTier: input.resourceTier, monthlyCost },
      })

      return c.json(updated, 201)
    },
  )

  /**
   * DELETE /api/cloud-saas/deployments/:id
   * Delete a SaaS deployment.
   */
  h.delete('/deployments/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    await dao.updateStatus(id, 'destroying')
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'destroy',
      namespace: deployment.namespace,
      meta: { deploymentId: id },
    })
    return c.json({ ok: true })
  })

  /**
   * POST /api/cloud-saas/deployments/:id/scale
   * Scale a deployment to a new agent count.
   */
  h.post(
    '/deployments/:id/scale',
    zValidator('json', z.object({ agentCount: z.number().int().min(0).max(50) })),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const id = c.req.param('id')
      const { agentCount } = c.req.valid('json')
      const dao = container.resolve('cloudDeploymentDao')
      const deployment = await dao.findById(id, user.userId)
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudDeployments)
        .set({ agentCount, updatedAt: new Date() })
        .where(eq(cloudDeployments.id, id))
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'scale',
        namespace: deployment.namespace,
        meta: { deploymentId: id, agentCount },
      })
      return c.json(updated)
    },
  )

  /**
   * GET /api/cloud-saas/deployments/:id/logs
   * Stream deployment logs (SSE).
   */
  h.get('/deployments/:id/logs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    return c.body(
      new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          const send = (data: unknown) =>
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
          const logs = await dao.getLogs(id)
          for (const log of logs) {
            send({ level: log.level, message: log.message, createdAt: log.createdAt })
          }
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

  // ─── Env Vars ──────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/envvars/:deploymentId
   * Read env vars scoped to a deployment (values masked).
   */
  h.get('/envvars/:deploymentId', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, deploymentId)
    return c.json(vars.map(({ encryptedValue: _e, ...rest }) => rest))
  })

  /**
   * PUT /api/cloud-saas/envvars/:deploymentId
   * Upsert env vars for a deployment.
   */
  h.put(
    '/envvars/:deploymentId',
    zValidator(
      'json',
      z.object({
        vars: z.array(z.object({ key: z.string().min(1), value: z.string() })),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const deploymentId = c.req.param('deploymentId')
      const { vars } = c.req.valid('json')
      const deploymentDao = container.resolve('cloudDeploymentDao')
      const deployment = await deploymentDao.findById(deploymentId, user.userId)
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      const { encrypt } = await import('../lib/kms')
      const envDao = container.resolve('cloudEnvVarDao')
      for (const { key, value } of vars) {
        const encryptedValue = encrypt(value)
        await envDao.create({
          userId: user.userId,
          key,
          encryptedValue,
          scope: deploymentId,
        })
      }
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'envvar_update',
        meta: { deploymentId, count: vars.length },
      })
      return c.json({ ok: true })
    },
  )

  // ─── Wallet / Balance ──────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/wallet
   * Return current user's Shrimp Coin balance.
   */
  h.get('/wallet', async (c) => {
    const user = c.get('user') as { userId: string }
    const walletService = container.resolve('walletService')
    const wallet = await walletService.getOrCreateWallet(user.userId)
    return c.json({ balance: wallet?.balance ?? 0 })
  })

  /**
   * POST /api/cloud-saas/wallet/topup
   * Top up the user's Shrimp Coin balance (dev/demo only).
   */
  h.post(
    '/wallet/topup',
    zValidator('json', z.object({ amount: z.number().int().min(1).max(100000) })),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { amount } = c.req.valid('json')
      const walletService = container.resolve('walletService')
      const wallet = await walletService.topUp(user.userId, amount, '虾币充值')
      return c.json({ ok: true, balance: wallet?.balance ?? 0 })
    },
  )

  // ─── Global Env Vars (not scoped to a single deployment) ──────────────────

  /**
   * GET /api/cloud-saas/global-envvars
   * List global env vars (groups + entries) for the current user.
   */
  h.get('/global-envvars', async (c) => {
    const user = c.get('user') as { userId: string }
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, 'global')
    const groups: string[] = [
      'default',
      ...new Set(vars.map((v) => v.groupId ?? 'default').filter((g) => g !== 'default')),
    ]
    return c.json({
      envVars: vars.map(({ encryptedValue: _e, ...rest }) => ({
        scope: rest.scope ?? 'global',
        key: rest.key,
        maskedValue: '****',
        isSecret: true,
        groupName: rest.groupId ?? 'default',
      })),
      groups,
    })
  })

  /**
   * PUT /api/cloud-saas/global-envvars
   * Upsert a single global env var.
   */
  h.put(
    '/global-envvars',
    zValidator(
      'json',
      z.object({
        key: z.string().min(1),
        value: z.string(),
        isSecret: z.boolean().optional(),
        groupName: z.string().optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { key, value, isSecret: _isSecret, groupName } = c.req.valid('json')
      const { encrypt } = await import('../lib/kms')
      const envDao = container.resolve('cloudEnvVarDao')
      // Delete existing entry with same key first (upsert pattern)
      const existing = await envDao.listByUser(user.userId, 'global')
      const found = existing.find((v) => v.key === key)
      if (found) {
        await envDao.update(found.id, user.userId, encrypt(value))
      } else {
        await envDao.create({
          userId: user.userId,
          key,
          encryptedValue: encrypt(value),
          scope: 'global',
          groupId: null,
        })
      }
      return c.json({ ok: true })
    },
  )

  /**
   * DELETE /api/cloud-saas/global-envvars/:key
   * Delete a global env var.
   */
  h.delete('/global-envvars/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const key = c.req.param('key')
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, 'global')
    const found = vars.find((v) => v.key === key)
    if (found) await envDao.delete(found.id, user.userId)
    return c.json({ ok: true })
  })

  /**
   * GET /api/cloud-saas/global-envvars/:key
   * Get a single global env var (value decrypted for display in edit form).
   */
  h.get('/global-envvars/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const key = c.req.param('key')
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, 'global')
    const found = vars.find((v) => v.key === key)
    if (!found) return c.json({ ok: false, error: 'Not found' }, 404)
    const { decrypt } = await import('../lib/kms')
    return c.json({
      envVar: {
        scope: 'global',
        key: found.key,
        value: decrypt(found.encryptedValue),
        isSecret: true,
        groupName: found.groupId ?? 'default',
      },
    })
  })

  // ─── Activity ──────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/activity
   * Current user's cloud activity log.
   */
  h.get('/activity', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const dao = container.resolve('cloudActivityDao')
    return c.json(await dao.listByUser(user.userId, limit, offset))
  })

  return h
}
