import { randomUUID } from 'node:crypto'
import type { Actor } from './actor'
import { actorLabel } from './actor'

export type ActorContext = {
  actor: Actor
  requestId: string
  ip?: string
  userAgent?: string
  route?: string
  authType: Actor['kind'] | 'session' | 'internal-job'
}

export function createActorContext(
  actor: Actor,
  meta: Partial<Omit<ActorContext, 'actor' | 'authType'>> & {
    authType?: ActorContext['authType']
  } = {},
): ActorContext {
  return {
    actor,
    authType: meta.authType ?? (actor.kind === 'user' ? 'session' : actor.kind),
    requestId: meta.requestId ?? randomUUID(),
    ip: meta.ip,
    userAgent: meta.userAgent,
    route: meta.route,
  }
}

export function actorContextLabel(ctx: ActorContext): string {
  return `${actorLabel(ctx.actor)} request:${ctx.requestId}`
}
