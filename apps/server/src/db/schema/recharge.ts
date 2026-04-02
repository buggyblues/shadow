import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

/* ──────────────── Enums ──────────────── */

export const paymentOrderStatusEnum = pgEnum('payment_order_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'disputed',
])

export const iapOrderStatusEnum = pgEnum('iap_order_status', [
  'pending',
  'verified',
  'succeeded',
  'failed',
  'refunded',
])

/* ──────────────── Payment Orders (Stripe) ──────────────── */

export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Stripe-specific fields
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }).unique(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),

  // Order info
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orderNo: varchar('order_no', { length: 32 }).notNull().unique(),

  // Amounts
  shrimpCoinAmount: integer('shrimp_coin_amount').notNull(),
  usdAmount: integer('usd_amount').notNull(), // in cents (e.g., 999 for $9.99)
  localCurrencyAmount: integer('local_currency_amount'),
  localCurrency: varchar('local_currency', { length: 3 }),

  // Status
  status: paymentOrderStatusEnum('status').default('pending').notNull(),

  // 3D Secure / async payment tracking
  requiresAction: boolean('requires_action').default(false),
  actionType: varchar('action_type', { length: 50 }),

  // Timestamps
  paidAt: timestamp('paid_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/* ──────────────── IAP Orders (Apple/Google — reserved) ──────────────── */

export const iapOrders = pgTable('iap_orders', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Apple-specific fields
  transactionId: varchar('transaction_id', { length: 255 }).notNull().unique(),
  originalTransactionId: varchar('original_transaction_id', { length: 255 }),
  productId: varchar('product_id', { length: 255 }).notNull(),

  // Order info
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orderNo: varchar('order_no', { length: 32 }).notNull().unique(),

  // Amounts
  shrimpCoinAmount: integer('shrimp_coin_amount').notNull(),

  // Status
  status: iapOrderStatusEnum('status').default('pending').notNull(),

  // Receipt data
  receiptData: text('receipt_data'),

  // Timestamps
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
