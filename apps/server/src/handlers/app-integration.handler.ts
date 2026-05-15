import { zValidator } from '@hono/zod-validator'
import { type Context, Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  callServerAppCommandSchema,
  discoverServerAppSchema,
  grantServerAppBuddySchema,
  installServerAppFromCatalogSchema,
  installServerAppSchema,
} from '../validators/app-integration.schema'

function parseJsonField(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {}
  return JSON.parse(value)
}

async function parseIntrospectionToken(c: Context) {
  const authorization = c.req.header('authorization') ?? ''
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }

  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await c.req.parseBody()
    const token = form.token
    return typeof token === 'string' ? token : ''
  }

  const body = await c.req.json().catch(() => null)
  if (body && typeof body === 'object' && !Array.isArray(body) && 'token' in body) {
    const token = (body as { token?: unknown }).token
    return typeof token === 'string' ? token : ''
  }
  return ''
}

export function createAppIntegrationHandler(container: AppContainer) {
  const handler = new Hono()

  handler.get('/servers/:serverId/apps/:appKey/events', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const token = c.req.query('token') ?? ''
    const { app } = await appIntegrationService.getEventStreamContext(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
    )
    const origin = c.req.header('origin')
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    }
    if (origin && app.allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
      headers.Vary = 'Origin'
    }

    let cleanup: (() => void) | undefined
    return c.body(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          let closed = false
          const send = (event: string, data: unknown) => {
            if (closed) return
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              )
            } catch {
              closed = true
            }
          }
          const close = () => {
            if (closed) return
            closed = true
            unsubscribe()
            clearInterval(heartbeat)
            try {
              controller.close()
            } catch {
              // The client may have already disconnected.
            }
          }
          const appIntegrationEventBus = container.resolve('appIntegrationEventBus')
          const unsubscribe = appIntegrationEventBus.subscribe(app.id, (event) => {
            send(event.type, event)
          })
          const heartbeat = setInterval(() => {
            send('ping', { timestamp: new Date().toISOString() })
          }, 25_000)
          c.req.raw.signal.addEventListener('abort', close, { once: true })
          cleanup = close
          send('ready', {
            type: 'server_app.events.ready',
            serverId: app.serverId,
            serverAppId: app.id,
            appKey: app.appKey,
            timestamp: new Date().toISOString(),
          })
        },
        cancel() {
          cleanup?.()
        },
      }),
      200,
      headers,
    )
  })

  handler.post('/servers/:serverId/apps/:appKey/oauth/introspect', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ active: false })
    const result = await appIntegrationService.introspectCommandToken(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
    )
    return c.json(result)
  })

  handler.use('/servers/:serverId/apps/*', authMiddleware)
  handler.use('/servers/:serverId/apps', authMiddleware)

  handler.get('/servers/:serverId/apps', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const apps = await appIntegrationService.list(c.req.param('serverId'), c.get('actor'))
    return c.json(apps)
  })

  handler.post('/servers/:serverId/apps', zValidator('json', installServerAppSchema), async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const app = await appIntegrationService.install(
      c.req.param('serverId'),
      c.get('actor'),
      c.req.valid('json'),
    )
    return c.json(app, 201)
  })

  handler.post(
    '/servers/:serverId/apps/discover',
    zValidator('json', discoverServerAppSchema),
    async (c) => {
      const appIntegrationService = container.resolve('appIntegrationService')
      const discovery = await appIntegrationService.discover(
        c.req.param('serverId'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(discovery)
    },
  )

  handler.get('/servers/:serverId/apps/catalog', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const catalog = await appIntegrationService.listCatalog(c.req.param('serverId'), c.get('actor'))
    return c.json(catalog)
  })

  handler.post(
    '/servers/:serverId/apps/catalog/:catalogEntryId/install',
    zValidator('json', installServerAppFromCatalogSchema),
    async (c) => {
      const appIntegrationService = container.resolve('appIntegrationService')
      const app = await appIntegrationService.installFromCatalog(
        c.req.param('serverId'),
        c.req.param('catalogEntryId'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(app, 201)
    },
  )

  handler.get('/servers/:serverId/apps/:appKey', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const app = await appIntegrationService.get(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(app)
  })

  handler.delete('/servers/:serverId/apps/:appKey', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const result = await appIntegrationService.delete(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(result)
  })

  handler.post(
    '/servers/:serverId/apps/:appKey/grants',
    zValidator('json', grantServerAppBuddySchema),
    async (c) => {
      const appIntegrationService = container.resolve('appIntegrationService')
      const grant = await appIntegrationService.grant(
        c.req.param('serverId'),
        c.req.param('appKey'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(grant, 201)
    },
  )

  handler.post('/servers/:serverId/apps/:appKey/launch', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const launch = await appIntegrationService.createLaunch(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(launch)
  })

  handler.get('/servers/:serverId/apps/:appKey/skills', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const skills = await appIntegrationService.skills(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(skills)
  })

  handler.post('/servers/:serverId/apps/:appKey/commands/:commandName', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const contentType = c.req.header('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody({ all: true })
      const fields: Record<string, string> = {}
      const files: Array<{ field: string; name: string; type: string; value: Blob }> = []
      for (const [key, raw] of Object.entries(body)) {
        const values = Array.isArray(raw) ? raw : [raw]
        for (const value of values) {
          if (value instanceof File) {
            files.push({
              field: key,
              name: value.name,
              type: value.type || 'application/octet-stream',
              value,
            })
          } else {
            fields[key] = String(value)
          }
        }
      }
      const result = await appIntegrationService.callCommand({
        serverIdOrSlug: c.req.param('serverId'),
        appKey: c.req.param('appKey'),
        commandName: c.req.param('commandName'),
        actor: c.get('actor'),
        body: callServerAppCommandSchema.parse({
          input: parseJsonField(fields.input ?? fields.payload),
          channelId: fields.channelId,
        }),
        multipart: { fields, files },
      })
      return c.json(result)
    }

    const body = callServerAppCommandSchema.parse(await c.req.json().catch(() => ({})))
    const result = await appIntegrationService.callCommand({
      serverIdOrSlug: c.req.param('serverId'),
      appKey: c.req.param('appKey'),
      commandName: c.req.param('commandName'),
      actor: c.get('actor'),
      body,
    })
    return c.json(result)
  })

  return handler
}
