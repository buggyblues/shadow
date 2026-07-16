import type { AccessPolicy } from '../security/access-policy.js'
import type { AuditService, RecordAuditInput } from '../services/audit.service.js'
import type { RequestContext } from '../types.js'

export class AuditUseCase {
  constructor(
    private readonly auditService: AuditService,
    private readonly accessPolicy: AccessPolicy,
  ) {}

  async listTripAuditLogs(ctx: RequestContext, tripId: string, limit?: number) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    return this.auditService.listTripAuditLogs(tripId, limit)
  }

  recordRequest(ctx: RequestContext, input: RecordAuditInput) {
    return this.auditService.record(ctx, input)
  }
}
