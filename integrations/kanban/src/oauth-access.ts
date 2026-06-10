import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ShadowServerAppCommandContext } from '@shadowob/sdk'

export const KANBAN_OAUTH_SESSION_COOKIE = 'kanban_oauth_session'

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
  shadow?: Partial<ShadowServerAppCommandContext> & {
    serverId: string
    serverAppId?: string
    appKey: string
    actor: ShadowServerAppCommandContext['actor']
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
  reason: KanbanOAuthAccessReason | null
  subject: string | null
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
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

export function compactOauthProfile(profile: KanbanOAuthProfile): KanbanOAuthProfile {
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
  if (!input.required) {
    return {
      configured: input.configured,
      required: false,
      authenticated: Boolean(input.session),
      reason: null,
      subject,
    }
  }
  if (!input.configured) {
    return {
      configured: false,
      required: true,
      authenticated: false,
      reason: 'oauth_not_configured',
      subject,
    }
  }
  if (!input.launch?.shadow || !subject) {
    return {
      configured: true,
      required: true,
      authenticated: false,
      reason: 'launch_required',
      subject: null,
    }
  }
  if (!input.session) {
    return {
      configured: true,
      required: true,
      authenticated: false,
      reason: 'oauth_required',
      subject,
    }
  }
  if (!sessionMatchesLaunch(input.session, input.launch)) {
    return {
      configured: true,
      required: true,
      authenticated: false,
      reason: 'oauth_identity_mismatch',
      subject,
    }
  }
  return {
    configured: true,
    required: true,
    authenticated: true,
    reason: null,
    subject,
  }
}
