# Shadow 社区经济第一期技术实现规划

版本：2026-05-10

关联方案：[shadow-community-economy-implementation-plan-v2.md](../decisions/shadow-community-economy-implementation-plan-v2.md)

## 0. 查漏补缺记录

2026-05-10 第一轮实现后复查结论：

- 普通商城下单、Offer 购买、权益取消退款、不可抗力退款、充值 create-intent 都进入 `EconomyPolicyService` / `EconomyAuditService` 覆盖范围。
- `WalletDao` 不再暴露 `credit`、`debit`、`updateBalance`、`addTransaction` 这类直接余额写入口；直接余额更新只允许在 `LedgerService` 内部。
- `scripts/check-security-pr.mjs` 已扩展为扫描 DAO 和 service 中的 `wallets.balance` 直接算术与 `db.update(wallets)`。
- 充值 create-intent 必须传 `idempotencyKey`，服务端用同一 key 约束本地幂等记录和 Stripe PaymentIntent idempotency。
- TS SDK、Python SDK、web 充值弹窗、web/mobile 普通商城下单已同步 idempotency 请求体。
- Docker Compose 干净数据库已验证迁移、关键后端测试和安全检查。

仍保留到第二期处理：

- 完整 `settlement_*` 表、结算批次、结算失败重试。
- 社区资产定义、资产 grant、资产赠送和资产展示。
- 打赏、赠送公开 API 和 web/mobile 用户界面。
- 付费文件 query token 的 header/cookie 化。
- 续费事务边界/outbox 化。

## 1. 第一期范围

这里的“第一期”指第一个可落地工程包，不等同于原方案里的 `P1`。实施顺序应先完成原方案 `P0：交易安全与账务地基`，再开放 `P1：社区经济核心闭环` 的用户可见功能。

第一期交付目标：

- 收敛所有虾币余额写入到 `LedgerService`。
- 为充值、购买、履约、退款、管理员调整建立幂等、审计和 provider event 记录。
- 修复已确认的交易安全缺口：普通商城下单直接扣余额、SKU 更新删除重建、履约任务非原子 claim、thread 消息绕过商品卡片标准化。
- 建立 `EconomyPolicyService` 和最小经济审计表，为后续打赏、赠送、社区资产、结算打基础。
- 只做必要的 web/mobile 兼容更新，不在第一期推出完整打赏和赠送 UI。

非目标：

- 不做多币种。
- 不做开放市场。
- 不做复杂优惠、争议工作台、创作者中心。
- 不重写现有 shop/order/entitlement/paid-file 能力。

## 2. 当前代码调研结论

### 2.1 可复用能力

- `apps/server/src/db/schema/shops.ts` 已有 `shops`、`products`、`skus`、`commerce_offers`、`commerce_deliverables`、`orders`、`order_items`、`wallets`、`wallet_transactions`、`entitlements`、`paid_file_grants`、`commerce_fulfillment_jobs`、`commerce_idempotency_keys`。
- `apps/server/src/services/ledger.service.ts` 已提供 `credit`、`debit`、`settleReservedMicros`，充值和部分虚拟权益购买已经复用它。
- `apps/server/src/services/entitlement-purchase.service.ts` 已有 Offer 购买幂等、订单、扣款、权益发放、履约 job 创建。
- `apps/server/src/services/commerce-card.service.ts` 已能把 channel/DM 的商品 metadata 标准化为服务端生成的 snapshot。
- `apps/server/src/security/actor.ts` 和 auth middleware 已经能输出显式 `Actor`，可直接作为经济权限层输入。
- TS SDK、Python SDK 已覆盖当前 commerce、wallet、recharge、entitlement API。
- web 和 mobile 都已有 shop、chat commerce card、wallet 查询、基础购买入口。

### 2.2 第一期开工前必须修的缺口

