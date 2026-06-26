---
title: Cloud API Reference
description: Complete REST API reference for Shadow Cloud SaaS — templates, deployments, Cloud App exposure, environment variables, provider profiles, wallet, activity, and DIY generation.
---

# Cloud API Reference

Most endpoints live under `/api/cloud-saas`; Cloud App exposure endpoints live under
`/api/cloud/exposures`. All require Bearer token authentication.

## Templates

### List templates

```
GET /api/cloud-saas/templates
```

| Query | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category |
| `q` | string | Search query |
| `locale` | string | Language for localized content (default `'en'`) |

Returns approved templates (official + community), sorted by category and score.

**Response:**

```json
[
  {
    "slug": "web-app",
    "name": "Web Application",
    "description": "A full-stack web app...",
    "category": "web",
    "tags": ["react", "node"],
    "content": {},
    "author": { "username": "..." },
    "rating": 4.5,
    "deployCount": 123,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### Get template

```
GET /api/cloud-saas/templates/:slug
```

| Query | Type | Description |
|-------|------|-------------|
| `locale` | string | Language (default `'en'`) |

Returns a single approved template with full content. Supports server-rendered i18n descriptions.

---

### Get template env refs

```
GET /api/cloud-saas/templates/:slug/env-refs
```

Returns the template's declared environment variables, form fields, and auto-detected env references.

**Response:**

```json
{
  "template": "web-app",
  "requiredEnvVars": ["OPENAI_API_KEY"],
  "fields": [{ "key": "domain", "label": "Domain", "type": "text" }],
  "autoDetectedEnvVars": ["DATABASE_URL"]
}
```

---

### My templates

```
GET /api/cloud-saas/templates/mine
GET /api/cloud-saas/templates/mine/:slug
```

List or get templates authored by the current user, including pending/rejected ones. Same response shape as public templates.

---

### Create template

```
POST /api/cloud-saas/templates
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slug` | string | Yes | Kebab-case identifier (1–255 chars) |
| `name` | string | Yes | Display name (1–255 chars) |
| `description` | string | No | Markdown description |
| `content` | object | Yes | CloudConfig snapshot |
| `tags` | string[] | No | Up to 20 tags |
| `category` | string | No | Category name (≤64 chars) |
| `baseCost` | number | No | Estimated monthly cost in Shrimp Coins |

Content is validated against the template policy allowlist. Templates are submitted for review as `pending`.

### Update template

```
PUT /api/cloud-saas/templates/:slug
```

Same fields as create, all optional. Only allowed for the author when the template is `draft` or `rejected`.

### Submit for review

```
POST /api/cloud-saas/templates/:slug/submit
```

Re-submits a `draft` or `rejected` template for review. No body required.

### Delete template

```
DELETE /api/cloud-saas/templates/:slug
```

Deletes own template at any review status.

---

## Deployments

### List deployments

```
GET /api/cloud-saas/deployments
```

| Query | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results (50 default, 100 max) |
| `offset` | number | Pagination offset (0 default) |
| `includeOrphans` | `'1'` | Include orphaned namespaces without DB rows |
| `includeHistory` | `'1'` | Include all historical deployment entries |

Returns the newest visible deployment per namespace. Uses a per-namespace deduplication strategy.

### Get deployment costs

```
GET /api/cloud-saas/deployments/costs
```

Returns aggregate cost snapshots for all visible SaaS deployments.

### Create deployment

```
POST /api/cloud-saas/deployments
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `namespace` | string | Yes | K8s-safe name (1–255 chars) |
| `name` | string | Yes | Deployment display name (1–255) |
| `templateSlug` | string | Yes | Template identifier |
| `resourceTier` | string | Yes | `lightweight`, `standard`, or `pro` |
| `agentCount` | number | No | Number of agent replicas (≥0) |
| `configSnapshot` | object | Yes | Validated CloudConfig |
| `envVars` | object | No | Key-value environment overrides |
| `runtimeContext` | object | No | `{ locale?, timezone? }` |

Creates a new deployment with billing. Validates the template, locks the namespace, and checks wallet balance (returns `402` if insufficient). The deployment is queued asynchronously.

This endpoint is for fresh instances only. The namespace must not have been used by the same user on the same cluster, even if the previous deployment has already been destroyed. To continue a stateful template instance, use the deployment id with `POST /api/cloud-saas/deployments/:id/redeploy`, `resume`, or `restore`.

### Get deployment

```
GET /api/cloud-saas/deployments/:id
```

Returns full deployment detail including current status, blocking info, and cost summary.

### Get deployment costs

```
GET /api/cloud-saas/deployments/:id/costs
```

Returns cost summary for a specific deployment.

