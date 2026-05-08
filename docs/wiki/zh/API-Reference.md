# API 参考

Shadow 服务端暴露 REST API 和 Socket.IO WebSocket 事件。

## 基础 URL

- 开发环境：`http://localhost:3002`
- 生产环境：`https://shadowob.com`（或你自部署的 API 域名）

## 认证

大多数接口需要在 `Authorization` 请求头中携带 JWT 令牌：

```
Authorization: Bearer <token>
```

### 认证接口

| 方法 | 端点                             | 描述                                  |
|------|----------------------------------|---------------------------------------|
| POST | `/api/auth/register`             | 创建游客账号，邀请码可选              |
| POST | `/api/auth/login`                | 密码登录，返回访问令牌和刷新令牌      |
| POST | `/api/auth/email/start`          | 发送邮箱验证码                        |
| POST | `/api/auth/email/verify`         | 验证邮箱验证码并登录或创建游客账号    |
| POST | `/api/auth/google/id-token`      | Google One Tap 凭证登录               |
| GET  | `/api/auth/me`                   | 获取当前用户和会员状态                |
| GET  | `/api/membership/me`             | 获取游客/会员能力                     |
| POST | `/api/membership/redeem-invite`  | 兑换邀请码，解锁会员能力              |
| GET  | `/api/play/catalog`              | 获取 git 驱动的首页玩法目录           |
| POST | `/api/play/launch`               | 启动 website 配置的玩法               |
| GET  | `/api/ai/v1/models`              | 列出官方 OpenAI-compatible 模型       |
| GET  | `/api/ai/v1/billing`             | 查看官方代理虾币计费标准             |
| POST | `/api/ai/v1/chat/completions`    | 创建官方代理的聊天补全                |

会员响应采用可扩展等级和能力模型。客户端应渲染服务端返回的 tier，而不是只写死游客/会员两个状态：

```json
{
  "status": "member",
  "tier": {
    "id": "member",
    "level": 10,
    "label": "Member",
    "capabilities": ["cloud:deploy", "server:create", "invite:create", "oauth_app:create"]
  },
  "level": 10,
  "isMember": true,
  "memberSince": "2026-05-03T00:00:00.000Z",
  "inviteCodeId": "invite-id",
  "capabilities": ["cloud:deploy", "server:create", "invite:create", "oauth_app:create"]
}
```

当当前账号缺少所需能力时，高阶接口会返回 `403` 和 `INVITE_REQUIRED` code。

快速认证和玩法启动路径可能返回 `429` 和 `RATE_LIMITED` code。客户端应遵守 `Retry-After`
响应头后再重试。

`GET /api/play/catalog` 返回玩法卡片、启动状态、门禁、动作元数据和关联的 git 模板。每个首页玩法
都有对应的 `apps/cloud/templates/*.template.json` 模板；app 会通过统一落地页呈现，客户侧不需要接触内部准备过程。

`POST /api/play/launch` 接收已发布的 `playId`、可选 `launchSessionId`，以及需要会员能力时可选的
`inviteCode`：

```json
{
  "playId": "daily-brief",
  "launchSessionId": "launch-session-1",
  "inviteCode": "INVITE-CODE"
}
```

公开接口不接受原始玩法 action 对象。玩法 action 必须通过 admin 管理的 website 玩法配置或
git-backed catalog 发布。缺失 action 会返回 `PLAY_NOT_CONFIGURED`、`PLAY_COMING_SOON`、
`PLAY_MISCONFIGURED` 或 `PLAY_TARGET_UNAVAILABLE` 等结构化 code；启动不再 fallback 到探索页。
Cloud 模板玩法会从已审核 template content 创建真实 Cloud SaaS deployment，并在 provisioning
期间返回 `deploymentId`。当 deployment 状态为 `deployed` 且暴露 `shadowServerId` 与 `shadowChannelId` 后，客户端应直接跳入对应频道。
如果 Cloud 玩法需要 `cloud:deploy` 能力，服务端会在同一次 launch 请求里校验会员状态；请求带有
`inviteCode` 时，会先兑换邀请码再继续授权，不要求客户端先单独调用会员接口。
公开频道和私有房间玩法必须由配置指定已有 `serverSlug` / `serverId`，私有房间还必须指定已部署 Buddy 的 `buddyUserIds`。启动器只负责入服、建私有频道、拉 Buddy 和发送欢迎消息，不会为这类玩法创建假服务器或假 Buddy。Cloud 部署玩法会在部署完成后由已 provision 的 Buddy 发送一次欢迎消息。
Cloud 部署按运行时间计费，价格为 1 虾币 / 小时，计费精度为 15 分钟。API 在排队前会检查钱包是否能覆盖首个小时单位，
worker 会在运行时真正变为 live 时扣除这首个小时单位。如果钱包余额不足，API 返回
`402`、`WALLET_INSUFFICIENT_BALANCE`、`requiredAmount`、`balance` 和 `shortfall`，客户端应展示新手任务或充值付费墙。