- `OrderService.createOrder` 仍直接 `db.update(wallets)` 并插入 `walletTransactions`，绕过 `LedgerService`。
- `OrderService.updateOrderStatus` 完成订单时结算失败会被吞掉，没有 `settlementStatus` 或可重试记录。
- `ProductService.updateProduct` 更新 SKU 时会删除商品全部 SKU 再重建，历史订单、商品卡片和库存引用会断。
- `ProductService.deleteProduct` 是物理删除，应优先改为 `status='archived'`。
- `CommerceFulfillmentService.processJob` 是先 select 再 update，多 worker 下可能重复交付。
- `commerce_deliverables.kind` 目前只有 `paid_file | message | external`，不能承载 `entitlement | community_asset | currency`。
- `message.schema.ts` 的 metadata 仍 `.passthrough()`，DM route 也使用 `z.record(z.unknown())`。
- thread 消息入口没有调用 `CommerceCardService.inferMessageMetadata`，会绕过 channel/DM 的商品卡片标准化。
- 充值 `create-intent` 接受客户端 `currency`，`STRIPE_WEBHOOK_SECRET` 默认空字符串，且没有 `paymentProviderEvents` 去重表。
- Stripe dispute 只更新 payment order 并打日志，没有风险案例或冻结/审计记录。
- 现有 `PolicyService` 偏 server/channel 权限，没有经济动作、数据分级、PAT 经济写限制。
- `scripts/check-security-pr.mjs` 只拦截 `walletDao.credit/debit/updateBalance`，还没有扫描直接 `db.update(wallets)`。

## 3. 数据模型计划

第一期新增迁移建议命名为 `0058_community_economy_foundation.sql`，并同步 Drizzle schema。

### 3.1 经济审计

新增 `economy_audit_events`：

- `id`
- `actor_kind`
- `actor_id`
- `actor_token_kind`
- `action`
- `resource_kind`
- `resource_id`
- `scope_kind`
- `scope_id`
- `idempotency_key`
- `request_hash`
- `result`
- `error_code`
- `ip_hash`
- `user_agent_hash`
- `metadata`
- `created_at`

第一期覆盖：充值 create-intent、Stripe webhook、普通商城下单、Offer 购买、退款、履约 job、管理员 grant/adjustment。

### 3.2 支付 provider event

新增 `payment_provider_events`：

- `id`
- `provider`，第一期固定 `stripe`
- `provider_event_id`，唯一
- `event_type`
- `payload_hash`
- `payment_order_id`
- `status`：`received | processing | processed | failed | ignored`
- `processed_at`
- `error_code`
- `created_at`
- `updated_at`

webhook 处理流程先写 event，再基于 `provider_event_id` 幂等处理。

### 3.3 风险案例

新增 `risk_cases`：

- `id`
- `user_id`
- `resource_type`
- `resource_id`
- `kind`：`payment_dispute | chargeback | economy_restricted | fraud_signal`
- `status`：`open | reviewing | resolved | dismissed`
- `severity`
- `metadata`
- `created_at`
- `updated_at`

第一期只写入 dispute/chargeback，不做完整后台。

### 3.4 履约记录

新增 `commerce_fulfillment_records`：

- `id`
- `job_id`
- `order_id`
- `order_item_id`
- `deliverable_id`
- `recipient_user_id`
- `idempotency_key`
- `result_type`
- `result_id`
- `status`
- `created_at`

唯一约束：

- `(order_item_id, deliverable_id, recipient_user_id)`
- `(idempotency_key)`

### 3.5 用户经济状态

新增独立 enum 和字段，不复用在线状态：

- `user_economy_status`: `normal | economy_restricted | frozen | banned`
- `users.economy_status default 'normal'`

`EconomyPolicyService` 在转出类动作中检查该字段。

### 3.6 后续 P1 预留

第一期可以只加 enum 和服务接口，不必开放 route：

- `commerce_deliverable_kind` 增加 `entitlement`、`community_asset`、`currency`。
- 如迁移风险可控，新增 `community_asset_definitions`、`community_asset_grants`、`community_asset_locks`、`community_asset_transfer_logs`，但不接 UI。
- `settlement_*` 表建议放到第二个工程包，第一期先保留订单结算审计和失败可追踪状态。

## 4. 服务层设计

### 4.1 EconomyPolicyService

新增 `apps/server/src/services/economy-policy.service.ts`。

输入：

- `actor`
- `resource: { kind, id }`
- `action`
- `scope`
- `dataClass`
- `amount?`

第一期规则：

- `actor.kind === 'pat'` 默认拒绝经济写动作。
- PAT 只有显式 `economy:*` scope 才能访问对应经济能力。
- OAuth 同样需要显式经济 scope。
- 普通用户可读自己的 wallet/order/entitlement。
- 普通用户可购买、退款自己订单、发起充值。
- `economy_restricted`、`frozen`、`banned` 用户不能转出虾币、购买、赠送、打赏。
- 管理员调整必须要求 platform admin capability，不只看 `isAdmin`。

