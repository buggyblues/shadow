import { createHmac, timingSafeEqual } from 'node:crypto'
import { normalizeShadowSpaceAppAvatarUrl, type ShadowSpaceAppCommandContext } from '@shadowob/sdk'

export const KANBAN_OAUTH_SESSION_COOKIE = 'kanban_oauth_session'
export const KANBAN_OAUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

export interface KanbanOAuthProfile {
  id: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface KanbanOAuthSession {
  profile: KanbanOAuthProfile
  scope: string
  expiresAt: number
}

export interface ShadowLaunchIntrospection {
  active: boolean
  shadow?: Partial<ShadowSpaceAppCommandContext> & {
    serverId: string
    spaceAppId?: string
    appKey: string
    actor: ShadowSpaceAppCommandContext['actor']
  }
}

export type KanbanOAuthAccessReason =
  | 'launch_required'
  | 'oauth_identity_mismatch'
  | 'oauth_not_configured'
  | 'oauth_required'

export interface KanbanOAuthAccessStatus {
  configured: boolean
  required: boolean
  authenticated: boolean
  launchAuthenticated: boolean
  oauthAuthenticated: boolean
  reason: KanbanOAuthAccessReason | null
  subject: string | null
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function normalizeShadowAvatarUrl(value: unknown) {
  return normalizeShadowSpaceAppAvatarUrl(value, process.env)
}

export function encodeSignedJson(value: unknown, secret: string) {
  const body = base64Url(JSON.stringify(value))
  return `${body}.${sign(body, secret)}`
}

export function decodeSignedJson<T>(value: string | undefined, secret: string): T | null {
  if (!value) return null
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = sign(body, secret)
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

export function readKanbanOAuthSession(
  cookie: string | undefined,
  secret: string,
  nowMs = Date.now(),
) {
  const session = decodeSignedJson<KanbanOAuthSession>(cookie, secret)
  if (!session || session.expiresAt <= nowMs) return null
  return session
}

export function kanbanOAuthSessionMaxAgeSeconds(
  raw = process.env.KANBAN_OAUTH_COOKIE_MAX_AGE_SECONDS,
) {
  if (!raw) return KANBAN_OAUTH_SESSION_MAX_AGE_SECONDS
  const value = Number(raw)
  if (!Number.isFinite(value)) return KANBAN_OAUTH_SESSION_MAX_AGE_SECONDS
  return Math.max(60, Math.floor(value))
}

export function compactOauthProfile(profile: KanbanOAuthProfile): KanbanOAuthProfile {
  return {
    id: String(profile.id),
    username: profile.username ? String(profile.username).slice(0, 120) : null,
    displayName: profile.displayName ? String(profile.displayName).slice(0, 160) : null,
    avatarUrl: normalizeShadowAvatarUrl(profile.avatarUrl),
  }
}

export function launchOAuthSubject(launch: ShadowLaunchIntrospection | null | undefined) {
  const actor = launch?.shadow?.actor
  return actor?.ownerId ?? actor?.userId ?? null
}

export function sessionMatchesLaunch(
  session: KanbanOAuthSession | null | undefined,
  launch: ShadowLaunchIntrospection | null | undefined,
) {
  const subject = launchOAuthSubject(launch)
  return Boolean(session?.profile.id && subject && session.profile.id === subject)
}

export function kanbanOAuthAccessStatus(input: {
  configured: boolean
  required: boolean
  session: KanbanOAuthSession | null
  launch: ShadowLaunchIntrospection | null
}): KanbanOAuthAccessStatus {
  const subject = launchOAuthSubject(input.launch)
  const launchAuthenticated = Boolean(input.launch?.shadow)
  if (!launchAuthenticated) {
    const oauthAuthenticated = Boolean(input.configured && input.session)
    if (!input.required) {
      return {
        configured: input.configured,
        required: false,
        authenticated: true,
        launchAuthenticated: false,
        oauthAuthenticated,
        reason: null,
        subject: input.session?.profile.id ?? null,
      }
    }
    if (!input.configured) {
      return {
        configured: false,
        required: true,
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        reason: 'oauth_not_configured',
        subject: null,
      }
    }
    if (!input.session) {
      return {
        configured: true,
        required: true,
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        reason: 'oauth_required',
        subject: null,
      }
    }
    return {
      configured: input.configured,
      required: input.required,
      authenticated: true,
      launchAuthenticated: false,
      oauthAuthenticated: true,
      reason: null,
      subject: input.session.profile.id,
    }
  }
  const oauthAuthenticated = Boolean(
    input.configured && input.session && sessionMatchesLaunch(input.session, input.launch),
  )
  if (!input.required) {
    return {
      configured: input.configured,
      required: false,
      authenticated: true,
      launchAuthenticated,
      oauthAuthenticated,
      reason: null,
      subject,
    }
  }
  if (!subject) {
    return {
      configured: input.configured,
      required: true,
      authenticated: false,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'launch_required',
      subject: null,
    }
  }
  if (!input.configured) {
    return {
      configured: false,
      required: true,
      authenticated: false,
      launchAuthenticated,
      oauthAuthenticated: false,
      reason: 'oauth_not_configured',
      subject,
    }
  }
  if (!input.session) {
    return {
      configured: true,
      required: true,
      authenticated: false,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_required',
      subject,
    }
  }
  if (!sessionMatchesLaunch(input.session, input.launch)) {
    return {
      configured: true,
      required: true,
      authenticated: false,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_identity_mismatch',
      subject,
    }
  }
  return {
    configured: true,
    required: true,
    authenticated: true,
    launchAuthenticated: true,
    oauthAuthenticated: true,
    reason: null,
    subject,
  }
}
