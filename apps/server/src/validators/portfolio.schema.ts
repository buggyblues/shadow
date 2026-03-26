import { z } from 'zod'

export const portfolioVisibilitySchema = z.enum(['public', 'private', 'unlisted'])
export const portfolioStatusSchema = z.enum(['draft', 'published', 'archived'])

export const createPortfolioSchema = z.object({
  attachmentId: z.string().uuid(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  visibility: portfolioVisibilitySchema.optional().default('public'),
  tags: z.array(z.string().max(50)).max(10).optional(),
})

export const updatePortfolioSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  visibility: portfolioVisibilitySchema.optional(),
  status: portfolioStatusSchema.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
})

export const portfolioFiltersSchema = z.object({
  ownerId: z.string().uuid().optional(),
  visibility: portfolioVisibilitySchema.optional(),
  status: portfolioStatusSchema.optional(),
  tags: z.array(z.string().max(50)).max(5).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
})

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
})

export const listCommentsSchema = z.object({
  limit: z.coerce.number().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
})

export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>
export type PortfolioFiltersInput = z.infer<typeof portfolioFiltersSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
