# Server 到 Space 的产品重构计划

日期：2026-05-28

状态：计划中

## 背景

Shadow 当前把面向用户的组织单元称为 Server。这个词对开发者和类 Discord 用户是熟悉的，但对更广泛的协作、内容、商务和 AI Buddy 场景会带来额外心智负担：用户容易把它理解为基础设施服务器，而不是一个可聊天、协作、开店、放文件、安装应用和运行 Buddy 的产品空间。

本重构的目标是把对外产品概念统一为 Space。第一阶段只迁移对外表面，并让服务端同时兼容新旧接口；内部数据库表、迁移历史和核心服务命名暂不做大规模重命名，避免把产品语义迁移变成高风险数据层迁移。

## 产品目标

1. 降低用户心智成本：用户看到的是 Space，而不是 Server。
2. 统一产品叙事：Space 是 Shadow 的协作容器，承载频道、成员、Buddy、应用、工作区、商店和权限。
3. 保持兼容：旧 Web/Mobile/SDK/CLI/Cloud template/第三方 App 在迁移期间继续工作。
4. 收敛外部契约：新增文档、SDK、CLI、API 示例、模版和 UI 只能使用 Space 术语。
5. 可量化验收：通过扫描器持续统计遗留 Server 暴露面，并在 CI 中阻止新增外部 Server 术语。
6. 安全边界不退化：权限、OAuth scope、审计、数据分类和资源访问在 Space 新命名下保持等价语义。

## 术语决策

| 旧术语 | 新术语 | 第一阶段处理 |
| --- | --- | --- |
| Server | Space | 对外改为 Space |
| servers | spaces | 对外改为 spaces |
| serverId | spaceId | 新接口和新 SDK 使用 spaceId，旧字段兼容 |
| serverSlug | spaceSlug | 新路由和新 SDK 使用 spaceSlug，旧字段兼容 |
| serverName | spaceName | 新响应和 UI 使用 spaceName，旧字段兼容 |
| `/api/servers` | `/api/spaces` | 新旧 API 双入口 |
| `/api/oauth/servers` | `/api/oauth/spaces` | 新旧 OAuth API 双入口 |
| `servers:read` | `spaces:read` | 新 scope 主推，旧 scope 继续生效 |
| `servers:write` | `spaces:write` | 新 scope 主推，旧 scope 继续生效 |
| `server-private` | `space-private` | 新 manifest/data class 主推，旧值继续解析 |
| `X-Shadow-Server-Id` | `X-Shadow-Space-Id` | 新 header 主推，旧 header 继续解析 |
| `shadow-server-app` | `shadow-space-app` | 新命令/包名主推，旧入口保留 alias |

以下词不属于本次产品重构范围，扫描器需要允许：

- HTTP server、Node server、Hono server、dev server 等运行时服务概念。
- MCP server、database server、Kubernetes API server 等基础设施概念。
- `apps/server` 作为代码包名。
- 历史数据库迁移文件名、数据库表名、列名和旧 fixture 中必须保留的兼容语义。
- 兼容测试、弃用文档、扫描器 allowlist 中明确声明的旧接口。

## 第一阶段范围

第一阶段目标是对外改名，不做内部大迁移。

必须覆盖：

- Web：导航、路由、页面标题、按钮、空状态、通知、设置、发现、商店、工作区、Space Apps、Buddy allowlist。
- Mobile：Expo routes、deep link、页面文案、i18n、发现、创建、加入、频道、成员、邀请、设置、商店、工作区。
- API：新增 `/api/spaces` 路由族，保留 `/api/servers` 路由族。
- OAuth API：新增 `/api/oauth/spaces`，新增 `spaces:*` scope，兼容 `servers:*`。
- WebSocket 和事件：新增 `space:*` 事件名，兼容 `server:*`。
- TypeScript SDK：新增 Space 类型、方法和文档示例，旧 Server 方法标记 deprecated。
- Python SDK：新增 snake_case Space 方法，旧 Server 方法标记 deprecated。
- CLI：新增 `shadowob spaces ...`，保留 `shadowob servers ...` alias；新参数优先 `--space`，旧 `--server` 兼容。
- 文档和官网：产品文档、平台文档、API 文档、开发文档、导航和示例统一改为 Space。
- Cloud templates：新增 `spaces` schema，兼容旧 `servers` schema。
- Server App 协议：新增 Space App 命名、header、data class 和生成器入口，兼容旧 Server App 协议。
- Skills 和示例集成：更新对外 README、命令、manifest 示例和生成代码说明。

暂不覆盖：

