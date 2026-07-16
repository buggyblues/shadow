# Multica 深度调研：任务流、Runtime 与 Skills

调研日期：2026-05-26

调研对象：[multica-ai/multica](https://github.com/multica-ai/multica)，本地拉取 commit `fa2a0e57eca623600edcc748c9b3b3adfb24f53e`。

这篇文档保留 Multica 的实现调研细节，作为 Shadow Buddy Inbox 方案的背景资料。产品方案见 [Multica 能力复刻：Buddy Inbox 方案](./multica-shadow-space-app-research.zh-CN.md)。

## 2026-05-26 前端交互复核

本轮重新拉取 Multica 后，重点看了 `packages/views` 里的 Issues、Inbox、Agents、Skills 视图。结论是：Multica 的前端体验不是单个“大页面”，而是多入口、多视图共享同一套任务状态。

关键观察：

- `IssuesPage` 把工作区 breadcrumb、筛选 header、board/list/swimlane 三种视图分开，任务列表只负责选择和移动，agent 运行状态来自 `agentTaskSnapshotOptions`。
- `IssueDetail` 使用可调整双栏，左侧是 issue 正文、属性、评论和运行记录，右侧按平台显示辅助面板；评论输入、附件、属性 picker 都是 inline 操作，不把流程藏进大表单。
- `InboxPage` 是通知/任务聚合视图：左侧 inbox list，右侧复用 issue detail；支持 URL 选择、mark read、archive、archive completed。它不是普通聊天频道。
- `AgentsPage` 以在线状态、活动窗口、运行次数和 skills 绑定为核心，agent row 是可操作的队友条目，不是纯设置表。
- `SkillsPage` 使用 PageHeader + 搜索/范围筛选 + DataTable；创建 skill 是独立 dialog，给 agent 添加 skill 是多选确认流。

对 Shadow 的启发：

- Shadow 可以继续用 channel + Task Card 承担统一任务状态，但每个 Space App 的前端必须把业务页面拆清楚：列表页、详情页、执行/反馈页、导入/分享页。
- Inbox 只承担投递和执行状态聚合；Kanban、Trainer、Skills 的业务对象留在各自 Space App。
- 多 agent 协作体验的关键是“可见的 assignee、运行状态、执行回写和技能绑定”，不是强制引入 issue/queue 表。

## 总览

Multica 的核心不是 Kanban，而是一套 “工作单元 -> 任务队列 -> runtime claim -> CLI agent 执行 -> 回写状态” 的系统。Issue、comment、chat、autopilot 都只是触发入口，最终都进入 `agent_task_queue`。

关键组件：

- Next.js frontend。
- Go backend，HTTP + WebSocket。
- PostgreSQL 17 + pgvector。
- 本地 daemon，负责检测本机 AI CLI、注册 runtime、claim task、创建隔离 workspace、启动 Claude Code / Codex / OpenCode / OpenClaw 等工具。

关键对象：

- `agent`：AI 队友，绑定具体 provider/tool。
- `agent_runtime`：某个 agent 在某个 workspace/tool 下的可运行实例，由本地 daemon 注册和心跳。
- `issue`：核心工作单元，可分配给 agent 或 squad。
- `comment`：issue 下评论，可触发已分配 agent 或被 mention 的 agent。
- `agent_task_queue`：所有执行任务的统一队列。
- `task_message`：agent run 的结构化输出流。
- `skill` / `skill_file` / `agent_skill`：可复用技能及其文件。
- `autopilot` / `autopilot_trigger` / `autopilot_run`：定时、webhook、API、手动触发的长期指令。
- `squad` / `squad_member`：多 agent 协作组织，leader 负责接单和分派。

主要参考：

- [README.md](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/README.md)
- [CLI_AND_DAEMON.md](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/CLI_AND_DAEMON.md)
- [server/migrations/001_init.up.sql](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/migrations/001_init.up.sql)
- [server/migrations/004_agent_runtime_loop.up.sql](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/migrations/004_agent_runtime_loop.up.sql)
- [server/migrations/008_structured_skills.up.sql](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/migrations/008_structured_skills.up.sql)
- [server/migrations/042_autopilot.up.sql](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/migrations/042_autopilot.up.sql)
- [server/migrations/084_squad.up.sql](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/migrations/084_squad.up.sql)

## 四种触发方式

### 1. 分配 issue

`CreateIssue` 和 issue assignment update 会校验 assignee。issue 非 backlog 且 assignee 是 agent/squad 时，Multica 会把任务放进 `agent_task_queue`。

关键行为：

- assignee 是 agent：直接 enqueue 给 agent。
- assignee 是 squad：队列任务路由给 squad leader。
- assignee 切换：取消旧 assignee 的 pending/running task，避免旧 agent 继续执行。
- quick create issue：可以先没有完整 issue，由 agent 根据上下文创建/补全。

参考：

- [server/internal/handler/issue.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/handler/issue.go)
- [server/internal/service/task.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/service/task.go)

### 2. 评论里 `@Agent`

`CreateComment` 发布评论后，会触发几类任务：

- issue 已分配给 agent：新评论会唤醒该 agent 继续处理。
- 评论 mention 某个 agent：创建 mention task。
- 评论 mention squad：路由给 squad leader。
- 系统有去重和防循环逻辑，避免 agent 评论再次 mention 自己形成循环。

参考：

- [server/internal/handler/comment.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/handler/comment.go)

### 3. 直接聊天

直接 chat 不绑定 issue，但仍进入 `agent_task_queue`，使用 `chat_session_id` 区分会话。daemon claim task 时会带上 chat 上下文，任务完成后输出回 chat。

这说明 Multica 的 “chat” 不是一条完全独立的即时消息路径，而是复用同一套 task queue/runtime 执行模型。

参考：

- [server/internal/service/task.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/service/task.go)
- [server/pkg/protocol/messages.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/pkg/protocol/messages.go)

### 4. Autopilots

Autopilot 支持 schedule、webhook、API/manual。调度器轮询 due trigger，`DispatchAutopilot` 根据 mode 创建 issue 或直接创建 run-only task。

关键行为：

- schedule trigger：周期性创建 run。
- webhook trigger：规范化 payload，做 body size 限制、签名、去重。
- API/manual trigger：直接 dispatch。
- mode 支持 create issue 和 run-only。
- assignee 可为 agent 或 squad。

参考：

- [server/internal/service/autopilot.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/service/autopilot.go)
- [server/cmd/server/autopilot_scheduler.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/cmd/server/autopilot_scheduler.go)
- [server/internal/handler/autopilot_webhook.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/handler/autopilot_webhook.go)

## 统一任务队列

`agent_task_queue` 是 Multica 的核心抽象。无论来源是 issue、comment mention、chat、quick create、autopilot，最终都进入同一张队列表。

任务里保存的信息包括：

- task 类型和状态：pending、running、completed、failed、cancelled。
- agent/runtime 关系。
- 触发来源：issue、comment、chat session、autopilot run、quick-create context。
- session/workdir 复用线索。
- task-scoped token。
- usage 和执行结果。

daemon 不直接监听业务事件，而是通过 heartbeat/claim 协议获取任务。这个设计把产品事件和本地 CLI 执行解耦。

对 Shadow 的启发：

- Shadow 不一定需要复制 `agent_task_queue` 表名和完整字段。
- 当前方案把这个能力折叠到 Buddy Inbox channel + Task Card：claim、幂等、状态查询、失败重试先写在 message card metadata 上，避免提前引入新的 queue 表。

## Daemon / Runtime 执行模型

Multica runtime 是 “守护进程 x AI 编程工具” 的组合。

流程：

1. daemon 检测本机已安装工具，例如 Claude Code、Codex、OpenCode、OpenClaw、Gemini、Cursor Agent。
2. 针对每个 workspace/tool/agent 注册 `agent_runtime`。
3. daemon heartbeat 上报 runtime 状态。
4. daemon 轮询或通过 WS 唤醒 claim task。
5. claim 成功后，创建隔离 workdir。
6. 按 provider 写上下文文件，例如 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md`。
7. 注入 `MULTICA_*` 环境变量、task token、repo/project/issue/comment/chat/autopilot 上下文。
8. 把技能文件写入 provider 原生 skill 目录。
9. 启动 CLI 工具。
10. 解析/转发 text、thinking、tool_use、tool_result、error 等结构化消息。
11. 完成后回报 usage、状态、结果；失败则标记失败。
12. 记录 GC 元数据，清理旧 workspace。

参考：

- [server/internal/daemon/daemon.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/daemon/daemon.go)
- [server/internal/daemon/execenv/execenv.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/daemon/execenv/execenv.go)
- [server/internal/daemon/execenv/context.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/daemon/execenv/context.go)
- [server/internal/daemon/prompt.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/daemon/prompt.go)

对 Shadow 的启发：

- 现有 connector 是安装/配置和 chat adapter，不是完整 daemon。
- 需要新增可选 daemon runtime 模式：claim Inbox item、创建 workspace、注入 Shadow CLI profile、注入 Space App skills、回写 card thread/progress。
- 普通 chat adapter 仍保留，用于低延迟聊天；Inbox task 由 daemon/runtime claim。

## Skills 系统

Multica 的 skills 是结构化资源，不只是 prompt 文案。

数据模型：

- `skill`：name、description、origin、metadata。
- `skill_file`：skill 包内文件。
- `agent_skill`：agent 与 skill 的安装关系。

导入来源：

- ClawHub。
- skills.sh。
- GitHub。
- 本地 runtime skill 目录。

本地 skill 扫描：

- daemon 扫描 provider 的用户 skill 根目录。
- server 创建 local skill list/import request。
- heartbeat 返回 pending local skill 操作。
- daemon 读取本地 skill 文件并返回 server。

典型 provider skill 路径：

- Claude：`~/.claude/skills`
- Codex：`CODEX_HOME/skills` 或 `~/.codex/skills`
- Copilot：`~/.copilot/skills`
- OpenCode：`~/.config/opencode/skills`
- OpenClaw：`~/.openclaw/skills`
- Pi：`~/.pi/agent/skills`
- Cursor：`~/.cursor/skills`
- Kiro：`~/.kiro/skills`

导入限制：

- 限制单文件大小。
- 限制总大小。
- 限制文件数。
- 限制目录深度。
- 处理 symlink/path 安全。
- 默认更适合文本技能，二进制需要谨慎白名单。

任务执行时的注入：

- Claude：写到 task workdir 下 `.claude/skills`。
- Codex：写到 per-task `CODEX_HOME/skills`。
- Copilot：写到 `.github/skills`。
- OpenCode：写到 `.opencode/skills`。
- OpenClaw：写到 `skills/` 并配合 per-task config。
- Pi：写到 `.pi/skills`。
- Cursor：写到 `.cursor/skills`。
- Kimi：写到 `.kimi/skills`。
- Kiro：写到 `.kiro/skills`。

参考：

- [server/internal/handler/skill.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/handler/skill.go)
- [server/internal/handler/runtime_local_skills.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/handler/runtime_local_skills.go)
- [server/internal/daemon/local_skills.go](https://github.com/multica-ai/multica/blob/fa2a0e57eca623600edcc748c9b3b3adfb24f53e/server/internal/daemon/local_skills.go)

对 Shadow 的启发：

- 现有 Space App manifest `skills` 只是 name/description/commandHints，不能承担完整技能库。
- 如果要达到 Multica 的 skill 能力，需要一个独立 Skills Space App，提供可安装、可版本化、可分享、可注入 runtime 的 skill package。
- Skills 不放进 Kanban/Issue 核心模型，也不放进 Kanban App；Kanban 只引用 Skills App 暴露的通用能力。

## Anthropic Agent Skills 补充调研

Anthropic 官方 Skills 文档和 `anthropics/skills` 仓库确认了同一个关键点：skill 是目录包，不是单文件 prompt。

参考：

- [Agent Skills - Claude Docs](https://docs.claude.com/en/docs/claude-code/skills)
- [anthropics/skills](https://github.com/anthropics/skills)
- [anthropics/skills: skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)

官方形态：

```text
skill-name/
  SKILL.md
  references/
  scripts/
  assets/
  examples/
```

关键原则：

- `SKILL.md` 必须存在，包含 YAML frontmatter 和触发描述。
- 支持文件按需读取，避免把所有知识一次性塞进上下文。
- `scripts/` 可以放确定性 helper，提升重复任务可靠性。
- `references/` 适合放长文档、规范、框架细节。
- `assets/` 适合放模板、图片、字体、示例资源。
- 技能创建本身需要测试用例、baseline/with-skill 对比和人工评审闭环。

对 Skills App 的约束：

- `skills.upload` 必须支持多文件 package。
- `skills.download` 必须返回完整 zip package，而不是只返回 markdown。
- 前端需要能看见 package 文件树、入口文件和支持文件。
- 后续 runtime 注入时应按 provider 写入对应 skill 目录，而不是把技能拼成一段 prompt。

建议 Shadow 增加：

- `space_app_skills`
  - `server_id`, `space_app_id`, `app_key`
  - `slug`, `name`, `description`, `version`
  - `origin_kind`: `manifest` / `space_app_command` / `runtime_local_import` / `buddy_shared` / `manual`
  - `origin_ref`, `content_hash`
  - `status`: `draft` / `active` / `disabled` / `review_required`
  - `created_by_user_id`
- `space_app_skill_files`
  - `skill_id`, `path`, `content_type`, `size`, `sha256`, `content`
- `buddy_skill_installs`
  - `buddy_agent_id`, `skill_id`, `enabled`, `installed_by_user_id`, `settings`
- `buddy_skill_share_requests`
  - Buddy 运行中产出的 skill 经 owner/admin review 后进入 server/app 技能库。

运行时：

- 现有 `GET /skills` markdown 继续作为轻量提示。
- 已安装 skill package 在 daemon claim task 时下载。
- 按 provider 原生目录注入。
- 对只支持 prompt 的 runtime，降级为 markdown 注入。

## Squad 与任务转派

Multica 有 squad，但没有看到独立的转派/交接核心模型。它更像通过以下机制组合实现：

- issue assignee 从一个 agent 改给另一个 agent。
- comment `@Agent` 把上下文引入另一个 agent。
- squad leader 接收 squad task，再通过 issue/sub-issue/comment/mention 分派给成员。
- task queue 保留 issue/comment/session/workdir 线索，支撑连续处理。

对 Shadow 的启发：

- 不需要复制一个复杂转派核心模型。
- 如果需要转派，直接创建新的 task card，并在 thread 中记录原因即可。
- Squad 可以用 leader Buddy Inbox 或 group Inbox 接收任务，再由 Space App 或人工重新分配。

## Autopilot

Multica Autopilot 是长期指令系统，触发后复用 task queue/runtime。

关键能力：

- schedule。
- webhook。
- API/manual。
- create issue。
- run-only。
- agent/squad assignee。
- run history。
- webhook body size 限制、签名、去重。

对 Shadow 的映射：

- 不在 Kanban App 或 Inbox MVP 中保留 `autopilot` 概念。
- 如需 schedule/webhook/API/manual 触发，做独立 automation/scheduler app，由它投递普通 Buddy Inbox Task Card。
- 触发器可以先调用领域 Space App 创建 resource，再投递 Inbox。
- Webhook 必须有 body size 限制、签名校验、idempotency key。

## 与 Shadow 当前设计的关系

Shadow 已有能力：

- Buddy/Agent bot user。
- local/cloud connector。
- channel/DM/thread。
- `@Buddy` / `@App` mention。
- Space App manifest、command、permission/action/dataClass/approval。
- Space App short-lived command token。
- Space App grant/consent。
- Kanban Space App commands。
- 独立 Skills Space App 的 markdown/export 能力。

主要缺口：

- 没有 Inbox/queue item 语义。
- 没有 runtime claim task 的通用 API。
- Space App 还缺 app-to-Shadow 主动投递任务入口。
- 统一 message card metadata schema 和 task card 渲染需要补。
- Skills App 目前是 MVP，还不是完整文件包、版本治理、审计和 runtime 文件注入。

## 结论

Multica 的关键可抽象为：

```text
Trigger -> Queue Item -> Runtime Claim -> Context/Skills Injection -> Execution -> Progress/Result
```

Shadow 不需要照搬 Multica 的 Issue/Kanban 数据模型。用 Buddy Inbox 承载 Queue Item，用 Space App 承载领域数据，用 task-scoped token 和 Space App command policy 承载权限，就能保留 Shadow 的 channel/social/integration 架构，同时覆盖 Multica 的主要协作能力。
