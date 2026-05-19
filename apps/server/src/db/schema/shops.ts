import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { servers } from './servers'
import { users } from './users'
import { workspaceNodes } from './workspaces'

/* ──────────────── Enums ──────────────── */

export const shopStatusEnum = pgEnum('shop_status', ['active', 'suspended', 'closed'])

export const shopScopeKindEnum = pgEnum('shop_scope_kind', ['server', 'user'])

export const productTypeEnum = pgEnum('product_type', ['physical', 'entitlement'])

export const productBillingModeEnum = pgEnum('product_billing_mode', [
  'one_time',
  'fixed_duration',
  'subscription',
])

export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived'])

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
])

export const entitlementStatusEnum = pgEnum('entitlement_status', [
  'active',
  'expired',
  'cancelled',
  'revoked',
  'renewal_failed',
  'pending_force_majeure_review',
])

export const forceMajeureStatusEnum = pgEnum('force_majeure_status', [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'refund_decided',
  'entitlement_revoked',
  'closed',
])

export const commerceIdempotencyStatusEnum = pgEnum('commerce_idempotency_status', [
  'started',
  'completed',
  'failed',
])

export const commerceOfferOriginKindEnum = pgEnum('commerce_offer_origin_kind', [
  'server',
  'user',
  'platform',
])

export const commerceOfferStatusEnum = pgEnum('commerce_offer_status', [
  'draft',
  'active',
  'paused',
  'archived',
])

export const commerceDeliverableKindEnum = pgEnum('commerce_deliverable_kind', [
  'entitlement',
  'community_asset',
  'currency',
  'paid_file',
  'message',
  'external',
])

export const commerceDeliverableStatusEnum = pgEnum('commerce_deliverable_status', [
  'active',
  'paused',
  'archived',
])

export const commerceFulfillmentDestinationKindEnum = pgEnum(
  'commerce_fulfillment_destination_kind',
  ['channel', 'dm'],
)

export const commerceFulfillmentStatusEnum = pgEnum('commerce_fulfillment_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
])

export const paidFileGrantStatusEnum = pgEnum('paid_file_grant_status', [
  'active',
  'revoked',
  'expired',
])

export const walletTxTypeEnum = pgEnum('wallet_tx_type', [
  'topup',
  'purchase',
  'refund',
  'reward',
  'transfer',
  'adjustment',
  'settlement',
])

export const currencyEnum = pgEnum('currency_type', ['shrimp_coin'])

/* ──────────────── Shop ──────────────── */

/** Shops can be owned by a server or a user. Existing server shops keep scopeKind=server. */
export const shops = pgTable(
  'shops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scopeKind: shopScopeKindEnum('scope_kind').default('server').notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    visibility: varchar('visibility', { length: 40 }).default('login_required').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    bannerUrl: text('banner_url'),
    status: shopStatusEnum('status').default('active').notNull(),
    /** Shop-level settings (shipping templates, return policy, etc.) */
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    shopsScopeServerUnique: unique('shops_scope_server_unique').on(t.scopeKind, t.serverId),
    shopsScopeOwnerUnique: unique('shops_scope_owner_unique').on(t.scopeKind, t.ownerUserId),
    shopsOwnerUserIdIdx: index('shops_owner_user_id_idx').on(t.ownerUserId),
  }),
)

/* ──────────────── Product Category ──────────────── */

export const productCategories = pgTable(
  'product_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    parentId: uuid('parent_id'), // self-referencing for tree structure
    position: integer('position').default(0).notNull(),
    iconUrl: text('icon_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productCategoriesShopIdIdx: index('product_categories_shop_id_idx').on(t.shopId),
  }),
)

