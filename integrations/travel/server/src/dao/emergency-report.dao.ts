import type { TravelDataStore } from '../db/database.js'
import type { EmergencyReport } from '../types.js'

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latitudeDelta = toRadians(b.lat - a.lat)
  const longitudeDelta = toRadians(b.lng - a.lng)
  const latitudeA = toRadians(a.lat)
  const latitudeB = toRadians(b.lat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export class EmergencyReportDao {
  constructor(private readonly db: TravelDataStore) {}

  list(serverId: string, options: { includeEnded?: boolean } = {}) {
    return this.db.read((state) =>
      state.emergencyReports
        .filter((report) => report.serverId === serverId)
        .filter((report) => options.includeEnded || report.status === 'active')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  calculateImpact(serverId: string, latitude: number, longitude: number) {
    return this.db.read((state) => {
      const nearbyPlaces = state.places.filter(
        (place) =>
          place.coordinates &&
          distanceKm(
            { lat: latitude, lng: longitude },
            { lat: place.coordinates.lat, lng: place.coordinates.lng },
          ) <= 5,
      )
      const placeIds = new Set(nearbyPlaces.map((place) => place.id))
      const affectedTripIds = [
        ...new Set(
          nearbyPlaces
            .map((place) => state.trips.find((trip) => trip.id === place.tripId))
            .filter(
              (trip) =>
                trip?.serverId === serverId &&
                trip.status !== 'archived' &&
                trip.status !== 'completed',
            )
            .map((trip) => trip!.id),
        ),
      ]
      const assignments = state.assignments.filter(
        (assignment) =>
          affectedTripIds.includes(assignment.tripId) &&
          Boolean(assignment.placeId && placeIds.has(assignment.placeId)),
      )
      const reservations = state.reservations.filter(
        (reservation) =>
          affectedTripIds.includes(reservation.tripId) &&
          Boolean(reservation.locationPlaceId && placeIds.has(reservation.locationPlaceId)),
      )
      return {
        affectedTripIds,
        journeyItemIds: [
          ...assignments.map((assignment) => assignment.id),
          ...reservations.map((reservation) => reservation.id),
        ],
        participantMemberIds: [
          ...new Set(
            assignments
              .flatMap((assignment) => assignment.participantMemberIds)
              .concat(reservations.flatMap((reservation) => reservation.participantMemberIds))
              .concat(
                state.members
                  .filter((member) => affectedTripIds.includes(member.tripId))
                  .map((member) => member.id),
              ),
          ),
        ],
      }
    })
  }

  create(report: EmergencyReport) {
    return this.db.write((state) => {
      state.emergencyReports.push(report)
      return report
    })
  }

  update(reportId: string, updater: (report: EmergencyReport) => EmergencyReport) {
    return this.db.write((state) => {
      const index = state.emergencyReports.findIndex((report) => report.id === reportId)
      if (index < 0) return null
      const current = state.emergencyReports[index]
      if (!current) return null
      const next = updater(current)
      state.emergencyReports[index] = next
      return next
    })
  }
}
