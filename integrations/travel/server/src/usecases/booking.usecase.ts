import type { AccessPolicy } from '../security/access-policy.js'
import type { BookingService } from '../services/booking.service.js'
import type { PlanningService } from '../services/planning.service.js'
import type { SettingsService } from '../services/settings.service.js'
import type { RequestContext } from '../types.js'
import type {
  ConfirmImportJobBatchInput,
  ConfirmImportJobInput,
  CreateReservationInput,
  ImportBookingInput,
  SaveTransitPlanInput,
  UpdateReservationInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class BookingUseCase {
  constructor(
    private readonly bookingService: BookingService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly settingsService: SettingsService,
    private readonly planningService: PlanningService,
  ) {}

  async listReservations(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.bookingService.listReservations(tripId)
  }

  async createReservation(ctx: RequestContext, tripId: string, input: CreateReservationInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const reservation = await this.bookingService.createReservation(tripId, input)
    this.eventBus.emit({ type: 'reservation.created', tripId, payload: { reservation } })
    return reservation
  }

  async updateReservation(
    ctx: RequestContext,
    tripId: string,
    reservationId: string,
    input: UpdateReservationInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const reservation = await this.bookingService.updateReservation(tripId, reservationId, input)
    this.eventBus.emit({ type: 'reservation.updated', tripId, payload: { reservation } })
    return reservation
  }

  async deleteReservation(ctx: RequestContext, tripId: string, reservationId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const reservation = await this.bookingService.deleteReservation(tripId, reservationId)
    this.eventBus.emit({ type: 'reservation.deleted', tripId, payload: { reservation } })
    return reservation
  }

  async setReservationStatus(
    ctx: RequestContext,
    tripId: string,
    reservationId: string,
    status: 'pending' | 'confirmed' | 'cancelled',
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const reservation = await this.bookingService.setReservationStatus(
      tripId,
      reservationId,
      status,
    )
    this.eventBus.emit({ type: 'reservation.status_updated', tripId, payload: { reservation } })
    return reservation
  }

  async reorderReservations(ctx: RequestContext, tripId: string, orderedIds: string[]) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const reservations = await this.bookingService.reorderReservations(tripId, orderedIds)
    this.eventBus.emit({ type: 'reservation.reordered', tripId, payload: { reservations } })
    return reservations
  }

  async listImportJobs(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.bookingService.listImportJobs(tripId)
  }

  async importBooking(ctx: RequestContext, tripId: string, input: ImportBookingInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const job = await this.bookingService.importBooking(tripId, input, {
      llmProvider: await this.settingsService.getProviderValue(ctx, 'llm.provider'),
      llmBaseUrl: await this.settingsService.getProviderValue(ctx, 'llm.base_url'),
      llmModel: await this.settingsService.getProviderValue(ctx, 'llm.model'),
      llmApiKey: await this.settingsService.getProviderValue(ctx, 'llm.api_key'),
    })
    this.eventBus.emit({ type: 'booking.imported', tripId, payload: { job } })
    return job
  }

  async confirmImportJob(
    ctx: RequestContext,
    tripId: string,
    jobId: string,
    input: ConfirmImportJobInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const result = await this.bookingService.confirmImportJob(tripId, jobId, input)
    this.eventBus.emit({ type: 'booking.import_confirmed', tripId, payload: result })
    return result
  }

  async confirmImportJobBatch(
    ctx: RequestContext,
    tripId: string,
    jobId: string,
    input: ConfirmImportJobBatchInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const result = await this.bookingService.confirmImportJobBatch(tripId, jobId, input)
    this.eventBus.emit({ type: 'booking.import_batch_confirmed', tripId, payload: result })
    return result
  }

  async saveTransitPlan(ctx: RequestContext, tripId: string, input: SaveTransitPlanInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const itinerary = input.itinerary as {
      startTime?: string
      endTime?: string
      duration?: number
      legs?: Array<{
        mode?: string
        line?: string | null
        from?: { name?: string; time?: string | null }
        to?: { name?: string; time?: string | null }
      }>
    }
    const transitLegs = (itinerary.legs ?? []).filter((leg) => leg.mode !== 'WALK')
    const firstLeg = itinerary.legs?.[0]
    const lastLeg = itinerary.legs?.[itinerary.legs.length - 1]
    const reservationInput: CreateReservationInput = {
      kind: transitLegs.some((leg) => leg.mode === 'RAIL') ? 'train' : 'bus',
      title: input.title,
      status: 'confirmed',
      provider: 'Transitous',
      startAt: itinerary.startTime ?? firstLeg?.from?.time ?? undefined,
      endAt: itinerary.endTime ?? lastLeg?.to?.time ?? undefined,
      participantMemberIds: input.participantMemberIds,
      passengerNames: [],
      guestIds: [],
      attachmentIds: [],
      createExpense: false,
      transportDetails: {
        carrier: transitLegs[0]?.line ?? transitLegs[0]?.mode ?? undefined,
        serviceNumber:
          transitLegs
            .map((leg) => leg.line)
            .filter(Boolean)
            .join(' / ') || undefined,
        departurePlace: firstLeg?.from?.name,
        arrivalPlace: lastLeg?.to?.name,
      },
      rawImport: { provider: 'transitous', itinerary },
    }
    const reservation =
      input.saveAs === 'reservation' || input.saveAs === 'both'
        ? await this.bookingService.createReservation(tripId, reservationInput)
        : null
    const assignment =
      input.dayId && (input.saveAs === 'assignment' || input.saveAs === 'both')
        ? await this.planningService.createAssignment(tripId, {
            dayId: input.dayId,
            reservationId: reservation?.id,
            title: input.title,
            kind: 'transport',
            startAt: reservationInput.startAt,
            endAt: reservationInput.endAt,
            status: 'scheduled',
            participantMemberIds: input.participantMemberIds,
            notes: JSON.stringify({ provider: 'transitous', itinerary }),
          })
        : null
    this.eventBus.emit({
      type: 'transit.saved',
      tripId,
      payload: { reservation, assignment },
    })
    return { reservation, assignment }
  }

  async syncAirtrailFlights(
    ctx: RequestContext,
    tripId: string,
    flights: Array<Record<string, unknown>>,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const result = await this.bookingService.syncAirtrailFlights(
      tripId,
      flights,
      ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.id ?? undefined,
    )
    this.eventBus.emit({ type: 'airtrail.synced', tripId, payload: result })
    return result
  }
}
