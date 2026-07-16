import type { AccessPolicy } from '../security/access-policy.js'
import type { NotificationService } from '../services/notification.service.js'
import type { NotificationLevel, RequestContext } from '../types.js'

function memberKey(ctx: RequestContext, memberId?: string | null) {
  return memberId ?? ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.stableKey ?? ctx.requestId
}

export class NotificationUseCase {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly accessPolicy: AccessPolicy,
  ) {}

  private async readMemberKey(ctx: RequestContext, tripId: string, memberId?: string | null) {
    const access = await this.accessPolicy.requireTripRead(ctx, tripId)
    return memberId ?? memberKey(ctx, access.member?.id)
  }

  async listNotifications(
    ctx: RequestContext,
    options: { tripId?: string; unreadOnly?: boolean } = {},
  ) {
    let memberId: string | undefined
    if (options.tripId) {
      const access = await this.accessPolicy.requireTripRead(ctx, options.tripId)
      memberId = access.member?.id ?? undefined
    }
    return this.notificationService.listNotifications(ctx, {
      tripId: options.tripId,
      unreadForMemberId: options.unreadOnly ? memberKey(ctx, memberId) : undefined,
    })
  }

  async createNotification(
    ctx: RequestContext,
    input: {
      tripId?: string
      title: string
      body?: string
      level?: NotificationLevel
      subjectType?: string
      subjectId?: string
    },
  ) {
    if (input.tripId) await this.accessPolicy.requireTripWrite(ctx, input.tripId)
    return this.notificationService.createNotification(ctx, input)
  }

  async markRead(
    ctx: RequestContext,
    notificationId: string,
    input: { memberId?: string; read: boolean },
  ) {
    const notification = await this.notificationService.findNotification(ctx, notificationId)
    const resolvedMemberId = notification?.tripId
      ? await this.readMemberKey(ctx, notification.tripId, input.memberId)
      : memberKey(ctx, input.memberId)
    return this.notificationService.markRead(ctx, notificationId, resolvedMemberId, input.read)
  }

  async markAllRead(ctx: RequestContext, options: { tripId?: string; memberId?: string }) {
    const resolvedMemberId = options.tripId
      ? await this.readMemberKey(ctx, options.tripId, options.memberId)
      : memberKey(ctx, options.memberId)
    return this.notificationService.markAllRead(ctx, resolvedMemberId, options.tripId)
  }
}
