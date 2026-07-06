---
title: Cloud SaaS 部署运行时
description: 通过暂停、恢复、备份和还原操作管理运行中的 Cloud 部署。
---

# Cloud SaaS 部署运行时

Cloud SaaS 部署通过 deployment API 命名空间提供运行时生命周期操作：暂停空闲的 Agent、按需恢复、创建和查看状态备份，以及从备份还原。

所有端点都在 `/api/cloud-saas/deployments/:id` 下。

## 模板 Manifest

```
GET /api/cloud-saas/deployments/:id/manifest
POST /api/cloud-saas/deployments/:id/template
POST /api/cloud-saas/deployments/:id/redeploy
```

`GET /manifest` 返回部署关联的模板、manifest 版本、配置哈希和漂移状态（`up-to-date`、`template-updated`、`missing-template`、`unlinked` 或 `unknown`）。普通 deployment 列表仍保持脱敏；Dashboard 或 CLI 需要解释运行中部署来源时，应使用这个端点。

`POST /template` 会把已部署的配置快照保存为可编辑模板。用户拥有的 draft/rejected 空间模板会原地更新；官方、已发布或审核中的模板会自动 fork。

`POST /redeploy` 继续支持空 body，行为仍是按已部署快照重新部署。也可以传入：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | `snapshot` 或 `template` | 否 | 使用已部署快照，或使用最新关联模板内容。 |
| `templateSlug` | string | 否 | 从指定可访问模板重新部署。 |
| `configSnapshot` | object | 否 | 从显式配置快照重新部署，服务端仍会执行策略校验。 |
| `envVars` | object | 否 | 为本次重部署覆盖模板已声明的环境变量。 |

:::code-group

```ts [TypeScript]
const manifest = await client.getCloudDeploymentManifest('deployment-id')
await client.syncCloudDeploymentTemplate('deployment-id')
await client.redeployCloudDeployment('deployment-id', { mode: 'template' })
```

```python [Python]
manifest = client.get_cloud_deployment_manifest("deployment-id")
client.sync_cloud_deployment_template("deployment-id")
client.redeploy_cloud_deployment("deployment-id", mode="template")
```

:::

---

## 暂停部署

```
POST /api/cloud-saas/deployments/:id/pause
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentId` | string | 否 | 目标 Agent ID。默认为部署配置中的第一个 Agent。 |

通过将 Sandbox 副本缩为 0 来暂停运行中的 agent-sandbox 工作负载。PVC 会保留，用于稍后恢复或还原。只有命名空间内的当前部署可以被暂停。

**响应 (200)：**

```json
{
  "ok": true,
  "status": "paused",
  "deployment": {}
}
```

:::code-group

```ts [TypeScript]
const result = await client.pauseCloudDeployment('deployment-id', { agentId: 'strategy-buddy' })
console.log(result.status) // 'paused'
```

```python [Python]
result = client.pause_cloud_deployment("deployment-id", agent_id="strategy-buddy")
print(result["status"])  # 'paused'
```

:::

**可能的错误**：`404` 找不到部署，`409` 不能暂停历史部署实例，`422` 状态不支持。

---

## 恢复部署

```
POST /api/cloud-saas/deployments/:id/resume
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentId` | string | 否 | 目标 Agent ID。默认为部署配置中的第一个 Agent。 |

通过将 Sandbox 副本恢复为 1 来恢复已暂停的 agent-sandbox 工作负载。Agent 将从 PVC 上保存的状态中恢复运行。

**响应 (200)：**

```json
{
  "ok": true,
  "status": "deployed",
  "deployment": {}
}
```

:::code-group

```ts [TypeScript]
const result = await client.resumeCloudDeployment('deployment-id', { agentId: 'strategy-buddy' })
console.log(result.status) // 'deployed'
```

```python [Python]
result = client.resume_cloud_deployment("deployment-id", agent_id="strategy-buddy")
print(result["status"])  # 'deployed'
```

:::

**可能的错误**：`404` 找不到部署，`409` 不能恢复历史部署实例，`422` 状态不支持，`502` 恢复失败。

---

## 列出备份

```
GET /api/cloud-saas/deployments/:id/backups
```

| 查询参数 | 类型 | 说明 |
|----------|------|------|
| `agentId` | string | 按 Agent ID 过滤备份列表。 |

返回部署的所有备份记录，包含 status 和 phase 字段，可用于跟踪快照创建、对象归档上传、PVC 恢复和 Sandbox 恢复等阶段。

**响应：**

```json
{
  "deploymentId": "uuid",
  "backups": [
    {
      "id": "backup-id",
      "deploymentId": "uuid",
      "namespace": "gstack-buddy",
      "agentId": "strategy-buddy",
      "sandboxName": "strategy-buddy",
      "pvcName": "shadow-runner-state-strategy-buddy",
      "driver": "volumeSnapshot",
      "snapshotName": "gstack-buddy-strategy-buddy-2025-01-01T00-00-00Z",
      "objectKey": null,
      "status": "succeeded",
      "phase": "completed",
      "error": null,
      "expiresAt": null,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:01:00.000Z"
    }
  ]
}
```

