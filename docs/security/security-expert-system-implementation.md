# 安全专家系统实现说明

## 1. 为什么要把安全修复系统化

这轮安全问题的共同点不是单个接口写错，而是底层架构没有强制表达“谁在什么作用域里操作哪个资源”。典型问题包括：

- Handler 先校验 URL 中的父资源，例如 `serverId` 或 `shopId`，随后又用全局 `appId`、`productId`、`orderId` 执行写操作。
- 高危基础能力直接暴露给业务代码，例如 `fetch`、Kubernetes namespace 删除、pod log、对象存储直读、钱包转账。
- 资金类状态变化缺少幂等约束，重复请求或并发请求可能造成重复结算、重复处罚。
- 安全规则存在于人的 review 经验里，没有自动化检查，导致同类漏洞会在新模块里反复出现。

因此本次实现的核心目标是：把安全专家的判断沉淀成运行时组件、代码边界和自动化扫描规则。

## 2. 引入的方法

### 2.1 ActorContext

`ActorContext` 用于统一描述请求主体、请求 ID、来源信息和认证类型。以后高危 UseCase 不直接接收 `userId: string`，而是接收 `ctx: ActorContext`。

这样做的目的：

- 后续可以区分普通用户、PAT、OAuth、Agent、System job。
- 审计日志可以记录同一套 actor 表达。
- AccessService 可以在一个入口里判断 scope、role、token capability。

### 2.2 AccessService

`AccessService` 是对象级授权的中心。它不只判断“用户是不是某个 server 的 admin”，还要判断“目标子资源是否真的属于该父作用域”。

例如 App 更新必须满足：

```text
actor can manage serverId
AND app.id = appId
AND app.serverId = serverId
```

这条规则必须在服务端强制执行，不能依赖前端传参或 UI 隐藏。

### 2.3 UseCase 层

UseCase 用来承载高危动作：创建、更新、删除、claim、cleanup、结算、处罚、安装 agent 等。

UseCase 的职责：

1. 解析业务动作的安全边界。
2. 调 AccessService 做授权。
3. 调 Service / Repository 执行业务。
4. 记录审计。
5. 处理幂等键或状态机约束。

Handler 的职责应该退化为：认证、参数解析、调用 UseCase、返回响应。

### 2.4 Scoped Repository

DAO / Repository 的写方法必须把父作用域写进方法签名。

推荐：

```ts
updateByServerIdAndId(serverId, appId, patch)
updateByShopIdAndId(shopId, productId, patch)
updateOrderStatusInShop(shopId, orderId, status)
```

禁止新代码继续新增：

```ts
update(id, patch)
delete(id)
updateOrderStatus(orderId, status)
```

历史兼容方法可以暂时保留，但应作为迁移入口，不允许 Handler 直接调用。

### 2.5 安全 Gateway

危险能力必须收口到专用 Gateway：

- `SafeHttpClient`：所有服务端外部 HTTP 请求必须经过 URL 安全校验、重定向校验、大小限制。
- `KubernetesOpsGateway`：namespace claim/cleanup 等平台级动作必须经过 admin gate 和全局 owner 校验。
- `MediaAccessGateway`：私有对象读取只能通过授权签发的短期 token。
- `CommandGateway`：进程创建必须带原因、日志和超时，避免业务代码随意 spawn。

Gateway 的原则是“默认拒绝，显式允许”。

### 2.6 状态机与幂等

资金、处罚、结算、退款不能只靠内存判断或接口逻辑判断。必须同时具备：

- 状态迁移检查：只有真实从 A 迁移到 B 时触发副作用。
- 数据库唯一约束：同一个 reference 只能结算一次。
- 事务边界：状态变更与副作用应在同一个事务或可恢复的 outbox 流程中完成。

本次已先加入订单完成结算的状态迁移守卫，以及 wallet transaction / rental violation 的数据库唯一约束。

## 3. 当前已调整的地方

### 3.1 App

旧的 Server App / App Proxy 代码已移除，避免继续保留 URL 代理攻击面。
- 避免一个 server admin 用全局 appId 修改另一个 server 的 app。

### 3.2 Cloud SaaS

调整点：

- orphan namespace claim/cleanup 改走 `KubernetesOpsGateway`。
- 操作前要求 platform admin。
- 操作前确认 namespace 是平台 managed namespace 且全局没有 deployment owner。
- `includeOrphans=1` 不再对普通用户开放，避免泄露其他租户 namespace。

效果：

- 普通用户不能 claim / cleanup 其他租户 namespace。
- namespace 删除变为平台级能力。

### 3.3 Media

调整点：

- 禁用原始对象路径直读。
- 附件访问统一走 `MediaAccessGateway` 和短期 signed URL。

效果：

- 私有对象不再因知道 bucket/key 而可读。

### 3.4 Shop / Order

调整点：

- 旧 server-scoped 商品、分类、订单状态写接口先解析 shop，再执行 shop-scoped 写方法。
- 订单完成结算只在真实状态迁移到 `completed` 时触发。
- 增加 wallet transaction reference 唯一约束。

效果：

- 降低跨店铺 IDOR 风险。
- 降低重复结算风险。

### 3.5 Rental

调整点：

- 违约报告只允许 active 合同。
- 同一合同、同一违约类型、同一违约方只能报告一次。
- 增加数据库唯一约束。

效果：

- 降低重复处罚、重复转账风险。

### 3.6 Server / Agent

调整点：

- 安装 agent 到 server 必须具备目标 server admin 权限。
- 禁止普通成员更新接口降级 owner。

效果：

- 避免任意用户向私有 server 注入 bot。
- 避免 admin 通过降级再踢出 owner 接管 server。

## 4. 自动化扫描

新增扫描器：

```bash
node tools/security/security-scan.mjs
```

生成 Markdown 报告：

```bash
node tools/security/security-scan.mjs --report=security-scan-report.md
```

作为阻断规则运行：

```bash
node tools/security/security-scan.mjs --fail-on-error
```

当前 CI 使用 report mode，原因是项目仍存在历史债务。建议先由打手按报告分批迁移，等 error 级别清零后再启用 fail mode。

## 5. 下一步交给打手的执行方式

打手不需要重新设计规则，只按以下机械规则批量迁移：

1. Handler 不直接 resolve DAO。
2. 有父资源路由的写操作，不调用 child-only update/delete。
3. 所有 server-side HTTP 请求改走 SafeHttpClient。
4. 所有 Kubernetes 危险动作改走 KubernetesOpsGateway。
5. 所有私有对象读取改走 MediaAccessGateway。
6. 所有钱包副作用改走幂等 Ledger / reference。
7. 每完成一个模块，运行 scanner，确认新增 error 不增加。
