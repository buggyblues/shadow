# Shadow 社区经济第二期技术实现规划

版本：2026-05-10

关联：

- [shadow-community-economy-implementation-plan-v2.md](../decisions/shadow-community-economy-implementation-plan-v2.md)
- [community-economy-phase-1-technical-plan.md](./community-economy-phase-1-technical-plan.md)

## 1. 第二期范围

第二期对应原方案 `P1：社区经济核心闭环` 的第一个用户可见工程包。目标不是开放市场，而是在第一期安全底座上形成单币种虾币的购买、打赏、赠送、资产发放、基础结算和查询闭环。

交付目标：

- 社区资产可以被定义、发放、展示、锁定、赠送和撤销。
- 商品 deliverable 可以发放 `entitlement`、`community_asset`、`currency`，并保留 paid file/message 能力。
- 用户可以对用户、消息、Buddy、商品内容发起虾币打赏。
- 用户可以赠送可赠送资产和少量虾币。
- 创作者/卖家的收入进入可查询 settlement line，支持即时结算或 T+N 配置。
- web 和 mobile 都具备资产列表、打赏入口、赠送入口、创作者商品发放状态展示。

非目标：

- 不做用户间自由挂单交易市场。
- 不做多币种兑换。
- 不做复杂优惠券、竞拍、订金、分账链路。
- 不做完整人工风控后台，只落表、冻结和基础查询。

## 2. 第一期开工基线

可复用能力：

- `LedgerService` 已经是余额写入唯一入口。
- `EconomyPolicyService` 已覆盖 user/PAT/OAuth/agent/system actor 的经济写权限。
- `EconomyIdempotencyService` 已复用 `commerce_idempotency_keys`。
- `EconomyAuditService` 已有经济审计表。
- `payment_provider_events`、`risk_cases`、`commerce_fulfillment_records` 已存在。
- `commerce_deliverables.kind` 已预留 `entitlement`、`community_asset`、`currency`。
- web/mobile 商品购买入口已会传 `idempotencyKey`。

第二期开工前必须保持：

- `pnpm check:security-pr` 通过。
- 任何公开 API 的经济写动作都必须声明 actor、resource、action、scope、data class。
- web/mobile UI copy 走 i18n。
- API 变更同步 API docs、TS SDK、Python SDK。

## 3. 数据模型计划

建议新增迁移 `0059_community_assets_and_settlement.sql`。

### 3.1 社区资产

新增 `community_asset_definitions`：

- `id`
- `issuer_kind`: `platform | server | user | shop`
- `issuer_id`
- `asset_type`: `badge | gift | coupon | service_ticket | collectible | content_pass | reward`
- `name`
- `description`
- `image_url`
- `metadata`
- `giftable`
- `transferable`
- `consumable`
- `revocable`
- `expires_after_days`
- `status`: `draft | active | paused | archived`
- `created_by`
- `created_at`
- `updated_at`

新增 `community_asset_grants`：

- `id`
- `definition_id`
- `owner_user_id`
- `source_kind`: `order | gift | tip | admin | campaign | fulfillment`
- `source_id`
- `quantity`
- `remaining_quantity`
- `status`: `active | locked | consumed | revoked | expired`
- `expires_at`
- `metadata`
- `created_at`
- `updated_at`

新增 `community_asset_transfer_logs`：

- `id`
- `definition_id`
- `grant_id`
- `from_user_id`
- `to_user_id`
- `quantity`
- `action`: `grant | gift | consume | revoke | expire | unlock`
- `reference_type`
- `reference_id`
- `idempotency_key`
- `created_at`

约束：

- `community_asset_grants.remaining_quantity >= 0`
- 同一 `grant_id` 同时只能有一个 active lock。
- `transfer_logs.idempotency_key` 唯一。

### 3.2 打赏

新增 `economy_tips`：

- `id`
- `sender_user_id`
- `recipient_user_id`
- `amount`
- `currency_code`
- `context_kind`: `message | dm_message | user | agent | product | server`
- `context_id`
- `message`
- `platform_fee`
- `seller_net`
- `status`: `succeeded | failed | reversed | held`
- `idempotency_key`
- `created_at`

唯一约束：

- `(sender_user_id, idempotency_key)`

### 3.3 赠送

新增 `economy_gifts`：

- `id`
- `sender_user_id`
- `recipient_user_id`
- `message`
- `status`: `succeeded | failed | reversed | held`
- `idempotency_key`
- `metadata`
- `created_at`
- `updated_at`

新增 `economy_gift_items`：

