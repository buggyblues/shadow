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
import { paymentOrders } from './recharge'
import { commerceDeliverables, commerceFulfillmentJobs, orderItems, orders, shops } from './shops'
import { users } from './users'

export const economyAuditResultEnum = pgEnum('economy_audit_result', [
  'started',
  'succeeded',
  'failed',
  'denied',
])

export const paymentProviderEventStatusEnum = pgEnum('payment_provider_event_status', [
  'received',
  'processing',
  'processed',
  'failed',
  'ignored',
])

export const riskCaseKindEnum = pgEnum('risk_case_kind', [
  'payment_dispute',
  'chargeback',
  'economy_restricted',
  'fraud_signal',
])

export const riskCaseStatusEnum = pgEnum('risk_case_status', [
  'open',
  'reviewing',
  'resolved',
  'dismissed',
])

export const commerceFulfillmentRecordStatusEnum = pgEnum('commerce_fulfillment_record_status', [
  'succeeded',
  'failed',
  'skipped',
])

export const communityAssetIssuerKindEnum = pgEnum('community_asset_issuer_kind', [
  'platform',
  'server',
  'user',
  'shop',
])

export const communityAssetTypeEnum = pgEnum('community_asset_type', [
  'badge',
  'gift',
  'coupon',
  'service_ticket',
  'collectible',
  'content_pass',
  'reward',
])

export const communityAssetDefinitionStatusEnum = pgEnum('community_asset_definition_status', [
  'draft',
  'active',
  'paused',
  'archived',
])

export const communityAssetGrantStatusEnum = pgEnum('community_asset_grant_status', [
  'active',
  'locked',
  'consumed',
  'revoked',
  'expired',
])

export const communityAssetTransferActionEnum = pgEnum('community_asset_transfer_action', [
  'grant',
  'lock',
  'gift',
  'consume',
  'revoke',
  'expire',
  'unlock',
])

export const economyTipStatusEnum = pgEnum('economy_tip_status', [
  'succeeded',
  'failed',
  'reversed',
  'held',
])

export const economyGiftStatusEnum = pgEnum('economy_gift_status', [
  'succeeded',
  'failed',
  'reversed',
  'held',
])

export const economyGiftItemKindEnum = pgEnum('economy_gift_item_kind', ['currency', 'asset'])

export const settlementOwnerKindEnum = pgEnum('settlement_owner_kind', ['user', 'shop', 'platform'])

export const settlementLineStatusEnum = pgEnum('settlement_line_status', [
  'pending',
  'available',
  'settled',
  'failed',
  'held',
  'reversed',
])

export const economyAuditEvents = pgTable(
  'economy_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorKind: varchar('actor_kind', { length: 40 }).notNull(),
    actorId: text('actor_id'),
    actorTokenKind: varchar('actor_token_kind', { length: 40 }),
    action: varchar('action', { length: 120 }).notNull(),
    resourceKind: varchar('resource_kind', { length: 80 }).notNull(),
    resourceId: text('resource_id'),
    scopeKind: varchar('scope_kind', { length: 80 }),
    scopeId: text('scope_id'),
    idempotencyKey: varchar('idempotency_key', { length: 200 }),
    requestHash: varchar('request_hash', { length: 128 }),
    result: economyAuditResultEnum('result').notNull(),
    errorCode: varchar('error_code', { length: 120 }),
    ipHash: varchar('ip_hash', { length: 128 }),
    userAgentHash: varchar('user_agent_hash', { length: 128 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    economyAuditEventsActorIdx: index('economy_audit_events_actor_idx').on(t.actorKind, t.actorId),
    economyAuditEventsActionIdx: index('economy_audit_events_action_idx').on(t.action),
    economyAuditEventsResourceIdx: index('economy_audit_events_resource_idx').on(
      t.resourceKind,
      t.resourceId,
    ),
    economyAuditEventsCreatedAtIdx: index('economy_audit_events_created_at_idx').on(t.createdAt),
  }),
)

export const paymentProviderEvents = pgTable(
  'payment_provider_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    payloadHash: varchar('payload_hash', { length: 128 }).notNull(),
    paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id, {
      onDelete: 'set null',
    }),
    status: paymentProviderEventStatusEnum('status').default('received').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    paymentProviderEventsUnique: unique('payment_provider_events_unique').on(
      t.provider,
      t.providerEventId,
    ),
    paymentProviderEventsOrderIdx: index('payment_provider_events_order_idx').on(t.paymentOrderId),
    paymentProviderEventsStatusIdx: index('payment_provider_events_status_idx').on(t.status),
  }),
)

