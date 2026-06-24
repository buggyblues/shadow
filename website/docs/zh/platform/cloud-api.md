---
title: Cloud API 参考
description: Shadow Cloud SaaS 完整 REST API 参考 — 模版、部署、Cloud App 暴露、环境变量、供应商配置、钱包、活动日志和 DIY 生成。
---

# Cloud API 参考

大多数接口以 `/api/cloud-saas` 为前缀；Cloud App 暴露接口以 `/api/cloud/exposures`
为前缀。所有接口都需要 Bearer Token 认证。

## 模版 (Templates)

### 列出模版

```
GET /api/cloud-saas/templates
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `category` | string | 按分类过滤 |
| `q` | string | 搜索关键词 |
| `locale` | string | 语言 (默认 `'en'`) |

返回已审核通过的模版（官方 + 社区），按分类和评分排序。

### 获取模版

```
GET /api/cloud-saas/templates/:slug
```

返回单个模版完整内容。支持服务端国际化渲染。

### 获取模版环境变量引用

```
GET /api/cloud-saas/templates/:slug/env-refs
```

返回模版标识、必需环境变量、表单字段和自动检测到的环境变量。

### 我的模版

```
GET /api/cloud-saas/templates/mine
GET /api/cloud-saas/templates/mine/:slug
```

列出或获取当前用户的模版，包含待审核/已驳回的。

### 创建模版

```
POST /api/cloud-saas/templates
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `slug` | string | 是 | Kebab-case 标识 (1–255) |
| `name` | string | 是 | 显示名称 (1–255) |
| `description` | string | 否 | Markdown 描述 |
| `content` | object | 是 | CloudConfig 快照 |
| `tags` | string[] | 否 | 最多 20 个标签 |
| `category` | string | 否 | 分类 (≤64) |
| `baseCost` | number | 否 | 预估月费 (虾豆) |

内容会经过模版策略白名单校验，提交后状态为 `pending`。

### 更新模版

```
PUT /api/cloud-saas/templates/:slug
```

字段同创建（均可选）。仅作者在 `draft` 或 `rejected` 状态下可修改。

### 重新提交审核

```
POST /api/cloud-saas/templates/:slug/submit
```

将 `draft` 或 `rejected` 模版重新提交审核。

### 删除模版

```
DELETE /api/cloud-saas/templates/:slug
```

删除自己的模版（不限审核状态）。

---

## 部署 (Deployments)

### 列出部署

```
GET /api/cloud-saas/deployments
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `limit` | number | 返回条数 (默认 50, 最大 100) |
| `offset` | number | 分页偏移 (默认 0) |
| `includeOrphans` | `'1'` | 包含孤立命名空间 |
| `includeHistory` | `'1'` | 包含所有历史部署 |

每个命名空间返回最新的可见部署。

### 获取部署成本

```
GET /api/cloud-saas/deployments/costs
```

返回所有可见 SaaS 部署的聚合成本。

### 创建部署

```
POST /api/cloud-saas/deployments
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `namespace` | string | 是 | K8s 安全名称 (1–255) |
| `name` | string | 是 | 部署显示名称 (1–255) |
| `templateSlug` | string | 是 | 模版标识 |
| `resourceTier` | string | 是 | `lightweight` / `standard` / `pro` |
| `agentCount` | number | 否 | 代理副本数 (≥0) |
| `configSnapshot` | object | 是 | 合规 CloudConfig |
| `envVars` | object | 否 | 环境变量覆盖 |
| `runtimeContext` | object | 否 | `{ locale?, timezone? }` |

创建部署时进行计费校验、模版校验、命名空间加锁和钱包余额检查（余额不足返回 `402`）。部署异步排队执行。

### 获取部署

```
GET /api/cloud-saas/deployments/:id
```

返回部署详情，含当前状态、阻塞信息和成本汇总。

### 获取单个部署成本

```
GET /api/cloud-saas/deployments/:id/costs
```

### 取消部署

