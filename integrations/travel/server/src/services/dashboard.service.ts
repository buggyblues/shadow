import type { AttachmentDao } from '../dao/attachment.dao.js'
import type { AutomationDao } from '../dao/automation.dao.js'
import type { BookingDao } from '../dao/booking.dao.js'
import type { CollaborationDao } from '../dao/collaboration.dao.js'
import type { PackingDao } from '../dao/packing.dao.js'
import type { PlanningDao } from '../dao/planning.dao.js'
import type { TodoDao } from '../dao/todo.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import { notFound } from '../lib/errors.js'
import { compareOptionalIso, nowIso } from '../lib/time.js'
import type { BudgetService } from './budget.service.js'
import type { SettingsService } from './settings.service.js'

export class DashboardService {
  constructor(
    private readonly tripDao: TripDao,
    private readonly planningDao: PlanningDao,
    private readonly bookingDao: BookingDao,
    private readonly budgetService: BudgetService,
    private readonly packingDao: PackingDao,
    private readonly todoDao: TodoDao,
    private readonly attachmentDao: AttachmentDao,
    private readonly collaborationDao: CollaborationDao,
    private readonly automationDao: AutomationDao,
    private readonly settingsService: SettingsService,
  ) {}

  async dashboard(tripId: string) {
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip) throw notFound('Trip')
    const [
      days,
      places,
      assignments,
      reservations,
      expenses,
      packingItems,
      todos,
      decisions,
      tasks,
      routeSegments,
      photoRefs,
    ] = await Promise.all([
      this.tripDao.listDays(tripId),
      this.planningDao.listPlaces(tripId),
      this.planningDao.listAssignments(tripId),
      this.bookingDao.listReservations(tripId),
      this.budgetService.listExpenses(tripId),
      this.packingDao.listItems(tripId),
      this.todoDao.listTodos(tripId),
      this.collaborationDao.listDecisionRefs(tripId),
      this.automationDao.listTasks(tripId),
      this.planningDao.listRouteSegments(tripId),
      this.planningDao.listTripPhotoRefs(tripId),
    ])

    const upcomingAssignments = assignments
      .filter((assignment) => assignment.status !== 'done' && assignment.status !== 'skipped')
      .sort((a, b) => compareOptionalIso(a.startAt, b.startAt) || a.sequence - b.sequence)
      .slice(0, 8)
    const upcomingReservations = reservations
      .filter((reservation) => !reservation.endAt || reservation.endAt >= nowIso())
      .slice(0, 8)
    const unpackedItems = packingItems.filter((item) => item.status === 'needed').length

    return {
      trip,
      stats: {
        dayCount: days.length,
        placeCount: places.length,
        assignmentCount: assignments.length,
        reservationCount: reservations.length,
        routeSegmentCount: routeSegments.length,
        photoRefCount: photoRefs.length,
        unpackedItems,
        openTodoCount: todos.filter((todo) => todo.status === 'open').length,
        openAutomationTasks: tasks.filter(
          (task) => task.status === 'queued' || task.status === 'running',
        ).length,
      },
      budgetTotals: this.budgetService.summarize(expenses),
      dayWeather: days.flatMap((day) =>
        day.weatherRef
          ? [
              {
                dayId: day.id,
                date: day.date,
                weather: day.weatherRef,
              },
            ]
          : [],
      ),
      upcomingAssignments,
      upcomingReservations,
      recentRouteSegments: routeSegments.slice(-8).reverse(),
      recentPhotoRefs: photoRefs.slice(-12).reverse(),
      latestDecisions: decisions.slice(0, 5),
    }
  }

  async contextPack(tripId: string) {
    const dashboard = await this.dashboard(tripId)
    const [
      days,
      places,
      reservations,
      expenses,
      packingItems,
      todos,
      settings,
      attachments,
      routeSegments,
      photoRefs,
    ] = await Promise.all([
      this.tripDao.listDays(tripId),
      this.planningDao.listPlaces(tripId),
      this.bookingDao.listReservations(tripId),
      this.budgetService.listExpenses(tripId),
      this.packingDao.listItems(tripId),
      this.todoDao.listTodos(tripId),
      this.settingsService.getTripSettings(tripId),
      this.attachmentDao.listAttachments(tripId),
      this.planningDao.listRouteSegments(tripId),
      this.planningDao.listTripPhotoRefs(tripId),
    ])

    return {
      generatedAt: nowIso(),
      trip: dashboard.trip,
      stats: dashboard.stats,
      budgetTotals: dashboard.budgetTotals,
      dayWeather: dashboard.dayWeather,
      upcomingAssignments: dashboard.upcomingAssignments,
      upcomingReservations: dashboard.upcomingReservations,
      days: days.slice(0, 120),
      places: places.slice(0, 50),
      reservations: reservations.slice(0, 50),
      expenses: expenses.slice(0, 50),
      packingItems: packingItems.slice(0, 100),
      todos: todos.slice(0, 100),
      routeSegments: routeSegments.slice(-25),
      photoRefs: photoRefs.slice(-100),
      settings,
      attachments: attachments.slice(0, 50),
    }
  }
}
