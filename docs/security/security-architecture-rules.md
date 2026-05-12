# 安全架构规则

这份规则给后续批量重构使用。它不是建议，而是新代码需要遵守的边界。

## 规则 1：Handler 不做对象级授权

Handler 只负责认证、参数解析、调用 UseCase、返回响应。对象级授权必须在 AccessService 或 UseCase 中完成。

禁止：

```ts
await requireShopAdmin(serverId, userId)
await orderService.updateOrderStatus(orderId, status)
```

推荐：

```ts
await orderUseCase.updateStatus({ ctx, shopId, orderId, status })
```

## 规则 2：写操作必须携带父作用域

凡是子资源属于父资源，写方法必须同时携带父级 ID 和子资源 ID。

推荐命名：

```ts
updateByServerIdAndId(serverId, appId, patch)
deleteByServerIdAndId(serverId, appId)
updateByShopIdAndId(shopId, productId, patch)
updateOrderStatusInShop(shopId, orderId, status)
```

## 规则 3：不向非 owner 暴露资源存在性

如果资源存在但不属于当前 scope，应返回 404，而不是 403。

这样可以避免通过错误信息枚举跨租户资源 ID。

## 规则 4：危险基础能力必须走 Gateway

禁止业务代码直接使用：

- `fetch(...)` 访问用户可控 URL。
- Kubernetes namespace 删除、pod logs、PVC restore。
- 私有对象存储 stream 读取。
- `child_process.spawn` / `exec`。

必须通过：

- `SafeHttpClient`
- `KubernetesOpsGateway`
- `MediaAccessGateway`
- `CommandGateway`

## 规则 5：资金副作用必须幂等

钱包结算、退款、扣款、处罚必须绑定 reference，并在数据库层有唯一约束。

推荐 reference 组合：

```text
wallet_id + type + reference_type + reference_id
```

代码层必须保证只有真实状态迁移才触发副作用。

## 规则 6：平台运维动作必须 platform-admin

以下动作不是普通租户能力：

- orphan namespace claim
- orphan namespace cleanup
- managed namespace 全局枚举
- 跨租户资源修复
- 数据库 reset 后的 owner 修复

这些动作必须由 platform admin 或后台 reconcile job 执行，并记录审计。

## 规则 7：CI 先报告，后阻断

当前项目存在历史债务，扫描器先以 report mode 运行。迁移阶段按模块清理；当 error 级别为 0 后，将 CI 改为：

```bash
node tools/security/security-scan.mjs --fail-on-error
```