```
POST /api/cloud-saas/deployments/:id/cancel
```

取消进行中的部署/销毁任务。不等待命名空间操作锁。

### 删除部署

```
DELETE /api/cloud-saas/deployments/:id
```

排队执行 Pulumi 销毁。中断进行中的操作。

### 重新部署

```
POST /api/cloud-saas/deployments/:id/redeploy
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `mode` | string | 否 | `snapshot` (默认) 或 `template` |
| `templateSlug` | string | 否 | 从指定模版部署 |
| `configSnapshot` | object | 否 | 策略校验后的显式配置 |
| `envVars` | object | 否 | 覆盖模版声明的环境变量 |
| `runtimeContext` | object | 否 | `{ locale?, timezone? }` |

同命名空间重新部署，生成新历史记录。不扣费。

---

### 部署日志

```
GET /api/cloud-saas/deployments/:id/logs
GET /api/cloud-saas/deployments/:id/logs/history
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `agent` | string | 按代理名过滤 |
| `pod` | string | 按 Pod 名过滤 |
| `page` | number | 页码 (1–100) |
| `limit` | number | 每页条数 (20–500, 默认 200) |

`GET /logs` 返回 SSE 事件流 (`text/event-stream`)，实时推送 `log`、`status`、`error`、`close` 事件。部署到终态时自动终止。

`GET /logs/history` 返回 JSON 数组。

### Pod 信息

```
GET /api/cloud-saas/deployments/:id/pods
GET /api/cloud-saas/deployments/:id/pod-logs
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `pod` | string | Pod 名 (/pod-logs 必填) |
| `agent` | string | 代理名 |
| `tail` | number | 日志行数 (默认 200, 最大 2000) |
| `container` | string | 容器名 (默认 `'openclaw'`) |

`GET /pods` 列出部署命名空间中 K8s Pod。`GET /pod-logs` 通过 SSE 流推送实时 Pod 日志。

### 孤立命名空间管理

```
POST /api/cloud-saas/deployments/orphans/:namespace/claim
POST /api/cloud-saas/deployments/orphans/:namespace/cleanup
```

`/claim` 认领无数据库行的 Cloud 命名空间。`/cleanup` 强制删除孤立命名空间（仅管理员）。

---

## Cloud App 暴露

这些接口把 Cloud 部署里的运行时服务发布到 Shadow 管理的稳定 App 域名，并同步 Server
App 安装、发布元数据和备份集。

```
POST /api/cloud/exposures/runtime/reconcile
POST /api/cloud/exposures/server-apps/publish
GET /api/cloud/exposures/server-apps/:appKey/status
POST /api/cloud/exposures/server-apps/:appKey/backup
POST /api/cloud/exposures/server-apps/:appKey/restore
POST /api/cloud/exposures/server-apps/:appKey/unpublish
```

| 接口 | 用途 |
| --- | --- |
| `/runtime/reconcile` | 创建或更新 HTTP service / Server App 的运行时暴露记录。 |
| `/server-apps/publish` | 分配稳定域名、发布 release，并可选安装到服务器。 |
| `/status` | 返回某个 App key 的暴露、release、安装和备份状态。 |
| `/backup` / `/restore` | 创建或恢复 App 级备份集，可包含状态、源码、release 和安装元数据。 |
| `/unpublish` | 关闭暴露，并可选卸载 Server App。 |

---

## 环境变量 (Environment Variables)

### 部署级环境变量

```
GET /api/cloud-saas/envvars/:deploymentId
GET /api/cloud-saas/envvars/:deploymentId/:key
PUT /api/cloud-saas/envvars/:deploymentId
DELETE /api/cloud-saas/envvars/:deploymentId/:key
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `vars` | array | 是 (PUT) | `[{ key: string, value: string }]` |

值进行加密存储。GET 列表返回脱敏值 (`'****'`)，按 Key 获取返回解密值供编辑。

### 全局环境变量

