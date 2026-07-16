import type { TravelDataStore } from '../db/database.js'
import type { TravelCategory, TravelCategoryDomain, TravelTag } from '../types.js'

export class MetadataDao {
  constructor(private readonly db: TravelDataStore) {}

  listTags(serverId: string, ownerUserId?: string) {
    return this.db.read((state) =>
      state.tags
        .filter((tag) => tag.serverId === serverId)
        .filter((tag) => !ownerUserId || !tag.ownerUserId || tag.ownerUserId === ownerUserId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  createTag(tag: TravelTag) {
    return this.db.write((state) => {
      state.tags.push(tag)
      return tag
    })
  }

  findTag(tagId: string) {
    return this.db.read((state) => state.tags.find((tag) => tag.id === tagId) ?? null)
  }

  updateTag(tagId: string, updater: (tag: TravelTag) => TravelTag) {
    return this.db.write((state) => {
      const index = state.tags.findIndex((tag) => tag.id === tagId)
      if (index < 0) return null
      const current = state.tags[index]
      if (!current) return null
      const next = updater(current)
      state.tags[index] = next
      return next
    })
  }

  deleteTag(tagId: string) {
    return this.db.write((state) => {
      const tag = state.tags.find((item) => item.id === tagId) ?? null
      state.tags = state.tags.filter((item) => item.id !== tagId)
      if (tag) {
        for (const place of state.places) {
          place.tags = place.tags.filter((value) => value !== tag.name && value !== tag.id)
        }
      }
      return tag
    })
  }

  listCategories(serverId: string, domain?: TravelCategoryDomain, ownerUserId?: string) {
    return this.db.read((state) =>
      state.categories
        .filter((category) => category.serverId === serverId)
        .filter((category) => !domain || category.domain === domain)
        .filter(
          (category) =>
            !ownerUserId || !category.ownerUserId || category.ownerUserId === ownerUserId,
        )
        .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name)),
    )
  }

  createCategory(category: TravelCategory) {
    return this.db.write((state) => {
      state.categories.push(category)
      return category
    })
  }

  findCategory(categoryId: string) {
    return this.db.read(
      (state) => state.categories.find((category) => category.id === categoryId) ?? null,
    )
  }

  updateCategory(categoryId: string, updater: (category: TravelCategory) => TravelCategory) {
    return this.db.write((state) => {
      const index = state.categories.findIndex((category) => category.id === categoryId)
      if (index < 0) return null
      const current = state.categories[index]
      if (!current) return null
      const next = updater(current)
      state.categories[index] = next
      return next
    })
  }

  deleteCategory(categoryId: string) {
    return this.db.write((state) => {
      const category = state.categories.find((item) => item.id === categoryId) ?? null
      state.categories = state.categories.filter((item) => item.id !== categoryId)
      for (const place of state.places) {
        if (place.categoryId === categoryId) place.categoryId = undefined
      }
      return category
    })
  }
}
