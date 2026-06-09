import { zValidator } from '@hono/zod-validator'
import { type Context, Hono } from 'hono'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import type { Actor } from '../security/actor'
import {
  approveServerAppCommandSchema,
  callServerAppCommandSchema,
  discoverServerAppSchema,
  grantServerAppBuddySchema,
  installServerAppFromCatalogSchema,
  installServerAppSchema,
  updateServerAppAccessPolicySchema,
} from '../validators/app-integration.schema'

function parseJsonField(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {}
  return JSON.parse(value)
}

function approvalPayload(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { code?: unknown; params?: { approval?: unknown } }
  if (candidate.code !== 'SERVER_APP_COMMAND_APPROVAL_REQUIRED') return null
  const approval = candidate.params?.approval
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return null
  return approval as Record<string, unknown>
}

function approvalString(approval: Record<string, unknown>, key: string) {
  const value = approval[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function serverAppApprovalTargetUserId(
  container: AppContainer,
  actor: Actor,
): Promise<string | null> {
  if (actor.kind === 'system') return null
  if (actor.kind === 'agent') {
    if (actor.ownerId) return actor.ownerId
    const agentDao = container.resolve('agentDao')
    const agent =
      (actor.agentId ? await agentDao.findById(actor.agentId) : null) ??
      (await agentDao.findByUserId(actor.userId))
    return agent?.ownerId ?? null
  }
  return actor.userId
}

function hasRealtimeUserRoom(container: AppContainer, userId: string) {
  try {
    const io = container.resolve('io')
    return (io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) > 0
  } catch {
    return false
  }
}

async function findServerForNotification(container: AppContainer, serverIdOrSlug: string) {
  const serverDao = container.resolve('serverDao')
  return isUuid(serverIdOrSlug)
    ? await serverDao.findById(serverIdOrSlug)
    : await serverDao.findBySlug(serverIdOrSlug)
}

async function userDisplayName(container: AppContainer, userId: string) {
  const user = await container
    .resolve('userDao')
    .findById(userId)
    .catch(() => null)
  return user?.displayName ?? user?.username ?? 'Someone'
}

async function emitServerAppApprovalRequired(
  container: AppContainer,
  actor: Actor,
  error: unknown,
) {
  if (actor.kind !== 'agent') return
  const approval = approvalPayload(error)
  if (!approval) return
  const targetUserId = await serverAppApprovalTargetUserId(container, actor)
  if (!targetUserId) return

  const requestedAt = new Date().toISOString()
  const payload = { ...approval, requestedAt }
  if (hasRealtimeUserRoom(container, targetUserId)) {
    container.resolve('io').to(`user:${targetUserId}`).emit('server-app:approval-required', payload)
    return
  }

  const serverId = approvalString(approval, 'serverId')
  const appKey = approvalString(approval, 'appKey')
  const appName = approvalString(approval, 'appName')
  const commandName = approvalString(approval, 'commandName')
  const commandTitle = approvalString(approval, 'commandTitle') ?? commandName
  const permission = approvalString(approval, 'permission')
  const action = approvalString(approval, 'action')
  const dataClass = approvalString(approval, 'dataClass')
  const subjectKind = approvalString(approval, 'subjectKind')
  const approvalMode = approvalString(approval, 'approvalMode')
  if (
    !serverId ||
    !appKey ||
    !appName ||
    !commandName ||
    !commandTitle ||
    !permission ||
    !action ||
    !dataClass ||
    (subjectKind !== 'user' && subjectKind !== 'buddy') ||
    !approvalMode
  ) {
    return
  }

  const [server, requesterName] = await Promise.all([
    findServerForNotification(container, serverId),
    userDisplayName(container, actor.userId),
  ])
  await container.resolve('notificationTriggerService').triggerServerAppCommandApprovalRequest({
    ownerId: targetUserId,
    requesterId: actor.userId,
    requesterName,
    serverId,
    serverName: server?.name,
    serverAppId: approvalString(approval, 'serverAppId'),
    appKey,
    appName,
    commandName,
    commandTitle,
    commandDescription: approvalString(approval, 'commandDescription'),
    permission,
    action,
    dataClass,
    subjectKind,
    buddyAgentId: approvalString(approval, 'buddyAgentId'),
    approvalMode,
    channelId: approvalString(approval, 'channelId'),
  })
}

async function notifyServerAppApprovalGranted(
  container: AppContainer,
  actor: Actor,
  input: {
    serverIdOrSlug: string
    appKey: string
    commandName: string
    result: {
      consent?: {
        serverAppId?: string | null
        permission?: string | null
        subjectKind?: string | null
        subjectUserId?: string | null
        buddyAgentId?: string | null
      }
    }
  },
) {
  if (actor.kind === 'system') return
  const subjectUserId = input.result.consent?.subjectUserId
  if (!subjectUserId || subjectUserId === actor.userId) return

  const server = await findServerForNotification(container, input.serverIdOrSlug)
  if (!server?.id) return
  const app = await container
    .resolve('appIntegrationDao')
    .findByServerAndKey(server.id, input.appKey)
    .catch(() => null)
  const command = app?.manifest.commands.find((item) => item.name === input.commandName)
  const subjectKind = input.result.consent?.subjectKind
  if (subjectKind !== 'user' && subjectKind !== 'buddy') return

  await container.resolve('notificationTriggerService').triggerServerAppCommandApprovalGranted({
    userId: subjectUserId,
    reviewerId: actor.userId,
    serverId: server.id,
    serverName: server.name,
    serverAppId: input.result.consent?.serverAppId ?? app?.id,
    appKey: input.appKey,
    appName: app?.name ?? input.appKey,
    commandName: input.commandName,
    commandTitle: command?.title ?? input.commandName,
    commandDescription: command?.description ?? null,
    permission: input.result.consent?.permission ?? command?.permission ?? '',
    action: command?.action,
    dataClass: command?.dataClass,
    subjectKind,
    buddyAgentId: input.result.consent?.buddyAgentId,
  })
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

  handler.post('/servers/:serverId/apps/:appKey/launch/introspect', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ active: false })
    const result = await appIntegrationService.introspectLaunchToken(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
    )
    return c.json(result)
  })

  handler.get('/servers/:serverId/apps/:appKey/launch/inboxes', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ inboxes: [] })
    const inboxes = await appIntegrationService.listLaunchBuddyInboxes(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
    )
    return c.json({ inboxes })
  })

  handler.post('/servers/:serverId/apps/:appKey/launch/outbox', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ ok: false, error: 'missing_launch_token' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as {
      commandName?: string | null
      result?: unknown
    }
    const result = await appIntegrationService.deliverLaunchOutbox(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
      body,
    )
    return c.json(result)
  })

  handler.use('/servers/:serverId/apps/*', authMiddleware)
  handler.use('/servers/:serverId/apps', authMiddleware)

  handler.get('/servers/:serverId/apps', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    if (c.req.query('summary') === '1') {
      const apps = await appIntegrationService.listSummaries(
        c.req.param('serverId'),
        c.get('actor'),
        { locale },
      )
      return c.json(apps)
    }
    const apps = await appIntegrationService.list(c.req.param('serverId'), c.get('actor'), {
      locale,
    })
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
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    const catalog = await appIntegrationService.listCatalog(
      c.req.param('serverId'),
      c.get('actor'),
      { locale },
    )
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
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    const app = await appIntegrationService.get(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
      { locale },
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

  handler.patch(
    '/servers/:serverId/apps/:appKey/access-policy',
    zValidator('json', updateServerAppAccessPolicySchema),
    async (c) => {
      const appIntegrationService = container.resolve('appIntegrationService')
      const app = await appIntegrationService.updateAccessPolicy(
        c.req.param('serverId'),
        c.req.param('appKey'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(app)
    },
  )

  handler.post(
    '/servers/:serverId/apps/:appKey/approvals',
    zValidator('json', approveServerAppCommandSchema),
    async (c) => {
      const appIntegrationService = container.resolve('appIntegrationService')
      const input = c.req.valid('json')
      const result = await appIntegrationService.approveCommandAccess(
        c.req.param('serverId'),
        c.req.param('appKey'),
        c.get('actor'),
        input,
      )
      await notifyServerAppApprovalGranted(container, c.get('actor'), {
        serverIdOrSlug: c.req.param('serverId'),
        appKey: c.req.param('appKey'),
        commandName: input.commandName,
        result,
      })
      return c.json(result, 201)
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
      const actor = c.get('actor')
      const result = await appIntegrationService.callCommand({
        serverIdOrSlug: c.req.param('serverId'),
        appKey: c.req.param('appKey'),
        commandName: c.req.param('commandName'),
        actor,
        body: callServerAppCommandSchema.parse({
          input: parseJsonField(fields.input ?? fields.payload),
          channelId: fields.channelId,
          task: fields.task ? parseJsonField(fields.task) : undefined,
        }),
        multipart: { fields, files },
        authorization: {
          onCommandApprovalRequired: (error) =>
            emitServerAppApprovalRequired(container, actor, error),
        },
      })
      return c.json(result)
    }

    const body = callServerAppCommandSchema.parse(await c.req.json().catch(() => ({})))
    const actor = c.get('actor')
    const result = await appIntegrationService.callCommand({
      serverIdOrSlug: c.req.param('serverId'),
      appKey: c.req.param('appKey'),
      commandName: c.req.param('commandName'),
      actor,
      body,
      authorization: {
        onCommandApprovalRequired: (error) =>
          emitServerAppApprovalRequired(container, actor, error),
      },
    })
    return c.json(result)
  })

  return handler
}
