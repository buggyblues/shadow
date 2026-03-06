import { z } from 'zod'

export const createAgentSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  kernelType: z.string().min(1).max(50).default('openclaw'),
  config: z.record(z.unknown()).default({}),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>
