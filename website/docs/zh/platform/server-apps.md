# 服务器应用

服务器应用可以把外部 App 安装到一个 Shadow 服务器里，和频道、Buddy 并列存在。用户在服务器页面通过 iframe 打开 App；Buddy 则通过统一的 `shadowob app` 命令操作同一个 App。

## 安装

服务器管理面板里的 “Apps” 页负责新增、列表和授权。服务器左侧栏会在 `CHANNELS` 上方显示已安装 App，点击 App 会直接在右侧打开 iframe；点击 `APPS +` 会进入管理面板的添加 App 页面。管理员可以从全局 App 名录安装已有 App，也可以输入自定义 manifest URL。自定义流程会像 OAuth 授权一样展示 App 图标、名称、描述和申请权限，确认后才会安装。

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-file integrations/kanban/shadow-app.local.json
```

App 是服务器级别的。一个服务器可以安装多个 App，每个 Buddy 都必须获得明确授权后才能调用 App 命令。
命令调用使用 Shadow 签发的短期不透明 OAuth Bearer token。App 后端通过 introspection 接口解析用户/Buddy 身份，不会收到用户 JWT 或静态共享密钥。

## 本地 Demo

仓库内置三个标准 demo App：Kanban、Answers 和 Quiz。可以用 Docker Compose 一次启动：

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/compose.yaml --env-file integrations/.env up -d --build
```

本地 Shadow Docker 栈下，iframe URL 面向浏览器使用 `localhost`，API/manifest URL 面向 Shadow server 使用 `host.lima.internal`：

```bash
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4210/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4211/.well-known/shadow-app.json
```

每个 demo 都把 App 数据保存在独立的 Compose named volume 里。`docker compose -f integrations/compose.yaml restart` 会保留数据；`down -v` 会删除数据。

## Buddy 授权

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-id> \
  --permissions demo.tickets:read,demo.tickets:write
```

带有 `approvalMode: "first_time"` 的命令仍需要为该 Buddy 做一次确认：

```bash
shadowob app approve demo-desk tickets.create \
  --server <server-id-or-slug> \
  --buddy <buddy-id>
```

Buddy 可以通过自动生成的 Skill 文本发现用法：

```bash
shadowob app discover --server <server-id-or-slug>
shadowob app skills demo-desk --server <server-id-or-slug>
```

频道里可以直接 @ 已安装的 App，例如 `@Demo Desk 创建一个高优先级 ticket`。Shadow 会把它规范化为 App mention，Buddy 运行时会收到 appKey/serverId，并自动走 `shadowob app discover` 与 `shadowob app call` 的 CLI 链路，不需要用户说明 CLI 用法。

## 调用命令

```bash
shadowob app call demo-desk tickets.list \
  --server <server-id-or-slug> \
  --json-input '{}'
```

Shadow 会先校验 Actor、服务器成员身份、Buddy 授权、命令权限和 JSON 限制，再代理到 App 后端。

App iframe 启动时会收到 `shadow_event_stream`。App 可以用 `EventSource` 监听 `server_app.command.completed`，当 Buddy 通过 CLI 修改资源后自动刷新数据。

## Manifest

App manifest 使用 `shadow.app/1`。它声明必填 `iconUrl`、iframe origin、API base URL、命令、权限、数据级别、可选二进制限制，以及简洁的 Skill 提示。

## Cloud 模版

`shadowob` Cloud 插件支持在模版中声明 `serverApps`。部署时会自动创建服务器、Buddy，安装 Server App，并把权限授予 Buddy。内置 `shadow-server-app-demo` 模版会安装 Demo Desk，并让 Buddy 通过 `shadowob app call` 操作票据。

## 管理端

Shadow Admin 的 “App 集成” tab 可以维护全局 App 名录，也会列出所有服务器已安装的 App、命令数量、Skill 数量、Buddy 授权数量、iframe 和 API 端点。全局管理员可以从 manifest URL 增加名录项，并在异常或安全事件时直接卸载某个集成。

完整协议、从零到一开发指南和可复制 demo 项目见 [Server App 开发接入](./server-apps-dev-guide)、`docs/api/server-app-integrations.md` 与 `integrations/kanban`。更多 demo 位于 `integrations/qna` 和 `integrations/quiz`，`integrations/compose.yaml` 可以配合 dotenv 在本地一次启动所有标准 demo App。
