import { zValidator } from '@hono/zod-validator'
import {
  defaultShadowWidgetOptions,
  localizeShadowWidgetDefinition,
  type ShadowWidgetDefinition,
} from '@shadowob/shared'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import type { SpaceAppManifest } from '../db/schema'
import { authMiddleware } from '../middleware/auth.middleware'
import type { Actor } from '../security/actor'
import {
  approveSpaceAppCommandSchema,
  callSpaceAppCommandSchema,
  discoverSpaceAppSchema,
  grantSpaceAppBuddySchema,
  installSpaceAppFromCatalogSchema,
  installSpaceAppSchema,
  updateSpaceAppAccessPolicySchema,
} from '../validators/space-app.schema'

const spaceAppNotificationPublishSchema = z.object({
  topicKey: z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/),
  recipientUserIds: z.array(z.string().uuid()).min(1).max(100),
  title: z.string().min(1).max(200),
  body: z.string().max(4000).nullable().optional(),
  idempotencyKey: z.string().min(8).max(160),
  actionPath: z.string().max(500).nullable().optional(),
  metadata: z
    .record(z.string().max(80), z.unknown())
    .refine(
      (value) => Object.keys(value).length <= 50 && JSON.stringify(value).length <= 16_384,
      'metadata is too large',
    )
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

const widgetDataRequestSchema = z
  .object({
    options: z.record(z.string().min(1).max(80), z.string().max(120)).optional(),
  })
  .strict()

const launchEnsureChannelSchema = z
  .object({
    dedupeKey: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(100),
    topic: z.string().trim().max(800).optional(),
    isPrivate: z.boolean().optional().default(true),
    memberUserIds: z.array(z.string().uuid()).max(100).optional().default([]),
    syncMembers: z.boolean().optional().default(false),
  })
  .strict()

const launchCreatePollSchema = z
  .object({
    channelId: z.string().uuid(),
    question: z.string().trim().min(1).max(300),
    answers: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(55),
          emoji: z.string().trim().min(1).max(80).optional(),
        }),
      )
      .min(2)
      .max(10),
    allowMultiselect: z.boolean().optional().default(false),
    durationHours: z
      .number()
      .int()
      .min(1)
      .max(32 * 24)
      .optional()
      .default(24),
    layoutType: z.literal(1).optional().default(1),
  })
  .strict()

