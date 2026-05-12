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
