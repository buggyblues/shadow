import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { deliverShadowServerAppLaunchOutbox, hasShadowServerAppPendingOutbox } from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import {
  FlashArenaDao,
  FlashBoardDao,
  FlashCardDao,
  FlashCommandEventDao,
  FlashMutationReceiptDao,
  FlashSelectionDao,
} from '../dao/flash.dao.js'
import { createDatabase } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { commandName, defineCommandHandlers, localContext } from '../handler/commands.js'
import { manifest, shadowApp } from '../manifest.js'
import { errorMiddleware } from '../middleware/errors.js'
import { FlashService } from '../service/flash.service.js'
import { FlashRealtimeService } from '../service/realtime.service.js'
import { FlashScriptEngine } from '../service/script-engine.js'
import { shellPage } from '../ui.js'

const FLASH_OAUTH_SESSION_COOKIE = 'flash_oauth_session'

interface FlashOAuthSession {
  profile: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  }
  scope: string
  expiresAt: number
}

interface ShadowLaunchIntrospection {
  active: boolean
  shadow?: {
    serverId: string
    appKey: string
    actor: {
      kind: string
      userId: string | null
      buddyAgentId?: string | null
      ownerId?: string | null
    }
  }
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="18" x2="78" y1="18" y2="78">
      <stop stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="22" fill="#0f172a"/>
  <path d="M27 22h30L43 45h24L36 78l9-25H25l2-31Z" fill="url(#g)"/>
</svg>`
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function publicBaseUrl() {
  return trimTrailingSlash(process.env.SHADOW_APP_PUBLIC_BASE_URL ?? 'http://localhost:4216')
}

function uploadDir() {
  return process.env.FLASH_UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads')
}

function uploadContentType(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

function shadowApiBaseUrl() {
  return trimTrailingSlash(process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002')
}

function shadowLaunchToken(c: Context) {
  return c.req.header('X-Shadow-Launch-Token') ?? ''
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const launchToken = shadowLaunchToken(c)
  if (!launchToken || !hasShadowServerAppPendingOutbox(result.body)) return result.body
  return deliverShadowServerAppLaunchOutbox({
    launchToken,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

function shadowWebBaseUrl() {
  return trimTrailingSlash(
    process.env.SHADOW_WEB_BASE_URL ??
      process.env.SHADOW_OAUTH_AUTHORIZE_BASE_URL ??
      'http://localhost:3000',
  )
}

function oauthRedirectUri() {
  return process.env.FLASH_OAUTH_REDIRECT_URI ?? `${publicBaseUrl()}/shadow/oauth/callback`
}

function oauthConfig() {
  const clientId = process.env.FLASH_OAUTH_CLIENT_ID
  const clientSecret = process.env.FLASH_OAUTH_CLIENT_SECRET
  return clientId && clientSecret
    ? {
        configured: true as const,
        clientId,
        clientSecret,
        redirectUri: oauthRedirectUri(),
        scope: process.env.FLASH_OAUTH_SCOPE ?? 'user:read',
      }
    : { configured: false as const }
}

function cookieSecret() {
  return (
    process.env.FLASH_OAUTH_COOKIE_SECRET ??
    process.env.SERVER_APP_SECRET ??
    process.env.FLASH_OAUTH_CLIENT_SECRET ??
    'flash-local-oauth-cookie-secret'
  )
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(value: string) {
  return createHmac('sha256', cookieSecret()).update(value).digest('base64url')
}

function encodeSignedJson(value: unknown) {
  const body = base64Url(JSON.stringify(value))
  return `${body}.${sign(body)}`
}

function decodeSignedJson<T>(value: string | undefined): T | null {
  if (!value) return null
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = sign(body)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
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
    const parsed = new URL(value, 'http://flash.local')
    if (parsed.origin !== 'http://flash.local') return '/shadow/server'
    if (!parsed.pathname.startsWith('/shadow/server')) return '/shadow/server'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/shadow/server'
  }
}

function createOauthState(returnTo: string, options: { popup?: boolean } = {}) {
  return encodeSignedJson({
    nonce: randomBytes(16).toString('base64url'),
    returnTo,
    popup: options.popup === true,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
}

function readOauthSession(cookie: string | undefined) {
  const session = decodeSignedJson<FlashOAuthSession>(cookie)
  if (!session || session.expiresAt <= Date.now()) return null
  return session
}

function parseJsonField(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {}
  return JSON.parse(value)
}

async function uploadedFileInput(file: File, field: string) {
  const buffer = Buffer.from(await file.arrayBuffer())
  return {
    field,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: buffer.byteLength,
    dataBase64: buffer.toString('base64'),
  }
}

async function parseMultipartCommandInput(c: Context) {
  const body = await c.req.parseBody({ all: true })
  let input = parseJsonField(
    Array.isArray(body.input) ? body.input[0] : (body.input ?? body.payload),
  ) as Record<string, unknown>
  const uploads = []
  for (const [key, raw] of Object.entries(body)) {
    const values = Array.isArray(raw) ? raw : [raw]
    for (const value of values) {
      if (value instanceof File) uploads.push(await uploadedFileInput(value, key))
    }
  }
  if (uploads.length === 1 && !input.upload) input = { ...input, upload: uploads[0] }
  if (uploads.length > 1 && !input.uploads) input = { ...input, uploads }
  return input
}

function compactOauthProfile(profile: FlashOAuthSession['profile']): FlashOAuthSession['profile'] {
  const avatarUrl =
    typeof profile.avatarUrl === 'string' && profile.avatarUrl.length <= 500
      ? profile.avatarUrl
      : null
  return {
    id: String(profile.id),
    username: profile.username ? String(profile.username).slice(0, 120) : null,
    displayName: profile.displayName ? String(profile.displayName).slice(0, 160) : null,
    avatarUrl,
  }
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

function oauthPopupCompletePage(returnTo: string) {
  const fallback = JSON.stringify(returnTo)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flash OAuth Complete</title>
  </head>
  <body>
    <p>Authorization complete. You can close this window.</p>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'flash.oauth.completed' }, '*');
        }
      } catch (_) {}
      window.close();
      setTimeout(function () {
        window.location.replace(${fallback});
      }, 800);
    </script>
  </body>
</html>`
}

