import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  hasShadowServerAppPendingOutbox,
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  addCardArtifacts,
  assignCard,
  assignCardToPerson,
  commentCard,
  completeCard,
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  deleteComment,
  dispatchCard,
  getBoard,
  getCard,
  linkCards,
  listBoards,
  moveCard,
  rerunCard,
  updateBoard,
  updateCard,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import {
  compactOauthProfile,
  decodeSignedJson,
  encodeSignedJson,
  KANBAN_OAUTH_SESSION_COOKIE,
  type KanbanOAuthSession,
  kanbanOAuthAccessStatus,
  readKanbanOAuthSession,
  type ShadowLaunchIntrospection,
} from './oauth-access.js'
import {
  buildCardDispatchInboxTask,
  enrichDispatchInputFromContext,
  normalizeDispatchInput,
} from './outbox.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import type { BoardUpdateInput, CardCreateInput, CardUpdateInput } from './types.js'
import { shellPage } from './ui.js'

type KanbanCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>
type RuntimeErrorPayload = { ok: false; error: string; code?: string; params?: unknown }
type CommandScopeInput = { projectId?: string | null; boardId?: string | null }

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

function shadowApiBaseUrl() {
  return (process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002').replace(/\/$/, '')
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function publicBaseUrl() {
  return trimTrailingSlash(
    process.env.KANBAN_PUBLIC_BASE_URL ??
      process.env.SHADOW_APP_PUBLIC_BASE_URL ??
      `http://localhost:${Number(process.env.PORT ?? 4201)}`,
  )
}

function shadowWebBaseUrl() {
  return trimTrailingSlash(
    process.env.SHADOW_WEB_BASE_URL ??
      process.env.SHADOW_OAUTH_AUTHORIZE_BASE_URL ??
      'http://localhost:3000',
  )
}

function oauthRedirectUri() {
  return process.env.KANBAN_OAUTH_REDIRECT_URI ?? `${publicBaseUrl()}/shadow/oauth/callback`
}

function oauthConfig() {
  const clientId = process.env.KANBAN_OAUTH_CLIENT_ID
  const clientSecret = process.env.KANBAN_OAUTH_CLIENT_SECRET
  return clientId && clientSecret
    ? {
        configured: true as const,
        clientId,
        clientSecret,
        redirectUri: oauthRedirectUri(),
        scope: process.env.KANBAN_OAUTH_SCOPE ?? 'user:read',
      }
    : { configured: false as const }
}

function cookieSecret() {
  return (
    process.env.KANBAN_OAUTH_COOKIE_SECRET ??
    process.env.SERVER_APP_SECRET ??
    process.env.KANBAN_OAUTH_CLIENT_SECRET ??
    'kanban-local-oauth-cookie-secret'
  )
}

function decodeLaunchTokenHint(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'sat_v1') return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      serverId?: unknown
      appKey?: unknown
    }
    if (typeof payload.serverId !== 'string' || typeof payload.appKey !== 'string') return null
    return { serverId: payload.serverId, appKey: payload.appKey }
  } catch {
    return null
  }
}

async function introspectShadowLaunchToken(token: string) {
  const hint = decodeLaunchTokenHint(token)
  if (!hint) return null
  const response = await fetch(
    `${shadowApiBaseUrl()}/api/servers/${encodeURIComponent(hint.serverId)}/apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/introspect`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  ).catch(() => null)
  if (!response?.ok) return null
  const payload = (await response.json().catch(() => null)) as ShadowLaunchIntrospection | null
  return payload?.active ? payload : null
}

function safeReturnTo(value: string | undefined) {
  if (!value) return '/shadow/server'
  try {
    const parsed = new URL(value, 'http://kanban.local')
    if (parsed.origin !== 'http://kanban.local') return '/shadow/server'
    if (!parsed.pathname.startsWith('/shadow/server')) return '/shadow/server'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/shadow/server'
  }
}

function createOauthState(returnTo: string, options: { popup?: boolean } = {}) {
  return encodeSignedJson(
    {
      nonce: randomBytes(16).toString('base64url'),
      returnTo,
      popup: options.popup === true,
      expiresAt: Date.now() + 10 * 60 * 1000,
    },
    cookieSecret(),
  )
}

function oauthAuthorizeUrl(returnTo: string, options: { popup?: boolean } = {}) {
  const config = oauthConfig()
  if (!config.configured) return null
  const url = new URL('/app/oauth/authorize', shadowWebBaseUrl())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', createOauthState(returnTo, options))
  return url.toString()
}

