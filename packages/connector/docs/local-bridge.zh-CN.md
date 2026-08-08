# Local Bridge

Local Bridge 用来连接虾豆剪藏、本地资料目录以及 Codex 等 MCP 客户端。所有通信都发生在
当前电脑上：

```text
虾豆剪藏 ── 本机 HTTP ──► 虾豆 Local Bridge ◄── MCP ── Codex
                                      │
                                      ▼
                               ~/ClipperLibrary
```

浏览器扩展继续负责网页采集；Local Bridge 负责保存导出的资料库、把受管理的文本文件提供为 MCP
资源，并在 Codex 和扩展之间传递经过限制的插件任务。

## 1. 推荐方式：使用虾豆桌面端

打开 **虾豆桌面端 → 设置 → 虾豆剪藏**。桌面端会启动本机连接，并直接使用已经连接的兼容插件，
包括开发版本。如果尚未连接插件，点击**获取 Chrome 插件**会打开虾豆剪藏官网；Chrome 应用商店
版本发布后，这个固定地址会直接引导到商店页面，无需更新桌面端。

虾豆桌面端不会下载插件源码，也不会准备需要手动加载的插件副本。插件连接后，桌面端会通过一次性
本机授权同步当前虾豆登录状态，之后的登录变化也会继续同步。

## 2. CLI 备用方式

没有虾豆桌面端时，需要 Node.js 22.14 或更高版本：

```bash
npm install --global @shadowob/cli
shadowob --version
```

如果从当前仓库开发，可以运行：

```bash
pnpm --filter @shadowob/cli build
node packages/cli/dist/index.js local-bridge --help
```

Connector 包也提供轻量的前台运行和诊断入口：

```bash
npx @shadowob/connector@latest clipper doctor
npx @shadowob/connector@latest clipper start
```

## 3. 启动 Local Bridge

```bash
shadowob local-bridge start --detach --root ~/ClipperLibrary
```

首次运行会创建资料目录和一个私密连接令牌。命令会显示扩展需要填写的地址和令牌。服务会在后台
继续运行，因此启动后可以关闭终端窗口。

默认配置：

- 地址：`http://127.0.0.1:32145`
- 资料目录：`~/ClipperLibrary`
- 令牌文件：`~/ClipperLibrary/.clipper/bridge-token`

需要时可以更换端口或目录：

```bash
shadowob local-bridge start --detach --port 43145 --root ~/Documents/ShadowClipper
```

如果希望服务跟随终端运行并在终端关闭时停止，可以不加 `--detach`。

## 4. 连接虾豆剪藏

1. 打开 **虾豆剪藏 → 设置 → 虾豆桌面端**。
2. 填入 CLI 显示的地址和令牌。
3. 点击**测试连接**。
4. 测试通过后会自动完成首次同步；如果希望后续资料变更自动写入本地，请保持自动同步开启。

Local Bridge 只会更新其清单中记录的文件，不会删除所选目录里原本存在的无关文件。
每次同步都会比较文件内容哈希，只写入变化的文件，并保留最近 100 次同步记录。

## 5. 连接 Codex

保持 Local Bridge 运行，然后执行 `start` 或 `guide` 显示的 MCP 注册命令：

```bash
codex mcp add shadow-clipper -- \
  shadowob local-bridge mcp \
  --root ~/ClipperLibrary
```

添加后重启 Codex。这个 stdio 代理会直接从资料目录读取令牌，因此 Codex 的 MCP 配置中不需要
保存令牌；它也会自动读取当前服务记录的地址，包括自定义端口。

连接后，Codex 可以：

