# Server App 开发接入

这份指南从零开始接入一个服务器 App。标准可运行 demo 位于 `integrations/kanban`；问答和测验示例位于 `integrations/qna` 与 `integrations/quiz`。

## 1. 准备 Manifest

App 需要暴露 `/.well-known/shadow-app.json`：

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "demo-desk",
  "name": "Demo Desk",
  "iconUrl": "https://app.example.com/icon.png",
  "iframe": {
    "entry": "https://app.example.com/shadow/server",
    "allowedOrigins": ["https://app.example.com"]
  },
  "api": {
    "baseUrl": "https://app.example.com",
    "auth": { "type": "oauth2-bearer" }
  },
  "commands": [
    {
      "name": "tickets.create",
      "path": "/api/shadow/commands/tickets.create",
      "permission": "tickets:write",
      "action": "write",
      "dataClass": "server-private"
    }
  ],
  "skills": [
    {
      "name": "ticket-ops",
      "description": "Use when a Buddy needs to create or update tickets."
    }
  ]
}
```

`appKey` 是 Buddy CLI 调用时使用的稳定标识。生产环境的 iframe 和 API URL 应使用 HTTPS。

生产环境应发布稳定的 HTTPS origin。不要在 manifest 里暴露公共 `http://<ip>:<port>` 地址：Shadow 页面本身通过 HTTPS 加载，浏览器会拦截来自 IP 字面量 HTTP host 的 iframe、图片和 frame navigation。

如果反向代理和 App 目标主机不在同一台机器上，DNS 应指向 HTTPS 代理，代理再通过内网或公网 IP 转发到 App 主机。公开 manifest 里只保留域名，不要保留 IP：

```dotenv
SHADOW_SERVER_URL=https://shadowob.com
SHADOW_WEB_BASE_URL=https://shadowob.com
FLASH_PUBLIC_BASE_URL=https://flash-app.shadowob.com
FLASH_API_BASE_URL=https://flash-app.shadowob.com
FLASH_OAUTH_REDIRECT_URI=https://flash-app.shadowob.com/shadow/oauth/callback
```

每次修改 JSON manifest 后，先生成 typed manifest 模块：

```bash
shadow-server-app typegen shadow-app.local.json src/shadow-app.generated.ts
```

生成文件会保留命令名和 JSON Schema 字面量，让 TypeScript 能推导 command input 类型。

命令 schema 要明确，但也要保持足够浅，避免超过 Shadow 的 manifest 深度限制。对于 quiz answer 这类灵活值，优先使用浅层对象字段，再在 App 领域逻辑里做校验，不要把很深的 `oneOf` 都塞进 manifest。

## 2. 创建 App Runtime

Shadow 代理命令时会附带：

- `Authorization: Bearer <short-lived-token>`
- `X-Shadow-Server-Id`
- `X-Shadow-Server-App-Id`
- `X-Shadow-App-Key`
- `X-Shadow-Command`

使用 SDK runtime 来重写 manifest URL、introspect token、校验 command input，并解析 actor profile：

```ts
import { defineShadowServerApp } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOW_SERVER_URL,
})

const store = createShadowServerAppJsonStore({
  filePath: process.env.DEMO_DATA_FILE ?? './data/demo.json',
  defaultValue: defaultState,
})
```

Runtime 会把 introspection 得到的 actor 暴露给 command handler。它会告诉你调用者是普通用户、PAT、OAuth 用户还是 Buddy agent，并给出 `userId`、`buddyAgentId`、`ownerId`、`permission`、`action` 和 `dataClass`。

## 3. 实现命令接口

用 schema 推导出来的 input 类型定义命令：

```ts
const commands = shadowApp.defineCommands({
  'tickets.create': (input, { actor }) => {
    return { ticket: createTicket({ ...input, author: actor }) }
  },
})
```

Shadow command 路由统一走 runtime：

```ts
const result = await shadowApp.executeCommand(
  commandName,
  {
    authorizationHeader: c.req.header('authorization'),
    serverIdHeader: c.req.header('X-Shadow-Server-Id'),
    appKeyHeader: c.req.header('X-Shadow-App-Key'),
    requestBody: await c.req.text(),
  },
  commands,
)
return c.json(result.body, result.status)
```

后端应以 introspection 得到的上下文为准，不要信任请求 body 里的身份字段。二进制命令使用 multipart，`input` 字段仍是 JSON 字符串，文件字段由 manifest 的 `binary.field` 指定。

## 4. iframe 自动刷新

Shadow 打开 iframe 时会附带 `shadow_event_stream`：

```ts
const params = new URLSearchParams(window.location.search)
const stream = params.get('shadow_event_stream')
if (stream) {
  const events = new EventSource(stream)
  events.addEventListener('server_app.command.completed', () => reloadData())
}
```

Buddy 通过 CLI 修改资源后，Shadow 会发出 `server_app.command.completed`，App 可以立即刷新列表。

保持 iframe 稳定：

- launch context 要缓存到接近过期，不要在 window focus 或 tab 切换时重新请求 launch。
- 全局导航数据在 refetch 时保持温热；已有缓存时不要用路由级 loading 把页面卸载。
- 除非安装的 App 身份变化，不要改变 iframe 的 `src` query 参数或 React `key`。
- 命令执行后的更新通过 `shadow_event_stream` 或 App 自己的事件流增量 patch，不要为了普通刷新 remount iframe。

如果 Server App 需要 Shadow OAuth，用顶层 popup 或跳转打开 `/app/oauth/authorize`。Shadow OAuth 页面会返回 `frame-ancestors 'none'`，不能放进 Server App iframe。Shadow iframe sandbox 需要包含 `allow-popups-to-escape-sandbox` 才能完成 popup OAuth。

## 5. 安装、授权和调用

管理员在服务器设置里的 Apps 页面选择名录 App 或输入自定义 manifest URL。CLI 等价流程：

```bash
shadowob app preview --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app install --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app grant demo-desk --server <server-id-or-slug> --buddy <buddy-id> --permissions tickets:write
shadowob app uninstall demo-desk --server <server-id-or-slug>
```

本地 Docker/Lima 开发时，可以一次启动标准 demo，并安装 Shadow server 容器能访问到的 manifest URL：

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up -d --build

shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4210/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4211/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4212/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4213/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4214/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4215/.well-known/shadow-app.json
```

公开安装时，使用反向代理暴露出来的 HTTPS manifest URL：

```bash
shadowob app install --server shadow-plays --manifest-url https://flash-app.shadowob.com/.well-known/shadow-app.json
```

`/.well-known/shadow-app.json` 必须在网站 SPA fallback 之前命中。如果 Shadow Web 和官网共用一个 host，`/app/oauth/authorize` 是标准 OAuth 浏览器入口，legacy `/oauth/authorize` 应重定向到它，并且 `/.well-known/*` 协议文件要先于 docs 或 frontend fallback 代理。

给 Buddy 授予它需要调用的全部命令权限，然后为 `first_time` 写命令做一次确认：

```bash
shadowob app grant shadow-kanban --server shadow-plays --buddy <buddy-id> --permissions kanban.boards:read,kanban.cards:write
shadowob app approve shadow-kanban cards.create --server shadow-plays --buddy <buddy-id>
```

Buddy 在频道里被触发时会收到被 @ App 的 Skills 文档，并通过统一 CLI 调用：

```bash
shadowob app discover --server <server-id-or-slug> --json
shadowob app call demo-desk tickets.create --server <server-id-or-slug> --json-input '{"title":"Example"}' --json
```

频道用户只需要 `@Demo Desk 创建一个 ticket`，不需要说明 CLI 用法。
