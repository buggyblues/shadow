---
title: Cloud SaaS Deployment Runtime
description: Manage running Cloud deployments with pause, resume, backup, and restore operations.
---

# Cloud SaaS Deployment Runtime

Cloud SaaS deployments expose runtime lifecycle operations through the deployment API namespace: pause idle agents, resume them on demand, create and list state backups, and restore from a backup.

All endpoints live under `/api/cloud-saas/deployments/:id`.

## Template manifest

```
GET /api/cloud-saas/deployments/:id/manifest
POST /api/cloud-saas/deployments/:id/template
POST /api/cloud-saas/deployments/:id/redeploy
```

`GET /manifest` returns the deployment's linked template, manifest revision, config hash, and drift state (`up-to-date`, `template-updated`, `missing-template`, `unlinked`, or `unknown`). The normal deployment list remains redacted; use this endpoint when a dashboard or CLI needs to explain where a running deployment came from.

`POST /template` saves the deployed config snapshot as an editable template. Owned draft/rejected community templates are updated in place; official, approved, or pending templates are forked.

`POST /redeploy` still accepts an empty body for the existing snapshot redeploy behavior. It also accepts:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `snapshot` or `template` | No | Use the deployed snapshot or the latest linked template content. |
| `templateSlug` | string | No | Redeploy from a specific accessible template. |
| `configSnapshot` | object | No | Redeploy from an explicit config snapshot after server-side policy validation. |
| `envVars` | object | No | Override declared template env vars for this redeploy. |

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

## Pause deployment

```
POST /api/cloud-saas/deployments/:id/pause
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | No | Target agent ID. Defaults to the first agent in the deployment config. |

Pauses a running agent-sandbox workload by scaling its Sandbox to 0. The PVC is retained for later resume or restore. Only the current deployment in a namespace can be paused.

**Response (200):**

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

**Possible errors**: `404` deployment not found, `409` cannot pause a historical deployment, `422` unsupported status.

---

## Resume deployment

```
POST /api/cloud-saas/deployments/:id/resume
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | No | Target agent ID. Defaults to the first agent in the deployment config. |

Resumes a paused agent-sandbox workload by scaling its Sandbox back to 1. The agent will pick up from its saved state on the PVC.

**Response (200):**

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

**Possible errors**: `404` deployment not found, `409` cannot resume a historical deployment, `422` unsupported status, `502` resume failed.

---

## List backups

```
GET /api/cloud-saas/deployments/:id/backups
```

| Query | Type | Description |
|-------|------|-------------|
| `agentId` | string | Filter backups by agent ID. |

Returns all backup records for the deployment, including status and phase fields that track progress through snapshot creation, object archive upload, PVC restore, and sandbox resume.

**Response:**

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

## Create backup

```
POST /api/cloud-saas/deployments/:id/backups
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | No | Target agent ID. Defaults to the first agent in the deployment config. |
| `driver` | string | No | Backup driver: `volumeSnapshot` (default if available) or `restic` for object archive fallback. |
| `retentionDays` | number | No | Days before the backup artifact expires (1–365). |

Creates a state backup for the deployment. The backed-up PVC is the runner home PVC mounted at `/home/shadow`, normally named `shadow-runner-state-<agent>`. When the cluster supports CSI VolumeSnapshot and the target PVC is backed by a CSI StorageClass with a matching VolumeSnapshotClass, the API creates a VolumeSnapshot. Otherwise it falls back to an object archive (pod-based tar.gz, optionally encrypted).

The backup runs asynchronously. The response returns `202` with the backup record. Check the backup `phase` field to track progress: `queued` → `snapshot-creating` or `object-archiving` → `completed`.

**Response (202):**

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
// VolumeSnapshot backup
const { backup } = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'volumeSnapshot',
  retentionDays: 30,
})

// Object archive backup with encryption
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

# 对象归档备份（可加密）
object_result = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="restic",
)
```

:::

**Possible errors**: `404` deployment not found, `409` another operation is already running in this namespace, `422` unsupported status or VolumeSnapshot not available.

---

## Restore from backup

```
POST /api/cloud-saas/deployments/:id/restore
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | No | Target agent ID. Defaults to the first agent in the deployment config. |
| `backupId` | string | No | Backup record ID. If omitted, the most recent succeeded backup is used. |

Restores deployment state from a backup. The restore process:
1. Pauses the agent-sandbox (if running).
2. Restores the `/home/shadow` state PVC from the VolumeSnapshot or object archive.
3. Resumes the agent-sandbox workload.

The operation runs asynchronously and returns `202`. Check the backup `phase` field to track progress: `restoring-pausing` → `restoring-pvc` → `restoring-resuming` → `completed`.

**Response (202):**

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

**Possible errors**: `404` deployment or backup not found, `409` another operation is running in this namespace, `422` unsupported status or backup driver.

---

## Auto-resume triggers

Cloud deployments that are paused will automatically resume when the platform detects activity:

| Trigger | Event | Behavior |
|---------|-------|----------|
| **Message mention** | A user @mentions a Buddy in a channel or thread | The Buddy's paused deployment resumes so it can respond. |
| **Agent heartbeat** | An agent sends a heartbeat or usage snapshot | If the agent's owner has a paused deployment, it resumes to serve the heartbeat. |
| **App proxy request** | A user opens a URL-type app or proxies a request through the app | The deployment resumes. If the timeout is reached, a `503` with `Retry-After: 5` is returned. |

App proxy auto-resume is synchronous (waits up to 25s). Message mention and agent heartbeat auto-resumes are fire-and-forget.

## Deployment status lifecycle

Deployments progress through these statuses:

```
pending → deploying → deployed
                          ↕
                        paused ⇄ resuming
                          ↓
                       destroyed
```

The `resuming` status is transient between `paused` and `deployed`. The `failed` status with reasons like `cancelled by user` or `superseded-by-newer-deployment` is not shown to users.

## Next Steps

- [Cloud overview](./cloud) for the full deployment model.
- [Cloud CLI](./cloud-cli) for the `sandbox` command group.
- [SDKs](./sdks) for the client methods.