## 官方模型代理

官方模型代理提供 OpenAI-compatible 接口，由 server 侧供应商配置驱动。上游供应商通过
`SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL` 与 `SHADOW_MODEL_PROXY_UPSTREAM_API_KEY` 配置。示例环境与
compose 部署默认使用 DeepSeek 的 OpenAI-compatible `https://api.deepseek.com`；真实上游模型可通过
`SHADOW_MODEL_PROXY_MODEL` 修改。公开 API 响应和 Cloud Pod 只使用 `default` 模型别名，真实模型名留在
server 侧。Cloud 模板和 Pod 只会拿到写在 `OPENAI_COMPATIBLE_API_KEY` 里的受限 `smp_...`
模型代理 token，不会拿到真实上游 key。

| 方法 | 端点                            | 描述                         |
|------|---------------------------------|------------------------------|
| GET  | `/api/ai/v1/models`             | 列出官方模型别名             |
| GET  | `/api/ai/v1/billing`            | 查看已配置的计费标准         |
| POST | `/api/ai/v1/chat/completions`   | 代理 OpenAI-compatible 请求  |

请求可以使用普通 Shadow bearer token，也可以使用受限模型代理 bearer token：

```http
Authorization: Bearer <shadow-token-or-smp-token>
```

代理会在调用上游前按整虾币预扣，收到实际 token usage 后结算差额，上游失败时退回预扣金额。
因为钱包余额仍然是整数，模型用量会先以 micro-虾币精度累计，小请求不会因为每次向上取整而被反复多扣。
默认计费按 DeepSeek 官方价格维度拆分为缓存命中输入、缓存未命中输入和输出，并可通过
`SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_CNY_PER_MILLION`、
`SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_CNY_PER_MILLION`、
`SHADOW_MODEL_PROXY_OUTPUT_CNY_PER_MILLION` 与 `SHADOW_MODEL_PROXY_SHRIMP_PER_CNY` 配置；默认兑换比例为
1 元 = 20 虾币，对应默认虾币价格为缓存命中输入 0.4、普通输入 20、输出 40 虾币 / 百万 tokens。
也可以直接配置换算后的虾币价格：
`SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_SHRIMP_PER_MILLION`、
`SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_SHRIMP_PER_MILLION` 与
`SHADOW_MODEL_PROXY_OUTPUT_SHRIMP_PER_MILLION`。兼容的 token-per-coin 覆盖配置只有在
`SHADOW_MODEL_PROXY_BILLING_MODE=token_ratio` 时才会启用：`SHADOW_MODEL_PROXY_TOKENS_PER_SHRIMP`，
或分别配置 `SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP` 与
`SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP`。

当钱包无法覆盖预扣金额时，代理不会在聊天里暴露上游风格错误，而是返回 OpenAI-compatible completion，
并带上 `shadow.type = "wallet_recharge_required"` 与 `X-Shadow-Recharge-Required: true`；
Shadow 客户端会把内嵌标记渲染成充值卡片：

```json
{
  "id": "chatcmpl-shadow-recharge-...",
  "object": "chat.completion",
  "choices": [{ "message": { "role": "assistant", "content": "<!-- shadow:wallet-recharge ... -->" } }],
  "shadow": {
    "type": "wallet_recharge_required",
    "requiredAmount": 2,
    "balance": 0,
    "shortfall": 2
  }
}
```

## 服务器

| 方法   | 端点                             | 描述           |
|--------|----------------------------------|----------------|
| GET    | `/api/servers`                   | 列出用户服务器 |
| POST   | `/api/servers`                   | 创建服务器     |
| GET    | `/api/servers/:id`               | 获取服务器详情 |
| PUT    | `/api/servers/:id`               | 更新服务器     |
| DELETE | `/api/servers/:id`               | 删除服务器     |
| POST   | `/api/servers/:id/join`          | 加入服务器     |
| POST   | `/api/servers/:id/leave`         | 离开服务器     |
| GET    | `/api/servers/:id/members`       | 列出服务器成员 |

