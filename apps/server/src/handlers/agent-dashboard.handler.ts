import { Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'

export function createAgentDashboardHandler(container: AppContainer) {
  const handler = new Hono()

  handler.use('*', authMiddleware)

  // GET /api/agents/:id/dashboard - Get full dashboard data
  handler.get('/:id/dashboard', async (c) => {
    const agentDashboardService = container.resolve('agentDashboardService')
    const user = c.get('user')
    const agentId = c.req.param('id')

    try {
      const dashboard = await agentDashboardService.getDashboard(agentId, user.userId)
      return c.json(dashboard)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      const message = (err as Error).message ?? 'Internal Server Error'
      return c.json({ ok: false, error: message }, status as 404 | 403 | 500)
    }
  })

  // POST /api/agents/:id/dashboard/events - Add activity event (internal use)
  handler.post('/:id/dashboard/events', async (c) => {
    const agentDashboardService = container.resolve('agentDashboardService')
    const user = c.get('user')
    const agentId = c.req.param('id')
    const body = await c.req.json<{ eventType: string; eventData?: Record<string, unknown> }>()

    try {
      await agentDashboardService.addEvent(agentId, body.eventType, body.eventData ?? {})
      return c.json({ ok: true })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      const message = (err as Error).message ?? 'Internal Server Error'
      return c.json({ ok: false, error: message }, status as 500)
    }
  })

  return handler
}
