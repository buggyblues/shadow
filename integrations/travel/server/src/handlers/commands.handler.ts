import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container.js'
import { badRequest } from '../lib/errors.js'
import { ok } from '../lib/json.js'
import { auditMiddleware } from '../middleware/audit.middleware.js'
import type { TravelContext, TravelHonoEnv } from '../types.js'
import {
  confirmImportJobBatchSchema,
  confirmImportJobSchema,
  createAssignmentSchema,
  createExpenseSchema,
  createPackingItemSchema,
  createPlaceSchema,
  createReservationSchema,
  createShareLinkSchema,
  createTodoSchema,
  createTripSchema,
  importBookingSchema,
  linkTripPhotoSchema,
  optimizeRouteSchema,
  proposeBuddyPlanSchema,
  reviewTripApplicationSchema,
  saveProviderPlaceSchema,
  saveTransitPlanSchema,
  syncMutationsSchema,
  upsertTripRecruitmentSchema,
} from '../validators/travel.schema.js'
import { executeTripAction, tripActionCommandSchema } from './trip-actions.js'

const tripCommandSchema = z.object({ tripId: z.string().trim().min(1).max(120) })
const importJobCommandSchema = tripCommandSchema.extend({
  jobId: z.string().trim().min(1).max(120),
})
const searchPlacesCommandSchema = z.object({ query: z.string().trim().min(1).max(240) })
const listTripsCommandSchema = z.object({ includeArchived: z.boolean().optional() })
const currencyWidgetCommandSchema = z.object({
  base: z.string().regex(/^[A-Z]{3}$/),
  quote: z.string().regex(/^[A-Z]{3}$/),
})

async function commandPayload(c: TravelContext) {
  const body = await c.req.json().catch(() => ({}))
  if (body && typeof body === 'object' && !Array.isArray(body) && 'input' in body) {
    return (body as { input?: unknown }).input ?? {}
  }
  return body
}

function parseCommand<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.output<T> {
  const result = schema.safeParse(payload)
  if (!result.success) throw badRequest('Command input validation failed', result.error.flatten())
  return result.data
}

