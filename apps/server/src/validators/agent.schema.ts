import { z } from 'zod'

export const createAgentSchema = z.object({
  name: z.string().min(1).max(64),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens, and underscores',
    ),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().optional(),
  kernelType: z.string().min(1).max(50).default('openclaw'),
  config: z.record(z.unknown()).default({}),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, hyphens, and underscores',
    )
    .optional(),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().optional(),
  kernelType: z.string().min(1).max(50).optional(),
  config: z.record(z.unknown()).optional(),
})

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>
