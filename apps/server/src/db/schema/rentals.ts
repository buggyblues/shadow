import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { users } from './users'

/* ──────────────── Enums ──────────────── */

export const listingStatusEnum = pgEnum('listing_status', [
  'draft',
  'active',
  'paused',
  'expired',
  'closed',
])

export const rentalContractStatusEnum = pgEnum('rental_contract_status', [
  'pending',
  'active',
  'completed',
  'cancelled',
  'violated',
  'disputed',
])

export const deviceTierEnum = pgEnum('device_tier', ['high_end', 'mid_range', 'low_end'])

export const osTypeEnum = pgEnum('os_type', ['macos', 'windows', 'linux'])

/* ──────────────── Claw Listing ──────────────── */

/** OpenClaw rental listing on the P2P marketplace. */
export const clawListings = pgTable('claw_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Owner who rents out their OpenClaw */
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Linked agent/buddy instance */
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),

  /* ── Listing Info ── */
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  /** Skills / capabilities of this claw */
  skills: jsonb('skills').$type<string[]>().default([]),
  /** Usage guidelines set by owner */
  guidelines: text('guidelines'),

  /* ── Device & Software ── */
  deviceTier: deviceTierEnum('device_tier').notNull().default('mid_range'),
  osType: osTypeEnum('os_type').notNull().default('macos'),
  /** Detailed device information */
  deviceInfo: jsonb('device_info')
    .$type<{
      model?: string
      cpu?: string
      ram?: string
      storage?: string
      gpu?: string
    }>()
    .default({}),
  /** Installed software tools available on the device */
  softwareTools: jsonb('software_tools').$type<string[]>().default([]),

  /* ── Pricing ── */
  /** Base hourly rate in 虾币 (smallest unit) */
  hourlyRate: integer('hourly_rate').default(0).notNull(),
  /** Discounted daily rate (optional, 0 = use hourly) */
  dailyRate: integer('daily_rate').default(0).notNull(),
  /** Discounted monthly rate (optional, 0 = use hourly) */
  monthlyRate: integer('monthly_rate').default(0).notNull(),
  /** Whether token costs are passed through to tenant */
  tokenFeePassthrough: boolean('token_fee_passthrough').default(true).notNull(),
  /** Owner's premium markup percentage (0-100) on base rate */
  premiumMarkup: integer('premium_markup').default(0).notNull(),
  /** Deposit/penalty amount the renter must agree to (违约金) */
  depositAmount: integer('deposit_amount').default(0).notNull(),

  /* ── Availability ── */
  listingStatus: listingStatusEnum('listing_status').default('draft').notNull(),
  /** Manual on/off switch — owner can delist anytime */
  isListed: boolean('is_listed').default(true).notNull(),
  /** Availability window start */
  availableFrom: timestamp('available_from', { withTimezone: true }),
  /** Availability window end (null = indefinite) */
  availableUntil: timestamp('available_until', { withTimezone: true }),

  /* ── Denormalized Counters ── */
  viewCount: integer('view_count').default(0).notNull(),
  rentalCount: integer('rental_count').default(0).notNull(),

  /* ── Search & Discovery ── */
  tags: jsonb('tags').$type<string[]>().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ──────────────── Rental Contract ──────────────── */

/** Signed rental contract between two users for an OpenClaw. */
export const rentalContracts = pgTable('rental_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Human-readable contract number */
  contractNo: varchar('contract_no', { length: 32 }).notNull().unique(),
  /** The listing this contract was created from */
  listingId: uuid('listing_id')
    .notNull()
    .references(() => clawListings.id, { onDelete: 'cascade' }),
  /** The tenant (renter / user of the claw) */
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** The owner (landlord) of the claw */
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  status: rentalContractStatusEnum('status').default('pending').notNull(),

  /** Frozen snapshot of the listing at time of contract signing */
  listingSnapshot: jsonb('listing_snapshot').$type<Record<string, unknown>>().default({}),

  /* ── Pricing Terms (frozen at sign time) ── */
  hourlyRate: integer('hourly_rate').notNull(),
  dailyRate: integer('daily_rate').default(0).notNull(),
  monthlyRate: integer('monthly_rate').default(0).notNull(),
  /** Platform fee rate in basis points (500 = 5%) */
  platformFeeRate: integer('platform_fee_rate').default(500).notNull(),
  /** Deposit / penalty for contract violations (虾币) */
  depositAmount: integer('deposit_amount').default(0).notNull(),

  /* ── Terms & Agreements ── */
  /** Owner's custom usage terms */
  ownerTerms: text('owner_terms'),
  /** Platform standard terms (snapshot) */
  platformTerms: text('platform_terms'),
  /** Timestamp when tenant agreed */
  tenantAgreedAt: timestamp('tenant_agreed_at', { withTimezone: true }),

  /* ── Duration ── */
  startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
  /** Contract end time (null = until manually terminated) */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /** Actual termination time */
  terminatedAt: timestamp('terminated_at', { withTimezone: true }),
  terminationReason: text('termination_reason'),

  /* ── Running Cost ── */
  totalCost: integer('total_cost').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ──────────────── Usage Record ──────────────── */

/** Tracks individual usage sessions for billing. */
export const rentalUsageRecords = pgTable('rental_usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => rentalContracts.id, { onDelete: 'cascade' }),

  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  /** Duration in minutes */
  durationMinutes: integer('duration_minutes').default(0).notNull(),

  /* ── Cost Breakdown ── */
  tokensConsumed: integer('tokens_consumed').default(0).notNull(),
  /** Token cost = tokens × token unit price */
  tokenCost: integer('token_cost').default(0).notNull(),
  /** Electricity cost = duration × platform electricity rate */
  electricityCost: integer('electricity_cost').default(0).notNull(),
  /** Rental cost = rate × duration */
  rentalCost: integer('rental_cost').default(0).notNull(),
  /** Platform fee = subtotal × platformFeeRate */
  platformFee: integer('platform_fee').default(0).notNull(),
  /** Total = rentalCost + tokenCost + electricityCost + platformFee */
  totalCost: integer('total_cost').default(0).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ──────────────── Violation ──────────────── */

/** Records of contract violations (e.g. owner self-use during rental). */
export const rentalViolations = pgTable('rental_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => rentalContracts.id, { onDelete: 'cascade' }),
  /** Who violated the contract */
  violatorId: uuid('violator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  /** Type of violation */
  violationType: varchar('violation_type', { length: 50 }).notNull(),
  description: text('description'),
  /** Penalty amount in 虾币 */
  penaltyAmount: integer('penalty_amount').default(0).notNull(),
  /** Whether the penalty has been paid */
  isPenaltyPaid: boolean('is_penalty_paid').default(false).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
