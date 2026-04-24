import { zValidator } from '@hono/zod-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { cloudDeployments, cloudTemplates } from '../db/schema'
import {
  prepareCloudSaasConfigSnapshot,
  sanitizeCloudSaasDeployment,
  validateCloudSaasConfigSnapshot,
} from '../lib/cloud-saas-config'
import {
  extractRequiredEnvVars,
  loadCloudConfigSchema,
  summarizeCloudConfigValidation,
} from '../lib/cloud-saas-validation'
import {
  type CostOverviewSummary,
  collectNamespaceCost,
  type NamespaceCostSummary,
} from '../lib/cloud-usage-cost'
import {
  deleteNamespace,
  listManagedNamespaces,
  listPods,
  readPodLogs,
  spawnPodLogStream,
} from '../lib/k8s-cli'
import { decrypt } from '../lib/kms'
import { authMiddleware } from '../middleware/auth.middleware'

// ─── Resource tier cost map (Shrimp Coins / month) ──────────────────────────

const TIER_COST: Record<string, number> = {
  lightweight: 500,
  standard: 1200,
  pro: 2800,
}

function getPrimarySchema(): Record<string, unknown> {
  return loadCloudConfigSchema()
}

function isDeployableTemplateContent(content: unknown): boolean {
  try {
    validateCloudSaasConfigSnapshot(content)
    return true
  } catch {
    return false
  }
}

type DeploymentAgentConfig = {
  id?: unknown
  replicas?: unknown
}

function getDeploymentAgentNames(deployment: {
  name: string
  agentCount?: number | null
  configSnapshot?: unknown
}): string[] {
  const configSnapshot =
    deployment.configSnapshot && typeof deployment.configSnapshot === 'object'
      ? (deployment.configSnapshot as Record<string, unknown>)
      : null
  const deployments = configSnapshot?.deployments as
    | { agents?: DeploymentAgentConfig[] }
    | undefined
  const agentNames = (deployments?.agents ?? [])
    .map((agent) => (typeof agent?.id === 'string' ? agent.id : null))
    .filter((agentName): agentName is string => Boolean(agentName))

  if (agentNames.length > 0) {
    return agentNames
  }

  if ((deployment.agentCount ?? 0) > 1) {
    return Array.from(
      { length: deployment.agentCount ?? 0 },
      (_, index) => `${deployment.name}-${index + 1}`,
    )
  }

  return [deployment.name]
}

function sumNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null)
  return filtered.length > 0 ? filtered.reduce((sum, value) => sum + value, 0) : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isTerminalDeploymentStatus(status: string): boolean {
  return status === 'deployed' || status === 'failed' || status === 'destroyed'
}

