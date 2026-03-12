import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import JSZip from 'jszip'
import { lookup } from 'mime-types'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  createAppSchema,
  listAppsQuerySchema,
  publishFromWorkspaceSchema,
  updateAppSchema,
} from '../validators/app.schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createAppHandler(container: AppContainer) {
  const h = new Hono()

  /* ─── Helpers ─── */

  async function resolveServerId(param: string): Promise<string> {
    if (UUID_RE.test(param)) return param
    const serverDao = container.resolve('serverDao')
    const server = await serverDao.findBySlug(param)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    return server.id
  }

  async function requireAdmin(serverId: string, userId: string) {
    const permissionService = container.resolve('permissionService')
    await permissionService.requireRole(serverId, userId, 'admin')
  }

  /* ══════════════════════════════════════════
     Serve App Content (no auth – public)
     ══════════════════════════════════════════ */

  // In-memory cache for zip contents to avoid re-downloading for every asset
  const zipCache = new Map<string, { zip: JSZip; ts: number }>()
  const ZIP_CACHE_TTL = 5 * 60_000

  // GET /servers/:serverId/apps/:appId/serve/* — serve files from zip/html app
  h.get('/servers/:serverId/apps/:appId/serve/*', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const appId = c.req.param('appId')

    const appService = container.resolve('appService')
    const app = UUID_RE.test(appId)
      ? await appService.getApp(appId)
      : await appService.getAppBySlug(serverId, appId)

    if (!app.sourceUrl) return c.text('No source URL', 404)

    const filePath = c.req.param('*') || 'index.html'

    const mediaService = container.resolve('mediaService')

    if (app.sourceType === 'url') {
      return c.redirect(app.sourceUrl)
    }

    // Determine if the source is a zip or a single HTML file
    const isZip = app.sourceUrl.endsWith('.zip')

    if (!isZip) {
      // Single HTML file — serve directly
      const buf = await mediaService.getFileBuffer(app.sourceUrl)
      if (!buf) return c.text('File not found', 404)
      return c.body(new Uint8Array(buf), 200, { 'Content-Type': 'text/html; charset=utf-8' })
    }

    // ZIP — extract the requested file
    const cacheKey = `${app.id}:${app.sourceUrl}`
    let cached = zipCache.get(cacheKey)
    if (!cached || Date.now() - cached.ts > ZIP_CACHE_TTL) {
      const buf = await mediaService.getFileBuffer(app.sourceUrl)
      if (!buf) return c.text('Zip file not found', 404)
      const zip = await JSZip.loadAsync(buf)
      cached = { zip, ts: Date.now() }
      zipCache.set(cacheKey, cached)
    }

    // Try to find the file in the zip (handle both with and without root folder)
    let zipFile = cached.zip.file(filePath)
    if (!zipFile) {
      // Try with first root folder prefix stripped or added
      const entries = Object.keys(cached.zip.files)
      const rootFolder = entries[0]?.split('/')[0]
      if (rootFolder) {
        zipFile = cached.zip.file(`${rootFolder}/${filePath}`)
      }
    }

    if (!zipFile || zipFile.dir) {
      // If requesting a path without extension, try index.html in that directory
      if (!filePath.includes('.')) {
        const indexPath = filePath.endsWith('/')
          ? `${filePath}index.html`
          : `${filePath}/index.html`
        zipFile = cached.zip.file(indexPath)
        if (!zipFile) {
          const entries = Object.keys(cached.zip.files)
          const rootFolder = entries[0]?.split('/')[0]
          if (rootFolder) {
            zipFile = cached.zip.file(`${rootFolder}/${indexPath}`)
          }
        }
      }
      if (!zipFile || zipFile.dir) return c.text('File not found in archive', 404)
    }

    const content = await zipFile.async('nodebuffer')
    const mimeType = lookup(filePath) || 'application/octet-stream'
    return c.body(new Uint8Array(content), 200, { 'Content-Type': mimeType })
  })

  // Shorter alias without trailing path — serves index.html
  h.get('/servers/:serverId/apps/:appId/serve', async (c) => {
    const url = new URL(c.req.url)
    url.pathname = `${url.pathname}/`
    return c.redirect(url.toString(), 301)
  })

  /* ── All routes below require auth ── */
  h.use('*', authMiddleware)

  /* ══════════════════════════════════════════
     List & Get Apps
     ══════════════════════════════════════════ */

  // GET /servers/:serverId/apps — list apps (public: only active; admin: all)
  h.get('/servers/:serverId/apps', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    const query = listAppsQuerySchema.parse({
      status: c.req.query('status'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    })

    // Non-admins can only see active apps
    const permissionService = container.resolve('permissionService')
    let isAdmin = false
    try {
      await permissionService.requireRole(serverId, user.userId, 'admin')
      isAdmin = true
    } catch {}

    const appService = container.resolve('appService')
    const result = await appService.listApps(serverId, {
      status: isAdmin ? query.status : 'active',
      limit: query.limit,
      offset: query.offset,
    })
    return c.json(result)
  })

  // GET /servers/:serverId/apps/homepage — get homepage app
  h.get('/servers/:serverId/apps/homepage', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const appService = container.resolve('appService')
    const app = await appService.getHomepageApp(serverId)
    if (!app) return c.json(null)
    return c.json(app)
  })

  // GET /servers/:serverId/apps/:appId — get single app
  h.get('/servers/:serverId/apps/:appId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const appService = container.resolve('appService')
    const appId = c.req.param('appId')

    // Support slug-based lookup
    const app = UUID_RE.test(appId)
      ? await appService.getApp(appId)
      : await appService.getAppBySlug(serverId, appId)

    // Increment view count
    await appService.viewApp(app.id)
    return c.json(app)
  })

  /* ══════════════════════════════════════════
     Admin: Create / Update / Delete
     ══════════════════════════════════════════ */

  // POST /servers/:serverId/apps — create app
  h.post('/servers/:serverId/apps', zValidator('json', createAppSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireAdmin(serverId, user.userId)

    const appService = container.resolve('appService')
    const app = await appService.createApp(serverId, user.userId, c.req.valid('json'))
    return c.json(app, 201)
  })

  // PATCH /servers/:serverId/apps/:appId — update app
  h.patch('/servers/:serverId/apps/:appId', zValidator('json', updateAppSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireAdmin(serverId, user.userId)

    const appService = container.resolve('appService')
    const result = await appService.updateApp(
      c.req.param('appId'),
      user.userId,
      c.req.valid('json'),
    )
    return c.json(result)
  })

  // DELETE /servers/:serverId/apps/:appId — delete app
  h.delete('/servers/:serverId/apps/:appId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const user = c.get('user')
    await requireAdmin(serverId, user.userId)

    const appService = container.resolve('appService')
    await appService.deleteApp(c.req.param('appId'), user.userId)
    return c.json({ ok: true })
  })

  /* ══════════════════════════════════════════
     Publish from Workspace
     ══════════════════════════════════════════ */

  // POST /servers/:serverId/apps/publish — publish zip from workspace
  h.post(
    '/servers/:serverId/apps/publish',
    zValidator('json', publishFromWorkspaceSchema),
    async (c) => {
      const serverId = await resolveServerId(c.req.param('serverId'))
      const user = c.get('user')
      await requireAdmin(serverId, user.userId)

      const appService = container.resolve('appService')
      const app = await appService.publishFromWorkspace(serverId, user.userId, c.req.valid('json'))
      return c.json(app, 201)
    },
  )

  return h
}
