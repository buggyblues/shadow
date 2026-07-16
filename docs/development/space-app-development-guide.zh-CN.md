# Space App 开发手册

本文是新增或维护 Space App 的总入口。当前标准采用 [Space App Shadow Gateway 契约简化](../decisions/space-app-shadow-gateway-contract.zh-CN.md)：Space App 的 `/api/*` 只属于 Space App 自己；Shadow 平台 ingress 只使用 `/.shadow/*`；Buddy/CLI 只通过 Shadow gateway 调用 Space App。

## 文档地图

| 问题 | 看这里 |
| --- | --- |
| Space App 平台 API、manifest、gateway、安全模型 | [Space App API Reference](../api/space-apps.md) |
| Space App API 与平台 gateway 边界 | [Space App Shadow Gateway 契约简化](../decisions/space-app-shadow-gateway-contract.zh-CN.md) |
| 为什么 Space App 是独立应用 | [Space App 独立运行契约](../decisions/space-app-independent-contract.zh-CN.md) |
| 本地运行、组合 runtime、生产部署 | [integrations README](../../integrations/README.md) |
| UI/UX、布局、导航、空状态、移动端体验 | [Space App UI/UX 设计规范](../design-system/space-app-ui-ux-guidelines.zh-CN.md) |
| 嵌入 Shadow 时的 OAuth 授权体验 | [Bridge OAuth 最佳实践](./space-app-bridge-oauth-best-practices.zh-CN.md) |
| Buddy Inbox 任务卡协议 | [Buddy Inbox API](../api/buddy-inbox.md) |
| 桌面与移动端小组件注册、数据和安全边界 | [Widgets API](../api/widgets.md) |

## 架构边界

Space App 是独立应用。Shadow 提供安装、server context、command gateway、权限、审批、Buddy grant、Inbox 投递和宿主 UI 能力；Space App 自己拥有业务数据、业务 API、页面、用户系统、session、持久化和领域权限。

默认分工：

- Space App UI 调 Space App-owned `/api/*`。
- Space App backend 维护自己的用户、session、RBAC 和业务 API。
- Shadow OAuth 只用于账号关联、server context 或 Shadow REST 授权。
- Buddy/CLI 调 Shadow `/api/servers/:serverId/space-apps/:appKey/commands/:commandName`。
- Shadow 校验后转发到 Space App `/.shadow/commands/:commandName`。
- iframe bridge 只做宿主体验增强，例如打开 OAuth、Copilot、Workspace、路由同步。

禁止分工：

- Space App UI 不调用 `/.shadow/*`。
- Space App UI 不调用 Shadow command gateway。
- Space App 不在 `/api` 下暴露 Shadow 协议路由。
- Space App 不使用 Shadow launch token 作为业务 session。

## 最小实现

一个可安装 Space App 至少包含：

- `/.well-known/space-app.json`：manifest。
- `/shadow/server`：iframe/WebView 入口。
- `/assets/*`：图标、cover、client bundle 等静态资源。
- `/api/*`：Space App 自己的业务 API。
- `/.shadow/commands/:commandName`：Shadow gateway 转发入口，仅供 Shadow 调用。
- `/auth/shadow/start` 和 `/auth/shadow/callback`：需要 Shadow OAuth 账号关联时提供。
- manifest 源文件和 typegen 输出。

新 Space App 不生成、不实现、不文档化旧平台入口；浏览器代码也不读取 manifest command ingress。

## Manifest 与权限

Manifest 是 Shadow 安装和 gateway 调用 Space App 的合同。新增 command 时声明：

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

- Space App session：当前浏览器用户是否能操作 Space App 业务资源。
- Shadow OAuth scope：Space App backend 能调用哪些 Shadow API。
- server membership/resource access：Shadow Actor 是否能访问目标 server 或资源。
- command permission/default approval：Shadow gateway 是否允许执行 Space App command。
- Buddy grant：某个 Buddy 是否允许使用该 Space App command 或接收 Space App 投递。
- Inbox admission：目标 Inbox 是否接受该来源投递。

## Space App UI 和业务 API

Space App UI 只调用 Space App-owned `/api/*`：

```ts
await fetch('/api/counter/increment', { method: 'POST' })
```

Space App backend 按自己的模型鉴权：

- Space App session cookie
- Space App 自己的 OAuth 账号绑定
- Space App 自己的匿名/公开访问策略
- Space App 自己的组织、项目、角色和资源权限

如果业务操作需要触发 Buddy 工作，仍然先进入 Space App-owned API：

```text
POST /api/cards/:cardId/dispatch
```

该 route 由 Space App backend 校验本地权限，然后调用 Shadow REST 投递 Inbox task 或触发 Shadow command gateway。

## Shadow OAuth 和用户系统

标准 Space App 应维护自己的用户系统。Shadow OAuth 是身份提供方，不替代 Space App session。

推荐流程：

```text
Browser -> Space App /auth/shadow/start
Space App -> Shadow OAuth authorize
Shadow -> Space App /auth/shadow/callback
Space App -> create or link local user
Space App -> set Space App session cookie
Browser -> Space App /api/*
```

Space App 本地身份关联表至少保存：

```text
local_user_id
provider = "shadow"
shadow_user_id
shadow_username
shadow_server_id or installation_id
linked_at
last_seen_at
```

