import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import JSZip from 'jszip'
import { lookup } from 'mime-types'
import type { AppContainer } from '../container'
import { waitCloudDeploymentAutoResumeForApp } from '../lib/cloud-deployment-autoresume'
import { logger } from '../lib/logger'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'
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

  async function loadSourceBuffer(sourceUrl: string): Promise<Buffer | null> {
    if (!sourceUrl) return null

    // Internal media contentRef, e.g. /shadow/uploads/xxx.zip
    if (sourceUrl.startsWith('/')) {
      const mediaService = container.resolve('mediaService')
      return mediaService.getFileBuffer(sourceUrl)
    }

    // External URL source must go through SafeHttpClient so URL apps cannot SSRF the server.
    try {
      const safeHttpClient = container.resolve('safeHttpClient')
      const { buffer } = await safeHttpClient.fetchBuffer(
        sourceUrl,
        {},
        { action: 'app.source.fetch', maxBytes: 25 * 1024 * 1024 },
      )
      return buffer
    } catch (err) {
      logger.warn({ err, sourceUrl }, '[app-serve] rejected or failed external source URL')
      return null
    }
  }

  function isProxyEnabled(settings: Record<string, unknown> | null | undefined): boolean {
    return settings?.proxyEnabled === true
  }

  function sanitizeProxyRequestHeaders(headers: Headers) {
    // Hop-by-hop headers must not be forwarded by proxies.
    const hopByHop = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
    ]
    for (const key of hopByHop) headers.delete(key)
    return headers
  }

  function sanitizeProxyResponseHeaders(headers: Headers) {
    const hopByHop = ['connection', 'keep-alive', 'trailer', 'transfer-encoding', 'upgrade']
    for (const key of hopByHop) headers.delete(key)
    return headers
  }

  /* ══════════════════════════════════════════
     URL App Proxy (public, subdomain gateway target)
     ══════════════════════════════════════════ */

  // Gateway should rewrite: app-subdomain request -> /api/app-proxy/:appId/*
  h.all('/app-proxy/:appId/*', async (c) => {
    const appService = container.resolve('appService')
    const appId = c.req.param('appId')
    const app = await appService.getApp(appId)

    if (app.sourceType !== 'url') {
      return c.text('Proxy only supports URL apps', 400)
    }
    if (!isProxyEnabled(app.settings)) {
      return c.text('Proxy is disabled for this app', 403)
    }
    const resumeResult = await waitCloudDeploymentAutoResumeForApp({
      container,
      app,
      reason: 'app proxy request',
      timeoutMs: 25_000,
      logContext: { appId, path: c.req.path },
    })
    if (resumeResult.timedOut) {
      return c.text('Application runtime is starting. Retry shortly.', 503, {
        'Retry-After': '5',
      })
    }

    let upstreamBase: URL
    try {
      const safeHttpClient = container.resolve('safeHttpClient')
      upstreamBase = await safeHttpClient.assertSafeUrl(app.sourceUrl)
    } catch {
      return c.text('Invalid source URL', 400)
    }

    const pathPart = (() => {
      // c.req.param('*') can be empty when mounted via app.route() sub-router.
      // Extract reliably from the full request path instead.
      const wild = c.req.param('*')
      if (wild) return wild
      const match = c.req.path.match(/\/app-proxy\/[^/]+\/(.+)$/)
      return match?.[1] ?? ''
    })()

    // Preserve query string from client request.
    const reqUrl = new URL(c.req.url)

    // Behavior:
    // - root request (/) should open the configured sourceUrl exactly (can include sub-path)
    // - absolute asset requests (/assets/...) should resolve from upstream origin root
    const upstreamUrl = pathPart
      ? new URL(`/${pathPart}`, upstreamBase.origin)
      : new URL(upstreamBase.toString())
    upstreamUrl.search = reqUrl.search || (!pathPart ? upstreamBase.search : '')

    logger.info(
      {
        appId,
        pathPart,
        sourceUrl: app.sourceUrl,
        upstreamUrl: upstreamUrl.toString(),
        reqPath: c.req.path,
      },
      '[app-proxy] forwarding request',
    )

    const reqHeaders = sanitizeProxyRequestHeaders(new Headers(c.req.raw.headers))
    reqHeaders.set('x-forwarded-proto', reqUrl.protocol.replace(':', ''))
    reqHeaders.set('x-forwarded-host', c.req.header('host') ?? '')

    const body =
      c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.raw.arrayBuffer()

    let upstreamRes: Response
    try {
      const safeHttpClient = container.resolve('safeHttpClient')
      upstreamRes = await safeHttpClient.fetch(
        upstreamUrl.toString(),
        {
          method: c.req.method,
          headers: reqHeaders,
          body,
          redirect: 'manual',
        },
        { action: 'app.proxy.forward', maxRedirects: 0 },
      )
    } catch (err) {
      logger.warn(
        { err, appId, upstreamUrl: upstreamUrl.toString() },
        '[app-proxy] upstream failed',
      )
      return c.text('Application runtime is starting or unavailable. Retry shortly.', 503, {
        'Retry-After': '5',
      })
    }

    const headers = sanitizeProxyResponseHeaders(new Headers(upstreamRes.headers))

    // Rewrite absolute redirects to stay on proxy origin.
    const location = headers.get('location')
    if (location) {
      try {
        const loc = new URL(location, upstreamBase)
        if (loc.origin === upstreamBase.origin) {
          const forwardedHost = c.req.header('x-forwarded-host') || ''
          const isSubdomainProxy = /^app-[0-9a-f-]+\./i.test(forwardedHost)
          if (isSubdomainProxy) {
            // Subdomain proxy: browser is on app-<id>.host, use plain path
            headers.set('location', `${loc.pathname}${loc.search}${loc.hash}`)
          } else {
            // Direct path proxy: prefix with proxy route
            const proxyPathBase = `/api/app-proxy/${app.id}`
            headers.set('location', `${proxyPathBase}${loc.pathname}${loc.search}${loc.hash}`)
          }
        }
      } catch {
        // Keep original location if parsing fails.
      }
    }

    // SSE: keep streaming, disable buffering hints.
    if ((headers.get('content-type') ?? '').includes('text/event-stream')) {
      headers.set('cache-control', 'no-cache')
      headers.set('x-accel-buffering', 'no')
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    })
  })

  h.all('/app-proxy/:appId', async (c) => {
    const url = new URL(c.req.url)
    url.pathname = `${url.pathname}/`
    return c.redirect(url.toString(), 301)
  })

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

    if (app.sourceType === 'url') {
      const resumeResult = await waitCloudDeploymentAutoResumeForApp({
        container,
        app,
        reason: 'app url open',
        timeoutMs: 25_000,
        logContext: { appId: app.id, serverId },
      })
      if (resumeResult.timedOut) {
        return c.text('Application runtime is starting. Retry shortly.', 503, {
          'Retry-After': '5',
        })
      }
      const safeHttpClient = container.resolve('safeHttpClient')
      const target = await safeHttpClient.assertSafeUrl(app.sourceUrl)
      return c.redirect(target.toString())
    }

    // Determine if the source is a zip or a single HTML file
    const isZip = app.sourceUrl.endsWith('.zip')

    if (!isZip) {
      // Single HTML file — serve directly
      const buf = await loadSourceBuffer(app.sourceUrl)
      if (!buf) return c.text('File not found', 404)
      return c.body(new Uint8Array(buf), 200, { 'Content-Type': 'text/html; charset=utf-8' })
    }

    // ZIP — extract the requested file
    const cacheKey = `${app.id}:${app.sourceUrl}`
    let cached = zipCache.get(cacheKey)
    if (!cached || Date.now() - cached.ts > ZIP_CACHE_TTL) {
      const buf = await loadSourceBuffer(app.sourceUrl)
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

  /* ── All routes below require auth (except public runtime/proxy routes) ── */
  h.use('*', async (c, next) => {
    const path = c.req.path
    // Public app runtime endpoint:
    // - /api/servers/:serverId/apps/:appId/serve[/...]
    // - /servers/:serverId/apps/:appId/serve[/...] (sub-router path)
    if (
      /^(?:\/api)?\/servers\/[^/]+\/apps\/[^/]+\/serve(?:\/.*)?$/.test(path) ||
      /^\/api\/app-proxy\/[^/]+(?:\/.*)?$/.test(path) ||
      /^\/app-proxy\/[^/]+(?:\/.*)?$/.test(path)
    ) {
      await next()
      return
    }
    return authMiddleware(c, next)
  })

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

    const appUseCase = container.resolve('appUseCase')
    const app = await appUseCase.createApp({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      serverId,
      payload: c.req.valid('json'),
    })
    return c.json(app, 201)
  })

  // PATCH /servers/:serverId/apps/:appId — update app
  h.patch('/servers/:serverId/apps/:appId', zValidator('json', updateAppSchema), async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const appUseCase = container.resolve('appUseCase')
    const result = await appUseCase.updateApp({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      serverId,
      appId: c.req.param('appId'),
      payload: c.req.valid('json'),
    })
    return c.json(result)
  })

  // DELETE /servers/:serverId/apps/:appId — delete app
  h.delete('/servers/:serverId/apps/:appId', async (c) => {
    const serverId = await resolveServerId(c.req.param('serverId'))
    const appUseCase = container.resolve('appUseCase')
    const result = await appUseCase.deleteApp({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      serverId,
      appId: c.req.param('appId'),
    })
    return c.json(result)
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
      const appUseCase = container.resolve('appUseCase')
      const app = await appUseCase.publishFromWorkspace({
        ctx: createActorContext(c.get('actor'), { route: c.req.path }),
        serverId,
        payload: c.req.valid('json'),
      })
      return c.json(app, 201)
    },
  )

  return h
}
