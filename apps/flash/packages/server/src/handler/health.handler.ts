import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'flash-server', version: '1.0.0', timestamp: Date.now() }),
)

export default app
