# Space App 独立运行契约

状态：已接受并执行。旧 Bridge 数据代理、逐请求 launch header 与 URL token 传递已删除。

## 背景

Space Apps 需要同时支持两种使用场景：

- 用户在 Shadow 社区内打开应用。
- 用户直接访问应用自己的域名或移动端 WebView。

因此 Space App 不能把 iframe bridge 当作登录、鉴权、数据读写或后台任务的基础协议。Bridge 只适合增强嵌入体验；应用自己的 API 和鉴权必须能独立工作。

本契约将 Space Apps 定位为独立应用：

- Shadow 提供身份、服务器上下文、Buddy、媒体访问、Inbox、workspace、授权管理和 webhook。
- Space App 拥有自己的前端、后端 API、session、业务权限、持久化和后台任务。
- Space App UI 的同步业务操作必须调用 Space App 自己的 API。
- 需要 Buddy 做事时，使用 Shadow Inbox task delivery。
- 需要 Shadow 宿主 UI 能力时，才使用 iframe/WebView bridge。

## 术语

- Shadow：主站和平台能力提供方。
- Space App：独立部署的应用，例如 Kanban、Q&A、Flash、WarBuddy。
- Space App API：Space App 自己的 HTTP API，由 Space App 自己鉴权和授权。
- Shadow OAuth：用户授权 Space App 访问 Shadow 身份、服务器上下文和媒体等平台资源。
- Bridge：Shadow web/mobile 宿主与嵌入 iframe/WebView 之间的短消息通道。
- Inbox task delivery：Shadow 向 Buddy Inbox 投递异步任务的协议。
- Snapshot：Space App 为长期展示而保存的头像、名称、封面等显示副本。

## 核心契约

1. Space App 独立运行。登录、页面渲染、数据读写、后台任务不能依赖 iframe bridge。
2. Space App UI 只调用 Space App API。无论嵌入 Shadow 还是独立打开，同步操作都走 Space App 自己的 API 和鉴权。
3. Space App 后端使用 Shadow OAuth/REST 访问 Shadow 能力。OAuth scope 不替代资源权限检查。
4. Bridge 只做宿主 UI 增强：打开 Copilot、打开 workspace、打开 Buddy 创建器、同步路由或打开 Shadow 授权页面。
5. Bridge 不支持 command call。Space App 不应通过 `postMessage` 把业务命令绕回 Shadow 再转发给自己。
6. Buddy 工作走 Inbox task delivery。需要排队、重试、进度、结果回收的工作都不能建模成同步 command call。
7. 长期展示使用 Space App-owned snapshot。头像、服务器图标、Buddy 头像等身份图片使用 Shadow 返回的稳定公开 URL；短期签名 URL 只能用于附件/工作区文件下载或刷新，不能作为持久字段。
8. Webhook 用于跨系统同步。头像变更、Buddy 删除、授权变更、应用卸载等状态不能靠用户刷新页面发现。
9. 事件流也属于 Space App Backend 数据通道。浏览器只连接 Space App 自己的 `/api/shadow/events`，由 Space App Backend 使用 Bearer launch credential 代理平台 SSE；凭证禁止出现在 URL、日志或客户端存储中。

## API 边界

### Space App UI -> Space App API

Space App 前端调用自己的 API，例如：

```http
POST /api/cards
Cookie: app_session=...
Content-Type: application/json

{"title":"Review launch"}
```

要求：

- Space App 自己维护 session 或 Space App-issued bearer token。
- Space App 自己做 CSRF、防重放、业务权限、输入限制和速率限制。
- Space App 后端需要 Shadow 上下文时，使用当前用户的 Shadow OAuth token 或 Space App 后端持有的安装上下文调用 Shadow REST。
- 嵌入 Shadow 时，Space App 通过自己的 session/OAuth 账号关联得到业务身份；需要 Shadow server/Space App context 时由 Space App backend 调 Shadow REST 获取，业务请求仍走 Space App API。

### Space App Backend -> Shadow REST

