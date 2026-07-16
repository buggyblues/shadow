import type { BookingDao } from '../dao/booking.dao.js'
import type { PlanningDao } from '../dao/planning.dao.js'
import type { RequestContext } from '../types.js'
import type { NotificationService } from './notification.service.js'
import type { SettingsService } from './settings.service.js'

function hoursUntil(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return (time - Date.now()) / (1000 * 60 * 60)
}

export class ReminderService {
  constructor(
    private readonly planningDao: PlanningDao,
    private readonly bookingDao: BookingDao,
    private readonly settingsService: SettingsService,
    private readonly notificationService: NotificationService,
  ) {}

  async createTripReminders(ctx: RequestContext, tripId: string) {
    const [settings, assignments, reservations, existing] = await Promise.all([
      this.settingsService.getTripSettings(tripId),
      this.planningDao.listAssignments(tripId),
      this.bookingDao.listReservations(tripId),
      this.notificationService.listNotifications(ctx, { tripId }),
    ])
    const maxLeadHours = Math.max(...settings.notificationLeadHours, 24)
    const existingKeys = new Set(
      existing.map((notification) => `${notification.subjectType}:${notification.subjectId}`),
    )
    const created = []

    for (const assignment of assignments) {
      if (!assignment.startAt || assignment.status === 'done' || assignment.status === 'skipped') {
        continue
      }
      const hours = hoursUntil(assignment.startAt)
      if (hours === null || hours < 0 || hours > maxLeadHours) continue
      const key = `assignment:${assignment.id}`
      if (existingKeys.has(key)) continue
      created.push(
        await this.notificationService.createNotification(ctx, {
          tripId,
          title: `Upcoming: ${assignment.title}`,
          body: `Starts at ${assignment.startAt}`,
          level: hours <= 2 ? 'warning' : 'info',
          subjectType: 'assignment',
          subjectId: assignment.id,
        }),
      )
      existingKeys.add(key)
    }

    for (const reservation of reservations) {
      if (!reservation.startAt || reservation.status === 'cancelled') continue
      const hours = hoursUntil(reservation.startAt)
      if (hours === null || hours < 0 || hours > maxLeadHours) continue
      const key = `reservation:${reservation.id}`
      if (existingKeys.has(key)) continue
      created.push(
        await this.notificationService.createNotification(ctx, {
          tripId,
          title: `Upcoming booking: ${reservation.title}`,
          body: reservation.confirmationCode
            ? `Confirmation ${reservation.confirmationCode}`
            : `Starts at ${reservation.startAt}`,
          level: hours <= 2 ? 'warning' : 'info',
          subjectType: 'reservation',
          subjectId: reservation.id,
        }),
      )
      existingKeys.add(key)
    }

    return created
  }
}
