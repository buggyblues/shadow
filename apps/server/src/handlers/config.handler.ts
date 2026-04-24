import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { configSchemas, configValues } from '../db/schema'
import { getRedisClient } from '../lib/redis'
import { authMiddleware } from '../middleware/auth.middleware'

const CONFIG_CACHE_TTL = 300 // 5 minutes

function cacheKey(name: string, env: string) {
  return `config:v1:${name}:${env}`
}

async function invalidateCache(name: string, env: string) {
  const redis = await getRedisClient()
  if (redis) {
    await redis.del(cacheKey(name, env))
  }
}

export function createConfigHandler(container: AppContainer) {
  const app = new Hono()

  // ── Admin-only middleware ──────────────────────────────────────────────────
  const adminApp = new Hono()
  adminApp.use('*', authMiddleware)
  adminApp.use('*', async (c, next) => {
    const user = c.get('user') as { userId: string }
    const userDao = container.resolve('userDao')
    const dbUser = await userDao.findById(user.userId)
    if (!dbUser?.isAdmin) {
      return c.json({ ok: false, error: 'Forbidden: admin access required' }, 403)
    }
    await next()
  })

  // ── Schema CRUD ───────────────────────────────────────────────────────────

  // GET /admin/api/config/schemas
  adminApp.get('/schemas', async (c) => {
    const db = container.resolve('db')
    const rows = await db.select().from(configSchemas).orderBy(desc(configSchemas.updatedAt))
    return c.json(rows)
  })

  // POST /admin/api/config/schemas
  adminApp.post(
    '/schemas',
    zValidator(
      'json',
      z.object({
        name: z
          .string()
          .min(1)
          .regex(/^[a-z0-9-]+$/, 'Lowercase kebab-case only'),
        displayName: z.string().min(1),
        description: z.string().optional(),
        jsonSchema: z.record(z.unknown()),
        uiSchema: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const db = container.resolve('db')
      const body = c.req.valid('json')
      const [row] = await db
        .insert(configSchemas)
        .values({
          name: body.name,
          displayName: body.displayName,
          description: body.description,
          jsonSchema: body.jsonSchema,
          uiSchema: body.uiSchema ?? {},
        })
        .returning()
      return c.json(row, 201)
    },
  )

  // GET /admin/api/config/schemas/:id
  adminApp.get('/schemas/:id', async (c) => {
    const db = container.resolve('db')
    const [row] = await db
      .select()
      .from(configSchemas)
      .where(eq(configSchemas.id, c.req.param('id')))
    if (!row) return c.json({ ok: false, error: 'Not found' }, 404)
    return c.json(row)
  })

  // PUT /admin/api/config/schemas/:id
  adminApp.put(
    '/schemas/:id',
    zValidator(
      'json',
      z.object({
        displayName: z.string().min(1).optional(),
        description: z.string().optional(),
        jsonSchema: z.record(z.unknown()).optional(),
        uiSchema: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const db = container.resolve('db')
      const body = c.req.valid('json')
      const [row] = await db
        .update(configSchemas)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(configSchemas.id, c.req.param('id')))
        .returning()
      if (!row) return c.json({ ok: false, error: 'Not found' }, 404)
      return c.json(row)
    },
  )

  // DELETE /admin/api/config/schemas/:id
  adminApp.delete('/schemas/:id', async (c) => {
    const db = container.resolve('db')
    const [row] = await db
      .delete(configSchemas)
      .where(eq(configSchemas.id, c.req.param('id')))
      .returning()
    if (!row) return c.json({ ok: false, error: 'Not found' }, 404)
    return c.json({ ok: true })
  })

  // ── Config values ─────────────────────────────────────────────────────────

  // GET /admin/api/config/values/:schemaName?env=prod
  // Returns: { published, draft, schema }
  adminApp.get('/values/:schemaName', async (c) => {
    const db = container.resolve('db')
    const { schemaName } = c.req.param()
    const env = (c.req.query('env') ?? 'prod') as 'dev' | 'staging' | 'prod'

    const [schemaRow] = await db
      .select()
      .from(configSchemas)
      .where(eq(configSchemas.name, schemaName))
    if (!schemaRow) return c.json({ ok: false, error: 'Schema not found' }, 404)

    // Latest overall version for this schema+env
    const [latestRow] = await db
      .select()
      .from(configValues)
      .where(and(eq(configValues.schemaId, schemaRow.id), eq(configValues.environment, env)))
      .orderBy(desc(configValues.version))
      .limit(1)

    // Currently published version
    const [publishedRow] = await db
      .select()
      .from(configValues)
      .where(
        and(
          eq(configValues.schemaId, schemaRow.id),
          eq(configValues.environment, env),
          eq(configValues.isPublished, true),
        ),
      )
      .orderBy(desc(configValues.version))
      .limit(1)

    return c.json({ schema: schemaRow, draft: latestRow ?? null, published: publishedRow ?? null })
  })

  // POST /admin/api/config/values/:schemaName?env=prod  — save new draft
  adminApp.post(
    '/values/:schemaName',
    zValidator(
      'json',
      z.object({
        data: z.union([z.record(z.unknown()), z.array(z.unknown())]),
        env: z.enum(['dev', 'staging', 'prod']).optional(),
      }),
    ),
    async (c) => {
      const db = container.resolve('db')
      const user = c.get('user') as { userId: string }
      const { schemaName } = c.req.param()
      const body = c.req.valid('json')
      const env = (c.req.query('env') ?? body.env ?? 'prod') as 'dev' | 'staging' | 'prod'

      const [schemaRow] = await db
        .select()
        .from(configSchemas)
        .where(eq(configSchemas.name, schemaName))
      if (!schemaRow) return c.json({ ok: false, error: 'Schema not found' }, 404)

      // Get next version number
      const [maxRow] = await db
        .select({ maxVersion: sql<number>`coalesce(max(${configValues.version}), 0)` })
        .from(configValues)
        .where(and(eq(configValues.schemaId, schemaRow.id), eq(configValues.environment, env)))

      const nextVersion = (maxRow?.maxVersion ?? 0) + 1

      const [row] = await db
        .insert(configValues)
        .values({
          schemaId: schemaRow.id,
          environment: env,
          version: nextVersion,
          data: body.data,
          isPublished: false,
          createdBy: user.userId,
        })
        .returning()

      return c.json(row, 201)
    },
  )

  // POST /admin/api/config/values/:schemaName/publish?env=prod
  adminApp.post('/values/:schemaName/publish', async (c) => {
    const db = container.resolve('db')
    const { schemaName } = c.req.param()
    const env = (c.req.query('env') ?? 'prod') as 'dev' | 'staging' | 'prod'

    const [schemaRow] = await db
      .select()
      .from(configSchemas)
      .where(eq(configSchemas.name, schemaName))
    if (!schemaRow) return c.json({ ok: false, error: 'Schema not found' }, 404)

    // Get latest version
    const [latestRow] = await db
      .select()
      .from(configValues)
      .where(and(eq(configValues.schemaId, schemaRow.id), eq(configValues.environment, env)))
      .orderBy(desc(configValues.version))
      .limit(1)

    if (!latestRow) return c.json({ ok: false, error: 'No draft to publish' }, 400)

    // Unpublish all previous versions, publish latest
    await db
      .update(configValues)
      .set({ isPublished: false })
      .where(and(eq(configValues.schemaId, schemaRow.id), eq(configValues.environment, env)))

    const [published] = await db
      .update(configValues)
      .set({ isPublished: true, publishedAt: new Date() })
      .where(eq(configValues.id, latestRow.id))
      .returning()

    // Invalidate cache
    await invalidateCache(schemaName, env)

    return c.json(published)
  })

  // GET /admin/api/config/values/:schemaName/history?env=prod
  adminApp.get('/values/:schemaName/history', async (c) => {
    const db = container.resolve('db')
    const { schemaName } = c.req.param()
    const env = (c.req.query('env') ?? 'prod') as 'dev' | 'staging' | 'prod'
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50)
    const offset = Number(c.req.query('offset') ?? '0')

    const [schemaRow] = await db
      .select()
      .from(configSchemas)
      .where(eq(configSchemas.name, schemaName))
    if (!schemaRow) return c.json({ ok: false, error: 'Schema not found' }, 404)

    const rows = await db
      .select()
      .from(configValues)
      .where(and(eq(configValues.schemaId, schemaRow.id), eq(configValues.environment, env)))
      .orderBy(desc(configValues.version))
      .limit(limit)
      .offset(offset)

    return c.json(rows)
  })

  // POST /admin/api/config/values/:schemaName/rollback?env=prod&version=3
  adminApp.post('/values/:schemaName/rollback', async (c) => {
    const db = container.resolve('db')
    const { schemaName } = c.req.param()
    const env = (c.req.query('env') ?? 'prod') as 'dev' | 'staging' | 'prod'
    const version = Number(c.req.query('version'))
    if (!version) return c.json({ ok: false, error: 'version is required' }, 400)

    const [schemaRow] = await db
      .select()
      .from(configSchemas)
      .where(eq(configSchemas.name, schemaName))
    if (!schemaRow) return c.json({ ok: false, error: 'Schema not found' }, 404)

    const [targetRow] = await db
      .select()
      .from(configValues)
      .where(
        and(
          eq(configValues.schemaId, schemaRow.id),
          eq(configValues.environment, env),
          eq(configValues.version, version),
        ),
      )
    if (!targetRow) return c.json({ ok: false, error: 'Version not found' }, 404)

    // Unpublish all, then publish target
    await db
      .update(configValues)
      .set({ isPublished: false })
      .where(and(eq(configValues.schemaId, schemaRow.id), eq(configValues.environment, env)))

    const [published] = await db
      .update(configValues)
      .set({ isPublished: true, publishedAt: new Date() })
      .where(eq(configValues.id, targetRow.id))
      .returning()

    await invalidateCache(schemaName, env)

    return c.json(published)
  })

  // ── Public read APIs (no auth, cached) ────────────────────────────────────

  // GET /api/v1/config/:schemaName?env=prod
  app.get('/v1/config/:schemaName', async (c) => {
    const db = container.resolve('db')
    const { schemaName } = c.req.param()
    const env = (c.req.query('env') ?? 'prod') as 'dev' | 'staging' | 'prod'

    // Try Redis cache
    const redis = await getRedisClient()
    const key = cacheKey(schemaName, env)
    if (redis) {
      const cached = await redis.get(key)
      if (cached) {
        return c.json(JSON.parse(cached))
      }
    }

    const [schemaRow] = await db
      .select()
      .from(configSchemas)
      .where(eq(configSchemas.name, schemaName))
    if (!schemaRow) return c.json({ ok: false, error: 'Not found' }, 404)

    const [publishedRow] = await db
      .select()
      .from(configValues)
      .where(
        and(
          eq(configValues.schemaId, schemaRow.id),
          eq(configValues.environment, env),
          eq(configValues.isPublished, true),
        ),
      )
      .orderBy(desc(configValues.version))
      .limit(1)

    if (!publishedRow) return c.json({ ok: false, error: 'No published config' }, 404)

    const result = {
      data: publishedRow.data,
      version: publishedRow.version,
      publishedAt: publishedRow.publishedAt,
    }

    if (redis) {
      await redis.set(key, JSON.stringify(result), { EX: CONFIG_CACHE_TTL })
    }

    return c.json(result)
  })

  app.route('/admin/config', adminApp)
  return app
}