- 先读取资料库概览，包括文件类型、来源平台、时间范围、标签、收藏和阅读状态。
- 分页列出 Markdown、文本和 JSON 资料，并按行读取指定文件。
- 按相关性搜索本地 Clipper 资料库，并继续读取下一页结果。
- 使用 `clipper_sync_library` 请求浏览器立即导出最新资料，并通过 `clipper_list_library_syncs` 查看同步记录；开启自动同步后，资料库变化也会在短时间内刷新本地副本。
- 查看每个在线浏览器插件的能力标签、可调用接口、任务、参数说明和可选值。
- 调用插件接口，或向扩展发送其中一个已声明的任务。
- 查看并运行已经保存在虾豆剪藏中的自动化。
- 动态发布声明式自定义插件，并管理插件设置、Pet、主题、壁纸和 Skills。
- 等待任务结果，或在浏览器领取前取消排队任务。
- 查看已配置的本地 MCP 服务，并调用其工具、资源或提示词。
- 显式启用后，查看本地运行环境并执行 JavaScript 或 Python。

发送浏览器任务时，Chrome 中的扩展需要保持启用。Chrome 关闭后，Codex 仍然可以读取已经同步
到本地的文件。

## 能力覆盖矩阵

Local Bridge 通过 CLI、带令牌保护的 HTTP 和 MCP 提供同一套功能：

| 能力 | CLI | HTTP | MCP |
| --- | --- | --- | --- |
| 资料库概览、文件列表、按行读取、搜索、实时同步请求与同步记录 | `library` | `/v1/library/*`、`/v1/resources/library/sync` | `clipper_*library*`、`clipper_sync_library`、`clipper_list_library_syncs` |
| 插件发现、任务目录、可调用接口 | `plugins`、`tasks list` | `/v1/plugins*`、`/v1/plugin-tasks`、`/v1/tasks` | `clipper_list_plugins`、`clipper_list_tasks`、`clipper_enqueue_task`、`clipper_invoke_plugin` |
| 已保存的自动化 | `automations` | `/v1/resources/automations/*` | `clipper_list_automations`、`clipper_run_automation`、`clipper_manage_resource` |
| 自定义插件、插件设置、插件 Agent、Pet、主题、壁纸、Skills | `custom-plugins`、`plugin-settings`、`plugin-agents`、`pets`、`themes`、`wallpapers`、`skills` | `/v1/resources/*`、`/v1/artifacts*` | `clipper_list_resource_capabilities`、`clipper_manage_resource` |
| 任务执行记录、结果、等待、取消 | `tasks runs`、`tasks get/wait/cancel` | `/v1/tasks*` | `clipper_*task*` |
| 已配置的本地 MCP 服务 | `mcp-servers` | `/v1/mcp-servers*` | `clipper_list_mcp_servers`、`clipper_call_mcp_server` |
| JavaScript、Python 本地运行环境 | `runtimes` | `/v1/runtimes*` | `clipper_list_runtimes`、`clipper_execute_runtime` |

本地代码执行只在启动时加入 `--enable-runtime` 后开放。插件的能力标签用来描述支持范围；真正
可执行的边界是插件声明的接口和任务。Local Bridge 不会把一个仅用于说明的标签伪装成可调用动作。

## 常用连接命令

不启动新服务，只重新显示连接步骤：

```bash
shadowob local-bridge guide --root ~/ClipperLibrary
```

检查正在运行的 Bridge：

```bash
shadowob local-bridge status --root ~/ClipperLibrary
shadowob local-bridge status --root ~/ClipperLibrary --json
```

查看后台日志或安全停止服务：

```bash
shadowob local-bridge logs --root ~/ClipperLibrary
shadowob local-bridge stop --root ~/ClipperLibrary
```

忘记令牌时可以重新显示；需要让旧令牌立即失效时，可以在服务运行期间轮换令牌：

```bash
shadowob local-bridge token show --root ~/ClipperLibrary
shadowob local-bridge token rotate --root ~/ClipperLibrary
```

轮换后，把新令牌粘贴到 **虾豆剪藏 → 设置 → 虾豆桌面端**。同步页会保存它，浏览器重启后仍然可用。

查看上次同步时间、增量写入数量和最近记录：

```bash
shadowob local-bridge library overview --root ~/ClipperLibrary
shadowob local-bridge library history --root ~/ClipperLibrary
```

`status`、`inspect`、`doctor`、`stop` 和 `mcp` 会自动使用该资料目录记录的服务地址。只有连接旧版
或由其他方式管理的实例时，才需要传入 `--url`。

