/**
 * Config handler — read/write config (DB-backed with filesystem fallback).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import type { HandlerContext } from './types.js'

export function createConfigHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  app.get('/config', (c) => {
    const pathParam = c.req.query('path')

    // If explicit path is given, read from filesystem (backward compat)
    if (pathParam) {
      const absPath = resolve(pathParam)
      if (!existsSync(absPath)) {
        return c.json({ error: `Config file not found: ${absPath}` }, 404)
      }
      try {
        const raw = readFileSync(absPath, 'utf-8')
        return c.json({ path: absPath, content: raw })
      } catch (err) {
        return c.json({ error: (err as Error).message }, 500)
      }
    }

    // Read from DB
    const configRow = ctx.configDao.findByName('current')
    if (configRow) {
      return c.json({
        path: `db://configs/${configRow.id}`,
        content: JSON.stringify(configRow.content, null, 2),
      })
    }

    // Fallback: read from default filesystem path
    const defaultPath = resolve('shadowob-cloud.json')
    if (existsSync(defaultPath)) {
      const raw = readFileSync(defaultPath, 'utf-8')
      return c.json({ path: defaultPath, content: raw })
    }

    return c.json({ error: 'No config found. Initialize from a template first.' }, 404)
  })

  app.put('/config', async (c) => {
    try {
      const body = await c.req.json<{ path?: string; content: string }>()

      // Validate JSON before saving
      const parsed = JSON.parse(body.content)

      // If explicit path, write to filesystem (backward compat)
      if (body.path && !body.path.startsWith('db://')) {
        const filePath = resolve(body.path)
        mkdirSync(resolve(filePath, '..'), { recursive: true })
        writeFileSync(filePath, body.content, 'utf-8')
        return c.json({ ok: true, path: filePath })
      }

      // Write to DB
      const templateSlug = parsed.templateSlug ?? parsed.metadata?.template ?? undefined
      ctx.configDao.upsert('current', parsed, templateSlug)
      return c.json({ ok: true, path: 'db://configs/current' })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // JSON Schema endpoint — drives Monaco autocomplete in the console
  app.get('/schema', (c) => {
    const schemaPath = resolve(
      fileURLToPath(import.meta.url),
      '..',
      '..',
      '..',
      '..',
      'schemas',
      'config.schema.json',
    )
    if (!existsSync(schemaPath)) {
      return c.json({ error: 'Schema file not found. Run pnpm generate:schema first.' }, 404)
    }
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))
    return c.json(schema)
  })

  return app
}
