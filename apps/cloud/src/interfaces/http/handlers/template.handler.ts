/**
 * Template handler — list, get, and extract required env vars from templates.
 */

import { Hono } from 'hono'
import type { HandlerContext } from './types.js'

/** Extract all ${env:VAR_NAME} references from a JSON object recursively */
function extractEnvRefs(obj: unknown): string[] {
  const refs = new Set<string>()
  const pattern = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g

  function walk(val: unknown) {
    if (typeof val === 'string') {
      for (const match of val.matchAll(pattern)) {
        const envKey = match[1]
        if (envKey) refs.add(envKey)
      }
    } else if (Array.isArray(val)) {
      for (const item of val) walk(item)
    } else if (val && typeof val === 'object') {
      for (const v of Object.values(val)) walk(v)
    }
  }

  walk(obj)
  return [...refs].sort()
}

export function createTemplateHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  app.get('/templates', async (c) => {
    const locale = c.req.query('locale')
    return c.json(await ctx.container.template.list(locale))
  })

  app.get('/templates/catalog', async (c) => {
    const locale = c.req.query('locale')
    return c.json(await ctx.container.templateI18n.listCatalog(locale))
  })

  app.get('/templates/:name/details', async (c) => {
    const name = c.req.param('name')
    const locale = c.req.query('locale')
    const detail = await ctx.container.templateI18n.getTemplateDetail(name, locale)
    if (!detail) return c.json({ error: `Template not found: ${name}` }, 404)
    return c.json({ template: detail })
  })

  app.get('/templates/:name', async (c) => {
    const name = c.req.param('name')
    const content = await ctx.container.template.getTemplate(name)
    if (!content) return c.json({ error: `Template not found: ${name}` }, 404)
    return c.json(content)
  })

  /** Get required environment variables for a template */
  app.get('/templates/:name/env-refs', async (c) => {
    const name = c.req.param('name')
    const content = await ctx.container.template.getTemplate(name)
    if (!content) return c.json({ error: `Template not found: ${name}` }, 404)
    const refs = extractEnvRefs(content)
    return c.json({ template: name, requiredEnvVars: refs })
  })

  return app
}
