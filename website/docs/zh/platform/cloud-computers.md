---
title: 云电脑 API
description: AI 分类中的云电脑 API，用于管理 Buddy 使用的云端运行环境。
---

# 云电脑 API

云电脑 API 属于 AI 分类，不是云的底层 deployment API。Web、Mobile、空间桌面和 SDK 通过云电脑对象访问文件、终端、浏览器、桌面、Buddy、工作区挂载和备份。

云电脑背后可能复用 Cloud deployment、namespace、PVC、exposure、backup 和 cloud worker。客户端不直接处理这些底层对象；需要查看 Pod、日志、暂停/恢复和部署细节时，再进入云的开发者选项。

云电脑代表一个已经部署好的云端运行环境。它不是 Buddy 列表项。Buddy 是虾豆里的 AI 身份；当 Buddy 被添加到云电脑时，平台会把内部 runner runtime、connector 绑定和 Buddy 身份接到同一个环境。

## 产品模型

```text
Cloud Computer
  -> files
  -> terminal
  -> browser
  -> desktop
  -> workspace mounts
  -> buddies[]
  -> backups[]
  -> developer deployment details
```

客户端应把云电脑当成空间对象，而不是原始 deployment。开发者选项可以下钻到底层 deployment、Pod、日志、模板快照和成本。

## 开发者快速开始

当你要接入空间里的云电脑能力时，从这篇文档开始。如果只需要更底层的部署原语，请看 [Cloud SaaS 运行时](./cloud-saas)。

本地开发：

```bash
pnpm dev
```

然后打开：

- Web：`/app/cloud-computers`
- 空间桌面：`/app/space`，再打开内置的云电脑应用
- Mobile：`/(main)/cloud-computers`
- API：`GET /api/cloud-computers?limit=100&offset=0`

云电脑开发需要正常的 Shadow server，以及当前环境可用的 Cloud worker/Kubernetes 能力。轻量开发环境如果没有可工作的集群，UI 仍然应该能展示列表、空状态、加载态、错误态和修复态；终端、远程桌面、浏览器、备份和工作区挂载等运行时操作，会在 Cloud 可用前返回配置或 Pod 错误。

常用开发环境变量：

| 变量 | 用途 |
| --- | --- |
| `CLOUD_COMPUTER_FILE_ROOT` | 文件 API 在运行时容器中的首选根目录。 |
| `CLOUD_COMPUTER_FILE_MAX_BYTES` | 文本/文件预览的最大读取大小。 |
| `CLOUD_COMPUTER_FILE_MAX_NODES` | 树遍历最多返回节点数。 |
| `CLOUD_COMPUTER_FILE_MAX_DEPTH` | 树 API 最大遍历目录深度。 |
| `CLOUD_COMPUTER_DESKTOP_IMAGE` | 修复或接入桌面/VNC 能力时使用的镜像。 |
| `CLOUD_COMPUTER_BROWSER_IMAGE` | 修复或接入浏览器/CDP 能力时使用的镜像。 |
| `CLOUD_COMPUTER_DESKTOP_WIDTH` / `CLOUD_COMPUTER_DESKTOP_HEIGHT` | 默认桌面 session 分辨率。 |

## SDK 形态

TypeScript SDK 直接暴露 AI 分类中的云电脑路由：

```ts
const computers = await client.listCloudComputers({ limit: 100 })
const computer = await client.createCloudComputer({ name: 'Studio Computer' })
await client.updateCloudComputer(computer.id, { name: 'Research Runtime' })
await client.createCloudComputerBackup(computer.id, { label: 'Before browser login' })
```

浏览器、远程桌面、工作区挂载、备份和 Cloud Buddy 也都有 `client.*CloudComputer*` 辅助方法。客户端优先使用这些方法，不要直接调用 `/api/cloud-saas/deployments/*`。

## 生命周期和状态

云电脑卡片要防御式实现，因为一张卡片背后汇总了多个资源：deployment row、Kubernetes namespace、Pod、PVC、可选浏览器、可选桌面、可选 Cloud Buddy runner 和备份。

| 状态 | 产品含义 | 客户端行为 |
| --- | --- | --- |
| `pending` / `deploying` | 部署已创建，但运行时还没准备好。 | 展示进度，禁用终端/浏览器/桌面操作。 |
| `deployed` / `running` | 运行时可用。 | 按 `capabilities` 开启文件、终端、浏览器、桌面、Buddy、备份和工作区挂载。 |
| `paused` / `stopped` | 状态保留，但计算资源未运行。 | 展示恢复/修复动作，并保留备份入口。 |
| `failed` | 部署或运行时修复失败。 | 展示最新错误和修复动作。 |
| `destroyed` | 仅作为历史记录存在。 | 默认隐藏，除非请求 `includeHistory=1`。 |

