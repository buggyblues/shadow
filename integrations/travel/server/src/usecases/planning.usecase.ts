import type { TravelProviderGateway } from '../gateways/travel-provider.gateway.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { PlanningService } from '../services/planning.service.js'
import type { RequestContext } from '../types.js'
import type {
  BulkCreatePlacesInput,
  CreateAssignmentInput,
  CreateDayInput,
  CreatePlaceInput,
  ExportRouteInput,
  ImportPlacesInput,
  LinkTripPhotoInput,
  OptimizeRouteInput,
  ReorderAssignmentsInput,
  SaveProviderPlaceInput,
  UpdateAssignmentInput,
  UpdateDayInput,
  UpdatePlaceInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class PlanningUseCase {
  constructor(
    private readonly planningService: PlanningService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly providerGateway: TravelProviderGateway,
  ) {}

  async listDays(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.planningService.listDays(tripId)
  }

  async createDay(ctx: RequestContext, tripId: string, input: CreateDayInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const day = await this.planningService.createDay(tripId, input, access.trip.timezone)
    this.eventBus.emit({ type: 'day.created', tripId, payload: { day } })
    return day
  }

  async updateDay(ctx: RequestContext, tripId: string, dayId: string, input: UpdateDayInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const day = await this.planningService.updateDay(tripId, dayId, input)
    this.eventBus.emit({ type: 'day.updated', tripId, payload: { day } })
    return day
  }

  async deleteDay(ctx: RequestContext, tripId: string, dayId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const day = await this.planningService.deleteDay(tripId, dayId)
    this.eventBus.emit({ type: 'day.deleted', tripId, payload: { day } })
    return day
  }

  async listPlaces(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.planningService.listPlaces(tripId)
  }

  async createPlace(ctx: RequestContext, tripId: string, input: CreatePlaceInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const place = await this.planningService.createPlace(tripId, input, access.member?.id)
    this.eventBus.emit({ type: 'place.created', tripId, payload: { place } })
    return place
  }

  async bulkCreatePlaces(ctx: RequestContext, tripId: string, input: BulkCreatePlacesInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const places = await this.planningService.bulkCreatePlaces(tripId, input, access.member?.id)
    this.eventBus.emit({ type: 'place.bulk_created', tripId, payload: { places } })
    return places
  }

  async importPlaces(ctx: RequestContext, tripId: string, input: ImportPlacesInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const places = await this.planningService.importPlaces(tripId, input, access.member?.id)
    this.eventBus.emit({ type: 'place.imported', tripId, payload: { places } })
    return places
  }

  async saveProviderPlace(ctx: RequestContext, tripId: string, input: SaveProviderPlaceInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const place = await this.planningService.saveProviderPlace(tripId, input, access.member?.id)
    this.eventBus.emit({ type: 'place.saved_from_provider', tripId, payload: { place } })
    return place
  }

  async updatePlace(ctx: RequestContext, tripId: string, placeId: string, input: UpdatePlaceInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const place = await this.planningService.updatePlace(tripId, placeId, input)
    this.eventBus.emit({ type: 'place.updated', tripId, payload: { place } })
    return place
  }

  async deletePlace(ctx: RequestContext, tripId: string, placeId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const place = await this.planningService.deletePlace(tripId, placeId)
    this.eventBus.emit({ type: 'place.deleted', tripId, payload: { place } })
    return place
  }

  async listAssignments(ctx: RequestContext, tripId: string, dayId?: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.planningService.listAssignments(tripId, dayId)
  }

  async createAssignment(ctx: RequestContext, tripId: string, input: CreateAssignmentInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const assignment = await this.planningService.createAssignment(tripId, input)
    this.eventBus.emit({ type: 'assignment.created', tripId, payload: { assignment } })
    return assignment
  }

  async updateAssignment(
    ctx: RequestContext,
    tripId: string,
    assignmentId: string,
    input: UpdateAssignmentInput,
  ) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const assignment = await this.planningService.updateAssignment(tripId, assignmentId, input)
    this.eventBus.emit({ type: 'assignment.updated', tripId, payload: { assignment } })
    return assignment
  }

  async deleteAssignment(ctx: RequestContext, tripId: string, assignmentId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const assignment = await this.planningService.deleteAssignment(tripId, assignmentId)
    this.eventBus.emit({ type: 'assignment.deleted', tripId, payload: { assignment } })
    return assignment
  }

  async reorderAssignments(ctx: RequestContext, tripId: string, input: ReorderAssignmentsInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const assignments = await this.planningService.reorderAssignments(tripId, input)
    this.eventBus.emit({ type: 'assignment.reordered', tripId, payload: { assignments } })
    return assignments
  }

  async refreshTripWeather(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const days = await this.planningService.refreshTripWeather(tripId, this.providerGateway)
    this.eventBus.emit({ type: 'weather.refreshed', tripId, payload: { days } })
    return { days }
  }

  async optimizeRoute(ctx: RequestContext, tripId: string, input: OptimizeRouteInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const result = await this.planningService.optimizeRoute(tripId, input, this.providerGateway)
    this.eventBus.emit({ type: 'route.optimized', tripId, payload: result })
    return result
  }

  async listRouteSegments(ctx: RequestContext, tripId: string, dayId?: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.planningService.listRouteSegments(tripId, dayId)
  }

  async exportRoute(ctx: RequestContext, tripId: string, input: ExportRouteInput) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.planningService.exportRoute(tripId, input)
  }

  async linkTripPhoto(ctx: RequestContext, tripId: string, input: LinkTripPhotoInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const ref = await this.planningService.linkTripPhoto(tripId, input, access.member?.id)
    this.eventBus.emit({ type: 'photo.linked', tripId, payload: { ref } })
    return ref
  }

  async listTripPhotoRefs(
    ctx: RequestContext,
    tripId: string,
    subjectType?: string,
    subjectId?: string,
  ) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.planningService.listTripPhotoRefs(tripId, subjectType, subjectId)
  }

  async deleteTripPhotoRef(ctx: RequestContext, tripId: string, refId: string) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const ref = await this.planningService.deleteTripPhotoRef(tripId, refId)
    this.eventBus.emit({ type: 'photo.unlinked', tripId, payload: { ref } })
    return ref
  }
}
