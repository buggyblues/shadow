import type { TravelDataStore } from '../db/database.js'
import type { CategoryAssignee, PackingBag, PackingItem, PackingTemplate } from '../types.js'

export class PackingDao {
  constructor(private readonly db: TravelDataStore) {}

  listBags(tripId: string) {
    return this.db.read((state) =>
      state.packingBags
        .filter((bag) => bag.tripId === tripId)
        .sort((a, b) => a.title.localeCompare(b.title)),
    )
  }

  createBag(bag: PackingBag) {
    return this.db.write((state) => {
      state.packingBags.push(bag)
      return bag
    })
  }

  findBag(bagId: string) {
    return this.db.read((state) => state.packingBags.find((bag) => bag.id === bagId) ?? null)
  }

  updateBag(bagId: string, updater: (bag: PackingBag) => PackingBag) {
    return this.db.write((state) => {
      const index = state.packingBags.findIndex((bag) => bag.id === bagId)
      if (index < 0) return null
      const current = state.packingBags[index]
      if (!current) return null
      const next = updater(current)
      state.packingBags[index] = next
      return next
    })
  }

  deleteBag(bagId: string) {
    return this.db.write((state) => {
      const bag = state.packingBags.find((item) => item.id === bagId) ?? null
      state.packingBags = state.packingBags.filter((item) => item.id !== bagId)
      for (const item of state.packingItems) {
        if (item.bagId === bagId) item.bagId = undefined
      }
      return bag
    })
  }

  listItems(tripId: string) {
    return this.db.read((state) =>
      state.packingItems
        .filter((item) => item.tripId === tripId)
        .sort((a, b) => a.status.localeCompare(b.status) || a.title.localeCompare(b.title)),
    )
  }

  createItem(item: PackingItem) {
    return this.db.write((state) => {
      state.packingItems.push(item)
      return item
    })
  }

  createItems(items: PackingItem[]) {
    return this.db.write((state) => {
      state.packingItems.push(...items)
      return items
    })
  }

  updateItem(itemId: string, updater: (item: PackingItem) => PackingItem) {
    return this.db.write((state) => {
      const index = state.packingItems.findIndex((item) => item.id === itemId)
      if (index < 0) return null
      const current = state.packingItems[index]
      if (!current) return null
      const next = updater(current)
      state.packingItems[index] = next
      return next
    })
  }

  deleteItem(itemId: string) {
    return this.db.write((state) => {
      const item = state.packingItems.find((candidate) => candidate.id === itemId) ?? null
      state.packingItems = state.packingItems.filter((candidate) => candidate.id !== itemId)
      return item
    })
  }

  reorderItems(tripId: string, orderedIds: string[]) {
    return this.db.write((state) => {
      const idSet = new Set(orderedIds)
      const existing = state.packingItems.filter(
        (item) => item.tripId === tripId && idSet.has(item.id),
      )
      if (existing.length !== orderedIds.length) return null
      const byId = new Map(existing.map((item) => [item.id, item]))
      for (const [index, itemId] of orderedIds.entries()) {
        const item = byId.get(itemId)
        if (!item) return null
        item.sequence = (index + 1) * 100
        item.updatedAt = new Date().toISOString()
      }
      return existing
    })
  }

  listCategoryAssignees(tripId: string, domain: CategoryAssignee['domain']) {
    return this.db.read((state) =>
      state.categoryAssignees
        .filter((item) => item.tripId === tripId && item.domain === domain)
        .sort((a, b) => a.category.localeCompare(b.category)),
    )
  }

  setCategoryAssignees(assignee: CategoryAssignee) {
    return this.db.write((state) => {
      state.categoryAssignees = state.categoryAssignees.filter(
        (item) =>
          !(
            item.tripId === assignee.tripId &&
            item.domain === assignee.domain &&
            item.category === assignee.category
          ),
      )
      state.categoryAssignees.push(assignee)
      return assignee
    })
  }

  listTemplates(serverId: string, ownerUserId?: string) {
    return this.db.read((state) =>
      state.packingTemplates
        .filter((template) => template.serverId === serverId)
        .filter(
          (template) =>
            template.visibility === 'server' ||
            !template.ownerUserId ||
            !ownerUserId ||
            template.ownerUserId === ownerUserId,
        )
        .sort((a, b) => a.title.localeCompare(b.title)),
    )
  }

  findTemplate(templateId: string) {
    return this.db.read(
      (state) => state.packingTemplates.find((template) => template.id === templateId) ?? null,
    )
  }

  createTemplate(template: PackingTemplate) {
    return this.db.write((state) => {
      state.packingTemplates.push(template)
      return template
    })
  }

  deleteTemplate(templateId: string) {
    return this.db.write((state) => {
      const template = state.packingTemplates.find((item) => item.id === templateId) ?? null
      state.packingTemplates = state.packingTemplates.filter((item) => item.id !== templateId)
      return template
    })
  }
}