## 频道

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/servers/:serverId/channels`        | 列出频道     |
| POST   | `/api/servers/:serverId/channels`        | 创建频道     |
| GET    | `/api/channels/:id`                      | 获取频道详情 |
| GET    | `/api/channels/:id/access`               | 获取当前用户的频道访问状态，包括私有频道是否需要审批、是否已有待审批申请。 |
| POST   | `/api/channels/:id/join-requests`        | 申请加入私有频道。私有频道可以被 mention，但读取和发送消息需要频道成员身份或审批通过。 |
| PATCH  | `/api/channel-join-requests/:requestId`  | 审批私有频道加入申请，请求体为 `{ "status": "approved" \| "rejected" }`。 |
| PUT    | `/api/channels/:id`                      | 更新频道     |
| DELETE | `/api/channels/:id`                      | 删除频道     |

## 消息

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/channels/:channelId/messages`      | 列出消息     |
| POST   | `/api/channels/:channelId/messages`      | 发送消息，支持可选结构化 `mentions`、`metadata` 和任意类型附件。Mention 会先做权限校验并规范化后再持久化（`<@userId>`、`<#channelId>`、`<@server:serverId>`）；原始显示 token 可通过 `sourceToken` 传入。用户、Buddy 和广播 mention 会创建提及通知。服务器频道附件会自动关联到该服务器工作区并在附件上返回 `workspaceNodeId`。私有频道附件的工作区节点仅对频道成员或服务器管理员可见。 |
| GET    | `/api/mentions/suggest`                  | 根据 `channelId`、`trigger`（`@` 或 `#`）和可选 `q` 返回用户、Buddy、频道、服务器 mention 建议，包含用于输入的显示 token 和稳定目标 ID；客户端应随消息提交结构化 mentions，由服务端持久化为规范引用。 |
| POST   | `/api/mentions/resolve`                  | 将消息 `content` 和可选客户端 `mentions` 解析为已做权限校验的结构化 mentions。 |
| GET    | `/api/threads/:id/messages`              | 列出线程消息 |
| POST   | `/api/threads/:id/messages`              | 在线程中发送消息，支持可选结构化 `mentions` 和 `metadata` |
| GET    | `/api/messages/:id`                      | 按 ID 获取   |
| GET    | `/api/messages/:id/interactive-state`    | 获取当前用户的交互块状态 |
| POST   | `/api/messages/:id/interactive`          | 提交交互块动作 |
| PATCH  | `/api/messages/:id`                      | 编辑消息     |
| DELETE | `/api/messages/:id`                      | 删除消息     |

交互消息块存储在 `message.metadata.interactive`；one-shot 提交结果由服务端持久化，后续读取会在 `message.metadata.interactiveState.response` 返回。客户端也可以通过 `GET /api/messages/:id/interactive-state?blockId=<blockId>` 直接读取同一份服务端状态。

商品卡片存储在 `message.metadata.commerceCards`。客户端只能从 `GET /api/commerce/product-picker` 选择卡片；可信 Buddy 工具可发送最小 Offer 引用 `{ "kind": "offer", "offerId": "..." }`。服务端会在持久化前重新校验可见性、目标 scope、商品状态以及 DM/服务器限制，并重建商品、价格和权益快照。卡片购买按钮调用 commerce purchase API，不复用交互块提交接口。