export const riskCases = pgTable(
  'risk_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    resourceType: varchar('resource_type', { length: 80 }).notNull(),
    resourceId: text('resource_id'),
    kind: riskCaseKindEnum('kind').notNull(),
    status: riskCaseStatusEnum('status').default('open').notNull(),
    severity: varchar('severity', { length: 40 }).default('medium').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    riskCasesUserIdx: index('risk_cases_user_idx').on(t.userId),
    riskCasesKindStatusIdx: index('risk_cases_kind_status_idx').on(t.kind, t.status),
    riskCasesResourceIdx: index('risk_cases_resource_idx').on(t.resourceType, t.resourceId),
  }),
)

export const commerceFulfillmentRecords = pgTable(
  'commerce_fulfillment_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').references(() => commerceFulfillmentJobs.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    deliverableId: uuid('deliverable_id').references(() => commerceDeliverables.id, {
      onDelete: 'set null',
    }),
    recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'set null' }),
    idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
    resultType: varchar('result_type', { length: 80 }).notNull(),
    resultId: text('result_id'),
    status: commerceFulfillmentRecordStatusEnum('status').default('succeeded').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    commerceFulfillmentRecordsUniqueDelivery: unique(
      'commerce_fulfillment_records_unique_delivery',
    ).on(t.orderItemId, t.deliverableId, t.recipientUserId),
    commerceFulfillmentRecordsIdempotencyUnique: unique(
      'commerce_fulfillment_records_idempotency_unique',
    ).on(t.idempotencyKey),
    commerceFulfillmentRecordsJobIdx: index('commerce_fulfillment_records_job_idx').on(t.jobId),
    commerceFulfillmentRecordsOrderIdx: index('commerce_fulfillment_records_order_idx').on(
      t.orderId,
    ),
  }),
)

export const communityAssetDefinitions = pgTable(
  'community_asset_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuerKind: communityAssetIssuerKindEnum('issuer_kind').notNull(),
    issuerId: text('issuer_id'),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    assetType: communityAssetTypeEnum('asset_type').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    giftable: boolean('giftable').default(false).notNull(),
    transferable: boolean('transferable').default(false).notNull(),
    consumable: boolean('consumable').default(false).notNull(),
    revocable: boolean('revocable').default(true).notNull(),
    expiresAfterDays: integer('expires_after_days'),
    status: communityAssetDefinitionStatusEnum('status').default('draft').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    communityAssetDefinitionsShopIdx: index('community_asset_definitions_shop_idx').on(t.shopId),
    communityAssetDefinitionsIssuerIdx: index('community_asset_definitions_issuer_idx').on(
      t.issuerKind,
      t.issuerId,
    ),
    communityAssetDefinitionsStatusIdx: index('community_asset_definitions_status_idx').on(
      t.status,
    ),
  }),
)

export const communityAssetGrants = pgTable(
  'community_asset_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => communityAssetDefinitions.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceKind: varchar('source_kind', { length: 80 }).notNull(),
    sourceId: text('source_id'),
    quantity: integer('quantity').default(1).notNull(),
    remainingQuantity: integer('remaining_quantity').default(1).notNull(),
    status: communityAssetGrantStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    communityAssetGrantsDefinitionIdx: index('community_asset_grants_definition_idx').on(
      t.definitionId,
    ),
    communityAssetGrantsOwnerStatusIdx: index('community_asset_grants_owner_status_idx').on(
      t.ownerUserId,
      t.status,
    ),
  }),
)

