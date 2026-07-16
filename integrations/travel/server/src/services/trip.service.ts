import type { AttachmentDao } from '../dao/attachment.dao.js'
import type { AutomationDao } from '../dao/automation.dao.js'
import type { BookingDao } from '../dao/booking.dao.js'
import type { BudgetDao } from '../dao/budget.dao.js'
import type { CollaborationDao } from '../dao/collaboration.dao.js'
import type { PackingDao } from '../dao/packing.dao.js'
import type { PlanningDao } from '../dao/planning.dao.js'
import type { TodoDao } from '../dao/todo.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { buildTripIcs } from '../lib/export.js'
import { createId, createPublicToken, hashToken } from '../lib/id.js'
import { dateRange, nowIso } from '../lib/time.js'
import { travelLocalActorAllowed } from '../security/oauth.js'
import type {
  AttachmentRef,
  CategoryAssignee,
  DecisionRef,
  DiscussionRef,
  Expense,
  ItineraryAssignment,
  PackingBag,
  PackingItem,
  Place,
  RequestContext,
  Reservation,
  TodoItem,
  Trip,
  TripDay,
  TripGuest,
  TripInvite,
  TripMember,
  TripSettings,
} from '../types.js'
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
import type { SettingsService } from './settings.service.js'

function remapOptional(map: Map<string, string>, value: string | undefined) {
  if (!value) return undefined
  return map.get(value)
}

function remapList(map: Map<string, string>, values: string[]) {
  return values.map((value) => map.get(value)).filter((value): value is string => Boolean(value))
}

function remapSubjectId(
  subjectType: AttachmentRef['subjectType'],
  subjectId: string | undefined,
  maps: {
    placeIdMap: Map<string, string>
    reservationIdMap: Map<string, string>
    expenseIdMap: Map<string, string>
    dayIdMap: Map<string, string>
  },
) {
  if (!subjectId) return undefined
  if (subjectType === 'place') return maps.placeIdMap.get(subjectId)
  if (subjectType === 'reservation') return maps.reservationIdMap.get(subjectId)
  if (subjectType === 'expense') return maps.expenseIdMap.get(subjectId)
  if (subjectType === 'day') return maps.dayIdMap.get(subjectId)
  return undefined
}

export class TripService {
  constructor(
    private readonly tripDao: TripDao,
    private readonly planningDao: PlanningDao,
    private readonly bookingDao: BookingDao,
    private readonly budgetDao: BudgetDao,
    private readonly packingDao: PackingDao,
    private readonly todoDao: TodoDao,
    private readonly attachmentDao: AttachmentDao,
    private readonly collaborationDao: CollaborationDao,
    private readonly automationDao: AutomationDao,
    private readonly settingsService: SettingsService,
  ) {}

  listTrips(ctx: RequestContext, options?: { includeArchived?: boolean }) {
    if (!ctx.local || !travelLocalActorAllowed()) {
      const userId = ctx.actor.userId ?? ctx.actor.ownerId
      if (!userId) return []
      return this.tripDao.listTripsForUser(ctx.serverId, userId, options)
    }
    return this.tripDao.listTrips(ctx.serverId, options)
  }