const launchEnsureBuddyGrantSchema = z
  .object({
    buddyAgentId: z.string().uuid(),
    permissions: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()

function widgetSourceParts(sourceId: string) {
  const separator = sourceId.indexOf(':')
  if (separator <= 0 || separator === sourceId.length - 1) return null
  return { appKey: sourceId.slice(0, separator), widgetKey: sourceId.slice(separator + 1) }
}

function widgetOptions(
  definition: ShadowWidgetDefinition,
  options: Record<string, string> | undefined,
) {
  const result = { ...defaultShadowWidgetOptions(definition), ...(options ?? {}) }
  const definitions = new Map((definition.options ?? []).map((option) => [option.key, option]))
  for (const [key, value] of Object.entries(result)) {
    const option = definitions.get(key)
    if (!option || !option.choices.some((choice) => choice.value === value)) {
      throw Object.assign(new Error(`Invalid widget option: ${key}`), { status: 422 })
    }
  }
  return result
}

function widgetData(result: unknown) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const record = result as Record<string, unknown>
  const data =
    record.ok === true && record.data && typeof record.data === 'object' ? record.data : record
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (JSON.stringify(data).length > 256 * 1024) {
    throw Object.assign(new Error('Widget data is too large'), { status: 413 })
  }
  return data as Record<string, unknown>
}

function parseJsonField(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {}
  return JSON.parse(value)
}

function approvalPayload(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { code?: unknown; params?: { approval?: unknown } }
  if (candidate.code !== 'SPACE_APP_COMMAND_APPROVAL_REQUIRED') return null
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

async function spaceAppApprovalTargetUserId(
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

async function emitSpaceAppApprovalRequired(container: AppContainer, actor: Actor, error: unknown) {
  if (actor.kind !== 'agent') return
  const approval = approvalPayload(error)
  if (!approval) return
  const targetUserId = await spaceAppApprovalTargetUserId(container, actor)
  if (!targetUserId) return

  const requestedAt = new Date().toISOString()
  const payload = { ...approval, requestedAt }
  if (hasRealtimeUserRoom(container, targetUserId)) {
    container.resolve('io').to(`user:${targetUserId}`).emit('space-app:approval-required', payload)
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
  await container.resolve('notificationTriggerService').triggerSpaceAppCommandApprovalRequest({
    ownerId: targetUserId,
    requesterId: actor.userId,
    requesterName,
    serverId,
    serverName: server?.name,
    spaceAppId: approvalString(approval, 'spaceAppId'),
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

async function notifySpaceAppApprovalGranted(
  container: AppContainer,
  actor: Actor,
  input: {
    serverIdOrSlug: string
    appKey: string
    commandName: string
    result: {
      consent?: {
        spaceAppId?: string | null
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
    .resolve('spaceAppDao')
    .findByServerAndKey(server.id, input.appKey)
    .catch(() => null)
  const command = app?.manifest.commands.find((item) => item.name === input.commandName)
  const subjectKind = input.result.consent?.subjectKind
  if (subjectKind !== 'user' && subjectKind !== 'buddy') return

  await container.resolve('notificationTriggerService').triggerSpaceAppCommandApprovalGranted({
    userId: subjectUserId,
    reviewerId: actor.userId,
    serverId: server.id,
    serverName: server.name,
    spaceAppId: input.result.consent?.spaceAppId ?? app?.id,
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

function parseBearerToken(c: Context) {
  const authorization = c.req.header('authorization') ?? ''
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : null
}

function bearerToken(c: Context) {
  const authorization = c.req.header('authorization') ?? ''
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
}

export function createSpaceAppHandler(container: AppContainer) {
  const handler = new Hono()

  handler.get('/servers/:serverId/space-apps/:appKey/events', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const token = bearerToken(c)
    const { app } = await spaceAppService.getEventStreamContext(
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
          const spaceAppEventBus = container.resolve('spaceAppEventBus')
          const unsubscribe = spaceAppEventBus.subscribe(app.id, (event) => {
            send(event.type, event)
          })
          const heartbeat = setInterval(() => {
            send('ping', { timestamp: new Date().toISOString() })
          }, 25_000)
          c.req.raw.signal.addEventListener('abort', close, { once: true })
          cleanup = close
          send('ready', {
            type: 'space_app.events.ready',
            serverId: app.serverId,
            spaceAppId: app.id,
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

  handler.post('/space-apps/commands/introspect', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const token = parseBearerToken(c)
    if (!token) return c.json({ active: false, error: 'missing_command_token' })
    const result = await spaceAppService.introspectCommandToken(token)
    return c.json(result)
  })

  handler.post('/servers/:serverId/space-apps/:appKey/launch/introspect', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ active: false, error: 'missing_launch_token' })
    const result = await spaceAppService.introspectLaunchToken(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
    )
    return c.json(result)
  })

  handler.get('/servers/:serverId/space-apps/:appKey/launch/inboxes', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ inboxes: [], error: 'missing_launch_token' }, 401)
    try {
      const inboxes = await spaceAppService.listLaunchBuddyInboxes(
        c.req.param('serverId'),
        c.req.param('appKey'),
        token,
      )
      return c.json({ inboxes })
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : 401
      const reason =
        error && typeof error === 'object' && 'reason' in error
          ? String((error as { reason?: unknown }).reason)
          : error instanceof Error
            ? error.message
            : 'invalid_launch_token'
      return c.json(
        { inboxes: [], error: reason },
        (Number.isInteger(status) && status >= 400 && status < 600 ? status : 401) as 401,
      )
    }
  })

  handler.get('/servers/:serverId/space-apps/:appKey/launch/members', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ members: [], error: 'missing_launch_token' }, 401)
    try {
      const members = await spaceAppService.listLaunchSpaceMembers(
        c.req.param('serverId'),
        c.req.param('appKey'),
        token,
      )
      return c.json({ members })
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : 401
      const reason =
        error && typeof error === 'object' && 'reason' in error
          ? String((error as { reason?: unknown }).reason)
          : error instanceof Error
            ? error.message
            : 'invalid_launch_token'
      return c.json(
        { members: [], error: reason },
        (Number.isInteger(status) && status >= 400 && status < 600 ? status : 401) as 401,
      )
    }
  })

  handler.get('/servers/:serverId/space-apps/:appKey/launch/channels', async (c) => {
    const token = bearerToken(c)
    if (!token) return c.json({ channels: [], error: 'missing_launch_token' }, 401)
    const channels = await container
      .resolve('spaceAppService')
      .listLaunchChannels(c.req.param('serverId'), c.req.param('appKey'), token)
    return c.json({ channels })
  })

  handler.get('/servers/:serverId/space-apps/:appKey/launch/messages/:messageId', async (c) => {
    const token = bearerToken(c)
    if (!token) return c.json({ error: 'missing_launch_token' }, 401)
    const message = await container
      .resolve('spaceAppService')
      .getLaunchMessage(
        c.req.param('serverId'),
        c.req.param('appKey'),
        token,
        c.req.param('messageId'),
      )
    return c.json(message)
  })

  handler.post('/servers/:serverId/space-apps/:appKey/launch/channels/ensure', async (c) => {
    const token = bearerToken(c)
    if (!token) return c.json({ ok: false, error: 'missing_launch_token' }, 401)
    const parsed = launchEnsureChannelSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ ok: false, error: 'invalid_channel', issues: parsed.error.issues }, 422)
    }
    const channel = await container
      .resolve('spaceAppService')
      .ensureLaunchChannel(c.req.param('serverId'), c.req.param('appKey'), token, parsed.data)
    return c.json(channel)
  })

  handler.post('/servers/:serverId/space-apps/:appKey/launch/polls', async (c) => {
    const token = bearerToken(c)
    if (!token) return c.json({ ok: false, error: 'missing_launch_token' }, 401)
    const parsed = launchCreatePollSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ ok: false, error: 'invalid_poll', issues: parsed.error.issues }, 422)
    }
    const poll = await container
      .resolve('spaceAppService')
      .createLaunchPoll(c.req.param('serverId'), c.req.param('appKey'), token, parsed.data)
    return c.json(poll, 201)
  })

  handler.post('/servers/:serverId/space-apps/:appKey/launch/buddy-grants/ensure', async (c) => {
    const token = bearerToken(c)
    if (!token) return c.json({ ok: false, error: 'missing_launch_token' }, 401)
    const parsed = launchEnsureBuddyGrantSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ ok: false, error: 'invalid_buddy_grant', issues: parsed.error.issues }, 422)
    }
    const grant = await container
      .resolve('spaceAppService')
      .ensureLaunchBuddyGrant(c.req.param('serverId'), c.req.param('appKey'), token, parsed.data)
    return c.json({ granted: true, grant })
  })

  handler.post('/servers/:serverId/space-apps/:appKey/launch/outbox', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ ok: false, error: 'missing_launch_token' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as {
      commandName?: string | null
      result?: unknown
    }
    const result = await spaceAppService.deliverLaunchOutbox(
      c.req.param('serverId'),
      c.req.param('appKey'),
      token,
      body,
    )
    return c.json(result)
  })

  handler.post('/servers/:serverId/space-apps/:appKey/notifications', async (c) => {
    const token = await parseIntrospectionToken(c)
    if (!token) return c.json({ ok: false, error: 'missing_launch_token' }, 401)
    const parsed = spaceAppNotificationPublishSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ ok: false, error: 'invalid_notification', issues: parsed.error.issues }, 422)
    }
    const spaceAppService = container.resolve('spaceAppService')
    let app: {
      id: string
      serverId: string
      appKey: string
      name: string
      iconUrl?: string | null
      manifest: Pick<SpaceAppManifest, 'notifications' | 'i18n'>
    }
    let tokenActor: {
      kind: string
      userId: string | null
      buddyAgentId?: string | null
      ownerId?: string | null
    }
    try {
      const launchContext = await spaceAppService.getEventStreamContext(
        c.req.param('serverId'),
        c.req.param('appKey'),
        token,
      )
      app = launchContext.app
      tokenActor = {
        kind: launchContext.payload.actorKind ?? 'user',
        userId: launchContext.payload.userId ?? null,
        buddyAgentId: launchContext.payload.buddyAgentId,
        ownerId: launchContext.payload.ownerId,
      }
    } catch {
      const commandContext = await spaceAppService.introspectCommandToken(token)
      if (!commandContext.active || !commandContext.shadow?.actor?.userId) {
        return c.json({ ok: false, error: commandContext.error ?? 'invalid_app_token' }, 401)
      }
      if (
        commandContext.shadow.serverId !== c.req.param('serverId') ||
        commandContext.shadow.appKey !== c.req.param('appKey')
      ) {
        return c.json({ ok: false, error: 'command_token_app_mismatch' }, 403)
      }
      const installedSpaceApp = await container
        .resolve('spaceAppDao')
        .findById(commandContext.shadow.spaceAppId)
      if (!installedSpaceApp) return c.json({ ok: false, error: 'space_app_not_installed' }, 404)
      app = installedSpaceApp
      tokenActor = commandContext.shadow.actor
    }
    if (!tokenActor.userId) return c.json({ ok: false, error: 'user_bound_token_required' }, 403)
    const actor: Actor =
      tokenActor.kind === 'agent'
        ? {
            kind: 'agent',
            userId: tokenActor.userId,
            agentId: tokenActor.buddyAgentId ?? undefined,
            ownerId: tokenActor.ownerId ?? undefined,
            scopes: [],
          }
        : { kind: 'user', userId: tokenActor.userId, authMethod: 'jwt', scopes: [] }
    const result = await container.resolve('spaceAppNotificationService').publish({
      app,
      actor,
      ...parsed.data,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    return c.json(result, 202)
  })

  handler.use('/servers/:serverId/space-apps/*', authMiddleware)
  handler.use('/servers/:serverId/space-apps', authMiddleware)
  handler.use('/servers/:serverId/widgets/*', authMiddleware)
  handler.use('/servers/:serverId/widgets', authMiddleware)

  handler.get('/servers/:serverId/widgets', async (c) => {
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    const apps = await container
      .resolve('spaceAppService')
      .list(c.req.param('serverId'), c.get('actor'), { locale })
    return c.json(
      apps.flatMap((app) =>
        (app.manifest.widgets ?? []).map((definition) => {
          const localized = localizeShadowWidgetDefinition(definition, locale)
          return {
            sourceId: `${app.appKey}:${definition.key}`,
            provider: { id: app.appKey, name: app.name, iconUrl: app.iconUrl },
            definition: { ...localized, i18n: undefined },
          }
        }),
      ),
    )
  })

  handler.post('/servers/:serverId/widgets/:sourceId/data', async (c) => {
    const source = widgetSourceParts(c.req.param('sourceId'))
    if (!source) return c.json({ error: 'Invalid widget source' }, 404)
    const spaceAppService = container.resolve('spaceAppService')
    const app = await spaceAppService.get(c.req.param('serverId'), source.appKey, c.get('actor'))
    const definition = app.manifest.widgets?.find((widget) => widget.key === source.widgetKey)
    if (!definition) return c.json({ error: 'Widget not found' }, 404)
    const input = widgetDataRequestSchema.parse(await c.req.json().catch(() => ({})))
    const result = await spaceAppService.callCommand({
      serverIdOrSlug: c.req.param('serverId'),
      appKey: source.appKey,
      commandName: definition.data.command,
      actor: c.get('actor'),
      body: { input: widgetOptions(definition, input.options) },
    })
    const data = widgetData(result)
    if (!data) return c.json({ error: 'Widget command returned invalid data' }, 502)
    return c.json({ sourceId: c.req.param('sourceId'), data, updatedAt: new Date().toISOString() })
  })

  handler.get('/servers/:serverId/space-apps', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    if (c.req.query('summary') === '1') {
      const apps = await spaceAppService.listSummaries(c.req.param('serverId'), c.get('actor'), {
        locale,
      })
      return c.json(apps)
    }
    const apps = await spaceAppService.list(c.req.param('serverId'), c.get('actor'), {
      locale,
    })
    return c.json(apps)
  })

  handler.post(
    '/servers/:serverId/space-apps',
    zValidator('json', installSpaceAppSchema),
    async (c) => {
      const spaceAppService = container.resolve('spaceAppService')
      const app = await spaceAppService.install(
        c.req.param('serverId'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(app, 201)
    },
  )

  handler.post(
    '/servers/:serverId/space-apps/discover',
    zValidator('json', discoverSpaceAppSchema),
    async (c) => {
      const spaceAppService = container.resolve('spaceAppService')
      const discovery = await spaceAppService.discover(
        c.req.param('serverId'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(discovery)
    },
  )

  handler.get('/servers/:serverId/space-apps/catalog', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    const catalog = await spaceAppService.listCatalog(c.req.param('serverId'), c.get('actor'), {
      locale,
    })
    return c.json(catalog)
  })

  handler.post(
    '/servers/:serverId/space-apps/catalog/:catalogEntryId/install',
    zValidator('json', installSpaceAppFromCatalogSchema),
    async (c) => {
      const spaceAppService = container.resolve('spaceAppService')
      const app = await spaceAppService.installFromCatalog(
        c.req.param('serverId'),
        c.req.param('catalogEntryId'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(app, 201)
    },
  )

  handler.get('/servers/:serverId/space-apps/:appKey', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    const app = await spaceAppService.get(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
      { locale },
    )
    return c.json(app)
  })

  handler.delete('/servers/:serverId/space-apps/:appKey', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const result = await spaceAppService.delete(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(result)
  })

  handler.post(
    '/servers/:serverId/space-apps/:appKey/grants',
    zValidator('json', grantSpaceAppBuddySchema),
    async (c) => {
      const spaceAppService = container.resolve('spaceAppService')
      const grant = await spaceAppService.grant(
        c.req.param('serverId'),
        c.req.param('appKey'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(grant, 201)
    },
  )

  handler.patch(
    '/servers/:serverId/space-apps/:appKey/access-policy',
    zValidator('json', updateSpaceAppAccessPolicySchema),
    async (c) => {
      const spaceAppService = container.resolve('spaceAppService')
      const app = await spaceAppService.updateAccessPolicy(
        c.req.param('serverId'),
        c.req.param('appKey'),
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(app)
    },
  )

  handler.post(
    '/servers/:serverId/space-apps/:appKey/approvals',
    zValidator('json', approveSpaceAppCommandSchema),
    async (c) => {
      const spaceAppService = container.resolve('spaceAppService')
      const input = c.req.valid('json')
      const result = await spaceAppService.approveCommandAccess(
        c.req.param('serverId'),
        c.req.param('appKey'),
        c.get('actor'),
        input,
      )
      await notifySpaceAppApprovalGranted(container, c.get('actor'), {
        serverIdOrSlug: c.req.param('serverId'),
        appKey: c.req.param('appKey'),
        commandName: input.commandName,
        result,
      })
      return c.json(result, 201)
    },
  )

  handler.post('/servers/:serverId/space-apps/:appKey/launch', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const launch = await spaceAppService.createLaunch(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(launch)
  })

  handler.get('/servers/:serverId/space-apps/:appKey/skills', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
    const skills = await spaceAppService.skills(
      c.req.param('serverId'),
      c.req.param('appKey'),
      c.get('actor'),
    )
    return c.json(skills)
  })

  handler.post('/servers/:serverId/space-apps/:appKey/commands/:commandName', async (c) => {
    const spaceAppService = container.resolve('spaceAppService')
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
      const result = await spaceAppService.callCommand({
        serverIdOrSlug: c.req.param('serverId'),
        appKey: c.req.param('appKey'),
        commandName: c.req.param('commandName'),
        actor,
        body: callSpaceAppCommandSchema.parse({
          input: parseJsonField(fields.input ?? fields.payload),
          channelId: fields.channelId,
          task: fields.task ? parseJsonField(fields.task) : undefined,
        }),
        multipart: { fields, files },
        authorization: {
          onCommandApprovalRequired: (error) =>
            emitSpaceAppApprovalRequired(container, actor, error),
        },
      })
      return c.json(result)
    }

    const body = callSpaceAppCommandSchema.parse(await c.req.json().catch(() => ({})))
    const actor = c.get('actor')
    const result = await spaceAppService.callCommand({
      serverIdOrSlug: c.req.param('serverId'),
      appKey: c.req.param('appKey'),
      commandName: c.req.param('commandName'),
      actor,
      body,
      authorization: {
        onCommandApprovalRequired: (error) => emitSpaceAppApprovalRequired(container, actor, error),
      },
    })
    return c.json(result)
  })

  return handler
}