function shadowLaunchToken(c: Context) {
  return c.req.header('X-Shadow-Launch-Token') ?? ''
}

function launchSummary(launch: ShadowLaunchIntrospection | null) {
  if (!launch?.shadow) return null
  const actor = launch.shadow.actor
  return {
    active: true,
    serverId: launch.shadow.serverId,
    appKey: launch.shadow.appKey,
    actor: {
      kind: actor.kind,
      userId: actor.userId ?? null,
      buddyAgentId: actor.buddyAgentId ?? null,
      ownerId: actor.ownerId ?? null,
      displayName: actor.profile?.displayName ?? null,
      avatarUrl: actor.profile?.avatarUrl ?? null,
    },
  }
}

function requestScopeInput(c: Context): CommandScopeInput {
  return {
    projectId: c.req.query('projectId') ?? null,
    boardId: c.req.query('boardId') ?? null,
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    return recordValue(JSON.parse(value))
  } catch {
    return null
  }
}

function errorPayload(error: unknown): RuntimeErrorPayload {
  const record = recordValue(error)
  const payload = recordValue(record?.payload)
  const source = payload ?? record
  const message =
    (typeof source?.error === 'string' && source.error) ||
    (typeof source?.message === 'string' && source.message) ||
    (error instanceof Error ? error.message : 'Command failed')
  return {
    ok: false,
    error: message,
    ...(typeof source?.code === 'string' ? { code: source.code } : {}),
    ...(source?.params ? { params: source.params } : {}),
  }
}

function errorStatus(error: unknown) {
  const status = recordValue(error)?.status
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500
}

function runtimeHttpError(status: number, error: string, code = error) {
  return Object.assign(new Error(error), { status, payload: { error, code } })
}

function readRuntimeOAuthSession(c: Context) {
  return readKanbanOAuthSession(getCookie(c, KANBAN_OAUTH_SESSION_COOKIE), cookieSecret())
}

function deleteRuntimeOAuthSession(c: Context) {
  deleteCookie(c, KANBAN_OAUTH_SESSION_COOKIE, { path: '/' })
}

function oauthStatusForLaunch(
  c: Context,
  launch: ShadowLaunchIntrospection | null,
  session = readRuntimeOAuthSession(c),
) {
  const config = oauthConfig()
  return kanbanOAuthAccessStatus({
    configured: config.configured,
    required: runtimeOAuthRequired,
    session,
    launch,
  })
}

function requireRuntimeOAuthSession(c: Context, launch: ShadowLaunchIntrospection) {
  const session = readRuntimeOAuthSession(c)
  const status = oauthStatusForLaunch(c, launch, session)
  if (status.authenticated) return session
  if (status.reason === 'oauth_identity_mismatch') deleteRuntimeOAuthSession(c)
  if (status.reason === 'oauth_not_configured') {
    throw runtimeHttpError(503, 'oauth_not_configured', status.reason)
  }
  throw runtimeHttpError(401, status.reason ?? 'oauth_required', status.reason ?? 'oauth_required')
}

function actorWithOAuthProfile(
  launch: ShadowLaunchIntrospection,
  session: KanbanOAuthSession | null,
) {
  const actor = launch.shadow!.actor
  if (!session?.profile) return actor
  const actorIdentity = actor as typeof actor & {
    displayName?: string | null
    avatarUrl?: string | null
  }
  const profile = {
    id: session.profile.id,
    username: session.profile.username ?? undefined,
    displayName: session.profile.displayName ?? session.profile.username ?? session.profile.id,
    avatarUrl: session.profile.avatarUrl ?? null,
  }
  return {
    ...actor,
    userId: actor.userId ?? profile.id,
    displayName: actorIdentity.displayName ?? profile.displayName,
    avatarUrl: actorIdentity.avatarUrl ?? profile.avatarUrl,
    profile: {
      ...(actor.profile ?? {}),
      ...profile,
    },
  }
}

