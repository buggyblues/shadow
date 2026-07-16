import type { PackingDao } from '../dao/packing.dao.js'
import { notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type {
  CategoryAssignee,
  PackingBag,
  PackingItem,
  PackingTemplate,
  Place,
  Reservation,
  Trip,
  TripDay,
} from '../types.js'
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

export interface PackingSuggestionContext {
  trip: Trip
  days: TripDay[]
  places: Place[]
  reservations: Reservation[]
  existingItems: PackingItem[]
}

export interface PackingSuggestion {
  title: string
  category: string
  quantity: number
  priority: 'essential' | 'recommended' | 'optional'
  reason: string
  source: string
}

function normalizedTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function countTripDays(trip: Trip, days: TripDay[]) {
  if (days.length > 0) return days.length
  if (!trip.startDate || !trip.endDate) return 0
  const start = Date.parse(`${trip.startDate}T00:00:00Z`)
  const end = Date.parse(`${trip.endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.floor((end - start) / 86_400_000) + 1
}

function weatherText(days: TripDay[]) {
  return days
    .map((day) => (day.weatherRef ? JSON.stringify(day.weatherRef) : ''))
    .join(' ')
    .toLowerCase()
}

export class PackingService {
  constructor(private readonly packingDao: PackingDao) {}

  listBags(tripId: string) {
    return this.packingDao.listBags(tripId)
  }

  listItems(tripId: string) {
    return this.packingDao.listItems(tripId)
  }

  async createBag(tripId: string, input: CreatePackingBagInput) {
    const timestamp = nowIso()
    const bag: PackingBag = {
      id: createId('bag'),
      tripId,
      title: input.title,
      ownerMemberId: input.ownerMemberId,
      memberIds: input.memberIds,
      color: input.color,
      capacityNote: input.capacityNote,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.packingDao.createBag(bag)
  }

  async updateBag(tripId: string, bagId: string, input: UpdatePackingBagInput) {
    const current = await this.packingDao.findBag(bagId)
    if (!current || current.tripId !== tripId) throw notFound('Packing bag')
    const updated = await this.packingDao.updateBag(bagId, (bag) => ({
      ...bag,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Packing bag')
    return updated
  }

  async deleteBag(tripId: string, bagId: string) {
    const current = await this.packingDao.findBag(bagId)
    if (!current || current.tripId !== tripId) throw notFound('Packing bag')
    const deleted = await this.packingDao.deleteBag(bagId)
    if (!deleted) throw notFound('Packing bag')
    return deleted
  }

  async createItem(tripId: string, input: CreatePackingItemInput) {
    const timestamp = nowIso()
    const item: PackingItem = {
      id: createId('pack'),
      tripId,
      title: input.title,
      category: input.category,
      assignedToMemberId: input.assignedToMemberId,
      bagId: input.bagId,
      quantity: input.quantity,
      packedByMemberIds: input.packedByMemberIds,
      contributorMemberIds: input.contributorMemberIds,
      status: input.status,
      sequence: input.sequence ?? ((await this.packingDao.listItems(tripId)).length + 1) * 100,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.packingDao.createItem(item)
  }

  async updateItem(tripId: string, itemId: string, input: UpdatePackingItemInput) {
    const current = (await this.packingDao.listItems(tripId)).find((item) => item.id === itemId)
    if (!current) throw notFound('Packing item')
    const updated = await this.packingDao.updateItem(itemId, (item) => ({
      ...item,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Packing item')
    return updated
  }

  async deleteItem(tripId: string, itemId: string) {
    const current = (await this.packingDao.listItems(tripId)).find((item) => item.id === itemId)
    if (!current) throw notFound('Packing item')
    const deleted = await this.packingDao.deleteItem(itemId)
    if (!deleted) throw notFound('Packing item')
    return deleted
  }

  async reorderItems(tripId: string, input: ReorderPackingItemsInput) {
    const reordered = await this.packingDao.reorderItems(tripId, input.orderedIds)
    if (!reordered) throw notFound('Packing item')
    return this.packingDao.listItems(tripId)
  }

  async bulkImport(tripId: string, input: BulkImportPackingInput) {
    const timestamp = nowIso()
    const existingCount = (await this.packingDao.listItems(tripId)).length
    const items = input.items.map<PackingItem>((item, index) => ({
      id: createId('pack'),
      tripId,
      title: item.title,
      category: item.category,
      assignedToMemberId: item.assignedToMemberId,
      bagId: item.bagId,
      quantity: item.quantity,
      packedByMemberIds: [],
      contributorMemberIds: [],
      status: 'needed',
      sequence: (existingCount + index + 1) * 100,
      notes: item.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    return this.packingDao.createItems(items)
  }

  suggestItems(input: PackingSuggestionsInput, context: PackingSuggestionContext) {
    const existing = new Set(context.existingItems.map((item) => normalizedTitle(item.title)))
    const suggestions = new Map<string, PackingSuggestion>()
    const push = (suggestion: PackingSuggestion) => {
      const key = normalizedTitle(suggestion.title)
      if (!input.includeExisting && existing.has(key)) return
      if (!suggestions.has(key)) suggestions.set(key, suggestion)
    }

    const destination = [
      input.destination,
      input.season,
      ...input.activities,
      ...context.trip.destinationLabels,
      ...context.places.flatMap((place) => [place.title, place.address, place.kind, ...place.tags]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const reservations = context.reservations.map((reservation) => reservation.kind)
    const dayCount = countTripDays(context.trip, context.days)
    const clothesQuantity = dayCount > 0 ? Math.min(dayCount + 1, 21) : 3
    const weather = weatherText(context.days)

    push({
      title: 'Passport or ID',
      category: 'Documents',
      quantity: 1,
      priority: 'essential',
      reason: 'Needed for transport, hotels, and identity checks.',
      source: 'baseline',
    })
    push({
      title: 'Wallet and payment cards',
      category: 'Essentials',
      quantity: 1,
      priority: 'essential',
      reason: 'Core travel payment item.',
      source: 'baseline',
    })
    push({
      title: 'Phone charger',
      category: 'Electronics',
      quantity: 1,
      priority: 'essential',
      reason: 'Needed for navigation and trip access.',
      source: 'baseline',
    })
    push({
      title: 'Medication and first aid',
      category: 'Health',
      quantity: 1,
      priority: 'recommended',
      reason: 'Helpful for common travel disruptions.',
      source: 'baseline',
    })
    push({
      title: 'Toiletries',
      category: 'Personal care',
      quantity: 1,
      priority: 'recommended',
      reason: 'Baseline overnight travel item.',
      source: 'baseline',
    })
    push({
      title: 'Underwear',
      category: 'Clothing',
      quantity: clothesQuantity,
      priority: 'recommended',
      reason:
        dayCount > 0 ? `Calculated from ${dayCount} trip days.` : 'General clothing baseline.',
      source: 'duration',
    })
    push({
      title: 'Socks',
      category: 'Clothing',
      quantity: clothesQuantity,
      priority: 'recommended',
      reason:
        dayCount > 0 ? `Calculated from ${dayCount} trip days.` : 'General clothing baseline.',
      source: 'duration',
    })

    if (reservations.includes('flight')) {
      push({
        title: 'Boarding passes',
        category: 'Documents',
        quantity: 1,
        priority: 'essential',
        reason: 'Flight reservation found in the trip.',
        source: 'reservation',
      })
      push({
        title: 'Carry-on liquids bag',
        category: 'Luggage',
        quantity: 1,
        priority: 'optional',
        reason: 'Flight reservation found in the trip.',
        source: 'reservation',
      })
    }

    if (reservations.some((kind) => ['flight', 'train', 'bus', 'ferry'].includes(kind))) {
      push({
        title: 'Travel pillow or eye mask',
        category: 'Comfort',
        quantity: 1,
        priority: 'optional',
        reason: 'Long-distance transport reservation found.',
        source: 'reservation',
      })
    }

    if (reservations.includes('accommodation')) {
      push({
        title: 'Sleepwear',
        category: 'Clothing',
        quantity: 1,
        priority: 'recommended',
        reason: 'Accommodation reservation found.',
        source: 'reservation',
      })
      push({
        title: 'Laundry bag',
        category: 'Luggage',
        quantity: 1,
        priority: 'optional',
        reason: 'Accommodation reservation found.',
        source: 'reservation',
      })
    }

    if (containsAny(destination, ['beach', 'island', 'coast', 'pool', '海滩', '海岛', '泳池'])) {
      push({
        title: 'Swimwear',
        category: 'Clothing',
        quantity: 1,
        priority: 'recommended',
        reason: 'Beach or water destination detected.',
        source: 'destination',
      })
      push({
        title: 'Sunscreen',
        category: 'Health',
        quantity: 1,
        priority: 'recommended',
        reason: 'Beach or water destination detected.',
        source: 'destination',
      })
    }

    if (containsAny(destination, ['hike', 'trail', 'mountain', 'trek', '徒步', '登山'])) {
      push({
        title: 'Comfortable walking shoes',
        category: 'Clothing',
        quantity: 1,
        priority: 'recommended',
        reason: 'Outdoor walking activity detected.',
        source: 'activity',
      })
      push({
        title: 'Reusable water bottle',
        category: 'Essentials',
        quantity: 1,
        priority: 'recommended',
        reason: 'Outdoor walking activity detected.',
        source: 'activity',
      })
    }

    if (containsAny(destination, ['business', 'conference', 'meeting', '商务', '会议'])) {
      push({
        title: 'Business outfit',
        category: 'Clothing',
        quantity: 1,
        priority: 'recommended',
        reason: 'Business travel context detected.',
        source: 'profile',
      })
      push({
        title: 'Laptop charger',
        category: 'Electronics',
        quantity: 1,
        priority: 'recommended',
        reason: 'Business travel context detected.',
        source: 'profile',
      })
    }

    if (input.travelerProfile === 'family') {
      push({
        title: 'Snacks',
        category: 'Food',
        quantity: 1,
        priority: 'optional',
        reason: 'Family traveler profile selected.',
        source: 'profile',
      })
    }

    if (containsAny(weather, ['rain', 'shower', 'storm', 'precip', '雨'])) {
      push({
        title: 'Umbrella or rain jacket',
        category: 'Weather',
        quantity: 1,
        priority: 'recommended',
        reason: 'Rainy weather is referenced on trip days.',
        source: 'weather',
      })
    }

    if (containsAny(weather, ['snow', 'freezing', 'cold', '雪', '冷'])) {
      push({
        title: 'Warm layers',
        category: 'Clothing',
        quantity: 1,
        priority: 'recommended',
        reason: 'Cold weather is referenced on trip days.',
        source: 'weather',
      })
    }

    return {
      generatedAt: nowIso(),
      destination: input.destination ?? (context.trip.destinationLabels.join(', ') || undefined),
      dayCount,
      existingFiltered: !input.includeExisting,
      suggestions: [...suggestions.values()].slice(0, input.limit),
    }
  }

  listCategoryAssignees(tripId: string) {
    return this.packingDao.listCategoryAssignees(tripId, 'packing')
  }

  setCategoryAssignees(tripId: string, input: SetCategoryAssigneesInput) {
    const assignee: CategoryAssignee = {
      id: createId('catassignee'),
      tripId,
      domain: 'packing',
      category: input.category,
      memberIds: input.memberIds,
      updatedAt: nowIso(),
    }
    return this.packingDao.setCategoryAssignees(assignee)
  }

  listTemplates(serverId: string, ownerUserId?: string) {
    return this.packingDao.listTemplates(serverId, ownerUserId)
  }

  createTemplate(
    serverId: string,
    ownerUserId: string | undefined,
    input: CreatePackingTemplateInput,
  ) {
    const timestamp = nowIso()
    const template: PackingTemplate = {
      id: createId('packtpl'),
      serverId,
      ownerUserId,
      title: input.title,
      description: input.description,
      destinationTags: input.destinationTags,
      season: input.season,
      visibility: input.visibility,
      items: input.items,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.packingDao.createTemplate(template)
  }

  async saveTemplateFromTrip(
    serverId: string,
    ownerUserId: string | undefined,
    tripId: string,
    input: SavePackingTemplateInput,
  ) {
    const timestamp = nowIso()
    const items = (await this.packingDao.listItems(tripId))
      .filter((item) => !input.category || item.category === input.category)
      .map((item) => ({
        title: item.title,
        category: item.category,
        quantity: item.quantity,
        notes: item.notes,
      }))
    const template: PackingTemplate = {
      id: createId('packtpl'),
      serverId,
      ownerUserId,
      sourceTripId: tripId,
      title: input.title,
      description: input.description,
      destinationTags: input.destinationTags,
      season: input.season,
      visibility: input.visibility,
      items,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.packingDao.createTemplate(template)
  }

  async applyTemplate(tripId: string, templateId: string, input: ApplyPackingTemplateInput) {
    const template = await this.packingDao.findTemplate(templateId)
    if (!template) throw notFound('Packing template')
    const timestamp = nowIso()
    const existingCount = (await this.packingDao.listItems(tripId)).length
    const sourceItems = template.items.filter(
      (item) => !input.category || item.category === input.category,
    )
    const items = sourceItems.map<PackingItem>((item, index) => ({
      id: createId('pack'),
      tripId,
      title: item.title,
      category: item.category,
      assignedToMemberId: input.assignedToMemberId,
      bagId: input.bagId,
      quantity: item.quantity,
      packedByMemberIds: [],
      contributorMemberIds: [],
      status: 'needed',
      sequence: (existingCount + index + 1) * 100,
      notes: item.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    if (items.length === 0) return []
    return this.packingDao.createItems(items)
  }

  async deleteTemplate(templateId: string) {
    const deleted = await this.packingDao.deleteTemplate(templateId)
    if (!deleted) throw notFound('Packing template')
    return deleted
  }
}
