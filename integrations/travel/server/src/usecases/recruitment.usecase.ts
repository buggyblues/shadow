import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { ChannelMembershipSyncService } from '../services/channel-membership-sync.service.js'
import type { RecruitmentService } from '../services/recruitment.service.js'
import type { RequestContext } from '../types.js'
import type {
  ApplyToTripInput,
  ReviewTripApplicationInput,
  UpsertTravelIntentInput,
  UpsertTripRecruitmentInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class RecruitmentUseCase {
  constructor(
    private readonly service: RecruitmentService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly shadowGateway: ShadowGateway,
    private readonly channelMembershipSyncService: ChannelMembershipSyncService,
  ) {}

  listOpen(ctx: RequestContext) {
    return this.service.listOpen(ctx)
  }

  listTravelIntents(ctx: RequestContext) {
    return this.service.listTravelIntents(ctx)
  }

  async upsertTravelIntent(ctx: RequestContext, input: UpsertTravelIntentInput) {
    const intent = await this.service.upsertTravelIntent(ctx, input)
    this.eventBus.emit({ type: 'travel_intent.updated', payload: { intent } })
    return intent
  }

  async closeTravelIntent(ctx: RequestContext) {
    const intent = await this.service.closeTravelIntent(ctx)
    this.eventBus.emit({ type: 'travel_intent.closed', payload: { intent } })
    return intent
  }

  async getForTrip(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    return this.service.getForTrip(tripId)
  }

  async upsert(ctx: RequestContext, tripId: string, input: UpsertTripRecruitmentInput) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const recruitment = await this.service.upsert(ctx, tripId, access.member?.id, input)
    this.eventBus.emit({
      type: 'recruitment.updated',
      tripId,
      payload: { recruitment },
    })
    await this.channelMembershipSyncService.syncTrip(ctx, tripId).catch(() => null)
    return recruitment
  }

  async apply(ctx: RequestContext, recruitmentId: string, input: ApplyToTripInput) {
    const application = await this.service.apply(ctx, recruitmentId, input)
    this.eventBus.emit({
      type: 'recruitment.application.created',
      tripId: application.tripId,
      payload: { application },
    })
    const owners = (await this.service.listTripMembers(application.tripId))
      .filter((member) => member.role === 'owner' && member.userId)
      .map((member) => member.userId!)
    if (owners.length > 0) {
      await this.shadowGateway.publishNotification(ctx, {
        topicKey: 'recruitment.application_received',
        recipientUserIds: owners,
        title: `${application.applicantDisplayName} applied to join your trip`,
        body: application.message || 'Open Travel to review the application.',
        idempotencyKey: `application-received:${application.id}:${application.updatedAt}`,
        actionPath: `/trips/${application.tripId}/together`,
        metadata: { tripId: application.tripId, applicationId: application.id },
      })
    }
    return application
  }

  async withdraw(ctx: RequestContext, applicationId: string) {
    const application = await this.service.withdraw(ctx, applicationId)
    this.eventBus.emit({
      type: 'recruitment.application.withdrawn',
      tripId: application.tripId,
      payload: { application },
    })
    return application
  }

  async updateApplication(ctx: RequestContext, applicationId: string, input: ApplyToTripInput) {
    const application = await this.service.updateApplication(ctx, applicationId, input)
    this.eventBus.emit({
      type: 'recruitment.application.updated',
      tripId: application.tripId,
      payload: { application },
    })
    return application
  }

  async review(
    ctx: RequestContext,
    tripId: string,
    applicationId: string,
    input: ReviewTripApplicationInput,
  ) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const result = await this.service.review(applicationId, access.member?.id, input)
    this.eventBus.emit({
      type: `recruitment.application.${input.status}`,
      tripId,
      payload: result,
    })
    await this.shadowGateway.publishNotification(ctx, {
      topicKey: 'recruitment.application_updated',
      recipientUserIds: [result.application.applicantUserId],
      title:
        input.status === 'approved'
          ? 'Your trip application was approved'
          : input.status === 'needs_info'
            ? 'The organizer needs more information'
            : input.status === 'waitlisted'
              ? 'Your trip application is on the waitlist'
              : 'Your trip application was declined',
      body: result.application.reviewNote || 'Open Travel to see the latest status.',
      idempotencyKey: `application-reviewed:${result.application.id}:${result.application.updatedAt}`,
      actionPath: `/trips/${tripId}/together`,
      metadata: { tripId, applicationId: result.application.id, status: input.status },
    })
    if (input.status === 'approved') {
      await this.channelMembershipSyncService.syncTrip(ctx, tripId).catch(() => null)
    }
    return result
  }
}
