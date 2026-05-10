# Shadow 社区虾币经济系统调整方案

版本：2026-05-09  
适用范围：`buggyblues/shadow` 后端交易、钱包、商城、权益、付费内容、社区赠送、创作者收入、审计与风控能力建设。  
目标定位：在社区中引入基于虾币的灵活交易能力，形成可运营、可审计、可扩展的游戏化社区经济系统。

## 0. 执行摘要

Shadow 当前已经具备一套可复用的交易底座：店铺、商品、SKU、Offer、订单、钱包、充值、权益、付费文件、履约任务、通知和幂等表。下一步不应重写，而应把现有能力收敛成统一经济系统。

本方案的核心顺序是：

1. 先补 P0：账务一致性、充值安全、幂等、履约去重、权限边界、元数据可信边界。
2. 再做 P1：社区资产、虾币赠送、打赏、商品购买、权益/付费内容发放、基础结算。
3. 再做 P2：优惠、轻量服务单、创作者中心、社区活动奖励、订阅续费、争议处理。
4. 最后做 P3：多币种、轻量社区市场、开放 API、数据报表、风控模型和运营扩展。

系统建设原则：

- 所有余额变化必须进入统一账务入口。
- 所有经济资产变化必须有可追踪来源。
- 所有交易行为必须有幂等键。
- 所有商品卡片和消息 metadata 只能作为展示入口，不能作为价格、权限、交付依据。
- 所有结算、退款、赠送、管理员调整必须进入审计。
- 先实现核心闭环，再扩展附属玩法。
- 保留向多币种、多资产、创作者市场、社区治理扩展的能力。

## 1. 当前可复用能力

### 1.1 已有基础

当前项目已经有以下交易基础：

| 模块 | 现有能力 | 后续策略 |
| --- | --- | --- |
| `shops` | 服务器店铺、个人店铺 scope | 保留，作为社区店铺、创作者店铺、平台店铺统一容器 |
| `products` / `skus` | 商品目录、SKU、价格、库存、媒体 | 保留，但 SKU 需要稳定 ID 和软下架 |
| `commerceOffers` | 商品销售上下文、价格覆盖、可见面、seller | 保留，作为频道、DM、主页、卡片销售的统一入口 |
| `commerceDeliverables` | 购买后交付配置，目前偏 paid file/message/external | 扩展为 entitlement、asset、currency、paid_file、message |
| `orders` / `orderItems` | 订单和订单项 | 保留，扩展支付状态、履约状态、结算状态 |
| `wallets` / `walletTransactions` | 虾币余额和流水 | 保留兼容，逐步升级为多账户账本 |
| `LedgerService` | 统一 credit/debit 入口雏形 | 升级为所有经济变更的唯一写入口 |
| `paymentOrders` / `RechargeService` | Stripe 充值、本地支付订单、webhook 入账 | 加固 currency、webhook secret、provider event、争议处理 |
| `entitlements` | 权益发放、资源授权、到期、撤销 | 保留，用于付费内容、服务资格、订阅、权限凭证 |
| `commerceFulfillmentJobs` | 购买后履约任务 | 加固 claim、重试、幂等、交付记录 |
| `commerceIdempotencyKeys` | 购买幂等 | 扩展到充值确认、赠送、打赏、履约、管理员调整 |
| `notification_*` | 通知事件和投递 | 复用到充值成功、购买成功、赠送、退款、结算、争议 |

### 1.2 当前不宜继续扩大的路径

以下路径需要收敛，不应在新能力中复制：

| 问题 | 风险 | 处理方式 |
| --- | --- | --- |
| `OrderService.createOrder` 内直接更新钱包余额和写流水 | 绕过统一账务，容易导致账不平 | P0 改为只调用 `LedgerService` |
| 充值接口允许客户端传入 `currency` | 可能造成金额单位错配或低价充值 | P0 限制为服务端白名单，默认 USD，禁止任意币种 |
| `STRIPE_WEBHOOK_SECRET` 可为空字符串 | webhook 配置失误时安全边界不明确 | P0 启动时强校验，生产环境为空直接失败 |
| 商品 metadata 使用 `.passthrough()` | 客户端可能注入未定义字段，被前端或机器人错误消费 | P0 改为白名单 schema，额外字段进入受限 `custom` |
| DM 发送 metadata 仅 `z.record(z.unknown())` | 绕过商品卡片正规化、大小限制和权限检查 | P0 复用统一 message metadata validator |
| thread 消息链路没有统一 commerce card normalize | 可能绕过频道消息卡片校验 | P0 所有消息入口统一走 `CommerceCardService` |
| SKU 更新删除并重建全部 SKU | 历史订单、商品卡片、购买链接、库存追踪被破坏 | P0 改为 update/upsert/soft deactivate |
| 履约任务先查询再更新状态 | 多 worker 可能重复处理同一 job | P0 改为原子 claim + 唯一交付记录 |
| 订单完成时结算失败被吞掉 | 订单和收入状态不一致 | P0/P1 引入结算任务与可重试状态 |
| 充值 dispute 只改状态和日志 | 争议后虾币可能已消费，无法追踪和冻结 | P1 引入 provider event、冻结、风险案例 |
| 付费文件 token 放在 query string | 可能被日志、Referer、截图泄露 | P1 改成一次性 token 或短期 grant header/cookie 方案 |
| PAT 权限仅按读写粗分 | 金融写接口可能被泛写 scope 误放行 | P0 建立经济接口显式 scope |

