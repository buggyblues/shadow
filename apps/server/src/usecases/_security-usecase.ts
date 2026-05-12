import type { ActorContext } from '../security/actor-context'
import type { ResourceRef, ScopeRef } from '../security/resource-scope'
import type { AuditLogService } from '../services/audit-log.service'

export type SecureUseCaseInput = {
  ctx: ActorContext
  idempotencyKey?: string
}

export type SecureUseCaseAudit = {
  auditLogService: AuditLogService
}

export async function auditUseCase<T>(
  deps: SecureUseCaseAudit,
  input: SecureUseCaseInput,
  event: {
    action: string
    resource?: ResourceRef
    scope?: ScopeRef
    run: () => Promise<T>
  },
): Promise<T> {
  await deps.auditLogService.record({
    actor: input.ctx.actor,
    action: event.action,
    resource: event.resource,
    scope: event.scope,
    result: 'started',
    requestId: input.ctx.requestId,
    idempotencyKey: input.idempotencyKey,
  })

  try {
    const result = await event.run()
    await deps.auditLogService.record({
      actor: input.ctx.actor,
      action: event.action,
      resource: event.resource,
      scope: event.scope,
      result: 'succeeded',
      requestId: input.ctx.requestId,
      idempotencyKey: input.idempotencyKey,
    })
    return result
  } catch (err) {
    await deps.auditLogService.record({
      actor: input.ctx.actor,
      action: event.action,
      resource: event.resource,
      scope: event.scope,
      result: (err as { status?: number }).status === 403 ? 'denied' : 'failed',
      requestId: input.ctx.requestId,
      idempotencyKey: input.idempotencyKey,
      reason: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