export async function createFlashApp() {
  const databaseUrl = process.env.DATABASE_URL ?? 'postgres://flash:flash@localhost:5434/flash'
  const { db } = createDatabase(databaseUrl)
  await migrate(db)

  const realtime = new FlashRealtimeService()
  await realtime.connect(process.env.REDIS_URL ?? 'redis://localhost:6381').catch((error) => {
    console.warn('Flash realtime disabled', error)
  })

  const boards = new FlashBoardDao(db)
  const cards = new FlashCardDao(db)
  const arenas = new FlashArenaDao(db)
  const events = new FlashCommandEventDao(db)
  const receipts = new FlashMutationReceiptDao(db)
  const selections = new FlashSelectionDao(db)
  const scripts = new FlashScriptEngine()
  const service = new FlashService({
    boards,
    cards,
    arenas,
    events,
    receipts,
    selections,
    realtime,
    scripts,
  })
  const commands = defineCommandHandlers(service)
  const app = new Hono()
  const localCommandsEnabled = process.env.FLASH_ENABLE_LOCAL_COMMANDS === 'true'

  app.use('*', errorMiddleware)
  app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
  app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
  app.get('/assets/cover.png', serveStatic({ root: './public' }))
  app.get('/assets/*', serveStatic({ root: './dist/client' }))
  app.get('/uploads/:name', async (c) => {
    const name = basename(c.req.param('name'))
    if (!/^[a-zA-Z0-9_.-]+$/u.test(name)) return c.text('Not found', 404)
    const file = await readFile(join(uploadDir(), name)).catch(() => null)
    if (!file) return c.text('Not found', 404)
    return c.body(file, 200, { 'Content-Type': uploadContentType(name) })
  })
  app.get('/shadow/server', (c) => c.html(shellPage()))
  app.get('/shadow/server/*', (c) => c.html(shellPage()))

  app.get('/api/oauth/session', (c) => {
    const returnTo = safeReturnTo(c.req.query('return_to'))
    const popup = c.req.query('popup') === '1'
    const session = readOauthSession(getCookie(c, FLASH_OAUTH_SESSION_COOKIE))
    if (!session) deleteCookie(c, FLASH_OAUTH_SESSION_COOKIE, { path: '/' })
    return c.json({
      configured: oauthConfig().configured,
      authenticated: Boolean(session),
      profile: session?.profile ?? null,
      authorizeUrl: session ? null : oauthAuthorizeUrl(returnTo, { popup }),
    })
  })

  app.get('/shadow/oauth/start', (c) => {
    const returnTo = safeReturnTo(c.req.query('return_to'))
    const authorizeUrl = oauthAuthorizeUrl(returnTo, {
      popup: c.req.query('popup') === '1',
    })
    if (!authorizeUrl) return c.text('Flash OAuth is not configured.', 503)
    return c.redirect(authorizeUrl, 302)
  })

  app.get('/shadow/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const error = c.req.query('error')
    const state = decodeSignedJson<{
      returnTo?: string
      expiresAt?: number
      popup?: boolean
    }>(c.req.query('state'))
    if (error) return c.text(`Authorization denied: ${error}`, 401)
    if (!state?.returnTo || !state.expiresAt || state.expiresAt <= Date.now()) {
      return c.text('Invalid OAuth state.', 400)
    }
    if (!code) return c.text('Missing OAuth code.', 400)
    const config = oauthConfig()
    if (!config.configured) return c.text('Flash OAuth is not configured.', 503)

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
      (await userInfoResponse.json()) as FlashOAuthSession['profile'],
    )
    const expiresAt = Date.now() + Math.max(60, token.expires_in) * 1000
    const session: FlashOAuthSession = {
      profile,
      scope: token.scope,
      expiresAt,
    }
    setCookie(c, FLASH_OAUTH_SESSION_COOKIE, encodeSignedJson(session), {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: Math.max(60, token.expires_in),
    })
    if (state.popup === true) return c.html(oauthPopupCompletePage(safeReturnTo(state.returnTo)))
    return c.redirect(safeReturnTo(state.returnTo), 302)
  })

  app.get('/api/boards/:boardId/events', async (c) => {
    const boardId = c.req.param('boardId')
    const after = Number.parseInt(c.req.query('after') ?? '0', 10)
    const afterCursor = Number.isFinite(after) && after > 0 ? after : 0
    if (!localCommandsEnabled) {
      const launchToken = c.req.query('shadow_launch') ?? ''
      const launch = launchToken ? await introspectShadowLaunchToken(launchToken) : null
      const actorOwner = launch?.shadow?.actor.ownerId ?? launch?.shadow?.actor.userId ?? null
      const board = await boards.findById(boardId)
      if (!launch || !board || !actorOwner) return c.json({ ok: false, error: 'unauthorized' }, 401)
      if (board.serverId !== launch.shadow!.serverId || board.ownerUserId !== actorOwner) {
        return c.json({ ok: false, error: 'forbidden' }, 403)
      }
    }

    return streamSSE(c, async (stream) => {
      let sentCursor = afterCursor
      let replaying = true
      const liveQueue: unknown[] = []

      const updateCursorFromRealtime = (event: unknown) => {
        const payload = (
          event as { payload?: { events?: Array<{ seq?: number }>; cursor?: number } }
        ).payload
        if (payload?.cursor) sentCursor = Math.max(sentCursor, payload.cursor)
        for (const item of payload?.events ?? []) {
          if (typeof item.seq === 'number') sentCursor = Math.max(sentCursor, item.seq)
        }
      }

      const writeRealtime = async (event: unknown) => {
        updateCursorFromRealtime(event)
        await stream.writeSSE({
          event: (event as { type?: string }).type ?? 'flash.events.appended',
          data: JSON.stringify(event),
        })
      }

      const writeReplay = async () => {
        for (;;) {
          const replay = await events.listAfter(boardId, sentCursor, 200)
          if (replay.length === 0) break
          const mapped = replay.map((row) => ({
            ...row,
            seq: row.boardSeq ?? row.seq,
            createdAt: row.createdAt.getTime(),
          }))
          sentCursor = mapped.reduce((cursor, row) => Math.max(cursor, row.seq), sentCursor)
          await stream.writeSSE({
            event: 'flash.events.appended',
            data: JSON.stringify({
              type: 'flash.events.appended',
              boardId,
              at: Date.now(),
              payload: {
                events: mapped,
                cursor: sentCursor,
              },
            }),
          })
          if (replay.length < 200) break
        }
      }

      // Subscribe first and queue live events while durable replay catches up.
      // The client applies board-local seq contiguously, so queued live events
      // arriving ahead of replayed history are buffered instead of applied early.
      const unsubscribe = await realtime.subscribe(boardId, async (event) => {
        if (replaying) {
          liveQueue.push(event)
          return
        }
        await writeRealtime(event)
      })
      await writeReplay()
      replaying = false
      for (const event of liveQueue.splice(0)) await writeRealtime(event)
      await writeReplay()
      await stream.writeSSE({ event: 'ready', data: JSON.stringify({ cursor: sentCursor }) })
      while (!stream.aborted) {
        await stream.sleep(15000)
        await stream.writeSSE({ event: 'ping', data: JSON.stringify({ cursor: sentCursor }) })
      }
      await unsubscribe()
    })
  })

  app.post('/api/local/commands/:commandName', async (c) => {
    // Shadow launch frames call local commands with a launch token; keep naked local access disabled.
    if (!localCommandsEnabled && !shadowLaunchToken(c)) {
      return c.json({ ok: false, error: 'local_commands_disabled' }, 403)
    }
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const result = await shadowApp.executeLocal(
      name,
      body.input ?? {},
      localContext(name),
      commands,
    )
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  })

  app.post('/api/shadow/commands/:commandName', async (c) => {
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const contentType = c.req.header('content-type') ?? ''
    const requestInput = contentType.includes('multipart/form-data')
      ? await parseMultipartCommandInput(c)
      : undefined
    const result = await shadowApp.executeCommand(
      name,
      {
        authorizationHeader: c.req.header('authorization'),
        serverIdHeader: c.req.header('X-Shadow-Server-Id'),
        appKeyHeader: c.req.header('X-Shadow-App-Key'),
        requestBody: requestInput === undefined ? await c.req.text() : undefined,
        requestInput,
      },
      commands,
    )
    return c.json(result.body, result.status as 200)
  })

  return app
}
