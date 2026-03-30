# Stripe Recharge System - Technical Decision Document

**Status:** Ready for Implementation  
**Author:** Shadow Dev Team  
**Date:** 2026-03-30

---

## 1. Overview

This document outlines the technical decisions for implementing the Stripe-based Shrimp Coin (🦐币) recharge system for Shadow (虾豆) platform.

## 2. Requirements Summary

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Unified recharge modal (Web/Desktop: centered, Mobile: half-screen) | P0 |
| 2 | 4 recharge tiers: 1000, 3000, 5000, Custom shrimp coins | P0 |
| 3 | Default selection: "Best Value" (3000) or "Last Recharge" | P0 |
| 4 | Display real currency cost with exchange rate (e.g., $9.99 ≈ ¥72.00) | P0 |
| 5 | Embedded Stripe Elements (no full page redirect) | P0 |
| 6 | Real-time validation with card type auto-detection | P0 |
| 7 | Anti-double-click, loading states, 3D Secure support | P0 |
| 8 | "Unboxing" success animation with balance rolling | P0 |
| 9 | System notification on successful recharge | P0 |
| 10 | Recharge entry in user profile | P0 |
| 11 | Auto-trigger on insufficient balance | P0 |
| 12 | Transaction history page | P0 |
| 13 | Exchange rate: 1 USD = 100 shrimp coins, min $1 | P0 |
| 14 | Dual ledger: payment_orders + wallet_transactions | P0 |
| 15 | Idempotency: payment_intent_id binds 1:1 to order | P0 |
| 16 | Daily reconciliation cron job with email alert | P1 |
| 17 | Apple Pay / Google Pay priority | P1 |
| 18 | Web/App/Desktop + iOS/macOS IAP fallback | P0 |
| 19 | Legal compliance: ToS + Virtual Currency Agreement + Privacy Policy | P0 |
| 20 | Refund policy disclosure | P0 |

