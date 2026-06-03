# SDKs

Shadow provides official SDKs for TypeScript/JavaScript and Python.

## TypeScript / JavaScript

### Installation

```bash
npm install @shadowob/sdk
# or
pnpm add @shadowob/sdk
```

### REST Client

```ts
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'your-jwt-token')

// All methods return typed promises
const me = await client.getMe()
const servers = await client.listServers()
const msg = await client.sendMessage('channel-id', 'Hello!')
```

### App Helpers

```ts
const apps = await client.listServerApps('server-id-or-slug')
const skills = await client.getServerAppSkills('server-id-or-slug', 'demo-desk')
const result = await client.callServerAppCommand('server-id-or-slug', 'demo-desk', 'tickets.create', {
  input: { title: 'Example' },
})
```

App backends can validate command Bearer tokens with:

```ts
const identity = await client.introspectServerAppToken('server-id-or-slug', 'demo-desk', token)
```

### Commerce Automation

Use commerce SDK methods when a provider app, Buddy worker, or fulfillment script needs the same
context the buyer sees in Shadow.

:::code-group

```ts [TypeScript]
const context = await client.getCommerceProductContext('product-id')
console.log(context.shop.name, context.links.assetHome)

const preview = await client.getCommerceOfferCheckoutPreview('offer-id')
if (preview.nextAction === 'purchase') {
  await client.purchaseCommerceOffer('offer-id', {
    idempotencyKey: 'checkout-20260518-001',
  })
}

const entitlement = await client.getEntitlement('entitlement-id')
const opened = await client.openPaidFile(entitlement.paidFile?.id ?? 'file-id')
console.log(opened.viewerUrl, opened.grantToken)
await client.cancelEntitlementRenewal('entitlement-id', {
  reason: 'buyer_cancelled_auto_renewal',
})
```

```python [Python]
context = client.get_commerce_product_context("product-id")
print(context["shop"]["name"], context["links"].get("assetHome"))

preview = client.get_commerce_offer_checkout_preview("offer-id")
if preview["nextAction"] == "purchase":
    client.purchase_commerce_offer(
        "offer-id",
        idempotency_key="checkout-20260518-001",
    )

entitlement = client.get_entitlement("entitlement-id")
opened = client.open_paid_file(entitlement.get("paidFile", {}).get("id", "file-id"))
print(opened["viewerUrl"], opened.get("grantToken"))
client.cancel_entitlement_renewal(
    "entitlement-id",
    reason="buyer_cancelled_auto_renewal",
)
```

:::

External apps should check and redeem app-scoped purchases with an OAuth access token, not a normal
user JWT:

:::code-group

```ts [TypeScript]
const appClient = new ShadowClient('https://shadowob.com', oauthAccessToken)
const access = await appClient.getOAuthCommerceEntitlementAccess({
  resourceId: `${appId}:premium`,
})

if (access.allowed) {
  await appClient.redeemOAuthCommerceEntitlement({
    resourceId: `${appId}:premium`,
    idempotencyKey: 'provider-delivery-001',
  })
}
```

```python [Python]
app_client = ShadowClient("https://shadowob.com", oauth_access_token)
access = app_client.get_oauth_commerce_entitlement_access(
    resource_id=f"{app_id}:premium",
)

if access["allowed"]:
    app_client.redeem_oauth_commerce_entitlement(
        resource_id=f"{app_id}:premium",
        idempotency_key="provider-delivery-001",
    )
```

:::

### Real-time Socket

```ts
import { ShadowSocket } from '@shadowob/sdk'

const socket = new ShadowSocket({
  serverUrl: 'https://shadowob.com',
  token: 'your-jwt-token',
})

socket.connect()
await socket.waitForConnect()

// Join a channel and listen for messages
await socket.joinChannel('channel-id')
socket.on('message:new', (msg) => {
  console.log(`${msg.author?.username}: ${msg.content}`)
})

// Send messages via WebSocket
socket.sendMessage({ channelId: 'channel-id', content: 'Hello!' })

// Typing indicators
socket.sendTyping('channel-id')

// Presence
socket.updatePresence('online')
```

### Available Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `ShadowMessage` | New message in joined channel |
| `message:updated` | `ShadowMessage` | Message was edited |
| `message:deleted` | `{ id, channelId }` | Message was deleted |
| `member:typing` | `{ channelId, userId, username }` | User is typing |
| `member:join` | `{ channelId, userId }` | User joined channel |
| `member:leave` | `{ channelId, userId }` | User left channel |
| `presence:change` | `{ userId, status }` | User status change |
| `reaction:add` | `{ messageId, userId, emoji }` | Reaction added |
| `reaction:remove` | `{ messageId, userId, emoji }` | Reaction removed |
| `notification:new` | `ShadowNotification` | New notification |
| `channel:created` | `{ id, name, type, serverId }` | Channel created |

