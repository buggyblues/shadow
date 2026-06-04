# Shadow Cloud — 多运行时与 Agent SDK 调研

> **Spec:** 10-runtime-evolution
> **Version:** 1.0-draft
> **Date:** 2025-07-24

---

## 1. 现状 (v3.x — 已实现)

### 1.1 运行时适配器架构

已实现 `RuntimeAdapter` 插件化架构，添加新运行时只需一个文件：

| Runtime | 镜像 | npm 包 | ACP Agent |
|---------|------|--------|-----------|
| `openclaw` | `openclaw-runner:20260604-faststart` | — | — (直接网关) |
| `claude-code` | `acp-runner:claude-code` | `@anthropic-ai/claude-code` | `claude` |
| `codex` | `acp-runner:codex` | `@openai/codex` | `codex` |
| `opencode` | `acp-runner:opencode` | `opencode-ai` | `opencode` |

### 1.2 ACP 架构

所有非 openclaw 运行时共享同一模式：

```
openclaw gateway → ACPX plugin → CLI harness process
```

- **RuntimeAdapter 注册表**: `src/runtimes/index.ts` — Map-based registry
- **Parser 集成**: `getRuntime(agent.runtime).applyConfig()` — 零 if/else
- **Infra 集成**: `getRuntime(agent.runtime).defaultImage` — 零硬编码
- **统一镜像**: `images/acp-runner/` — 一个 Dockerfile + `RUNTIME_PACKAGE` build arg

### 1.3 已解决的问题

1. ~~添加新运行时需要: 新 Dockerfile + 新 entrypoint + parser 分支 + schema 类型~~
   → 现在只需新建 `src/runtimes/<name>.ts` + 在 `loader.ts` 添加一行 import
2. ~~无运行时抽象层~~ → `RuntimeAdapter` 接口
3. 所有运行时都通过 OpenClaw gateway 通信 — **设计约束**（核心价值）

### 1.4 不支持的运行时

- ❌ **Cursor** — IDE 插件，无独立 CLI
- ❌ **Copilot** — VS Code 扩展，无独立 CLI
- ❌ **Nanobot / HermesAgent** — 项目已停滞/不可访问

---

## 2. Anthropic Agent SDK 调研

### 2.1 概述