## 代理

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/agents`                            | 列出代理     |
| POST   | `/api/agents`                            | 创建代理     |
| POST   | `/api/agents/:id/heartbeat`              | 记录 Buddy 存活状态；令牌必须属于该 Buddy 的 bot 用户 |
| POST   | `/api/agents/:id/usage-snapshot`         | 上报轻量运行时使用量遥测；令牌必须属于该 Buddy 的 bot 用户 |
| GET    | `/api/agents/:id/config`                 | 获取远程配置 |
| PUT    | `/api/agents/:id/slash-commands`         | 注册斜杠命令 |
| GET    | `/api/agents/:id/slash-commands`         | 列出注册命令 |
| GET    | `/api/channels/:id/slash-commands`       | 列出频道可用命令 |

Cloud 成本看板只读取 `usage-snapshot` 快照行，请求时不会再进入 Kubernetes Pod 执行命令。

## Cloud SaaS 部署

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/cloud-saas/deployments`            | 列出当前部署实例；加 `includeHistory=1` 可返回历史尝试 |
| POST   | `/api/cloud-saas/deployments`            | 创建新的部署实例；同一用户、集群、命名空间下只允许一个存活实例 |
| GET    | `/api/cloud-saas/deployments/:id`        | 获取单次部署尝试 |
| GET    | `/api/cloud-saas/deployments/costs`      | 从 Buddy 遥测快照聚合部署使用量 |
| GET    | `/api/cloud-saas/deployments/:id/costs`  | 获取单个部署的使用量快照 |
| DELETE | `/api/cloud-saas/deployments/:id`        | 销毁当前部署实例 |
| POST   | `/api/cloud-saas/deployments/:id/redeploy` | 为当前部署实例排队一次新的部署尝试 |
| POST   | `/api/cloud-saas/deployments/:id/cancel` | 请求取消 pending / deploying 状态的尝试 |
| GET    | `/api/cloud-saas/deployments/:id/logs`   | 流式读取部署日志 |

部署表记录的是历史尝试；稳定的部署实例由用户、集群和命名空间共同确定。`GET /api/cloud-saas/deployments` 和 `GET /api/cloud-saas/deployments/:id` 会在前置活跃任务占用命名空间队列时返回 `blockedBy`，并在部署通过 shadowob 插件创建了 Shadow 服务器后返回 `shadowServerId` / `shadowChannelId`。重复创建同一存活命名空间、对历史尝试执行重新部署或销毁、或者在命名空间已有操作运行时继续变更，都会返回 `409`。

