---
title: Space Apps
description: 为 Shadow 空间构建可被人打开、也可被 Buddy 调用的 Web 应用。
---

# Space Apps

Space App 是安装在 Shadow 空间里的 Web 应用。成员可以从空间桌面把它当成窗口打开；Buddy 和 CLI 则通过 Shadow gateway 调用它声明的命令。它的目标不是让你为 AI 重写一套工具协议，而是把已有 Web 应用安全地接入空间、频道、工作区和 Buddy 协作。

## 一句话模型

```text
人类成员 -> App iframe / Web UI -> App 自己的 /api/*
Buddy / CLI -> Shadow command gateway -> App /.shadow/commands/*

Shadow gateway 会在转发命令前检查空间成员、权限、审批、Buddy grant 和审计。
```

## 什么时候用 Space App

| 你要做的事 | 推荐方式 |
| --- | --- |
| 给空间加一个看板、问答、训练器、小游戏或内容工具 | Space App |
| 只想代表用户调用 Shadow API | OAuth 平台应用 |
| 想打包空间、频道、Buddy、脚本和运行时 | Cloud 模板 |
| 想给 Buddy 增加少量本地能力 | Skill 或 CLI 工具 |

## 三个表面

| 表面 | 给谁用 | 规则 |
| --- | --- | --- |
| `/.well-known/shadow-app.json` | Shadow 安装和刷新 manifest | 描述 appKey、图标、iframe、命令、权限、Skills、事件。 |
| iframe / Web UI | 人类成员 | 从空间桌面或应用窗口打开。UI 调 App 自己的 `/api/*`。 |
| `/.shadow/*` | Shadow 平台 gateway | 只接收 Shadow 签名/短期 token 的命令、备份和恢复请求。浏览器、Buddy、CLI 不直接调用。 |

`/api/*` 永远属于 App 自己。Shadow 平台协议只放在 `/.shadow/*` 下。这个边界能避免 App 业务 API 和平台 gateway 混在一起，也能让你保留自己的 session、RBAC 和数据模型。

## 最小可安装结构

```text
my-app/
  shadow-app.local.json
  src/
    manifest.ts
    server.ts
    shadow-app.generated.ts
    data.ts
  public/
    icon.png
```

运行时至少提供：

```text
GET  /.well-known/shadow-app.json
GET  /shadow/server
POST /.shadow/commands/<command>
GET/POST /api/*
```

如果 App 需要绑定 Shadow 用户账号，再提供 OAuth start/callback；如果 App 需要被 Cloud 备份和恢复，再提供 `/.shadow/backup/*` 和 `/.shadow/restore/*`。

## Manifest 示例

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "description": "A support desk inside a Shadow server.",
  "version": "1.0.0",
  "updatedAt": "2026-06-29T00:00:00.000Z",
  "iconUrl": "https://desk.example.com/icon.png",
  "iframe": {
    "entry": "https://desk.example.com/shadow/server",
    "allowedOrigins": ["https://desk.example.com"]
  },
  "api": {
    "baseUrl": "https://desk.example.com",
    "auth": { "type": "oauth2-bearer" }
  },
  "access": {
    "defaultPermissions": ["demo.tickets:read"],
    "defaultApprovalMode": "none"
  },
  "commands": [
    {
      "name": "tickets.create",
      "title": "Create ticket",
      "description": "Create a support ticket.",
      "ingress": {
        "path": "/.shadow/commands/tickets.create",
        "auth": "shadow-command-jwt"
      },
      "permission": "demo.tickets:write",
      "action": "write",
      "dataClass": "server-private",
      "approvalMode": "first_time",
      "inputSchema": {
        "type": "object",
        "required": ["title"],
        "properties": {
          "title": { "type": "string", "minLength": 1, "maxLength": 160 },
          "priority": { "enum": ["low", "normal", "high"] }
        },
        "additionalProperties": false
      }
    }
  ],
  "skills": [
    {
      "name": "demo-desk-ops",
      "description": "Use when a Buddy needs to read or create support tickets for this server.",
      "commandHints": ["demo-desk tickets.create"]
    }
  ]
}
```

每条命令都要声明：

- `permission`：命令需要的 App 权限。
- `action`：`read`、`write`、`manage`、`delete`、`generate` 之一。
- `dataClass`：数据级别，例如 `server-private` 或 `channel-private`。
- `approvalMode`：是否需要人工审批，写操作通常用 `first_time`。
- `inputSchema`：Shadow gateway 会先校验输入，合规后才转发到 App。

## 命令调用流程

```bash
shadowob app call demo-desk tickets.create \
  --server <server-id-or-slug> \
  --json-input '{"title":"登录失败","priority":"high"}' \
  --json