Space App 后端调用 Shadow 获取平台能力：

- 用户和 server membership。
- Buddy / Inbox 列表。
- 头像和媒体 resolve。
- Inbox task delivery。
- Workspace 资源引用。
- 授权状态、grant 状态和 webhook 重放状态。

要求：

- 每次敏感请求必须同时检查 OAuth scope 和资源访问权。
- Space App 可以短缓存 server membership、profile descriptor 等低风险数据，但必须设置 TTL，并在 webhook 到达后失效。
- 不允许把 Shadow 用户 token 注入 Buddy runtime、浏览器 localStorage 或第三方 worker。

### Shadow -> Space App

Shadow 只主动调用 Space App 的以下平台接口：

- OAuth redirect/callback 相关 URL，由浏览器跳转触发。
- Webhook endpoint。
- 可选的 manifest refresh URL。

新契约不包含 Shadow host 代理 Space App UI command 的路径。

### Buddy / Worker -> Space App

Buddy 收到 Inbox task 后，如果需要操作 Space App 数据，应通过 Space App 明确暴露的任务 API 或回调 API 完成：

```http
POST /api/tasks/:taskId/results
Authorization: Bearer <Space App-issued task token>
Content-Type: application/json

{"status":"completed","artifacts":[...]}
```

推荐规则：

- Space App 在创建 Inbox task 时写入 Space App resource id、callback URL 或 result API 指针。
- Space App 为任务生成短期、最小权限、可撤销的 task token，或要求 Buddy callback 带 Shadow task claim 并由 Space App 后端向 Shadow introspect。
- Task token 只允许访问任务需要的 Space App 资源，不能代表用户或管理员。
- Space App 必须幂等处理结果回写。

## 鉴权和授权

### 用户身份

Space App 使用 Shadow OAuth 登录或绑定 Shadow 身份：

- `user:read` 读取用户基础资料。
- `servers:read` 读取用户可见 server。
- `subjects:avatar.read` resolve 用户和 Buddy 头像。
- 其他 scope 按最小权限申请。

OAuth token 只说明“理论能力”，不说明“当前资源可访问”。Space App 后端仍需要针对 server/channel/Buddy/resource 做资源授权。

### Space App 自有权限

Space App 负责自己的业务权限：

- 谁能创建卡片。
- 谁能编辑问答。
- 谁能调整战术。
- 谁能删除记录。
- 哪些操作需要 Space App 内二次确认。

Shadow 不替 Space App 维护业务 RBAC。Shadow 提供身份、server membership、Buddy grant 和平台能力授权。

### Buddy Grant

Buddy grant 是 server admin 对“Space App 能否和某个 Buddy 交互”的授权，不是 Space App 内部业务权限。

示例：

```json
{
  "buddyAgentId": "...",
  "permissions": ["buddy_inbox:deliver"],
  "approvalMode": "none"
}
```

规则：

- `buddy_inbox:deliver` 只表示 Space App 可以向该 Buddy 投递 Inbox task。
- Space App 内部的 `kanban.cards:write`、`warbuddy.tactics:write` 等权限由 Space App 自己判断。
- Space App 想让 Buddy 操作 Space App 数据时，应生成 task-scoped permission 或 callback token。

### 运行时确认

运行时确认分两类：

- Shadow 平台确认：例如向 Buddy 投递任务、打开 workspace、授权 Space App 访问 Shadow 资源。
- Space App 业务确认：例如删除卡片、发布答案、提交战术。

Shadow 平台确认可以通过 Shadow 页面、deep link、modal 或 bridge 打开；Space App 业务确认应由 Space App 自己提供 UI。

## Dispatch 模型

### 同步业务操作

适合几秒内完成、直接返回结果的操作：

- 创建 Kanban 卡片。
- 提交 Q&A 问题。
- 保存 Flash 卡片。
- 修改 WarBuddy 战术草稿。

路径：

```txt
Space App UI -> Space App API -> Space App DB
                 -> Shadow REST, if platform context is needed
```

