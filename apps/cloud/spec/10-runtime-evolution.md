# Shadow Cloud — 多运行时与 Agent SDK 调研

> **Spec:** 10-runtime-evolution
> **Version:** 1.1-draft
> **Date:** 2026-06-10

---

## 1. 现状 (2026-06 — 已实现)

### 1.1 运行时适配器架构

已实现 `RuntimeAdapter` 插件化架构，添加新运行时只需一个文件：

| Runtime | Runtime kind | Adapter | 状态 |
| --- | --- | --- | --- |
| `openclaw` | `openclaw` | `src/runtimes/openclaw.ts` | 原生 OpenClaw gateway package |
| `claude-code` | `cc-connect` | `src/runtimes/claude-code.ts` | cc-connect project + Claude Code config |
| `codex` | `cc-connect` | `src/runtimes/codex.ts` | cc-connect project + Codex config |
| `opencode` | `cc-connect` | `src/runtimes/opencode.ts` | cc-connect project + OpenCode config |
| `hermes` | `hermes` | `src/runtimes/hermes.ts` | Hermes config/profile package |

运行时实测基线记录在 `apps/cloud/spec/12-runtime-behavior-baseline.md`。不要再用本文件的历史描述替代 smoke test 结果。

### 1.2 运行时包族

当前不是“所有非 OpenClaw 都走 ACPX”。实际有三个包族：

- `openclaw`: OpenClaw 原生 gateway config。
- `cc-connect`: 一个 cc-connect 进程管理一个或多个 project，每个 project 连接 Claude Code/Codex/OpenCode 等 agent。
- `hermes`: Hermes profile/gateway 模型。

统一抽象仍然是 `RuntimeAdapter`，但 multi-agent shared runner 必须落到 runtime-kind
级别的 package builder，而不是假设所有 runtime 都能用同一个 OpenClaw/ACP 形态。

### 1.3 已解决的问题

1. ~~添加新运行时需要: 新 Dockerfile + 新 entrypoint + parser 分支 + schema 类型~~
   → 现在只需新建 `src/runtimes/<name>.ts` + 在 `loader.ts` 添加一行 import
2. ~~无运行时抽象层~~ → `RuntimeAdapter` 接口
3. runtime package smoke 已覆盖 OpenClaw、cc-connect family 和 Hermes 的单 agent 与 shared execution-unit 行为
4. runtime topology planner、runtime package builder、manifest loop 已把 OpenClaw、cc-connect 和 Hermes 纳入 execution unit 抽象
5. 真实 Kubernetes apply smoke 已验证 shared OpenClaw execution unit 清单可被
   `kind-agent-sandbox` API server 接收，且资源 annotation 与 pod env 保留 logical
   agent 到 execution unit 的映射

### 1.4 不支持的运行时

- ❌ **Cursor** — IDE 插件，无独立 CLI
- ❌ **Copilot** — VS Code 扩展，无独立 CLI
- ⚠️ **Cursor Agent / Gemini / Qoder / iFlow via cc-connect** — cc-connect 支持这些 agent，但 Shadow Cloud 还没有对应 `AgentRuntime` adapter；需要单独适配和 smoke。

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

### 4.3 下一步: Placement 与 ExecutionUnit (v4.x)

多 Agent runtime 不应该把用户配置模型改成 `runtimeGroups`。更清晰的边界是：

```text
deployments.agents[] = 业务配置源
placement = 可选部署意图
executionUnits = Cloud 编译后的运行拓扑
```

`deployments.agents[]` 继续承载每个逻辑 Agent 的身份、职责、模型、权限、插件、
skills、source 和 runtime 类型。Cloud 编译器根据兼容性把这些 Agent 规划成一个或多个
`ExecutionUnit`，每个 `ExecutionUnit` 才对应一个 runner 进程、SandboxClaim、Service 和
状态 PVC。

示例编译产物：