  async createTrip(ctx: RequestContext, input: CreateTripInput) {
    const timestamp = nowIso()
    const tripId = createId('trip')
    const ownerMemberId = createId('member')
    const ownerUserId = ctx.actor.userId ?? ctx.actor.ownerId ?? undefined
    const ownerName = ctx.actor.displayName ?? ownerUserId ?? 'Local user'

    const trip: Trip = {
      id: tripId,
      serverId: ctx.serverId,
      title: input.title,
      summary: input.summary,
      coverImageRef: input.coverImageRef,
      coverPhotoUrl: input.coverPhotoUrl,
      status: 'planning',
      timezone: input.timezone,
      currency: input.currency,
      startDate: input.startDate,
      endDate: input.endDate,
      homeLocation: input.homeLocation,
      destinationLabels: input.destinationLabels,
      createdByMemberId: ownerMemberId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const owner: TripMember = {
      id: ownerMemberId,
      tripId,
      userId: ownerUserId,
      displayName: ownerName,
      role: 'owner',
      avatarUrl: ctx.actor.avatarUrl ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const days = this.buildTripDays(trip, timestamp)
    return this.tripDao.createTrip(trip, owner, days)
  }

  async updateTrip(tripId: string, input: UpdateTripInput) {
    const updated = await this.tripDao.updateTrip(tripId, (trip) => ({
      ...trip,
      ...input,
      updatedAt: nowIso(),
      archivedAt: input.status === 'archived' ? nowIso() : trip.archivedAt,
    }))
    if (!updated) throw notFound('Trip')

    if (input.startDate || input.endDate || input.timezone) {
      await this.tripDao.replaceDays(updated.id, this.buildTripDays(updated, nowIso()))
    }
    return updated
  }

  async archiveTrip(tripId: string) {
    const updated = await this.tripDao.updateTrip(tripId, (trip) => ({
      ...trip,
      status: 'archived',
      archivedAt: nowIso(),
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Trip')
    return updated
  }

  async deleteTrip(tripId: string) {
    const deleted = await this.tripDao.deleteTripCascade(tripId)
    if (!deleted) throw notFound('Trip')
    return deleted
  }

  async copyTrip(ctx: RequestContext, sourceTripId: string) {
    const source = await this.getBundle(sourceTripId)
    const timestamp = nowIso()
    const tripId = createId('trip')
    const memberIdMap = new Map<string, string>()
    const guestIdMap = new Map<string, string>()
    const dayIdMap = new Map<string, string>()
    const placeIdMap = new Map<string, string>()
    const reservationIdMap = new Map<string, string>()
    const expenseIdMap = new Map<string, string>()
    const bagIdMap = new Map<string, string>()

    const trip: Trip = {
      ...source.trip,
      id: tripId,
      title: `${source.trip.title} Copy`,
      status: 'planning',
      archivedAt: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const members = source.members.map<TripMember>((member) => {
      const nextId = createId('member')
      memberIdMap.set(member.id, nextId)
      return {
        ...member,
        id: nextId,
        tripId,
        lastSeenAt: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })

    const actorUserId = ctx.actor.userId ?? ctx.actor.ownerId
    const actorMember = actorUserId
      ? members.find((member) => member.userId === actorUserId)
      : undefined
    if (actorMember) actorMember.role = 'owner'

    const guests = source.guests.map<TripGuest>((guest) => {
      const nextId = createId('guest')
      guestIdMap.set(guest.id, nextId)
      return { ...guest, id: nextId, tripId, createdAt: timestamp, updatedAt: timestamp }
    })

    const days = source.days.map<TripDay>((day) => {
      const nextId = createId('day')
      dayIdMap.set(day.id, nextId)
      return { ...day, id: nextId, tripId, createdAt: timestamp, updatedAt: timestamp }
    })

    const places = source.places.map<Place>((place) => {
      const nextId = createId('place')
      placeIdMap.set(place.id, nextId)
      return {
        ...place,
        id: nextId,
        tripId,
        savedByMemberId: remapOptional(memberIdMap, place.savedByMemberId),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })

    const expenses = source.expenses.map<Expense>((expense) => {
      const nextId = createId('expense')
      expenseIdMap.set(expense.id, nextId)
      return {
        ...expense,
        id: nextId,
        tripId,
        paidByMemberId: remapOptional(memberIdMap, expense.paidByMemberId),
        participantMemberIds: remapList(memberIdMap, expense.participantMemberIds),
        shares: expense.shares
          .map((share) => ({ ...share, memberId: memberIdMap.get(share.memberId) ?? '' }))
          .filter((share) => share.memberId),
        paidMemberIds: [],
        reservationId: undefined,
        placeId: remapOptional(placeIdMap, expense.placeId),
        status: expense.status === 'waived' ? 'waived' : 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })

    const reservations = source.reservations.map<Reservation>((reservation) => {
      const nextId = createId('resv')
      reservationIdMap.set(reservation.id, nextId)
      return {
        ...reservation,
        id: nextId,
        tripId,
        locationPlaceId: remapOptional(placeIdMap, reservation.locationPlaceId),
        checkInDayId: remapOptional(dayIdMap, reservation.checkInDayId),
        checkOutDayId: remapOptional(dayIdMap, reservation.checkOutDayId),
        guestIds: remapList(guestIdMap, reservation.guestIds),
        participantMemberIds: remapList(memberIdMap, reservation.participantMemberIds),
        expenseId: remapOptional(expenseIdMap, reservation.expenseId),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })

    const packingBags = source.packingBags.map<PackingBag>((bag) => {
      const nextId = createId('bag')
      bagIdMap.set(bag.id, nextId)
      return {
        ...bag,
        id: nextId,
        tripId,
        ownerMemberId: remapOptional(memberIdMap, bag.ownerMemberId),
        memberIds: remapList(memberIdMap, bag.memberIds),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })

    const packingItems = source.packingItems.map<PackingItem>((item) => ({
      ...item,
      id: createId('pack'),
      tripId,
      assignedToMemberId: remapOptional(memberIdMap, item.assignedToMemberId),
      bagId: remapOptional(bagIdMap, item.bagId),
      packedByMemberIds: [],
      contributorMemberIds: remapList(memberIdMap, item.contributorMemberIds),
      status: 'needed',
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

    const assignments = source.assignments.map<ItineraryAssignment>((assignment) => ({
      ...assignment,
      id: createId('assign'),
      tripId,
      dayId: remapOptional(dayIdMap, assignment.dayId),
      placeId: remapOptional(placeIdMap, assignment.placeId),
      reservationId: remapOptional(reservationIdMap, assignment.reservationId),
      expenseId: remapOptional(expenseIdMap, assignment.expenseId),
      participantMemberIds: remapList(memberIdMap, assignment.participantMemberIds),
      status: assignment.status === 'done' ? 'scheduled' : assignment.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

    const categoryAssignees = [
      ...source.packingCategoryAssignees,
      ...source.todoCategoryAssignees,
    ].map<CategoryAssignee>((assignee) => ({
      ...assignee,
      id: createId('catassignee'),
      tripId,
      memberIds: remapList(memberIdMap, assignee.memberIds),
      updatedAt: timestamp,
    }))

    const todos = source.todos.map<TodoItem>((todo) => ({
      ...todo,
      id: createId('todo'),
      tripId,
      assignedToMemberId: remapOptional(memberIdMap, todo.assignedToMemberId),
      status: todo.status === 'done' ? 'open' : todo.status,
      completedAt: undefined,
      createdByMemberId: remapOptional(memberIdMap, todo.createdByMemberId),
      createdAt: timestamp,
      updatedAt: timestamp,
    }))

    const tripSettings: TripSettings = {
      ...source.settings,
      tripId,
      updatedAt: timestamp,
    }

    const attachments = source.attachments.map<AttachmentRef>((attachment) => ({
      ...attachment,
      id: createId('file'),
      tripId,
      subjectId: remapSubjectId(attachment.subjectType, attachment.subjectId, {
        placeIdMap,
        reservationIdMap,
        expenseIdMap,
        dayIdMap,
      }),
      createdByMemberId: remapOptional(memberIdMap, attachment.createdByMemberId),
      createdAt: timestamp,
    }))

    const discussionRefs = source.discussionRefs.map<DiscussionRef>((ref) => ({
      ...ref,
      id: createId('discussion'),
      tripId,
      createdAt: timestamp,
    }))

    const decisionRefs = source.decisionRefs.map<DecisionRef>((ref) => ({
      ...ref,
      id: createId('decision'),
      tripId,
      decidedByMemberId: remapOptional(memberIdMap, ref.decidedByMemberId),
      createdAt: timestamp,
    }))

    return this.tripDao.createTripDeepCopy({
      trip,
      members,
      guests,
      days,
      places,
      assignments,
      reservations,
      expenses,
      packingBags,
      packingItems,
      categoryAssignees,
      todos,
      tripSettings,
      attachments,
      discussionRefs,
      decisionRefs,
    })
  }

  listMembers(tripId: string) {
    return this.tripDao.listMembers(tripId)
  }

  async addMember(tripId: string, input: CreateMemberInput, invitedByMemberId?: string) {
    const timestamp = nowIso()
    if (input.userId) {
      const existing = await this.tripDao.findMemberByUser(tripId, input.userId)
      if (existing) throw conflict('User is already a trip member')
    }
    const member: TripMember = {
      id: createId('member'),
      tripId,
      userId: input.userId,
      displayName: input.displayName,
      role: input.role,
      avatarUrl: input.avatarUrl,
      email: input.email,
      invitedByMemberId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.tripDao.addMember(member)
  }

  async updateMember(tripId: string, memberId: string, input: UpdateMemberInput) {
    const current = await this.tripDao.findMember(memberId)
    if (!current || current.tripId !== tripId) throw notFound('Trip member')
    if (current.role === 'owner' && input.role && input.role !== 'owner') {
      const owners = (await this.tripDao.listMembers(tripId)).filter(
        (member) => member.role === 'owner',
      )
      if (owners.length <= 1) throw badRequest('Cannot demote the last owner')
    }
    const updated = await this.tripDao.updateMember(memberId, (member) => ({
      ...member,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Trip member')
    return updated
  }

  async removeMember(tripId: string, memberId: string) {
    const current = await this.tripDao.findMember(memberId)
    if (!current || current.tripId !== tripId) throw notFound('Trip member')
    if (current.role === 'owner') {
      const owners = (await this.tripDao.listMembers(tripId)).filter(
        (member) => member.role === 'owner',
      )
      if (owners.length <= 1) throw badRequest('Cannot remove the last owner')
    }
    const removed = await this.tripDao.removeMember(memberId)
    if (!removed) throw notFound('Trip member')
    return removed
  }

  async transferOwner(tripId: string, nextOwnerMemberId: string, previousOwnerMemberId?: string) {
    const nextOwner = await this.tripDao.findMember(nextOwnerMemberId)
    if (!nextOwner || nextOwner.tripId !== tripId) throw notFound('Trip member')

    const timestamp = nowIso()
    if (previousOwnerMemberId && previousOwnerMemberId !== nextOwnerMemberId) {
      await this.tripDao.updateMember(previousOwnerMemberId, (member) => ({
        ...member,
        role: 'planner',
        updatedAt: timestamp,
      }))
    }

    const updated = await this.tripDao.updateMember(nextOwnerMemberId, (member) => ({
      ...member,
      role: 'owner',
      updatedAt: timestamp,
    }))
    if (!updated) throw notFound('Trip member')
    return updated
  }

  listGuests(tripId: string) {
    return this.tripDao.listGuests(tripId)
  }

  async createGuest(tripId: string, input: CreateGuestInput) {
    const timestamp = nowIso()
    const guest: TripGuest = {
      id: createId('guest'),
      tripId,
      displayName: input.displayName,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.tripDao.addGuest(guest)
  }

  async updateGuest(tripId: string, guestId: string, input: UpdateGuestInput) {
    const current = await this.tripDao.findGuest(guestId)
    if (!current || current.tripId !== tripId) throw notFound('Trip guest')
    const updated = await this.tripDao.updateGuest(guestId, (guest) => ({
      ...guest,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Trip guest')
    return updated
  }

  async deleteGuest(tripId: string, guestId: string) {
    const current = await this.tripDao.findGuest(guestId)
    if (!current || current.tripId !== tripId) throw notFound('Trip guest')
    const removed = await this.tripDao.removeGuest(guestId)
    if (!removed) throw notFound('Trip guest')
    return removed
  }

  listInvites(tripId: string) {
    return this.tripDao
      .listInvites(tripId)
      .then((invites) => invites.map(({ tokenHash: _tokenHash, ...invite }) => invite))
  }

  async createInvite(tripId: string, input: CreateInviteInput, createdByMemberId?: string) {
    const timestamp = nowIso()
    const token = createPublicToken()
    const invite: TripInvite = {
      id: createId('invite'),
      tripId,
      tokenHash: hashToken(token),
      role: input.role,
      invitedEmail: input.invitedEmail,
      invitedUserId: input.invitedUserId,
      message: input.message,
      status: 'pending',
      createdByMemberId,
      expiresAt: input.expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const saved = await this.tripDao.createInvite(invite)
    const { tokenHash: _tokenHash, ...safeInvite } = saved
    return { invite: safeInvite, token }
  }

  async acceptInvite(ctx: RequestContext, input: AcceptInviteInput) {
    const invite = await this.tripDao.findInviteByHash(hashToken(input.token))
    if (!invite) throw notFound('Trip invite')
    if (invite.status !== 'pending') throw badRequest('Invite is not pending')
    if (invite.expiresAt && invite.expiresAt < nowIso()) {
      await this.tripDao.updateInvite(invite.id, (item) => ({
        ...item,
        status: 'expired',
        updatedAt: nowIso(),
      }))
      throw badRequest('Invite has expired')
    }

    const userId = ctx.actor.userId ?? ctx.actor.ownerId ?? invite.invitedUserId
    if (invite.invitedUserId && userId && invite.invitedUserId !== userId) {
      throw badRequest('Invite is assigned to another user')
    }
    const existing = userId ? await this.tripDao.findMemberByUser(invite.tripId, userId) : null
    const timestamp = nowIso()
    const member =
      existing ??
      (await this.tripDao.addMember({
        id: createId('member'),
        tripId: invite.tripId,
        userId,
        displayName:
          input.displayName ??
          ctx.actor.displayName ??
          ctx.actor.username ??
          invite.invitedEmail ??
          'Traveler',
        role: invite.role,
        avatarUrl: ctx.actor.avatarUrl ?? undefined,
        email: invite.invitedEmail,
        invitedByMemberId: invite.createdByMemberId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))

    const updatedInvite = await this.tripDao.updateInvite(invite.id, (item) => ({
      ...item,
      status: 'accepted',
      acceptedByMemberId: member.id,
      acceptedAt: timestamp,
      updatedAt: timestamp,
    }))
    if (!updatedInvite) throw notFound('Trip invite')
    const { tokenHash: _tokenHash, ...safeInvite } = updatedInvite
    return { member, invite: safeInvite }
  }

  async revokeInvite(tripId: string, inviteId: string) {
    const current = (await this.tripDao.listInvites(tripId)).find(
      (invite) => invite.id === inviteId,
    )
    if (!current) throw notFound('Trip invite')
    const updated = await this.tripDao.updateInvite(inviteId, (invite) => ({
      ...invite,
      status: 'revoked',
      revokedAt: nowIso(),
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Trip invite')
    const { tokenHash: _tokenHash, ...safeInvite } = updated
    return safeInvite
  }

  async getBundle(tripId: string) {
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip) throw notFound('Trip')
    const [
      members,
      guests,
      days,
      places,
      assignments,
      reservations,
      expenses,
      packingBags,
      packingItems,
      packingCategoryAssignees,
      todos,
      todoCategoryAssignees,
      settings,
      attachments,
      shareLinks,
      discussionRefs,
      decisionRefs,
      automationTasks,
    ] = await Promise.all([
      this.tripDao.listMembers(tripId),
      this.tripDao.listGuests(tripId),
      this.tripDao.listDays(tripId),
      this.planningDao.listPlaces(tripId),
      this.planningDao.listAssignments(tripId),
      this.bookingDao.listReservations(tripId),
      this.budgetDao.listExpenses(tripId),
      this.packingDao.listBags(tripId),
      this.packingDao.listItems(tripId),
      this.packingDao.listCategoryAssignees(tripId, 'packing'),
      this.todoDao.listTodos(tripId),
      this.todoDao.listCategoryAssignees(tripId),
      this.settingsService.getTripSettings(tripId),
      this.attachmentDao.listAttachments(tripId),
      this.collaborationDao.listShareLinks(tripId),
      this.collaborationDao.listDiscussionRefs(tripId),
      this.collaborationDao.listDecisionRefs(tripId),
      this.automationDao.listTasks(tripId),
    ])

    return {
      trip,
      members,
      guests,
      days,
      places,
      assignments,
      reservations,
      expenses,
      packingBags,
      packingItems,
      packingCategoryAssignees,
      todos,
      todoCategoryAssignees,
      settings,
      attachments,
      shareLinks: shareLinks.map(({ tokenHash: _tokenHash, ...link }) => link),
      discussionRefs,
      decisionRefs,
      automationTasks,
    }
  }

  async exportIcs(tripId: string) {
    const bundle = await this.getBundle(tripId)
    return buildTripIcs({
      trip: bundle.trip,
      days: bundle.days,
      assignments: bundle.assignments,
      reservations: bundle.reservations,
    })
  }

  private buildTripDays(
    trip: Pick<Trip, 'id' | 'startDate' | 'endDate' | 'timezone'>,
    timestamp: string,
  ) {
    return dateRange(trip.startDate, trip.endDate).map<TripDay>((date) => ({
      id: createId('day'),
      tripId: trip.id,
      date,
      timezone: trip.timezone,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
  }
}
