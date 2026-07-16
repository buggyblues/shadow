import type { CommunityDao } from '../dao/community.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import { forbidden, notFound } from '../lib/errors.js'
import type { RequestContext, TravelRole } from '../types.js'
import { travelLocalActorAllowed } from './oauth.js'

export type TravelCapability =
  | 'trip.read'
  | 'trip.write'
  | 'trip.manage'
  | 'itinerary.write'
  | 'booking.write'
  | 'budget.write'
  | 'packing.write'
  | 'todo.write'
  | 'share.manage'
  | 'member.manage'
  | 'settings.manage'
  | 'backup.manage'

const roleRank: Record<TravelRole, number> = {
  viewer: 1,
  traveler: 2,
  planner: 3,
  owner: 4,
}

const roleCapabilities: Record<TravelRole, TravelCapability[]> = {
  viewer: ['trip.read'],
  traveler: ['trip.read', 'packing.write', 'todo.write'],
  planner: [
    'trip.read',
    'trip.write',
    'itinerary.write',
    'booking.write',
    'budget.write',
    'packing.write',
    'todo.write',
  ],
  owner: [
    'trip.read',
    'trip.write',
    'trip.manage',
    'itinerary.write',
    'booking.write',
    'budget.write',
    'packing.write',
    'todo.write',
    'share.manage',
    'member.manage',
    'settings.manage',
    'backup.manage',
  ],
}

export class AccessPolicy {
  constructor(
    private readonly tripDao: TripDao,
    private readonly communityDao?: CommunityDao,
  ) {}

  private async requireBuddyBinding(ctx: RequestContext, tripId: string) {
    const agentId = ctx.actor.buddyId ?? ctx.actor.id
    if (!agentId || !this.communityDao) throw forbidden()
    const binding = (await this.communityDao.listBuddyBindings(tripId)).find(
      (item) => item.agentId === agentId,
    )
    if (!binding) throw forbidden()

    const ownerMember = ctx.actor.ownerId
      ? await this.tripDao.findMemberByUser(tripId, ctx.actor.ownerId)
      : null
    const creatorMember = binding.createdByMemberId
      ? await this.tripDao.findMember(binding.createdByMemberId)
      : null
    const member = ownerMember ?? creatorMember
    if (member && member.tripId !== tripId) throw forbidden()
    return { binding, member }
  }

  async requireTripRole(ctx: RequestContext, tripId: string, minimumRole: TravelRole) {
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip) throw notFound('Trip')
    if (trip.serverId !== ctx.serverId) throw notFound('Trip')

    if (ctx.local && travelLocalActorAllowed()) return { trip, member: null }
    if (ctx.actor.kind === 'buddy' || ctx.actor.subjectKind === 'buddy') {
      const buddy = await this.requireBuddyBinding(ctx, tripId)
      if (!buddy.binding.capabilities.includes('owner.delegate')) throw forbidden()
      return { trip, member: buddy.member, buddyBinding: buddy.binding }
    }
    const userId = ctx.actor.userId ?? ctx.actor.ownerId
    if (!userId) throw forbidden()

    const member = await this.tripDao.findMemberByUser(tripId, userId)
    if (!member || roleRank[member.role] < roleRank[minimumRole]) throw forbidden()
    return { trip, member }
  }

  async requireTripCapability(ctx: RequestContext, tripId: string, capability: TravelCapability) {
    if (ctx.actor.kind === 'buddy' || ctx.actor.subjectKind === 'buddy') {
      const trip = await this.tripDao.findTrip(tripId)
      if (!trip || trip.serverId !== ctx.serverId) throw notFound('Trip')
      const buddy = await this.requireBuddyBinding(ctx, tripId)
      if (
        !buddy.binding.capabilities.includes('owner.delegate') &&
        !buddy.binding.capabilities.includes(capability)
      ) {
        throw forbidden()
      }
      return { trip, member: buddy.member, buddyBinding: buddy.binding }
    }
    const access = await this.requireTripRole(ctx, tripId, 'viewer')
    if (!access.member) return access
    if (!roleCapabilities[access.member.role].includes(capability)) throw forbidden()
    return access
  }

  async requireTripRead(ctx: RequestContext, tripId: string) {
    return this.requireTripCapability(ctx, tripId, 'trip.read')
  }

  async requireTripWrite(ctx: RequestContext, tripId: string) {
    return this.requireTripCapability(ctx, tripId, 'trip.write')
  }
}