- `id`
- `gift_id`
- `item_kind`: `currency | asset`
- `asset_grant_id`
- `asset_definition_id`
- `quantity`
- `currency_code`
- `amount`
- `status`: `succeeded | failed | reversed`

### 3.4 结算

新增 `settlement_accounts`：

- `id`
- `owner_kind`: `user | shop | platform`
- `owner_id`
- `currency_code`
- `available_balance`
- `pending_balance`
- `held_balance`
- `created_at`
- `updated_at`

新增 `settlement_lines`：

- `id`
- `seller_user_id`
- `shop_id`
- `source_type`: `order | tip | gift | adjustment`
- `source_id`
- `gross_amount`
- `platform_fee`
- `refund_amount`
- `held_amount`
- `net_amount`
- `status`: `pending | available | settled | failed | held | reversed`
- `available_at`
- `settled_at`
- `error_code`
- `created_at`
- `updated_at`

## 4. 服务层设计

### 4.1 CommunityAssetService

职责：

- 创建和发布 asset definition。
- 发放 asset grant。
- 锁定/解锁 asset grant。
- 消费、撤销、过期资产。
- 查询当前用户资产列表和资产详情。

所有写操作必须：

- 调用 `EconomyPolicyService`。
- 使用 `EconomyIdempotencyService`。
- 写 `EconomyAuditService`。
- 写 `community_asset_transfer_logs`。

### 4.2 CommerceFulfillmentHandler 拆分

将 `CommerceFulfillmentService` 中 deliverable 处理拆成 handler registry：

- `PaidFileFulfillmentHandler`
- `MessageFulfillmentHandler`
- `EntitlementFulfillmentHandler`
- `CommunityAssetFulfillmentHandler`
- `CurrencyFulfillmentHandler`

规则：

- `processJob` 仍负责原子 claim、重试、`commerce_fulfillment_records`。
- handler 只处理单个 deliverable 的幂等发放。
- 一个 job 多 deliverable 时，已成功的 deliverable 不重复执行。

### 4.3 TipService

API：

```http
POST /api/economy/tips
```

请求：

```json
{
  "recipientUserId": "uuid",
  "amount": 100,
  "message": "谢谢你的内容",
  "context": { "kind": "message", "id": "uuid" },
  "idempotencyKey": "..."
}
```

规则：

- 不允许给自己打赏。
- 金额必须在单笔上下限内。
- 每日、每对象频率限制在 service 层执行。
- sender 余额扣款走 `LedgerService.debit`。
- recipient 收入进入 `SettlementService.createLine`，不直接 credit 到可用余额，除非配置为即时结算。
- 通知和消息副作用走 outbox 或失败可重试队列，不影响账务事务结果。

### 4.4 GiftService

API：

```http
POST /api/economy/gifts
```

请求：

```json
{
  "recipientUserId": "uuid",
  "assets": [{ "assetGrantId": "uuid", "quantity": 1 }],
  "currencies": [{ "currencyCode": "shrimp_coin", "amount": 100 }],
  "message": "送你一个徽章",
  "idempotencyKey": "..."
}
```

规则：

- sender 和 recipient 不能相同。
- recipient 被 `banned` 时拒绝；`economy_restricted` 时进入 held 或拒绝。
- asset 必须 `giftable=true`，且 grant 归 sender 所有。
- 赠送事务内先锁资产、扣虾币，再写接收方 grant / settlement line。
- 任一步失败必须释放锁。

### 4.5 SettlementService

职责：

- 为 order、tip、gift、admin adjustment 创建 settlement line。
- 计算 gross、fee、net、available_at。
- 将 pending line 转 available。
- 将 available line 结算到卖家 wallet。
- 对 refund/dispute 冻结或 reverse settlement line。

第二期默认策略：

- 单币种 `shrimp_coin`。
- 平台费配置：`SHADOWOB_COMMERCE_PLATFORM_FEE_BPS`，默认 0。
- 结算延迟配置：`SHADOWOB_COMMERCE_SETTLEMENT_DELAY_DAYS`，开发默认 0，生产可配置。

## 5. API 和 SDK

新增 API：

- `GET /api/economy/assets`
- `GET /api/economy/assets/:grantId`
- `POST /api/economy/assets/:grantId/consume`
- `POST /api/economy/tips`
- `GET /api/economy/tips`
- `POST /api/economy/gifts`
- `GET /api/economy/gifts`
- `GET /api/economy/settlements`
- `POST /api/economy/settlements/settle`

管理 API：

