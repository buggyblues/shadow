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

### 应用 辅助方法

```ts
const apps = await client.listServerApps('server-id-or-slug')
const skills = await client.getServerAppSkills('server-id-or-slug', 'demo-desk')
const result = await client.callServerAppCommand('server-id-or-slug', 'demo-desk', 'tickets.create', {
  input: { title: 'Example' },
})
```

App 后端可以用 introspection 校验命令 Bearer token：

```ts
const identity = await client.introspectServerAppToken('server-id-or-slug', 'demo-desk', token)
```

### 商业自动化

服务商 App、Buddy worker 或履约脚本需要拿到和买家页面一致的上下文时，使用商业 SDK 方法。

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

外部 App 应使用 OAuth access token 检查和核销应用范围内的购买权益，不要使用普通用户 JWT：

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

### 应用 Runtime

TypeScript SDK 提供了建模后的 应用 后端 runtime：

```ts
import { defineShadowServerApp } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { shadowServerAppManifest } from './shadow-app.generated.js'

const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOWOB_SERVER_URL,
})

const commands = shadowApp.defineCommands({
  'tickets.create': (input, { actor }) => createTicket({ ...input, author: actor }),
})
```

先从 JSON manifest 生成 `src/shadow-app.generated.ts`，命令 input 类型会从每个 command 的 JSON Schema 推导出来：

```bash
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts
```

命令路由里使用 `shadowApp.executeCommand(...)` 来校验 Shadow Bearer command token、解析 envelope、校验 input，并从 `shadow.actor.profile` 取得 actor 名称和头像。简单 demo 持久化可以使用 `createShadowServerAppJsonStore(...)`。

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
