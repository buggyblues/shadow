/**
 * Shadow config schema — Zod schema for validating the plugin config.
 */

import { z } from 'zod'

const ShadowAccountSchema = z.object({
  token: z.string().min(1),
  serverUrl: z.string().url().default('http://localhost:3002'),
  enabled: z.boolean().optional(),
})

const ShadowConfigBaseSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
})

const SimplifiedSchema = z.intersection(ShadowConfigBaseSchema, ShadowAccountSchema)

const MultiAccountSchema = z.intersection(
  ShadowConfigBaseSchema,
  z.object({
    accounts: z.record(z.string(), ShadowAccountSchema).refine(
      (val) => Object.keys(val).length > 0,
      { message: 'accounts must contain at least one entry' },
    ),
  }),
)

export const ShadowConfigSchema = z.union([SimplifiedSchema, MultiAccountSchema])

export type ShadowConfig = z.infer<typeof ShadowConfigSchema>
