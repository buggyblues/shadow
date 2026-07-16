import type { AccessPolicy } from '../security/access-policy.js'
import type { ChannelMembershipSyncService } from '../services/channel-membership-sync.service.js'
import type { DashboardService } from '../services/dashboard.service.js'
import type { TripService } from '../services/trip.service.js'
import type { RequestContext } from '../types.js'
import type {
  AcceptInviteInput,
  CreateGuestInput,
  CreateInviteInput,
  CreateMemberInput,
  CreateTripInput,
  UpdateGuestInput,
  UpdateMemberInput,
  UpdateTripInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class TripUseCase {
  constructor(
    private readonly tripService: TripService,
    private readonly dashboardService: DashboardService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly channelMembershipSyncService: ChannelMembershipSyncService,
  ) {}

  listTrips(ctx: RequestContext, options?: { includeArchived?: boolean }) {
    return this.tripService.listTrips(ctx, options)
  }

  async createTrip(ctx: RequestContext, input: CreateTripInput) {
    const trip = await this.tripService.createTrip(ctx, input)
    this.eventBus.emit({ type: 'trip.created', tripId: trip.id, payload: { trip } })
    return trip
  }

  async updateTrip(ctx: RequestContext, tripId: string, input: UpdateTripInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const trip = await this.tripService.updateTrip(tripId, input)
    this.eventBus.emit({ type: 'trip.updated', tripId, payload: { trip } })
    return trip
  }

  async archiveTrip(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const trip = await this.tripService.archiveTrip(tripId)
    this.eventBus.emit({ type: 'trip.archived', tripId, payload: { trip } })
    return trip
  }

  async copyTrip(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    const copy = await this.tripService.copyTrip(ctx, tripId)
    this.eventBus.emit({
      type: 'trip.copied',
      tripId: copy.id,
      payload: { sourceTripId: tripId, trip: copy },
    })
    return copy
  }

  async deleteTrip(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const trip = await this.tripService.deleteTrip(tripId)
    this.eventBus.emit({ type: 'trip.deleted', tripId, payload: { trip } })
    return trip
  }

  async getBundle(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.tripService.getBundle(tripId)
  }

  async dashboard(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.dashboardService.dashboard(tripId)
  }

  async contextPack(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.dashboardService.contextPack(tripId)
  }

  async exportIcs(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.tripService.exportIcs(tripId)
  }

  async listMembers(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.tripService.listMembers(tripId)
  }

  async addMember(ctx: RequestContext, tripId: string, input: CreateMemberInput) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const member = await this.tripService.addMember(tripId, input, access.member?.id ?? undefined)
    this.eventBus.emit({ type: 'member.created', tripId, payload: { member } })
    await this.channelMembershipSyncService.syncTrip(ctx, tripId).catch(() => null)
    return member
  }

  async updateMember(
    ctx: RequestContext,
    tripId: string,
    memberId: string,
    input: UpdateMemberInput,
  ) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const member = await this.tripService.updateMember(tripId, memberId, input)
    this.eventBus.emit({ type: 'member.updated', tripId, payload: { member } })
    return member
  }

  async removeMember(ctx: RequestContext, tripId: string, memberId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const member = await this.tripService.removeMember(tripId, memberId)
    this.eventBus.emit({ type: 'member.removed', tripId, payload: { member } })
    await this.channelMembershipSyncService.syncTrip(ctx, tripId).catch(() => null)
    return member
  }

  async transferOwner(ctx: RequestContext, tripId: string, memberId: string) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const member = await this.tripService.transferOwner(
      tripId,
      memberId,
      access.member?.id ?? undefined,
    )
    this.eventBus.emit({ type: 'member.owner_transferred', tripId, payload: { member } })
    await this.channelMembershipSyncService.syncTrip(ctx, tripId).catch(() => null)
    return member
  }

  async listGuests(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.tripService.listGuests(tripId)
  }

  async createGuest(ctx: RequestContext, tripId: string, input: CreateGuestInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const guest = await this.tripService.createGuest(tripId, input)
    this.eventBus.emit({ type: 'guest.created', tripId, payload: { guest } })
    return guest
  }

  async updateGuest(ctx: RequestContext, tripId: string, guestId: string, input: UpdateGuestInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const guest = await this.tripService.updateGuest(tripId, guestId, input)
    this.eventBus.emit({ type: 'guest.updated', tripId, payload: { guest } })
    return guest
  }

  async deleteGuest(ctx: RequestContext, tripId: string, guestId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const guest = await this.tripService.deleteGuest(tripId, guestId)
    this.eventBus.emit({ type: 'guest.deleted', tripId, payload: { guest } })
    return guest
  }

  async listInvites(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    return this.tripService.listInvites(tripId)
  }

  async createInvite(ctx: RequestContext, tripId: string, input: CreateInviteInput) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const result = await this.tripService.createInvite(
      tripId,
      input,
      access.member?.id ?? undefined,
    )
    this.eventBus.emit({ type: 'invite.created', tripId, payload: { invite: result.invite } })
    return result
  }

  async acceptInvite(ctx: RequestContext, input: AcceptInviteInput) {
    const result = await this.tripService.acceptInvite(ctx, input)
    this.eventBus.emit({
      type: 'invite.accepted',
      tripId: result.member.tripId,
      payload: { invite: result.invite, member: result.member },
    })
    return result
  }

  async revokeInvite(ctx: RequestContext, tripId: string, inviteId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const invite = await this.tripService.revokeInvite(tripId, inviteId)
    this.eventBus.emit({ type: 'invite.revoked', tripId, payload: { invite } })
    return invite
  }
}