### 4.2 EconomyAuditService

新增 `apps/server/src/services/economy-audit.service.ts`。

职责：

- 统一写 `economy_audit_events`。
- 对 request body 只写 hash 和安全摘要。
- 对 IP、User-Agent 写 hash，不存原值。
- 被业务 service 调用失败时，不应吞掉业务事务内的审计失败；审计缺失等同经济写失败。

### 4.3 EconomyIdempotencyService

先复用 `commerce_idempotency_keys`，服务名抽象为 `EconomyIdempotencyService`。

第一期动作：

- `shop.order.create`
- `commerce.offer.purchase`
- `recharge.confirm`
- `wallet.refund`
- `admin.wallet.adjust`
- `fulfillment.process`

行为：

- scope 为 `actorUserId + action + key`。
- completed 时保存安全响应摘要。
- in-progress 返回 `409`。
- failed 可在有限时间后重试，需记录 error。

### 4.4 LedgerService 收敛

扩展 `LedgerService` 入参：

- `actor`
- `action`
- `currencyCode`
- `idempotencyKey`
- `referenceType`
- `referenceId`
- `metadata`

第一期仍保留 `wallets.balance` 和 `wallet_transactions` 作为兼容层，不急于拆 `ledger_transactions/ledger_entries`。但所有余额变更必须从 `LedgerService` 进入。

改造点：

- `OrderService.createOrder` 使用 `LedgerService.debit`。
- `OrderService.cancelOrder` 使用 `LedgerService.credit` 并接幂等。
- `EntitlementPurchaseService` 保留 `LedgerService`，增加 policy/audit/idempotency 统一框架。
- 结算 credit 不能静默失败，至少写审计和失败状态。
- `scripts/check-security-pr.mjs` 扫描 `db.update(wallets)`、`wallets.balance +`、`wallets.balance -`，允许名单仅 `ledger.service.ts` 和测试。

### 4.5 ProductService SKU 稳定化

改造 `updateProduct`：

- 有 `sku.id`：校验属于当前 product 后 update。
- 无 `sku.id`：insert。
- 请求里未出现的旧 SKU：`isActive=false`，不删除。
- 已有关联订单的 product 删除改为 `status='archived'`。
- 订单项继续保存当前 snapshot。

### 4.6 CommerceFulfillmentService 原子化

改造 `processJob`：

- 单条 `update ... where id=? and status in ('pending','failed') returning` claim。
- claim 失败直接返回当前 job。
- 每个 deliverable 写 `commerce_fulfillment_records`。
- paid file/message 发送前检查 fulfillment record 唯一约束。
- 失败重试只重试未成功记录的 deliverable。

### 4.7 消息 metadata 边界

改造点：

- 抽出共享 `messageMetadataSchema`，channel、DM、thread、WS 共用。
- 移除经济相关 metadata 的 `.passthrough()`。
- 保留非经济扩展放入 `custom`，限制 key 数、深度、总字节。
- `thread` POST 消息入口调用 `CommerceCardService.inferMessageMetadata`。
- `CommerceCardService.normalizeMessageMetadata` 继续只信任 `offerId` 或 `productId + skuId`，snapshot/purchase 永远服务端生成。

## 5. API 和 SDK 影响

### 5.1 后端 API

第一期不新增公开打赏/赠送 API，只调整现有经济写接口：

- `POST /api/servers/:serverId/shop/orders` 增加 `idempotencyKey`。
- `POST /api/v1/recharge/create-intent` 移除客户端任意 `currency`，或只接受白名单币种。
- `POST /api/v1/recharge/confirm` 增加幂等保护。
- `POST /api/commerce/offers/:offerId/purchase` 保持现有 `idempotencyKey`，补 policy/audit。
- 管理员 wallet grant/adjustment 如已有入口，必须补 policy/audit/idempotency；如没有，先不新增。

兼容策略：

- web/mobile 当前普通商城下单没有传 `idempotencyKey`。第一期可先让服务端在缺失时返回 400，同时同步 web/mobile/SDK；不建议服务端自动生成，因为重试无法幂等。
- TS SDK、Python SDK 的 `createOrder`/`purchase` 类型需要增加 `idempotencyKey`。
- API 文档同步 `website/docs/en/platform` 和 `website/docs/zh/platform`。