## 2. 目标架构

### 2.1 总体结构

```text
用户动作
  ↓
Route Validator
  ↓
EconomyPolicyService：身份、权限、scope、风控、限额
  ↓
EconomyCommandService：幂等、事务、业务编排
  ↓
LedgerService / AssetService / OrderService / FulfillmentService / SettlementService
  ↓
AuditService / NotificationService / RiskService
```

核心约束：

- Route 层只做输入校验和身份提取，不直接改余额、不直接发权益、不直接改资产归属。
- Service 层必须显式接收 actor、resource、action、idempotencyKey。
- Ledger、Asset、Order、Fulfillment、Settlement 的写操作必须在事务或可靠 outbox 中串联。
- Audit 不依赖业务方手写散落日志，必须在经济命令执行框架中自动写入。

### 2.2 能力分层

| 层级 | 能力 | 描述 |
| --- | --- | --- |
| L0 安全地基 | 账务入口、支付校验、幂等、权限、审计 | 任何交易能力上线前必须完成 |
| L1 核心交易 | 充值、商城购买、权益/付费内容发放、打赏、赠送 | 社区经济 MVP |
| L2 社区运营 | 创作者店铺、优惠、服务单、活动奖励、基础结算 | 支持运营增长 |
| L3 扩展生态 | 轻量市场、多币种、开放 API、风控模型、报表 | 前瞻性扩展 |

### 2.3 关键领域模型

#### 2.3.1 账务模型

短期兼容：

- 保留 `wallets`。
- 保留 `walletTransactions` 作为前端展示兼容层。
- 所有余额变化统一通过 `LedgerService`。

中期升级：

```ts
wallets
  id
  userId
  status
  createdAt
  updatedAt

walletBalances
  walletId
  currencyCode
  availableAmount
  frozenAmount
  updatedAt

ledgerTransactions
  id
  txNo
  actorKind
  actorId
  action
  referenceType
  referenceId
  idempotencyKey
  status
  metadata
  createdAt

ledgerEntries
  id
  transactionId
  walletId
  accountType
  currencyCode
  amount
  balanceAfter
  direction
  createdAt
```

账户类型建议：

| accountType | 用途 |
| --- | --- |
| `user_available` | 用户可用虾币 |
| `user_frozen` | 交易冻结、争议冻结 |
| `system_mint` | 充值铸币、奖励发放来源 |
| `platform_fee` | 平台手续费 |
| `seller_pending` | 待结算收入 |
| `seller_available` | 已结算收入 |
| `escrow` | 交易托管 |
| `admin_adjustment` | 管理员调整 |

P1 可以先实现单币种 `shrimp_coin`，但字段必须保留 `currencyCode`。

#### 2.3.2 社区资产模型

社区资产用于表示 Badge、服务券、数字收藏物、付费内容凭证、活动奖励、创作者礼物等。它不替代 `entitlements`，而是和 `entitlements` 分工：

| 类型 | 用途 |
| --- | --- |
| `entitlement` | 访问权限、订阅、时限服务、付费内容授权 |
| `communityAsset` | 可展示、可赠送、可转移、可收藏的社区资产 |
| `currency` | 虾币和未来代币 |

建议新增：

```ts
communityAssetDefinitions
  id
  code
  name
  description
  category              // badge | voucher | collectible | gift | coupon | creator_service
  media
  transferable          // 是否可转赠/转让
  giftable              // 是否可赠送
  consumable            // 是否可使用后消耗
  expiresPolicy
  maxSupply
  metadata
  status
  createdAt
  updatedAt

communityAssetGrants
  id
  definitionId
  ownerUserId
  sourceType            // order | gift | reward | admin | migration
  sourceId
  status                // active | locked | consumed | revoked | expired
  quantity
  expiresAt
  metadata
  createdAt
  updatedAt

communityAssetLocks
  id
  grantId
  lockedByType          // gift | transfer | settlement | moderation
  lockedById
  quantity
  reason
  expiresAt
  createdAt

communityAssetTransferLogs
  id
  assetGrantId
  fromUserId
  toUserId
  quantity
  reason
  referenceType
  referenceId
  createdAt
```

#### 2.3.3 订单模型

保留 `orders` 和 `orderItems`，但拆分状态语义：

```ts
orders
  status                // created | reserved | paid | fulfilling | completed | cancelled | failed | refunded | disputed
  paymentStatus         // unpaid | authorized | paid | failed | refunded | disputed
  fulfillmentStatus     // pending | processing | fulfilled | partially_failed | failed
  settlementStatus      // none | pending | settled | held | failed
  riskStatus            // normal | review_required | frozen
```

