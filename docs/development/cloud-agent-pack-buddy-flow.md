# Cloud Agent Pack 与 Buddy 交互链路

> 目标：让 Cloud SaaS 可以把社区中的 Claude/OpenClaw agent pack 一键落地成可部署、可对话、可验证的 Buddy 团队。

## 1. 为什么是 agent pack

这批上游项目不只是单个 skill。它们通常同时包含角色、命令、技能、上下文、脚本、hooks 和 MCP 配置，所以 Cloud 侧把它们统一当成 **agent pack**：

- `marketingskills` / `slavingia/skills`：标准 `.claude-plugin/plugin.json` 加 `skills/`。
- `gstack`：包含 `SKILL.md`、脚本、agent 角色和 OpenClaw 适配内容。
- `seomachine`：Claude workspace 形态，核心在 `.claude/commands`、`.claude/agents`、`context/`、`data_sources/`。
- 未来的 awesome list 或社区包：只要能被识别为 skills、commands、agents、hooks、mcp 之一，就可以进入同一条导入链路。

Cloud Core 只做微内核：读取模板、加载插件、收集配置碎片、交给部署器。agent-pack 插件负责把上游仓库映射成运行时可消费的目录和 metadata。

## 2. autoDetect 规则

`agent-pack` 的自动识别不是按仓库名硬编码，而是按目录形态和声明文件分层识别：

| 信号 | 能力 | 说明 |
|------|------|------|
| `.claude-plugin/plugin.json` | plugin manifest | 优先读取 Claude plugin manifest 声明的 skills/commands/agents/hooks/MCP |
| `skills/**/SKILL.md` 或 `SKILL.md` | skills | 标准 skill 或根目录单技能仓库 |
| `.claude/commands/*.md` | slash commands | 注册到 Shadow 频道命令表，并保留源 prompt 给运行时执行 |
| `.claude/agents/*.md` | agents | 导入角色定义，供 Buddy prompt 和 OpenClaw runtime 使用 |
| `.claude/hooks` / `hooks` | hooks | 作为 pack metadata 暴露，后续由支持 hooks 的 runtime 消费 |
| `mcp*.json` / `.mcp*.json` | MCP | 作为运行时 MCP 配置候选项 |
| `context/`、`scripts/`、`data_sources/` | resources | 作为 pack 附属资源同步进 runner |

这套规则能覆盖“标准插件”、“Claude workspace”、“单 skill 仓库”和“工程团队栈”四类常见项目。无法识别时，导入不会猜测执行逻辑，而是把仓库作为 resources 记录并在验证阶段暴露缺口。

## 3. 斜杠命令与交互组件

导入后的命令会走两层注册：

1. Cloud runner 在启动时扫描 pack，把命令写入 Shadow agent config。
2. Shadow Server 暴露 `GET /api/channels/:id/slash-commands`，供频道输入框补全。

如果命令带 `interaction`，无参数触发时 Buddy 必须先发送交互组件，而不是直接进入纯聊天。典型链路是：

1. 用户输入 `/office-hour`。
2. Buddy 发送 `metadata.interactive` 表单消息。
3. 用户提交表单，客户端调用 `POST /api/messages/:id/interactive`。
4. Server 写入 `message_interactive_submissions`，再发一条带 `metadata.interactiveResponse` 的回显消息。
5. Buddy 读取回显消息，结合源命令 prompt 和 `responsePrompt` 继续执行。
6. 客户端重新拉取源消息时，通过 `metadata.interactiveState.response` 渲染已提交状态并锁定控件。

这里的关键约束是：锁定状态必须来自服务端提交记录，不能依赖 `localStorage`。这样刷新、跨端和多人协作都能看到一致状态。

## 4. Provider Profile 与模型选择

模型供应商和模型解耦：

- Provider Catalog 来自 Cloud 插件声明，描述 provider id、API adapter、env key、base URL key、secret fields。
- Provider Profile 存储用户或服务器级别的 key、base URL、可选模型和模型参数。
- Profile secrets 复用 Cloud env var KMS 加密链路，UI 只展示 masked value。
- 模型是 profile 配置的一部分，可以标记 `default`、`fast`、`reasoning`、`vision` 等 tag。

模板里的 agents 不写死模型名，而是声明 selector。部署时 `model-provider` 插件按顺序解析：

1. 模板显式指定的 provider profile。
2. 社区服务器中启用的 provider profiles。
3. 未连接社区或没有 profile 时，从运行时环境变量嗅探。

解析结果注入 OpenClaw config 和运行时 secret，并把 `SHADOW_PROVIDER_PROFILE_MODELS_JSON` 暴露给 selector。这样厂商模型迭代、兼容 API provider、自定义 base URL 都可以不改模板。

## 5. Runner 健康检查

Buddy 在线不能只看 Pod `Running`。runner 分两个健康层级：

- `/live`：进程还活着，适合 Kubernetes liveness probe。
- `/ready`：OpenClaw runtime、Shadow WebSocket、频道监听和 agent config 都准备好，适合 readiness probe 和产品在线状态判断。

验证一个部署时，至少确认：

- runner 日志出现 Shadow 插件初始化、WebSocket 连接、频道监听成功。
- agent config 中存在目标服务器和频道。
- slash command 数量符合 pack 预期。
- 频道真实发消息后，Buddy 有回复。
- 对交互命令提交表单后，能收到后续路线图、MVP 范围或审批动作。

如果 Buddy 显示离线，优先看 `/ready` 失败原因，再看容器 OOM、OpenClaw runtime 依赖、Shadow Server URL 是否从 pod 内可达。

## 6. 验证工作流

每个新 agent pack 进入 Cloud SaaS 前，按同一套证据验收：

1. **静态导入**：manifest/schema 能通过校验，autoDetect 输出 skills/commands/agents/resources 快照。
2. **配置生成**：Cloud 插件生成 config fragment snapshot，provider selector 不写死模型名。
3. **部署 smoke**：runner `/live`、`/ready` 均通过，日志无 OOM 或依赖缺失。
4. **频道 smoke**：目标频道能收到普通消息回复。
5. **命令 smoke**：`/command` 能被补全和触发。
6. **交互 smoke**：表单或审批提交后服务端记录状态，刷新后控件仍锁定。
7. **内容 smoke**：需要路线图/MVP/审批的命令，必须先给完整内容，再给审批动作。

这套流程是以后批量兼容更多开源 agent 项目的基线。新增项目时优先扩展 autoDetect 的形态识别和插件 metadata，不在 Cloud handler 里打项目特例补丁。