## Cloud SaaS 模型供应商 Profiles

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/cloud-saas/provider-catalogs`      | 从 Cloud 插件列出模型供应商目录 |
| GET    | `/api/cloud-saas/provider-profiles`      | 列出加密存储的供应商 Profile |
| PUT    | `/api/cloud-saas/provider-profiles`      | 创建或更新供应商 Profile |
| POST   | `/api/cloud-saas/provider-profiles/:id/test` | 测试供应商凭据 |
| POST   | `/api/cloud-saas/provider-profiles/:id/models/refresh` | 发现并持久化供应商模型 |
| DELETE | `/api/cloud-saas/provider-profiles/:id`  | 删除供应商 Profile |

供应商密钥复用 Cloud env var KMS 加密链路。第一期只支持 API Key 类型的供应商 Profile。使用 `model-provider` 插件的模板会获得匹配的运行时密钥和模型元数据，包括用户配置的 `default`、`fast`、`reasoning`、`vision`、`tools` 等标签。

上面的供应商 Profile 接口用于用户自有密钥的加密存储、模型发现、模型标签和部署时注入。官方自有代理单独暴露在 `/api/ai/v1`，并且在一键 Cloud 玩法里只注入受限模型代理 token。

## 文件上传

| 方法 | 端点           | 描述                    |
|------|----------------|------------------------|
| POST | `/api/upload`  | 上传文件（multipart）   |

文件存储在 MinIO（S3 兼容），通过预签名 URL 提供服务。

## 店铺、Commerce 与 Entitlement

服务器店铺继续沿用 `/api/servers/:serverId/shop`。第一期新增 scope-neutral 和个人店铺接口，用于虚拟服务和订阅 Entitlement。

| 方法   | 端点 | 描述 |
|--------|------|------|
| GET    | `/api/me/shop` | 获取或创建当前登录用户的个人店铺。个人店铺仅登录用户可见。 |
| POST   | `/api/me/shop` | 更新当前登录用户的个人店铺信息。 |
| GET    | `/api/users/:userId/shop` | 获取其他用户可见的个人店铺。 |
| GET/POST | `/api/users/:userId/shop/manage` | 当 actor 是该用户本人，或是该 Buddy 用户的拥有者时，管理该用户个人店铺。 |
服务器店铺继续使用 `/api/servers/:serverId/shop`。Scope-neutral 与个人店铺 Commerce API 支持虚拟服务和订阅权益。Entitlement 统一表示为 `resourceType`、`resourceId`、`capability` 三元组，旧的频道/应用门禁类权益不再属于 API 契约。

| GET    | `/api/shops/:shopId` | 按 ID 获取店铺。 |
| GET    | `/api/shops/:shopId/products` | 列出服务器或个人店铺商品。 |
| GET    | `/api/products/:productId` | 在不知道店铺 scope 时读取可见商品详情。 |
| GET/PUT/DELETE | `/api/shops/:shopId/products/:productId` | 读取或管理 scope-neutral 店铺商品。 |
| POST   | `/api/shops/:shopId/products` | 在可管理店铺里创建商品。虚拟服务使用 `productType: "entitlement"`，`billingMode` 为 `fixed_duration` 或 `subscription`。 |
| GET    | `/api/commerce/product-picker` | 根据 `target=channel` 或 `target=dm` 返回 Offer 驱动的 `CommerceProductCard` 和店铺分组。频道 Picker 包含当前用户个人店铺、服务器店铺和频道内 Buddy 店铺。 |
| GET    | `/api/commerce/offers/:offerId/checkout-preview` | 返回服务端可信的 Offer 结算快照，包含商品、卖家店铺、权益资源、付费文件 metadata、`viewerState`、`primaryAction`、`displayState` 和 `nextAction`。客户端在展示购买确认或打开已购内容前调用。卖家和销售该商品的 Buddy 可传 `viewerUserId` 查询当前对话用户对自己 Offer 的状态；只有查询自己时才返回钱包余额展示信息。 |
| POST   | `/api/shops/:shopId/offers` | 为可管理店铺的商品创建 Offer。Offer 定义销售场景、卖家/Buddy 发送者、可选覆盖价格和 metadata。 |
| POST   | `/api/shops/:shopId/offers/:offerId/deliverables` | 给 Offer 绑定交付物。第四期支持 `kind: "paid_file"`，通过 `resourceType: "workspace_file"` 指向工作区文件。 |
| POST   | `/api/commerce/offers/:offerId/purchase` | 使用 `{ idempotencyKey, skuId?, destinationKind?, destinationId? }` 购买 active Offer。订单立即 `completed`，立即发放 Entitlement；提供 destination 时创建交付任务。 |
| POST   | `/api/shops/:shopId/products/:productId/purchase` | Entitlement 商品的兼容直接购买路径。新的聊天流程应购买 Offer。 |
| POST   | `/api/messages/:messageId/commerce-cards/:cardId/purchase` | 从频道消息 metadata 内的 Offer 卡片购买。 |
| POST   | `/api/dm/messages/:messageId/commerce-cards/:cardId/purchase` | 从私聊消息 metadata 内的 Offer 卡片购买。 |
| GET    | `/api/paid-files/:fileId` | 查看付费文件 metadata，并检查当前用户是否拥有有效 Entitlement。 |
| POST   | `/api/paid-files/:fileId/open` | 为拥有权益的用户签发短时付费文件 Grant，并返回 viewer URL。 |
| GET    | `/api/paid-files/:fileId/view/:grantId` | 渲染 Grant 保护的付费文件；访问时会重新校验 Grant 和 Entitlement。 |
| GET    | `/api/entitlements` | 跨店铺 scope 列出当前用户 Entitlement，并在可用时返回关联店铺、商品、Offer 摘要和付费文件 metadata。 |
| GET    | `/api/shops/:shopId/entitlements` | 商家查看可管理店铺发放出的 Entitlement。 |
| GET    | `/api/entitlements/:entitlementId/verify` | 验证当前 Entitlement 状态和发货状态。 |
| POST   | `/api/entitlements/:entitlementId/cancel` | 立即取消订阅/Entitlement、撤销访问，并按策略发起比例退款。 |
| POST   | `/api/entitlements/:entitlementId/force-majeure-requests` | 商家提交不可抗力撤销申请。平台裁定前 Entitlement 保持有效。 |
| POST   | `/api/entitlement-review/:requestId/decision` | 平台审核员裁定不可抗力退款与撤销。 |

## 钱包展示

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/wallet/transactions?audience=consumer&direction=all\|income\|expense&limit=&offset=` | 查询当前用户钱包流水。`audience=consumer` 返回 ToC 展示视图，会排除内部模型代理预扣/调账流水，并按 `direction` 做服务端筛选。 |
| GET | `/api/wallet/transactions/count?audience=consumer&direction=all\|income\|expense` | 使用与列表相同的展示条件返回分页总数。 |

## 通知

通知创建统一由服务端 trigger service 触发。客户端应把通知视为由 `kind` 标识的事件记录，不应依赖写死的 `title` 文案。

