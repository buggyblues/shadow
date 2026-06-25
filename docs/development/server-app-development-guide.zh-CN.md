# Server App 开发手册

本文是新增或维护 Server App 的总入口。当前标准采用 [Server App Shadow Gateway 契约简化](../decisions/server-app-shadow-gateway-contract.zh-CN.md)：App 的 `/api/*` 只属于 App 自己；Shadow 平台 ingress 只使用 `/.shadow/*`；Buddy/CLI 只通过 Shadow gateway 调用 App。

## 文档地图

| 问题 | 看这里 |
| --- | --- |
| Server App 平台 API、manifest、gateway、安全模型 | [Server App API Reference](../api/server-app-integrations.md) |
| App API 与平台 gateway 边界 | [Server App Shadow Gateway 契约简化](../decisions/server-app-shadow-gateway-contract.zh-CN.md) |
| 为什么 Server App 是独立应用 | [独立应用集成契约](../decisions/server-app-independent-integration-contract.zh-CN.md) |
| 本地运行、组合 runtime、生产部署 | [integrations README](../../integrations/README.md) |
| UI/UX、布局、导航、空状态、移动端体验 | [Server App UI/UX 设计规范](../design-system/server-app-ui-ux-guidelines.zh-CN.md) |
| 嵌入 Shadow 时的 OAuth 授权体验 | [Bridge OAuth 最佳实践](./server-app-bridge-oauth-best-practices.zh-CN.md) |
| Buddy Inbox 任务卡协议 | [Buddy Inbox API](../api/buddy-inbox.md) |

## 架构边界

Server App 是独立应用。Shadow 提供安装、server context、command gateway、权限、审批、Buddy grant、Inbox 投递和宿主 UI 能力；App 自己拥有业务数据、业务 API、页面、用户系统、session、持久化和领域权限。

默认分工：

- App UI 调 App-owned `/api/*`。
- App backend 维护自己的用户、session、RBAC 和业务 API。
- Shadow OAuth 只用于账号关联、server context 或 Shadow REST 授权。
- Buddy/CLI 调 Shadow `/api/servers/:serverId/apps/:appKey/commands/:commandName`。
- Shadow 校验后转发到 App `/.shadow/commands/:commandName`。
- iframe bridge 只做宿主体验增强，例如打开 OAuth、Copilot、Workspace、路由同步。

禁止分工：

- App UI 不调用 `/.shadow/*`。
- App UI 不调用 Shadow command gateway。
- App 不在 `/api` 下暴露 Shadow 协议路由。
- App 不使用 Shadow launch token 作为业务 session。

## 最小实现

一个可安装 Server App 至少包含：

- `/.well-known/shadow-app.json`：manifest。
- `/shadow/server`：iframe/WebView 入口。
- `/assets/*`：图标、cover、client bundle 等静态资源。
- `/api/*`：App 自己的业务 API。
- `/.shadow/commands/:commandName`：Shadow gateway 转发入口，仅供 Shadow 调用。
- `/auth/shadow/start` 和 `/auth/shadow/callback`：需要 Shadow OAuth 账号关联时提供。
- manifest 源文件和 typegen 输出。

新 App 不生成、不实现、不文档化旧平台入口；浏览器代码也不读取 manifest command ingress。

## Manifest 与权限

Manifest 是 Shadow 安装和 gateway 调用 App 的合同。新增 command 时声明：

- `name`
- `ingress.path`
- `ingress.auth`
- `permission`
- `action`
- `dataClass`
- `inputSchema`

示例：

```json
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
```

权限分层不要混在一起：

- App session：当前浏览器用户是否能操作 App 业务资源。
- Shadow OAuth scope：App backend 能调用哪些 Shadow API。
- server membership/resource access：Shadow Actor 是否能访问目标 server 或资源。
- command permission/default approval：Shadow gateway 是否允许执行 App command。
- Buddy grant：某个 Buddy 是否允许使用该 App command 或接收 App 投递。
- Inbox admission：目标 Inbox 是否接受该来源投递。

## App UI 和业务 API

App UI 只调用 App-owned `/api/*`：

```ts
await fetch('/api/counter/increment', { method: 'POST' })
```

App backend 按自己的模型鉴权：