### 异步 Buddy 工作

适合需要思考、执行、重试、进度和结果回收的操作：

- 请 Buddy 回答一个问题。
- 请 Buddy 处理一张 Kanban 卡。
- 请 WarBuddy 调整战术。
- 请技能训练 Space App 让 Buddy 评审提交。

路径：

```txt
Space App UI -> Space App API -> Shadow Inbox task delivery -> Buddy Inbox
                                           Buddy -> Space App task result API
```

要求：

- 每个 task 必须有稳定 idempotency key。
- Task payload 包含 source Space App、resource id、server context、期望产物、隐私级别和 callback 约定。
- Space App 后端记录 task delivery receipt，后续通过 webhook、polling 或 result callback 更新本地状态。

### 嵌入态任务投递

即使嵌入 Shadow，向 Buddy 投递任务也必须走后台链路：

```txt
Space App View -> Space App Backend -> Shadow Inbox task delivery -> Buddy Inbox
```

原因：

- Space App Backend 可以统一做 Space App session、业务权限、Buddy grant、幂等和审计。
- Space App Backend 可以记录 delivery receipt，并把任务状态映射回 Space App 自己的领域对象。
- 独立打开、Web 嵌入、移动端 WebView、后台 job 使用同一条 dispatch 路径。
- Space App 后续可以在服务端批量派发、重试、取消或补偿任务，不依赖用户页面还开着。

Bridge 不提供任务投递能力。Space App View 如需展示可选 Buddy，应调用 Space App Backend；Space App Backend 再通过 Shadow REST 获取可用 Buddy/Inbox 列表。

嵌入 Shadow 的 iframe/WebView 通过受控 `postMessage` 在内存中收到短期 launch token。Space App View 只做一次 `Authorization: Bearer <launch-token>` 会话交换，Space App Backend 校验后签发 opaque、`HttpOnly` Space App session，并仅在服务端保存需要的短期平台凭证（落盘时必须加密）。状态变更请求同时校验 session 级 CSRF token。iframe URL、localStorage、sessionStorage 和普通 Space App `/api/*` 请求都不能携带 launch token。Space App Backend 再调用 Shadow 的 launch-scoped 后台接口：

- `GET /api/servers/:serverId/space-apps/:appKey/launch/inboxes`：按 launch actor 的服务器权限列出可见 Buddy Inbox。
- `GET /api/servers/:serverId/space-apps/:appKey/launch/members`：按 launch actor 的 Space 成员权限返回成员目录；Space App Backend 可短期缓存，Space App View 不应通过 Bridge 拉取业务数据。
- `GET /api/servers/:serverId/space-apps/:appKey/launch/channels`：只返回 actor 在当前 Space 可见的频道。
- `GET /api/servers/:serverId/space-apps/:appKey/launch/messages/:messageId`：校验频道可读和 Space 归属后返回消息。
- `POST /api/servers/:serverId/space-apps/:appKey/launch/channels/ensure`：使用 `appKey + dedupeKey` 命名空间去重，并校验同步成员全部属于当前 Space。
- `POST /api/servers/:serverId/space-apps/:appKey/launch/polls`：在 actor 可读且属于当前 Space 的频道创建原生投票。
- `POST /api/servers/:serverId/space-apps/:appKey/launch/buddy-grants/ensure`：沿用平台 Buddy grant 策略，不允许 Space App 绕过审批规则。
- `POST /api/servers/:serverId/space-apps/:appKey/launch/outbox`：消费 Space App Backend 本地 command 产生的 `shadow.outbox`，由 Shadow 统一执行 Buddy grant、Inbox admission、delivery receipt 回填。

这条链路仍然是 `Space App View -> Space App Backend -> Shadow`，不是 bridge dispatch，也不是由 Shadow host 代 Space App 执行业务命令。

### Bridge 可靠性边界