export function createCommandsHandler(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()
  app.use('*', auditMiddleware(container, 'command.write'))

  app.post('/.shadow/commands/:commandName', async (c) => {
    const commandName = c.req.param('commandName')
    const ctx = await container.commandSecurity.requestContextForCommand(c, commandName)
    const payload = await commandPayload(c)

    if (commandName === 'travel.currencyWidget') {
      const input = parseCommand(currencyWidgetCommandSchema, payload)
      const exchange = await container.providerUseCase.exchangeRate(ctx, {
        from: input.base,
        to: input.quote,
      })
      if (!exchange) throw badRequest('Exchange rate is currently unavailable')
      const rateText = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(exchange.rate)
      return c.json(
        ok({
          pair: `${exchange.from} / ${exchange.to}`,
          rate: exchange.rate,
          rateText,
          summary: `1 ${exchange.from} = ${rateText} ${exchange.to}`,
          provider: exchange.provider === 'identity' ? 'Direct' : 'Frankfurter',
        }),
      )
    }

    if (commandName === 'travel.listTrips') {
      const input = parseCommand(listTripsCommandSchema, payload)
      return c.json(
        ok(
          await container.tripUseCase.listTrips(ctx, {
            includeArchived: input.includeArchived,
          }),
        ),
      )
    }

    if (commandName === 'travel.createTrip') {
      const input = parseCommand(createTripSchema, payload)
      return c.json(ok(await container.tripUseCase.createTrip(ctx, input)))
    }

    if (commandName === 'travel.listTripMembers') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.tripUseCase.listMembers(ctx, input.tripId)))
    }

    if (commandName === 'travel.listRecruitments') {
      return c.json(ok(await container.recruitmentUseCase.listOpen(ctx)))
    }

    if (commandName === 'travel.listTravelIntents') {
      return c.json(ok(await container.recruitmentUseCase.listTravelIntents(ctx)))
    }

    if (commandName === 'travel.manageRecruitment') {
      const input = parseCommand(tripCommandSchema.merge(upsertTripRecruitmentSchema), payload)
      const { tripId, ...recruitmentInput } = input
      return c.json(ok(await container.recruitmentUseCase.upsert(ctx, tripId, recruitmentInput)))
    }

    if (commandName === 'travel.reviewJoinApplication') {
      const input = parseCommand(
        tripCommandSchema
          .extend({ applicationId: z.string().trim().min(1).max(120) })
          .merge(reviewTripApplicationSchema),
        payload,
      )
      const { tripId, applicationId, ...reviewInput } = input
      return c.json(
        ok(await container.recruitmentUseCase.review(ctx, tripId, applicationId, reviewInput)),
      )
    }

    if (commandName === 'travel.deleteTrip') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.tripUseCase.deleteTrip(ctx, input.tripId)))
    }

    if (commandName === 'travel.exportIcs') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(
        ok({
          contentType: 'text/calendar; charset=utf-8',
          text: await container.tripUseCase.exportIcs(ctx, input.tripId),
        }),
      )
    }

    if (commandName === 'travel.addPlace') {
      const input = parseCommand(tripCommandSchema.merge(createPlaceSchema), payload)
      const { tripId, ...placeInput } = input
      return c.json(ok(await container.planningUseCase.createPlace(ctx, tripId, placeInput)))
    }

    if (commandName === 'travel.searchPlaces') {
      const input = parseCommand(searchPlacesCommandSchema, payload)
      return c.json(ok(await container.providerUseCase.searchPlaces(ctx, { query: input.query })))
    }

    if (commandName === 'travel.saveProviderPlace') {
      const input = parseCommand(tripCommandSchema.merge(saveProviderPlaceSchema), payload)
      const { tripId, ...placeInput } = input
      return c.json(ok(await container.planningUseCase.saveProviderPlace(ctx, tripId, placeInput)))
    }

    if (commandName === 'travel.providerHealth') {
      return c.json(ok(await container.providerUseCase.providerHealth(ctx)))
    }

    if (commandName === 'travel.schedulePlace') {
      const input = parseCommand(tripCommandSchema.merge(createAssignmentSchema), payload)
      const { tripId, ...assignmentInput } = input
      return c.json(
        ok(await container.planningUseCase.createAssignment(ctx, tripId, assignmentInput)),
      )
    }

    if (commandName === 'travel.refreshWeather') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.planningUseCase.refreshTripWeather(ctx, input.tripId)))
    }

    if (commandName === 'travel.optimizeRoute') {
      const input = parseCommand(tripCommandSchema.merge(optimizeRouteSchema), payload)
      const { tripId, ...routeInput } = input
      return c.json(ok(await container.planningUseCase.optimizeRoute(ctx, tripId, routeInput)))
    }

    if (commandName === 'travel.listRouteSegments') {
      const input = parseCommand(
        tripCommandSchema.extend({ dayId: z.string().optional() }),
        payload,
      )
      return c.json(
        ok(await container.planningUseCase.listRouteSegments(ctx, input.tripId, input.dayId)),
      )
    }

    if (commandName === 'travel.importBooking') {
      const input = parseCommand(tripCommandSchema.merge(importBookingSchema), payload)
      const { tripId, ...bookingInput } = input
      return c.json(ok(await container.bookingUseCase.importBooking(ctx, tripId, bookingInput)))
    }

    if (commandName === 'travel.confirmImportJob') {
      const input = parseCommand(importJobCommandSchema.merge(confirmImportJobSchema), payload)
      const { tripId, jobId, ...confirmInput } = input
      return c.json(
        ok(await container.bookingUseCase.confirmImportJob(ctx, tripId, jobId, confirmInput)),
      )
    }

    if (commandName === 'travel.confirmImportJobBatch') {
      const input = parseCommand(importJobCommandSchema.merge(confirmImportJobBatchSchema), payload)
      const { tripId, jobId, ...confirmInput } = input
      return c.json(
        ok(await container.bookingUseCase.confirmImportJobBatch(ctx, tripId, jobId, confirmInput)),
      )
    }

    if (commandName === 'travel.saveTransitPlan') {
      const input = parseCommand(tripCommandSchema.merge(saveTransitPlanSchema), payload)
      const { tripId, ...transitInput } = input
      return c.json(ok(await container.bookingUseCase.saveTransitPlan(ctx, tripId, transitInput)))
    }

    if (commandName === 'travel.airtrailSync') {
      const input = parseCommand(tripCommandSchema, payload)
      const flights = (await container.providerUseCase.airtrailFlights(ctx)).flights
      return c.json(
        ok(await container.bookingUseCase.syncAirtrailFlights(ctx, input.tripId, flights)),
      )
    }

    if (commandName === 'travel.listReservations') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.bookingUseCase.listReservations(ctx, input.tripId)))
    }

    if (commandName === 'travel.addReservation') {
      const input = parseCommand(tripCommandSchema.merge(createReservationSchema), payload)
      const { tripId, ...reservationInput } = input
      return c.json(
        ok(await container.bookingUseCase.createReservation(ctx, tripId, reservationInput)),
      )
    }

    if (commandName === 'travel.addPackingItem') {
      const input = parseCommand(tripCommandSchema.merge(createPackingItemSchema), payload)
      const { tripId, ...packingInput } = input
      return c.json(ok(await container.packingUseCase.createItem(ctx, tripId, packingInput)))
    }

    if (commandName === 'travel.listPackingItems') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.packingUseCase.listItems(ctx, input.tripId)))
    }

    if (commandName === 'travel.addTodo') {
      const input = parseCommand(tripCommandSchema.merge(createTodoSchema), payload)
      const { tripId, ...todoInput } = input
      return c.json(ok(await container.todoUseCase.createTodo(ctx, tripId, todoInput)))
    }

    if (commandName === 'travel.listTodos') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.todoUseCase.listTodos(ctx, input.tripId)))
    }

    if (commandName === 'travel.addExpense') {
      const input = parseCommand(tripCommandSchema.merge(createExpenseSchema), payload)
      const { tripId, ...expenseInput } = input
      return c.json(ok(await container.budgetUseCase.createExpense(ctx, tripId, expenseInput)))
    }

    if (commandName === 'travel.exportBudgetCsv') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(
        ok({
          contentType: 'text/csv; charset=utf-8',
          text: await container.budgetUseCase.exportCsv(ctx, input.tripId),
        }),
      )
    }

    if (commandName === 'travel.createReminders') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.reminderUseCase.createTripReminders(ctx, input.tripId)))
    }

    if (commandName === 'travel.budgetSettlement') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.budgetUseCase.settlement(ctx, input.tripId)))
    }

    if (commandName === 'travel.createShareLink') {
      const input = parseCommand(tripCommandSchema.merge(createShareLinkSchema), payload)
      const { tripId, ...shareInput } = input
      return c.json(
        ok(await container.collaborationUseCase.createShareLink(ctx, tripId, shareInput)),
      )
    }

    if (commandName === 'travel.linkPhoto') {
      const input = parseCommand(tripCommandSchema.merge(linkTripPhotoSchema), payload)
      const { tripId, ...photoInput } = input
      return c.json(ok(await container.planningUseCase.linkTripPhoto(ctx, tripId, photoInput)))
    }

    if (commandName === 'travel.listPhotos') {
      const input = parseCommand(
        tripCommandSchema.extend({
          subjectType: z.string().optional(),
          subjectId: z.string().optional(),
        }),
        payload,
      )
      return c.json(
        ok(
          await container.planningUseCase.listTripPhotoRefs(
            ctx,
            input.tripId,
            input.subjectType,
            input.subjectId,
          ),
        ),
      )
    }

    if (commandName === 'travel.syncManifest') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.syncUseCase.manifest(ctx, input.tripId)))
    }

    if (commandName === 'travel.applySyncMutations') {
      const input = parseCommand(tripCommandSchema.merge(syncMutationsSchema), payload)
      const { tripId, ...syncInput } = input
      return c.json(ok(await container.syncUseCase.applyMutations(ctx, tripId, syncInput)))
    }

    if (commandName === 'travel.performTripAction') {
      const input = parseCommand(tripActionCommandSchema, payload)
      return c.json(ok(await executeTripAction(container, ctx, input)))
    }

    if (commandName === 'travel.contextPack') {
      const input = parseCommand(tripCommandSchema, payload)
      return c.json(ok(await container.communityUseCase.contextPack(ctx, input.tripId)))
    }

    if (commandName === 'travel.proposePlan') {
      const input = parseCommand(tripCommandSchema.merge(proposeBuddyPlanSchema), payload)
      const { tripId, ...planInput } = input
      return c.json(ok(await container.communityUseCase.proposePlan(ctx, tripId, planInput)))
    }

    throw badRequest(`Unknown command: ${commandName}`)
  })

  return app
}
