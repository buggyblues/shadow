import type { Logger } from 'pino'
import { type ActorInput, actorLabel } from '../security/actor'
import type { ResourceRef, ScopeRef } from '../security/resource-scope'

export type AuditResult = 'succeeded' | 'failed' | 'denied' | 'started'

export type AuditEvent = {
  actor: ActorInput
  action: string
  resource?: ResourceRef
  scope?: ScopeRef
  result: AuditResult
  requestId?: string
  idempotencyKey?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export class AuditLogService {
  constructor(private deps: { logger: Logger }) {}

  async record(event: AuditEvent) {
    this.deps.logger.info(
      {
        actor: actorLabel(event.actor),
        action: event.action,
        resource: event.resource,
        scope: event.scope,
        result: event.result,
        requestId: event.requestId,
        idempotencyKey: event.idempotencyKey,
        reason: event.reason,
        metadata: event.metadata,
      },
      '[security-audit] high-risk action',
    )
  }
}
