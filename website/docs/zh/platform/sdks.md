# SDK

Shadow 提供官方的 TypeScript/JavaScript 和 Python SDK。

## TypeScript / JavaScript

### 安装

```bash
npm install @shadowob/sdk
# 或者
pnpm add @shadowob/sdk
```

### REST 客户端

```ts
import { ShadowClient } from '@shadowob/sdk'

const client = new ShadowClient('https://shadowob.com', 'your-jwt-token')

// 所有方法返回带类型的 Promise
const me = await client.getMe()
const servers = await client.listServers()
const msg = await client.sendMessage('channel-id', 'Hello!')
```

### 实时 Socket

```ts
import { ShadowSocket } from '@shadowob/sdk'

const socket = new ShadowSocket({
  serverUrl: 'https://shadowob.com',
  token: 'your-jwt-token',
})

socket.connect()
await socket.waitForConnect()

// 加入频道并监听消息
await socket.joinChannel('channel-id')
socket.on('message:new', (msg) => {
  console.log(`${msg.author?.username}: ${msg.content}`)
})

// 通过 WebSocket 发送消息
socket.sendMessage({ channelId: 'channel-id', content: 'Hello!' })

// 输入指示
socket.sendTyping('channel-id')

// 在线状态
socket.updatePresence('online')
```

### 可用事件类型

| 事件 | 负载 | 说明 |
|------|------|------|
| `message:new` | `ShadowMessage` | 已加入频道的新消息 |
| `message:updated` | `ShadowMessage` | 消息被编辑 |
| `message:deleted` | `{ id, channelId }` | 消息被删除 |
| `member:typing` | `{ channelId, userId, username }` | 用户正在输入 |
| `member:join` | `{ channelId, userId }` | 用户加入频道 |
| `member:leave` | `{ channelId, userId }` | 用户离开频道 |
| `presence:change` | `{ userId, status }` | 用户状态变化 |
| `reaction:add` | `{ messageId, userId, emoji }` | 添加反应 |
| `reaction:remove` | `{ messageId, userId, emoji }` | 移除反应 |
| `notification:new` | `ShadowNotification` | 新通知 |
| `channel:created` | `{ id, name, type, serverId }` | 频道已创建 |

---

## Python

### 安装

```bash
pip install shadowob-sdk
```

### REST 客户端

```python
from shadowob_sdk import ShadowClient

client = ShadowClient("https://shadowob.com", "your-jwt-token")

me = client.get_me()
servers = client.list_servers()
msg = client.send_message("channel-id", "Hello from Python!")
```

### 实时 Socket

```python
from shadowob_sdk import ShadowSocket

socket = ShadowSocket("https://shadowob.com", token="your-jwt-token")

def on_message(msg):
    print(f"新消息：{msg['content']}")

socket.on("message:new", on_message)
socket.connect()
socket.join_channel("channel-id")
socket.wait()  # 阻塞直到断开连接
```

### 上下文管理器

Python 客户端支持上下文管理器用法：

```python
with ShadowClient("https://shadowob.com", "token") as client:
    servers = client.list_servers()
    for server in servers:
        print(server["name"])
```

## Cloud 部署运行时

两个 SDK 都提供了管理 Cloud 部署生命周期的方法：暂停、恢复、备份和还原。

### 暂停与恢复

暂停运行中的部署以释放计算资源，同时保留 PVC 状态：

:::code-group

```ts [TypeScript]
// 暂停已部署的 agent-sandbox
const result = await client.pauseCloudDeployment('deployment-id', { agentId: 'strategy-buddy' })
console.log(result.status) // 'paused'

// 恢复已暂停的部署
const resumed = await client.resumeCloudDeployment('deployment-id', { agentId: 'strategy-buddy' })
console.log(resumed.status) // 'deployed'
```

```python [Python]
# 暂停已部署的 agent-sandbox
result = client.pause_cloud_deployment("deployment-id", agent_id="strategy-buddy")
print(result["status"])  # 'paused'

# 恢复已暂停的部署
resumed = client.resume_cloud_deployment("deployment-id", agent_id="strategy-buddy")
print(resumed["status"])  # 'deployed'
```

:::

### 备份

列出已有备份、创建新备份，以及从备份还原：

:::code-group

```ts [TypeScript]
// 列出部署的备份
const { backups } = await client.listCloudDeploymentBackups('deployment-id')

// 创建 VolumeSnapshot 备份
const created = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'volumeSnapshot',
  retentionDays: 30,
})
console.log(created.backup.id)

// 创建对象（restic）备份
const objectBackup = await client.createCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  driver: 'restic',
})

// 从备份还原（暂停 → 恢复 PVC → 启动）
const restored = await client.restoreCloudDeploymentBackup('deployment-id', {
  agentId: 'strategy-buddy',
  backupId: '<backup-id>',
})
console.log(restored.status) // 'resuming'
```

```python [Python]
# 列出部署的备份
result = client.list_cloud_deployment_backups("deployment-id")
backups = result["backups"]

# 创建 VolumeSnapshot 备份
created = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="volumeSnapshot",
    retention_days=30,
)
print(created["backup"]["id"])

# 创建对象（restic）备份
object_backup = client.create_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    driver="restic",
)

# 从备份还原（暂停 → 恢复 PVC → 启动）
restored = client.restore_cloud_deployment_backup("deployment-id",
    agent_id="strategy-buddy",
    backup_id="<backup-id>",
)
print(restored["status"])  # 'resuming'
```

:::

### 相关类型

- **TypeScript**: `ShadowCloudDeploymentStatus`、`ShadowCloudDeploymentRuntimeResponse`、`ShadowCloudDeploymentBackup`
- **Python**: `ShadowCloudDeploymentBackup` (dataclass)
