import type { AuditDao } from '../dao/audit.dao.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { AuditAction, AuditLog, RequestContext } from '../types.js'

export interface RecordAuditInput {
  action: AuditAction
  method: string
  path: string
  statusCode: number
  tripId?: string
  subjectType?: string
  subjectId?: string
}

export class AuditService {
  constructor(private readonly auditDao: AuditDao) {}

  listTripAuditLogs(tripId: string, limit?: number) {
    return this.auditDao.listAuditLogs(tripId, limit)
  }

  record(ctx: RequestContext, input: RecordAuditInput) {
    const log: AuditLog = {
      id: createId('audit'),
      serverId: ctx.serverId,
      tripId: input.tripId,
      action: input.action,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      requestId: ctx.requestId,
      actor: ctx.actor,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      createdAt: nowIso(),
    }
    return this.auditDao.createAuditLog(log)
  }
}
