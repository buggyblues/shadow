import type { BookingDao } from '../dao/booking.dao.js'
import type { PlanningDao } from '../dao/planning.dao.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { PackingService } from '../services/packing.service.js'
import type { RequestContext } from '../types.js'
import type {
  ApplyPackingTemplateInput,
  BulkImportPackingInput,
  CreatePackingBagInput,
  CreatePackingItemInput,
  CreatePackingTemplateInput,
  PackingSuggestionsInput,
  ReorderPackingItemsInput,
  SavePackingTemplateInput,
  SetCategoryAssigneesInput,
  UpdatePackingBagInput,
  UpdatePackingItemInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class PackingUseCase {
  constructor(
    private readonly packingService: PackingService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly planningDao: PlanningDao,
    private readonly bookingDao: BookingDao,
  ) {}

  async listBags(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.packingService.listBags(tripId)
  }

  async createBag(ctx: RequestContext, tripId: string, input: CreatePackingBagInput) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const bag = await this.packingService.createBag(tripId, input)
    this.eventBus.emit({ type: 'packing.bag.created', tripId, payload: { bag } })
    return bag
  }

  async updateBag(
    ctx: RequestContext,
    tripId: string,
    bagId: string,
    input: UpdatePackingBagInput,
  ) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const bag = await this.packingService.updateBag(tripId, bagId, input)
    this.eventBus.emit({ type: 'packing.bag.updated', tripId, payload: { bag } })
    return bag
  }

  async deleteBag(ctx: RequestContext, tripId: string, bagId: string) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const bag = await this.packingService.deleteBag(tripId, bagId)
    this.eventBus.emit({ type: 'packing.bag.deleted', tripId, payload: { bag } })
    return bag
  }

  async listItems(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.packingService.listItems(tripId)
  }

  async createItem(ctx: RequestContext, tripId: string, input: CreatePackingItemInput) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const item = await this.packingService.createItem(tripId, input)
    this.eventBus.emit({ type: 'packing.item.created', tripId, payload: { item } })
    return item
  }

  async updateItem(
    ctx: RequestContext,
    tripId: string,
    itemId: string,
    input: UpdatePackingItemInput,
  ) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const item = await this.packingService.updateItem(tripId, itemId, input)
    this.eventBus.emit({ type: 'packing.item.updated', tripId, payload: { item } })
    return item
  }

  async deleteItem(ctx: RequestContext, tripId: string, itemId: string) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const item = await this.packingService.deleteItem(tripId, itemId)
    this.eventBus.emit({ type: 'packing.item.deleted', tripId, payload: { item } })
    return item
  }

  async reorderItems(ctx: RequestContext, tripId: string, input: ReorderPackingItemsInput) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const items = await this.packingService.reorderItems(tripId, input)
    this.eventBus.emit({ type: 'packing.item.reordered', tripId, payload: { items } })
    return items
  }

  async bulkImport(ctx: RequestContext, tripId: string, input: BulkImportPackingInput) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const items = await this.packingService.bulkImport(tripId, input)
    this.eventBus.emit({ type: 'packing.item.bulk_imported', tripId, payload: { items } })
    return items
  }

  async suggestItems(ctx: RequestContext, tripId: string, input: PackingSuggestionsInput) {
    const access = await this.accessPolicy.requireTripRead(ctx, tripId)
    const [days, places, reservations, existingItems] = await Promise.all([
      this.planningDao.listDays(tripId),
      this.planningDao.listPlaces(tripId),
      this.bookingDao.listReservations(tripId),
      this.packingService.listItems(tripId),
    ])
    return this.packingService.suggestItems(input, {
      trip: access.trip,
      days,
      places,
      reservations,
      existingItems,
    })
  }

  async listCategoryAssignees(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.packingService.listCategoryAssignees(tripId)
  }

  async setCategoryAssignees(
    ctx: RequestContext,
    tripId: string,
    input: SetCategoryAssigneesInput,
  ) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const assignee = await this.packingService.setCategoryAssignees(tripId, input)
    this.eventBus.emit({
      type: 'packing.category_assignees.updated',
      tripId,
      payload: { assignee },
    })
    return assignee
  }

  listTemplates(ctx: RequestContext) {
    return this.packingService.listTemplates(
      ctx.serverId,
      ctx.actor.userId ?? ctx.actor.ownerId ?? undefined,
    )
  }

  async createTemplate(ctx: RequestContext, input: CreatePackingTemplateInput) {
    const template = await this.packingService.createTemplate(
      ctx.serverId,
      ctx.actor.userId ?? ctx.actor.ownerId ?? undefined,
      input,
    )
    this.eventBus.emit({ type: 'packing.template.created', payload: { template } })
    return template
  }

  async saveTemplateFromTrip(ctx: RequestContext, tripId: string, input: SavePackingTemplateInput) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    const template = await this.packingService.saveTemplateFromTrip(
      ctx.serverId,
      ctx.actor.userId ?? ctx.actor.ownerId ?? undefined,
      tripId,
      input,
    )
    this.eventBus.emit({ type: 'packing.template.saved', tripId, payload: { template } })
    return template
  }

  async applyTemplate(
    ctx: RequestContext,
    tripId: string,
    templateId: string,
    input: ApplyPackingTemplateInput,
  ) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'packing.write')
    const items = await this.packingService.applyTemplate(tripId, templateId, input)
    this.eventBus.emit({ type: 'packing.template.applied', tripId, payload: { items } })
    return items
  }

  async deleteTemplate(ctx: RequestContext, templateId: string) {
    const template = await this.packingService.deleteTemplate(templateId)
    this.eventBus.emit({ type: 'packing.template.deleted', payload: { template } })
    return template
  }
}
