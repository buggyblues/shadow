/**
 * Deploy handler — deploy, destroy, validate, init, provision, generate.
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { formatDeploymentLogLine } from '../deploy-log-format.js'
import type { HandlerContext } from './types.js'

function cleanupTmpFile(path: string): void {
  try {
    const { unlinkSync } = require('node:fs')
    unlinkSync(path)
  } catch {
    /* ignore */
  }
}

function parseTaskId(raw: string): number | null {
  const taskId = Number(raw)
  return Number.isInteger(taskId) && taskId > 0 ? taskId : null
}

function buildTaskUrl(taskId: number): string {
  return `/deploy-tasks/${taskId}`
}

function buildDonePayload(
  task:
    | {
        status: string
        error: string | null
        namespace: string
        agentCount: number | null
      }
    | null
    | undefined,
): {
  exitCode: number
  error?: string
  result?: {
    namespace?: string
    agentCount?: number
  }
} {
  return {
    exitCode: task?.status === 'deployed' ? 0 : 1,
    ...(task?.error ? { error: task.error } : {}),
    result: {
      namespace: task?.namespace,
      agentCount: task?.agentCount ?? 0,
    },
  }
}

export function createDeployHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  // ── Deploy (SSE) ──────────────────────────────────────────────────────

  app.post('/deploy', async (c) => {
    let config: Record<string, unknown>
    try {
      config = await c.req.json<Record<string, unknown>>()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const task = await ctx.deployTaskManager.start(config)

    return streamSSE(c, async (stream) => {
      let lastLogId = 0

      const sendLog = async (message: string) => {
        await stream.writeSSE({ event: 'log', data: JSON.stringify(message) })
      }

      const flushLogs = async () => {
        const logs = ctx.deploymentLogDao.findByDeploymentIdSince(task.id, lastLogId)
        for (const log of logs) {
          lastLogId = log.id
          await sendLog(formatDeploymentLogLine(log.message, log.createdAt))
        }
      }

      await stream.writeSSE({
        event: 'task',
        data: JSON.stringify({ id: task.id, url: buildTaskUrl(task.id) }),
      })

      await flushLogs()

      const existingTask = ctx.deploymentDao.findById(task.id)
      if (!ctx.deployTaskManager.isActive(task.id)) {
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify(buildDonePayload(existingTask)),
        })
        return
      }

      await new Promise<void>((resolve) => {
        let finished = false

        const finish = async (payload?: ReturnType<typeof buildDonePayload>) => {
          if (finished) return
          finished = true
          await flushLogs()
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify(payload ?? buildDonePayload(ctx.deploymentDao.findById(task.id))),
          })
          resolve()
        }

        const unsubscribe = ctx.deployTaskManager.subscribe(task.id, async (event) => {
          if (event.type === 'log') {
            if (event.data.id <= lastLogId) return
            lastLogId = event.data.id
            await sendLog(formatDeploymentLogLine(event.data.message, event.data.createdAt))
            return
          }

          unsubscribe()
          await finish(event.data)
        })

        void flushLogs().then(async () => {
          if (!ctx.deployTaskManager.isActive(task.id)) {
            unsubscribe()
            await finish()
          }
        })

        stream.onAbort(() => {
          unsubscribe()
          resolve()
        })
      })
    })
  })

  app.get('/deploy-tasks', (c) => {
    const tasks = ctx.deploymentDao.findAll().map((task) => ({
      task,
      url: buildTaskUrl(task.id),
      active: ctx.deployTaskManager.isActive(task.id),
    }))

    return c.json({ tasks })
  })

  app.get('/deploy-tasks/:id', (c) => {
    const taskId = parseTaskId(c.req.param('id'))
    if (!taskId) {
      return c.json({ error: 'Invalid task id' }, 400)
    }

    const task = ctx.deploymentDao.findById(taskId)
    if (!task) {
      return c.json({ error: 'Deployment task not found' }, 404)
    }

    return c.json({
      task,
      url: buildTaskUrl(task.id),
      active: ctx.deployTaskManager.isActive(task.id),
    })
  })

  app.get('/deploy-tasks/:id/stream', (c) => {
    const taskId = parseTaskId(c.req.param('id'))
    if (!taskId) {
      return c.json({ error: 'Invalid task id' }, 400)
    }

    const task = ctx.deploymentDao.findById(taskId)
    if (!task) {
      return c.json({ error: 'Deployment task not found' }, 404)
    }

    return streamSSE(c, async (stream) => {
      let lastLogId = 0

      const writeLog = async (message: string) => {
        await stream.writeSSE({ data: JSON.stringify(message) })
      }

      const flushLogs = async () => {
        const logs = ctx.deploymentLogDao.findByDeploymentIdSince(taskId, lastLogId)
        for (const log of logs) {
          lastLogId = log.id
          await writeLog(formatDeploymentLogLine(log.message, log.createdAt))
        }
      }

      await flushLogs()

      if (!ctx.deployTaskManager.isActive(taskId)) {
        await stream.writeSSE({ event: 'close', data: '{}' })
        return
      }

      await new Promise<void>((resolve) => {
        let closed = false

        const close = async () => {
          if (closed) return
          closed = true
          await flushLogs()
          await stream.writeSSE({ event: 'close', data: '{}' })
          resolve()
        }

        const unsubscribe = ctx.deployTaskManager.subscribe(taskId, async (event) => {
          if (event.type === 'log') {
            if (event.data.id <= lastLogId) return
            lastLogId = event.data.id
            await writeLog(formatDeploymentLogLine(event.data.message, event.data.createdAt))
            return
          }

          unsubscribe()
          await close()
        })

        void flushLogs().then(async () => {
          if (!ctx.deployTaskManager.isActive(taskId)) {
            unsubscribe()
            await close()
          }
        })

        stream.onAbort(() => {
          unsubscribe()
          resolve()
        })
      })
    })
  })

  // ── Redeploy ─────────────────────────────────────────────────────────

  app.post('/deploy-tasks/:id/redeploy', async (c) => {
    const taskId = parseTaskId(c.req.param('id'))
    if (!taskId) return c.json({ error: 'Invalid task id' }, 400)

    const original = ctx.deploymentDao.findById(taskId)
    if (!original) return c.json({ error: 'Deployment task not found' }, 404)
    if (!original.config) return c.json({ error: 'No config stored for this task' }, 400)

    // Allow callers to merge extra envVars for the redeploy
    let envOverrides: Record<string, string> | undefined
    try {
      const body = await c.req.json<{ envVars?: Record<string, string> }>().catch(() => ({}))
      envOverrides = (body as { envVars?: Record<string, string> }).envVars
    } catch {
      /* empty body is fine */
    }

    const config = {
      ...(original.config as Record<string, unknown>),
      ...(envOverrides
        ? {
            envVars: {
              ...((original.config as Record<string, unknown>).envVars as
                | Record<string, string>
                | undefined),
              ...envOverrides,
            },
          }
        : {}),
    }

    const newTask = await ctx.deployTaskManager.start(config)

    return streamSSE(c, async (stream) => {
      let lastLogId = 0

      const sendLog = async (message: string) => {
        await stream.writeSSE({ event: 'log', data: JSON.stringify(message) })
      }

      const flushLogs = async () => {
        const logs = ctx.deploymentLogDao.findByDeploymentIdSince(newTask.id, lastLogId)
        for (const log of logs) {
          lastLogId = log.id
          await sendLog(formatDeploymentLogLine(log.message, log.createdAt))
        }
      }

      await stream.writeSSE({
        event: 'task',
        data: JSON.stringify({
          id: newTask.id,
          url: buildTaskUrl(newTask.id),
          redeployFrom: taskId,
        }),
      })

      await flushLogs()

      if (!ctx.deployTaskManager.isActive(newTask.id)) {
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify(buildDonePayload(ctx.deploymentDao.findById(newTask.id))),
        })
        return
      }

      await new Promise<void>((resolve) => {
        let finished = false
        const finish = async (payload?: ReturnType<typeof buildDonePayload>) => {
          if (finished) return
          finished = true
          await flushLogs()
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify(
              payload ?? buildDonePayload(ctx.deploymentDao.findById(newTask.id)),
            ),
          })
          resolve()
        }
        const unsubscribe = ctx.deployTaskManager.subscribe(newTask.id, async (event) => {
          if (event.type === 'log') {
            if (event.data.id <= lastLogId) return
            lastLogId = event.data.id
            await sendLog(formatDeploymentLogLine(event.data.message, event.data.createdAt))
            return
          }
          unsubscribe()
          await finish(event.data)
        })
        void flushLogs().then(async () => {
          if (!ctx.deployTaskManager.isActive(newTask.id)) {
            unsubscribe()
            await finish()
          }
        })
        stream.onAbort(() => {
          unsubscribe()
          resolve()
        })
      })
    })
  })

  // ── Rollback ────────────────────────────────────────────────────────────

  app.post('/rollback', async (c) => {
    try {
      const body = await c.req.json<{ namespace: string }>()
      const ns = body.namespace
      if (!ns) return c.json({ error: 'namespace is required' }, 400)

      ctx.container.k8s.rolloutUndoAll(ns)
      return c.json({ ok: true, namespace: ns })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  // ── Destroy ─────────────────────────────────────────────────────────────

  app.post('/destroy', async (c) => {
    try {
      const body = await c.req.json<{ namespace?: string; stack?: string }>()
      const ns = body.namespace ?? ctx.namespaces[0] ?? 'shadowob-cloud'
      await ctx.container.deploy.destroy({ namespace: ns, stack: body.stack })
      return c.json({ ok: true, namespace: ns })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  // ── Validate ────────────────────────────────────────────────────────────

  app.post('/validate', async (c) => {
    try {
      const configData = await c.req.json<Record<string, unknown>>()
      const tmpFile = join(tmpdir(), `shadowob-validate-${Date.now()}.json`)
      writeFileSync(tmpFile, JSON.stringify(configData, null, 2), 'utf-8')

      try {
        const { config, violations } = ctx.container.config.validate(tmpFile)
        const refs = ctx.container.config.collectTemplateRefs(config)
        const agents = config.deployments?.agents ?? []
        const configurations = config.registry?.configurations ?? []

        const configIds = new Set(configurations.map((cfg: any) => cfg.id))
        const extendsErrors: string[] = []
        for (const agent of agents) {
          if (agent.configuration.extends && !configIds.has(agent.configuration.extends)) {
            extendsErrors.push(
              `Agent "${agent.id}" extends "${agent.configuration.extends}" not in registry.configurations`,
            )
          }
        }

        return c.json({
          valid: violations.length === 0 && extendsErrors.length === 0,
          agents: agents.length,
          configurations: configurations.length,
          violations: violations.map((v: any) => ({ path: v.path, prefix: v.prefix })),
          extendsErrors,
          templateRefs: {
            env: refs.filter((r: { type: string }) => r.type === 'env').length,
            secret: refs.filter((r: { type: string }) => r.type === 'secret').length,
            file: refs.filter((r: { type: string }) => r.type === 'file').length,
          },
        })
      } finally {
        cleanupTmpFile(tmpFile)
      }
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // ── Init ────────────────────────────────────────────────────────────────

  app.post('/init', async (c) => {
    try {
      const body = await c.req.json<{ template?: string }>()
      const templateName = body.template ?? 'shadowob-cloud'
      const content = ctx.container.template.getTemplate(templateName)
      if (!content) {
        return c.json({ error: `Template not found: ${templateName}` }, 404)
      }

      // Persist the initialized config to DB
      ctx.configDao.upsert('current', content, templateName)

      return c.json(content)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // ── Provision ───────────────────────────────────────────────────────────

  app.post('/provision', async (c) => {
    try {
      const body = await c.req.json<{
        config: Record<string, unknown>
        shadowUrl?: string
        shadowToken?: string
        dryRun?: boolean
      }>()

      const shadowUrl = body.shadowUrl ?? process.env.SHADOW_SERVER_URL
      const shadowToken = body.shadowToken ?? process.env.SHADOW_USER_TOKEN

      if (!shadowUrl || !shadowToken) {
        return c.json({ error: 'shadowUrl and shadowToken are required' }, 400)
      }

      const tmpFile = join(tmpdir(), `shadowob-provision-${Date.now()}.json`)
      writeFileSync(tmpFile, JSON.stringify(body.config, null, 2), 'utf-8')

      try {
        const config = ctx.container.config.parseFile(tmpFile)
        const result = await ctx.container.provision.provision(config, {
          serverUrl: shadowUrl,
          userToken: shadowToken,
          dryRun: body.dryRun,
        })

        return c.json({
          ok: true,
          servers: Object.fromEntries(result.servers),
          channels: Object.fromEntries(result.channels),
          buddies: Object.fromEntries(
            [...result.buddies].map(([id, info]) => [
              id,
              { agentId: info.agentId, userId: info.userId },
            ]),
          ),
        })
      } finally {
        cleanupTmpFile(tmpFile)
      }
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  // ── Generate ────────────────────────────────────────────────────────────

  app.post('/generate/manifests', async (c) => {
    try {
      const body = await c.req.json<{
        config: Record<string, unknown>
        namespace?: string
        shadowUrl?: string
      }>()

      const tmpFile = join(tmpdir(), `shadowob-gen-${Date.now()}.json`)
      writeFileSync(tmpFile, JSON.stringify(body.config, null, 2), 'utf-8')

      try {
        const config = ctx.container.config.parseFile(tmpFile)
        const resolved = ctx.container.config.resolve(config)
        const ns = body.namespace ?? config.deployments?.namespace ?? 'shadowob-cloud'
        const manifests = ctx.container.manifest.build({
          config: resolved,
          namespace: ns,
          shadowServerUrl: body.shadowUrl,
        })
        return c.json({ manifests, count: manifests.length })
      } finally {
        cleanupTmpFile(tmpFile)
      }
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  app.post('/generate/openclaw-config', async (c) => {
    try {
      const body = await c.req.json<{ config: Record<string, unknown>; agentId: string }>()

      const tmpFile = join(tmpdir(), `shadowob-oc-${Date.now()}.json`)
      writeFileSync(tmpFile, JSON.stringify(body.config, null, 2), 'utf-8')

      try {
        const config = ctx.container.config.parseFile(tmpFile)
        const resolved = ctx.container.config.resolve(config)
        const agent = resolved.deployments?.agents?.find((a: any) => a.id === body.agentId)
        if (!agent) {
          return c.json({ error: `Agent "${body.agentId}" not found` }, 404)
        }
        const openclawConfig = ctx.container.config.buildOpenClawConfig(agent, resolved)
        delete openclawConfig._workspaceFiles
        return c.json(openclawConfig)
      } finally {
        cleanupTmpFile(tmpFile)
      }
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  return app
}