Space App UI 后续不需要绕 Shadow command 协议来证明用户身份。

## 桌面与移动端小组件（可选）

小组件不是缩小版 iframe，也不执行 Space App 提供的 DOM、CSS 或 JavaScript。
Space App 在 manifest 的 `widgets` 中声明数据、选项、尺寸和安全视图树，由 Web
宿主用封闭 Shadow DOM 组件渲染，移动端用原生视图解释同一份结构。

接入时：

1. 在同一份 manifest 中声明一个 `action: "read"` 的数据 command。
2. 在 `widgets[]` 中声明唯一 `key`、功能分类、桌面/移动端 surface、默认及
   最小/最大尺寸、可选的 `select` 选项、刷新周期和视图树。
3. 数据 command 接收宿主校验后的选项，返回不超过 256 KiB 的 JSON 对象。
4. 用 `path` 绑定数据，用 `stringKey` 和 `i18n` 提供所有用户可见文案。

宿主负责目录搜索、按功能或 Space App 分类、Space App 图标、响应式样式、数据刷新和
错误状态。小组件本身不显示独立图标，也不能自行实现拖拽、缩放或旋转；所有
内置和 Space App 小组件都从菜单进入“更改布局”，由统一布局控制器处理并保存。

当前视图树只支持 `stack`、`row`、`grid`、`text`、`metric`、`badge`、
`divider` 和 `spacer`。需要任意 DOM/CSS/JS、路由、上传或复杂交互时，使用
正常的 Space App UI，不要扩大小组件安全边界。

完整协议见 [Widgets API](../api/widgets.md)，可运行示例见 Travel 的
[`manifest.ts`](../../integrations/travel/server/src/lib/manifest.ts) 和
[`commands.handler.ts`](../../integrations/travel/server/src/handlers/commands.handler.ts)。

## Shadow Gateway Ingress

Space App backend 只在 `/.shadow/commands/:commandName` 接收 Shadow gateway 调用：

```http
POST /.shadow/commands/counter.increment
Authorization: Bearer <short-lived-shadow-command-token>
```

Space App 必须通过 SDK 校验 Shadow command token。SDK 会调用 `POST /api/space-apps/commands/introspect`，取得权威的命令上下文；不要读取 `X-Shadow-*` 业务头，也不要信任请求体里的身份字段。

`/.shadow/commands/*` 只处理 Shadow gateway 请求。浏览器、Buddy 和 CLI 都不直接打这个 URL。

## Buddy / CLI 路径

Buddy 和 CLI 只调用 Shadow：

```bash
shadowob space-app call counter counter.increment \
  --server <server-id-or-slug> \
  --json-input '{"by":1}' \
  --json
```

Shadow 作为 gateway 负责：

1. 解析 Actor。
2. 校验 server membership。
3. 校验 Space App 安装状态。
4. 校验 command permission、action、dataClass。
5. 处理审批和 Buddy grant。
6. 处理 task binding。
7. 记录审计。
8. 转发到 Space App `/.shadow/commands/*`。

Buddy/CLI 不知道 Space App 私有 URL，不持有 Space App session，不绕过 Shadow 审计。

## 状态与备份

Space App 的代码、构建产物、运行时缓存和业务状态必须分层：

- 代码和构建产物放在 app source/release 目录。
- 业务状态放在 manifest/publish request 明确声明的 app-owned path。
- 上传文件、JSON store、SQLite、索引等影响用户可见数据的内容都纳入 state contract。
- 不要把业务状态散落在 `/tmp`、随机工作目录或未声明路径。
- 轻量 Space App 可以使用 JSON store；生产 Space App 仍要接入 Cloud backup/restore 机制。

Shadow 平台 backup/restore ingress 使用 `/.shadow/backup/*` 和 `/.shadow/restore/*`，不占用 Space App `/api/*`。

## 运行和部署

基本命令：

```bash
pnpm -C integrations/<app> typegen
pnpm -C integrations/<app> typecheck
pnpm -C integrations/<app> build
```

安装：

```bash
shadowob space-app install \
  --server <server-id-or-slug> \
  --manifest-url https://app.example.com/.well-known/space-app.json
```

调用：

```bash
shadowob space-app call <app-key> <command> \
  --server <server-id-or-slug> \
  --json-input '{"key":"value"}' \
  --json
```

## 验收清单

新增或大改 Space App 时检查：

1. Space App UI 所有同步业务请求都走 Space App-owned `/api/*`。
2. Shadow ingress 只存在于 `/.shadow/*`。
3. Browser 代码不读取 manifest command ingress path。
4. Space App 有自己的 session 或明确的匿名访问策略。
5. Buddy/CLI 只通过 Shadow command gateway 调用 Space App。
6. Space App command handler 输入类型来自 manifest typegen。
7. command 声明了 `permission`、`action`、`dataClass` 和 `inputSchema`。
8. 小组件只绑定同 manifest 的只读 command，不包含任意 HTML/CSS/JS 或自有布局手势。
9. 小组件选项、文案、尺寸约束及桌面/移动端 surface 已验证。
10. 状态路径已声明，备份/恢复路径不占用 `/api/*`。
11. Agent runtime 内已挂载最新 `shadow-space-app` Skill 包。
