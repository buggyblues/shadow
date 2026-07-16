import type { EmergencyReportDao } from '../dao/emergency-report.dao.js'
import { forbidden, notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { RequestContext } from '../types.js'
import type { CreateEmergencyReportInput } from '../validators/travel.schema.js'

export const emergencyReportRemovalThreshold = 3

function actorUserId(ctx: RequestContext) {
  return (
    ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.id ?? ctx.actor.stableKey ?? 'local-user'
  )
}

export class EmergencyReportService {
  constructor(private readonly dao: EmergencyReportDao) {}

  list(ctx: RequestContext, includeEnded = true) {
    return this.dao.list(ctx.serverId, { includeEnded })
  }

  async create(ctx: RequestContext, input: CreateEmergencyReportInput) {
    const timestamp = nowIso()
    const impact = await this.dao.calculateImpact(ctx.serverId, input.latitude, input.longitude)
    return this.dao.create({
      id: createId('emergency'),
      serverId: ctx.serverId,
      title: input.title,
      category: input.category,
      severity: input.severity,
      latitude: input.latitude,
      longitude: input.longitude,
      ...impact,
      reporterUserId: actorUserId(ctx),
      createdAt: timestamp,
      expiresAt: input.expiresAt,
      status: 'active',
      removalVoteUserIds: [],
      updatedAt: timestamp,
    })
  }

  async end(ctx: RequestContext, reportId: string) {
    const actorId = actorUserId(ctx)
    const report = (await this.dao.list(ctx.serverId, { includeEnded: true })).find(
      (item) => item.id === reportId,
    )
    if (!report) throw notFound('Emergency report')
    if (!ctx.local && report.reporterUserId !== actorId) throw forbidden()
    const timestamp = nowIso()
    return this.dao.update(reportId, (current) => ({
      ...current,
      status: 'ended',
      endedAt: timestamp,
      updatedAt: timestamp,
    }))
  }

  async vote(ctx: RequestContext, reportId: string) {
    const voterId = actorUserId(ctx)
    const report = (await this.dao.list(ctx.serverId, { includeEnded: true })).find(
      (item) => item.id === reportId,
    )
    if (!report) throw notFound('Emergency report')
    const updated = await this.dao.update(reportId, (current) => {
      const removalVoteUserIds = current.removalVoteUserIds.includes(voterId)
        ? current.removalVoteUserIds.filter((id) => id !== voterId)
        : [...current.removalVoteUserIds, voterId]
      return {
        ...current,
        removalVoteUserIds,
        status:
          removalVoteUserIds.length >= emergencyReportRemovalThreshold ? 'removed' : current.status,
        updatedAt: nowIso(),
      }
    })
    if (!updated) throw notFound('Emergency report')
    return updated
  }
}
