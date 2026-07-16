import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  decodeShadowSpaceAppLaunchTokenHint,
  extractShadowSpaceAppBearerToken,
  introspectShadowSpaceAppLaunchToken,
  type ShadowSpaceAppCommandContext,
  type ShadowSpaceAppLaunchIntrospection,
  shadowSpaceAppLaunchCommandContextFromIntrospection,
} from './space-app'
import type { ShadowSpaceAppManifest } from './types'

const DEFAULT_SESSION_COOKIE = 'space_app_session'
const DEFAULT_SESSION_LIMIT = 4_096

export interface ShadowSpaceAppSession {
  id: string
  csrfToken: string
  launchToken: string
  launch: ShadowSpaceAppLaunchIntrospection
  createdAt: number
  expiresAt: number
}

export interface ShadowSpaceAppSessionStore {
  get(id: string): ShadowSpaceAppSession | null | Promise<ShadowSpaceAppSession | null>
  set(session: ShadowSpaceAppSession): void | Promise<void>
  delete(id: string): void | Promise<void>
}

export interface ShadowSpaceAppSessionManagerOptions {
  appKey: string
  shadowApiBaseUrl?: string
  cookieName?: string
  fetch?: typeof fetch
  store?: ShadowSpaceAppSessionStore
  maxSessions?: number
  now?: () => number
}

export type ShadowSpaceAppSessionExchangeResult =
  | {
      ok: true
      status: 200
      body: { ok: true; expiresAt: number; csrfToken: string }
      setCookie: string
    }
  | {
      ok: false
      status: 401 | 403
      body: { ok: false; error: 'launch_required' | 'invalid_launch_token' | 'wrong_app' }
    }

export type ShadowSpaceAppSessionContextResolution =
  | { context: ShadowSpaceAppCommandContext; session: ShadowSpaceAppSession; error: null }
  | { context: null; session: null; error: 'session_required' | 'invalid_session' }

class InMemoryShadowSpaceAppSessionStore implements ShadowSpaceAppSessionStore {
  private readonly sessions = new Map<string, ShadowSpaceAppSession>()

  constructor(private readonly limit: number) {}

  get(id: string) {
    return this.sessions.get(id) ?? null
  }

  set(session: ShadowSpaceAppSession) {
    this.sessions.delete(session.id)
    this.sessions.set(session.id, session)
    while (this.sessions.size > this.limit) {
      const oldest = this.sessions.keys().next().value
      if (typeof oldest !== 'string') break
      this.sessions.delete(oldest)
    }
  }

  delete(id: string) {
    this.sessions.delete(id)
  }
}

/**
 * Space App-owned, opaque launch sessions for embedded Space Apps.
 *
 * A launch token is accepted exactly once at the exchange endpoint and then stays
 * server-side. Space App requests use an HttpOnly cookie plus a per-session CSRF token,
 * so launch credentials never become a general-purpose request header.
 */
export class ShadowSpaceAppSessionManager {
  private readonly appKey: string
  private readonly cookieName: string
  private readonly fetchFn?: typeof fetch
  private readonly shadowApiBaseUrl?: string
  private readonly store: ShadowSpaceAppSessionStore
  private readonly now: () => number

  constructor(options: ShadowSpaceAppSessionManagerOptions) {
    this.appKey = options.appKey
    this.cookieName =
      options.cookieName ?? `${DEFAULT_SESSION_COOKIE}_${safeCookieSegment(options.appKey)}`
    this.fetchFn = options.fetch
    this.shadowApiBaseUrl = options.shadowApiBaseUrl
    this.store =
      options.store ??
      new InMemoryShadowSpaceAppSessionStore(options.maxSessions ?? DEFAULT_SESSION_LIMIT)
    this.now = options.now ?? Date.now
  }