```
GET /api/cloud-saas/global-envvars
GET /api/cloud-saas/global-envvars/:key
PUT /api/cloud-saas/global-envvars
DELETE /api/cloud-saas/global-envvars/:key
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `key` | string | 是 | 变量名 |
| `value` | string | 是 | 变量值 |
| `isSecret` | boolean | 否 | 是否涉密（脱敏） |
| `groupName` | string | 否 | 所属分组 |

### 全局环境变量分组

```
POST /api/cloud-saas/global-envvars/groups
DELETE /api/cloud-saas/global-envvars/groups/:name
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `name` | string | 是 | 分组名 (1–255) |

---

## 供应商配置与目录 (Provider Profiles & Catalogs)

### 列出供应商目录

```
GET /api/cloud-saas/provider-catalogs
```

返回 Cloud 插件发现的模型供应商。每条包含插件 ID、供应商详情和必填密钥字段。

### 列出供应商配置

```
GET /api/cloud-saas/provider-profiles
```

返回当前用户的加密供应商配置。值已脱敏。

### 增改供应商配置

```
PUT /api/cloud-saas/provider-profiles
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `id` | string | 否 | 配置 ID（更新时） |
| `providerId` | string | 是 | 提供商标识 (1–120) |
| `name` | string | 是 | 显示名称 (1–255) |
| `enabled` | boolean | 否 | 是否启用 |
| `config` | object | 否 | 供应商配置 |
| `envVars` | object | 否 | 加密环境变量 |

校验配置中的模型列表并对 Base URL 做 SSRF 检查。

### 测试供应商配置

```
POST /api/cloud-saas/provider-profiles/:id/test
```

用加密凭证测试供应商 API 连通性，8 秒超时，含 SSRF 防护。

### 刷新模型列表

```
POST /api/cloud-saas/provider-profiles/:id/models/refresh
```

从供应商原生 API 获取模型列表并写入配置。

### 删除供应商配置

```
DELETE /api/cloud-saas/provider-profiles/:id
```

删除配置及所有加密值。

---

## 钱包 (Wallet)

### 获取余额

```
GET /api/cloud-saas/wallet
```

返回当前用户虾豆余额。

```json
{
  "balance": 5000,
  "currency": "shrimp_coin"
}
```

### 交易记录

```
GET /api/cloud-saas/wallet/transactions
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `limit` | number | 条数 (默认 50, 最大 100) |
| `offset` | number | 分页偏移 (默认 0) |

---

## 活动日志 (Activity)

```
GET /api/cloud-saas/activity
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `limit` | number | 条数 (默认 50, 最大 100) |
| `offset` | number | 分页偏移 (默认 0) |

返回用户 Cloud 活动日志（分页），包含部署创建、暂停、恢复、备份、恢复、删除等事件。

---

## DIY Cloud (AI 生成)

### 创建生成运行

```
POST /api/cloud-saas/diy/runs
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `prompt` | string | 是 | 生成提示词 (4–2000 字符) |
| `feedback` | string | 否 | 反馈意见 (≤2000) |
| `previousConfig` | object | 否 | 历史 CloudConfig 快照 |
| `locale` | string | 否 | 语言 (≤16) |
| `timezone` | string | 否 | 时区 (≤64) |

限流 12 次/分钟。返回 `runId`、`status`、`streamUrl`。

AI 生成接入点需先进行能力校验、速率/预算控制及 Token 估算。

### 获取运行

```
GET /api/cloud-saas/diy/runs/:runId
GET /api/cloud-saas/diy/runs/:runId/stream
```

| 参数 | 类型 | 说明 |
|-------|------|------|
| `afterSeq` | number | 事件偏移 (≥0) |

`GET /runs/:runId` 返回运行及 afterSeq 之后的事件。`GET /stream` 返回 SSE 实时流。

### 追加运行

```
POST /api/cloud-saas/diy/runs/:runId/feedback
```

