import { z } from 'zod'

export const createServerSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name is required')
    .max(100, 'Server name must be at most 100 characters'),
  description: z.string().max(500).optional(),
  slug: z.string().max(100).optional(),
  iconUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  isPublic: z.boolean().optional(),
})

export const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  slug: z.string().max(100).nullable().optional(),
  iconUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
})

export const joinServerSchema = z.object({
  inviteCode: z.string().length(8, 'Invite code must be 8 characters'),
})

export const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  nickname: z.string().max(64).nullable().optional(),
})

export type CreateServerInput = z.infer<typeof createServerSchema>
export type UpdateServerInput = z.infer<typeof updateServerSchema>
export type JoinServerInput = z.infer<typeof joinServerSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
