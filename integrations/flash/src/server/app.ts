import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import {
  FlashArenaDao,
  FlashBoardDao,
  FlashCardDao,
  FlashCommandEventDao,
} from '../dao/flash.dao.js'
import { createDatabase } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { commandName, defineCommandHandlers, localContext } from '../handler/commands.js'
import { manifest, shadowApp } from '../manifest.js'
import { errorMiddleware } from '../middleware/errors.js'
import { FlashService } from '../service/flash.service.js'
import { FlashRealtimeService } from '../service/realtime.service.js'
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

function shadowApiBaseUrl() {
  return trimTrailingSlash(process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002')
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

function createOauthState(returnTo: string) {
  return encodeSignedJson({
    nonce: randomBytes(16).toString('base64url'),
    returnTo,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
}

function readOauthSession(cookie: string | undefined) {
  const session = decodeSignedJson<FlashOAuthSession>(cookie)
  if (!session || session.expiresAt <= Date.now()) return null
  return session
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

function oauthAuthorizeUrl(returnTo: string) {
  const config = oauthConfig()
  if (!config.configured) return null
  const url = new URL('/oauth/authorize', shadowWebBaseUrl())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', createOauthState(returnTo))
  return url.toString()
}

export async function createFlashApp() {
  const databaseUrl = process.env.DATABASE_URL ?? 'postgres://flash:flash@localhost:5434/flash'
  const { db } = createDatabase(databaseUrl)
  await migrate(db)

  const realtime = new FlashRealtimeService()
  await realtime.connect(process.env.REDIS_URL ?? 'redis://localhost:6381').catch((error) => {
    console.warn('Flash realtime disabled', error)
  })

  const service = new FlashService({
    boards: new FlashBoardDao(db),
    cards: new FlashCardDao(db),
    arenas: new FlashArenaDao(db),
    events: new FlashCommandEventDao(db),
    realtime,
  })
  const commands = defineCommandHandlers(service)
  const app = new Hono()
  const localCommandsEnabled = process.env.FLASH_ENABLE_LOCAL_COMMANDS === 'true'

  app.use('*', errorMiddleware)
  app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
  app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
  app.get('/assets/*', serveStatic({ root: './dist/client' }))
  app.get('/shadow/server', (c) => c.html(shellPage()))
  app.get('/shadow/server/*', (c) => c.html(shellPage()))

  app.get('/api/oauth/session', (c) => {
    const returnTo = safeReturnTo(c.req.query('return_to'))
    const session = readOauthSession(getCookie(c, FLASH_OAUTH_SESSION_COOKIE))
    if (!session) deleteCookie(c, FLASH_OAUTH_SESSION_COOKIE, { path: '/' })
    return c.json({
      configured: oauthConfig().configured,
      authenticated: Boolean(session),
      profile: session?.profile ?? null,
      authorizeUrl: session ? null : oauthAuthorizeUrl(returnTo),
    })
  })

  app.get('/shadow/oauth/start', (c) => {
    const returnTo = safeReturnTo(c.req.query('return_to'))
    const authorizeUrl = oauthAuthorizeUrl(returnTo)
    if (!authorizeUrl) return c.text('Flash OAuth is not configured.', 503)
    return c.redirect(authorizeUrl, 302)
  })

  app.get('/shadow/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const error = c.req.query('error')
    const state = decodeSignedJson<{ returnTo?: string; expiresAt?: number }>(c.req.query('state'))
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
    return c.redirect(safeReturnTo(state.returnTo), 302)
  })

  if (localCommandsEnabled) {
    app.get('/api/boards/:boardId/events', async (c) =>
      streamSSE(c, async (stream) => {
        const unsubscribe = await realtime.subscribe(c.req.param('boardId'), async (event) => {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })
        })
        await stream.writeSSE({ event: 'ready', data: '{}' })
        while (!stream.aborted) {
          await stream.sleep(15000)
          await stream.writeSSE({ event: 'ping', data: '{}' })
        }
        await unsubscribe()
      }),
    )
  }

  app.post('/api/local/commands/:commandName', async (c) => {
    if (!localCommandsEnabled) return c.json({ ok: false, error: 'local_commands_disabled' }, 403)
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const result = await shadowApp.executeLocal(
      name,
      body.input ?? {},
      localContext(name),
      commands,
    )
    return c.json(result.body, result.status as 200)
  })

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

  return app
}