export const communityAssetTransferLogs = pgTable(
  'community_asset_transfer_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    definitionId: uuid('definition_id').references(() => communityAssetDefinitions.id, {
      onDelete: 'set null',
    }),
    grantId: uuid('grant_id').references(() => communityAssetGrants.id, { onDelete: 'set null' }),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'set null' }),
    toUserId: uuid('to_user_id').references(() => users.id, { onDelete: 'set null' }),
    quantity: integer('quantity').default(1).notNull(),
    action: communityAssetTransferActionEnum('action').notNull(),
    referenceType: varchar('reference_type', { length: 80 }),
    referenceId: text('reference_id'),
    idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    communityAssetTransferLogsGrantIdx: index('community_asset_transfer_logs_grant_idx').on(
      t.grantId,
    ),
    communityAssetTransferLogsDefinitionIdx: index(
      'community_asset_transfer_logs_definition_idx',
    ).on(t.definitionId),
    communityAssetTransferLogsIdempotencyUnique: unique(
      'community_asset_transfer_logs_idempotency_unique',
    ).on(t.idempotencyKey),
  }),
)

export const economyTips = pgTable(
  'economy_tips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    currencyCode: varchar('currency_code', { length: 40 }).default('shrimp_coin').notNull(),
    contextKind: varchar('context_kind', { length: 80 }),
    contextId: text('context_id'),
    message: text('message'),
    platformFee: integer('platform_fee').default(0).notNull(),
    sellerNet: integer('seller_net').default(0).notNull(),
    status: economyTipStatusEnum('status').default('succeeded').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    economyTipsSenderIdempotencyUnique: unique('economy_tips_sender_idempotency_unique').on(
      t.senderUserId,
      t.idempotencyKey,
    ),
    economyTipsRecipientIdx: index('economy_tips_recipient_idx').on(t.recipientUserId),
    economyTipsContextIdx: index('economy_tips_context_idx').on(t.contextKind, t.contextId),
  }),
)

export const economyGifts = pgTable(
  'economy_gifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message'),
    status: economyGiftStatusEnum('status').default('succeeded').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    economyGiftsSenderIdempotencyUnique: unique('economy_gifts_sender_idempotency_unique').on(
      t.senderUserId,
      t.idempotencyKey,
    ),
    economyGiftsRecipientIdx: index('economy_gifts_recipient_idx').on(t.recipientUserId),
  }),
)

export const economyGiftItems = pgTable(
  'economy_gift_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    giftId: uuid('gift_id')
      .notNull()
      .references(() => economyGifts.id, { onDelete: 'cascade' }),
    itemKind: economyGiftItemKindEnum('item_kind').notNull(),
    assetGrantId: uuid('asset_grant_id').references(() => communityAssetGrants.id, {
      onDelete: 'set null',
    }),
    assetDefinitionId: uuid('asset_definition_id').references(() => communityAssetDefinitions.id, {
      onDelete: 'set null',
    }),
    quantity: integer('quantity').default(1).notNull(),
    currencyCode: varchar('currency_code', { length: 40 }),
    amount: integer('amount'),
    status: economyGiftStatusEnum('status').default('succeeded').notNull(),
  },
  (t) => ({
    economyGiftItemsGiftIdx: index('economy_gift_items_gift_idx').on(t.giftId),
  }),
)

export const settlementAccounts = pgTable(
  'settlement_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerKind: settlementOwnerKindEnum('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    currencyCode: varchar('currency_code', { length: 40 }).default('shrimp_coin').notNull(),
    availableBalance: integer('available_balance').default(0).notNull(),
    pendingBalance: integer('pending_balance').default(0).notNull(),
    heldBalance: integer('held_balance').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    settlementAccountsOwnerUnique: unique('settlement_accounts_owner_unique').on(
      t.ownerKind,
      t.ownerId,
      t.currencyCode,
    ),
  }),
)

export const settlementLines = pgTable(
  'settlement_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerUserId: uuid('seller_user_id').references(() => users.id, { onDelete: 'set null' }),
    shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'set null' }),
    sourceType: varchar('source_type', { length: 80 }).notNull(),
    sourceId: text('source_id').notNull(),
    grossAmount: integer('gross_amount').notNull(),
    platformFee: integer('platform_fee').default(0).notNull(),
    refundAmount: integer('refund_amount').default(0).notNull(),
    heldAmount: integer('held_amount').default(0).notNull(),
    netAmount: integer('net_amount').notNull(),
    status: settlementLineStatusEnum('status').default('pending').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    settlementLinesSellerStatusIdx: index('settlement_lines_seller_status_idx').on(
      t.sellerUserId,
      t.status,
    ),
    settlementLinesSourceIdx: index('settlement_lines_source_idx').on(t.sourceType, t.sourceId),
  }),
)