不要只通过状态推断能力。列表/详情响应里的 `capabilities` 才是客户端开关的依据。

## 授权模型

所有路由都需要 Shadow 认证，并通过标准 auth middleware 解析显式 Actor。

| 路由 | Actor | 资源 | Action | 数据级别 |
| --- | --- | --- | --- | --- |
| `GET /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `read` | `server-private` |
| `POST /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `deploy` | `cloud-secret` |
| `GET /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `read` | `server-private` |
| `PATCH /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `manage` | `server-private` |
| `/api/cloud-computers/:id/files/*` | user/pat/oauth | `cloud_computer:{id}/files` | `read/write` | `secret` |
| Socket.IO `cloud-computer:terminal:*` | user session | `cloud_computer:{id}/pod:{pod}` | `manage` | `cloud-secret` |
| `POST /api/cloud-computers/:id/browser/session` | user session | `cloud_computer:{id}/browser` | `manage` | `cloud-secret` |
| `POST /api/cloud-computers/:id/desktop/session` | user session | `cloud_computer:{id}/desktop` | `manage` | `cloud-secret` |
| `POST /api/cloud-computers/:id/workspace-mounts` | user session | `cloud_computer:{id}/workspace-mounts` | `manage` | `cloud-secret` |
| `GET/POST /api/cloud-computers/:id/buddies` | user/pat/oauth | `cloud_computer:{id}/buddies` | `read/deploy` | `server-private` |
| `GET/POST /api/cloud-computers/:id/backups` | user/pat/oauth | `cloud_computer:{id}/backups` | `read/write` | `cloud-secret` |
| `POST /api/cloud-computers/:id/restore` | user/pat/oauth | `cloud_computer:{id}/restore` | `manage` | `cloud-secret` |

OAuth/PAT scope 不是唯一条件。服务端还要检查 deployment owner access、server membership、Buddy ownership、workspace mount policy、backup ownership 和 root path policy。

## 列出云电脑

```http
GET /api/cloud-computers?limit=100&offset=0
```

返回：

```json
[
  {
    "id": "cc_stable-environment-id",
    "name": "Team Runtime",
    "status": "deployed",
    "agentCount": 2,
    "createdAt": "2026-06-27T00:00:00.000Z",
    "updatedAt": "2026-06-27T00:00:00.000Z",
    "lastActiveAt": "2026-06-27T00:00:00.000Z",
    "capabilities": {
      "files": true,
      "terminal": true,
      "browser": true,
      "desktop": true,
      "buddies": true,
      "backups": true
    }
  }
]
```

`includeHistory=1` 可以包含已销毁或历史 deployment。

## 创建和更新

```http
POST /api/cloud-computers
Content-Type: application/json

{
  "name": "My Cloud Computer"
}
```

创建接口会选择可部署的云电脑模板，并走同一条经过校验的 Cloud SaaS 部署流水线。模板、namespace 和资源规格是内部细节。

```http
PATCH /api/cloud-computers/:id
Content-Type: application/json

{
  "name": "Studio Computer"
}
```

当前更新只修改展示名。它更新底层 Cloud deployment row，不创建额外的 Cloud Computer 记录。

## 文件

```http
GET    /api/cloud-computers/:id/files/tree
GET    /api/cloud-computers/:id/files/stats
GET    /api/cloud-computers/:id/files/files/search?searchText=app
POST   /api/cloud-computers/:id/files/folders
PATCH  /api/cloud-computers/:id/files/folders/:folderId
DELETE /api/cloud-computers/:id/files/folders/:folderId
POST   /api/cloud-computers/:id/files/files
GET    /api/cloud-computers/:id/files/files/:fileId
PATCH  /api/cloud-computers/:id/files/files/:fileId
DELETE /api/cloud-computers/:id/files/files/:fileId
POST   /api/cloud-computers/:id/files/files/:fileId/clone
POST   /api/cloud-computers/:id/files/upload
POST   /api/cloud-computers/:id/files/nodes/paste
```

规则：

- root 使用 `CLOUD_COMPUTER_FILE_ROOT`，否则按 `/workspace`、`/workspaces`、`/home/shadow`、`/state`、`/tmp` 顺序选择。
- node id 是不透明的 `cf_...`，客户端不要解析。
- 路径被限制在 root 内；拒绝 `..`、控制字符、删除 root 和包含 `/` 的文件名。
- 上传和文本保存通过 Kubernetes exec 写入 running pod。
- 树遍历有最大节点数、深度和文件大小限制。
- 文件预览使用短期 signed URL，不向浏览器暴露 Kubernetes、VNC、CDP、MinIO 或用户 token。

```http
GET /api/cloud-computers/:id/files/files/:fileId/media-url?disposition=inline
```

## 终端