| 字段 | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `feedback` | string | 是 | 优化反馈 (1–2000) |
| `prompt` | string | 否 | 更新提示词 (4–2000) |
| `locale` | string | 否 | 语言 |
| `timezone` | string | 否 | 时区 |

### 取消运行

```
POST /api/cloud-saas/diy/runs/:runId/cancel
```

取消生成运行。

### DIY 资源

```
GET /api/cloud-saas/diy/templates
GET /api/cloud-saas/diy/plugins
GET /api/cloud-saas/diy/plugins/search?q=...
```

列出可用的社区模版和插件。

---

## Schema 与校验

```
GET /api/cloud-saas/schema
POST /api/cloud-saas/validate
```

`GET /schema` 返回 CloudConfig JSON Schema，供前端校验和编辑器自动补全。

`POST /validate` 接收原始 JSON 配置快照，返回校验结果及错误信息。

---

## 客户端方法

:::code-group

```ts [TypeScript]
const templates = await client.listCloudTemplates({ q: 'web', locale: 'zh-CN' })
const template = await client.getCloudTemplate('web-app', { locale: 'zh-CN' })
const envRefs = await client.getCloudTemplateEnvRefs('web-app')

const deployments = await client.listCloudDeployments({ limit: 20 })
const deployment = await client.createCloudDeployment({
  namespace: 'my-app',
  name: 'My App',
  templateSlug: 'web-app',
  resourceTier: 'standard',
  configSnapshot: {},
})
await client.cancelCloudDeployment(deployment.id)
await client.pauseCloudDeployment(deployment.id)
await client.resumeCloudDeployment(deployment.id)

await client.publishCloudApp({ appKey: 'demo-desk', deploymentId: deployment.id, port: 4216 })
await client.getCloudAppStatus('demo-desk', { deploymentId: deployment.id })
await client.backupCloudApp('demo-desk', { deploymentId: deployment.id })
await client.unpublishCloudApp('demo-desk', { deploymentId: deployment.id, uninstall: true })

await client.upsertCloudProviderProfile({ providerId: 'openai', name: 'My Key', config: {} })

const { runId } = await client.createDiyCloudRun({ prompt: '创建一个客服机器人' })
await client.createDiyCloudFeedbackRun(runId, { feedback: '加上深色模式' })
await client.cancelDiyCloudRun(runId)
```

```python [Python]
result = client.list_cloud_templates(q="web", locale="zh-CN")
template = client.get_cloud_template("web-app", locale="zh-CN")
env_refs = client.get_cloud_template_env_refs("web-app")

deployments = client.list_cloud_deployments(limit=20)
deployment = client.create_cloud_deployment(
    namespace="my-app",
    name="My App",
    template_slug="web-app",
    resource_tier="standard",
    config_snapshot={},
)
client.cancel_cloud_deployment(deployment["id"])
client.pause_cloud_deployment(deployment["id"])
client.resume_cloud_deployment(deployment["id"])

client.publish_cloud_app(app_key="demo-desk", deployment_id=deployment["id"], port=4216)
client.get_cloud_app_status("demo-desk", deployment_id=deployment["id"])
client.backup_cloud_app("demo-desk", deployment_id=deployment["id"])
client.unpublish_cloud_app("demo-desk", deployment_id=deployment["id"], uninstall=True)

client.upsert_cloud_provider_profile(provider_id="openai", name="My Key", config={})

result = client.create_diy_cloud_run(prompt="创建一个客服机器人")
client.create_diy_cloud_feedback_run(result["runId"], feedback="加上深色模式")
client.cancel_diy_cloud_run(result["runId"])
```

:::

---

## Next Steps

- [Cloud SaaS 运行时](./cloud-saas) — 暂停/恢复/备份/恢复操作。
- [Cloud CLI](./cloud-cli) — 独立部署 CLI。
- [模版](./cloud-templates) — 模版目录与编写指南。
- [插件](./cloud-plugins) — 插件生态。
- [SDK](./sdks) — 完整客户端方法。
