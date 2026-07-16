import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  deliverShadowSpaceAppLaunchOutbox,
  ensureShadowSpaceAppLaunchBuddyTaskGrant,
  fetchShadowSpaceAppLaunchInboxes,
  hasShadowSpaceAppPendingOutbox,
  SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL,
  type ShadowSpaceAppActorRef,
  type ShadowSpaceAppCommandContext,
  type ShadowSpaceAppCommandName,
  ShadowSpaceAppOutbox,
  shadowSpaceAppApiBaseUrl,
  shadowSpaceAppAvatarRedirectUrl,
  shadowSpaceAppIdentitySnapshot,
  shadowSpaceAppLaunchIntrospectionError,
  shadowSpaceAppPublicBaseUrl,
} from '@shadowob/sdk'
import { createShadowSpaceAppSessionManager } from '@shadowob/sdk/space-app/node'
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
  restoreBoardSnapshot,
  snapshotBoard,
  updateBoard,
  updateCard,
} from './data.js'
import { manifest, shadowSpaceApp } from './manifest.js'
import {
  compactOauthProfile,
  decodeSignedJson,
  encodeSignedJson,
  KANBAN_OAUTH_SESSION_COOKIE,
  type KanbanOAuthSession,
  kanbanOAuthAccessStatus,
  kanbanOAuthSessionMaxAgeSeconds,
  readKanbanOAuthSession,
  type ShadowLaunchIntrospection,
} from './oauth-access.js'
import {
  buildCardDispatchInboxTask,
  enrichDispatchInputFromContext,
  normalizeDispatchInput,
} from './outbox.js'
import { shadowSpaceAppManifest } from './space-app.generated.js'
import type { BoardPerson, BoardUpdateInput, CardCreateInput, CardUpdateInput } from './types.js'
import { shellPage } from './ui.js'

type KanbanCommandName = ShadowSpaceAppCommandName<typeof shadowSpaceAppManifest>
type RuntimeErrorPayload = { ok: false; error: string; code?: string; params?: unknown }
type CommandScopeInput = { projectId?: string | null; boardId?: string | null }

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)

function shadowApiBaseUrl() {
  return shadowSpaceAppApiBaseUrl(process.env)
}

const appSessions = createShadowSpaceAppSessionManager({
  appKey: shadowSpaceAppManifest.appKey,
  shadowApiBaseUrl: shadowApiBaseUrl(),
})

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function publicBaseUrl() {
  return trimTrailingSlash(
    process.env.KANBAN_PUBLIC_BASE_URL ??
      process.env.SHADOWOB_APP_PUBLIC_BASE_URL ??
      `http://localhost:${Number(process.env.PORT ?? 4201)}`,
  )
}

function shadowWebBaseUrl() {
  return shadowSpaceAppPublicBaseUrl(process.env)
}

function redirectShadowAvatar(c: Context) {
  const response = c.redirect(shadowSpaceAppAvatarRedirectUrl(c.req.url, process.env), 302)
  response.headers.set('Cache-Control', SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL)
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
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
    process.env.SPACE_APP_SECRET ??
    process.env.KANBAN_OAUTH_CLIENT_SECRET ??
    'kanban-local-oauth-cookie-secret'
  )
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

