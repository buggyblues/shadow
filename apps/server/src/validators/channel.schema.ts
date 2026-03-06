import { z } from 'zod'

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(100, 'Channel name must be at most 100 characters'),
  type: z.enum(['text', 'voice', 'announcement']).default('text'),
  topic: z.string().max(1024).optional(),
})

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['text', 'voice', 'announcement']).optional(),
  topic: z.string().max(1024).nullable().optional(),
  position: z.number().int().min(0).optional(),
})

export const channelPositionsSchema = z.object({
  positions: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: z.number().int().min(0),
      }),
    )
    .min(1, 'Positions array cannot be empty'),
})

export type CreateChannelInput = z.infer<typeof createChannelSchema>
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>
export type ChannelPositionsInput = z.infer<typeof channelPositionsSchema>
