# V1.0 数据库迁移文档

> **版本**: V1.0  
> **状态**: 设计阶段  
> **依赖**: 现有 rentals.ts schema

---

## 1. 新增表

### 1.1 用户钱包表 (user_wallets)

```typescript
// apps/server/src/db/schema/wallets.ts
import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const userWallets = pgTable('user_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(), // 一个用户一个钱包

  // 余额
  availableBalance: integer('available_balance').default(0).notNull(), // 可用余额（虾币）
  frozenBalance: integer('frozen_balance').default(0).notNull(),     // 冻结余额（虾币）

  // 累计统计
  totalDeposited: integer('total_deposited').default(0).notNull(),   // 累计充值
  totalWithdrawn: integer('total_withdrawn').default(0).notNull(),   // 累计提现
  totalSpent: integer('total_spent').default(0).notNull(),           // 累计消费
  totalEarned: integer('total_earned').default(0).notNull(),         // 累计收入

  // 支付信息（加密存储）
  paymentInfo: jsonb('payment_info').$type<{
    wechatPay?: { openid: string }
    alipay?: { userId: string }
    bankCard?: { last4: string; bankName: string }
  }>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 1.2 钱包交易记录表 (wallet_transactions)

```typescript
export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', [
  'deposit',        // 充值
  'withdrawal',     // 提现
  'payment',        // 支付（租赁）
  'refund',         // 退款
  'income',         // 收入（出租）
  'fee',            // 平台手续费
  'penalty',        // 违约金
  'bonus',          // 奖励/补贴
])

export const walletTransactionStatusEnum = pgEnum('wallet_transaction_status', [
  'pending',   // 处理中
  'completed', // 已完成
  'failed',    // 失败
  'cancelled', // 已取消
])

export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // 交易双方
  userId: uuid('user_id').notNull().references(() => users.id),
  
  // 交易信息
  type: walletTransactionTypeEnum('type').notNull(),
  status: walletTransactionStatusEnum('status').default('pending').notNull(),
  
  // 金额（虾币，正数表示收入，负数表示支出）
  amount: integer('amount').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  
  // 关联信息
  relatedContractId: uuid('related_contract_id').references(() => rentalContracts.id),
  relatedDemandId: uuid('related_demand_id').references(() => buddyDemands.id),
  externalOrderId: varchar('external_order_id', { length: 100 }), // 第三方支付订单号
  
  // 描述
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  
  // 时间
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 1.3 Buddy需求表 (buddy_demands)

```typescript
export const demandStatusEnum = pgEnum('demand_status', [
  'open',        // 开放中
  'matched',     // 已匹配
  'in_progress', // 进行中
  'completed',   // 已完成
  'cancelled',   // 已取消
  'expired',     // 已过期
])

export const demandTypeEnum = pgEnum('demand_type', [
  'data_processing',   // 数据处理
  'content_generation', // 内容生成
  'automation_script',  // 自动化脚本
  'consultation',       // 咨询
  'custom_development', // 定制开发
  'other',              // 其他
])

export const buddyDemands = pgTable('buddy_demands', {
  id: uuid('id').primaryKey().defaultRandom(),
  requesterId: uuid('requester_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  
  // 需求信息
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull(),
  demandType: demandTypeEnum('demand_type').notNull(),
  
  // 预算与时间
  budgetMin: integer('budget_min'), // 虾币
  budgetMax: integer('budget_max'), // 虾币
  deadline: timestamp('deadline', { withTimezone: true }),
  
  // 状态
  status: demandStatusEnum('status').default('open').notNull(),
  
  // 匹配信息
  matchedClawId: uuid('matched_claw_id').references(() => agents.id),
  matchedContractId: uuid('matched_contract_id').references(() => rentalContracts.id),
  matchedAt: timestamp('matched_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  // 标签与技能要求
  tags: jsonb('tags').$type<string[]>().default([]),
  requiredSkills: jsonb('required_skills').$type<string[]>().default([]),
  
  // 统计
  viewCount: integer('view_count').default(0).notNull(),
  bidCount: integer('bid_count').default(0).notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 1.4 Buddy接单竞标表 (buddy_demand_bids)

```typescript
export const bidStatusEnum = pgEnum('bid_status', [
  'pending',   // 待确认
  'accepted',  // 已接受
  'rejected',  // 已拒绝
  'expired',   // 已过期
  'cancelled', // 已取消
])

export const buddyDemandBids = pgTable('buddy_demand_bids', {
  id: uuid('id').primaryKey().defaultRandom(),
  demandId: uuid('demand_id')
    .notNull()
    .references(() => buddyDemands.id, { onDelete: 'cascade' }),
  clawId: uuid('claw_id')
    .notNull()
    .references(() => agents.id),
  bidderId: uuid('bidder_id')
    .notNull()
    .references(() => users.id),
  
  // 报价
  proposedPrice: integer('proposed_price').notNull(), // 虾币
  estimatedHours: integer('estimated_hours'), // 预估工时
  
  // 提案说明
  proposal: text('proposal'),
  
  // 状态
  status: bidStatusEnum('status').default('pending').notNull(),
  
  // 时间
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // 报价有效期
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 1.5 Claw归属权表 (claw_ownerships)

```typescript
export const clawOwnershipStatusEnum = pgEnum('claw_ownership_status', [
  'idle',         // 空闲
  'rented',       // 租赁中
  'maintenance',  // 维护中
  'suspended',    // 暂停
])

export const clawOwnerships = pgTable('claw_ownerships', {
  id: uuid('id').primaryKey().defaultRandom(),
  clawId: uuid('claw_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' })
    .unique(),
  
  // 归属信息
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  tenantId: uuid('tenant_id').references(() => users.id), // 当前租户
  
  // 状态
  status: clawOwnershipStatusEnum('status').default('idle').notNull(),
  
  // 当前租赁
  currentContractId: uuid('current_contract_id').references(() => rentalContracts.id),
  rentedAt: timestamp('rented_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  // 访问控制
  accessToken: varchar('access_token', { length: 255 }), // 租户访问令牌
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### 1.6 归属权变更日志表 (claw_ownership_logs)

```typescript
export const ownershipActionEnum = pgEnum('ownership_action', [
  'rent_start',    // 租赁开始
  'rent_end',      // 租赁结束
  'force_reclaim', // 强制收回
  'maintenance',   // 进入维护
  'resume',        // 恢复
])

export const clawOwnershipLogs = pgTable('claw_ownership_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clawId: uuid('claw_id').notNull().references(() => agents.id),
  
  // 变更信息
  action: ownershipActionEnum('action').notNull(),
  fromStatus: clawOwnershipStatusEnum('from_status').notNull(),
  toStatus: clawOwnershipStatusEnum('to_status').notNull(),
  
  //