function isVisibleDeploymentStatus(status: string): boolean {
  return (
    status === 'pending' ||
    status === 'deploying' ||
    status === 'cancelling' ||
    status === 'deployed' ||
    status === 'destroying'
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createCloudSaasHandler(container: AppContainer) {
  const h = new Hono()

  h.use('*', authMiddleware)

  async function loadGroupNameLookup(userId: string): Promise<Map<string, string>> {
    const envDao = container.resolve('cloudEnvVarDao')
    const groups = await envDao.listGroupsByUser(userId)
    return new Map(groups.map((group) => [group.id, group.name]))
  }

  async function resolveGroupId(userId: string, groupName?: string | null): Promise<string | null> {
    if (!groupName || groupName === 'default') return null

    const envDao = container.resolve('cloudEnvVarDao')
    const existing = await envDao.findGroupByName(userId, groupName)
    if (existing) return existing.id

    const created = await envDao.createGroup({ userId, name: groupName })
    return created?.id ?? null
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  h.get('/schema', (c) => c.json(getPrimarySchema()))

  h.post('/validate', async (c) => {
    try {
      const config = await c.req.json<unknown>()
      return c.json(summarizeCloudConfigValidation(config))
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : 'Invalid request' },
        400,
      )
    }
  })

  /**
   * GET /api/cloud-saas/templates
   * List all approved templates (official + community).
   * Supports optional `category` and `q` (search) query params.
   */
  h.get('/templates', async (c) => {
    const category = c.req.query('category')
    const q = c.req.query('q')?.toLowerCase()
    const dao = container.resolve('cloudTemplateDao')
    let templates = (await dao.listApproved()).filter((template) =>
      isDeployableTemplateContent(template.content),
    )
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
    if (!isDeployableTemplateContent(template.content)) {
      return c.json({ ok: false, error: 'Template is not deployable' }, 422)
    }
    return c.json(template)
  })

  h.get('/templates/:slug/env-refs', async (c) => {
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template || template.reviewStatus !== 'approved') {
      return c.json({ ok: false, error: 'Template not found' }, 404)
    }
    if (!isDeployableTemplateContent(template.content)) {
      return c.json({ ok: false, error: 'Template is not deployable' }, 422)
    }
    return c.json({ template: slug, requiredEnvVars: extractRequiredEnvVars(template.content) })
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
          reviewStatus: 'draft',
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
      if (template.reviewStatus === 'approved' || template.reviewStatus === 'pending') {
        return c.json({ ok: false, error: 'Cannot edit an approved or pending template' }, 422)
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
          // Keep current review status (draft or rejected) — don't auto-submit
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
    if (template.reviewStatus === 'approved') {
      return c.json({ ok: false, error: 'Template already approved' }, 422)
    }
    // Clear reviewNote when resubmitting
    const updated = await dao.updateReviewStatus(template.id, 'pending', null)
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'template_submit',
      meta: { slug },
    })
    return c.json(updated)
  })

  /**
   * DELETE /api/cloud-saas/templates/:slug
   * Delete own community template (any review status).
   * If approved, also removes it from the community store.
   */
  h.delete('/templates/:slug', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    if (template.authorId !== user.userId) {
      return c.json({ ok: false, error: 'Forbidden' }, 403)
    }
    const db = container.resolve('db')
    await db.delete(cloudTemplates).where(eq(cloudTemplates.slug, slug))
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'template_delete',
      meta: { slug, wasApproved: template.reviewStatus === 'approved' },
    })
    return c.json({ ok: true })
  })

  // ─── Deployments ───────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/deployments
   * List current user's deployments (SaaS mode only).
   *
   * If `includeOrphans=1` is supplied, the response also includes a
   * `_orphans` array listing K8s namespaces tagged as managed by Shadow Cloud
   * but with no DB row for the current user. These are typically the result
   * of a DB reset or a worker bug; the dashboard surfaces them so the user
   * can claim or clean them up.
   */
  h.get('/deployments', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const includeOrphans = c.req.query('includeOrphans') === '1'
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(cloudDeployments.createdAt)
      .limit(limit)
      .offset(offset)

    const sanitizedRows = rows.map((row) => sanitizeCloudSaasDeployment(row))

    if (!includeOrphans) {
      return c.json(sanitizedRows)
    }

    const known = new Set(rows.map((r) => r.namespace))
    // Reconcile only against the platform default cluster — BYOK clusters
    // would require iterating users' clusters and decrypting each kubeconfig,
    // which is too heavy for a list endpoint. Orphans on BYOK are detected
    // by the worker's reconcile loop instead.
    const ns = listManagedNamespaces() ?? []
    const orphans = ns.filter((n) => !known.has(n))
    return c.json({ items: sanitizedRows, _orphans: orphans })
  })

  /**
   * GET /api/cloud-saas/deployments/costs
   * Aggregate cost snapshots for all visible SaaS deployments.
   */
  h.get('/deployments/costs', async (c) => {
    const user = c.get('user') as { userId: string }
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(cloudDeployments.createdAt)

    const visibleRows = rows.filter((row) => isVisibleDeploymentStatus(row.status))
    const summaries = await Promise.all(
      visibleRows.map(async (deployment) => {
        const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
        return collectNamespaceCost({
          namespace: deployment.namespace,
          agentNames: getDeploymentAgentNames(deployment),
          billingAmount: deployment.monthlyCost ?? null,
          billingUnit: 'shrimp',
          kubeconfig,
        })
      }),
    )

    const overview: CostOverviewSummary = {
      totalUsd: sumNullable(summaries.map((summary) => summary.totalUsd)),
      billingAmount: sumNullable(summaries.map((summary) => summary.billingAmount)),
      billingUnit: 'shrimp',
      totalTokens: sumNullable(summaries.map((summary) => summary.totalTokens)),
      namespaces: summaries.map((summary) => ({
        namespace: summary.namespace,
        totalUsd: summary.totalUsd,
        billingAmount: summary.billingAmount,
        billingUnit: summary.billingUnit,
        totalTokens: summary.totalTokens,
        agentCount: summary.agents.length,
        availableAgents: summary.availableAgents,
        unavailableAgents: summary.unavailableAgents,
      })),
      generatedAt: new Date().toISOString(),
    }

    return c.json(overview)
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
    return c.json(sanitizeCloudSaasDeployment(deployment))
  })

  h.get('/deployments/:id/costs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
    const summary: NamespaceCostSummary = collectNamespaceCost({
      namespace: deployment.namespace,
      agentNames: getDeploymentAgentNames(deployment),
      billingAmount: deployment.monthlyCost ?? null,
      billingUnit: 'shrimp',
      kubeconfig,
    })

    return c.json(summary)
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
        configSnapshot: z.record(z.unknown()),
        envVars: z.record(z.string()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const db = container.resolve('db')

      // Verify template exists
      const templateDao = container.resolve('cloudTemplateDao')
      const template = await templateDao.findBySlug(input.templateSlug)
      if (!template || template.reviewStatus !== 'approved') {
        return c.json({ ok: false, error: 'Template not found or not approved' }, 404)
      }
      if (!isDeployableTemplateContent(template.content)) {
        return c.json({ ok: false, error: 'Template is not deployable' }, 422)
      }

      let storedConfigSnapshot: Record<string, unknown>
      try {
        storedConfigSnapshot = prepareCloudSaasConfigSnapshot(input.configSnapshot, input.envVars)
      } catch (err) {
        const status =
          typeof (err as { status?: number }).status === 'number'
            ? (err as { status: number }).status
            : 422
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid configSnapshot',
          },
          { status: status as 400 | 404 | 409 | 422 | 500 },
        )
      }

      const baseCost = template.baseCost ?? 0
      const monthlyCost = (TIER_COST[input.resourceTier] ?? 0) + baseCost

      // Deduct Shrimp Coins
      const walletService = container.resolve('walletService')
      const deployRefId = crypto.randomUUID()
      let charged = false
      let deploymentId: string | null = null

      try {
        await walletService.debit(
          user.userId,
          monthlyCost,
          deployRefId,
          'cloud_deploy',
          `部署 ${template.name} (${input.resourceTier})`,
        )
        charged = true

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
          configSnapshot: storedConfigSnapshot,
        })

        if (!deployment) {
          throw new Error('Failed to create deployment')
        }
        deploymentId = deployment.id

        // Set SaaS fields
        const [updated] = await db
          .update(cloudDeployments)
          .set({
            templateSlug: input.templateSlug,
            resourceTier: input.resourceTier,
            monthlyCost,
            saasMode: true,
          })
          .where(eq(cloudDeployments.id, deployment.id))
          .returning()

        if (!updated) {
          throw new Error('Failed to finalize deployment metadata')
        }

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

        return c.json(sanitizeCloudSaasDeployment(updated), 201)
      } catch (err) {
        if (deploymentId) {
          try {
            await db.delete(cloudDeployments).where(eq(cloudDeployments.id, deploymentId))
          } catch (cleanupErr) {
            console.error(
              '[cloud-saas] failed to clean up deployment after create error:',
              cleanupErr,
            )
          }
        }

        if (charged) {
          try {
            await walletService.refund(
              user.userId,
              monthlyCost,
              deployRefId,
              'cloud_deploy',
              `部署退款 ${template.name} (${input.resourceTier})`,
            )
          } catch (refundErr) {
            console.error('[cloud-saas] failed to refund wallet after create error:', refundErr)
          }
        }

        const status =
          typeof (err as { status?: number }).status === 'number'
            ? (err as { status: number }).status
            : 500
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to create deployment',
          },
          { status: status as 400 | 404 | 409 | 422 | 500 },
        )
      }
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
   * POST /api/cloud-saas/deployments/:id/cancel
   * Request cancellation of an in-progress deploy.
   * Worker watches for status='cancelling' and SIGTERMs the deploy subprocess.
   * Allowed when status ∈ {pending, deploying}; otherwise 422.
   */
  h.post('/deployments/:id/cancel', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    if (deployment.status !== 'pending' && deployment.status !== 'deploying') {
      return c.json(
        { ok: false, error: `Cannot cancel deployment in status "${deployment.status}"` },
        422,
      )
    }
    await dao.updateStatus(id, 'cancelling')
    await dao.appendLog(id, '[cancel] User requested cancellation', 'warn')
    return c.json({ ok: true, status: 'cancelling' })
  })

  /**
   * POST /api/cloud-saas/deployments/:id/scale
   * Scale a deployment to a new agent count.
   * Updates agentCount in DB and re-enqueues the deployment so the worker
   * runs a Pulumi update to reconcile the desired agent count.
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
      if (deployment.status === 'deploying' || deployment.status === 'destroying') {
        return c.json({ ok: false, error: 'Deployment is currently in progress' }, 422)
      }

      // Patch the configSnapshot to reflect the new agentCount if possible
      let configSnapshot = deployment.configSnapshot as Record<string, unknown> | null
      if (configSnapshot && typeof configSnapshot === 'object') {
        const deployments = configSnapshot.deployments as Record<string, unknown> | undefined
        if (deployments && Array.isArray(deployments.agents)) {
          // Set replicas on all agents (Pulumi infra program reads this)
          configSnapshot = {
            ...configSnapshot,
            deployments: {
              ...deployments,
              agents: (deployments.agents as Array<Record<string, unknown>>).map((agent) => ({
                ...agent,
                replicas: agentCount,
              })),
            },
          }
        }
      }

      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudDeployments)
        .set({
          agentCount,
          configSnapshot: configSnapshot ?? deployment.configSnapshot,
          status: 'pending', // re-enqueue for worker to apply via Pulumi
          updatedAt: new Date(),
        })
        .where(eq(cloudDeployments.id, id))
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'scale',
        namespace: deployment.namespace,
        meta: { deploymentId: id, agentCount },
      })
      if (!updated) {
        return c.json({ ok: false, error: 'Failed to update deployment' }, 500)
      }
      return c.json(sanitizeCloudSaasDeployment(updated))
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
          const send = (data: unknown, event?: string) =>
            controller.enqueue(
              enc.encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`),
            )

          let sentCount = 0
          let lastStatus: string | null = null

          try {
            while (!c.req.raw.signal.aborted) {
              const logs = await dao.getLogs(id)
              for (const log of logs.slice(sentCount)) {
                send({ level: log.level, message: log.message, createdAt: log.createdAt }, 'log')
              }
              sentCount = logs.length

              const current = await dao.findById(id, user.userId)
              if (!current) {
                send({ error: 'Deployment not found' }, 'error')
                break
              }

              if (current.status !== lastStatus) {
                lastStatus = current.status
                send({ status: current.status }, 'status')
              }

              if (isTerminalDeploymentStatus(current.status)) {
                send(
                  {
                    status: current.status,
                    error: current.errorMessage,
                  },
                  'close',
                )
                break
              }

              await delay(1000)
            }
          } catch (err) {
            send(
              { error: err instanceof Error ? err.message : 'Failed to stream deployment logs' },
              'error',
            )
          } finally {
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          }
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
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
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, deploymentId)
    return c.json(
      vars.map(({ encryptedValue: _e, ...rest }) => ({
        ...rest,
        groupName: rest.groupId ? (groupNames.get(rest.groupId) ?? 'default') : 'default',
      })),
    )
  })

  /**
   * GET /api/cloud-saas/envvars/:deploymentId/:key
   * Get a single env var value for a deployment (decrypted, for editing).
   */
  h.get('/envvars/:deploymentId/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const key = c.req.param('key')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const envDao = container.resolve('cloudEnvVarDao')
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, deploymentId)
    const found = vars.find((v) => v.key === key)
    if (!found) return c.json({ ok: false, error: 'Not found' }, 404)
    const { decrypt } = await import('../lib/kms')
    return c.json({
      envVar: {
        scope: deploymentId,
        key: found.key,
        value: decrypt(found.encryptedValue),
        isSecret: true,
        groupName: found.groupId ? (groupNames.get(found.groupId) ?? 'default') : 'default',
      },
    })
  })

  /**
   * DELETE /api/cloud-saas/envvars/:deploymentId/:key
   * Delete a single env var for a deployment.
   */
  h.delete('/envvars/:deploymentId/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const key = c.req.param('key')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, deploymentId)
    const found = vars.find((v) => v.key === key)
    if (found) await envDao.delete(found.id, user.userId)
    return c.json({ ok: true })
  })

  /**
   * GET /api/cloud-saas/deployments/:id/logs/history
   * Return deployment logs as a plain JSON array (non-streaming).
   */
  h.get('/deployments/:id/logs/history', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const agentParam = c.req.query('agent')
    const podParam = c.req.query('pod')
    const page = clamp(Number.parseInt(c.req.query('page') ?? '1', 10) || 1, 1, 100)
    const limit = clamp(Number.parseInt(c.req.query('limit') ?? '200', 10) || 200, 20, 500)

    if (agentParam || podParam) {
      const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
      const pods = listPods(deployment.namespace, kubeconfig)
      let podName = podParam
      if (!podName && agentParam) {
        podName = pods.find((pod) => pod.name.includes(agentParam))?.name
      }
      if (!podName) {
        podName = pods.find((pod) => pod.status === 'Running')?.name ?? pods[0]?.name
      }

      if (!podName) {
        return c.json({ ok: false, error: 'No pods found for this deployment' }, 404)
      }

      try {
        const requestedTail = page * limit
        const allLines = readPodLogs({
          namespace: deployment.namespace,
          pod: podName,
          tail: requestedTail,
          timestamps: true,
          kubeconfig,
        })
          .split('\n')
          .map((line) => line.trimEnd())
          .filter(Boolean)

        const start = Math.max(allLines.length - requestedTail, 0)
        const end = Math.max(allLines.length - (page - 1) * limit, 0)

        return c.json({
          namespace: deployment.namespace,
          agent: agentParam ?? podName,
          podName,
          page,
          limit,
          lines: allLines.slice(start, end),
          hasMore: allLines.length >= requestedTail,
        })
      } catch (err) {
        return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
      }
    }

    const logs = await dao.getLogs(id)
    return c.json({
      namespace: deployment.namespace,
      agent: deployment.name,
      podName: deployment.name,
      page,
      limit,
      lines: logs.map((l) => (l.level ? `[${l.level.toUpperCase()}] ${l.message}` : l.message)),
      hasMore: false,
    })
  })

  // ─── Live K8s pod inspection (SaaS) ────────────────────────────────────────

  /**
   * Resolve a deployment's effective kubeconfig (BYOK only). Returns null if
   * the deployment uses the platform's default cluster — callers should then
   * spawn kubectl without `--kubeconfig` and rely on the server's KUBECONFIG
   * env var.
   */
  async function resolveKubeconfig(deployment: {
    clusterId: string | null
  }): Promise<string | null> {
    if (!deployment.clusterId) return null
    const clusterDao = container.resolve('cloudClusterDao')
    const cluster = await clusterDao.findByIdOnly(deployment.clusterId)
    if (!cluster?.kubeconfigEncrypted) return null
    return decrypt(cluster.kubeconfigEncrypted)
  }

  /**
   * GET /api/cloud-saas/deployments/:id/pods
   * List pods running in the deployment's namespace, with status snapshot.
   */
  h.get('/deployments/:id/pods', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
    const pods = listPods(deployment.namespace, kubeconfig)
    return c.json({ pods })
  })

  /**
   * GET /api/cloud-saas/deployments/:id/pod-logs?pod=<name>&tail=200
   * Stream live K8s pod logs over Server-Sent Events.
   *
   * Replaces the stub /logs endpoint that only replayed deploy-script output.
   */
  h.get('/deployments/:id/pod-logs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const podParam = c.req.query('pod')
    const agentParam = c.req.query('agent')
    const tail = Math.min(Number(c.req.query('tail')) || 200, 2000)
    const containerParam = c.req.query('container')

    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined

    // If no pod is specified, pick the first running pod in the namespace.
    let pod: string | undefined = podParam
    const pods = listPods(deployment.namespace, kubeconfig)
    if (!pod && agentParam) {
      pod = pods.find((item) => item.name.includes(agentParam))?.name ?? undefined
    }
    if (!pod) {
      pod = pods.find((p) => p.status === 'Running')?.name ?? pods[0]?.name ?? undefined
    }
    if (!pod) {
      return c.json({ ok: false, error: 'No pods found for this deployment' }, 404)
    }

    return c.body(
      new ReadableStream({
        start(controller) {
          const enc = new TextEncoder()
          const send = (payload: unknown, event?: string) =>
            controller.enqueue(
              enc.encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`),
            )

          const { proc, cleanup } = spawnPodLogStream({
            namespace: deployment.namespace,
            pod: pod as string,
            container: containerParam,
            follow: true,
            tail,
            kubeconfig,
          })

          let stdoutBuf = ''
          proc.stdout?.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString('utf-8')
            const lines = stdoutBuf.split('\n')
            stdoutBuf = lines.pop() ?? ''
            for (const line of lines) {
              if (line.length > 0) send({ stream: 'stdout', line })
            }
          })
          proc.stderr?.on('data', (chunk: Buffer) => {
            send({ stream: 'stderr', line: chunk.toString('utf-8').trimEnd() })
          })
          proc.on('close', (code) => {
            send({ exitCode: code ?? 0 }, 'end')
            cleanup()
            controller.close()
          })
          proc.on('error', (err) => {
            send({ error: err.message }, 'error')
            cleanup()
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          })

          // Abort handling: when client disconnects, kill kubectl.
          c.req.raw.signal.addEventListener('abort', () => {
            try {
              proc.kill('SIGTERM')
            } catch {
              /* ignore */
            }
          })
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    )
  })

  /**
   * POST /api/cloud-saas/deployments/orphans/:namespace/claim
   * Adopt a Shadow-Cloud-managed namespace that has no DB row.
   * Creates a `cloud_deployments` row owned by the calling user so they can
   * destroy it through the normal flow.
   */
  h.post('/deployments/orphans/:namespace/claim', async (c) => {
    const user = c.get('user') as { userId: string }
    const namespace = c.req.param('namespace')
    const dao = container.resolve('cloudDeploymentDao')
    const created = await dao.create({
      userId: user.userId,
      namespace,
      name: `orphan-${namespace}`,
      agentCount: 0,
      configSnapshot: null,
    })
    if (!created) {
      return c.json({ ok: false, error: 'Failed to create deployment row' }, 500)
    }
    // Bypass the normal "pending → deploying → deployed" pipeline.
    await dao.updateStatus(created.id, 'deployed')
    await dao.appendLog(created.id, '[reconcile] Adopted orphan namespace', 'info')
    return c.json({ ok: true, deployment: sanitizeCloudSaasDeployment(created) })
  })

  /**
   * POST /api/cloud-saas/deployments/orphans/:namespace/cleanup
   * Force-delete an orphan namespace (no DB row). Admin-only safety check
   * is enforced via the namespace managed labels.
   */
  h.post('/deployments/orphans/:namespace/cleanup', async (c) => {
    const namespace = c.req.param('namespace')
    const managed = listManagedNamespaces() ?? []
    if (!managed.includes(namespace)) {
      return c.json(
        {
          ok: false,
          error: 'Refusing to delete: namespace is not labeled as Shadow Cloud managed',
        },
        422,
      )
    }
    try {
      deleteNamespace(namespace)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
    }
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
        const existing = (await envDao.listByUser(user.userId, deploymentId)).find(
          (v) => v.key === key,
        )
        if (existing) {
          await envDao.update(existing.id, user.userId, encryptedValue)
          continue
        }
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

  // NOTE: POST /wallet/topup intentionally removed.
  // Top-ups must go through Stripe (POST /api/v1/recharge/create-intent).
  // For dev/demo top-ups, see POST /api/admin/wallet/grant (admin-only,
  // additionally guarded by ENABLE_DEV_TOPUP=1).

  /**
   * GET /api/cloud-saas/wallet/transactions
   * Return transaction history for the current user's wallet.
   */
  h.get('/wallet/transactions', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const walletService = container.resolve('walletService')
    const [transactions, total] = await Promise.all([
      walletService.getTransactions(user.userId, limit, offset),
      walletService.getTransactionCount(user.userId),
    ])
    return c.json({ transactions, total, limit, offset })
  })

  // ─── Global Env Vars (not scoped to a single deployment) ──────────────────

  /**
   * GET /api/cloud-saas/global-envvars
   * List global env vars (groups + entries) for the current user.
   */
  h.get('/global-envvars', async (c) => {
    const user = c.get('user') as { userId: string }
    const envDao = container.resolve('cloudEnvVarDao')
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, 'global')
    const persistedGroups = await envDao.listGroupsByUser(user.userId)
    const groups: string[] = [
      'default',
      ...persistedGroups.map((group) => group.name),
      ...vars
        .map((v) => (v.groupId ? groupNames.get(v.groupId) : 'default'))
        .filter((groupName): groupName is string => Boolean(groupName && groupName !== 'default')),
    ]
    return c.json({
      envVars: vars.map(({ encryptedValue: _e, ...rest }) => ({
        scope: rest.scope ?? 'global',
        key: rest.key,
        maskedValue: '****',
        isSecret: true,
        groupName: rest.groupId ? (groupNames.get(rest.groupId) ?? 'default') : 'default',
      })),
      groups: [...new Set(groups)],
    })
  })

  h.post(
    '/global-envvars/groups',
    zValidator('json', z.object({ name: z.string().min(1).max(255) })),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { name } = c.req.valid('json')
      const envDao = container.resolve('cloudEnvVarDao')
      const existing = await envDao.findGroupByName(user.userId, name)
      if (existing) {
        return c.json({ ok: true, name: existing.name })
      }
      const created = await envDao.createGroup({ userId: user.userId, name })
      if (!created) {
        return c.json({ ok: false, error: 'Failed to create env group' }, 500)
      }
      return c.json({ ok: true, name: created.name })
    },
  )

  h.delete('/global-envvars/groups/:name', async (c) => {
    const user = c.get('user') as { userId: string }
    const name = c.req.param('name')
    const envDao = container.resolve('cloudEnvVarDao')
    await envDao.deleteGroupByName(user.userId, name)
    return c.json({ ok: true })
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
      const resolvedGroupId = await resolveGroupId(user.userId, groupName)
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
          groupId: resolvedGroupId,
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
    const groupNames = await loadGroupNameLookup(user.userId)
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
        groupName: found.groupId ? (groupNames.get(found.groupId) ?? 'default') : 'default',
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
