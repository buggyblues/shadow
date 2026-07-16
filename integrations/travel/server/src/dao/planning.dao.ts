import type { TravelDataStore } from '../db/database.js'
import type { ItineraryAssignment, Place, RouteSegment, TripDay, TripPhotoRef } from '../types.js'

export class PlanningDao {
  constructor(private readonly db: TravelDataStore) {}

  listDays(tripId: string) {
    return this.db.read((state) =>
      state.days
        .filter((day) => day.tripId === tripId)
        .sort((a, b) => a.date.localeCompare(b.date)),
    )
  }

  findDay(dayId: string) {
    return this.db.read((state) => state.days.find((day) => day.id === dayId) ?? null)
  }

  upsertDay(day: TripDay) {
    return this.db.write((state) => {
      const index = state.days.findIndex((item) => item.id === day.id)
      if (index >= 0) state.days[index] = day
      else state.days.push(day)
      return day
    })
  }

  updateDay(dayId: string, updater: (day: TripDay) => TripDay) {
    return this.db.write((state) => {
      const index = state.days.findIndex((day) => day.id === dayId)
      if (index < 0) return null
      const current = state.days[index]
      if (!current) return null
      const next = updater(current)
      state.days[index] = next
      return next
    })
  }

  deleteDay(dayId: string) {
    return this.db.write((state) => {
      const day = state.days.find((item) => item.id === dayId) ?? null
      state.days = state.days.filter((item) => item.id !== dayId)
      for (const assignment of state.assignments) {
        if (assignment.dayId === dayId) assignment.dayId = undefined
      }
      return day
    })
  }

  listPlaces(tripId: string) {
    return this.db.read((state) =>
      state.places
        .filter((place) => place.tripId === tripId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  findPlace(placeId: string) {
    return this.db.read((state) => state.places.find((place) => place.id === placeId) ?? null)
  }

  createPlace(place: Place) {
    return this.db.write((state) => {
      state.places.push(place)
      return place
    })
  }

  createPlaces(places: Place[]) {
    return this.db.write((state) => {
      state.places.push(...places)
      return places
    })
  }

  updatePlace(placeId: string, updater: (place: Place) => Place) {
    return this.db.write((state) => {
      const index = state.places.findIndex((place) => place.id === placeId)
      if (index < 0) return null
      const current = state.places[index]
      if (!current) return null
      const next = updater(current)
      state.places[index] = next
      return next
    })
  }

  deletePlace(placeId: string) {
    return this.db.write((state) => {
      const place = state.places.find((item) => item.id === placeId) ?? null
      state.places = state.places.filter((item) => item.id !== placeId)
      state.assignments = state.assignments.filter((assignment) => assignment.placeId !== placeId)
      for (const reservation of state.reservations) {
        if (reservation.locationPlaceId === placeId) reservation.locationPlaceId = undefined
      }
      for (const expense of state.expenses) {
        if (expense.placeId === placeId) expense.placeId = undefined
      }
      return place
    })
  }

  listAssignments(tripId: string, dayId?: string) {
    return this.db.read((state) =>
      state.assignments
        .filter((assignment) => assignment.tripId === tripId)
        .filter((assignment) => !dayId || assignment.dayId === dayId)
        .sort((a, b) => {
          const dayCompare = (a.dayId ?? '').localeCompare(b.dayId ?? '')
          return dayCompare || a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt)
        }),
    )
  }

  findAssignment(assignmentId: string) {
    return this.db.read(
      (state) => state.assignments.find((assignment) => assignment.id === assignmentId) ?? null,
    )
  }

  createAssignment(assignment: ItineraryAssignment) {
    return this.db.write((state) => {
      state.assignments.push(assignment)
      return assignment
    })
  }

  updateAssignment(
    assignmentId: string,
    updater: (assignment: ItineraryAssignment) => ItineraryAssignment,
  ) {
    return this.db.write((state) => {
      const index = state.assignments.findIndex((assignment) => assignment.id === assignmentId)
      if (index < 0) return null
      const current = state.assignments[index]
      if (!current) return null
      const next = updater(current)
      state.assignments[index] = next
      return next
    })
  }

  deleteAssignment(assignmentId: string) {
    return this.db.write((state) => {
      const assignment = state.assignments.find((item) => item.id === assignmentId) ?? null
      state.assignments = state.assignments.filter((item) => item.id !== assignmentId)
      return assignment
    })
  }

  reorderAssignments(tripId: string, dayId: string | undefined, orderedIds: string[]) {
    return this.db.write((state) => {
      const idSet = new Set(orderedIds)
      const existing = state.assignments.filter(
        (assignment) =>
          assignment.tripId === tripId && assignment.dayId === dayId && idSet.has(assignment.id),
      )
      if (existing.length !== orderedIds.length) return null
      const byId = new Map(existing.map((assignment) => [assignment.id, assignment]))
      const reordered = orderedIds.map((id, index) => {
        const assignment = byId.get(id)
        if (!assignment) return null
        assignment.sequence = (index + 1) * 100
        assignment.updatedAt = new Date().toISOString()
        return assignment
      })
      return reordered.every(Boolean) ? existing : null
    })
  }

  createRouteSegment(segment: RouteSegment) {
    return this.db.write((state) => {
      state.routeSegments.push(segment)
      return segment
    })
  }

  listRouteSegments(tripId: string, dayId?: string) {
    return this.db.read((state) =>
      state.routeSegments
        .filter((segment) => segment.tripId === tripId)
        .filter((segment) => !dayId || segment.dayId === dayId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  createTripPhotoRef(ref: TripPhotoRef) {
    return this.db.write((state) => {
      const existing = state.tripPhotoRefs.find(
        (item) =>
          item.tripId === ref.tripId &&
          item.provider === ref.provider &&
          item.assetId === ref.assetId &&
          item.ownerUserId === ref.ownerUserId &&
          item.subjectType === ref.subjectType &&
          item.subjectId === ref.subjectId,
      )
      if (existing) return existing
      state.tripPhotoRefs.push(ref)
      return ref
    })
  }

  listTripPhotoRefs(tripId: string, subjectType?: string, subjectId?: string) {
    return this.db.read((state) =>
      state.tripPhotoRefs
        .filter((ref) => ref.tripId === tripId)
        .filter((ref) => !subjectType || ref.subjectType === subjectType)
        .filter((ref) => !subjectId || ref.subjectId === subjectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  deleteTripPhotoRef(tripId: string, refId: string) {
    return this.db.write((state) => {
      const ref = state.tripPhotoRefs.find((item) => item.id === refId && item.tripId === tripId)
      state.tripPhotoRefs = state.tripPhotoRefs.filter(
        (item) => !(item.id === refId && item.tripId === tripId),
      )
      return ref ?? null
    })
  }
}
