import type { MetadataDao } from '../dao/metadata.dao.js'
import { notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import { travelLocalActorAllowed } from '../security/oauth.js'
import type { RequestContext, TravelCategory, TravelCategoryDomain, TravelTag } from '../types.js'
import type {
  CreateCategoryInput,
  CreateTagInput,
  UpdateCategoryInput,
  UpdateTagInput,
} from '../validators/travel.schema.js'

function ownerUserId(ctx: RequestContext) {
  return ctx.actor.userId ?? ctx.actor.ownerId ?? undefined
}

function canManageScopedResource(ctx: RequestContext, resourceOwnerUserId?: string) {
  if (ctx.local && travelLocalActorAllowed()) return true
  const currentOwnerUserId = ownerUserId(ctx)
  return (
    !resourceOwnerUserId || (!!currentOwnerUserId && resourceOwnerUserId === currentOwnerUserId)
  )
}

export class MetadataService {
  constructor(private readonly metadataDao: MetadataDao) {}

  listTags(ctx: RequestContext) {
    return this.metadataDao.listTags(ctx.serverId, ownerUserId(ctx))
  }

  createTag(ctx: RequestContext, input: CreateTagInput) {
    const timestamp = nowIso()
    const tag: TravelTag = {
      id: createId('tag'),
      serverId: ctx.serverId,
      ownerUserId: ownerUserId(ctx),
      name: input.name,
      color: input.color,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.metadataDao.createTag(tag)
  }

  async updateTag(ctx: RequestContext, tagId: string, input: UpdateTagInput) {
    const current = await this.metadataDao.findTag(tagId)
    if (!current || current.serverId !== ctx.serverId) throw notFound('Tag')
    if (!canManageScopedResource(ctx, current.ownerUserId)) throw notFound('Tag')
    const updated = await this.metadataDao.updateTag(tagId, (tag) => ({
      ...tag,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Tag')
    return updated
  }

  async deleteTag(ctx: RequestContext, tagId: string) {
    const current = await this.metadataDao.findTag(tagId)
    if (!current || current.serverId !== ctx.serverId) throw notFound('Tag')
    if (!canManageScopedResource(ctx, current.ownerUserId)) throw notFound('Tag')
    const deleted = await this.metadataDao.deleteTag(tagId)
    if (!deleted) throw notFound('Tag')
    return deleted
  }

  listCategories(ctx: RequestContext, domain?: TravelCategoryDomain) {
    return this.metadataDao.listCategories(ctx.serverId, domain, ownerUserId(ctx))
  }

  createCategory(ctx: RequestContext, input: CreateCategoryInput) {
    const timestamp = nowIso()
    const category: TravelCategory = {
      id: createId('category'),
      serverId: ctx.serverId,
      ownerUserId: ownerUserId(ctx),
      domain: input.domain,
      name: input.name,
      color: input.color,
      icon: input.icon,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.metadataDao.createCategory(category)
  }

  async updateCategory(ctx: RequestContext, categoryId: string, input: UpdateCategoryInput) {
    const current = await this.metadataDao.findCategory(categoryId)
    if (!current || current.serverId !== ctx.serverId) throw notFound('Category')
    if (!canManageScopedResource(ctx, current.ownerUserId)) throw notFound('Category')
    const updated = await this.metadataDao.updateCategory(categoryId, (category) => ({
      ...category,
      ...input,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Category')
    return updated
  }

  async deleteCategory(ctx: RequestContext, categoryId: string) {
    const current = await this.metadataDao.findCategory(categoryId)
    if (!current || current.serverId !== ctx.serverId) throw notFound('Category')
    if (!canManageScopedResource(ctx, current.ownerUserId)) throw notFound('Category')
    const deleted = await this.metadataDao.deleteCategory(categoryId)
    if (!deleted) throw notFound('Category')
    return deleted
  }
}
