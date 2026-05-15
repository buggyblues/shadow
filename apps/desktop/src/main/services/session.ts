import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage, shell } from 'electron'
import { parseAuthCallbackUrl } from '../../shared/auth-url'
import type { LoginCredentials, PublicSession, ShadowUser } from '../../shared/types'

type StoredSecret = {
  mode: 'safeStorage' | 'plain'
  value: string
}

type StoredSession = {
  user: ShadowUser
  accessToken: StoredSecret
  refreshToken: StoredSecret
  updatedAt: string
}

type TokenPair = {
  accessToken: string
  refreshToken: string
}

function sessionPath() {
  return join(app.getPath('userData'), 'session.json')
}

function encodeSecret(value: string): StoredSecret {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      mode: 'safeStorage',
      value: safeStorage.encryptString(value).toString('base64'),
    }
  }
  return { mode: 'plain', value }
}

function decodeSecret(secret: StoredSecret): string {
  if (secret.mode === 'safeStorage') {
    return safeStorage.decryptString(Buffer.from(secret.value, 'base64'))
  }
  return secret.value
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const message =
      typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : `Shadow request failed (${response.status})`
    throw new Error(message)
  }
  return body as T
}

export class SessionService extends EventEmitter {
  private session: StoredSession | null = null

  constructor(private readonly webOrigin: string) {
    super()
    this.session = this.readStoredSession()
  }

  getPublicSession(): PublicSession {
    return {
      authenticated: Boolean(this.session),
      user: this.session?.user ?? null,
      webOrigin: this.webOrigin,
    }
  }

  getTokenPair(): TokenPair | null {
    if (!this.session) return null
    try {
      return {
        accessToken: decodeSecret(this.session.accessToken),
        refreshToken: decodeSecret(this.session.refreshToken),
      }
    } catch {
      this.clearSession()
      return null
    }
  }

  async login(credentials: LoginCredentials): Promise<PublicSession> {
    const response = await fetch(`${this.webOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: credentials.emailOrUsername,
        password: credentials.password,
      }),
    })
    const data = await readJson<{
      user: ShadowUser
      accessToken: string
      refreshToken: string
    }>(response)
    this.storeSession(data.user, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    })
    return this.getPublicSession()
  }

  async importCallback(rawUrl: string): Promise<PublicSession> {
    const parsed = parseAuthCallbackUrl(rawUrl)
    if (!parsed) throw new Error('AUTH_CALLBACK_INVALID')
    const user = await this.fetchMe(parsed.accessToken)
    this.storeSession(user, parsed)
    return this.getPublicSession()
  }

  importSession(input: { user: ShadowUser; accessToken: string; refreshToken: string }) {
    this.storeSession(input.user, {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    })
    return this.getPublicSession()
  }

  async refresh(): Promise<string | null> {
    const tokens = this.getTokenPair()
    if (!tokens) return null
    const response = await fetch(`${this.webOrigin}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
    if (!response.ok) {
      this.clearSession()
      return null
    }
    const next = await readJson<TokenPair>(response)
    const user = this.session?.user
    if (!user) return null
    this.storeSession(user, next)
    return next.accessToken
  }

  openLoginInBrowser() {
    const callback = 'shadow://auth/callback'
    const url = new URL('/app/login', this.webOrigin)
    url.searchParams.set('desktop', '1')
    url.searchParams.set('redirect', callback)
    void shell.openExternal(url.toString())
  }

  logout(): PublicSession {
    this.clearSession()
    return this.getPublicSession()
  }

  private async fetchMe(accessToken: string): Promise<ShadowUser> {
    const response = await fetch(`${this.webOrigin}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return readJson<ShadowUser>(response)
  }

  private storeSession(user: ShadowUser, tokens: TokenPair) {
    this.session = {
      user,
      accessToken: encodeSecret(tokens.accessToken),
      refreshToken: encodeSecret(tokens.refreshToken),
      updatedAt: new Date().toISOString(),
    }
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(sessionPath(), JSON.stringify(this.session))
    this.emit('changed', this.getPublicSession())
  }

  private clearSession() {
    this.session = null
    try {
      writeFileSync(sessionPath(), '')
    } catch {
      // Ignore storage cleanup failures.
    }
    this.emit('changed', this.getPublicSession())
  }

  private readStoredSession(): StoredSession | null {
    try {
      const path = sessionPath()
      if (!existsSync(path)) return null
      const raw = readFileSync(path, 'utf8').trim()
      if (!raw) return null
      const parsed = JSON.parse(raw) as StoredSession
      if (!parsed.user || !parsed.accessToken || !parsed.refreshToken) return null
      return parsed
    } catch {
      return null
    }
  }
}
