# Server App 开发手册

本文是新增或维护 Server App 的总入口。目标是把“做什么、用哪个协议、去哪看细节”讲清楚，避免 API 参考、集成运行说明和专项最佳实践互相重复。

## 文档地图

| 问题 | 看这里 |
| --- | --- |
| Server App 是什么，平台有哪些 API、manifest 字段、安全模型 | [Server App API Reference](../api/server-app-integrations.md) |
| 为什么 Server App 要做成独立应用，不依赖 iframe bridge 做业务协议 | [独立应用集成契约](../decisions/server-app-independent-integration-contract.zh-CN.md) |
| 本地运行、组合 runtime、生产部署、manifest 安装命令 | [integrations README](../../integrations/README.md) |
| UI/UX、布局、导航、空状态、移动端体验 | [Server App UI/UX 设计规范](../design-system/server-app-ui-ux-guidelines.zh-CN.md) |
| 嵌入 Shadow 时的 OAuth 授权体验 | [Bridge OAuth 最佳实践](./server-app-bridge-oauth-best-practices.zh-CN.md) |
| 给 Buddy 创建 Inbox 任务卡 | [Buddy 派任务最佳实践](./server-app-buddy-task-dispatch-best-practices.zh-CN.md) |
| Inbox 任务卡协议、claim/update/retry/admission | [Buddy Inbox API](../api/buddy-inbox.md) |

## 架构边界

Server App 是独立应用。Shadow 提供安装、server context、launch token、权限、Buddy grant、Inbox 投递和宿主 UI 能力；App 自己拥有业务数据、业务 API、页面、持久化和领域权限。

默认分工：

- App UI 调自己的 app backend。
- App backend 调 Shadow API，或通过 Shadow App command token introspection 接收 Buddy/CLI 调用。
- iframe bridge 只做宿主体验增强：打开 OAuth、打开 Copilot、打开 Workspace、打开 Buddy 创建器、读取宿主 Buddy Inbox 列表、路由同步。
- Buddy 派任务走 app backend runtime command，再由 app backend 调 Shadow `/launch/outbox`。浏览器不直接请求 Shadow outbox。
- 长期 UI 数据保存 app-owned snapshot，不持久化 Shadow signed media URL。

## 最小实现

一个可安装 Server App 至少包含：

- `/.well-known/shadow-app.json`：manifest。
- `/shadow/server`：iframe/WebView 入口。
- `/assets/...`：图标、cover、client bundle 等静态资源。
- `/api/shadow/commands/:commandName`：Shadow server-origin command 入口，供 Buddy/CLI 使用。
- `shadow-app.local.json` 和生成的 `src/shadow-app.generated.ts`。
- `createShadowServerAppRuntime(...)` 定义 command handlers。

如果 UI 会调用 app command 或给 Buddy 派任务，还需要：

- `/api/runtime/commands/:commandName`
- `/api/runtime/inboxes`
- 客户端使用 `createShadowServerAppRuntimeClient()`。

## Manifest 与权限

Manifest 是 Shadow 安装和调用 App 的合同。新增 command 时必须声明：

- `name`
- `path`
- `permission`
- `action`
- `dataClass`
- `inputSchema`
- 必要时声明 `input: "multipart"` 和 binary 限制。

权限分层不要混在一起：

- OAuth scope：App backend 能调用哪些 Shadow API。
- server membership/resource access：当前 actor 是否能访问该 server 或资源。
- command permission/default approval：当前 App command 是否已被允许。
- Buddy grant：某个 Buddy 是否允许用该 App 或接收该 App 的 Inbox delivery。
- Inbox admission：目标 Inbox 是否接受该来源投递。

## 客户端规则

嵌入式 App 客户端优先使用：

```ts
import { createShadowServerAppRuntimeClient } from '@shadowob/sdk/bridge'

const shadowApp = createShadowServerAppRuntimeClient()
```

使用规则：