### Cancel deployment

```
POST /api/cloud-saas/deployments/:id/cancel
```

Cancels an active deploy or destroy task. Does not wait for namespace operation locks.

### Delete deployment

```
DELETE /api/cloud-saas/deployments/:id
```

Queues a Pulumi destroy for the current deployment entry. Interrupts active operations.

### Redeploy

```
POST /api/cloud-saas/deployments/:id/redeploy
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | No | `snapshot` (default) or `template` |
| `templateSlug` | string | No | Redeploy from a specific template |
| `configSnapshot` | object | No | Explicit config after policy validation |
| `envVars` | object | No | Override declared template env vars |
| `runtimeContext` | object | No | `{ locale?, timezone? }` |

Re-enqueues the same namespace with a new deployment history entry. Does not debit wallet. This is the stateful template path: it can reuse the namespace, Pulumi stack, PVC-backed runtime state, and Shadow provision state for the existing deployment instance.

---

### Deployment logs

```
GET /api/cloud-saas/deployments/:id/logs
GET /api/cloud-saas/deployments/:id/logs/history
```

| Query | Type | Description |
|-------|------|-------------|
| `agent` | string | Filter by agent name |
| `pod` | string | Filter by pod name |
| `page` | number | Page (1–100) |
| `limit` | number | Per page (20–500, default 200) |

`GET /logs` returns an SSE event stream (`text/event-stream`) with real-time events: `log`, `status`, `error`, `close`. Terminates when deployment reaches terminal status.

`GET /logs/history` returns a plain JSON array of log entries.

### Pod info

```
GET /api/cloud-saas/deployments/:id/pods
GET /api/cloud-saas/deployments/:id/pod-logs
```

| Query | Type | Description |
|-------|------|-------------|
| `pod` | string | Pod name (required for pod-logs) |
| `agent` | string | Agent name |
| `tail` | number | Lines to tail (default 200, max 2000) |
| `container` | string | Container name (default `'openclaw'`) |

`GET /pods` lists K8s pods in the deployment namespace. `GET /pod-logs` streams live K8s pod logs via SSE.

### Orphan management

```
POST /api/cloud-saas/deployments/orphans/:namespace/claim
POST /api/cloud-saas/deployments/orphans/:namespace/cleanup
```

`/claim` adopts a Shadow-Cloud-managed namespace with no DB row. `/cleanup` force-deletes an orphan namespace (admin only).

---

## Cloud App Exposure

These endpoints publish runtime services from a Cloud deployment under stable Shadow-managed App
hosts and keep the Server App installation, release metadata, and backup set in sync.

```
POST /api/cloud/exposures/runtime/reconcile
POST /api/cloud/exposures/server-apps/publish
GET /api/cloud/exposures/server-apps/:appKey/status
POST /api/cloud/exposures/server-apps/:appKey/backup
POST /api/cloud/exposures/server-apps/:appKey/restore
POST /api/cloud/exposures/server-apps/:appKey/unpublish
```

| Endpoint | Purpose |
| --- | --- |
| `/runtime/reconcile` | Create or update runtime exposure records for HTTP services or Server Apps. |
| `/server-apps/publish` | Allocate a stable host, publish a release, and optionally install the App into a server. |
| `/status` | Return exposure, release, installation, and backup status for one App key. |
| `/backup` / `/restore` | Create or restore an App-level backup set that can include state, source, release, and installation metadata. |
| `/unpublish` | Close the exposure and optionally uninstall the Server App. |

---

## Environment Variables

### Deployment-scoped env vars

```
GET /api/cloud-saas/envvars/:deploymentId
GET /api/cloud-saas/envvars/:deploymentId/:key
PUT /api/cloud-saas/envvars/:deploymentId
DELETE /api/cloud-saas/envvars/:deploymentId/:key
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vars` | array | Yes (PUT) | `[{ key: string, value: string }]` |

Values are encrypted at rest. GET returns masked values (`'****'`). GET by key returns decrypted value for editing.

### Global env vars

```
GET /api/cloud-saas/global-envvars
GET /api/cloud-saas/global-envvars/:key
PUT /api/cloud-saas/global-envvars
DELETE /api/cloud-saas/global-envvars/:key
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Variable key |
| `value` | string | Yes | Variable value |
| `isSecret` | boolean | No | Whether to treat as secret (masked) |
| `groupName` | string | No | Optional grouping |

### Global env var groups