- App session cookie
- App 自己的 OAuth 账号绑定
- App 自己的匿名/公开访问策略
- App 自己的组织、项目、角色和资源权限

如果业务操作需要触发 Buddy 工作，仍然先进入 App-owned API：

```text
POST /api/cards/:cardId/dispatch
```

该 route 由 App backend 校验本地权限，然后调用 Shadow REST 投递 Inbox task 或触发 Shadow command gateway。

## Shadow OAuth 和用户系统

标准 App 应维护自己的用户系统。Shadow OAuth 是身份提供方，不替代 App session。

推荐流程：

```text
Browser -> App /auth/shadow/start
App -> Shadow OAuth authorize
Shadow -> App /auth/shadow/callback
App -> create or link local user
App -> set App session cookie
Browser -> App /api/*
```

App 本地身份关联表至少保存：

```text
local_user_id
provider = "shadow"
shadow_user_id
shadow_username
shadow_server_id or installation_id
linked_at
last_seen_at
```

App UI 后续不需要绕 Shadow command 协议来证明用户身份。

## Shadow Gateway Ingress

App backend 只在 `/.shadow/commands/:commandName` 接收 Shadow gateway 调用：

```http
POST /.shadow/commands/counter.increment
Authorization: Bearer <short-lived-shadow-command-token>
X-Shadow-Protocol: shadow.app/1
X-Shadow-Server-Id: <server-id>
X-Shadow-Server-App-Id: <server-app-id>
X-Shadow-App-Key: counter
X-Shadow-Command: counter.increment
```

App 必须验证 Shadow command token。推荐使用 Shadow JWKS 本地验签；如需要强撤销或实时上下文，可调用 Shadow introspection。

`/.shadow/commands/*` 只处理 Shadow gateway 请求。浏览器、Buddy 和 CLI 都不直接打这个 URL。

## Buddy / CLI 路径

Buddy 和 CLI 只调用 Shadow：

```bash
shadowob app call counter counter.increment \
  --server <server-id-or-slug> \
  --json-input '{"by":1}' \
  --json
```

Shadow 作为 gateway 负责：

1. 解析 Actor。
2. 校验 server membership。
3. 校验 App 安装状态。
4. 校验 command permission、action、dataClass。
5. 处理审批和 Buddy grant。
6. 处理 task binding。
7. 记录审计。
8. 转发到 App `/.shadow/commands/*`。

Buddy/CLI 不知道 App 私有 URL，不持有 App session，不绕过 Shadow 审计。

## 状态与备份

Server App 的代码、构建产物、运行时缓存和业务状态必须分层：

- 代码和构建产物放在 app source/release 目录。
- 业务状态放在 manifest/publish request 明确声明的 app-owned path。
- 上传文件、JSON store、SQLite、索引等影响用户可见数据的内容都纳入 state contract。
- 不要把业务状态散落在 `/tmp`、随机工作目录或未声明路径。
- 轻量 App 可以使用 JSON store；生产 App 仍要有 Cloud App backup/restore 机制。

Shadow 平台 backup/restore ingress 使用 `/.shadow/backup/*` 和 `/.shadow/restore/*`，不占用 App `/api/*`。

## 运行和部署

基本命令：

```bash
pnpm -C integrations/<app> typegen
pnpm -C integrations/<app> typecheck
pnpm -C integrations/<app> build
```

安装：

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url https://app.example.com/.well-known/shadow-app.json
```

调用：

```bash
shadowob app call <app-key> <command> \
  --server <server-id-or-slug> \
  --json-input '{"key":"value"}' \
  --json
```

## 验收清单

新增或大改 Server App 时检查：

1. App UI 所有同步业务请求都走 App-owned `/api/*`。
2. Shadow ingress 只存在于 `/.shadow/*`。
3. Browser 代码不读取 manifest command ingress path。
4. App 有自己的 session 或明确的匿名访问策略。
5. Buddy/CLI 只通过 Shadow command gateway 调用 App。
6. App command handler 输入类型来自 manifest typegen。
8. command 声明了 `permission`、`action`、`dataClass` 和 `inputSchema`。
9. 状态路径已声明，备份/恢复路径不占用 `/api/*`。
10. Agent runtime 内已挂载最新 `shadow-server-app` Skill 包。
