import type { JwtPayload } from '../lib/jwt'

export type ActorKind = 'user' | 'pat' | 'oauth' | 'agent' | 'system'

export type UserActor = {
  kind: 'user'
  userId: string
  authMethod: 'jwt'
  tokenId?: string
  scopes: string[]
}

export type PatActor = {
  kind: 'pat'
  userId: string
  tokenId: string
  scopes: string[]
  expiresAt?: string | null
}

export type OAuthActor = {
  kind: 'oauth'
  userId: string
  appId: string
  appClientId?: string
  tokenId: string
  scopes: string[]
}

export type AgentActor = {
  kind: 'agent'
  userId: string
  agentId?: string
  ownerId?: string
  tokenId?: string
  scopes: string[]
}

export type SystemActor = {
  kind: 'system'
  service: string
  capabilities: string[]
}

export type Actor = UserActor | PatActor | OAuthActor | AgentActor | SystemActor
export type ActorInput = Actor | string

export type AuthenticatedUserLike = JwtPayload & {
  tokenKind?: 'jwt' | 'pat'
  tokenId?: string
  scopes?: string[]
  expiresAt?: string | null
  agentId?: string
  ownerId?: string
}

export function actorFromUserId(userId: string): UserActor {
  return { kind: 'user', userId, authMethod: 'jwt', scopes: [] }
}

export function actorFromAuthenticatedUser(user: AuthenticatedUserLike): Actor {
  const scopes = user.scopes ?? []
  if (user.tokenKind === 'pat') {
    if (!user.tokenId) {
      throw Object.assign(new Error('API token id is required'), { status: 401 })
    }
    return {
      kind: 'pat',
      userId: user.userId,
      tokenId: user.tokenId,
      scopes,
      expiresAt: user.expiresAt,
    }
  }

  if (user.typ === 'agent') {
    return {
      kind: 'agent',
      userId: user.userId,
      agentId: user.agentId,
      ownerId: user.ownerId,
      tokenId: user.tokenId ?? user.jti,
      scopes,
    }
  }

  return {
    kind: 'user',
    userId: user.userId,
    authMethod: 'jwt',
    tokenId: user.tokenId ?? user.jti,
    scopes,
  }
}

export function actorUserId(actor: ActorInput): string {
  if (typeof actor === 'string') return actor
  if (actor.kind === 'system') {
    throw Object.assign(new Error('System actor is not bound to a user'), { status: 403 })
  }
  return actor.userId
}

export function actorHasScope(actor: Actor, scope: string): boolean {
  if (actor.kind === 'system') {
    return actor.capabilities.includes('*') || actor.capabilities.includes(scope)
  }
  return actor.scopes.includes('*') || actor.scopes.includes(scope)
}

export function actorLabel(actor: ActorInput): string {
  if (typeof actor === 'string') return `user:${actor}`
  if (actor.kind === 'system') return `system:${actor.service}`
  return `${actor.kind}:${actor.userId}`
}