短期不一定立刻加所有字段，但新服务设计必须按这四类状态思考，不再让单个 `status` 同时表达支付、发货、结算和争议。

#### 2.3.4 履约模型

扩展 `commerceDeliverables.kind`：

| kind | 说明 |
| --- | --- |
| `entitlement` | 发放资源访问权益 |
| `community_asset` | 发放 Badge、礼物、服务券、收藏物 |
| `currency` | 发放虾币或奖励币 |
| `paid_file` | 发放付费文件访问 |
| `message` | 发送系统消息或 Buddy 消息 |
| `external` | 外部交付，占位 |

新增：

```ts
commerceFulfillmentRecords
  id
  jobId
  orderId
  orderItemId
  deliverableId
  recipientUserId
  idempotencyKey
  resultType
  resultId
  status
  createdAt
```

唯一约束：

```sql
unique (order_item_id, deliverable_id, recipient_user_id)
unique (idempotency_key)
```

## 3. 分阶段落地计划

## P0：交易安全与账务地基

目标：先阻止刷币、重复扣款、重复发货、权限越界和审计缺失。P0 必须优先完成，不依赖前端大改。

### P0.1 统一余额变更入口

改动点：

- `OrderService.createOrder` 不再直接更新 `wallets.balance`。
- `OrderService.createOrder` 不再直接插入 `walletTransactions`。
- 所有购买、退款、结算、赠送、打赏、管理员加币都调用 `LedgerService`。
- `WalletDao.credit/debit/updateBalance` 标记为 internal，仅允许 `LedgerService` 或测试使用。
- `scripts/check-security-pr.mjs` 增加对 `db.update(wallets)` 的扫描，不只扫描 `walletDao.credit/debit/updateBalance`。

验收：

- 搜索 `wallets.balance} +` 和 `wallets.balance} -`，除 `LedgerService` 外无余额写入。
- 下单扣款、充值入账、退款、管理员 grant 均产生 ledger 记录。
- 重复调用同一 idempotencyKey 不重复扣款。

### P0.2 加固充值

改动点：

- `POST /api/v1/recharge/create-intent` 不再接受任意 `currency`。
- 服务端配置允许币种，例如 `SUPPORTED_STRIPE_CURRENCIES=usd`。
- 生产环境 `STRIPE_WEBHOOK_SECRET` 为空直接启动失败。
- 新增 `paymentProviderEvents` 表，保存 Stripe event id、type、payload hash、processedAt、status。
- webhook 先写 provider event，event id 唯一。
- dispute/chargeback 进入 `riskCases`，不只打日志。
- 自定义充值金额增加日限额、单笔限额、用户状态检查。

验收：

- 传 `currency=jpy`、`krw`、`cny` 等非白名单币种返回 400。
- 重复 webhook event id 只处理一次。
- 空 webhook secret 在 production 下无法启动。
- dispute 产生 risk case 和通知。

### P0.3 所有经济写操作接入幂等

改动点：

- 扩展 `commerceIdempotencyKeys` 或新增 `economyIdempotencyKeys`。
- 强制以下操作必须带 idempotencyKey：
  - 购买 Offer
  - 充值确认
  - 打赏
  - 赠送
  - 管理员 grant/adjustment
  - 退款
  - 履约
  - 结算
- Route 层拒绝缺失 idempotencyKey 的经济写请求。
- 幂等键作用域为 `actorUserId + action + key`。
- 完成后保存响应摘要，不保存敏感完整 payload。

验收：

- 同一个 idempotencyKey 重试返回同一结果。
- 并发 20 次同一购买请求只生成一个订单、一笔扣款、一组交付。

### P0.4 履约任务原子 claim

当前风险：`processJob` 先 select，再 update `status='sending'`。多个 worker 可能同时读到 pending job，然后重复发送消息或重复发放资产。

改动点：

- 使用一条 update claim：

```ts
const [claimed] = await db
  .update(commerceFulfillmentJobs)
  .set({
    status: 'sending',
    attempts: sql`${commerceFulfillmentJobs.attempts} + 1`,
    updatedAt: new Date(),
  })
  .where(and(
    eq(commerceFulfillmentJobs.id, jobId),
    inArray(commerceFulfillmentJobs.status, ['pending', 'failed']),
  ))
  .returning()
```

- claim 失败直接返回已有状态。
- 新增 `commerceFulfillmentRecords`，用唯一约束防重复交付。
- 对 `paid_file`、`entitlement`、`community_asset`、`currency` 每种交付都必须写 record。

验收：

- 两个 worker 同时处理同一 job，不会重复发消息或重复发资产。
- 失败重试不会重复发已成功的 deliverable。

### P0.5 消息 metadata 可信边界

改动点：

- 移除经济相关 metadata 的 `.passthrough()`。
- `commerceCards.snapshot` 只允许服务端生成。
- `purchase`、`action` 等字段不接受客户端任意对象。
- DM 消息发送复用统一 `sendMessageSchema` 或抽出 `messageMetadataSchema`。
- 频道、DM、thread、socket 消息入口全部走同一个 `CommerceCardService.normalizeMessageMetadata`。
- 对 metadata 总字节、数组数量、字段长度统一限制。
- 对 unknown metadata 放入 `metadata.custom`，并限制 key 数量和总大小。

