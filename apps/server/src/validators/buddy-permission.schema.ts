import { z } from 'zod'

/**
 * Validation schemas for Buddy permission endpoints
 */

/**
 * Schema for creating a new permission
 */
export const createPermissionSchema = z.object({
  serverId: z.string().uuid('Invalid server ID'),
  channelId: z.string().uuid('Invalid channel ID').nullable().optional(),
  userId: z.string().uuid('Invalid user ID'),
  canView: z.boolean().optional().default(true),
  canInteract: z.boolean().optional().default(true),
  canMention: z.boolean().optional().default(true),
  canManage: z.boolean().optional().default(false),
})

/**
 * Schema for updating a permission
 */
export const updatePermissionSchema = z.object({
  canView: z.boolean().optional(),
  canInteract: z.boolean().optional(),
  canMention: z.boolean().optional(),
  canManage: z.boolean().optional(),
})

/**
 * Schema for updating server settings
 */
export const updateServerSettingsSchema = z.object({
  serverId: z.string().uuid('Invalid server ID'),
  visibility: z.enum(['public', 'private', 'restricted']).optional(),
  isPrivate: z.boolean().optional(),
  defaultCanView: z.boolean().optional(),
  defaultCanInteract: z.boolean().optional(),
  defaultCanMention: z.boolean().optional(),
})

/**
 * Schema for query parameters when listing permissions
 */
export const listPermissionsQuerySchema = z.object({
  serverId: z.string().uuid().optional(),
  channelId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().optional(),
})

/**
 * Type exports for TypeScript
 */
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>
export type UpdateServerSettingsInput = z.infer<typeof updateServerSettingsSchema>
export type ListPermissionsQuery = z.infer<typeof listPermissionsQuerySchema>