- 数据库表 `servers`、列 `server_id`、迁移历史和 Drizzle schema 的内部重命名。
- `ServerDao`、`ServerService`、`ServerUseCase` 等内部类名。
- 已发布的旧包名删除。
- 旧 API 立即下线。

## 分阶段计划

### 0. 基线和决策冻结

产出：

- 本文档作为产品和工程共同基线。
- 术语表和 allowlist 初版。
- 扫描器 baseline 报告，记录所有外部 Server 暴露面。

验收：

- 每一类外部表面都有 owner。
- 每一处允许保留的 Server 命中都有原因、过期时间或兼容边界。

### 1. 服务端兼容基础

工作：

- 新增 `/api/spaces` 路由族，映射现有 server handler/usecase。
- 新增 `/api/oauth/spaces` 路由族。
- 新增 `spaces:read`、`spaces:write` scope，并兼容旧 `servers:*`。
- 新增 `X-Shadow-Space-Id` header，兼容旧 `X-Shadow-Server-Id`。
- 响应对象优先输出 `spaceId`、`spaceSlug`、`spaceName`，过渡期可同时输出旧字段。
- 错误码和审计事件新增 Space 命名，旧命名保留兼容映射。

验收：

- 新旧 endpoint 的行为一致。
- 新旧 OAuth scope 均可授权。
- 旧客户端无回归。

### 2. Web 产品面迁移

工作：

- 路由新增 `/spaces/:spaceSlug`，旧 `/servers/:serverSlug` 重定向或 alias。
- i18n 文案全部从 Server 改为 Space。
- React Query key、analytics event、localStorage key 中对外可见部分改为 Space；内部缓存兼容旧 key。
- 更新发现、创建、加入、频道、成员、设置、邀请、商店、工作区、Space Apps。

验收：

- 浏览器中主要用户故事无可见 Server 文案。
- 旧分享链接仍能打开。
- E2E 覆盖新 Space 路由。

### 3. Mobile 产品面迁移

工作：

- 新增 `spaces/[spaceSlug]` route，旧 `servers/[serverSlug]` route 保留跳转。
- i18n 多语言同步更新。
- Deep link 和 push notification payload 兼容新旧字段。
- 更新创建、加入、发现、频道、成员、邀请、设置、商店、工作区。

验收：

- 新安装用户只看到 Space。
- 老版本 push/deep link 不失效。
- Mobile E2E 覆盖核心 Space flow。

### 4. SDK 和 CLI 迁移

工作：

- TypeScript SDK 新增 `ShadowSpace`、`listSpaces`、`createSpace`、`getSpace`、`joinSpace` 等方法。
- Python SDK 新增 `list_spaces`、`create_space`、`get_space`、`join_space` 等方法。
- 旧 Server 方法保留，标记 deprecated，并在文档中指向 Space 方法。
- CLI 新增 `spaces` 命令组，旧 `servers` 命令组保留 alias。
- App、workspace、shop、inbox 等 CLI 参数新增 `--space`，旧 `--server` 兼容。

验收：

- 新 SDK 示例不出现 Server 产品术语。
- 旧 SDK 测试继续通过。
- CLI help 默认展示 Space，兼容命令仍可运行。

### 5. Cloud templates 和 Space App 协议迁移

工作：

- Cloud template schema 新增 `spaces`，旧 `servers` 解析为兼容输入。
- Provision state 同时支持 `spaces` 和旧 `servers` 映射。
- App manifest 新增 `space-private` data class，兼容旧 `server-private`。
- App runtime 新增 `X-Shadow-Space-Id`、`SHADOW_SPACE_*`，兼容旧 header/env。
- 新增 `shadow-space-app typegen`，旧 `shadow-server-app typegen` alias 保留。

验收：

- 新 template 使用 `spaces` 可完整部署。
- 旧 template 使用 `servers` 可完整部署。
- Space App 示例可以安装、授权、调用命令和接收事件。

### 6. 文档和官网迁移

工作：

- 官网产品文档、平台文档、API 文档、Cloud 文档、SDK 文档、CLI 文档全部使用 Space。
- 旧 Server 文档迁到兼容说明或归档页。
- 导航项改为 Spaces、Space Apps。
- 迁移指南说明旧接口、旧命令和旧字段的弃用计划。

验收：

- 官网导航无 Server 产品项。
- API 示例默认使用 `/api/spaces`。
- 兼容说明明确旧接口不会在第一阶段删除。

### 7. 扫描器门禁和收敛

工作：

- 实现收敛扫描器。
- 在 CI 中阻止新增外部 Server 术语。
- 每次阶段完成后更新 baseline，确保剩余命中单调下降。