验收：

- 客户端伪造 `snapshot.price=1` 不影响购买价格。
- 客户端伪造 `shopId/productId/offerId` 不通过服务端可见性和 surface 检查。
- thread/DM 发送商品卡片与频道发送执行同样校验。

### P0.6 SKU 稳定性

当前风险：`ProductService.updateProduct` 会删除商品所有 SKU 再重建。

改动点：

- SKU 更新改为：
  - 有 id：update。
  - 无 id：insert。
  - 未出现在请求中：`isActive=false`，不删除。
- 订单项保留 SKU snapshot。
- 商品卡片购买时使用实时 SKU 状态，但历史订单不依赖当前 SKU 可用性。
- 删除产品改为 `status='archived'`，默认不物理删除有订单的商品。

验收：

- 已产生订单的 SKU 更新后，历史订单仍可查到 SKU 关联或快照。
- 商品卡片引用老 SKU 时，若 SKU 已下架，返回明确错误，不错发其他 SKU。

### P0.7 经济权限最小化

改动点：

- 增加 `EconomyPolicyService`。
- 所有经济写操作必须显式传入：
  - actor
  - resource
  - action
  - scope
  - dataClass
- PAT 默认不能执行经济写操作。
- 如需开放 PAT，必须使用明确 scope：
  - `economy:wallet:read`
  - `economy:orders:read`
  - `economy:offers:write`
  - `economy:tips:write`
  - `economy:gifts:write`
  - `economy:admin:adjust`
- 经济类管理员操作不只检查 `isAdmin`，还要检查细粒度 admin capability。
- 增加用户风险状态：
  - `normal`
  - `economy_restricted`
  - `frozen`
  - `banned`

验收：

- 普通 PAT 不能发起购买、赠送、打赏、退款、管理员加币。
- 被 economy_restricted 的用户不能转出虾币或资产。
- 管理员 grant 必须写 audit event。

### P0.8 最小审计表

新增：

```ts
economyAuditEvents
  id
  actorKind
  actorId
  actorTokenKind
  action
  resourceKind
  resourceId
  scopeKind
  scopeId
  idempotencyKey
  requestHash
  result
  errorCode
  ipHash
  userAgentHash
  metadata
  createdAt
```

P0 先覆盖：

- 充值 create-intent
- 充值 webhook
- 购买
- 管理员 grant
- 退款
- 履约 job
- 权益发放/撤销
- 结算尝试

验收：

- 任意订单可追溯到支付、扣款、履约、结算、通知。
- 任意管理员调整可追溯到 actor、目标用户、金额、原因。

## P1：社区经济核心闭环

目标：形成社区内基于虾币的“购买、赠送、打赏、发放、结算、查询”闭环。

### P1.1 社区资产

新增资产定义和资产发放表：

- Badge
- 服务券
- 付费内容凭证
- 数字礼物
- 创作者服务兑换券
- 活动奖励
- 优惠券或折扣券

关键字段：

- 是否可赠送
- 是否可转让
- 是否可消费
- 是否可过期
- 是否可撤销
- 来源订单或来源活动
- 当前 owner
- 锁定状态

先不做复杂市场。P1 只要求资产能被购买、发放、展示、赠送或消费。

### P1.2 商品交付扩展

改动点：

- `commerceDeliverables.kind` 增加 `entitlement`、`community_asset`、`currency`。
- `CommerceFulfillmentService` 拆分 handler：
  - `EntitlementFulfillmentHandler`
  - `CommunityAssetFulfillmentHandler`
  - `CurrencyFulfillmentHandler`
  - `PaidFileFulfillmentHandler`
  - `MessageFulfillmentHandler`
- 购买流程只创建 order 和 fulfillment jobs，不在购买服务中直接写具体资产。

验收：

- 一个商品可以同时发 Badge + 付费文件权益 + 系统消息。
- 某个 deliverable 失败不导致已成功 deliverable 重复发放。
- 订单详情能展示履约状态。

### P1.3 虾币打赏

新增 API：

```http
POST /api/economy/tips
```

请求：

```json
{
  "recipientUserId": "uuid",
  "amount": 100,
  "message": "谢谢你的内容",
  "context": {
    "kind": "message",
    "id": "uuid"
  },
  "idempotencyKey": "..."
}
```

规则：

- 不允许给自己打赏。
- 打赏金额受单笔、每日、每对象频率限制。
- 打赏先扣打赏者虾币。
- 收款进入 `seller_pending` 或直接进入 `user_available`，由配置决定。
- 平台可配置手续费。
- 被风控限制用户不能转出。
- 打赏消息和通知不影响账务事务结果。

验收：

- 并发重复打赏不会重复扣款。
- 删除消息不影响已完成打赏记录。
- 收款人封禁时收入可进入 held 状态。

### P1.4 资产赠送

新增 API：

```http
POST /api/economy/gifts
```