通过与 Codex 相同的 MCP 接口检查资料库；`--query` 可同时执行一次搜索：

```bash
shadowob local-bridge inspect --root ~/ClipperLibrary
shadowob local-bridge inspect --root ~/ClipperLibrary --query "半导体 市场" --json
```

一次检查令牌、服务、首次同步和 Chrome 连接：

```bash
shadowob local-bridge doctor --root ~/ClipperLibrary
```

`doctor` 中的浏览器连接代表最近六分钟内收到了虾豆剪藏的连接、任务续租或结果回传。
Chrome 的后台任务会定期刷新该状态。

## 直接通过 CLI 使用插件能力

MCP 是可选的。CLI 可以直接查看当前扩展声明的全部插件、能力标签、可调用接口和任务：

```bash
shadowob local-bridge plugins list --root ~/ClipperLibrary
```

执行其中一个任务，并传入经过类型转换的参数：

```bash
shadowob local-bridge plugins run zhihu hot-questions \
  --root ~/ClipperLibrary \
  --option questionLimit=20
```

如果调用方关注的是插件能力，而不想依赖背后的任务 ID，可以直接调用插件接口：

```bash
shadowob local-bridge plugins invoke zhihu search \
  --root ~/ClipperLibrary \
  --option query="本地 AI" \
  --wait
```

自动化脚本可以在 `run` 或 `invoke` 后加入 `--idempotency-key <key>`；使用同一个键重试时会返回
原任务，不会重复创建。

加入 `--wait` 会等待浏览器返回结果，默认最多 30 秒，也可以设置不超过 60 秒的等待时间：

```bash
shadowob local-bridge plugins run zhihu hot-questions \
  --root ~/ClipperLibrary \
  --options-json '{"questionLimit":20}' \
  --wait --timeout 60 --json
```

不连接 MCP 客户端，也可以查询和管理任务：

```bash
shadowob local-bridge tasks list --root ~/ClipperLibrary
shadowob local-bridge tasks runs --root ~/ClipperLibrary
shadowob local-bridge tasks get <task-id> --root ~/ClipperLibrary
shadowob local-bridge tasks wait <task-id> --root ~/ClipperLibrary --timeout 60
shadowob local-bridge tasks cancel <task-id> --root ~/ClipperLibrary
```

`tasks list` 会同时显示在线插件声明的可用任务和最近执行记录；`tasks runs` 只显示执行记录。
浏览器中保存的自动化属于另一类数据，可直接查询和运行：

```bash
shadowob local-bridge automations list --root ~/ClipperLibrary --timeout 60
shadowob local-bridge automations run <automation-id> --root ~/ClipperLibrary --timeout 60
```

需要马上读取最新资料时，可以主动请求浏览器导出：

```bash
shadowob local-bridge library sync --root ~/ClipperLibrary --timeout 60
```

这个命令会让当前连接的扩展立即导出。平时 CLI/MCP 读取的是最近一次本地快照，因此速度快，Chrome
关闭后也仍然可以读取。

这些命令直接使用带令牌保护的 Local Bridge HTTP 接口。HTTP 和 MCP 都只接受最近连接的 Shadow
Clipper 插件已经声明的任务及参数。

## 通过 CLI 或 MCP 管理扩展资源

先确认当前在线扩展实际开放了哪些操作：

```bash
shadowob local-bridge resources capabilities --root ~/ClipperLibrary
```

这些资源都有独立 CLI 命令，它们与 HTTP、MCP 共用同一个协议：

最小可用的 `plugin.json` 如下：

```json
{
  "schemaVersion": 1,
  "id": "example-articles",
  "name": "Example Articles",
  "site": "example.com",
  "version": "1.0.0",
  "match": "^https://(?:www\\.)?example\\.com/articles/",
  "pageType": "Article",
  "itemName": "Article",
  "capture": {
    "rootSelectors": ["article"],
    "bodySelectors": ["article .body"],
    "titleSelectors": ["h1"],
    "authorSelectors": ["[rel=author]"]
  }
}
```

