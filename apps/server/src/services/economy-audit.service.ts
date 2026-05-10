import { createHash } from 'node:crypto'
import type { Database } from '../db'
import { economyAuditEvents } from '../db/schema'
import { type Actor, actorLabel } from '../security/actor'

type DbLike = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export type EconomyAuditInput = {
  actor: Actor
  action: string
  resource: { kind: string; id?: string | null }
  scope?: { kind?: string | null; id?: string | null }
  idempotencyKey?: string | null
  request?: unknown
  result: 'started' | 'succeeded' | 'failed' | 'denied'
  errorCode?: string | null
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

function stableHash(value: unknown) {
  if (value == null || value === '') return undefined
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return createHash('sha256').update(raw).digest('hex')
}

function actorTokenKind(actor: Actor) {
  if (actor.kind === 'system') return 'system'
  return actor.kind === 'user' ? actor.authMethod : actor.kind
}

function actorId(actor: Actor) {
  if (actor.kind === 'system') return actor.service
  if ('tokenId' in actor && actor.tokenId) return `${actor.userId}:${actor.tokenId}`
  return actor.userId
}

export class EconomyAuditService {
  constructor(private deps: { db: Database }) {}

  async record(input: EconomyAuditInput, db: DbLike = this.deps.db) {
    await db.insert(economyAuditEvents).values({
      actorKind: input.actor.kind,
      actorId: actorId(input.actor),
      actorTokenKind: actorTokenKind(input.actor),
      action: input.action,
      resourceKind: input.resource.kind,
      resourceId: input.resource.id ?? undefined,
      scopeKind: input.scope?.kind ?? undefined,
      scopeId: input.scope?.id ?? undefined,
      idempotencyKey: input.idempotencyKey ?? undefined,
      requestHash: stableHash(input.request),
      result: input.result,
      errorCode: input.errorCode ?? undefined,
      ipHash: stableHash(input.ip),
      userAgentHash: stableHash(input.userAgent),
      metadata: {
        actor: actorLabel(input.actor),
        ...(input.metadata ?? {}),
      },
    })
  }
}
