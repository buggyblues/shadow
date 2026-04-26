import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { featureFlags } from '../db/schema'
import { getRedisClient } from '../lib/redis'
import { authMiddleware } from '../middleware/auth.middleware'

const FLAGS_CACHE_KEY = 'config:v1:feature-flags'
const FLAGS_CACHE_TTL = 300 // 5 minutes

async function invalidateFlagsCache() {
  const redis = await getRedisClient()
  if (redis) await redis.del(FLAGS_CACHE_KEY)
}

export function createFeatureFlagsHandler(container: AppContainer) {
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

  // GET /admin/api/config/flags
  adminApp.get('/', async (c) => {
    const db = container.resolve('db')
    const rows = await db.select().from(featureFlags).orderBy(desc(featureFlags.createdAt))
    return c.json(rows)
  })

  // POST /admin/api/config/flags
  adminApp.post(
    '/',
    zValidator(
      'json',
      z.object({
        key: z
          .string()
          .min(1)
          .regex(/^[a-z0-9-]+$/, 'Lowercase kebab-case only'),
        description: z.string().optional(),
        envs: z
          .object({
            dev: z.boolean(),
            staging: z.boolean(),
            prod: z.boolean(),
          })
          .optional(),
      }),
    ),
    async (c) => {
      const db = container.resolve('db')
      const body = c.req.valid('json')
      const [row] = await db
        .insert(featureFlags)
        .values({
          key: body.key,
          description: body.description,
          envs: body.envs ?? { dev: false, staging: false, prod: false },
        })
        .returning()
      await invalidateFlagsCache()
      return c.json(row, 201)
    },
  )

  // PUT /admin/api/config/flags/:id
  adminApp.put(
    '/:id',
    zValidator(
      'json',
      z.object({
        description: z.string().optional(),
        envs: z.object({
          dev: z.boolean(),
          staging: z.boolean(),
          prod: z.boolean(),
        }),
      }),
    ),
    async (c) => {
      const db = container.resolve('db')
      const body = c.req.valid('json')
      const [row] = await db
        .update(featureFlags)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(featureFlags.id, c.req.param('id')))
        .returning()
      if (!row) return c.json({ ok: false, error: 'Not found' }, 404)
      await invalidateFlagsCache()
      return c.json(row)
    },
  )

  // DELETE /admin/api/config/flags/:id
  adminApp.delete('/:id', async (c) => {
    const db = container.resolve('db')
    const [row] = await db
      .delete(featureFlags)
      .where(eq(featureFlags.id, c.req.param('id')))
      .returning()
    if (!row) return c.json({ ok: false, error: 'Not found' }, 404)
    await invalidateFlagsCache()
    return c.json({ ok: true })
  })

  // ── Public: GET /api/v1/config/flags?env=prod ─────────────────────────────
  app.get('/v1/config/flags', async (c) => {
    const db = container.resolve('db')
    const env = (c.req.query('env') ?? 'prod') as 'dev' | 'staging' | 'prod'

    const redis = await getRedisClient()
    const cacheKey = `${FLAGS_CACHE_KEY}:${env}`
    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) return c.json(JSON.parse(cached))
    }

    const rows = await db.select().from(featureFlags)
    const result: Record<string, boolean> = {}
    for (const row of rows) {
      result[row.key] = row.envs[env] ?? false
    }

    if (redis) {
      await redis.set(cacheKey, JSON.stringify(result), { EX: FLAGS_CACHE_TTL })
    }

    return c.json(result)
  })

  app.route('/admin/config/flags', adminApp)
  return app
}