- `GET /api/shops/:shopId/assets`
- `POST /api/shops/:shopId/assets`
- `POST /api/shops/:shopId/offers/:offerId/deliverables` 支持 `community_asset`、`entitlement`、`currency`。

SDK 同步：

- TS SDK 增加 `listCommunityAssets`、`consumeCommunityAsset`、`sendTip`、`sendGift`、`listSettlements`。
- Python SDK 增加对应方法。
- 所有写方法必须要求 `idempotencyKey`。

## 6. Web 和 Mobile

Web：

- 个人资产页：按 asset type/filter 展示。
- 消息/用户/Buddy 上的打赏入口。
- 资产赠送弹窗。
- 创作者商品 deliverable 配置：Badge、数字礼物、服务券。
- 创作者收入/结算列表。

Mobile：

- 与 web 同步资产页、打赏入口、赠送弹窗。
- chat commerce card 支持资产发放后的状态展示。
- 购买完成页展示发放资产和履约状态。

i18n：

- 所有按钮、错误、toast、空状态、状态标签走项目 i18n。

## 7. 测试计划

Unit：

- `CommunityAssetService`：发放、锁定、赠送、消费、撤销。
- `TipService`：自打赏拒绝、金额限制、频率限制、幂等。
- `GiftService`：并发赠送同一资产、失败释放锁、接收方状态。
- `SettlementService`：fee/net 计算、T+N、refund/reverse、失败重试。

Integration：

- 商品购买后发放 community asset + entitlement + paid file。
- 多 deliverable 部分失败后重试不重复发放成功项。
- tip 创建 settlement line，结算后 seller wallet 增加。
- gift 同时转资产和虾币，重复请求不重复扣款。
- dispute 后冻结未结算收入。

E2E：

- web 和 mobile 都能完成购买资产、打赏、赠送、查看资产。
- 创作者创建数字礼物商品，买家购买后资产到账，创作者看到收入。

Security：

- PAT/OAuth/agent 没有显式 `economy:*` scope 时不能打赏、赠送、发资产。
- `economy_restricted` 用户不能转出虾币或资产。
- 资产/赠送/打赏接口都写审计。
- `pnpm check:security-pr` 增加 asset grant 直接写 owner/lock 的扫描规则。

## 8. 实施顺序

1. 新增资产和 settlement 迁移/schema。
2. 实现 `CommunityAssetService` 和 transfer log。
3. 拆分 fulfillment handler，先接 `community_asset` 和 `entitlement` deliverable。
4. 实现 `SettlementService`，普通订单和 Offer 购买先写 settlement line。
5. 实现 `TipService`，接 API、SDK、web/mobile。
6. 实现 `GiftService`，接 API、SDK、web/mobile。
7. 创作者商品 deliverable 配置 UI。
8. 收入/结算查询 UI。
9. 补安全脚本、迁移检查、Docker Compose 关键测试。

当前实现状态：

- 已完成 schema/migration、资产定义与 grant、tip、gift、settlement line 和 destination-less fulfillment。
- 已完成 `/api/economy/*` 用户侧 API、`/api/shops/:shopId/assets` 管理 API、资产定义 PATCH、TS/Python SDK 方法。
- 已在 web/mobile 增加 community economy hooks；Web 已补个人资产页（含 asset type filter）、联系人选择式打赏/赠送弹窗、用户/Profile 与 DM 打赏/赠送入口、资产卡赠送入口、创作者收入/结算列表，以及购买完成后的发放状态与资产入口。创作者发布商品已改为按「服务权益 / 身份徽章 / 数字礼物 / 服务券」配置，自动创建 community asset definition 并绑定默认 offer deliverable。
- 已补 pending settlement release、unsettled settlement hold/reverse、tip/gift 基础 rate/budget 控制、asset transfer/consume/lock/unlock/revoke/expire policy/audit，以及 asset grant 直接写安全扫描。
- 已将 gift 货币收入改为 recipient settlement line；付费文件 viewer URL 不再携带 query token，改用 HttpOnly grant cookie 或 `X-Paid-File-Grant-Token` header；续费扣款订单和 entitlement 延期收敛到同一事务边界。
- 待补：Mobile 页面与弹窗、已结算后的 clawback/人工争议工作台。

## 9. 验收门槛

- 所有第二期新增经济写接口都有 `idempotencyKey`。
- 所有第二期新增经济写接口都有 policy、audit、rate/budget 控制。
- 所有余额变化只经过 `LedgerService`。
- 所有资产 owner/lock 变化只经过 `CommunityAssetService`。
- Docker Compose 环境中迁移、server typecheck、web/mobile typecheck、核心测试、安全检查通过。
