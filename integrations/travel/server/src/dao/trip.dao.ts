import type { TravelDataStore } from '../db/database.js'
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
  Reservation,
  TodoItem,
  Trip,
  TripDay,
  TripGuest,
  TripInvite,
  TripMember,
  TripSettings,
} from '../types.js'

export interface TripDeepCopyInput {
  trip: Trip
  members: TripMember[]
  guests: TripGuest[]
  days: TripDay[]
  places: Place[]
  assignments: ItineraryAssignment[]
  reservations: Reservation[]
  expenses: Expense[]
  packingBags: PackingBag[]
  packingItems: PackingItem[]
  categoryAssignees: CategoryAssignee[]
  todos: TodoItem[]
  tripSettings?: TripSettings
  attachments: AttachmentRef[]
  discussionRefs: DiscussionRef[]
  decisionRefs: DecisionRef[]
}

export class TripDao {
  constructor(private readonly db: TravelDataStore) {}

  listTrips(serverId: string, options: { includeArchived?: boolean } = {}) {
    return this.db.read((state) =>
      state.trips
        .filter((trip) => trip.serverId === serverId)
        .filter((trip) => options.includeArchived || trip.status !== 'archived')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  listTripsForUser(serverId: string, userId: string, options: { includeArchived?: boolean } = {}) {
    return this.db.read((state) => {
      const tripIds = new Set(
        state.members.filter((member) => member.userId === userId).map((member) => member.tripId),
      )
      return state.trips
        .filter((trip) => trip.serverId === serverId && tripIds.has(trip.id))
        .filter((trip) => options.includeArchived || trip.status !== 'archived')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    })
  }

  findTrip(tripId: string) {
    return this.db.read((state) => state.trips.find((trip) => trip.id === tripId) ?? null)
  }

  createTrip(trip: Trip, owner: TripMember, days: TripDay[]) {
    return this.db.write((state) => {
      state.trips.push(trip)
      state.members.push(owner)
      state.days.push(...days)
      return trip
    })
  }

  createTripDeepCopy(input: TripDeepCopyInput) {
    return this.db.write((state) => {
      state.trips.push(input.trip)
      state.members.push(...input.members)
      state.guests.push(...input.guests)
      state.days.push(...input.days)
      state.places.push(...input.places)
      state.assignments.push(...input.assignments)
      state.reservations.push(...input.reservations)
      state.expenses.push(...input.expenses)
      state.packingBags.push(...input.packingBags)
      state.packingItems.push(...input.packingItems)
      state.categoryAssignees.push(...input.categoryAssignees)
      state.todos.push(...input.todos)
      if (input.tripSettings) state.tripSettings.push(input.tripSettings)
      state.attachments.push(...input.attachments)
      state.discussionRefs.push(...input.discussionRefs)
      state.decisionRefs.push(...input.decisionRefs)
      return input.trip
    })
  }

  updateTrip(tripId: string, updater: (trip: Trip) => Trip) {
    return this.db.write((state) => {
      const index = state.trips.findIndex((trip) => trip.id === tripId)
      if (index < 0) return null
      const current = state.trips[index]
      if (!current) return null
      const next = updater(current)
      state.trips[index] = next
      return next
    })
  }

  deleteTripCascade(tripId: string) {
    return this.db.write((state) => {
      const trip = state.trips.find((item) => item.id === tripId) ?? null
      state.trips = state.trips.filter((item) => item.id !== tripId)
      state.members = state.members.filter((item) => item.tripId !== tripId)
      state.guests = state.guests.filter((item) => item.tripId !== tripId)
      state.invites = state.invites.filter((item) => item.tripId !== tripId)
      state.recruitments = state.recruitments.filter((item) => item.tripId !== tripId)
      state.joinApplications = state.joinApplications.filter((item) => item.tripId !== tripId)
      state.days = state.days.filter((item) => item.tripId !== tripId)
      state.places = state.places.filter((item) => item.tripId !== tripId)
      state.assignments = state.assignments.filter((item) => item.tripId !== tripId)
      state.reservations = state.reservations.filter((item) => item.tripId !== tripId)
      state.expenses = state.expenses.filter((item) => item.tripId !== tripId)
      state.packingBags = state.packingBags.filter((item) => item.tripId !== tripId)
      state.packingItems = state.packingItems.filter((item) => item.tripId !== tripId)
      state.categoryAssignees = state.categoryAssignees.filter((item) => item.tripId !== tripId)
      state.todos = state.todos.filter((item) => item.tripId !== tripId)
      state.tripSettings = state.tripSettings.filter((item) => item.tripId !== tripId)
      state.attachments = state.attachments.filter((item) => item.tripId !== tripId)
      state.shareLinks = state.shareLinks.filter((item) => item.tripId !== tripId)
      state.discussionRefs = state.discussionRefs.filter((item) => item.tripId !== tripId)
      state.decisionRefs = state.decisionRefs.filter((item) => item.tripId !== tripId)
      state.importJobs = state.importJobs.filter((item) => item.tripId !== tripId)
      state.automationTasks = state.automationTasks.filter((item) => item.tripId !== tripId)
      state.tripBuddyBindings = state.tripBuddyBindings.filter((item) => item.tripId !== tripId)
      state.buddyPlanDrafts = state.buddyPlanDrafts.filter((item) => item.tripId !== tripId)
      state.communityShareRefs = state.communityShareRefs.filter((item) => item.tripId !== tripId)
      state.backups = state.backups.filter((item) => item.tripId !== tripId)
      state.notifications = state.notifications.filter((item) => item.tripId !== tripId)
      return trip
    })
  }

  listMembers(tripId: string) {
    return this.db.read((state) =>
      state.members
        .filter((member) => member.tripId === tripId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    )
  }

  findMemberByUser(tripId: string, userId: string) {
    return this.db.read(
      (state) =>
        state.members.find((member) => member.tripId === tripId && member.userId === userId) ??
        null,
    )
  }

  findMember(memberId: string) {
    return this.db.read((state) => state.members.find((member) => member.id === memberId) ?? null)
  }

  addMember(member: TripMember) {
    return this.db.write((state) => {
      state.members.push(member)
      return member
    })
  }

  updateMember(memberId: string, updater: (member: TripMember) => TripMember) {
    return this.db.write((state) => {
      const index = state.members.findIndex((member) => member.id === memberId)
      if (index < 0) return null
      const current = state.members[index]
      if (!current) return null
      const next = updater(current)
      state.members[index] = next
      return next
    })
  }

  removeMember(memberId: string) {
    return this.db.write((state) => {
      const member = state.members.find((item) => item.id === memberId) ?? null
      if (!member) return null
      const inTrip = <T extends { tripId: string }>(item: T) => item.tripId === member.tripId
      state.members = state.members.filter((item) => item.id !== memberId)
      for (const assignment of state.assignments.filter(inTrip)) {
        assignment.participantMemberIds = assignment.participantMemberIds.filter(
          (id) => id !== memberId,
        )
      }
      for (const reservation of state.reservations.filter(inTrip)) {
        reservation.participantMemberIds = reservation.participantMemberIds.filter(
          (id) => id !== memberId,
        )
      }
      for (const expense of state.expenses.filter(inTrip)) {
        if (expense.paidByMemberId === memberId) expense.paidByMemberId = undefined
        expense.participantMemberIds = expense.participantMemberIds.filter((id) => id !== memberId)
        expense.paidMemberIds = expense.paidMemberIds.filter((id) => id !== memberId)
        expense.shares = expense.shares.filter((share) => share.memberId !== memberId)
      }
      for (const settlement of state.settlementRecords.filter(inTrip)) {
        settlement.balances = settlement.balances.filter((balance) => balance.memberId !== memberId)
        settlement.transfers = settlement.transfers.filter(
          (transfer) => transfer.fromMemberId !== memberId && transfer.toMemberId !== memberId,
        )
        settlement.paidTransferIds = settlement.paidTransferIds.filter(
          (id) => !id.split(':').includes(memberId),
        )
        if (settlement.createdByMemberId === memberId) settlement.createdByMemberId = undefined
      }
      for (const bag of state.packingBags.filter(inTrip)) {
        if (bag.ownerMemberId === memberId) bag.ownerMemberId = undefined
        bag.memberIds = bag.memberIds.filter((id) => id !== memberId)
      }
      for (const item of state.packingItems.filter(inTrip)) {
        if (item.assignedToMemberId === memberId) item.assignedToMemberId = undefined
        item.packedByMemberIds = item.packedByMemberIds.filter((id) => id !== memberId)
        item.contributorMemberIds = item.contributorMemberIds.filter((id) => id !== memberId)
      }
      for (const assignee of state.categoryAssignees.filter(inTrip)) {
        assignee.memberIds = assignee.memberIds.filter((id) => id !== memberId)
      }
      for (const todo of state.todos.filter(inTrip)) {
        if (todo.assignedToMemberId === memberId) todo.assignedToMemberId = undefined
        if (todo.createdByMemberId === memberId) todo.createdByMemberId = undefined
      }
      for (const photo of state.tripPhotoRefs.filter(inTrip)) {
        if (photo.createdByMemberId === memberId) photo.createdByMemberId = undefined
      }
      for (const mutation of state.syncMutations.filter(inTrip)) {
        if (mutation.createdByMemberId === memberId) mutation.createdByMemberId = undefined
      }
      for (const attachment of state.attachments.filter(inTrip)) {
        if (attachment.createdByMemberId === memberId) attachment.createdByMemberId = undefined
      }
      for (const link of state.shareLinks.filter(inTrip)) {
        if (link.createdByMemberId === memberId) link.createdByMemberId = undefined
      }
      for (const decision of state.decisionRefs.filter(inTrip)) {
        if (decision.decidedByMemberId === memberId) decision.decidedByMemberId = undefined
      }
      for (const binding of state.tripBuddyBindings.filter(inTrip)) {
        if (binding.createdByMemberId === memberId) binding.createdByMemberId = undefined
      }
      for (const draft of state.buddyPlanDrafts.filter(inTrip)) {
        if (draft.reviewedByMemberId === memberId) draft.reviewedByMemberId = undefined
      }
      for (const share of state.communityShareRefs.filter(inTrip)) {
        if (share.createdByMemberId === memberId) share.createdByMemberId = undefined
      }
      for (const notification of state.notifications.filter(
        (item) => item.tripId === member.tripId,
      )) {
        notification.readByMemberIds = notification.readByMemberIds.filter((id) => id !== memberId)
      }
      return member
    })
  }

  listGuests(tripId: string) {
    return this.db.read((state) =>
      state.guests
        .filter((guest) => guest.tripId === tripId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    )
  }

  addGuest(guest: TripGuest) {
    return this.db.write((state) => {
      state.guests.push(guest)
      return guest
    })
  }

  findGuest(guestId: string) {
    return this.db.read((state) => state.guests.find((guest) => guest.id === guestId) ?? null)
  }

  updateGuest(guestId: string, updater: (guest: TripGuest) => TripGuest) {
    return this.db.write((state) => {
      const index = state.guests.findIndex((guest) => guest.id === guestId)
      if (index < 0) return null
      const current = state.guests[index]
      if (!current) return null
      const next = updater(current)
      state.guests[index] = next
      return next
    })
  }

  removeGuest(guestId: string) {
    return this.db.write((state) => {
      const guest = state.guests.find((item) => item.id === guestId) ?? null
      state.guests = state.guests.filter((item) => item.id !== guestId)
      for (const reservation of state.reservations) {
        reservation.guestIds = reservation.guestIds.filter((id) => id !== guestId)
      }
      return guest
    })
  }

  listInvites(tripId: string) {
    return this.db.read((state) =>
      state.invites
        .filter((invite) => invite.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  createInvite(invite: TripInvite) {
    return this.db.write((state) => {
      state.invites.push(invite)
      return invite
    })
  }

  findInviteByHash(tokenHash: string) {
    return this.db.read(
      (state) => state.invites.find((invite) => invite.tokenHash === tokenHash) ?? null,
    )
  }

  updateInvite(inviteId: string, updater: (invite: TripInvite) => TripInvite) {
    return this.db.write((state) => {
      const index = state.invites.findIndex((invite) => invite.id === inviteId)
      if (index < 0) return null
      const current = state.invites[index]
      if (!current) return null
      const next = updater(current)
      state.invites[index] = next
      return next
    })
  }

  listDays(tripId: string) {
    return this.db.read((state) =>
      state.days
        .filter((day) => day.tripId === tripId)
        .sort((a, b) => a.date.localeCompare(b.date)),
    )
  }

  replaceDays(tripId: string, days: TripDay[]) {
    return this.db.write((state) => {
      state.days = state.days.filter((day) => day.tripId !== tripId)
      state.days.push(...days)
      return days
    })
  }
}