### 5.2 Web

必须同步：

- 普通购物车 checkout 生成稳定 idempotency key，并在请求失败可重试时复用同一 key。
- 商品详情直接购买同样传 key。
- 商品管理 SKU 编辑要保留已有 SKU id。
- 所有新增 copy 使用 `apps/web/src/lib/locales/*.json`。

### 5.3 Mobile

必须同步：

- `apps/mobile/app/(main)/servers/[serverSlug]/shop.tsx` checkout 请求增加 idempotency key。
- chat commerce card 购买继续传 key，但需要区分 channel 与 DM purchase endpoint。
- shop-admin 当前创建商品 payload 与服务端 `createProductSchema` 不完全一致，第一期只做必要兼容修复，完整移动端创作者商品管理放到后续。
- 所有新增 copy 使用 `apps/mobile/src/i18n/locales/*.json`。

### 5.4 SDK

TS SDK：

- `ShadowClient.createOrder` 参数加入 `idempotencyKey`。
- `ShadowOrder` 如新增状态字段，需要类型同步。
- 新增 provider/risk/audit 不暴露给普通 SDK，除非后续开放管理员接口。

Python SDK：

- `purchase_shop_product`、`purchase_commerce_offer` 已有 key。
- `create_order` 增加 `idempotency_key`。
- 类型字段保持 snake_case 映射。

## 6. 实施顺序

### Step 1：数据模型和容器注册

文件：

- `apps/server/src/db/schema/shops.ts`
- `apps/server/src/db/schema/recharge.ts`
- `apps/server/src/db/schema/users.ts`
- `apps/server/src/db/schema/index.ts`
- `apps/server/src/db/migrations/0058_community_economy_foundation.sql`
- `apps/server/src/container.ts`

产出：

- 新表和 enum。
- 新服务注册。
- 迁移检查通过。

### Step 2：经济 policy/audit/idempotency 框架

文件：

- `apps/server/src/services/economy-policy.service.ts`
- `apps/server/src/services/economy-audit.service.ts`
- `apps/server/src/services/economy-idempotency.service.ts`
- `apps/server/src/security/actor.ts` 如需补 system/provider actor helper。

产出：

- 购买、充值、退款、履约可调用统一 policy/audit/idempotency。
- 单元测试覆盖 PAT/OAuth/风险状态拒绝。

### Step 3：账务入口收敛

文件：

- `apps/server/src/services/ledger.service.ts`
- `apps/server/src/services/order.service.ts`
- `apps/server/src/services/wallet.service.ts`
- `apps/server/src/dao/wallet.dao.ts`
- `scripts/check-security-pr.mjs`

产出：

- 普通商城下单、取消退款、结算全部走 `LedgerService`。
- 安全脚本能拦截直接写 `wallets.balance`。
- 并发余额不足和重复请求测试通过。

### Step 4：充值加固

文件：

- `apps/server/src/lib/stripe.ts`
- `apps/server/src/handlers/recharge.handler.ts`
- `apps/server/src/handlers/stripe-webhook.handler.ts`
- `apps/server/src/services/recharge.service.ts`
- `apps/server/src/dao/recharge.dao.ts`

产出：

- production 空 webhook secret 启动失败。
- `SUPPORTED_STRIPE_CURRENCIES` 白名单。
- webhook event id 幂等。
- dispute 写 risk case 和 audit。

### Step 5：SKU 和履约稳定化

文件：

- `apps/server/src/services/product.service.ts`
- `apps/server/src/dao/product.dao.ts`
- `apps/server/src/services/commerce-fulfillment.service.ts`
- `apps/server/src/services/entitlement-purchase.service.ts`

产出：

- SKU update/upsert/soft deactivate。
- product archive 替代危险物理删除。
- fulfillment 原子 claim 和 record 去重。

### Step 6：metadata 边界

文件：

- `apps/server/src/validators/message.schema.ts`
- `apps/server/src/handlers/message.handler.ts`
- `apps/server/src/handlers/dm.handler.ts`
- `apps/server/src/ws/chat.gateway.ts`
- `apps/server/src/services/commerce-card.service.ts`

产出：