/* ──────────────── SPU (Standard Product Unit) ──────────────── */

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => productCategories.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    type: productTypeEnum('type').default('physical').notNull(),
    status: productStatusEnum('status').default('draft').notNull(),
    /** Rich-text HTML from editor */
    description: text('description'),
    /** Short summary for listing cards */
    summary: varchar('summary', { length: 500 }),
    /** Base price in smallest currency unit (before SKU overrides) */
    basePrice: integer('base_price').default(0).notNull(),
    currency: currencyEnum('currency').default('shrimp_coin').notNull(),
    billingMode: productBillingModeEnum('billing_mode').default('one_time').notNull(),
    /** Spec template names, e.g. ["颜色","尺码"] — drives SKU matrix */
    specNames: jsonb('spec_names').$type<string[]>().default([]),
    /** SEO / search tags */
    tags: jsonb('tags').$type<string[]>().default([]),
    /** Total sales count (denormalized for sorting) */
    salesCount: integer('sales_count').default(0).notNull(),
    /** Average rating 1-5 (denormalized) */
    avgRating: integer('avg_rating').default(0).notNull(),
    ratingCount: integer('rating_count').default(0).notNull(),
    /** Entitlement config — only when type = 'entitlement' */
    entitlementConfig: jsonb('entitlement_config').$type<
      | {
          /** Resource class unlocked by the product, e.g. workspace_file or service. */
          resourceType?: string
          /** Concrete resource id; defaults to product id when omitted. */
          resourceId?: string
          /** Capability granted on the resource, e.g. view/use/download. */
          capability?: string
          /** Duration in seconds, null = permanent */
          durationSeconds?: number | null
          /** Renewal period for subscription products, in seconds. */
          renewalPeriodSeconds?: number | null
          /** Whether a buyer can purchase this entitlement repeatedly while active. */
          repeatable?: boolean
          /** Human-readable description of the privilege */
          privilegeDescription?: string
        }
      | Array<{
          resourceType?: string
          resourceId?: string
          capability?: string
          durationSeconds?: number | null
          renewalPeriodSeconds?: number | null
          repeatable?: boolean
          privilegeDescription?: string
        }>
    >(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productsShopIdIdx: index('products_shop_id_idx').on(t.shopId),
    productsCategoryIdIdx: index('products_category_id_idx').on(t.categoryId),
  }),
)

/* ──────────────── Product Media ──────────────── */

export const productMedia = pgTable(
  'product_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 10 }).notNull().default('image'), // 'image' | 'video'
    url: text('url').notNull(),
    /** Thumbnail for videos */
    thumbnailUrl: text('thumbnail_url'),
    position: integer('position').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productMediaProductIdIdx: index('product_media_product_id_idx').on(t.productId),
  }),
)

/* ──────────────── SKU (Stock Keeping Unit) ──────────────── */

export const skus = pgTable(
  'skus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Spec values matching specNames order, e.g. ["红色","XL"] */
    specValues: jsonb('spec_values').$type<string[]>().default([]),
    price: integer('price').notNull(),
    currency: currencyEnum('currency').default('shrimp_coin').notNull(),
    stock: integer('stock').default(0).notNull(),
    /** SKU-specific image */
    imageUrl: text('image_url'),
    /** External SKU code for seller reference */
    skuCode: varchar('sku_code', { length: 100 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    skusProductIdIdx: index('skus_product_id_idx').on(t.productId),
  }),
)

/* ──────────────── Commerce Offer ──────────────── */

export const commerceOffers = pgTable(
  'commerce_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    originKind: commerceOfferOriginKindEnum('origin_kind').default('server').notNull(),
    originServerId: uuid('origin_server_id').references(() => servers.id, {
      onDelete: 'set null',
    }),
    sellerUserId: uuid('seller_user_id').references(() => users.id, { onDelete: 'set null' }),
    sellerBuddyUserId: uuid('seller_buddy_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    allowedSurfaces: jsonb('allowed_surfaces')
      .$type<Array<'channel' | 'dm'>>()
      .default(['channel', 'dm']),
    visibility: varchar('visibility', { length: 40 }).default('login_required').notNull(),
    eligibility: jsonb('eligibility').$type<Record<string, unknown>>().default({}),
    priceOverride: integer('price_override'),
    currency: currencyEnum('currency').default('shrimp_coin').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: commerceOfferStatusEnum('status').default('active').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    commerceOffersShopIdIdx: index('commerce_offers_shop_id_idx').on(t.shopId),
    commerceOffersProductIdIdx: index('commerce_offers_product_id_idx').on(t.productId),
    commerceOffersStatusIdx: index('commerce_offers_status_idx').on(t.status),
    commerceOffersSellerBuddyIdx: index('commerce_offers_seller_buddy_idx').on(t.sellerBuddyUserId),
  }),
)

export const commerceDeliverables = pgTable(
  'commerce_deliverables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => commerceOffers.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    kind: commerceDeliverableKindEnum('kind').default('paid_file').notNull(),
    resourceType: varchar('resource_type', { length: 80 }).default('workspace_file').notNull(),
    resourceId: text('resource_id').notNull(),
    senderBuddyUserId: uuid('sender_buddy_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deliveryTiming: varchar('delivery_timing', { length: 40 }).default('after_purchase').notNull(),
    messageTemplateKey: varchar('message_template_key', { length: 120 }),
    status: commerceDeliverableStatusEnum('status').default('active').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    commerceDeliverablesOfferIdIdx: index('commerce_deliverables_offer_id_idx').on(t.offerId),
    commerceDeliverablesProductIdIdx: index('commerce_deliverables_product_id_idx').on(t.productId),
    commerceDeliverablesResourceIdx: index('commerce_deliverables_resource_idx').on(
      t.resourceType,
      t.resourceId,
    ),
    commerceDeliverablesStatusIdx: index('commerce_deliverables_status_idx').on(t.status),
  }),
)

