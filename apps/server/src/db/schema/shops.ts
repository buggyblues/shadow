import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { servers } from './servers'
import { users } from './users'

/* ──────────────── Enums ──────────────── */

export const shopStatusEnum = pgEnum('shop_status', ['active', 'suspended', 'closed'])

export const productTypeEnum = pgEnum('product_type', ['physical', 'entitlement'])

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

export const entitlementTypeEnum = pgEnum('entitlement_type', [
  'channel_access',
  'channel_speak',
  'app_access',
  'custom_role',
  'custom',
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

/** One shop per server. Owned by the server owner. */
export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .unique()
    .references(() => servers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  status: shopStatusEnum('status').default('active').notNull(),
  /** Shop-level settings (shipping templates, return policy, etc.) */
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

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
    categoryId: uuid('category_id').references(() => productCategories.id, { onDelete: 'set null' }),
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
          type: 'channel_access' | 'channel_speak' | 'app_access' | 'custom_role' | 'custom'
          /** Target resource ID (channel, app, role) */
          targetId?: string
          /** Duration in seconds, null = permanent */
          durationSeconds?: number | null
          /** Human-readable description of the privilege */
          privilegeDescription?: string
        }
      | Array<{
          type: 'channel_access' | 'channel_speak' | 'app_access' | 'custom_role' | 'custom'
          targetId?: string
          durationSeconds?: number | null
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
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    type: entitlementTypeEnum('type').notNull(),
    /** Target resource ID (channel, app, role) */
    targetId: text('target_id'),
    /** When the entitlement becomes active */
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    /** When it expires, null = permanent */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Whether it's currently active (can be manually revoked) */
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    entitlementsUserIdIdx: index('entitlements_user_id_idx').on(t.userId),
    entitlementsServerIdIdx: index('entitlements_server_id_idx').on(t.serverId),
    entitlementsTypeIdx: index('entitlements_type_idx').on(t.type),
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