- channel/DM/thread/WS 入口统一 metadata 规则。
- 伪造 snapshot/price/purchase 不影响真实购买。
- custom metadata 有大小和结构限制。

### Step 7：客户端、SDK、文档同步

文件：

- `apps/web/src/components/shop/shop-cart.tsx`
- `apps/web/src/components/shop/order-confirm.tsx`
- `apps/web/src/components/shop/product-detail.tsx`
- `apps/mobile/app/(main)/servers/[serverSlug]/shop.tsx`
- `apps/mobile/src/components/chat/message-bubble.tsx`
- `packages/sdk/src/client.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk-python/shadowob_sdk/client.py`
- `packages/sdk-python/shadowob_sdk/types.py`
- `website/docs/en/platform`
- `website/docs/zh/platform`

产出：

- web/mobile 普通购买请求携带 idempotency key。
- SDK 类型和方法签名同步。
- 文档同步 API 变更。

## 7. 测试计划

### Unit

- `LedgerService`：credit/debit/idempotency/insufficient balance。
- `EconomyPolicyService`：PAT/OAuth/user/system actor、风险状态、scope。
- `EconomyAuditService`：写入字段、hash、不记录敏感 payload。
- `ProductService`：SKU update/upsert/soft deactivate。
- `CommerceFulfillmentService`：claim 失败、record 去重、重试不重复交付。
- metadata validator：snapshot/purchase 伪造、custom 限制、thread 标准化。

### Integration

- 普通商城订单：并发同 key 只扣一次、只建一个订单。
- Offer 购买：已有幂等路径补 policy/audit 后仍兼容。
- 充值 webhook：重复 event id 只入账一次。
- dispute：payment order 状态、risk case、audit 都写入。
- 退款：不超过可退金额，重复请求不重复退款。

### E2E

- web 购物车结账成功，wallet/order/products query 刷新。
- mobile 购物车结账成功，wallet/order/products query 刷新。
- channel 商品卡购买成功。
- DM 商品卡购买成功。
- thread 商品卡伪造 metadata 被拒或被重建。

### Security

- `pnpm check:security-pr`
- 新增测试覆盖直接 `db.update(wallets)` 扫描。
- PAT 无经济 scope 时不能下单、退款、grant。
- metadata 总大小、深度、字段数量限制。

## 8. 本地验证命令

按变更范围逐步跑：

```bash
pnpm biome format --write docs/development/community-economy-phase-1-technical-plan.md
pnpm check:security-pr
docker compose -f docker-compose.ci-tests.yml run --rm server pnpm test -- --runInBand apps/server/__tests__/commerce-entitlement-service.test.ts
docker compose -f docker-compose.ci-tests.yml run --rm server pnpm test -- --runInBand apps/server/__tests__/shop-e2e.test.ts
```

如果测试命令和当前 CI runner 不一致，以 `docker-compose.ci-tests.yml` 里的实际服务命令为准。

## 9. 风险和取舍

- 强制普通商城下单传 `idempotencyKey` 会影响 web/mobile/SDK，必须同 PR 同步。
- 第一期开 `community_asset_*` 表但不开放 UI 可以降低 P1 迁移压力，但会增加迁移审查成本；如果本期要压缩范围，可只加入 deliverable enum 和服务接口。
- `wallet_transactions` 继续作为兼容展示层，短期不是完整复式账本；真正 `ledger_transactions/ledger_entries` 可在第二期升级。
- 结算如果继续即时 credit，退款和 dispute 会更难处理；第一期至少要记录结算失败和审计，第二期再引入 `settlement_*`。
- metadata `.passthrough()` 移除可能影响未知机器人扩展，需要把非经济扩展迁移到受限 `custom`。

## 10. 第一期开工清单

1. 创建 `0058_community_economy_foundation` 迁移和 schema。
2. 新增 `EconomyPolicyService`、`EconomyAuditService`、`EconomyIdempotencyService`。
3. 改造普通商城下单和取消退款走 `LedgerService`。
4. 加固充值 currency/webhook/event/dispute。
5. 改 SKU 更新和 product 删除策略。
6. 改 fulfillment 原子 claim 和 record。
7. 收紧 message metadata，补 thread 入口标准化。
8. 同步 web/mobile/TS SDK/Python SDK/API 文档。
9. 跑安全检查、服务单测、集成测试、web/mobile E2E。