  async exchange(input: {
    authorizationHeader?: string | null
    cookieHeader?: string | null
    requestUrl: string
  }): Promise<ShadowSpaceAppSessionExchangeResult> {
    const launchToken = extractShadowSpaceAppBearerToken(input.authorizationHeader)
    if (!launchToken) {
      return { ok: false, status: 401, body: { ok: false, error: 'launch_required' } }
    }
    const hint = decodeShadowSpaceAppLaunchTokenHint(launchToken)
    if (!hint || hint.appKey !== this.appKey) {
      return { ok: false, status: 403, body: { ok: false, error: 'wrong_app' } }
    }
    const launch = await introspectShadowSpaceAppLaunchToken({
      launchToken,
      shadowApiBaseUrl: this.shadowApiBaseUrl,
      fetch: this.fetchFn,
    }).catch(() => null)
    if (!launch?.active || !launch.shadow || launch.shadow.appKey !== this.appKey) {
      return { ok: false, status: 401, body: { ok: false, error: 'invalid_launch_token' } }
    }

    const now = this.now()
    const expiresAt =
      typeof launch.exp === 'number' && Number.isFinite(launch.exp)
        ? Math.max(now + 1_000, launch.exp * 1_000)
        : now + 10 * 60 * 1_000
    const previousId = cookieValue(input.cookieHeader, this.cookieName)
    if (previousId) await this.store.delete(previousId)
    const session: ShadowSpaceAppSession = {
      id: randomBytes(32).toString('base64url'),
      csrfToken: randomBytes(24).toString('base64url'),
      launchToken,
      launch,
      createdAt: now,
      expiresAt,
    }
    await this.store.set(session)
    return {
      ok: true,
      status: 200,
      body: { ok: true, expiresAt, csrfToken: session.csrfToken },
      setCookie: sessionCookie({
        name: this.cookieName,
        value: session.id,
        requestUrl: input.requestUrl,
        maxAgeSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1_000)),
      }),
    }
  }

  async session(cookieHeader?: string | null) {
    const id = cookieValue(cookieHeader, this.cookieName)
    if (!id) return null
    const session = await this.store.get(id)
    if (!session) return null
    if (session.expiresAt <= this.now()) {
      await this.store.delete(id)
      return null
    }
    return session
  }

  hasSessionCookie(cookieHeader?: string | null) {
    return Boolean(cookieValue(cookieHeader, this.cookieName))
  }

  async authorizedSession(input: {
    cookieHeader?: string | null
    csrfToken?: string | null
    requireCsrf?: boolean
  }) {
    const session = await this.session(input.cookieHeader)
    if (!session) return null
    if (input.requireCsrf !== false && input.csrfToken !== session.csrfToken) return null
    return session
  }

  async commandContext(input: {
    cookieHeader?: string | null
    csrfToken?: string | null
    commandName: string
    manifest: Pick<ShadowSpaceAppManifest, 'appKey' | 'commands'>
  }): Promise<ShadowSpaceAppSessionContextResolution> {
    const session = await this.authorizedSession(input)
    if (!session) {
      return {
        context: null,
        session: null,
        error: this.hasSessionCookie(input.cookieHeader) ? 'invalid_session' : 'session_required',
      }
    }
    const context = shadowSpaceAppLaunchCommandContextFromIntrospection(
      {
        launchToken: session.launchToken,
        commandName: input.commandName,
        manifest: input.manifest,
      },
      session.launch,
    )
    return context
      ? { context, session, error: null }
      : { context: null, session: null, error: 'invalid_session' }
  }

  async eventStream(input: { cookieHeader?: string | null; lastEventId?: string | null }) {
    const session = await this.authorizedSession({
      cookieHeader: input.cookieHeader,
      requireCsrf: false,
    })
    if (!session) return null
    const shadow = session.launch.shadow
    if (!shadow || shadow.appKey !== this.appKey) return null
    const baseUrl = (this.shadowApiBaseUrl ?? 'http://localhost:3002').replace(/\/+$/u, '')
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${session.launchToken}`,
    }
    if (input.lastEventId) headers['Last-Event-ID'] = input.lastEventId
    return (this.fetchFn ?? fetch)(
      `${baseUrl}/api/servers/${encodeURIComponent(shadow.serverId)}/space-apps/${encodeURIComponent(
        shadow.appKey,
      )}/events`,
      { headers },
    )
  }

  clearCookie(requestUrl: string) {
    return sessionCookie({
      name: this.cookieName,
      value: '',
      requestUrl,
      maxAgeSeconds: 0,
    })
  }
}

export function createShadowSpaceAppSessionManager(options: ShadowSpaceAppSessionManagerOptions) {
  return new ShadowSpaceAppSessionManager(options)
}

function safeCookieSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '_')
}

function cookieValue(header: string | null | undefined, name: string) {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(part.slice(separator + 1).trim())
  }
  return null
}

function sessionCookie(input: {
  name: string
  value: string
  requestUrl: string
  maxAgeSeconds: number
}) {
  const secure = new URL(input.requestUrl).protocol === 'https:'
  return [
    `${input.name}=${encodeURIComponent(input.value)}`,
    'Path=/',
    'HttpOnly',
    secure ? 'SameSite=None' : 'SameSite=Lax',
    secure ? 'Secure' : null,
    `Max-Age=${input.maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ')
}

export interface ShadowSpaceAppJsonStoreOptions<T> {
  filePath: string
  defaultValue: T | (() => T)
  validate?: (value: unknown) => value is T
  normalize?: (value: T) => T
  persistDefault?: boolean
}

export class ShadowSpaceAppJsonStore<T> {
  constructor(private readonly options: ShadowSpaceAppJsonStoreOptions<T>) {}

  read() {
    if (!existsSync(this.options.filePath)) {
      const value = this.defaultValue()
      if (this.options.persistDefault !== false) this.write(value)
      return value
    }

    try {
      const parsed = JSON.parse(readFileSync(this.options.filePath, 'utf8')) as unknown
      if (this.options.validate && !this.options.validate(parsed)) return this.defaultValue()
      return this.normalize(parsed as T)
    } catch {
      return this.defaultValue()
    }
  }

  write(value: T) {
    const normalized = this.normalize(value)
    mkdirSync(dirname(this.options.filePath), { recursive: true })
    const tempPath = `${this.options.filePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`)
    renameSync(tempPath, this.options.filePath)
    return normalized
  }

  update(mutator: (value: T) => T | void) {
    const current = this.clone(this.read())
    const next = mutator(current) ?? current
    return this.write(next)
  }

  reset(nextValue?: T) {
    return this.write(nextValue ?? this.defaultValue())
  }

  private defaultValue() {
    const value =
      typeof this.options.defaultValue === 'function'
        ? (this.options.defaultValue as () => T)()
        : this.options.defaultValue
    return this.normalize(this.clone(value))
  }

  private normalize(value: T) {
    return this.options.normalize ? this.options.normalize(value) : value
  }

  private clone(value: T) {
    return structuredClone(value)
  }
}

export function createShadowSpaceAppJsonStore<T>(options: ShadowSpaceAppJsonStoreOptions<T>) {
  return new ShadowSpaceAppJsonStore(options)
}