请求：

```json
{
  "recipientUserId": "uuid",
  "assets": [
    { "assetGrantId": "uuid", "quantity": 1 }
  ],
  "currencies": [
    { "currencyCode": "shrimp_coin", "amount": 100 }
  ],
  "message": "送你一个徽章",
  "idempotencyKey": "..."
}
```

规则：

- 可赠送性由 asset definition 决定。
- 赠送时先锁定资产和虾币。
- 接收可以设计为：
  - P1：直接到账。
  - P2：收件箱领取，可过期退回。
- 赠送成功写 asset transfer log 和 ledger transaction。
- 赠送失败必须释放锁。

验收：

- 同一资产不能同时被赠送两次。
- 已锁定或已消费资产不能赠送。
- 接收方被封禁时赠送失败或进入人工审核。

### P1.5 创作者/个人店铺增强

复用现有个人店铺：

- `GET /api/me/shop`
- `POST /api/me/shop`
- `GET /api/users/:userId/shop`
- `POST /api/shops/:shopId/products`
- `POST /api/commerce/offers/:offerId/purchase`

增强：

- 商品类型模板：
  - 付费内容
  - 数字礼物
  - 服务券
  - Badge
  - 订阅权益
- 商品创建时必须配置 deliverables。
- 默认商品状态为 draft，发布前做校验。
- 店铺 owner、server admin、platform admin 权限分离。
- 商品销售统计、收入统计、履约失败统计进入创作者后台。

验收：

- 创作者可以创建一个“数字礼物”商品，用户购买后得到资产并通知创作者。
- 创作者可以创建一个“付费内容”商品，用户购买后得到 entitlement 和短期访问 grant。

### P1.6 基础结算

新增：

```ts
settlementAccounts
settlementBatches
settlementLines
```

基础规则：

- 平台销售、创作者销售、打赏都进入 settlement line。
- P1 可以配置为即时结算或 T+N 延迟结算。
- 结算失败不能吞掉，必须进入 `settlementStatus='failed'` 并可重试。
- 退款和 dispute 可冻结未结算收入。
- 平台手续费单独记录，不能只写 note。

验收：

- 每笔订单能查到 seller gross、platform fee、seller net、settlement status。
- 结算失败可重试。
- 退款能关联原结算行。

## P1.5：权限与安全专项

该阶段可以与 P1 并行，但所有 P1 公开功能上线前必须通过。

### 4.1 Actor / Resource / Action 表

经济系统统一使用以下动作表：

| 场景 | Actor | Resource | Action | Data class |
| --- | --- | --- | --- | --- |
| 查看钱包 | user | wallet | read | financial |
| 充值创建 | user | payment_order | create | financial |
| webhook 入账 | provider/system | payment_order | settle | financial |
| 商品购买 | user | offer/order/wallet | purchase | financial |
| 商品发布 | shop_manager | product/offer | publish | commercial |
| 打赏 | user | wallet/user/context | tip | financial |
| 赠送 | user | asset/wallet/user | gift | financial |
| 发放资产 | system | fulfillment/asset | grant | financial |
| 退款 | user/admin/system | order/wallet | refund | financial |
| 结算 | system/admin | settlement/wallet | settle | financial |
| 管理员调整 | platform_admin | wallet/asset | adjust | financial |
| 审计查询 | admin/auditor | audit_event | read | restricted |

### 4.2 Route 安全要求

所有经济 route 必须：

- 使用 auth middleware。
- 使用 zod schema。
- 要求 idempotencyKey。
- 调用 `EconomyPolicyService`.
- 调用 `AuditService`.
- 不直接调用 DAO 改余额或资产。
- 不信任客户端价格、快照、seller、fee。
- 不接受客户端指定 `paidAt`、`completedAt`、`settlementStatus`。
- 对金额使用整数，禁止浮点。
- 对 amount 设置 min/max。
- 对频率设置 rate limit。
- 对 IP、设备、异常重试进入风控信号。

### 4.3 金额安全

统一规则：

- 所有金额都是整数。
- 所有金额有币种。
- 所有金额由服务端计算。
- 客户端只能提交要购买的 offer、sku、数量、接收人。
- 手续费、折扣、税费、补贴都必须有明细。
- 订单金额快照保存到订单项。
- 任何扣款前先校验余额和冻结状态。
- 任何退款不得超过可退基数。

### 4.4 元数据安全

消息和商品 metadata 规则：

- 客户端提交的商品卡片只允许 `offerId` 或 `productId + skuId`。
- `snapshot` 必须由服务端生成。
- `purchase` 行为必须由服务端生成。
- metadata 总大小限制为 24KB 或更低。
- 自定义 metadata 进入 `custom`，且 key 数量、深度、总大小受限。
- 禁止 metadata 携带 HTML、script、内联事件、外部跳转 URL，除非经过专门 URL 安全校验。
- 所有商品卡片点击购买必须重新读取实时 Offer/Product/SKU/Shop。

## P2：附属能力和运营能力

目标：在核心闭环稳定后，增加运营效率和社区玩法。

