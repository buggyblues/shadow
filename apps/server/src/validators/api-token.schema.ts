import { z } from 'zod'

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(128),
  scope: z.string().min(1).max(255).optional().default('user:read'),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
})