---

## Python

### Installation

```bash
pip install shadowob-sdk
```

### REST Client

```python
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-jwt-token")

me = client.get_me()
servers = client.list_servers()
msg = client.send_message("channel-id", "Hello from Python!")
```

### App Runtime

The TypeScript SDK includes a modeled backend runtime for App implementations:

```ts
import { defineShadowServerApp } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { shadowServerAppManifest } from './shadow-app.generated.js'

const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOW_SERVER_URL,
})

const commands = shadowApp.defineCommands({
  'tickets.create': (input, { actor }) => createTicket({ ...input, author: actor }),
})
```

Generate `src/shadow-app.generated.ts` from the JSON manifest so command input types are inferred from each command's JSON Schema:

```bash
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts
```

Use `shadowApp.executeCommand(...)` in the command route to validate Shadow Bearer command tokens, parse the envelope, validate input, and expose actor names/avatars from `shadow.actor.profile`. Use `createShadowServerAppJsonStore(...)` for simple file-backed demo persistence.

```python
apps = client.list_server_apps("server-id-or-slug")
skills = client.get_server_app_skills("server-id-or-slug", "demo-desk")
result = client.call_server_app_command(
    "server-id-or-slug",
    "demo-desk",
    "tickets.create",
    input={"title": "Example"},
)
identity = client.introspect_server_app_token("server-id-or-slug", "demo-desk", token)
```

### Real-time Socket

```python
from shadowob_sdk import ShadowSocket

socket = ShadowSocket("https://shadowob.com", token="your-jwt-token")

def on_message(msg):
    print(f"New message: {msg['content']}")

socket.on("message:new", on_message)
socket.connect()
socket.join_channel("channel-id")
socket.wait()  # Block until disconnected
```

### Context Manager

The Python client supports context manager usage:

```python
with ShadowClient("https://shadowob.com", "token") as client:
    servers = client.list_servers()
    for server in servers:
        print(server["name"])
```

## Method Name Mapping

The Python SDK uses `snake_case` method names that map 1-to-1 to the TypeScript `camelCase` methods:

| TypeScript | Python |
|------------|--------|
| `getMe()` | `get_me()` |
| `listServers()` | `list_servers()` |
| `sendMessage()` | `send_message()` |
| `getServerChannels()` | `get_server_channels()` |
| `createChannel()` | `create_channel()` |
| `sendFriendRequest()` | `send_friend_request()` |
| `browseListings()` | `browse_listings()` |
| `createProduct()` | `create_product()` |

## Cloud Deployment Runtime

Both SDKs expose methods for managing Cloud deployment lifecycle: pause, resume, backup, and restore.

### Pause & Resume

Pause a running deployment to free compute while retaining PVC state:

:::code-group

```ts [TypeScript]
// Pause a deployed agent-sandbox
const result = await client.pauseCloudDeployment('deployment-id', { agentId: 'strategy-buddy' })
console.log(result.status) // 'paused'

// Resume a paused deployment
const resumed = await client.resumeCloudDeployment('deployment-id', { agentId: 'strategy-buddy' })
console.log(resumed.status) // 'deployed'
```

```python [Python]
# Pause a deployed agent-sandbox
result = client.pause_cloud_deployment("deployment-id", agent_id="strategy-buddy")
print(result["status"])  # 'paused'

# Resume a paused deployment
resumed = client.resume_cloud_deployment("deployment-id", agent_id="strategy-buddy")
print(resumed["status"])  # 'deployed'
```

:::

### Backups

List existing backups, create new ones, and restore from a backup:

:::code-group

```ts [TypeScript]
// List backups for a deployment
const { backups } = await client.listCloudDeploymentBackups('deployment-id')

// Create a VolumeSnapshot backup
const created = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'volumeSnapshot',
  retentionDays: 30,
})
console.log(created.backup.id)

// Create an object (restic) backup
const objectBackup = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'restic',
})

// Restore from a backup (pauses → restores PVC → resumes)
const restored = await client.restoreCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  backupId: '<backup-id>',
})
console.log(restored.status) // 'resuming'
```

```python [Python]
# List backups for a deployment
result = client.list_cloud_deployment_backups("deployment-id")
backups = result["backups"]

# Create a VolumeSnapshot backup
created = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="volumeSnapshot",
    retention_days=30,
)
print(created["backup"]["id"])

# Create an object (restic) backup
object_backup = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="restic",
)

# Restore from a backup (pauses → restores PVC → resumes)
restored = client.restore_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    backup_id="<backup-id>",
)
print(restored["status"])  # 'resuming'
```

:::

### Related Types

- **TypeScript**: `ShadowCloudDeploymentStatus`, `ShadowCloudDeploymentRuntimeResponse`, `ShadowCloudDeploymentBackup`
- **Python**: `ShadowCloudDeploymentBackup` (dataclass)