### P2.1 优惠与促销

能力：

- 优惠券
- 折扣码
- 限时 Offer
- 首购优惠
- 平台补贴
- 店铺补贴
- 活动奖励

数据模型：

```ts
promotions
promotionRules
promotionRedemptions
```

要求：

- 优惠只影响订单价格明细，不直接改商品价格。
- 退款时能区分实付、补贴、赠送余额、手续费。
- 优惠使用必须幂等。

### P2.2 服务券和轻量服务单

社区经济中有些交易不是立即发内容，而是创作者提供一次服务。P2 支持轻量服务单：

```ts
serviceOrders
  id
  orderId
  providerUserId
  buyerUserId
  status        // requested | accepted | delivered | confirmed | cancelled | disputed
  deliverBefore
  metadata
```

适用：

- 创作者答疑
- 内容定制
- 社区任务
- 一次性服务兑换
- Buddy 服务兑换

规则：

- 购买后先发服务券或创建 service order。
- 收入进入 pending。
- 完成或超时后结算。
- 争议进入人工处理。

### P2.3 订阅和续费加固

现有续费能力需要升级：

- 续费幂等键：`entitlementId + renewalPeriodStart`.
- 创建续费订单、扣款、扩展 entitlement、写通知使用事务或 outbox。
- 失败不重试或有限重试由配置决定。
- 失败通知进入 notification outbox。
- 取消订阅、比例退款、撤销权益必须写 audit。
- 续费失败不应生成重复订单。

### P2.4 争议和退款

新增：

```ts
refundRequests
disputeCases
riskCases
```

场景：

- 充值争议
- 商品退款
- 服务未履约
- 资产误发
- 管理员撤销
- 用户举报交易

要求：

- 退款有状态流。
- 退款金额不得超过可退金额。
- 退款关联原 ledger transaction。
- 退款可能触发资产撤销或 entitlement revoke。
- dispute 可冻结用户余额或卖家待结算金额。

### P2.5 创作者中心

能力：

- 销售列表
- 打赏收入
- 结算状态
- 履约失败提醒
- 商品状态检查
- 退款/争议提醒
- 资产发放记录
- 收入导出

后端 API：

```http
GET /api/economy/creator/summary
GET /api/economy/creator/sales
GET /api/economy/creator/settlements
GET /api/economy/creator/disputes
```

## P3：前瞻扩展

目标：保留更大社区经济生态的演进空间，但不阻塞核心功能。

### P3.1 多币种

支持：

- `shrimp_coin`
- 绑定虾币
- 活动点数
- 创作者积分
- 社区贡献值
- 未来平台奖励币

要求：

- 多币种不影响现有单币种接口。
- 所有 ledger entries 必须带 currencyCode。
- 不同币种不可默认互换。
- 兑换必须走明确 exchange order。

### P3.2 轻量社区市场

不是第一阶段目标。P3 可支持用户出售可转让资产或服务券：

```ts
communityListings
  id
  sellerUserId
  assetGrantId
  quantity
  priceCurrency
  priceAmount
  status
  expiresAt
```

要求：

- listing 创建时锁定资产。
- 购买时扣买家虾币、转移资产、收手续费、卖家入 pending。
- listing 取消时释放锁。
- 不做复杂竞价，先做定价购买。

### P3.3 开放 API 和 SDK

开放前提：

- 经济 scope 完成。
- webhook/outbox 完成。
- 审计完成。
- 限流完成。
- 风控完成。

候选 API：

```http
GET /api/economy/wallet
GET /api/economy/assets
POST /api/economy/tips
POST /api/economy/gifts
GET /api/economy/orders
GET /api/economy/audit-events
```

### P3.4 数据报表和风控模型

报表：

- 每日充值
- 每日消费
- 虾币流入流出
- 活跃打赏用户
- 创作者收入
- 退款率
- 争议率
- 履约失败率
- 管理员调整统计
- 异常转账网络

风控模型：

- 短时高频赠送
- 新账号大额充值后快速转出
- 重复小额打赏刷榜
- 同 IP 多账号互转
- 争议用户高消费
- 管理员异常 grant
- 价格异常商品
- 重复履约风险

## 5. API 草案

### 5.1 钱包

```http
GET /api/economy/wallet
GET /api/economy/wallet/transactions?direction=&limit=&offset=
```

返回：

```json
{
  "wallet": {
    "currencyCode": "shrimp_coin",
    "availableAmount": 1000,
    "frozenAmount": 0
  }
}
```

### 5.2 打赏

```http
POST /api/economy/tips
```

```json
{
  "recipientUserId": "uuid",
  "amount": 100,
  "context": {
    "kind": "message",
    "id": "uuid"
  },
  "message": "感谢分享",
  "idempotencyKey": "tip-..."
}
```

### 5.3 赠送

```http
POST /api/economy/gifts
```

```json
{
  "recipientUserId": "uuid",
  "assets": [
    { "assetGrantId": "uuid", "quantity": 1 }
  ],
  "currencies": [],
  "message": "送你一个徽章",
  "idempotencyKey": "gift-..."
}
```