/* ──────────────── Wallet ──────────────── */

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Balance in smallest unit (虾币 = 1 coin) */
  balance: integer('balance').default(0).notNull(),
  /** Frozen amount (in pending orders) */
  frozenAmount: integer('frozen_amount').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    type: walletTxTypeEnum('type').notNull(),
    amount: integer('amount').notNull(), // positive = credit, negative = debit
    balanceAfter: integer('balance_after').notNull(),
    currency: currencyEnum('currency').default('shrimp_coin').notNull(),
    /** Reference to order, top-up, etc. */
    referenceId: uuid('reference_id'),
    referenceType: varchar('reference_type', { length: 50 }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    walletTransactionsWalletIdIdx: index('wallet_transactions_wallet_id_idx').on(t.walletId),
    walletTransactionsCreatedAtIdx: index('wallet_transactions_created_at_idx').on(t.createdAt),
    walletTransactionsReferenceUnique: unique('wallet_transactions_reference_unique').on(
      t.walletId,
      t.type,
      t.referenceType,
      t.referenceId,
    ),
  }),
)

export const walletUsageAccruals = pgTable(
  'wallet_usage_accruals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 50 }).notNull(),
    accruedMicros: integer('accrued_micros').default(0).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    walletUsageAccrualsWalletSourceUnique: unique('wallet_usage_accruals_wallet_source_unique').on(
      t.walletId,
      t.source,
    ),
    walletUsageAccrualsWalletIdIdx: index('wallet_usage_accruals_wallet_id_idx').on(t.walletId),
  }),
)

/* ──────────────── Order ──────────────── */

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable order number */
    orderNo: varchar('order_no', { length: 32 }).notNull().unique(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: orderStatusEnum('status').default('pending').notNull(),
    totalAmount: integer('total_amount').notNull(),
    currency: currencyEnum('currency').default('shrimp_coin').notNull(),
    /** Shipping address for physical goods */
    shippingAddress: jsonb('shipping_address').$type<{
      name?: string
      phone?: string
      address?: string
      city?: string
      state?: string
      zip?: string
      country?: string
    }>(),
    /** Tracking info */
    trackingNo: varchar('tracking_no', { length: 100 }),
    /** Seller / buyer notes */
    sellerNote: text('seller_note'),
    buyerNote: text('buyer_note'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ordersShopIdIdx: index('orders_shop_id_idx').on(t.shopId),
    ordersBuyerIdIdx: index('orders_buyer_id_idx').on(t.buyerId),
    ordersStatusIdx: index('orders_status_idx').on(t.status),
    ordersCreatedAtIdx: index('orders_created_at_idx').on(t.createdAt),
  }),
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id').references(() => skus.id, { onDelete: 'set null' }),
    /** Snapshot of product name at time of purchase */
    productName: varchar('product_name', { length: 200 }).notNull(),
    /** Snapshot of SKU spec values */
    specValues: jsonb('spec_values').$type<string[]>().default([]),
    price: integer('price').notNull(),
    quantity: integer('quantity').default(1).notNull(),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orderItemsOrderIdIdx: index('order_items_order_id_idx').on(t.orderId),
    orderItemsProductIdIdx: index('order_items_product_id_idx').on(t.productId),
  }),
)

/* ──────────────── Review ──────────────── */

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1-5
    content: text('content'),
    /** Review images */
    images: jsonb('images').$type<string[]>().default([]),
    /** Seller reply */
    reply: text('reply'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    reviewsProductIdIdx: index('reviews_product_id_idx').on(t.productId),
    reviewsOrderIdIdx: index('reviews_order_id_idx').on(t.orderId),
    reviewsUserIdIdx: index('reviews_user_id_idx').on(t.userId),
  }),
)

/* ──────────────── Entitlement (purchased privileges) ──────────────── */