```
POST /api/cloud-saas/global-envvars/groups
DELETE /api/cloud-saas/global-envvars/groups/:name
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Group name (1–255 chars) |

---

## Provider Profiles & Catalogs

### List provider catalogs

```
GET /api/cloud-saas/provider-catalogs
```

Returns model providers discovered from installed Cloud plugins. Each entry includes plugin ID, provider details, and required secret fields.

### List provider profiles

```
GET /api/cloud-saas/provider-profiles
```

Returns the current user's encrypted provider profiles. Values are masked.

### Upsert provider profile

```
PUT /api/cloud-saas/provider-profiles
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | No | Profile ID (for updates) |
| `providerId` | string | Yes | Catalog provider ID (1–120 chars) |
| `name` | string | Yes | Display name (1–255) |
| `enabled` | boolean | No | Whether the profile is active |
| `config` | object | No | Provider-specific config |
| `envVars` | object | No | Encrypted env var values |

Validates model list in config and applies SSRF guard on any base URL.

### Test provider profile

```
POST /api/cloud-saas/provider-profiles/:id/test
```

Tests encrypted credentials against the provider API with 8s timeout and SSRF protection.

### Refresh models

```
POST /api/cloud-saas/provider-profiles/:id/models/refresh
```

Fetches model list from the provider's native API and persists into the profile config.

### Delete provider profile

```
DELETE /api/cloud-saas/provider-profiles/:id
```

Deletes the profile and all associated encrypted values.

---

## Wallet

### Get balance

```
GET /api/cloud-saas/wallet
```

Returns the current user's Shrimp Coin balance.

**Response:**

```json
{
  "balance": 5000,
  "currency": "shrimp_coin"
}
```

### Transaction history

```
GET /api/cloud-saas/wallet/transactions
```

| Query | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results (50 default, 100 max) |
| `offset` | number | Pagination offset (0 default) |

Returns paginated wallet transaction history.

---

## Activity Log

```
GET /api/cloud-saas/activity
```

| Query | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results (50 default, 100 max) |
| `offset` | number | Pagination offset (0 default) |

Returns the user's cloud activity log (paginated), including deployment creation, pause, resume, backup, restore, and deletion events.

---

## DIY Cloud (AI Generation)

### Create generation run

```
POST /api/cloud-saas/diy/runs
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Generation prompt (4–2000 chars) |
| `feedback` | string | No | Follow-up feedback (≤2000) |
| `previousConfig` | object | No | Previous CloudConfig for iteration |
| `locale` | string | No | User locale (≤16 chars) |
| `timezone` | string | No | User timezone (≤64 chars) |

Rate-limited to 12 requests per minute. Returns `runId`, `status`, and `streamUrl`.

AI generation requires capability checks, rate/budget controls, and token estimates before model calls.

### Get run

```
GET /api/cloud-saas/diy/runs/:runId
GET /api/cloud-saas/diy/runs/:runId/stream
```

| Query | Type | Description |
|-------|------|-------------|
| `afterSeq` | number | Event sequence offset (≥0) |

`GET /runs/:runId` returns the run with events after `afterSeq`. `GET /stream` provides an SSE event stream (`text/event-stream`) for real-time progress.

### Follow-up run

```
POST /api/cloud-saas/diy/runs/:runId/feedback
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `feedback` | string | Yes | Refinement feedback (1–2000) |
| `prompt` | string | No | Updated prompt (4–2000) |
| `locale` | string | No | User locale |
| `timezone` | string | No | User timezone |

### Cancel run

```
POST /api/cloud-saas/diy/runs/:runId/cancel
```

Cancels a running generation. No body required.

### DIY resources

```
GET /api/cloud-saas/diy/templates
GET /api/cloud-saas/diy/plugins
GET /api/cloud-saas/diy/plugins/search?q=...
```

Rate-limited endpoints that list available community templates and plugins for use in DIY generation.

---

## Schema & Validation

```
GET /api/cloud-saas/schema
POST /api/cloud-saas/validate
```

`GET /schema` returns the primary CloudConfig JSON Schema for frontend validation and editor autocomplete.

`POST /validate` accepts a raw JSON config snapshot and returns a validation summary with errors.

---

## Client Methods

:::code-group