### 5.4 资产

```http
GET /api/economy/assets
GET /api/economy/assets/:id
POST /api/economy/assets/:id/consume
```

### 5.5 管理员调整

```http
POST /api/admin/economy/adjustments
```

```json
{
  "targetUserId": "uuid",
  "currencyCode": "shrimp_coin",
  "amount": 1000,
  "reasonCode": "support_compensation",
  "note": "客服补偿",
  "idempotencyKey": "admin-adjust-..."
}
```

要求：

- 只允许平台经济管理员。
- 必须写 audit。
- 必须写 ledger。
- 必须支持负向调整，但不能绕过冻结/风控规则，除非更高权限。

## 6. 推荐代码组织

建议新增目录：

```text
apps/server/src/services/economy/
  economy-command.service.ts
  economy-policy.service.ts
  economy-audit.service.ts
  community-asset.service.ts
  gift.service.ts
  tip.service.ts
  settlement.service.ts
  refund.service.ts
  risk.service.ts
  fulfillment-handlers/
    entitlement.handler.ts
    community-asset.handler.ts
    currency.handler.ts
    paid-file.handler.ts
```

建议新增 schema 文件：

```text
apps/server/src/db/schema/economy.ts
apps/server/src/db/schema/settlements.ts
apps/server/src/db/schema/audit.ts
apps/server/src/db/schema/risk.ts
```

建议新增 handler：

```text
apps/server/src/handlers/economy.handler.ts
apps/server/src/handlers/economy-admin.handler.ts
```

容器注册：

- `economyCommandService`
- `economyPolicyService`
- `economyAuditService`
- `communityAssetService`
- `giftService`
- `tipService`
- `settlementService`
- `refundService`
- `riskService`

## 7. 安全漏洞和问题清单

| 编号 | 优先级 | 问题 | 修复 |
| --- | --- | --- | --- |
| S-01 | P0 | 充值接受任意 currency | 服务端白名单，生产默认只允许 USD |
| S-02 | P0 | webhook secret 可为空 | 生产启动强校验 |
| S-03 | P0 | 余额变更路径分裂 | 所有余额变化通过 LedgerService |
| S-04 | P0 | OrderService 直接扣款 | 改成 LedgerService.debit |
| S-05 | P0 | 经济写操作缺统一幂等 | 全部经济写要求 idempotencyKey |
| S-06 | P0 | 履约 job 可能重复 claim | 原子 claim + fulfillment records 唯一约束 |
| S-07 | P0 | metadata passthrough | 经济 metadata 白名单化 |
| S-08 | P0 | DM metadata 过宽 | DM 复用统一 message metadata schema |
| S-09 | P0 | thread 商品卡片可能绕过正规化 | 所有消息入口统一 normalize |
| S-10 | P0 | SKU 更新删除重建 | 改为 update/upsert/soft deactivate |
| S-11 | P0 | PAT scope 粗放 | 经济接口使用显式 scope |
| S-12 | P0 | 管理员 grant 缺强审计 | admin adjustment 独立模型 + audit |
| S-13 | P1 | dispute 只记录日志 | risk case + 冻结 + 通知 |
| S-14 | P1 | 结算失败被吞 | settlement job + retry + failed 状态 |
| S-15 | P1 | 付费文件 token 在 query | 一次性 token 或短期安全 grant |
| S-16 | P1 | 续费事务边界分裂 | 续费订单、扣款、扩权使用事务/outbox |
| S-17 | P1 | 商品价格来源可能混乱 | 购买时只信任服务端实时 Offer/Product/SKU |
| S-18 | P1 | 收入和手续费无明细 | settlement lines 分离 gross/fee/net |
| S-19 | P1 | 风控状态缺失 | user economy status + risk rules |
| S-20 | P2 | 退款可退基数不完整 | 订单金额明细和退款基数快照 |

## 8. 测试计划

### 8.1 单元测试

- `LedgerService`
  - credit
  - debit
  - refund
  - settlement
  - insufficient balance
  - repeated idempotency
- `CommerceFulfillmentService`
  - atomic claim
  - repeated worker
  - failed retry
  - fulfillment record uniqueness
- `CommunityAssetService`
  - grant
  - lock
  - unlock
  - transfer
  - consume
- `GiftService`
  - duplicate request
  - locked asset
  - non-giftable asset
  - recipient restricted
- `TipService`
  - self tip forbidden
  - daily limit
  - repeated idempotency
  - fee split

### 8.2 集成测试

- 充值成功 webhook 重复投递。
- 充值 dispute 后创建 risk case。
- 购买商品后生成订单、扣款、履约、通知、审计。
- 商品同时包含 entitlement、asset、paid file deliverables。
- 并发购买同一限量 SKU。
- 赠送同一资产并发请求。
- 管理员 grant 后审计可查。
- 订单退款后资产撤销或权益撤销。
- 结算失败后可重试。

### 8.3 安全测试