Anthropic 将 Claude Code SDK 更名为 **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`)。

这不是 Claude Code CLI 的 API wrapper，而是一个独立的 Agent 框架：

- 程序化定义 Agent，无需 CLI
- 内置工具: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Monitor
- 支持 Hooks, Subagents, MCP, Sessions, Skills, Memory
- 支持 Anthropic / Bedrock / Vertex AI / Azure Foundry 认证

### 2.2 核心能力

**Subagents**:
```typescript
const agent = Claude.create({
  agents: [{
    name: 'reviewer',
    tool: { description: 'Code review specialist' },
    instructions: 'Review code for bugs and style issues',
    allowedTools: ['Read', 'Grep', 'Glob'],
  }]
})
```

**Hooks** (拦截点):
- `PreToolUse` / `PostToolUse` — 工具调用前后
- `SubagentStart` / `SubagentStop` — 子 agent 生命周期
- 可用于审计、合规、权限控制

**Sessions**:
- Continue: 继续已有会话
- Resume: 从检查点恢复
- Fork: 分叉会话

### 2.3 与 Shadow Cloud 的关系

| 能力 | Shadow Cloud 现状 | Agent SDK 提供 |
|------|-------------------|---------------|
| Agent 定义 | shadowob-cloud.json + gitagent | 程序化定义 |
| 工具系统 | OpenClaw skills/tools | 内置 + MCP |
| 多 Agent | ACP harness (OpenClaw) | Subagents (原生) |
| 审计合规 | audit-log 插件 | Hooks |
| 消息通道 | shadowob/telegram/discord | 无 (需要自己实现) |
| 容器部署 | K8s Deployment | 无 (需要外部平台) |

**关键差距**: Agent SDK 没有消息通道和部署平台，Shadow Cloud 没有原生的 Agent 框架。

---

## 3. Anthropic 推荐的 Agent 模式

来源: [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)

### 3.1 Workflows vs Agents

- **Workflows**: 确定性编排，LLM 在预定义路径中增强每一步
- **Agents**: 自主决策，LLM 动态选择工具和路径

### 3.2 推荐模式 (按复杂度递增)

| 模式 | 描述 | Shadow Cloud 对应 |
|------|------|-------------------|
| **Prompt Chaining** | 前一步输出 → 后一步输入 | SkillsFlow workflows |
| **Routing** | 分类输入 → 分发到专业处理器 | OpenClaw bindings |
| **Parallelization** | 同时运行多个 LLM 调用 | 多 pod 并行 |
| **Orchestrator-Workers** | 中央 agent 动态分解任务 | 无 (需要跨 pod 通信) |
| **Evaluator-Optimizer** | 一个生成、一个评估、循环优化 | 无 (需要 agent 间协议) |

### 3.3 核心建议

> "Start with the simplest solution that could possibly work."

- 不要过早引入复杂 agent 框架
- ACI (Agent-Computer Interface) 比 model 选择更重要
- 工具的文档质量 > 工具数量

---

## 4. 运行时演进策略

### 4.1 核心约束

Shadow Cloud 的核心价值是 **声明式部署 + 多通道消息**，不是 agent 框架本身。
运行时策略应聚焦：

1. **通道连接性**: agent 能通过 Shadow 平台收发消息
2. **部署简单性**: 一个 JSON 配置，一条命令
3. **运行时无关**: 用户选择 agent 框架，shadowob-cloud 负责部署

### 4.2 已完成 (v3.x): RuntimeAdapter 插件化

✅ `RuntimeAdapter` 接口 + Map-based 注册表
✅ 4 个运行时适配器 (openclaw, claude-code, codex, opencode)
✅ Parser 零 if/else — `getRuntime(agent.runtime).applyConfig()`
✅ Infra 零硬编码 — `getRuntime(agent.runtime).defaultImage`
✅ 统一 `acp-runner` 镜像 — 一个 Dockerfile, `RUNTIME_PACKAGE` build arg
✅ `extraEnv()` 集成到 K8s Deployment

### 4.3 下一步: Agent SDK 运行时 (v4.x)

用 Claude Agent SDK 替代 ACP/ACPX 层的可能性：

- 优势: 程序化控制、内置 MCP、Hooks → 审计、无需 ACPX
- 劣势: 需要自行实现消息桥接 (shadowob → Agent SDK → shadowob)
- 前提: Agent SDK 需支持持久化会话才能替代 ACP persistent mode

### 4.4 不做的事

- ❌ 不支持 Cursor / Windsurf / Cline — IDE 插件，无独立 CLI
- ❌ 不自建 agent 框架 — 复用 OpenClaw 或 Agent SDK
- ❌ 不实现 Orchestrator-Workers 模式 — 超出 "声明式部署" 的核心目标
- ❌ 不做通用 ACP 协议 — ACP 是 OpenClaw 内部概念，不值得抽象

---

## 5. 下一轮迭代任务

### P0: 镜像验证

1. 构建 `acp-runner:claude-code` 镜像并验证 /health
2. 在 K8s 集群中部署 claude-code runtime agent 并验证 ACP 连接
3. 保留 `images/claude-runner/` 以兼容已部署的环境

### P1: Agent SDK 运行时原型

1. 创建 `src/runtimes/agent-sdk.ts` 适配器
2. 创建 `images/agent-sdk-runner/` 镜像
3. 实现消息桥接: Shadow SDK → Agent SDK prompt → Shadow SDK response

### P2: Schema 扩展

```typescript
export type AgentRuntime = 'openclaw' | 'claude-code' | 'codex' | 'opencode' | 'agent-sdk'
```

---

## 6. 决策记录

| 决策 | 理由 |
|------|------|
| RuntimeAdapter 插件化 | 添加新运行时只需 1 个文件 + 1 行 import，零改动 parser/infra |
| 统一 acp-runner 镜像 | 4 个 ACP 运行时共享同一 Dockerfile/entrypoint，只换 npm 包 |
| 不将 ACP 泛化为通用协议 | ACP 是 OpenClaw 内部概念，其他 CLI 走同样的 ACPX 模式即可 |
| Agent SDK 作为未来运行时 | 不依赖 OpenClaw gateway 的 headless agent 场景需要独立消息桥接 |
| 保持 OpenClaw gateway 作为默认消息路由 | OpenClaw 的多通道生态 (telegram/discord/slack/shadow) 是核心差异化 |
