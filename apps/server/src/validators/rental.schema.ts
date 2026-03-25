import { z } from 'zod'

/* ═══════════════ Claw Listing ═══════════════ */

export const deviceInfoSchema = z.object({
  model: z.string().max(100).optional(),
  cpu: z.string().max(100).optional(),
  ram: z.string().max(50).optional(),
  storage: z.string().max(50).optional(),
  gpu: z.string().max(100).optional(),
})

export const createListingSchema = z.object({
  agentId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  skills: z.array(z.string().max(50)).max(20).optional().default([]),
  guidelines: z.string().max(5000).optional(),
  deviceTier: z.enum(['high_end', 'mid_range', 'low_end']).optional().default('mid_range'),
  osType: z.enum(['macos', 'windows', 'linux']).optional().default('macos'),
  deviceInfo: deviceInfoSchema.optional(),
  softwareTools: z.array(z.string().max(100)).max(50).optional().default([]),
  hourlyRate: z.number().int().min(0).max(100_000).optional().default(0),
  dailyRate: z.number().int().min(0).max(1_000_000).optional().default(0),
  monthlyRate: z.number().int().min(0).max(10_000_000).optional().default(0),
  tokenFeePassthrough: z.boolean().optional().default(true),
  depositAmount: z.number().int().min(0).max(1_000_000).optional().default(0),
  /* Billing v2 fields */
  baseDailyRate: z.number().int().min(0).max(100_000).optional().default(0),
  messageFee: z.number().int().min(0).max(100_000).optional().default(0),
  pricingVersion: z.number().int().min(1).max(2).optional().default(1),
  listingStatus: z.enum(['draft', 'active']).optional().default('draft'),
  availableFrom: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined
      return v.includes('T') && !v.includes('Z') && !v.includes('+') ? `${v}:00.000Z` : v
    }),
  availableUntil: z
    .string()
    .nullable()
    .optional()
    .transform((v) => {
      if (!v) return v
      return v.includes('T') && !v.includes('Z') && !v.includes('+') ? `${v}:00.000Z` : v
    }),
  tags: z.array(z.string().max(30)).max(10).optional().default([]),
})

export const updateListingSchema = createListingSchema.partial().extend({
  listingStatus: z.enum(['draft', 'active', 'paused', 'closed']).optional(),
})

export const toggleListingSchema = z.object({
  isListed: z.boolean(),
})

/* ═══════════════ Rental Contract ═══════════════ */

export const signContractSchema = z.object({
  /** The listing to rent */
  listingId: z.string().uuid(),
  /** Duration in hours (null for open-ended) */
  durationHours: z.number().int().min(1).max(8760).nullable().optional(),
  /** Tenant agrees to owner terms + platform terms */
  agreedToTerms: z.boolean().refine((v) => v === true, {
    message: 'You must agree to the terms',
  }),
})

export const terminateContractSchema = z.object({
  reason: z.string().max(500).optional(),
})

/* ═══════════════ Usage Record ═══════════════ */

export const recordUsageSchema = z.object({
  startedAt: z.string(),
  endedAt: z.string().optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  tokensConsumed: z.number().int().min(0).optional().default(0),
})

/* ═══════════════ Violation ═══════════════ */

export const reportViolationSchema = z.object({
  violationType: z.enum(['owner_self_use', 'tenant_abuse', 'terms_violation', 'other']),
  description: z.string().max(2000).optional(),
})

/* ═══════════════ Browse / Search ═══════════════ */

export const browseListingsSchema = z.object({
  keyword: z.string().max(100).optional(),
  deviceTier: z.string().max(50).optional(),
  osType: z.string().max(50).optional(),
  sortBy: z.enum(['popular', 'newest', 'price-asc', 'price-desc']).optional().default('popular'),
  limit: z.coerce.number().int().min(1).max(500).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})