async function fetchLaunchInboxesFromShadow(token: string) {
  const hint = decodeLaunchTokenHint(token)
  if (!hint) return { inboxes: [] }
  const res = await fetch(
    `${shadowApiBaseUrl()}/api/servers/${encodeURIComponent(hint.serverId)}/apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/inboxes`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(await res.text().catch(() => 'Shadow launch inbox lookup failed'))
  return (await res.json()) as { inboxes: unknown[] }
}

async function deliverLaunchOutboxToShadow(token: string, commandName: string, result: unknown) {
  const hint = decodeLaunchTokenHint(token)
  if (!hint) return result
  const res = await fetch(
    `${shadowApiBaseUrl()}/api/servers/${encodeURIComponent(hint.serverId)}/apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/outbox`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandName, result }),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const payload = parseJsonObject(text)
    const message =
      (typeof payload?.error === 'string' && payload.error) ||
      (typeof payload?.message === 'string' && payload.message) ||
      text ||
      'Shadow launch outbox failed'
    throw Object.assign(new Error(message), { status: res.status, payload: payload ?? undefined })
  }
  return res.json()
}

async function launchInboxes(c: Context) {
  const token = shadowLaunchToken(c)
  if (!token) return c.json({ inboxes: [] })
  try {
    const launch = await introspectShadowLaunchToken(token)
    if (!launch?.shadow) {
      throw runtimeHttpError(401, 'invalid_launch_token', 'invalid_launch_token')
    }
    const session = requireRuntimeOAuthSession(c, launch)
    return c.json(await fetchLaunchInboxesFromShadow(token))
  } catch (err) {
    return c.json(errorPayload(err), errorStatus(err) as 500)
  }
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const token = shadowLaunchToken(c)
  if (!token || !hasShadowServerAppPendingOutbox(result.body)) return result.body
  return deliverLaunchOutboxToShadow(token, commandName, result.body)
}