```bash
# 自定义插件：只发布 URL 匹配和 DOM 选择器，不执行上传的 JavaScript
shadowob local-bridge custom-plugins validate ./plugin.json --root ~/ClipperLibrary
shadowob local-bridge custom-plugins publish ./plugin.json --root ~/ClipperLibrary
shadowob local-bridge custom-plugins publish ./plugin.json --replace --root ~/ClipperLibrary
shadowob local-bridge custom-plugins list --root ~/ClipperLibrary

# 插件设置、插件内 Agent 与任务
shadowob local-bridge plugin-settings get zhihu --root ~/ClipperLibrary
shadowob local-bridge plugin-settings set zhihu --payload-json '{"enabled":true,"options":{"saveImages":true}}' --root ~/ClipperLibrary
shadowob local-bridge plugin-agents get zhihu --root ~/ClipperLibrary
shadowob local-bridge plugins invoke zhihu search --option query="本地 AI" --wait --root ~/ClipperLibrary

# Codex Pet、主题和工作区壁纸
shadowob local-bridge pets install ./fox.codex-pet.zip --root ~/ClipperLibrary
shadowob local-bridge pets select fox --root ~/ClipperLibrary
shadowob local-bridge themes apply --payload-json '{"theme":"dark","appearance":{"palette":"plum"}}' --root ~/ClipperLibrary
shadowob local-bridge wallpapers install ./workspace.webp --root ~/ClipperLibrary
shadowob local-bridge wallpapers select custom --root ~/ClipperLibrary

# Agent Skills：zip 根目录必须包含 SKILL.md，也可直接安装单个 SKILL.md
shadowob local-bridge skills install ./research-helper.zip --root ~/ClipperLibrary
shadowob local-bridge skills list --root ~/ClipperLibrary
shadowob local-bridge skills disable research-helper --root ~/ClipperLibrary
```

资源命令默认等待浏览器返回结果。加入 `--no-wait` 可立即拿到任务 ID；加入 `--json` 可得到适合
脚本读取的稳定结构。覆盖安装必须明确传入 `--replace`。所有操作也可以通过通用命令
`resources run <resource> <action>` 调用；删除操作还必须传入 `--yes`。

MCP 客户端先调用 `clipper_list_resource_capabilities`，再调用 `clipper_manage_resource`，传入
`resource`、`action`、可选的 `id`/`payload`，上传时再传本地 `path`。文件先暂存在 Bridge 内，
总大小上限为 32 MB；Pet、Skill 等格式还有各自更小的限制。

动态插件采用声明式安全模型：清单只包含 HTTPS 匹配表达式和已经观察确认的 DOM 选择器，上传包中
的 JavaScript 不会执行。新站点仍可能需要用户在 Chrome 中确认站点访问权限。导入的 Skill 会以
只读方式挂载到新建的 Agent 会话，里面的脚本不会自动运行。Pet 延用 `.codex-pet.zip` 格式，壁纸
接受图片文件。

## 直接通过 CLI 使用资料库

MCP 客户端可以做的资料库操作，也都可以直接从 CLI 完成：

```bash
shadowob local-bridge library overview --root ~/ClipperLibrary
shadowob local-bridge library files --root ~/ClipperLibrary --limit 50
shadowob local-bridge library read sources/zhihu/example.md --root ~/ClipperLibrary --start-line 1 --end-line 80
shadowob local-bridge library search "本地 AI" --root ~/ClipperLibrary --limit 20
```

任何命令都可以加入 `--json`，供脚本读取结构化结果。

## MCP 探索建议

MCP 客户端可以先调用 `clipper_library_overview`，再调用 `clipper_search_library`。搜索中的多个词需要
同时出现，结果按照标题、路径和正文命中度排序。拿到结果后，使用
`clipper_read_library_file` 只读取需要的行；资料较多时沿 `nextCursor` 继续翻页。

内置的 `explore-library` MCP prompt 也会使用同一流程。所有工具同时返回文本和结构化结果，既方便
对话展示，也便于 Codex 稳定读取字段。

