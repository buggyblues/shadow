import type { MetadataService } from '../services/metadata.service.js'
import type { RequestContext, TravelCategoryDomain } from '../types.js'
import type {
  CreateCategoryInput,
  CreateTagInput,
  UpdateCategoryInput,
  UpdateTagInput,
} from '../validators/travel.schema.js'

export class MetadataUseCase {
  constructor(private readonly metadataService: MetadataService) {}

  listTags(ctx: RequestContext) {
    return this.metadataService.listTags(ctx)
  }

  createTag(ctx: RequestContext, input: CreateTagInput) {
    return this.metadataService.createTag(ctx, input)
  }

  updateTag(ctx: RequestContext, tagId: string, input: UpdateTagInput) {
    return this.metadataService.updateTag(ctx, tagId, input)
  }

  deleteTag(ctx: RequestContext, tagId: string) {
    return this.metadataService.deleteTag(ctx, tagId)
  }

  listCategories(ctx: RequestContext, domain?: TravelCategoryDomain) {
    return this.metadataService.listCategories(ctx, domain)
  }

  createCategory(ctx: RequestContext, input: CreateCategoryInput) {
    return this.metadataService.createCategory(ctx, input)
  }

  updateCategory(ctx: RequestContext, categoryId: string, input: UpdateCategoryInput) {
    return this.metadataService.updateCategory(ctx, categoryId, input)
  }

  deleteCategory(ctx: RequestContext, categoryId: string) {
    return this.metadataService.deleteCategory(ctx, categoryId)
  }
}