终端使用已认证的 Socket.IO 连接：

- `cloud-computer:terminal:start`
- `cloud-computer:terminal:input`
- `cloud-computer:terminal:resize`
- `cloud-computer:terminal:stop`
- 服务端事件：`cloud-computer:terminal:data`、`cloud-computer:terminal:exit`

后端使用 `node-pty` 包装 `kubectl exec -it`，因此支持 TUI 程序、resize、Ctrl+C/Ctrl+D 和正常 shell 行为。交互式终端只允许 user session，agent token 不能借用户身份打开 shell。

## 浏览器

```http
POST /api/cloud-computers/:id/browser/session
POST /api/cloud-computers/:id/browser/screenshot
POST /api/cloud-computers/:id/browser/navigate
POST /api/cloud-computers/:id/browser/click
POST /api/cloud-computers/:id/browser/type
POST /api/cloud-computers/:id/browser/key
POST /api/cloud-computers/:id/browser/repair
```

浏览器是 browser-native CDP surface。用户通过截图、导航、点击、输入和按键接口操作真实 Chrome/Chromium profile。它用于用户手动完成登录、MFA 和人类验证，不用于破解验证码或绕过第三方风控。

## 远程桌面

```http
POST /api/cloud-computers/:id/desktop/session
POST /api/cloud-computers/:id/desktop/repair
GET  /api/cloud-computers/:id/desktop/ws?token=...
```

Web 客户端使用 noVNC。服务端验证短期 session token 后，通过 `kubectl port-forward` 桥接到 namespace 内的 VNC service。VNC service 必须保持 ClusterIP/internal-only。

## 工作区挂载

```http
POST /api/cloud-computers/:id/workspace-mounts
Content-Type: application/json

{
  "serverId": "server-id-or-slug",
  "rootId": "optional-workspace-folder-node-id",
  "mountPath": "/workspace/server-workspaces/server-id",
  "readOnly": true
}
```

挂载通过 `shadowob workspace webdav` runtime 完成，让授权仍然停留在 Shadow workspace API 后面，避免直接挂对象存储。响应不会返回完整用户 token；runtime 只收到 Kubernetes Secret 引用。

## Buddies

```http
GET  /api/cloud-computers/:id/buddies
POST /api/cloud-computers/:id/buddies
POST /api/cloud-computers/:id/buddies/:buddyId/start
POST /api/cloud-computers/:id/buddies/:buddyId/stop
```

这些接口只管理所选云电脑里的 Cloud Buddy。创建 Buddy 会把 Buddy 身份、内部 runner runtime 和 connector binding 追加到底层 deployment config，然后走 Cloud SaaS redeploy。它不会创建第二台云电脑。

## 备份和恢复

```http
GET  /api/cloud-computers/:id/backups
POST /api/cloud-computers/:id/backups
POST /api/cloud-computers/:id/restore
POST /api/cloud-computers/:id/runtime/repair
```

云电脑 UI 应使用这些 route；`/api/cloud-saas/deployments/*` 保留给云的开发者选项。备份可能使用 CSI VolumeSnapshot，也可能回退到对象归档，取决于集群能力和配置。

## 前端接入检查表

- 把云电脑当成空间对象，而不是原始 deployment 列表。
- 空间桌面和独立页面应复用同一套 Cloud Computers UI。
- 桌面和浏览器使用短期 session URL；不要把 VNC、CDP、Kubernetes、MinIO 或用户 token 存进客户端状态。
- 文件、终端、浏览器、桌面、Buddy、备份和工作区挂载要能独立恢复。单个组件失败不应该让整页空白。
- Mobile 可以暴露列表、创建、修复、Buddy、备份、工作区挂载、文件、浏览器动作和桌面入口，但终端和桌面控制需要保持紧凑。

## Seed 截图数据

产品文档截图应来自稳定、贴近业务场景的 seed 数据，而不是手工维护的一次性账号和图片。

```bash
DOCS_SCREENSHOT_SEED=shadow-docs-v1 pnpm e2e:docs-screenshots:local
```

seed 流程会创建一套独立的文档场景：稳定的用户、头像、空间品牌、壁纸、频道、工作区文件、Buddy、Buddy Inbox、店铺数据、云电脑和桌面布局。Playwright 会刷新空间桌面截图：

- `docs-desktop-travel-home.png`
- `docs-desktop-gaming-channel.png`
- `docs-desktop-family-file.png`
- `docs-desktop-art-cloud-computer.png`
- `docs-desktop-music-buddy-inbox.png`

云电脑 UI 改动后，请更新 `scripts/e2e/docs-screenshot-faker.mjs` 的业务场景并重新生成截图，不要手工修 PNG。

---

- [空间](./servers)
- [工作区](./workspace)
- [云](./cloud)
- [空间应用](./server-apps)
