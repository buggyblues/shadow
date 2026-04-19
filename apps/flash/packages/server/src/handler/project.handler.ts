import { Hono } from 'hono'
import { projectService } from '../service/project.service.js'
import { err, ok } from '../shared/result.js'

const app = new Hono()

// ── Project State ──

app.get('/api/project', async (c) => {
  const pid = c.req.query('projectId') || 'default'
  const full = c.req.query('hydrate') === 'full'
  const state = await projectService.load(pid, full)
  if (state) return c.json(ok(state))
  return c.json({ ok: false, data: null })
})

app.put('/api/project', async (c) => {
  const state = await c.req.json()
  if (!state || !state.project) {
    return c.json(err('Invalid state'), 400)
  }
  const pid = ((state as Record<string, unknown>).projectId as string) || 'default'
  const { stateSize } = await projectService.save(pid, state)
  return c.json({ ok: true, stateSize })
})

app.delete('/api/project', async (c) => {
  const pid = c.req.query('projectId') || 'default'
  try {
    await projectService.reset(pid)
    return c.json(ok())
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json(err(msg), 500)
  }
})

// ── Task Logs ──

app.get('/api/tasks/:taskId/logs', async (c) => {
  const pid = c.req.query('projectId') || 'default'
  const taskId = c.req.param('taskId')
  const { logs, count } = await projectService.getTaskLogs(pid, taskId)
  return c.json({ ok: true, taskId, logs, count })
})

app.post('/api/tasks/:taskId/logs', async (c) => {
  const body = (await c.req.json()) as { projectId?: string; logs: string[] }
  const taskId = c.req.param('taskId')
  const pid = body.projectId || 'default'
  const { appended } = await projectService.appendTaskLogs(pid, taskId, body.logs || [])
  return c.json({ ok: true, appended })
})

app.delete('/api/tasks/:taskId/logs', async (c) => {
  const pid = c.req.query('projectId') || 'default'
  const taskId = c.req.param('taskId')
  try {
    await projectService.clearTaskLogs(pid, taskId)
    return c.json(ok())
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json(err(msg), 500)
  }
})

// ── Settings ──

app.get('/api/settings', async (c) => {
  const settings = await projectService.loadSettings()
  return c.json(ok(settings))
})

app.put('/api/settings', async (c) => {
  const body = await c.req.json()
  await projectService.saveSettings(body)
  return c.json(ok())
})

// ── Research Progress ──

app.get('/api/research/progress', async (c) => {
  const projectId = c.req.query('projectId') || 'default'
  const progress = await projectService.loadResearch(projectId)
  return c.json(ok(progress))
})

app.put('/api/research/progress', async (c) => {
  const { projectId, ...progressData } = await c.req.json()
  await projectService.saveResearch(projectId, progressData)
  return c.json(ok())
})

app.post('/api/research/check-duplicate', async (c) => {
  const body = (await c.req.json()) as { projectId: string; topic: string; materialIds?: string[] }
  if (!body.projectId || !body.topic) return c.json(err('Missing projectId or topic'), 400)
  const result = await projectService.checkResearchDuplicate(
    body.projectId,
    body.topic,
    body.materialIds || [],
  )
  return c.json({ ok: true, ...result })
})

export default app