async function shadowLaunchToken(c: Context, requireCsrf = true) {
  const session = await appSessions.authorizedSession({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    requireCsrf,
  })
  return session?.launchToken ?? ''
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

function launchFromContext(context: ShadowSpaceAppCommandContext): ShadowLaunchIntrospection {
  return {
    active: true,
    shadow: {
      ...context,
      serverId: context.serverId,
      spaceAppId: context.spaceAppId,
      appKey: context.appKey,
      actor: context.actor,
    },
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

function boardPerson(actor: ShadowSpaceAppActorRef): BoardPerson {
  return shadowSpaceAppIdentitySnapshot(actor)
}

function commandDefinition(command: KanbanCommandName) {
  return shadowSpaceAppManifest.commands.find((item) => item.name === command)
}

function standaloneRuntimeContext(
  command: KanbanCommandName,
  session: KanbanOAuthSession | null,
): ShadowSpaceAppCommandContext {
  const definition = commandDefinition(command)
  const profile = session?.profile
  return {
    protocol: 'shadow.space-app/1',
    serverId: 'local',
    spaceAppId: 'kanban-standalone',
    appKey: shadowSpaceAppManifest.appKey,
    command,
    actor: profile
      ? {
          kind: 'user',
          userId: profile.id,
          ownerId: profile.id,
          profile: {
            id: profile.id,
            username: profile.username ?? null,
            displayName: profile.displayName ?? profile.username ?? profile.id,
            avatarUrl: profile.avatarUrl ?? null,
          },
        }
      : {
          kind: 'local',
          userId: null,
          ownerId: 'kanban-local',
          profile: {
            id: 'kanban-local',
            displayName: 'Local Kanban',
            avatarUrl: null,
          },
        },
    permission: definition?.permission ?? 'kanban.boards:read',
    action: definition?.action ?? 'read',
    dataClass: definition?.dataClass ?? 'server-private',
  }
}

function requireStandaloneRuntimeContext(command: KanbanCommandName, c: Context) {
  const config = oauthConfig()
  const session = config.configured ? readRuntimeOAuthSession(c) : null
  if (runtimeOAuthRequired) {
    if (!config.configured) throw runtimeHttpError(503, 'oauth_not_configured')
    if (!session) throw runtimeHttpError(401, 'oauth_required')
  }
  return standaloneRuntimeContext(command, session)
}

async function launchInboxes(c: Context) {
  const launchSession = await appSessions.authorizedSession({
    cookieHeader: c.req.header('cookie'),
    requireCsrf: false,
  })
  if (!launchSession) {
    const error = runtimeHttpError(401, 'launch_required', 'launch_required')
    return c.json(errorPayload(error), 401)
  }
  try {
    const launch = launchSession.launch
    if (!launch?.active || !launch.shadow) {
      throw runtimeHttpError(
        401,
        shadowSpaceAppLaunchIntrospectionError(launch),
        'invalid_launch_token',
      )
    }
    if (runtimeOAuthRequired) requireRuntimeOAuthSession(c, launch)
    return c.json(
      await fetchShadowSpaceAppLaunchInboxes({
        launchToken: launchSession.launchToken,
        shadowApiBaseUrl: shadowApiBaseUrl(),
      }),
    )
  } catch (err) {
    return c.json(errorPayload(err), errorStatus(err) as 500)
  }
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const token = await shadowLaunchToken(c)
  if (!token || !hasShadowSpaceAppPendingOutbox(result.body)) return result.body
  return deliverShadowSpaceAppLaunchOutbox({
    launchToken: token,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

export const app = new Hono()
const port = Number(process.env.PORT ?? 4201)
const runtimeOAuthRequired = process.env.KANBAN_REQUIRE_OAUTH === 'true'
const commandNames = new Set<string>(shadowSpaceAppManifest.commands.map((command) => command.name))
const iconCacheControl = 'public, max-age=3600'

const commands = shadowSpaceApp.defineCommands({
  'boards.get': (input, runtime) => ({
    board: getBoard(commandScope(runtime.context, input)),
    calledBy: runtime.actor,
  }),
  'boards.list': (input, runtime) => ({
    boards: listBoards(commandScope(runtime.context, input)),
  }),
  'boards.create': (input, runtime) => ({
    board: createBoard(input, commandScope(runtime.context, input), boardPerson(runtime.actor)),
  }),
  'boards.update': (input, runtime) => {
    const board = updateBoard(input as BoardUpdateInput, commandScope(runtime.context, input))
    if (!board) throw shadowSpaceApp.error(400, 'invalid_board_title')
    return { board }
  },
  'boards.delete': (input, runtime) => {
    const result = deleteBoard(input, commandScope(runtime.context, input))
    if (!result) throw shadowSpaceApp.error(404, 'board_not_found')
    return result
  },
  'columns.create': (input, runtime) => ({
    column: createColumn(input, commandScope(runtime.context, input)),
    board: getBoard(commandScope(runtime.context, input)),
  }),
  'columns.delete': (input, runtime) => {
    const result = deleteColumn(input, commandScope(runtime.context, input))
    if (!result) throw shadowSpaceApp.error(404, 'column_not_found')
    return result
  },
  'cards.get': (input, runtime) => {
    const card = getCard(input.cardId, commandScope(runtime.context, input))
    if (!card) throw shadowSpaceApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.create': (input, runtime) => ({
    card: createCard(
      { ...(input as CardCreateInput), createdBy: boardPerson(runtime.actor) },
      commandScope(runtime.context, input),
    ),
  }),
  'cards.delete': (input, runtime) => {
    const result = deleteCard(input, commandScope(runtime.context, input))
    if (!result) throw shadowSpaceApp.error(404, 'card_not_found')
    return result
  },
  'cards.update': (input, runtime) => {
    const card = updateCard(input as CardUpdateInput, commandScope(runtime.context, input))
    if (!card) throw shadowSpaceApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.move': (input, runtime) => {
    const card = moveCard(input.cardId, input.columnId, commandScope(runtime.context, input))
    if (!card) throw shadowSpaceApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.assign': (input, runtime) => {
    const card = input.assignee
      ? assignCard(input.cardId, input.assignee, commandScope(runtime.context, input))
      : assignCardToPerson(
          input.cardId,
          boardPerson(runtime.actor),
          commandScope(runtime.context, input),
        )
    if (!card) throw shadowSpaceApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.dispatch': (input, context) => {
    const normalizedInput = enrichDispatchInputFromContext(
      normalizeDispatchInput(input),
      context.context,
    )
    const actor = boardPerson(context.actor)
    const result = dispatchCard(normalizedInput, actor, commandScope(context.context, input))
    if (!result) throw shadowSpaceApp.error(404, 'card_not_found')
    const { card, assignee } = result
    if ('deferred' in result && result.deferred) {
      return { card, deferred: result.deferred }
    }
    const outbox = new ShadowSpaceAppOutbox().enqueueInboxTask(
      buildCardDispatchInboxTask({ dispatch: normalizedInput, card, assignee }),
    )
    return outbox.attachTo({ card })
  },
  'cards.comment': (input, runtime) => {
    const card = commentCard(
      input.cardId,
      input.body,
      boardPerson(runtime.actor),
      commandScope(runtime.context, input),
    )
    if (!card) throw shadowSpaceApp.error(404, 'card_not_found')
    return { card }
  },
  'cards.comments.delete': (input, runtime) => {
    const result = deleteComment(input, commandScope(runtime.context, input))
    if (!result) throw shadowSpaceApp.error(404, 'comment_not_found')
    return result
  },
  'cards.complete': (input, runtime) => {
    const result = completeCard(
      input,
      boardPerson(runtime.actor),
      commandScope(runtime.context, input),
    )
    if (!result) throw shadowSpaceApp.error(404, 'card_not_found')
    if ('blocked' in result && result.blocked) {
      throw shadowSpaceApp.error(409, 'card_completion_blocked', result.blocked)
    }
    return result
  },
  'cards.link': (input, runtime) => {
    const result = linkCards(
      input,
      boardPerson(runtime.actor),
      commandScope(runtime.context, input),
    )
    if (!result) throw shadowSpaceApp.error(404, 'card_not_found')
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
    if (!result) throw shadowSpaceApp.error(404, 'card_not_found')
    return result
  },
  'cards.artifacts.add': (input, runtime) => {
    const result = addCardArtifacts(
      input,
      boardPerson(runtime.actor),
      commandScope(runtime.context, input),
    )
    if (!result) throw shadowSpaceApp.error(404, 'card_not_found')
    return result
  },
})

function commandName(value: string): KanbanCommandName | null {
  return commandNames.has(value) ? (value as KanbanCommandName) : null
}

function commandScope(
  context: ShadowSpaceAppCommandContext,
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
  const resolution = await appSessions.commandContext({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    commandName: command,
    manifest: shadowSpaceAppManifest,
  })
  if (resolution.context) {
    const context = resolution.context
    if (runtimeOAuthRequired) requireRuntimeOAuthSession(c, launchFromContext(context))
    return context
  }
  if (resolution.error === 'invalid_session') {
    throw runtimeHttpError(401, 'invalid_session', 'invalid_session')
  }
  return requireStandaloneRuntimeContext(command, c)
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

app.get('/.well-known/space-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/artifacts/*', serveStatic({ root: fromAppRoot('data') }))
app.get('/api/media/avatar/:bucket/:key{.+}', redirectShadowAvatar)
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.get('/api/oauth/session', async (c) => {
  const returnTo = safeReturnTo(c.req.query('return_to'))
  const popup = c.req.query('popup') === '1'
  const config = oauthConfig()
  let session = readRuntimeOAuthSession(c)
  if (!session) deleteRuntimeOAuthSession(c)
  const appSession = await appSessions.session(c.req.header('cookie'))
  const launch = appSession?.launch ?? null
  const access = oauthStatusForLaunch(c, launch, session)
  if (access.reason === 'oauth_identity_mismatch') {
    deleteRuntimeOAuthSession(c)
    session = null
  }
  const canAuthorize =
    Boolean(config.configured) &&
    !access.oauthAuthenticated &&
    (access.reason === 'oauth_required' ||
      access.reason === 'oauth_identity_mismatch' ||
      !runtimeOAuthRequired)
  return c.json({
    configured: config.configured,
    required: runtimeOAuthRequired,
    authenticated: access.authenticated,
    launchAuthenticated: access.launchAuthenticated,
    oauthAuthenticated: access.oauthAuthenticated,
    reason: access.reason,
    subject: access.subject,
    profile: access.oauthAuthenticated ? (session?.profile ?? null) : null,
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
  const sessionMaxAgeSeconds = kanbanOAuthSessionMaxAgeSeconds()
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000
  const session: KanbanOAuthSession = {
    profile,
    scope: token.scope,
    expiresAt,
  }
  setCookie(c, KANBAN_OAUTH_SESSION_COOKIE, encodeSignedJson(session, cookieSecret()), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds,
  })
  return c.redirect(safeReturnTo(state.returnTo), 302)
})

app.get('/api/inboxes', launchInboxes)

app.post('/api/shadow/session', async (c) => {
  const result = await appSessions.exchange({
    authorizationHeader: c.req.header('authorization'),
    cookieHeader: c.req.header('cookie'),
    requestUrl: c.req.url,
  })
  if (result.ok) c.header('Set-Cookie', result.setCookie)
  return c.json(result.body, result.status)
})

app.get('/api/shadow/events', async (c) => {
  const response = await appSessions.eventStream({
    cookieHeader: c.req.header('cookie'),
    lastEventId: c.req.header('last-event-id'),
  })
  return response ?? c.json({ ok: false, error: 'session_required' }, 401)
})

app.post('/api/shadow/buddy-grants/ensure', async (c) => {
  const session = await appSessions.authorizedSession({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
  })
  if (!session) return c.json({ ok: false, error: 'session_required' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as {
    buddyAgentId?: unknown
    permissions?: unknown
    reason?: unknown
  }
  if (typeof body.buddyAgentId !== 'string' || typeof body.reason !== 'string') {
    return c.json({ ok: false, error: 'invalid_buddy_grant' }, 422)
  }
  return c.json(
    await ensureShadowSpaceAppLaunchBuddyTaskGrant({
      launchToken: session.launchToken,
      shadowApiBaseUrl: shadowApiBaseUrl(),
      input: {
        buddyAgentId: body.buddyAgentId,
        permissions: Array.isArray(body.permissions)
          ? body.permissions.filter((item): item is string => typeof item === 'string')
          : [BUDDY_INBOX_DELIVERY_PERMISSION],
        reason: body.reason,
      },
    }),
  )
})

async function runtimeCommand(c: Context) {
  const rawName = c.req.param('commandName')
  if (!rawName) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const name = commandName(rawName)
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  try {
    const context = await runtimeContext(name, c)
    const scope = commandScope(context, body.input as CommandScopeInput | Record<string, unknown>)
    const rollbackBoard = name === 'cards.dispatch' ? snapshotBoard(scope) : null
    const result = await shadowSpaceApp.executeLocal(name, body.input ?? {}, context, commands)
    let bodyWithDeliveries: unknown
    try {
      bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    } catch (deliveryError) {
      if (rollbackBoard) restoreBoardSnapshot(rollbackBoard, scope)
      throw deliveryError
    }
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (err) {
    return c.json(errorPayload(err), errorStatus(err) as 500)
  }
}

app.post('/api/commands/:commandName', runtimeCommand)

app.post('/.shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const result = await shadowSpaceApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
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