验收：

- 扫描器输出按表面分类的计数和明细。
- 外部产品面没有未解释的 Server 命中。
- allowlist 中每条例外都有 owner、原因和过期策略。

## 收敛扫描器设计

扫描器目标不是简单替换字符串，而是判断外部产品契约是否已经从 Server 收敛到 Space。

自动化重构器默认只做 dry-run。`--write` 必须显式传入 `--surface`；默认只允许写入 `docs` 和 `i18n`，API/SDK/CLI/Web/Mobile/Cloud/template/test 等契约代码必须额外传 `--allow-contract-code`，防止把兼容层、运行时 server 概念或尚未准备好的接口调用盲目替换。

建议命令：

```bash
pnpm check:space-migration
pnpm check:space-migration:ci
pnpm check:space-migration:update-baseline
pnpm check:space-migration --baseline
pnpm refactor:space-migration
pnpm check:space-migration --format json
node scripts/check-space-migration.mjs refactor --write --surface docs
node scripts/check-space-migration.mjs refactor --write --surface sdk --allow-contract-code
```

建议实现位置：

- `scripts/check-space-migration.mjs`
- `docs/decisions/server-to-space-allowlist.json`
- `docs/decisions/server-to-space-allowlist.schema.json`
- `.tmp/codex-logs/space-migration-scan.json` 仅用于本地临时报告，不提交。

### 扫描输入

扫描器读取：

- 代码文件：`apps/web`、`apps/mobile`、`apps/server`、`packages/sdk`、`packages/sdk-python`、`packages/cli`、`apps/cloud`、`packages/shared`。
- 文档文件：`docs`、`website/docs`、`skills`、`integrations/*/README.md`。
- 模版文件：`apps/cloud/templates`、`integrations/*/shadow-app.local.json`。
- i18n 文件：`apps/web/src/lib/locales`、`apps/mobile/src/i18n/locales`。

默认排除：

- `node_modules`、`dist`、`build`、`coverage`。
- 数据库迁移历史：`apps/server/src/db/migrations/**`。
- 图片、截图和二进制资产。
- lockfile，除非命中包名需要专门审计。

### 扫描规则

规则分为阻断、警告和允许三类。

阻断规则：

- UI/i18n 中出现面向用户的 `Server`、`Servers`、`server`、`servers`、`服务器`、`伺服器`、`서버`、`サーバー`。
- 新文档示例中出现 `/api/servers` 或 `/api/oauth/servers`。
- 新 SDK public 方法只提供 `Server` 命名，没有 Space 等价方法。
- CLI help 默认展示 `servers` 或 `--server`，没有 Space 优先版本。
- Cloud template 新增 `servers`，没有 `spaces`。
- App manifest 新增 `server-private`，没有 `space-private`。
- 新 App runtime 示例只使用 `X-Shadow-Server-Id`，没有 `X-Shadow-Space-Id`。

警告规则：

- 内部代码中出现 `serverId`，但文件位于对外 handler、SDK、CLI 或 i18n 附近。
- 测试 fixture 使用 Server 术语但不是兼容测试。
- 文档中出现 Server，且上下文不是兼容说明、历史说明或基础设施概念。
- URL 中仍使用 `/servers`，但位于 client routing 层。

允许规则：

- `apps/server` 包名和内部路径。
- HTTP server、dev server、MCP server、database server、API server 等基础设施词。
- 旧 API 兼容 handler 和兼容测试。
- 数据库表、列、migration、Drizzle schema 内部命名。
- 明确写在 allowlist 中的旧 SDK/CLI alias。

### 词法和上下文判断

扫描器应同时使用文本匹配和上下文分类：

1. 先按 glob 将文件归类为 `ui`、`mobile`、`api`、`sdk`、`cli`、`docs`、`template`、`test`、`internal`。
2. 对每一类应用不同规则。比如 `apps/server/src/db/schema/servers.ts` 是内部允许，`packages/sdk/src/client.ts` 是外部警告或阻断。
3. 匹配大小写和多语言词：`Server`、`Servers`、`serverId`、`serverSlug`、`servers:*`、`/api/servers`、`server-private`、中文、繁中、韩文、日文。
4. 检查命中行附近上下文，识别 `HTTP server`、`dev server`、`MCP server` 等基础设施例外。
5. 对 allowlist 逐条校验，未命中的 allowlist 条目也要报错，防止例外永久堆积。

### 报告格式

JSON 输出建议：