:::code-group

```ts [TypeScript]
const { backups } = await client.listCloudDeploymentBackups('deployment-id')
const { backups } = await client.listCloudDeploymentBackups('deployment-id', { agentId: 'strategy-buddy' })
```

```python [Python]
result = client.list_cloud_deployment_backups("deployment-id")
result = client.list_cloud_deployment_backups("deployment-id", agent_id="strategy-buddy")
backups = result["backups"]
```

:::

---

## 创建备份

```
POST /api/cloud-saas/deployments/:id/backups
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentId` | string | 否 | 目标 Agent ID。默认为部署配置中的第一个 Agent。 |
| `driver` | string | 否 | 备份驱动：`volumeSnapshot`（可用时默认）或 `restic`（对象归档回退）。 |
| `retentionDays` | number | 否 | 备份过期天数（1–365）。 |

为部署创建状态备份。备份对象是挂载到 `/home/shadow` 的 runner home PVC，通常命名为 `shadow-runner-state-<agent>`。当集群支持 CSI VolumeSnapshot 且目标 PVC 由 CSI StorageClass 支撑且有匹配的 VolumeSnapshotClass 时，API 会创建 VolumeSnapshot。否则会回退到对象归档（基于 Pod 的 tar.gz，可选加密）。

备份异步运行。响应返回 `202` 及备份记录。通过备份的 `phase` 字段跟踪进度：`queued` → `snapshot-creating` 或 `object-archiving` → `completed`。

**响应 (202)：**

```json
{
  "ok": true,
  "backup": {
    "id": "backup-id",
    "status": "running",
    "phase": "queued"
  }
}
```

:::code-group

```ts [TypeScript]
// VolumeSnapshot 备份
const { backup } = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'volumeSnapshot',
  retentionDays: 30,
})

// 对象归档备份（加密可选）
const objectBackup = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'restic',
})
```

```python [Python]
# VolumeSnapshot 备份
result = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="volumeSnapshot",
    retention_days=30,
)
backup = result["backup"]

# 对象归档备份（加密可选）
object_result = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="restic",
)
```

:::

**可能的错误**：`404` 找不到部署，`409` 该命名空间已有其他操作正在运行，`422` 状态不支持或 VolumeSnapshot 不可用。

---

## 从备份还原

```
POST /api/cloud-saas/deployments/:id/restore
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentId` | string | 否 | 目标 Agent ID。默认为部署配置中的第一个 Agent。 |
| `backupId` | string | 否 | 备份记录 ID。省略时使用最近的成功备份。 |

从备份还原部署状态。还原流程：
1. 暂停 agent-sandbox（如正在运行）。
2. 从 VolumeSnapshot 或对象归档中还原 `/home/shadow` state PVC。
3. 恢复 agent-sandbox 工作负载。

操作异步运行并返回 `202`。通过备份的 `phase` 字段跟踪进度：`restoring-pausing` → `restoring-pvc` → `restoring-resuming` → `completed`。

**响应 (202)：**

```json
{
  "ok": true,
  "backup": {},
  "status": "resuming",
  "deployment": {}
}
```

:::code-group

```ts [TypeScript]
const result = await client.restoreCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  backupId: 'backup-id',
})
console.log(result.status) // 'resuming'
```

```python [Python]
result = client.restore_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    backup_id="backup-id",
)
print(result["status"])  # 'resuming'
```

:::

**可能的错误**：`404` 找不到部署或备份，`409` 该命名空间已有其他操作正在运行，`422` 状态不支持或备份驱动不可用。

---

## 自动恢复触发器

已暂停的 Cloud 部署在平台检测到活动时会自动恢复：

| 触发器 | 事件 | 行为 |
|--------|------|------|
| **消息提及** | 用户在频道或线程中 @提及 Buddy | Buddy 的暂停部署会恢复以做出响应。 |
| **Agent 心跳** | Agent 发送心跳或使用量快照 | 如果 Agent 所有者有暂停的部署，则恢复以响应心跳。 |
| **App 代理请求** | 用户打开 URL 类型 App 或通过 App 代理请求 | 部署恢复。如果超时，返回 `503` 及 `Retry-After: 5`。 |

App 代理自动恢复是同步的（最多等待 25 秒）。消息提及和 Agent 心跳的自动恢复是触发即忘的。

## 部署状态生命周期

部署经历以下状态流转：

```
pending → deploying → deployed
                          ↕
                        paused ⇄ resuming
                          ↓
                       destroyed
```

`resuming` 是 `paused` 和 `deployed` 之间的瞬态。`failed` 状态如果原因是 `cancelled by user` 或 `superseded-by-newer-deployment`，则不会对用户展示。

## 下一步

- [云概览](./cloud) 了解完整的部署模型。
- [Cloud CLI](./cloud-cli) 了解 `sandbox` 命令组。
- [SDK](./sdks) 了解客户端方法。