## 3. Technical Decisions

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Layer                                   │
├─────────────┬─────────────┬─────────────┬─────────────────────────────────┤
│    Web      │   Desktop   │    Mobile   │      iOS/macOS (IAP fallback)  │
│  (React)    │  (Electron) │(React Native│                                 │
└──────┬──────┴──────┬──────┴──────┬──────┴─────────────────────────────────┘
       │             │             │
       ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Stripe Payment Element                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Card Input     │  │ Apple Pay       │  │ Google Pay              │  │
│  │  (Embedded)     │  │ (Express)       │  │ (Express)               │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Server (Hono)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Recharge API    │  │ Webhook Handler │  │ IAP Verification        │  │
│  │ /api/v1/recharge│  │ /webhooks/stripe│  │ /api/v1/iap/verify      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
       │                           │
       ▼                           ▼
┌─────────────────┐      ┌─────────────────┐
│   PostgreSQL    │      │   Stripe API    │
│  (Dual Ledger)  │      │                 │
└─────────────────┘      └─────────────────┘
```

### 3.2 Database Schema Design

#### New Tables

**payment_orders** - Stripe payment tracking
```typescript
export const paymentOrderStatusEnum = pgEnum('payment_order_status', [
  'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'disputed'
])

export const paymentOrders = pgTable('payment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Stripe-specific fields
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }).unique(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  
  // Order info
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orderNo: varchar('order_no', { length: 32 }).notNull().unique(),
  
  // Amounts
  shrimpCoinAmount: integer('shrimp_coin_amount').notNull(), // 1000, 3000, 5000, etc.
  usdAmount: integer('usd_amount').notNull(), // in cents (e.g., 999 for $9.99)
  localCurrencyAmount: integer('local_currency_amount'), // for display
  localCurrency: varchar('local_currency', { length: 3 }), // CNY, EUR, etc.
  
  // Status
  status: paymentOrderStatusEnum('status').default('pending').notNull(),
  
  // 3D Secure / async payment tracking
  requiresAction: boolean('requires_action').default(false),
  actionType: varchar('action_type', { length: 50 }), // '3d_secure', etc.
  
  // Timestamps
  paidAt: timestamp('paid_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

**iap_orders** - iOS/macOS IAP tracking
```typescript
export const iapOrderStatusEnum = pgEnum('iap_order_status', [
  'pending', 'verified', 'succeeded', 'failed', 'refunded'
])

export const iapOrders = pgTable('iap_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Apple-specific fields
  transactionId: varchar('transaction_id', { length: 255 }).notNull().unique(),
  originalTransactionId: varchar('original_transaction_id', { length: 255 }),
  productId: varchar('product_id', { length: 255 }).notNull(), // com.shadow.coins.1000
  
  // Order info
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orderNo: varchar('order_no', { length: 32 }).notNull().unique(),
  
  // Amounts
  shrimpCoinAmount: integer('shrimp_coin_amount').notNull(),
  
  // Status
  status: iapOrderStatusEnum('status').default('pending').notNull(),
  
  // Receipt data (for server-side verification)
  receiptData: text('receipt_data'),
  
  // Timestamps
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

**Extended wallet_transactions**
```typescript
export const walletTxSourceEnum = pgEnum('wallet_tx_source', [
  'stripe',      // Stripe payment
  'iap',         // In-App Purchase
  'task',        // Task completion
  'rental',      // Rental income
  'refund',      // Refund
  'admin',       // Admin adjustment
])

// Add columns to existing wallet_transactions:
// source: walletTxSourceEnum('source').default('stripe').notNull()
// sourceOrderId: uuid('source_order_id') // references payment_orders or iap_orders
```

### 3.3 API Design

#### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/recharge/create-intent | Create PaymentIntent |
| GET | /api/v1/recharge/config | Get recharge tiers & exchange rates |
| GET | /api/v1/recharge/history | Get user's recharge history |
| POST | /api/v1/recharge/confirm | Confirm payment (after 3D Secure) |
| POST | /webhooks/stripe | Stripe webhook endpoint |
| POST | /api/v1/iap/verify | Verify IAP receipt |

#### Request/Response Examples

**Create PaymentIntent:**
```typescript
// POST /api/v1/recharge/create-intent
// Request
{
  "tier": "3000", // "1000" | "3000" | "5000" | "custom"
  "customAmount": 0, // only for "custom" tier
  "currency": "usd"
}

// Response
{
  "clientSecret": "pi_xxx_secret_yyy",
  "paymentIntentId": "pi_xxx",
  "orderNo": "RC-20250330-001",
  "amount": {
    "shrimpCoins": 3000,
    "usdCents": 2999,
    "localCurrency": "CNY",
    "localAmount": 21700 // in cents for precision
  }
}
```

### 3.4 Recharge Tier Pricing

| Tier | Shrimp Coins | USD | CNY (approx) |
|------|--------------|-----|--------------|
| Starter | 1,000 | $10.00 | ~¥72.00 |
| Best Value | 3,000 | $29.99 | ~¥216.00 |
| Premium | 5,000 | $49.99 | ~¥360.00 |
| Custom | 100-100,000 | $1.00-$1000.00 | Dynamic |

### 3.5 Webhook Events Handling

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Credit wallet, send notification |
| `payment_intent.payment_failed` | Mark order failed, log reason |
| `payment_intent.requires_action` | Handle 3D Secure, notify client |
| `payment_intent.canceled` | Mark order cancelled |
| `charge.dispute.created` | Flag order, alert admin |

### 3.6 Security Considerations

1. **Webhook Signature Verification**: Verify `Stripe-Signature` header
2. **Idempotency Keys**: Use Stripe's idempotency for all requests
3. **Rate Limiting**: 10 requests/minute per user for create-intent
4. **Amount Validation**: Server-side validation of custom amounts
5. **CSRF Protection**: For all recharge endpoints

### 3.7 iOS/macOS IAP Implementation

Since iOS/macOS requires IAP for digital goods, we use a hybrid approach:

```
Web/Desktop/Mobile (Android) → Stripe
iOS/macOS Native App → Apple IAP → Server Verification
```

**IAP Product IDs:**
- `com.shadow.coins.1000` - 1,000 shrimp coins
- `com.shadow.coins.3000` - 3,000 shrimp coins
- `com.shadow.coins.5000` - 5,000 shrimp coins
- `com.shadow.coins.custom` - Custom amount (configured in App Store)

## 4. Open Questions / Pending Decisions

### 4.1 Technical Questions for Review

**Question 1: Exchange Rate Source** ✅ **DECIDED: B**
- **Options:**
  - A. OpenExchangeRates API - 需要额外 API key，汇率较准
  - **B. Stripe Adaptive Pricing - Stripe 自动处理，最简单** ← SELECTED
  - C. 手动配置 - 每天更新一次汇率表
- **Decision:** 使用 Stripe Adaptive Pricing，自动处理多货币转换

**Question 2: Custom Amount Range** ✅ **DECIDED: D**
- **Options:**
  - A. 100 - 10,000 shrimp coins ($1 - $100)
  - B. 100 - 50,000 shrimp coins ($1 - $500)
  - C. 100 - 100,000 shrimp coins ($1 - $1000)
  - **D. No limit** ← SELECTED
- **Decision:** 自定义金额无上限，后端做风控校验

**Question 3: Apple Pay / Google Pay Implementation** ✅ **DECIDED: A**
- **Options:**
  - **A. Express Checkout Element - 独立组件，置顶显示** ← SELECTED
  - B. Payment Element built-in - 内嵌在 Payment Element 中
- **Decision:** 使用 Express Checkout Element，置顶显示 Apple Pay / Google Pay

**Question 4: Webhook Endpoint Path** ✅ **DECIDED: B**
- **Options:**
  - A. `/webhooks/stripe` - 简洁，符合 REST 惯例
  - **B. `/api/v1/webhooks/stripe` - 带版本号，与现有 API 一致** ← SELECTED
- **Decision:** 使用 `/api/v1/webhooks/stripe`，与现有 API 版本规范保持一致

**Question 5: Reconciliation Schedule** ✅ **DECIDED: A**
- **Options:**
  - **A. Daily at 2:00 AM - 低峰期，适合日对账** ← SELECTED
  - B. Hourly - 更频繁，及时发现问题
  - C. Real-time - 每笔支付后立即对账
- **Decision:** 每天凌晨 2:00 执行对账任务

**Question 6: Email Service for Alerts** ✅ **DECIDED: C**
- **Options:**
  - A. SendGrid - 专业邮件服务，送达率高
  - B. AWS SES - 成本低，与 AWS 生态集成
  - **C. Existing provider - 复用现有邮件服务** ← SELECTED
- **Decision:** 复用项目现有邮件服务（需在实现时确认具体服务）

**Question 7: Notification Channel for Recharge Success** ✅ **DECIDED: C**
- **Options:**
  - A. WebSocket only - 仅实时推送
  - B. Push only - 仅移动端推送
  - **C. Both WebSocket + Push - 双通道确保送达** ← SELECTED
- **Decision:** WebSocket + Push 双通道通知，确保用户无论是否在当前页面都能收到到账通知

**Question 8: Animation Library for Success Effect** ✅ **DECIDED: A**
- **Options:**
  - **A. Framer Motion - 项目已有，React 友好** ← SELECTED
  - B. Lottie - 复杂动画，需要设计提供 JSON
  - C. CSS animations - 最轻量，但效果有限
- **Decision:** 使用 Framer Motion 实现余额滚动动画和开箱效果

**Question 9: Test Mode Strategy** ✅ **DECIDED: C**
- **Options:**
  - A. Stripe test mode only - 使用 Stripe 测试密钥
  - B. Separate test environment - 独立部署测试环境
  - **C. Both - 本地开发用 test mode，CI 用独立环境** ← SELECTED
- **Decision:** 本地开发使用 Stripe test mode，CI/CD 使用独立测试环境

**Question 10: Refund Policy** ✅ **DECIDED: A**
- **Options:**
  - **A. 0 days - 明确不可退款** ← SELECTED
  - B. 7 days - 7天内可申请
  - C. 14 days - 14天内可申请
- **Decision:** 虚拟货币一经充值不可提现或退款（除非当地法律强制要求）

### 4.2 Business Questions ✅ ALL DECIDED

**Question 1: Stripe Account Region** ✅ **DECIDED: Hong Kong**
- Stripe 账户注册于香港
- 支持香港地区支付方式，符合亚太区业务需求

**Question 2: Supported Currencies** ✅ **DECIDED: Multi-currency**
- 支持多货币支付
- 使用 Stripe Adaptive Pricing 自动转换显示价格

**Question 3: IAP Pricing Strategy** ✅ **DECIDED: Match Stripe**
- IAP 定价与 Stripe 保持一致
- 确保跨平台价格统一，避免用户困惑

**Question 4: Legal Document URLs** ✅ **DECIDED: TBD**
- 服务条款、虚拟货币协议、隐私政策链接待补充
- **Action:** 需在实现前提供具体 URL

**Question 5: Customer Support Contact** ✅ **DECIDED: yeejonexyq@gmail.com**
- 支付问题联系邮箱：yeejonexyq@gmail.com
- 将显示在支付页面和确认邮件中

## 5. Implementation Phases

### Phase 1: Core Stripe Integration (Week 1-2)
- [ ] Database schema migration
- [ ] Backend API endpoints
- [ ] Stripe webhook handler
- [ ] Basic recharge modal (Web)

### Phase 2: Enhanced UX (Week 3)
- [ ] Real-time validation
- [ ] Apple Pay / Google Pay
- [ ] Success animation
- [ ] Transaction history

### Phase 3: Multi-Platform (Week 4)
- [ ] Desktop (Electron)
- [ ] Mobile (React Native)
- [ ] iOS/macOS IAP

### Phase 4: Operations (Week 5)
- [ ] Reconciliation cron
- [ ] Email alerts
- [ ] Admin dashboard
- [ ] Documentation

## 6. References

- [Stripe Payment Element](https://docs.stripe.com/payments/payment-element)
- [Stripe Checkout Sessions](https://docs.stripe.com/payments/checkout)
- [Stripe Webhooks](https://docs.stripe.com/webhooks)
- [Apple IAP Documentation](https://developer.apple.com/in-app-purchase/)
- [Shadow Architecture](../ARCHITECTURE.md)
- [Shadow Database Schema](../../apps/server/src/db/schema/)

---

**Next Steps:**
1. Review and confirm technical decisions (especially Section 4)
2. Approve database schema design
3. Finalize pricing tiers and exchange rate strategy
4. Begin Phase 1 implementation