```json
{
  "executionUnits": [
    {
      "id": "openclaw-main",
      "runtime": "openclaw",
      "agentIds": ["coordinator", "brandscout", "reviewminer"],
      "workloadName": "openclaw-main",
      "statePvcName": "shadow-runner-state-openclaw-main"
    }
  ],
  "agentToUnit": {
    "coordinator": "openclaw-main",
    "brandscout": "openclaw-main",
    "reviewminer": "openclaw-main"
  }
}
```

兼容性规则：

- runtime、runner image、RuntimeClass 和基础调度策略必须兼容
- network policy、secret/vault 隔离、resource/lifecycle/backup 策略必须兼容
- 插件必须声明支持多 Agent profile，或由 Cloud 做 agent-id namespace 后合并
- 共享 runner 只适用于同一信任域；它不是安全隔离边界
- 不满足条件的 Agent 自动落到 dedicated execution unit

这意味着 `runtimeGroups` 只能是内部或高级 placement hint，不应该成为主模板模型。
模板作者仍然写完整的 `deployments.agents[]`，Cloud 负责把它编译成运行拓扑。

### 4.4 下一步: Agent SDK 运行时 (v4.x)

用 Claude Agent SDK 替代 ACP/ACPX 层的可能性：

- 优势: 程序化控制、内置 MCP、Hooks → 审计、无需 ACPX
- 劣势: 需要自行实现消息桥接 (shadowob → Agent SDK → shadowob)
- 前提: Agent SDK 需支持持久化会话才能替代 ACP persistent mode

### 4.5 不做的事

- ❌ 不支持 Cursor / Windsurf / Cline — IDE 插件，无独立 CLI
- ❌ 不自建 agent 框架 — 复用 OpenClaw 或 Agent SDK
- ❌ 不实现 Orchestrator-Workers 模式 — 超出 "声明式部署" 的核心目标
- ❌ 不做通用 ACP 协议 — ACP 是 OpenClaw 内部概念，不值得抽象

---

## 5. 下一轮迭代任务

### P0: Execution unit shared runner

1. ~~完成 OpenClaw multi-agent execution-unit package。~~
2. ~~完成 cc-connect multi-project execution-unit package。~~
3. ~~完成 Hermes multi-profile/gateway execution-unit package。~~
4. ~~将 infra manifest/Pulumi loops 从 `deployments.agents[]` 切到 topology execution units。~~
5. ~~真实 Kubernetes apply smoke 覆盖 shared execution unit 的 Deployment/Service/NetworkPolicy/ConfigMap/Secret 资源形态。~~
6. 本地 cluster handler 的 pause/resume/backup/restore 已走 runtime target
   resolver；SaaS 客户端继续传 logical agent id，SaaS 后端必须使用
   `__shadowobRuntime.topology` 做同样解析。

### P1: Agent SDK 运行时原型

1. 创建 `src/runtimes/agent-sdk.ts` 适配器
2. 创建 `images/agent-sdk-runner/` 镜像
3. 实现消息桥接: Shadow SDK → Agent SDK prompt → Shadow SDK response

### P2: Schema 扩展

```typescript
export type AgentRuntime =
  | 'openclaw'
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'hermes'
  | 'agent-sdk'
```

---

## 6. 决策记录

| 决策 | 理由 |
|------|------|
| RuntimeAdapter 插件化 | 添加新运行时只需 1 个文件 + 1 行 import，零改动 parser/infra |
| 不把 runtimeGroups 作为业务模型 | `deployments.agents[]` 仍是逻辑 agent 源，topology 是编译产物 |
| cc-connect 作为运行时包族 | Claude Code、Codex、OpenCode 当前通过 cc-connect adapter 打包 |
| Hermes 作为 P0 shared runtime | Hermes profile/gateway 是多 agent 隔离边界 |
| 不将 ACP 泛化为通用协议 | ACP 不是所有 runtime 的共同模型 |
| Agent SDK 作为未来运行时 | 不依赖 OpenClaw gateway 的 headless agent 场景需要独立消息桥接 |
| 以 smoke test 为准 | 旧调研文档和当前代码不一致时，以 `12-runtime-behavior-baseline` 和测试结果为准 |
