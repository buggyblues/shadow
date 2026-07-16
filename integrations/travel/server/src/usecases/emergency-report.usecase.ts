import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import type { EmergencyReportService } from '../services/emergency-report.service.js'
import type { TripService } from '../services/trip.service.js'
import type { RequestContext } from '../types.js'
import type { CreateEmergencyReportInput } from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class EmergencyReportUseCase {
  constructor(
    private readonly service: EmergencyReportService,
    private readonly eventBus: TravelEventBus,
    private readonly tripService: TripService,
    private readonly shadowGateway: ShadowGateway,
  ) {}

  list(ctx: RequestContext, includeEnded?: boolean) {
    return this.service.list(ctx, includeEnded)
  }

  async create(ctx: RequestContext, input: CreateEmergencyReportInput) {
    const report = await this.service.create(ctx, input)
    for (const tripId of report.affectedTripIds) {
      this.eventBus.emit({ type: 'emergency_report.created', tripId, payload: { report } })
      const recipientUserIds = (await this.tripService.listMembers(tripId)).flatMap((member) =>
        member.userId ? [member.userId] : [],
      )
      if (recipientUserIds.length > 0) {
        await this.shadowGateway.publishNotification(ctx, {
          topicKey: 'trip.emergency',
          recipientUserIds,
          title: report.title,
          idempotencyKey: `emergency:${report.id}:${report.updatedAt}`,
          actionPath: `/trips/${tripId}/map`,
          metadata: {
            tripId,
            reportId: report.id,
            severity: report.severity,
            expiresAt: report.expiresAt,
          },
        })
      }
    }
    return report
  }

  async end(ctx: RequestContext, reportId: string) {
    const report = await this.service.end(ctx, reportId)
    if (report)
      for (const tripId of report.affectedTripIds)
        this.eventBus.emit({ type: 'emergency_report.ended', tripId, payload: { report } })
    return report
  }

  async vote(ctx: RequestContext, reportId: string) {
    const report = await this.service.vote(ctx, reportId)
    for (const tripId of report.affectedTripIds)
      this.eventBus.emit({ type: 'emergency_report.voted', tripId, payload: { report } })
    return report
  }
}
