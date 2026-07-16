import { Hono } from 'hono'
import type { TravelHonoEnv } from '../types.js'

export function createHealthHandler() {
  const app = new Hono<TravelHonoEnv>()
  app.get('/health', (c) => c.json({ ok: true, status: 'ok', timestamp: new Date().toISOString() }))
  return app
}