```json
{
  "summary": {
    "blocking": 0,
    "warning": 12,
    "allowed": 84,
    "bySurface": {
      "ui": 0,
      "mobile": 0,
      "api": 4,
      "sdk": 3,
      "cli": 2,
      "docs": 3,
      "template": 0
    }
  },
  "findings": [
    {
      "severity": "warning",
      "surface": "sdk",
      "file": "packages/sdk/src/client.ts",
      "line": 613,
      "term": "listServers",
      "reason": "Legacy SDK alias must stay until deprecation window ends",
      "allowlistId": "sdk-legacy-server-alias"
    }
  ]
}
```

人类可读输出建议：

- 先输出阻断项。
- 再按 surface 输出剩余计数。
- 最后输出 allowlist 中即将过期或已经失效的例外。

### Allowlist 结构

Allowlist 每条必须包含：

```json
{
  "id": "sdk-legacy-server-alias",
  "owner": "sdk",
  "surface": "sdk",
  "path": "packages/sdk/src/client.ts",
  "term": "listServers",
  "reason": "Backward compatibility for published SDK users",
  "expiresAfter": "Space SDK methods are released for two minor versions",
  "replacement": "listSpaces"
}
```

规则：

- 不允许没有 owner 的例外。
- 不允许没有 replacement 的产品术语例外。
- 不允许 allowlist 匹配整仓路径，必须尽量精确到文件或 glob。
- allowlist 命中数量必须单调下降，除非重构 owner 明确批准。

### CI 门禁策略

阶段 0：

- 扫描器只生成 baseline，不阻断。
- PR 显示新增/减少的 Server 命中。

阶段 1：

- 阻断新增 UI/i18n/官网文档 Server 术语。
- API/SDK/CLI 允许旧命中，但必须在 allowlist。

阶段 2：

- 阻断新增 `/api/servers` client 调用。
- 阻断新增 `servers:*` scope 示例。
- 阻断新增 `server-private` manifest 示例。

阶段 3：

- 除兼容 handler、兼容测试、弃用说明和 allowlist 外，所有外部表面 Server 命中为 0。
- CI 要求 warning 数量不增加。

## 完整覆盖清单

产品体验：

- 首页和导航。
- 创建 Space。
- 加入 Space。
- Space 首页。
- 频道列表和频道聊天。
- 私有 Space 申请和审批。
- 成员管理。
- 邀请链接和邀请码。
- Space 设置。
- Buddy 加入 Space。
- Buddy allowlist。
- Discover 里的 Space 卡片和搜索。
- Space shop、商品详情、购物车、订单、履约。
- Workspace 文件、上传、下载、预览、权限。
- Space Apps 安装、授权、iframe、命令、审批、事件。
- 通知、push、站内消息、活动流。

对外开发者表面：

- REST API。
- OAuth API 和 scopes。
- WebSocket events。
- TypeScript SDK。
- Python SDK。
- CLI 命令和 help。
- App manifest。
- App command token introspection。
- Runtime env vars。
- Cloud templates。
- Skills。
- Integration examples。
- Platform docs。
- API docs。
- Website docs。

兼容表面：

- `/api/servers`。
- `/api/oauth/servers`。
- `servers:*` scopes。
- `serverId` request/response aliases。
- `serverSlug` request/response aliases。
- `X-Shadow-Server-Id`。
- `server-private`。
- `shadow-server-app`。
- `shadowob servers`。
- `--server` CLI flag。

## 成功指标

- 新用户在 Web 和 Mobile 主路径中看不到 Server 产品词。
- 新 API/SDK/CLI/Cloud template 示例全部使用 Space。
- 旧 API/SDK/CLI/Cloud template 继续工作。
- 扫描器报告中阻断项为 0。
- 外部 surface 的 Server warning 数量每个阶段单调下降。
- Allowlist 中每个遗留项都有明确 owner、替代方案和退出条件。

## 风险和处理

现有 `integrations/space` 可能与平台 Space 概念产生命名混淆。处理方式：保留该集成应用名，但平台类型、路由和文档中的 Space 必须通过上下文明确是组织单元。

一次性内部重命名会触及数据库、迁移历史、权限模型、服务类、测试和外部契约，风险过高。处理方式：第一阶段保持内部 server 模型，新增外部 Space adapter。

旧第三方集成可能依赖 `serverId`、`server-private`、`X-Shadow-Server-Id` 和 `shadow-server-app`。处理方式：兼容至少两个 minor 版本，并在 SDK/CLI/文档中明确弃用窗口。

简单关键词替换会误伤 HTTP server、dev server、MCP server 等基础设施概念。处理方式：扫描器按 surface 和上下文分类，不使用全局盲替换。
