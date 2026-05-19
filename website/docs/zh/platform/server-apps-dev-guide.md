# Server App 开发接入

这份指南从零开始接入一个服务器 App。完整可运行示例在 `skills/shadow-server-app/example-app`。

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

## 2. 验证 Shadow Bearer Token

Shadow 代理命令时会附带：

- `Authorization: Bearer <short-lived-token>`
- `X-Shadow-Server-Id`
- `X-Shadow-Server-App-Id`
- `X-Shadow-App-Key`
- `X-Shadow-Command`

App 后端把 token 发回 Shadow introspection 接口：

```ts
async function introspect(token: string, serverId: string, appKey: string) {
  const res = await fetch(
    `${process.env.SHADOW_SERVER_URL}/api/servers/${serverId}/apps/${appKey}/oauth/introspect`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
  )
  const result = await res.json()
  if (!result.active) throw new Error('invalid_token')
  return result.shadow
}
```

`result.shadow.actor` 会告诉你调用者是普通用户、PAT、OAuth 用户还是 Buddy agent，并给出 `userId`、`buddyAgentId`、`ownerId`、`permission`、`action` 和 `dataClass`。

## 3. 实现命令接口

JSON 命令会收到：

```json
{
  "input": { "title": "Example" },
  "context": {
    "protocol": "shadow.app/1",
    "serverId": "...",
    "appKey": "demo-desk",
    "command": "tickets.create"
  }
}
```

后端应以 introspection 返回的 `shadow` 上下文为准，而不是信任请求 body 里的 context。二进制命令使用 multipart，`input` 字段仍是 JSON 字符串，文件字段由 manifest 的 `binary.field` 指定。

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

## 5. 安装、授权和调用

管理员在服务器设置里的 Apps 页面选择名录 App 或输入自定义 manifest URL。CLI 等价流程：

```bash
shadowob app preview --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app install --server <server-id-or-slug> --manifest-url https://app.example.com/.well-known/shadow-app.json
shadowob app grant demo-desk --server <server-id-or-slug> --buddy <buddy-id> --permissions tickets:write
shadowob app uninstall demo-desk --server <server-id-or-slug>
```

Buddy 在频道里被触发时会收到被 @ App 的 Skills 文档，并通过统一 CLI 调用：

```bash
shadowob app discover --server <server-id-or-slug> --json
shadowob app call demo-desk tickets.create --server <server-id-or-slug> --json-input '{"title":"Example"}' --json
```

频道用户只需要 `@Demo Desk 创建一个 ticket`，不需要说明 CLI 用法。