```ts [TypeScript]
// Templates
const templates = await client.listCloudTemplates({ q: 'web' })
const template = await client.getCloudTemplate('web-app')
const envRefs = await client.getCloudTemplateEnvRefs('web-app')

// Deployments
const deployments = await client.listCloudDeployments()
const deployment = await client.createCloudDeployment({
  namespace: 'my-app',
  name: 'My App',
  templateSlug: 'web-app',
  resourceTier: 'standard',
  configSnapshot: {},
})
await client.redeployCloudDeployment(deployment.id, { mode: 'template' })
await client.cancelCloudDeployment(deployment.id)

// Deployment lifecycle
await client.pauseCloudDeployment('dep-id', { agentId: 'agent-name' })
await client.resumeCloudDeployment('dep-id')

// Backups
const { backups } = await client.listCloudDeploymentBackups('dep-id')
const { backup } = await client.createCloudDeploymentBackup('dep-id', { driver: 'volumeSnapshot' })
await client.restoreCloudDeploymentBackup('dep-id', { backupId: 'backup-id' })

// Manifest & template sync
const manifest = await client.getCloudDeploymentManifest('dep-id')
await client.syncCloudDeploymentTemplate('dep-id', { name: 'My Fork' })

// Cloud App exposure and backups
await client.reconcileCloudRuntimeExposures({
  deploymentId: 'dep-id',
  agentId: 'agent-name',
  exposures: [{ id: 'desk', port: 4216, kind: 'server_app', appKey: 'demo-desk' }],
})
await client.publishCloudApp({ appKey: 'demo-desk', deploymentId: 'dep-id', port: 4216 })
await client.getCloudAppStatus('demo-desk', { deploymentId: 'dep-id' })
await client.backupCloudApp('demo-desk', { deploymentId: 'dep-id' })
await client.unpublishCloudApp('demo-desk', { deploymentId: 'dep-id', uninstall: true })

// Provider profiles
const catalogs = await client.listCloudProviderCatalogs()
const profiles = await client.listCloudProviderProfiles()
await client.upsertCloudProviderProfile({ providerId: 'openai', name: 'My Key', config: {} })
await client.testCloudProviderProfile('profile-id')
await client.deleteCloudProviderProfile('profile-id')

// Wallet
const wallet = await client.getWallet()
const transactions = await client.getWalletTransactions()

// DIY generation
const { runId } = await client.createDiyCloudRun({ prompt: 'Create a chatbot' })
const run = await client.getDiyCloudRun(runId)
await client.createDiyCloudFeedbackRun(runId, { feedback: 'Add dark mode' })
await client.cancelDiyCloudRun(runId)
```

```python [Python]
# Templates
result = client.list_cloud_templates(q="web")
template = client.get_cloud_template("web-app")
env_refs = client.get_cloud_template_env_refs("web-app")

# Deployments
result = client.list_cloud_deployments()
deployment = client.create_cloud_deployment(
    namespace="my-app",
    name="My App",
    template_slug="web-app",
    resource_tier="standard",
    config_snapshot={},
)
client.redeploy_cloud_deployment(deployment["id"], mode="template")
client.cancel_cloud_deployment(deployment["id"])

# Deployment lifecycle
client.pause_cloud_deployment("dep-id", agent_id="agent-name")
client.resume_cloud_deployment("dep-id")

# Backups
result = client.list_cloud_deployment_backups("dep-id")
result = client.create_cloud_deployment_backup("dep-id", driver="volumeSnapshot")
client.restore_cloud_deployment_backup("dep-id", backup_id="backup-id")

# Manifest & template sync
manifest = client.get_cloud_deployment_manifest("dep-id")
client.sync_cloud_deployment_template("dep-id", name="My Fork")

# Cloud App exposure and backups
client.reconcile_cloud_runtime_exposures(
    deployment_id="dep-id",
    agent_id="agent-name",
    exposures=[{"id": "desk", "port": 4216, "kind": "server_app", "appKey": "demo-desk"}],
)
client.publish_cloud_app(app_key="demo-desk", deployment_id="dep-id", port=4216)
client.get_cloud_app_status("demo-desk", deployment_id="dep-id")
client.backup_cloud_app("demo-desk", deployment_id="dep-id")
client.unpublish_cloud_app("demo-desk", deployment_id="dep-id", uninstall=True)

# Provider profiles
catalogs = client.list_cloud_provider_catalogs()
profiles = client.list_cloud_provider_profiles()
client.upsert_cloud_provider_profile(provider_id="openai", name="My Key", config={})
client.test_cloud_provider_profile("profile-id")
client.delete_cloud_provider_profile("profile-id")

# Wallet
wallet = client.get_wallet()
result = client.get_wallet_transactions()

# DIY generation
result = client.create_diy_cloud_run(prompt="Create a chatbot")
run = client.get_diy_cloud_run(result["runId"])
client.create_diy_cloud_feedback_run(result["runId"], feedback="Add dark mode")
client.cancel_diy_cloud_run(result["runId"])
```

:::

---

## Next Steps

- [Cloud SaaS Runtime](./cloud-saas) for pause/resume/backup/restore operations.
- [Cloud CLI](./cloud-cli) for the standalone deployment CLI.
- [Templates](./cloud-templates) for the template catalog and authoring guide.
- [Plugins](./cloud-plugins) for the plugin ecosystem.
- [SDKs](./sdks) for all SDK client methods.
