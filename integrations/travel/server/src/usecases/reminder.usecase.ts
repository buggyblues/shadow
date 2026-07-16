import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { ReminderService } from '../services/reminder.service.js'
import type { TripService } from '../services/trip.service.js'
import type { RequestContext } from '../types.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class ReminderUseCase {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly tripService: TripService,
    private readonly shadowGateway: ShadowGateway,
  ) {}

  async createTripReminders(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const notifications = await this.reminderService.createTripReminders(ctx, tripId)
    this.eventBus.emit({
      type: 'notification.reminders_created',
      tripId,
      payload: { notifications },
    })
    const recipientUserIds = (await this.tripService.listMembers(tripId)).flatMap((member) =>
      member.userId ? [member.userId] : [],
    )
    for (const notification of notifications) {
      if (recipientUserIds.length === 0) break
      await this.shadowGateway.publishNotification(ctx, {
        topicKey: 'trip.reminder',
        recipientUserIds,
        title: notification.title,
        body: notification.body,
        idempotencyKey: `trip-reminder:${notification.id}`,
        actionPath: `/trips/${tripId}/itinerary`,
        metadata: {
          tripId,
          notificationId: notification.id,
          subjectType: notification.subjectType,
          subjectId: notification.subjectId,
        },
      })
    }
    return notifications
  }
}
