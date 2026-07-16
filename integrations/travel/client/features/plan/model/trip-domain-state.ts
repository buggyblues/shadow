import type { TripManagementData } from '../api/trip-management.js'

function matchesRecord(record: { id: string; serverId?: string }, id: string) {
  return record.id === id || record.serverId === id
}

export function removeTimelineItem(data: TripManagementData, id: string): TripManagementData {
  return {
    ...data,
    journeyItems: data.journeyItems?.filter((item) => !matchesRecord(item, id)),
    reservations: data.reservations.filter((item) => !matchesRecord(item, id)),
    transports: data.transports.filter((item) => !matchesRecord(item, id)),
  }
}

export function removeExpense(data: TripManagementData, id: string): TripManagementData {
  return {
    ...data,
    expenses: data.expenses.filter((item) => !matchesRecord(item, id)),
  }
}

export function removePackingBag(data: TripManagementData, id: string): TripManagementData {
  return {
    ...data,
    packingBags: data.packingBags.filter((item) => !matchesRecord(item, id)),
  }
}

export function removePackingItem(data: TripManagementData, id: string): TripManagementData {
  return {
    ...data,
    packingItems: data.packingItems.filter((item) => !matchesRecord(item, id)),
  }
}

export function removeMember(data: TripManagementData, id: string): TripManagementData {
  return {
    ...data,
    members: data.members.filter((item) => !matchesRecord(item, id)),
  }
}