Bridge 是 iframe/WebView 与宿主之间的短生命周期 UI RPC，只承担打开频道、打开工作区资源、弹出授权面板、分享面板等必须由宿主完成的交互。成员目录、频道目录、任务状态、业务数据和安全校验必须走 `Space App View -> Space App Backend -> Shadow REST`。

- SDK 合并并发 launch refresh，避免页面请求同时触发多次宿主刷新。
- SDK 保持单包发布；browser、space-app、space-app/node 是同一包的运行时入口，不拆成独立版本和依赖树。
- Bridge 不再定义数据类请求；成员、频道、投票、Buddy grant 和任务状态不会在 web、OS、mobile 三套宿主重复实现。
- Space App Backend 对可缓存的目录查询使用短期缓存、并发合并和 stale-on-error；交互写操作继续依赖幂等键。
- Space App 必须显式区分 `embedded` 与 `standalone`。前者启用 Bridge UI，后者使用自身导航与 OAuth redirect，不渲染点击后必然失败的宿主操作。

## 头像和媒体快照

Shadow 维护 canonical profile：

```ts
type ShadowSubjectProfile = {
  subjectType: 'user' | 'buddy'
  subjectId: string
  displayName: string
  avatarMediaRef: string | null
  avatarVersion: string | null
  updatedAt: string
}
```

Shadow 对 Space App 返回短期下载 descriptor：

```ts
type ShadowAvatarDescriptor = {
  subjectType: 'user' | 'buddy'
  subjectId: string
  displayName: string
  version: string | null
  downloadUrl: string | null
  expiresAt: string | null
  width: number | null
  height: number | null
  contentType: string | null
}
```

Space App 保存自己的 snapshot：

```ts
type SpaceAppAvatarSnapshot = {
  subjectType: 'user' | 'buddy'
  subjectId: string
  displayName: string
  avatarSnapshotUrl: string | null
  avatarVersion: string | null
  capturedAt: string
  refreshedAt: string | null
}
```

最佳实践：

- 创建内容时 capture 一份头像 snapshot。
- 页面展示 snapshot URL，不展示 Shadow 私有媒体路径。
- 页面打开、后台定时任务、webhook 到达时按 `avatarVersion` 刷新。
- 用户换头像不要求实时刷新，但必须能最终一致。
- subject 删除、授权撤销、Space App 卸载时停止刷新并按策略清理 snapshot。

## Webhook

Webhook 用于让独立 Space App 维护本地同步状态。

目标 manifest：

```json
{
  "webhooks": {
    "endpoint": "https://space-app.example.com/.shadow/webhooks",
    "events": [
      "subject.avatar.updated",
      "subject.deleted",
      "space_app.grant.updated",
      "space_app.uninstalled"
    ]
  }
}
```

投递格式：

```http
POST /.shadow/webhooks
X-Shadow-Webhook-Id: evt_...
X-Shadow-Webhook-Timestamp: 2026-06-09T00:00:00.000Z
X-Shadow-Webhook-Signature: v1=...
Content-Type: application/json

{
  "type": "subject.avatar.updated",
  "serverId": "...",
  "spaceAppId": "...",
  "subject": {
    "subjectType": "buddy",
    "subjectId": "...",
    "avatarVersion": "..."
  }
}
```

要求：

- HMAC 签名覆盖 timestamp 和 body。
- Space App 保存 event id，幂等处理。
- Shadow 指数退避重试，超过上限进入 dead-letter。
- Space App 管理页显示最近 webhook 失败记录，允许管理员重放。
- Secret 由安装过程生成，不能写入 manifest 或仓库。

## Bridge Contract

Bridge 是嵌入态 UX 能力，不是 Space App 鉴权或业务 API。

允许能力：

- `copilot.open`
- `channel.open`
- `channel.ensure`：按 Space App 提供的稳定去重键创建或复用当前 Space 的频道，并可同步明确的成员列表。
- `space.members.list`：读取当前 Space 中宿主已经授权当前用户看到的成员快照。
- `poll.create`：在当前用户可访问的频道内创建社区原生投票，并返回 `channelId/messageId`。
- `workspace.open`
- `buddy.create.open`
- `route.navigate`

