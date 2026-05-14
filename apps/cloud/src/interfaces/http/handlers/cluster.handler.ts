/**
 * Cluster handler — deployments, scoped env, logs, cost, and scaling.
 */

import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { runtimeStatePvcName } from '../../../runtimes/container.js'
import { GLOBAL_ENV_SCOPE, toDeploymentEnvScope } from '../../../utils/deployment-scope.js'
import { normalizeGroupName } from '../../../utils/env-names.js'
import { redactSecrets } from '../../../utils/redact.js'
import type { HandlerContext } from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function shortHash(value: unknown): string {
  return createHash('sha256').update(stableJsonStringify(value)).digest('hex').slice(0, 16)
}

function readNonEmptyString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function inferTemplateSlugFromConfig(config: unknown): string | null {
  if (!isRecord(config)) return null

  const metadata = isRecord(config.metadata) ? config.metadata : null
  return (
    readNonEmptyString(config, 'templateSlug') ??
    readNonEmptyString(config, 'template') ??
    readNonEmptyString(metadata, 'templateSlug') ??
    readNonEmptyString(metadata, 'template') ??
    readNonEmptyString(metadata, 'sourceTemplateSlug') ??
    readNonEmptyString(config, 'name')
  )
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function localTemplateSlugCandidates(options: {
  namespace: string
  templateSlug?: string | null
  config?: unknown
}): string[] {
  return uniqueNonEmptyStrings([
    options.templateSlug,
    inferTemplateSlugFromConfig(options.config),
    options.namespace,
  ])
}

async function resolveLocalTemplateView(ctx: HandlerContext, slug: string | null) {
  if (!slug) return null

  const localConfig = ctx.configDao.findByName(`tpl:${slug}`)
  if (localConfig) {
    return {
      id: slug,
      slug,
      name: slug,
      description: null,
      source: localConfig.templateSlug?.startsWith('git:') ? 'git' : 'local',
      reviewStatus: 'draft',
      updatedAt: localConfig.updatedAt ?? localConfig.createdAt ?? null,
      ownedByUser: true,
      editable: true,
      contentHash: shortHash(localConfig.content),
    }
  }

  const catalogContent = await ctx.container.template.getTemplate(slug).catch(() => null)
  if (!catalogContent) return null
  const meta = (await ctx.container.template.discover().catch(() => [])).find(
    (item) => item.name === slug,
  )
  return {
    id: slug,
    slug,
    name: meta?.title ?? slug,
    description: meta?.description ?? null,
    source: 'catalog',
    reviewStatus: 'approved',
    updatedAt: null,
    ownedByUser: false,
    editable: false,
    contentHash: shortHash(catalogContent),
  }
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createClusterHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  /**
   * Resolve the effective namespace list: configured namespaces + any
   * namespaces discovered on the cluster via the `managed-by` label.
   * Also includes namespaces from the deployment DB to catch records
   * whose K8S resources may have been cleaned up.
   */
  function resolveNamespaces(): { namespaces: string[]; discoveredNamespaces: string[] } {
    let discovered: string[] = []
    try {
      discovered = ctx.container.k8s.getManagedNamespaces()
    } catch {
      /* kubectl may not be available */
    }

    const dbNamespaces = ctx.deploymentDao
      .findAll()
      .map((deployment) => deployment.namespace)
      .filter(Boolean) as string[]

    const all = new Set([...ctx.namespaces, ...discovered, ...dbNamespaces])
    const namespaces = [...all].sort()
    const discoveredNamespaces = discovered.filter(
      (namespace) => !ctx.namespaces.includes(namespace),
    )

    return { namespaces, discoveredNamespaces }
  }

  function resolvePods(namespace: string, agentId?: string) {
    const allPods = ctx.container.k8s.getPods(namespace)
    return allPods
      .filter((pod) => (agentId ? pod.name.includes(agentId) : true))
      .sort((left, right) => {
        if (left.status === 'Running' && right.status !== 'Running') return -1
        if (right.status === 'Running' && left.status !== 'Running') return 1
        return parseTimestamp(right.age) - parseTimestamp(left.age)
      })
  }

  function resolvePrimaryPod(namespace: string, agentId?: string) {
    return resolvePods(namespace, agentId)[0] ?? null
  }

  function resolveDeploymentState(namespace: string, agentId: string) {
    return ctx.container.k8s
      .getDeployments(namespace)
      .find((deployment) => deployment.name === agentId || deployment.sandboxName === agentId)
  }

  function newestDeploymentId(namespace: string): number | undefined {
    return ctx.deploymentDao.findByNamespace(namespace)[0]?.id
  }

  app.get('/namespaces', (c) => {
    const { namespaces, discoveredNamespaces } = resolveNamespaces()
    return c.json({
      configured: ctx.namespaces,
      discovered: discoveredNamespaces,
      all: namespaces,
    })
  })

  app.get('/deployments', (c) => {
    const { namespaces } = resolveNamespaces()
    const result: unknown[] = []
    for (const namespace of namespaces) {
      try {
        const deployments = ctx.container.k8s.getDeployments(namespace)
        for (const deployment of deployments) {
          result.push({ ...deployment, namespace })
        }
      } catch {
        /* namespace may not exist */
      }
    }
    return c.json(result)
  })

  app.get('/deployments/costs', (c) => {
    const { namespaces } = resolveNamespaces()
    return c.json(ctx.container.usageCost.collectOverview(namespaces))
  })

  app.get('/deployments/:ns/costs', (c) => {
    const namespace = c.req.param('ns')
    return c.json(ctx.container.usageCost.collectNamespace(namespace))
  })

  app.get('/deployments/:ns/manifest', async (c) => {
    const namespace = c.req.param('ns')
    const task = ctx.deploymentDao.findByNamespace(namespace)[0]
    if (!task) {
      return c.json({
        deploymentId: null,
        namespace,
        name: namespace,
        templateSlug: null,
        template: null,
        manifest: null,
        drift: {
          status: 'unlinked',
          templateAvailable: false,
          templateChanged: false,
          deployedTemplateHash: null,
          currentTemplateHash: null,
          configHash: null,
        },
        configSnapshot: null,
      })
    }

    const redactedConfig = task.config
      ? JSON.parse(redactSecrets(JSON.stringify(task.config)))
      : null
    let linkedTemplateSlug =
      localTemplateSlugCandidates({
        namespace,
        templateSlug: task.templateSlug,
        config: task.config,
      })[0] ?? null
    let template: Awaited<ReturnType<typeof resolveLocalTemplateView>> = null
    for (const candidate of localTemplateSlugCandidates({
      namespace,
      templateSlug: task.templateSlug,
      config: task.config,
    })) {
      const found = await resolveLocalTemplateView(ctx, candidate)
      if (found) {
        linkedTemplateSlug = candidate
        template = found
        break
      }
    }
    const configHash = task.config ? shortHash(task.config) : null
    const templateContentHash = template?.contentHash ?? null

    return c.json({
      deploymentId: task.id,
      namespace,
      name: namespace,
      templateSlug: linkedTemplateSlug,
      template,
      manifest: {
        schemaVersion: 1,
        revision: task.version ?? 1,
        manifestId: `local-${task.id}`,
        source: 'snapshot-redeploy',
        generatedAt: task.updatedAt ?? task.createdAt ?? null,
        configHash,
        manifestHash: configHash,
        templateSlug: linkedTemplateSlug,
        templateId: linkedTemplateSlug,
        templateName: template?.name ?? linkedTemplateSlug,
        templateSource: template?.source ?? null,
        templateReviewStatus: template?.reviewStatus ?? null,
        templateUpdatedAt: task.updatedAt ?? task.createdAt ?? null,
        templateContentHash,
      },
      drift: {
        status: linkedTemplateSlug ? (template ? 'unknown' : 'missing-template') : 'unlinked',
        templateAvailable: Boolean(template),
        templateChanged: false,
        deployedTemplateHash: templateContentHash,
        currentTemplateHash: templateContentHash,
        configHash,
      },
      configSnapshot: redactedConfig,
    })
  })

  app.post('/deployments/:ns/template', async (c) => {
    const namespace = c.req.param('ns')
    const task = ctx.deploymentDao.findByNamespace(namespace)[0]
    if (!task?.config) return c.json({ error: 'No config stored for this namespace' }, 404)

    const body = await c.req
      .json<{ name?: string; content?: unknown; templateSlug?: string }>()
      .catch(() => ({}) as { name?: string; content?: unknown; templateSlug?: string })
    const linkedTemplateSlug =
      localTemplateSlugCandidates({
        namespace,
        templateSlug: task.templateSlug,
        config: task.config,
      })[0] ?? null
    const name = body.name?.trim() || linkedTemplateSlug || namespace
    ctx.configDao.upsert(
      `tpl:${name}`,
      body.content ?? task.config,
      linkedTemplateSlug ?? undefined,
    )
    if (task.templateSlug !== name) {
      ctx.deploymentDao.update(task.id, { templateSlug: name })
    }

    return c.json({
      ok: true,
      action: linkedTemplateSlug ? 'updated' : 'forked',
      template: {
        id: name,
        slug: name,
        name,
        source: 'local',
        reviewStatus: 'draft',
        updatedAt: new Date().toISOString(),
      },
      manifest: {
        deploymentId: task.id,
        namespace,
        templateSlug: name,
      },
    })
  })

  app.get('/deployments/:ns/env', (c) => {
    const namespace = c.req.param('ns')
    const scope = toDeploymentEnvScope(namespace)
    const mode = c.req.query('mode') === 'scoped' ? 'scoped' : 'effective'
    const envVars =
      mode === 'scoped'
        ? ctx.envVarDao.findMaskedByScope(scope)
        : ctx.envVarDao.findAllMaskedByScopes([GLOBAL_ENV_SCOPE, scope])

    return c.json({ namespace, scope, mode, envVars })
  })

  app.get('/deployments/:ns/env/:key', (c) => {
    const namespace = c.req.param('ns')
    const key = c.req.param('key')
    const scope = toDeploymentEnvScope(namespace)
    const envVar = ctx.envVarDao.findOne(scope, key)

    if (!envVar) return c.json({ error: 'Environment value not found' }, 404)
    return c.json({ envVar })
  })

  app.put('/deployments/:ns/env', async (c) => {
    const namespace = c.req.param('ns')
    const scope = toDeploymentEnvScope(namespace)

    try {
      const body = await c.req.json<{
        key: string
        value: string
        isSecret?: boolean
        groupName?: string
      }>()

      if (!body.key || body.value === undefined) {
        return c.json({ error: 'key and value are required' }, 400)
      }

      const groupName = normalizeGroupName(body.groupName)
      ctx.envGroupDao.ensure(groupName)
      ctx.envVarDao.upsert(scope, body.key, body.value, body.isSecret ?? true, groupName)

      return c.json({ ok: true, namespace, scope })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  app.delete('/deployments/:ns/env/:key', (c) => {
    const namespace = c.req.param('ns')
    const key = c.req.param('key')
    ctx.envVarDao.delete(toDeploymentEnvScope(namespace), key)
    return c.json({ ok: true })
  })

  app.get('/deployments/:ns/logs', (c) => {
    const namespace = c.req.param('ns')
    const agent = c.req.query('agent')
    const page = clamp(Number.parseInt(c.req.query('page') ?? '1', 10) || 1, 1, 100)
    const limit = clamp(Number.parseInt(c.req.query('limit') ?? '200', 10) || 200, 20, 500)
    const pod = resolvePrimaryPod(namespace, agent)

    if (!pod) {
      const state = agent ? resolveDeploymentState(namespace, agent) : undefined
      if (state?.runtimeState === 'paused') {
        return c.json({
          namespace,
          agent: agent ?? state.name,
          podName: null,
          runtimeState: 'paused',
          lines: [],
          page,
          limit,
          hasMore: false,
        })
      }
      return c.json({ error: 'No pod found for this agent' }, 404)
    }

    try {
      const requestedTail = page * limit
      const allLines = ctx.container.k8s
        .readLogs(namespace, pod.name, { tail: requestedTail, timestamps: true })
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map((line) => redactSecrets(line))

      const start = Math.max(allLines.length - requestedTail, 0)
      const end = Math.max(allLines.length - (page - 1) * limit, 0)
      const lines = allLines.slice(start, end)

      return c.json({
        namespace,
        agent: agent ?? pod.name,
        podName: pod.name,
        page,
        limit,
        lines,
        hasMore: allLines.length >= requestedTail,
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.get('/deployments/:ns/:id/pods', (c) => {
    const namespace = c.req.param('ns')
    const agentId = c.req.param('id')

    try {
      return c.json(resolvePods(namespace, agentId))
    } catch (err) {
      return c.json({ error: String(err) }, 500)
    }
  })

  app.get('/deployments/:ns/:id/logs', (c) => {
    const namespace = c.req.param('ns')
    const agentId = c.req.param('id')
    const pod = resolvePrimaryPod(namespace, agentId)

    if (!pod) {
      const state = resolveDeploymentState(namespace, agentId)
      if (state?.runtimeState === 'paused') {
        return c.json({ error: 'Workload is paused', runtimeState: 'paused' }, 409)
      }
      return c.json({ error: 'No pod found for this agent' }, 404)
    }

    return streamSSE(c, async (stream) => {
      const child = ctx.container.k8s.streamLogs(namespace, pod.name, { follow: true, tail: 200 })
      stream.onAbort(() => {
        child.kill()
      })

      let buffer = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          void stream.writeSSE({ data: JSON.stringify(redactSecrets(line)) })
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          void stream.writeSSE({ data: JSON.stringify(redactSecrets(`[stderr] ${line}`)) })
        }
      })

      await new Promise<void>((resolve) => {
        child.on('close', () => {
          void stream.writeSSE({ event: 'close', data: '{}' })
          resolve()
        })
      })
    })
  })

  app.post('/deployments/:ns/:id/scale', async (c) => {
    const namespace = c.req.param('ns')
    const name = c.req.param('id')

    try {
      const body = await c.req.json<{ replicas: number }>()
      if (typeof body.replicas !== 'number' || body.replicas < 0) {
        return c.json({ error: 'Invalid replicas count' }, 400)
      }

      ctx.container.k8s.scaleDeployment(namespace, name, body.replicas)
      return c.json({ ok: true, name, namespace, replicas: body.replicas })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/deployments/:ns/:id/pause', (c) => {
    const namespace = c.req.param('ns')
    const name = c.req.param('id')

    try {
      ctx.container.k8s.pauseAgentSandbox(namespace, name)
      return c.json({ ok: true, name, namespace, runtimeState: 'paused' })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/deployments/:ns/:id/resume', (c) => {
    const namespace = c.req.param('ns')
    const name = c.req.param('id')

    try {
      ctx.container.k8s.resumeAgentSandbox(namespace, name)
      return c.json({ ok: true, name, namespace, runtimeState: 'resuming' })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.get('/deployments/:ns/:id/backups', (c) => {
    const namespace = c.req.param('ns')
    const name = c.req.param('id')
    return c.json({
      namespace,
      agent: name,
      backups: ctx.deploymentBackupDao.findByAgent(namespace, name),
    })
  })

  app.post('/deployments/:ns/:id/backups', async (c) => {
    const namespace = c.req.param('ns')
    const name = c.req.param('id')
    const state = resolveDeploymentState(namespace, name)
    const body: { driver?: 'volumeSnapshot' | 'restic'; retentionDays?: number } = await c.req
      .json<{ driver?: 'volumeSnapshot' | 'restic'; retentionDays?: number }>()
      .catch(() => ({}))
    const driver = body.driver ?? 'volumeSnapshot'
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = ctx.deploymentBackupDao.create({
      deploymentId: newestDeploymentId(namespace),
      namespace,
      agentId: name,
      sandboxName: state?.sandboxName ?? name,
      pvcName: state?.statePvc ?? runtimeStatePvcName(state?.sandboxName ?? name),
      driver,
      snapshotName: driver === 'volumeSnapshot' ? `${name}-${stamp}` : undefined,
      objectKey: driver === 'restic' ? `${namespace}/${name}/${stamp}` : undefined,
      status: 'pending',
      expiresAt: body.retentionDays
        ? new Date(Date.now() + body.retentionDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
    })

    if (driver !== 'volumeSnapshot') {
      const failed = ctx.deploymentBackupDao.update(backup.id, {
        status: 'failed',
        error: 'restic backups require object storage repository configuration',
      })
      return c.json({ error: failed?.error, backup: failed ?? backup }, 501)
    }

    try {
      await ctx.container.k8s.createVolumeSnapshotBackupAndWait({
        namespace,
        snapshotName: backup.snapshotName ?? `${name}-${stamp}`,
        pvcName: backup.pvcName,
        timeoutMs: 180_000,
      })
      const updated = ctx.deploymentBackupDao.update(backup.id, { status: 'succeeded' })
      return c.json({ ok: true, backup: updated ?? backup }, 201)
    } catch (err) {
      const failed = ctx.deploymentBackupDao.update(backup.id, {
        status: 'failed',
        error: (err as Error).message,
      })
      return c.json({ error: (err as Error).message, backup: failed ?? backup }, 500)
    }
  })

  app.post('/deployments/:ns/:id/restore', async (c) => {
    const namespace = c.req.param('ns')
    const name = c.req.param('id')
    const body: { backupId?: number } = await c.req.json<{ backupId?: number }>().catch(() => ({}))
    const backups = ctx.deploymentBackupDao.findByAgent(namespace, name)
    const backup = body.backupId
      ? backups.find((item) => item.id === body.backupId)
      : backups.find((item) => item.status === 'succeeded')

    if (!backup) {
      return c.json({ error: 'No backup found for this agent' }, 404)
    }
    if (backup.status !== 'succeeded') {
      return c.json({ error: `Cannot restore backup in status "${backup.status}"` }, 422)
    }
    if (backup.driver !== 'volumeSnapshot' || !backup.snapshotName) {
      return c.json({ error: 'Only VolumeSnapshot backups can be restored locally today' }, 422)
    }

    try {
      ctx.container.k8s.pauseAgentSandbox(namespace, name)
      await ctx.container.k8s.waitForAgentSandboxPaused({
        namespace,
        agentName: name,
        timeoutMs: 120_000,
      })
      await ctx.container.k8s.restorePvcFromVolumeSnapshot({
        namespace,
        pvcName: backup.pvcName,
        snapshotName: backup.snapshotName,
        timeoutMs: 180_000,
      })
      ctx.container.k8s.resumeAgentSandbox(namespace, name)
      await ctx.container.k8s.waitForAgentSandboxReady({
        namespace,
        agentName: name,
        timeoutMs: 180_000,
      })
      return c.json({ ok: true, backup, runtimeState: 'running' }, 202)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  return app
}
