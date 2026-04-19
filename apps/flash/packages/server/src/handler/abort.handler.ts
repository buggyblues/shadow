import { Hono } from 'hono'
import { activeRequests } from '../dao/index.js'
import { ok } from '../shared/result.js'

const app = new Hono()

app.post('/api/abort', async (c) => {
  const { requestId } = await c.req.json()
  if (!requestId) return c.json({ ok: false, error: 'Missing requestId' }, 400)

  const controller = activeRequests.get(requestId)
  if (controller) {
    controller.abort()
    activeRequests.delete(requestId)
    console.log(`🛑 Aborted request: ${requestId}`)
    return c.json({ ok: true, aborted: true })
  }
  return c.json({ ok: true, aborted: false, message: 'Request not found or already completed' })
})

app.get('/api/abort/active', (c) => {
  return c.json(ok(Array.from(activeRequests.keys())))
})

export default app
