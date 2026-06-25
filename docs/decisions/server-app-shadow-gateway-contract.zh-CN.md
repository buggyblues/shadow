# Server App Shadow Gateway 契约简化

**状态:** Accepted  
**日期:** 2026-06-25

## 背景

Server App 需要把普通业务 API、宿主体验、平台转发入口分清楚。此前这些职责混在 App 的公开 API 命名空间里，导致模板、manifest 和 agent 生成代码容易把平台 ingress 当作浏览器业务 API。Counter App 的 `missing_oauth` 就是这个错误模型的直接表现：UI 绕过自己的业务 API，先访问平台 ingress，失败后才回退到真正的 App API。

## 决策

Shadow App 新契约只保留两条清晰边界：

```text
Browser / iframe UI
  -> App origin /api/*
  -> App 自己鉴权、维护 session、处理业务状态

Buddy / CLI / Shadow automation
  -> Shadow API /api/servers/:serverId/apps/:appKey/commands/:commandName
  -> Shadow 校验 server、权限、审批、Buddy grant、task binding
  -> Shadow 作为 gateway 转发到 App origin /.shadow/commands/:commandName
```

`/api/*` 永远属于 App 自己。Shadow 平台协议不得占用 App 的 `/api` 命名空间。

App 暴露给 Shadow 的平台 ingress 统一放在 `/.shadow/*`：

- `/.shadow/commands/:commandName`
- `/.shadow/webhooks`
- `/.shadow/backup/*`
- `/.shadow/restore/*`

不保留旧路径 alias。迁移以删除旧方式为目标，不提供兼容层。

## API 边界

### App API

App UI 调用 App 自己的业务 API：

```text
GET  /api/state
POST /api/counter/increment
POST /api/cards
POST /api/tasks/:id/assign
```

这些接口只使用 App 自己的身份、session、RBAC、领域模型和持久化。Shadow launch token、Shadow command token、Buddy grant 和 Shadow outbox 不进入这条同步业务路径。

### Shadow Gateway API

Buddy、CLI、agent runtime 和自动化只调用 Shadow：

```text
POST /api/servers/:serverId/apps/:appKey/commands/:commandName
```

Shadow 是唯一 command gateway。Shadow 负责：

- 解析 Actor：`user`、`pat`、`oauth`、`agent`、`system`
- 校验 server membership 和资源访问
- 校验 App command permission、action、dataClass
- 执行 first-use / every-time approval
- 校验 Buddy grant 和 task binding
- 记录审计和 command event
- 限制 JSON / multipart 输入大小
- SSRF 校验 App command target
- 给 App 生成短期 Shadow-signed command token
- 转发到 App 的 `/.shadow/commands/:commandName`

Buddy/CLI 不应该知道 App backend 私有 URL，也不应该直接请求 App origin。

### App Shadow Ingress

App backend 只在 `/.shadow/*` 接收 Shadow gateway 的调用。该入口不是公开业务 API，也不服务浏览器 UI。

推荐命令入口：

```text
POST /.shadow/commands/:commandName
Authorization: Bearer <short-lived-shadow-command-token>
X-Shadow-Protocol: shadow.app/1
X-Shadow-Server-Id: <server-id>
X-Shadow-Server-App-Id: <server-app-id>
X-Shadow-App-Key: <app-key>
X-Shadow-Command: <command-name>
X-Shadow-Actor-Kind: <actor-kind>
```

App 可用 Shadow JWKS 本地验签 command token；需要强撤销或更细粒度上下文时，可调用 Shadow token introspection。无论哪种方式，App 不接受裸 command 请求。

## OAuth 和用户系统

标准 App 应维护自己的用户系统和 session。Shadow 只作为身份提供方、server context 提供方和协作控制面。

推荐模型：

```text
Browser
  -> App /auth/shadow/start
  -> Shadow OAuth authorize
  -> App /auth/shadow/callback
  -> App 创建/关联本地 user
  -> App session cookie
```