移除 Codex 连接：

```bash
codex mcp remove shadow-clipper
```

## 可选的本地运行能力

JavaScript 和 Python 执行默认关闭。只有在扩展工作流明确需要本地代码执行时才启用：

```bash
shadowob local-bridge start --detach --root ~/ClipperLibrary --enable-runtime
```

启用后，代码会使用当前系统账号的权限运行，不应在共享或不受信任的电脑上开启。

启用后，CLI 和 MCP 会看到同一组运行环境：

```bash
shadowob local-bridge runtimes list --root ~/ClipperLibrary
shadowob local-bridge runtimes run javascript --root ~/ClipperLibrary --code 'console.log(6 * 7)'
shadowob local-bridge runtimes run python --root ~/ClipperLibrary --file ./analysis.py --stdin-file ./input.json
```

对应的 MCP 工具是 `clipper_list_runtimes` 和 `clipper_execute_runtime`。关闭本地代码执行时，这两个
工具不会出现在 MCP 工具列表里。

## 调用已配置的本地 MCP 服务

Bridge 还可以开放已经为它配置的 MCP 服务。先查看服务，再用通用请求命令发送任意 MCP 方法：

```bash
shadowob local-bridge mcp-servers list --root ~/ClipperLibrary
shadowob local-bridge mcp-servers request bear tools/list --root ~/ClipperLibrary
shadowob local-bridge mcp-servers request bear tools/call \
  --root ~/ClipperLibrary \
  --params-json '{"name":"search_notes","arguments":{"query":"本地 AI"}}'
```

MCP 客户端对应使用 `clipper_list_mcp_servers` 和 `clipper_call_mcp_server`。通用方法和参数会完整
保留目标 MCP 服务的工具、资源和提示词能力，不需要维护一份容易遗漏的包装接口列表。

## 故障排查

### 扩展无法连接

- 运行 `shadowob local-bridge status`，确认服务正在运行。
- 使用 `shadowob local-bridge logs` 查看启动错误。
- 运行 `shadowob local-bridge status`。
- 通过 `shadowob local-bridge guide` 重新复制地址和令牌。
- 地址应使用 `127.0.0.1` 或 `localhost`，不接受远程 HTTP 地址。
- 如果端口被占用，使用新的 `--port` 启动，并同步修改扩展里的地址。

### Codex 看不到 MCP 服务

- 确认 `codex mcp list` 中包含 `shadow-clipper`。
- 确认 `local-bridge mcp` 和 `start` 使用的是同一个资料目录。
- 修改 MCP 配置后重启 Codex。
- 连接 Codex 前先运行 `shadowob local-bridge status`。

### 任务一直停留在排队状态

打开 Chrome，确认虾豆剪藏已启用并且 Local Bridge 连接正常。只有声明了对应插件任务的活跃
扩展才能领取这个任务。运行 `shadowob local-bridge doctor` 检查浏览器连接，并使用
`clipper_wait_for_task` 查看最新结果。尚未被扩展领取的任务可以通过 `clipper_cancel_task` 取消。

## 安全边界

- HTTP 服务只监听 `127.0.0.1`。
- 数据和任务接口需要随机令牌，令牌文件仅允许当前用户读取。
- 停止服务也需要同一个令牌，并会核对当前记录的服务实例。
- 浏览器跨域访问只接受 Chrome 扩展来源和显式允许的来源。
- MCP 只能发送最近连接的扩展已经声明的任务。
- 资源操作也必须由最近连接的扩展明确声明对应资源与动作。
- 上传文件受令牌保护并有大小限制，暂存位置不在同步资料目录中。
- 动态插件只使用内置声明式抽取器，不会执行上传代码。
- Local Bridge 会校验任务参数类型、范围和可选值，不接受插件没有声明的额外参数。
- 归档文件路径始终限制在所选资料目录内。
- ZIP 会先完整校验并写入临时位置，再替换正式资料文件。
- 除非显式传入 `--enable-runtime`，否则不会启用本地代码执行。