`channel.ensure` 和 `poll.create` 是 Shadow 原生社区对象的宿主操作，不是 Space App 业务写入。Space App 仍需先通过自己的 API 完成领域变更；需要长期关联时，只在 Space App 后端保存 Shadow 返回的资源引用。Host 必须继续执行当前用户、Space、频道和成员权限校验。

明确不支持：

- command call。
- Space App 业务命令代理。
- Space App 登录。
- Space App 持久数据读写。
- 长期头像展示。
- Buddy task dispatch。
- 后台 dispatch。
- webhook 投递。

Bridge 请求必须包含 `requestId`、`appKey` 和 `type`。Host 必须校验 launch token、iframe origin、active server、active Space App 和当前用户可见资源。

## 最佳实践

1. Space App API 先行。先设计 Space App 自己的 REST/GraphQL/RPC API，再决定哪些地方需要 Shadow REST 或 bridge 增强。
2. 鉴权在 Space App 后端收口。前端不能直接把 Shadow access token 传给第三方 worker 或 Buddy runtime。
3. Bridge 只做 UX。不要在 bridge message 里承载业务 command、数据库写入、Buddy dispatch 或后台任务。
4. Buddy 工作默认后台异步。只要需要 Buddy 推理、执行、重试或返回产物，就通过 Space App Backend 调用 Shadow Inbox task delivery。
5. 每个 task 都要幂等。`idempotencyKey` 应由 Space App resource id、target Buddy 和动作组成。
6. Snapshot 常驻显示。头像、昵称、封面等长期展示字段都保存 Space App-owned snapshot，并用 version 刷新。
7. Signed URL 只短用。附件、工作区文件等私有媒体才需要短期 URL；头像、服务器图标、Buddy 头像等身份图片直接使用 snapshot 里的稳定公开 URL。
8. Webhook 先做低风险事件。先支持 avatar updated、subject deleted、grant updated、Space App uninstalled。
9. 移动端和 Web 同契约。移动端 WebView 不能依赖 Web-only bridge command 或 bridge dispatch；同样调用 Space App API。
10. 错误要可恢复。缺 OAuth、缺 server access、缺 Buddy grant、缺 task permission 应分别给出可跳转的修复入口。
11. 不把 server admin 权限下放给 Space App。Space App 只能请求最小平台能力，管理员授权应可审计、可撤销。
12. 文档只写正式路径。历史 bridge command 代理不作为新 Space App 示例、最佳实践或 SDK 推荐。

## 迁移计划

### 阶段 1：文档和 contract

- 移除 bridge command 的文档示例。
- 明确 Space App API、Shadow REST、Bridge、Inbox、Webhook 的边界，尤其是 Buddy dispatch 只能走 Space App Backend。
- 更新 Space App README 和 SDK 注释，避免新代码继续依赖旧路径。

### 阶段 2：SDK 和 host

- 从 `ShadowBridge` 删除 command request/response 类型和 command 方法。
- Web/mobile host 不再处理 bridge command request。
- Bridge capabilities 移除 command、Inbox list 和 Inbox enqueue 能力。

### 阶段 3：Space Apps

- Kanban、Q&A、Quiz、Trainer、Skills、WarBuddy、Flash、Space 的前端命令全部改为调用 Space App 自己的 API。
- OAuth/session 缺失时由 Space App 自己展示登录或授权入口。
- Buddy dispatch 改成 Space App View -> Space App Backend -> Shadow Inbox task delivery。

### 阶段 4：Snapshot 和 Webhook

- 实现 avatar resolve API 和 snapshot helper。
- 各 Space App 保存头像 snapshot。
- 实现 webhook secret、签名、重试、dead-letter 和重放。

### 阶段 5：Task Result API

- 为需要 Buddy 回写结果的 Space App 增加 task-scoped result API。
- 支持 task token 或 Shadow task claim introspection。
- 应用内展示 task 状态、错误和重试入口。