export const entitlements = pgTable(
  'entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    renewalOrderId: uuid('renewal_order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    offerId: uuid('offer_id').references(() => commerceOffers.id, { onDelete: 'set null' }),
    scopeKind: shopScopeKindEnum('scope_kind').default('server').notNull(),
    resourceType: varchar('resource_type', { length: 80 }).default('service').notNull(),
    resourceId: text('resource_id').notNull(),
    capability: varchar('capability', { length: 80 }).default('use').notNull(),
    status: entitlementStatusEnum('status').default('active').notNull(),
    /** When the entitlement becomes active */
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    /** When it expires, null = permanent */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Whether it's currently active (can be manually revoked) */
    isActive: boolean('is_active').default(true).notNull(),
    nextRenewalAt: timestamp('next_renewal_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    revocationReason: text('revocation_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    entitlementsUserIdIdx: index('entitlements_user_id_idx').on(t.userId),
    entitlementsServerIdIdx: index('entitlements_server_id_idx').on(t.serverId),
    entitlementsShopIdIdx: index('entitlements_shop_id_idx').on(t.shopId),
    entitlementsOfferIdIdx: index('entitlements_offer_id_idx').on(t.offerId),
    entitlementsResourceIdx: index('entitlements_resource_idx').on(t.resourceType, t.resourceId),
    entitlementsCapabilityIdx: index('entitlements_capability_idx').on(t.capability),
    entitlementsStatusIdx: index('entitlements_status_idx').on(t.status),
    entitlementsNextRenewalAtIdx: index('entitlements_next_renewal_at_idx').on(t.nextRenewalAt),
  }),
)

export const paidFileGrants = pgTable(
  'paid_file_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => workspaceNodes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => entitlements.id, { onDelete: 'cascade' }),
    status: paidFileGrantStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    paidFileGrantsFileUserIdx: index('paid_file_grants_file_user_idx').on(t.fileId, t.userId),
    paidFileGrantsEntitlementIdx: index('paid_file_grants_entitlement_idx').on(t.entitlementId),
    paidFileGrantsStatusIdx: index('paid_file_grants_status_idx').on(t.status),
    paidFileGrantsExpiresAtIdx: index('paid_file_grants_expires_at_idx').on(t.expiresAt),
  }),
)

export const commerceFulfillmentJobs = pgTable(
  'commerce_fulfillment_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    entitlementId: uuid('entitlement_id').references(() => entitlements.id, {
      onDelete: 'set null',
    }),
    deliverableId: uuid('deliverable_id').references(() => commerceDeliverables.id, {
      onDelete: 'set null',
    }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    destinationKind: commerceFulfillmentDestinationKindEnum('destination_kind'),
    destinationId: text('destination_id'),
    senderBuddyUserId: uuid('sender_buddy_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: commerceFulfillmentStatusEnum('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    resultMessageId: text('result_message_id'),
    lastErrorCode: varchar('last_error_code', { length: 120 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    commerceFulfillmentJobsOrderIdx: index('commerce_fulfillment_jobs_order_idx').on(t.orderId),
    commerceFulfillmentJobsEntitlementIdx: index('commerce_fulfillment_jobs_entitlement_idx').on(
      t.entitlementId,
    ),
    commerceFulfillmentJobsBuyerIdx: index('commerce_fulfillment_jobs_buyer_idx').on(t.buyerId),
    commerceFulfillmentJobsStatusIdx: index('commerce_fulfillment_jobs_status_idx').on(t.status),
  }),
)

export const entitlementForceMajeureRequests = pgTable(
  'entitlement_force_majeure_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => entitlements.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    status: forceMajeureStatusEnum('status').default('submitted').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}),
    platformDecision: jsonb('platform_decision').$type<Record<string, unknown>>().default({}),
    refundAmount: integer('refund_amount'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    forceMajeureEntitlementIdx: index('force_majeure_entitlement_idx').on(t.entitlementId),
    forceMajeureStatusIdx: index('force_majeure_status_idx').on(t.status),
  }),
)

export const commerceIdempotencyKeys = pgTable(
  'commerce_idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 200 }).notNull(),
    action: varchar('action', { length: 80 }).notNull(),
    status: commerceIdempotencyStatusEnum('status').default('started').notNull(),
    referenceId: uuid('reference_id'),
    response: jsonb('response').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    commerceIdempotencyKeysUnique: unique('commerce_idempotency_keys_unique').on(
      t.actorUserId,
      t.key,
      t.action,
    ),
    commerceIdempotencyKeysActorIdx: index('commerce_idempotency_keys_actor_idx').on(t.actorUserId),
  }),
)

/* ──────────────── Shopping Cart ──────────────── */

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id').references(() => skus.id, { onDelete: 'set null' }),
    quantity: integer('quantity').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cartItemsUserIdIdx: index('cart_items_user_id_idx').on(t.userId),
    cartItemsShopIdIdx: index('cart_items_shop_id_idx').on(t.shopId),
    cartItemsProductIdIdx: index('cart_items_product_id_idx').on(t.productId),
  }),
)