- PAT 无经济 scope 不能执行经济写。
- 客户端伪造价格无效。
- 客户端伪造 seller 无效。
- 客户端伪造 fulfillment status 无效。
- metadata 超大小被拒绝。
- metadata 注入未知 action 被拒绝。
- 非店铺 owner 无法发布商品。
- 被冻结用户无法转出资产或虾币。
- webhook 签名错误被拒绝。
- 空 webhook secret 在生产不允许启动。

### 8.4 不变量测试

必须持续验证：

- 用户余额不能为负，除非显式允许负债账户。
- 每笔 ledger transaction 分录平衡。
- 每个 idempotencyKey 只产生一次经济结果。
- 每个 fulfillment record 只产生一次交付。
- 每个 asset grant 同一数量不能同时被多个 lock 占用。
- 退款金额不能超过可退金额。
- 结算金额 = gross - fee - refund - hold。
- 管理员调整必须有 audit event。

## 9. 迁移策略

### 9.1 不做大爆炸迁移

迁移顺序：

1. 增加新表。
2. 让新服务写新表，同时保留旧展示表。
3. 老接口内部调用新服务。
4. 前端逐步切换到新 API。
5. 旧路径加 deprecation warning。
6. 安全检查脚本禁止新增旧路径写法。
7. 稳定后再清理旧兼容逻辑。

### 9.2 数据兼容

- 现有 `wallets.balance` 迁移为 `walletBalances.availableAmount`。
- 现有 `walletTransactions` 可作为历史流水保留。
- 现有 `orders` 继续可查。
- 现有 `entitlements` 继续有效。
- 已存在商品 SKU 不删除，只补 `isActive` 语义。
- 已有 paid file grants 保持可用。

### 9.3 前端兼容

先保持现有页面可用：

- 钱包页继续读 wallet summary。
- 店铺页继续购买商品。
- 商品卡片继续展示。
- 付费文件继续打开。

逐步新增：

- 资产页。
- 打赏按钮。
- 赠送弹窗。
- 创作者收入页。
- 审计/交易详情页。
- 风控/争议后台页。

## 10. 里程碑和验收标准

### M0：P0 安全地基完成

验收：

- 充值 currency 和 webhook secret 已加固。
- 所有余额变化经过 LedgerService。
- 经济写操作要求 idempotencyKey。
- 履约原子 claim。
- 商品卡片 metadata 白名单化。
- SKU 稳定更新。
- PAT 经济写权限收紧。
- 最小审计表上线。
- P0 测试通过。
- `pnpm check:security-pr` 扩展并通过。

### M1：核心社区经济 MVP

验收：

- 用户可充值。
- 用户可购买社区商品。
- 商品可发 entitlement、community asset、paid file。
- 用户可打赏。
- 用户可赠送资产。
- 创作者可查看收入。
- 订单可查看支付、履约、结算状态。
- 基础结算可重试。
- 审计可追踪完整链路。

### M2：运营增强

验收：

- 优惠券和补贴可用。
- 服务单可用。
- 退款和争议流程可用。
- 订阅续费幂等可用。
- 风控冻结可用。
- 创作者中心可用。

### M3：扩展生态

验收：

- 多币种模型可用。
- 轻量社区市场可用。
- 经济 API/SDK 可用。
- 报表和风控模型上线。
- 审计导出和对账稳定。

## 11. 最小可落地任务清单

建议第一批 PR 拆分：

1. `P0-ledger-boundary`
   - 禁止 OrderService 直接改余额。
   - 扩展 security check。
   - 增加测试。

2. `P0-recharge-hardening`
   - currency 白名单。
   - webhook secret 生产强校验。
   - provider event 表。
   - webhook 幂等测试。

3. `P0-idempotency-and-audit`
   - economy audit 表。
   - 经济写 idempotency 中间件或 helper。
   - 管理员 grant 审计。

4. `P0-fulfillment-claim`
   - 原子 claim。
   - fulfillment record。
   - 并发测试。

5. `P0-message-metadata-boundary`
   - 统一 metadata schema。
   - DM/thread/socket 统一 normalize。
   - 禁止客户端 snapshot/action 注入。

6. `P0-sku-stability`
   - SKU update/upsert/soft deactivate。
   - 历史订单兼容测试。

7. `P1-community-assets`
   - asset definition/grant/lock/transfer log。
   - asset fulfillment handler。
   - asset 查询 API。

8. `P1-tips-and-gifts`
   - 打赏 API。
   - 赠送 API。
   - 限流和风控状态。
   - 通知和审计。

9. `P1-settlement`
   - settlement lines。
   - platform fee。
   - seller pending。
   - retry job。

## 12. 结论

Shadow 需要建设的是一个社区经济平台，而不是单一商城功能。最可靠的路线是先把账务、幂等、权限、履约、审计做牢，再把商品、权益、付费内容、社区资产、打赏、赠送和结算串成闭环。

P0 的价值最大：它不增加太多产品 UI，却能显著降低刷币、重复发货、错价、越权、结算丢失和审计缺口风险。P1 再开始交付用户可见的社区经济能力。P2 和 P3 提供运营增长和生态扩展，但不应抢在安全地基之前上线。