- 调 app command：`shadowApp.command(...)`。
- 读 Buddy Inbox picker：`shadowApp.listBuddyInboxes({ refresh: true })`。
- 派任务前请求宿主 grant UI：`shadowApp.ensureBuddyTaskGrant(...)`。
- 有 delivery 后打开 Copilot：`shadowApp.openCopilot(delivery)`。
- 不要启用 `deliverLaunchOutboxFromBrowser`。它只适合明确的 standalone demo。

只需要 host UX、不调用 runtime command 的页面，可以使用 `createShadowServerAppClient()` 或 `ShadowBridge`。

## 服务端规则

Server App backend 使用 SDK runtime：

```ts
import { createShadowServerAppRuntime } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'

const shadowApp = createShadowServerAppRuntime(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOW_SERVER_URL,
})
```

推荐 route 分层：

- `/api/shadow/commands/*`：Shadow server-origin command。解析 Authorization Bearer command token。
- `/api/runtime/commands/*`：iframe UI 调 app backend。携带 `X-Shadow-Launch-Token`，由 backend 处理 outbox 投递。
- `/api/runtime/inboxes`：iframe UI 读取当前 launch actor 可见的 Buddy Inbox target。
- app 自有 REST API：只服务业务页面，使用 app 自己的 session/OAuth。

不要把 Shadow command token、launch token、完整用户 token 或 app secret 写入浏览器可持久化存储。

## Buddy 派任务

给 Buddy 创建 Inbox 任务卡时遵循三段式：

1. App backend 先创建或读取领域对象。
2. command result 附加 `ShadowServerAppOutbox().enqueueInboxTasks(...)`。
3. backend 用 launch token 调 Shadow `/launch/outbox`，拿到 `shadow.outbox.deliveries[]` 后返回 UI。

UI 只有在 delivery 包含 `messageId` 和 `cardId` 后才能显示成功并打开 Copilot。等待授权时显示 pending，不能当作已创建任务卡。

详细规则见 [Buddy 派任务最佳实践](./server-app-buddy-task-dispatch-best-practices.zh-CN.md)。

## OAuth

需要 Shadow OAuth 的 App 仍然保留自己的 OAuth callback 和 app session。Bridge OAuth 只解决嵌入式 UI 的授权承载，不改变 token 和权限边界。

规则：

- `authorizeUrl` 由 app backend 生成。
- 嵌入式 UI 调 `shadowApp.authorizeOAuth({ authorizeUrl })`。
- Host 展示 Shadow 授权 UI，成功后导航 App iframe 到 app callback。
- App callback 交换 code，写 app session cookie，再 redirect 回 app 内部 return_to。

详细规则见 [Bridge OAuth 最佳实践](./server-app-bridge-oauth-best-practices.zh-CN.md)。

## 运行和部署

本地 demo、组合 runtime、生产 env、manifest 安装命令统一维护在 [integrations README](../../integrations/README.md)。不要把部署命令复制到每个专题文档。

基本命令：

```bash
pnpm -C integrations/<app> typegen
pnpm -C integrations/<app> typecheck
pnpm -C integrations/<app> build
```

修改 SDK helper 后，先构建 SDK，再跑依赖它的 integration typecheck：

```bash
pnpm -C packages/sdk build
pnpm -C integrations/<app> typecheck
```

## 验收清单

新增或大改 Server App 时检查：

1. manifest URL、iframe entry、api base URL 在本地、Docker/Lima、生产三种环境都正确。
2. Vite assets 使用相对 base，path-mounted runtime 下不会打到根 `/assets`。
3. command schema 已 typegen，handler 输入类型来自生成文件。
4. App UI 没有用 bridge 做业务数据写入或 Buddy task transport。
5. Buddy 派任务返回 delivery 后才成功，连续发送不会被固定幂等 key 吞掉。
6. OAuth 授权拒绝、刷新、callback、独立访问模式都可恢复。
7. 长期展示用 app snapshot，不保存过期 signed media URL。
8. UI 文案走 i18n，Web/Mobile 宿主能力一致。
9. `pnpm biome check`、相关 typecheck/build/test 已通过。
