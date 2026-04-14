/**
 * Cluster handler — deployments, scoped env, logs, cost, and scaling.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { GLOBAL_ENV_SCOPE, toDeploymentEnvScope } from '../../../utils/deployment-scope.js'
import { normalizeGroupName } from '../../../utils/env-names.js'
import { redactSecrets } from '../../../utils/redact.js'
import type { HandlerContext } from './types.js'

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

  return app
}