| 方法   | 端点                                    | 描述 |
|--------|-----------------------------------------|------|
| GET    | `/api/notifications`                    | 列出当前用户通知，支持 `limit` 和 `offset`。记录包含 `kind`、`metadata`、`scopeServerId`、`scopeChannelId`、`scopeDmChannelId`、`aggregationKey`、`aggregatedCount`。 |
| PATCH  | `/api/notifications/:id/read`           | 将单条通知标记已读；服务端会按当前认证用户限定更新范围。 |
| POST   | `/api/notifications/read-all`           | 将当前用户全部通知标记已读。 |
| POST   | `/api/notifications/read-scope`         | 按服务器/频道/DM 范围标记未读通知，入参为 `{ serverId?, channelId?, dmChannelId? }`，至少需要一个字段。 |
| GET    | `/api/notifications/unread-count`       | 返回应用通知偏好和静音过滤后的 `{ count }`。 |
| GET    | `/api/notifications/scoped-unread`      | 返回 `{ channelUnread, serverUnread, dmUnread }`，按 scope 统计聚合后的未读数。 |
| GET    | `/api/notifications/preferences`        | 获取通知偏好：`strategy`、`mutedServerIds`、`mutedChannelIds`。 |
| PATCH  | `/api/notifications/preferences`        | 更新通知偏好。`strategy` 可为 `all`、`mention_only`、`none`。 |
| GET    | `/api/notifications/channel-preferences` | 获取每个通知 kind/投递渠道的偏好。 |
| PATCH  | `/api/notifications/channel-preferences` | 写入 `{ kind, channel, enabled }`，渠道包括 `mobile_push`、`web_push`、`email`、`sms`、`chat_system` 等。 |
| POST   | `/api/notifications/push-tokens`        | 注册移动端 Expo Push token。 |
| DELETE | `/api/notifications/push-tokens/:idOrToken` | 停用移动端 Push token。 |
| POST   | `/api/notifications/web-push-subscriptions` | 注册浏览器 Web Push subscription。 |
| DELETE | `/api/notifications/web-push-subscriptions/:idOrEndpoint` | 停用 Web Push subscription。 |

常见通知 kind 包括 `message.mention`、`message.reply`、`dm.message`、`channel.access_requested`、`channel.access_approved`、`channel.access_rejected`、`channel.member_added`、`server.member_joined`、`server.invite`、`friendship.request`、`recharge.succeeded`、`commerce.purchase_completed`、`commerce.renewal_failed`、`commerce.subscription_cancelled`。面向用户的文案应基于 `kind` 和 `metadata` 走 i18n 渲染；数据库里的 `title` 和 `body` 仅作为旧客户端 fallback。

## WebSocket 事件

Shadow 使用 Socket.IO 进行实时通信。使用相同的服务器 URL 和认证令牌连接。

### 客户端 → 服务端事件

| 事件                | 负载                           | 描述             |
|--------------------|--------------------------------|------------------|
| `channel:join`     | `{ channelId }`                | 加入频道房间     |
| `channel:leave`    | `{ channelId }`                | 离开频道房间     |
| `message:send`     | `{ channelId, content, ... }`  | 发送消息         |
| `typing:start`     | `{ channelId }`                | 开始输入指示     |
| `typing:stop`      | `{ channelId }`                | 停止输入指示     |

### 服务端 → 客户端事件

| 事件                | 负载                           | 描述             |
|--------------------|--------------------------------|------------------|
| `channel:message`  | `{ message }`                  | 频道新消息       |
| `message:updated`  | `{ message }`                  | 消息已编辑       |
| `message:deleted`  | `{ messageId, channelId }`     | 消息已删除       |
| `channel:created`  | `{ channel }`                  | 新频道创建       |
| `channel:deleted`  | `{ channelId }`                | 频道已删除       |
| `member:joined`    | `{ member, serverId }`         | 新成员加入       |
| `member:left`      | `{ userId, serverId }`         | 成员离开         |
| `typing`           | `{ userId, channelId }`        | 用户正在输入     |
| `presence:update`  | `{ userId, status }`           | 在线状态更新     |
| `notification:new` | `notification`                 | 新通知事件记录   |

## SDK 使用

编程访问建议使用 TypeScript 或 Python SDK，而不是原始 HTTP 调用。详见 [SDK 使用指南](SDK-Usage.md)。