App 本地表至少保存：

```text
local_user_id
provider = "shadow"
shadow_user_id
shadow_username
shadow_server_id 或 installation_id
linked_at
last_seen_at
```

UI 之后只依赖 App session 调 `/api/*`。当 App backend 需要和 Shadow 协作时，再用用户授权、App installation 凭证或 Shadow gateway 上下文调用 Shadow REST。

## Manifest

Manifest 的 command 配置只表达 Shadow gateway 要转发到的目标 ingress：

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "counter",
  "api": {
    "baseUrl": "https://counter.example.com"
  },
  "iframe": {
    "entry": "https://counter.example.com/shadow/server",
    "allowedOrigins": ["https://counter.example.com"]
  },
  "commands": [
    {
      "name": "counter.increment",
      "ingress": {
        "path": "/.shadow/commands/counter.increment",
        "auth": "shadow-command-jwt"
      },
      "permission": "counter.counter:write",
      "action": "write",
      "dataClass": "server-private",
      "inputSchema": {
        "type": "object",
        "properties": {
          "by": { "type": "integer", "minimum": 1, "maximum": 100 }
        },
        "additionalProperties": false
      }
    }
  ]
}
```

`api.baseUrl` 只表示 App origin。`commands[].ingress.path` 只表示 Shadow gateway 转发到 App 的平台 ingress。任何模板、SDK、Buddy skill 或生成器都不得把该字段用于浏览器 fetch。

## Buddy / CLI 调用路径

Buddy 和 CLI 绕 Shadow 是必要的，因为它们不是 App 用户会话的一部分。它们需要 Shadow 统一回答：

- 这个 Buddy 是否属于当前 server？
- 这个 Buddy 是否被授予这个 App 的这个 command？
- 是否需要 owner 或 server admin 审批？
- 当前 task claim 是否允许它代表该任务调用 command？
- command 结果中的 Inbox / channel side effects 是否允许投递？
- 这次调用应该如何审计、限流和撤销？

因此路径必须是：

```text
Buddy / CLI
  -> Shadow command gateway
  -> App /.shadow/commands/*
```

而不是：

```text
Buddy / CLI
  -> App backend
  -> App 再问 Shadow 是否允许
```

后者会把授权、审批、审计和 task binding 分散到每个 App，增加重复实现和安全漂移。

## 删除项

以下方式从新契约中删除，不保留 alias：

- App UI 调 `/.shadow/commands/*`
- App backend 自行代替 Shadow 做 command 授权、审批和审计
- manifest 使用旧的 command URL 字段
- browser SDK 默认绑定平台 ingress
- launch token 作为 App 业务 API 的默认身份层

App 可以继续使用 iframe bridge 做宿主体验增强，例如打开 Copilot、打开 Workspace、路由同步和授权弹窗，但 bridge 不承载业务 command。

## 模板要求

新模板只生成：

- `/.well-known/shadow-app.json`
- `/shadow/server`
- `/assets/*`
- App-owned `/api/*`
- `/.shadow/commands/:commandName`
- App-owned `/auth/shadow/start`
- App-owned `/auth/shadow/callback`

模板 UI 必须调用 App-owned `/api/*`。如果要让 Buddy 做异步工作，UI 调 App-owned `/api/tasks` 或 `/api/dispatch`，App backend 再调用 Shadow REST 创建 Inbox task 或返回 Shadow gateway 可消费的 outbox。

## 验收规则

新增或修改 Server App 时必须满足：

1. 浏览器代码不读取 `commands[].ingress.path`。
2. App UI 所有同步业务请求都走 App-owned `/api/*`。
3. Buddy/CLI 只通过 Shadow `/api/servers/:serverId/apps/:appKey/commands/:commandName` 调用 App。
4. App 的 Shadow ingress 只存在于 `/.shadow/*`。
5. App 有自己的 session 或明确的匿名访问策略，不把 Shadow launch token 当作业务 session。