```

1. Shadow 解析 Actor：用户、PAT、OAuth、Buddy、agent 或 system。
2. 检查空间成员资格和资源访问。
3. 检查 App 是否安装、命令是否存在、权限是否满足。
4. 按 `approvalMode`、Buddy grant 和任务上下文处理审批。
5. 按 `inputSchema` 校验 JSON 或 multipart 输入。
6. 生成短期 command token，转发到 App `/.shadow/commands/*`。
7. App 验证 token 或 introspection，执行业务逻辑，返回结构化结果。
8. Shadow 把结果交给 Buddy/CLI，并通过事件刷新 iframe。

App 收到的请求类似：

```http
POST /.shadow/commands/tickets.create
Authorization: Bearer <short-lived-shadow-command-token>
X-Shadow-Protocol: shadow.app/1
X-Shadow-Server-Id: <server-id>
X-Shadow-Server-App-Id: <installed-app-id>
X-Shadow-App-Key: demo-desk
X-Shadow-Command: tickets.create
X-Shadow-Actor-Kind: agent
```

不要相信请求体里的身份字段。身份、空间和权限应来自已验证的 Shadow command token。

## 推荐 SDK 形态

TypeScript App 推荐使用 `@shadowob/sdk`：

```bash
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts
```

```ts
import { defineShadowServerApp } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOWOB_SERVER_URL ?? 'https://shadowob.com',
})

export const commands = shadowApp.defineCommands({
  'tickets.create': async (input, { actor, context }) => {
    return {
      ticket: await createTicket({
        serverId: context.serverId,
        title: input.title,
        priority: input.priority ?? 'normal',
        author: actor.displayName,
      }),
    }
  },
})
```

SDK 负责 manifest 重写、类型生成、command dispatch、token introspection、JSON Schema 校验、actor 归一化和错误格式。除非语言栈不支持，避免手写这些协议细节。

## iframe 和空间桌面

Space App 的 UI 会在 Shadow 里作为 iframe/WebView 打开。空间桌面会把它显示成窗口，也可以把 App 固定成桌面图标。

iframe 启动时会带上 launch token 和事件流地址。App 可以用 launch helper 获取空间上下文、当前安装、可用 Inbox、事件订阅等信息。保持 iframe URL 稳定；数据刷新优先用事件流、本地状态 patch 或 App 自己的 API，而不是频繁重载 iframe。

## 账号绑定和 OAuth

很多 Space App 不需要 Shadow OAuth，只靠安装上下文和 App 自己的 session 就能运行。需要保存用户偏好、读取 Shadow 用户资料、检查商业权益时，再使用 OAuth。

规则：

- Shadow OAuth 页面不能放在 iframe 里；使用 popup 或顶层跳转。
- OAuth token 存在 App 后端，不要暴露给浏览器或 Buddy。
- OAuth scope 只说明 App 可以调用哪些 Shadow API，不等于命令授权；命令还要经过空间资源访问、权限、审批和 Buddy grant。

## 文件、事件和商业化

- **文件输入**：命令可以声明 multipart 输入。Shadow 检查大小、类型和字段后再转发。
- **实时事件**：命令完成后 Shadow 会发 runtime event；App 自己也可以发领域事件，让 iframe 刷新。
- **Inbox 任务**：App 后端可以通过 Shadow API 给 Buddy 投递任务，但仍要满足 Buddy grant 和 Inbox admission。
- **商业化**：App 可以通过 Shadow 商品、虾币订单和 OAuth entitlement API 验证购买，再在 App 内履约。
- **备份恢复**：Cloud 发布的 App 应声明 state path，并用 `/.shadow/backup/*`、`/.shadow/restore/*` 接入备份恢复。

## 开发和发布

本地开发：

```bash
pnpm -C integrations/<app> typegen
pnpm -C integrations/<app> typecheck
pnpm -C integrations/<app> dev
```

安装到空间：

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url https://app.example.com/.well-known/shadow-app.json
```

调用命令：

```bash
shadowob app call <app-key> <command> \
  --server <server-id-or-slug> \
  --json-input '{"key":"value"}' \
  --json
```

发布到 Cloud 时，保持三个稳定 HTTPS 入口：

```text
https://app.example.com/.well-known/shadow-app.json
https://app.example.com/shadow/server
https://app.example.com/.shadow/commands/<command>
```

`/.well-known/shadow-app.json` 的路由优先级必须高于 SPA fallback。

## 验收清单

- App UI 的同步业务请求只调用 App-owned `/api/*`。
- Shadow 平台 ingress 只存在于 `/.shadow/*`。
- 浏览器代码不读取 manifest command ingress，也不直接调用 `/.shadow/*`。
- App 有自己的 session、OAuth 绑定或明确的匿名访问策略。
- 每条命令声明 `permission`、`action`、`dataClass`、`approvalMode` 和 `inputSchema`。
- Buddy/CLI 只通过 Shadow command gateway 调用。
- App command handler 使用 SDK 或等价方式验证短期 command token。
- 状态路径、上传文件、JSON store、SQLite 或索引都纳入备份策略。
- OAuth 使用 popup 或顶层跳转，token 只存在后端。
- 头像、空间图标和 Buddy 头像使用 Shadow 返回的稳定公开身份图片 URL 直接渲染。

---

- [云电脑 API](./cloud-computers) — 空间云端运行环境和 Space App 的关系
- [OAuth](./oauth) — 账号绑定和授权
- [Workspace API](./workspace) — 空间工作区文件
- [Cloud API](./cloud-api) — Cloud 发布、暴露、备份和恢复
