import type { TravelDataStore } from '../db/database.js'
import type { ImportJob, Reservation } from '../types.js'

export class BookingDao {
  constructor(private readonly db: TravelDataStore) {}

  listReservations(tripId: string) {
    return this.db.read((state) =>
      state.reservations
        .filter((reservation) => reservation.tripId === tripId)
        .sort(
          (a, b) =>
            (a.startAt ?? '').localeCompare(b.startAt ?? '') || a.title.localeCompare(b.title),
        ),
    )
  }

  findReservation(reservationId: string) {
    return this.db.read(
      (state) => state.reservations.find((reservation) => reservation.id === reservationId) ?? null,
    )
  }

  createReservation(reservation: Reservation) {
    return this.db.write((state) => {
      state.reservations.push(reservation)
      return reservation
    })
  }

  updateReservation(reservationId: string, updater: (reservation: Reservation) => Reservation) {
    return this.db.write((state) => {
      const index = state.reservations.findIndex((reservation) => reservation.id === reservationId)
      if (index < 0) return null
      const current = state.reservations[index]
      if (!current) return null
      const next = updater(current)
      state.reservations[index] = next
      return next
    })
  }

  deleteReservation(reservationId: string) {
    return this.db.write((state) => {
      const reservation = state.reservations.find((item) => item.id === reservationId) ?? null
      state.reservations = state.reservations.filter((item) => item.id !== reservationId)
      state.assignments = state.assignments.filter(
        (assignment) => assignment.reservationId !== reservationId,
      )
      for (const expense of state.expenses) {
        if (expense.reservationId === reservationId) expense.reservationId = undefined
      }
      return reservation
    })
  }

  reorderReservations(tripId: string, orderedIds: string[]) {
    return this.db.write((state) => {
      const idSet = new Set(orderedIds)
      const existing = state.reservations.filter(
        (reservation) => reservation.tripId === tripId && idSet.has(reservation.id),
      )
      if (existing.length !== orderedIds.length) return null
      const byId = new Map(existing.map((reservation) => [reservation.id, reservation]))
      for (const [index, reservationId] of orderedIds.entries()) {
        const reservation = byId.get(reservationId)
        if (!reservation) return null
        reservation.sequence = (index + 1) * 100
        reservation.updatedAt = new Date().toISOString()
      }
      return existing
    })
  }

  listImportJobs(tripId: string) {
    return this.db.read((state) =>
      state.importJobs
        .filter((job) => job.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  findImportJob(jobId: string) {
    return this.db.read((state) => state.importJobs.find((job) => job.id === jobId) ?? null)
  }

  createImportJob(job: ImportJob) {
    return this.db.write((state) => {
      state.importJobs.push(job)
      return job
    })
  }

  updateImportJob(jobId: string, updater: (job: ImportJob) => ImportJob) {
    return this.db.write((state) => {
      const index = state.importJobs.findIndex((job) => job.id === jobId)
      if (index < 0) return null
      const current = state.importJobs[index]
      if (!current) return null
      const next = updater(current)
      state.importJobs[index] = next
      return next
    })
  }
}
