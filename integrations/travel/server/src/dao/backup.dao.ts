import type { TravelDataStore } from '../db/database.js'
import type { TravelBackup, TravelState } from '../types.js'

function tripSnapshotFromState(state: TravelState, tripId: string) {
  return {
    trips: state.trips.filter((trip) => trip.id === tripId),
    members: state.members.filter((member) => member.tripId === tripId),
    guests: state.guests.filter((guest) => guest.tripId === tripId),
    invites: state.invites.filter((invite) => invite.tripId === tripId),
    recruitments: state.recruitments.filter((item) => item.tripId === tripId),
    joinApplications: state.joinApplications.filter((item) => item.tripId === tripId),
    days: state.days.filter((day) => day.tripId === tripId),
    places: state.places.filter((place) => place.tripId === tripId),
    assignments: state.assignments.filter((assignment) => assignment.tripId === tripId),
    reservations: state.reservations.filter((reservation) => reservation.tripId === tripId),
    expenses: state.expenses.filter((expense) => expense.tripId === tripId),
    packingBags: state.packingBags.filter((bag) => bag.tripId === tripId),
    packingItems: state.packingItems.filter((item) => item.tripId === tripId),
    categoryAssignees: state.categoryAssignees.filter((item) => item.tripId === tripId),
    todos: state.todos.filter((todo) => todo.tripId === tripId),
    tripSettings: state.tripSettings.filter((settings) => settings.tripId === tripId),
    attachments: state.attachments.filter((attachment) => attachment.tripId === tripId),
    shareLinks: state.shareLinks.filter((link) => link.tripId === tripId),
    discussionRefs: state.discussionRefs.filter((ref) => ref.tripId === tripId),
    decisionRefs: state.decisionRefs.filter((ref) => ref.tripId === tripId),
    importJobs: state.importJobs.filter((job) => job.tripId === tripId),
    automationTasks: state.automationTasks.filter((task) => task.tripId === tripId),
  }
}

export class BackupDao {
  constructor(private readonly db: TravelDataStore) {}

  listBackups(serverId: string, tripId?: string) {
    return this.db.read((state) =>
      state.backups
        .filter((backup) => backup.serverId === serverId)
        .filter((backup) => !tripId || backup.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ snapshot: _snapshot, ...backup }) => backup),
    )
  }

  findBackup(backupId: string) {
    return this.db.read((state) => state.backups.find((backup) => backup.id === backupId) ?? null)
  }

  createBackup(backup: TravelBackup) {
    return this.db.write((state) => {
      state.backups.push(backup)
      const { snapshot: _snapshot, ...safeBackup } = backup
      return safeBackup
    })
  }

  exportTripSnapshot(tripId: string) {
    return this.db.read((state) => tripSnapshotFromState(state, tripId))
  }

  exportServerSnapshot(serverId: string) {
    return this.db.read((state) => ({
      ...state,
      trips: state.trips.filter((trip) => trip.serverId === serverId),
      tags: state.tags.filter((tag) => tag.serverId === serverId),
      categories: state.categories.filter((category) => category.serverId === serverId),
      backups: [],
      notifications: state.notifications.filter(
        (notification) => notification.serverId === serverId,
      ),
    }))
  }

  restoreTripSnapshot(tripId: string, backupId: string, snapshot: Partial<TravelState>) {
    return this.db.write((state) => {
      const stateArrays = state as unknown as Record<string, unknown[]>
      const snapshotArrays = snapshot as unknown as Record<string, unknown[] | undefined>
      const replace = (key: string, belongsToTrip: (item: Record<string, unknown>) => boolean) => {
        const existing = stateArrays[key]
        const next = snapshotArrays[key]
        if (!Array.isArray(existing) || !Array.isArray(next)) return
        stateArrays[key] = [
          ...existing.filter((item) => !belongsToTrip(item as Record<string, unknown>)),
          ...next,
        ]
      }

      replace('trips', (trip) => trip.id === tripId)
      replace('members', (member) => member.tripId === tripId)
      replace('guests', (guest) => guest.tripId === tripId)
      replace('invites', (invite) => invite.tripId === tripId)
      replace('recruitments', (item) => item.tripId === tripId)
      replace('joinApplications', (item) => item.tripId === tripId)
      replace('days', (day) => day.tripId === tripId)
      replace('places', (place) => place.tripId === tripId)
      replace('assignments', (assignment) => assignment.tripId === tripId)
      replace('reservations', (reservation) => reservation.tripId === tripId)
      replace('expenses', (expense) => expense.tripId === tripId)
      replace('packingBags', (bag) => bag.tripId === tripId)
      replace('packingItems', (item) => item.tripId === tripId)
      replace('categoryAssignees', (item) => item.tripId === tripId)
      replace('todos', (todo) => todo.tripId === tripId)
      replace('tripSettings', (settings) => settings.tripId === tripId)
      replace('attachments', (attachment) => attachment.tripId === tripId)
      replace('shareLinks', (link) => link.tripId === tripId)
      replace('discussionRefs', (ref) => ref.tripId === tripId)
      replace('decisionRefs', (ref) => ref.tripId === tripId)
      replace('importJobs', (job) => job.tripId === tripId)
      replace('automationTasks', (task) => task.tripId === tripId)

      const backup = state.backups.find((item) => item.id === backupId)
      if (backup) {
        backup.status = 'restored'
        backup.restoredAt = new Date().toISOString()
      }
      return tripSnapshotFromState(state, tripId)
    })
  }
}