export const app = new Hono()
const port = Number(process.env.PORT ?? 4201)
const localCommandsEnabled = process.env.KANBAN_ENABLE_LOCAL_COMMANDS === 'true'
const runtimeOAuthRequired = process.env.KANBAN_REQUIRE_OAUTH !== 'false'
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'boards.get': (input, runtime) => ({
    board: getBoard(commandScope(runtime.context, input)),
    calledBy: runtime.actor,
  }),
  'boards.list': (input, runtime) => ({
    boards: listBoards(commandScope(runtime.context, input)),
  }),
  'boards.create': (input, runtime) => ({
    board: createBoard(input, commandScope(runtime.context, input), runtime.actor),
  }),
  'boards.update': (input, runtime) => {
    const board = updateBoard(input as BoardUpdateInput, commandScope(runtime.context, input))
    if (!board) throw shadowApp.error(400, 'invalid_board_title')
    return { board }
  },
  'boards.delete': (input, runtime) => {
    const result = deleteBoard(input, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'board_not_found')
    return result
  },
  'columns.create': (input, runtime) => ({
    column: createColumn(input, commandScope(runtime.context, input)),
    board: getBoard(commandScope(runtime.context, input)),
  }),
  'columns.delete': (input, runtime) => {
    const result = deleteColumn(input, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'column_not_found')
    return result
  },
  'cards.get': (input, runtime) => {
    const card = getCard(input.cardId, commandScope(runtime.context, input))
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.create': (input, runtime) => ({
    card: createCard(
      { ...(input as CardCreateInput), createdBy: runtime.actor },
      commandScope(runtime.context, input),
    ),
  }),
  'cards.delete': (input, runtime) => {
    const result = deleteCard(input, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
  'cards.update': (input, runtime) => {
    const card = updateCard(input as CardUpdateInput, commandScope(runtime.context, input))
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.move': (input, runtime) => {
    const card = moveCard(input.cardId, input.columnId, commandScope(runtime.context, input))
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.assign': (input, runtime) => {
    const card = input.assignee
      ? assignCard(input.cardId, input.assignee, commandScope(runtime.context, input))
      : assignCardToPerson(input.cardId, runtime.actor, commandScope(runtime.context, input))
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.dispatch': (input, context) => {
    const normalizedInput = enrichDispatchInputFromContext(
      normalizeDispatchInput(input),
      context.context,
    )
    const { actor } = context
    const result = dispatchCard(normalizedInput, actor, commandScope(context.context, input))
    if (!result) throw shadowApp.error(404, 'card_not_found')
    const { card, assignee } = result
    if ('deferred' in result && result.deferred) {
      return { card, deferred: result.deferred }
    }
    const outbox = new ShadowServerAppOutbox().enqueueInboxTask(
      buildCardDispatchInboxTask({ dispatch: normalizedInput, card, assignee }),
    )
    return outbox.attachTo({ card })
  },
  'cards.comment': (input, runtime) => {
    const card = commentCard(
      input.cardId,
      input.body,
      runtime.actor,
      commandScope(runtime.context, input),
    )
    if (!card) throw shadowApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.comments.delete': (input, runtime) => {
    const result = deleteComment(input, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'comment_not_found')
    return result
  },
  'cards.complete': (input, runtime) => {
    const result = completeCard(input, runtime.actor, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'card_not_found')
    if ('blocked' in result && result.blocked) {
      throw shadowApp.error(409, 'card_completion_blocked', result.blocked)
    }
    return result
  },
  'cards.link': (input, runtime) => {
    const result = linkCards(input, runtime.actor, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
  'cards.rerun': (input, runtime) => {
    const result = rerunCard(
      input.cardId,
      {
        prompt: input.prompt,
        reason: input.reason,
      },
      commandScope(runtime.context, input),
    )
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
  'cards.artifacts.add': (input, runtime) => {
    const result = addCardArtifacts(input, runtime.actor, commandScope(runtime.context, input))
    if (!result) throw shadowApp.error(404, 'card_not_found')
    return result
  },
})

function commandName(value: string): KanbanCommandName | null {
  return commandNames.has(value) ? (value as KanbanCommandName) : null
}

function localContext(command: KanbanCommandName): ShadowServerAppCommandContext {
  const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
  return {
    protocol: 'shadow.app/1',
    serverId: 'local',
    serverAppId: 'local',
    appKey: shadowServerAppManifest.appKey,
    command,
    actor: {
      kind: 'local',
      userId: 'local',
      profile: {
        id: 'local',
        displayName: 'Local User',
        avatarUrl: null,
      },
    },
    permission: manifestCommand?.permission ?? 'local',
    action: manifestCommand?.action ?? 'read',
    dataClass: manifestCommand?.dataClass ?? 'server-private',
  }
}

function commandScope(
  context: ShadowServerAppCommandContext,
  input?: CommandScopeInput | Record<string, unknown> | null,
) {
  const projectId = typeof input?.projectId === 'string' ? input.projectId : null
  const boardId = typeof input?.boardId === 'string' ? input.boardId : null
  return {
    serverId: context.serverId,
    projectId: projectId ?? 'default',
    boardId: boardId ?? 'kanban',
  }
}

async function runtimeContext(command: KanbanCommandName, c: Context) {
  const token = shadowLaunchToken(c)
  if (token) {
    const launch = await introspectShadowLaunchToken(token)
    if (!launch?.shadow) {
      throw Object.assign(new Error('invalid_launch_token'), { status: 401 })
    }
    const session = requireRuntimeOAuthSession(c, launch)
    const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
    return {
      protocol: 'shadow.app/1' as const,
      serverId: launch.shadow.serverId,
      serverAppId: launch.shadow.serverAppId ?? 'launch',
      appKey: launch.shadow.appKey,
      command,
      actor: actorWithOAuthProfile(launch, session),
      resources: launch.shadow.resources ?? null,
      permission: manifestCommand?.permission ?? 'local',
      action: manifestCommand?.action ?? 'read',
      dataClass: manifestCommand?.dataClass ?? 'server-private',
    } satisfies ShadowServerAppCommandContext
  }
  if (!localCommandsEnabled) {
    throw Object.assign(new Error('local_commands_disabled'), { status: 403 })
  }
  return localContext(command)
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#0f172a"/>
  <rect x="18" y="22" width="18" height="52" rx="5" fill="#60a5fa"/>
  <rect x="40" y="22" width="18" height="52" rx="5" fill="#22c55e"/>
  <rect x="62" y="22" width="18" height="52" rx="5" fill="#f97316"/>
  <path d="M24 34h6M46 34h6M68 34h6M24 46h6M46 46h6M68 46h6" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/artifacts/*', serveStatic({ root: fromAppRoot('data') }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.get('/api/oauth/session', async (c) => {
  const returnTo = safeReturnTo(c.req.query('return_to'))
  const popup = c.req.query('popup') === '1'
  const config = oauthConfig()
  let session = readRuntimeOAuthSession(c)
  if (!session) deleteRuntimeOAuthSession(c)
  const token = shadowLaunchToken(c)
  const launch = token ? await introspectShadowLaunchToken(token) : null
  const access = kanbanOAuthAccessStatus({
    configured: config.configured,
    required: runtimeOAuthRequired,
    session,
    launch,
  })
  if (access.reason === 'oauth_identity_mismatch') {
    deleteRuntimeOAuthSession(c)
    session = null
  }
  const authenticated = access.authenticated
  const canAuthorize =
    access.reason === 'oauth_required' || access.reason === 'oauth_identity_mismatch'
  return c.json({
    configured: config.configured,
    required: runtimeOAuthRequired,
    authenticated,
    reason: access.reason,
    subject: access.subject,
    profile: authenticated || !runtimeOAuthRequired ? (session?.profile ?? null) : null,
    authorizeUrl: canAuthorize ? oauthAuthorizeUrl(returnTo, { popup }) : null,
    launch: launchSummary(launch),
  })
})

app.get('/shadow/oauth/start', (c) => {
  const returnTo = safeReturnTo(c.req.query('return_to'))
  const authorizeUrl = oauthAuthorizeUrl(returnTo, {
    popup: c.req.query('popup') === '1',
  })
  if (!authorizeUrl) return c.text('Kanban OAuth is not configured.', 503)
  return c.redirect(authorizeUrl, 302)
})

app.get('/shadow/oauth/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')
  const state = decodeSignedJson<{
    returnTo?: string
    expiresAt?: number
    popup?: boolean
  }>(c.req.query('state'), cookieSecret())
  if (error) {
    const returnTo =
      state?.returnTo && state.expiresAt && state.expiresAt > Date.now()
        ? safeReturnTo(state.returnTo)
        : '/shadow/server'
    const redirectUrl = new URL(returnTo, 'http://kanban.local')
    redirectUrl.searchParams.set('oauth_error', error)
    return c.redirect(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`, 302)
  }
  if (!state?.returnTo || !state.expiresAt || state.expiresAt <= Date.now()) {
    return c.text('Invalid OAuth state.', 400)
  }
  if (!code) return c.text('Missing OAuth code.', 400)
  const config = oauthConfig()
  if (!config.configured) return c.text('Kanban OAuth is not configured.', 503)

  const tokenResponse = await fetch(`${shadowApiBaseUrl()}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  })
  if (!tokenResponse.ok) return c.text('OAuth token exchange failed.', 401)
  const token = (await tokenResponse.json()) as {
    access_token: string
    expires_in: number
    scope: string
  }

  const userInfoResponse = await fetch(`${shadowApiBaseUrl()}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userInfoResponse.ok) return c.text('OAuth userinfo failed.', 401)
  const profile = compactOauthProfile(
    (await userInfoResponse.json()) as KanbanOAuthSession['profile'],
  )
  const expiresAt = Date.now() + Math.max(60, token.expires_in) * 1000
  const session: KanbanOAuthSession = {
    profile,
    scope: token.scope,
    expiresAt,
  }
  setCookie(c, KANBAN_OAUTH_SESSION_COOKIE, encodeSignedJson(session, cookieSecret()), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.max(60, token.expires_in),
  })
  return c.redirect(safeReturnTo(state.returnTo), 302)
})

app.get('/api/board', async (c) => {
  try {
    const context = await runtimeContext('boards.get', c)
    return c.json(getBoard(commandScope(context, requestScopeInput(c))))
  } catch (err) {
    return c.json(errorPayload(err), errorStatus(err) as 500)
  }
})
app.get('/api/runtime/inboxes', launchInboxes)
app.get('/api/local/inboxes', launchInboxes)

async function runtimeCommand(c: Context) {
  const rawName = c.req.param('commandName')
  if (!rawName) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const name = commandName(rawName)
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  try {
    const context = await runtimeContext(name, c)
    const result = await shadowApp.executeLocal(name, body.input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (err) {
    return c.json(errorPayload(err), errorStatus(err) as 500)
  }
}

app.post('/api/runtime/commands/:commandName', runtimeCommand)
app.post('/api/local/commands/:commandName', runtimeCommand)

app.post('/api/shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const result = await shadowApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
      serverIdHeader: c.req.header('X-Shadow-Server-Id'),
      appKeyHeader: c.req.header('X-Shadow-App-Key'),
      requestBody: await c.req.text(),
    },
    commands,
  )
  return c.json(result.body, result.status as 200)
})

export function startStandalone() {
  serve({ fetch: app.fetch, port })
  console.log(`Kanban listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
