import { Hono } from 'hono'
import { themeService } from '../service/theme.service.js'
import { err, ok } from '../shared/result.js'

const app = new Hono()

app.get('/api/themes', async (c) => {
  const query = c.req.query('q') || ''
  const category = c.req.query('category') || ''
  const limit = parseInt(c.req.query('limit') || '50')
  const result = await themeService.search(query, category, limit)
  return c.json({ ok: true, data: result.themes, total: result.total })
})

app.get('/api/themes/thumbnails', async (c) => {
  const thumbnails = await themeService.getThumbnails()
  return c.json(ok(thumbnails))
})

app.get('/api/themes/:id', async (c) => {
  const detail = await themeService.getDetail(c.req.param('id'))
  if (!detail) return c.json(err('Theme not found'), 404)
  return c.json(ok(detail))
})

app.get('/api/themes/:id/components', async (c) => {
  const components = await themeService.getComponents(c.req.param('id'))
  if (components === null) return c.json(err('Theme not found'), 404)
  return c.json(ok(components))
})

export default app
