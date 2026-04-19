# Shadow Cloud — 配置系统规范

> **Spec:** 01-configuration
> **Version:** 2.0-draft
> **Date:** 2026-04-10

---

## 1. 配置文件格式

### 1.1 文件约定

| 属性 | 值 |
|------|-----|
| 文件名 | `shadowob-cloud.json` (默认) 或通过 `-f` 指定 |
| 格式 | JSON (不支持 JSONC 注释) |
| 编码 | UTF-8 |
| JSON Schema | `$schema` 字段可引用发布的 schema URL |

```json
{
  "$schema": "https://raw.githubusercontent.com/shadowob/shadowob/main/apps/cloud/schemas/shadowob-cloud.schema.json",
  "version": "1.0.0",
  ...
}
```

### 1.2 顶层结构

```typescript
interface CloudConfig {
  // ── 元数据 ──
  version: string                        // 必填。配置格式版本号
  name?: string                          // 部署名称（展示用）
  description?: string                   // 部署描述
  environment?: 'development' | 'staging' | 'production'

  // ── 团队 ──
  team?: TeamConfig                      // Agent 团队共享默认值

  // ── 外部资源 ──
  plugins?: PluginsConfig                // Shadow 平台资源配置
  registry?: RegistryConfig              // LLM 提供商和配置预设

  // ── 部署 ──
  deployments?: DeploymentsConfig        // Agent 部署清单（必填才有意义）

  // ── 共享资源 ──
  workspace?: SharedWorkspaceConfig      // 跨 Agent 共享文件系统
  skills?: CloudSkillsConfig             // 跨 Agent 技能注册表
}
```

---

## 2. 各节详细定义

### 2.1 `team` — 团队配置

**用途**: 为所有 Agent 统一设置的默认值。Agent 级别的配置优先级更高。

```typescript
interface TeamConfig {
  name: string                           // 团队名称 ("DevOps Team")
  description?: string                   // 团队描述
  tags?: string[]                        // 分类标签 ["devops", "monitoring"]

  defaultModel?: AgentModel              // 团队默认模型配置
  defaultCompliance?: AgentCompliance    // 团队默认合规配置
}
```

**合并规则**:
- `team.defaultModel` 被 `agent.model` 完整替换（不做 deep merge）
- `team.defaultCompliance` 被 `agent.compliance` 按字段 merge
- `team.sharedWorkspace` 和 `workspace.enabled` 是等价的快捷方式

### 2.2 `plugins.shadowob` — Shadow 资源

**用途**: 声明需要在 Shadow 平台上创建的 Server、Channel、Buddy 和路由绑定。

```typescript
interface ShadowobPluginConfig {
  servers?: ShadowServer[]               // Shadow 服务器
  buddies?: ShadowBuddy[]                // AI buddy 实体
  bindings?: ShadowBinding[]             // 路由绑定规则
}

interface ShadowServer {
  id: string                             // 配置内唯一 ID (非 Shadow API ID)
  name: string                           // 显示名称
  slug?: string                          // URL slug (auto-generated)
  description?: string
  isPublic?: boolean                     // 默认 false
  channels?: ShadowChannel[]             // 频道列表
}

interface ShadowChannel {
  id: string                             // 配置内唯一 ID
  title: string                          // 频道标题
  type?: string                          // 默认 "text"
  description?: string
}

interface ShadowBuddy {
  id: string                             // 配置内唯一 ID
  name: string                           // 显示名称
  description?: string
  avatarUrl?: string
}

interface ShadowBinding {
  targetId: string                       // 指向 buddies[].id
  targetType: 'buddy'                    // 目前只支持 buddy
  servers: string[]                      // 指向 servers[].id
  channels: string[]                     // 指向 servers[].channels[].id
  agentId: string                        // 指向 deployments.agents[].id
}
```

**验证规则**:
- `bindings[].targetId` 必须存在于 `buddies[]`
- `bindings[].servers[]` 的每个 ID 必须存在于 `servers[]`
- `bindings[].channels[]` 的每个 ID 必须存在于对应 server 的 `channels[]`
- `bindings[].agentId` 必须存在于 `deployments.agents[]`

### 2.3 `registry` — Provider 和配置预设

```typescript
interface RegistryConfig {
  providers?: ProviderConfig[]           // LLM 提供商
  configurations?: Configuration[]       // 可复用配置预设
}
```

#### 2.3.1 Provider 配置

```typescript
interface ProviderConfig {
  id: string                             // 必填。提供商 ID ("openai", "anthropic")
  api?: string                           // API 适配器 ("openai", "anthropic", "ollama")
  baseUrl?: string                       // API 基础 URL
  apiKey?: string                        // API Key (支持模板语法)
  auth?: string                          // 认证策略
  headers?: Record<string, string>       // 额外 HTTP 头
  models?: ProviderModel[]               // 模型列表
}

interface ProviderModel {
  id: string                             // 模型 ID ("gpt-4o", "claude-sonnet-4-5")
  name?: string                          // 显示名称
  reasoning?: boolean                    // 是否支持推理
  input?: string[]                       // 输入模态 ["text", "image"]
  contextWindow?: number                 // 上下文窗口大小
  maxTokens?: number                     // 最大输出 token
  cost?: {                               // 费用 (每百万 token, USD)
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
  }
}
```

**当前问题 (P0-1, P1-3)**:

| 问题 | 当前 | 应该 |
|------|------|------|
| Provider API 类型字段 | `shadowob-cloud.template.json` 用 `apiType: "openai-completions"` | 统一为 `api: "openai"` |
| Provider API 类型字段 | 其他模板用 `api: "openai"` | 统一为 `api: "openai"` |
| Provider ID 必填性 | schema 中 `id?: string` (可选) | 改为 `id: string` (必填) |

**修复方案**: 
1. `ProviderConfig.id` 改为必填 (`id: string`)
2. 移除 `apiType` 别名，统一使用 `api`
3. 更新 `shadowob-cloud.template.json` 使其与 schema 一致

#### 2.3.2 配置预设 (Configuration Presets)

```typescript
interface Configuration {
  id: string                             // 预设 ID ("base-chat", "code-agent")
  openclaw?: Partial<OpenClawConfig>     // OpenClaw 配置片段
}
```

**`extends` 继承机制**:

```json
{
  "registry": {
    "configurations": [
      { "id": "base", "openclaw": { "tools": { "profile": "full" } } },
      { "id": "chat", "openclaw": { "agents": { "defaults": { "thinkingDefault": "medium" } } } }
    ]
  },
  "deployments": {
    "agents": [{
      "id": "my-agent",
      "runtime": "openclaw",
      "configuration": {
        "extends": "base",
        "openclaw": { "agents": { "defaults": { "workspace": "/work" } } }
      }
    }]
  }
}
```

**当前行为**: `expandExtends()` 做一次 deep merge: `base + agent overrides`
**限制 (P1-1)**: 
- 不支持链式继承 (`extends` 的 config 自身不能再 `extends`)
- 不支持多继承（不能 `extends: ["base", "chat"]`）

**改进方案**:
```typescript
// 未来支持数组形式，按顺序合并
interface AgentConfiguration {
  extends?: string | string[]            // 单个或多个 preset ID
  openclaw?: Partial<OpenClawConfig>
}
```

### 2.4 `deployments` — 部署清单

```typescript
interface DeploymentsConfig {
  namespace?: string                     // K8s namespace (默认: "shadowob-cloud")
  agents: AgentDeployment[]              // Agent 部署列表
}
```

#### 2.4.1 AgentDeployment — Agent 部署定义

这是配置系统的核心类型，将 Agent 的身份、模型、行为和基础设施定义合为一体。

```typescript
interface AgentDeployment {
  // ── 基础 ──
  id: string                             // 必填。Agent 唯一 ID
  runtime: 'openclaw' | 'claude-code'    // 运行时类型
  image?: string                         // 自定义 Docker 镜像
  replicas?: number                      // 副本数 (默认: 1, 最小: 0)
  configuration: AgentConfiguration      // OpenClaw 配置 (可继承 extends)

  // ── K8s 资源 ──
  resources?: {
    requests?: { cpu?: string; memory?: string }
    limits?: { cpu?: string; memory?: string }
  }
  env?: Record<string, string>           // 额外环境变量

  // ── GitAgent 层 ──
  identity?: AgentIdentity               // 身份/灵魂 (= SOUL.md)
  model?: AgentModel                     // 模型偏好
  workflows?: AgentWorkflowDef[]         // 工作流 (= skillflows/*.yaml)
  compliance?: AgentCompliance           // 合规要求
  integrations?: AgentIntegration[]      // 外部集成
  tags?: string[]                        // 分类标签
  description?: string                   // 描述

  // ── 源码 ──
  source?: AgentSource                   // Git 仓库源
}
```

#### 2.4.2 AgentIdentity — Agent 身份

```typescript
interface AgentIdentity {
  name?: string                          // 显示名称
  emoji?: string                         // Emoji 标识
  role?: string                          // 功能角色 ("devops-monitor")
  description?: string                   // 一句话描述
  personality?: string                   // 人格描述 (注入到 system prompt 前)
  systemPrompt?: string                  // 完整 system prompt (覆盖继承的)
}
```

**System Prompt 构建优先级**:
1. `identity.personality` + `identity.systemPrompt` → 拼接
2. `identity.personality` only → prepend to existing
3. `identity.systemPrompt` only → 替换 existing
4. `configuration.openclaw.agents.list[].systemPrompt` → fallback

#### 2.4.3 AgentModel — 模型配置

```typescript
interface AgentModel {
  preferred: string                      // 主模型 ("anthropic/claude-sonnet-4-5")
  fallbacks?: string[]                   // 回退模型列表
  constraints?: {
    temperature?: number                 // 0.0 - 2.0
    maxTokens?: number                   // 最大输出
    topP?: number                        // 0.0 - 1.0
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive'
  }
}
```

**优先级链**: `agent.model` > `team.defaultModel` > 未设置则不配置

#### 2.4.4 AgentSource — 源码叠加

```typescript
interface AgentSource {
  git?: GitSource                        // Git 仓库引用
  path?: string                          // 本地路径 (开发/CI 模式)
  strategy?: 'init-container' | 'build-image'  // 文件交付策略
  mountPath?: string                     // 容器内挂载路径 (默认: "/agent")
  include?: string[]                     // 文件过滤模式
  gitagent?: boolean                     // 启用 gitagent 适配 (默认: true)
  imageTag?: string                      // build-image 策略的镜像 tag
}

interface GitSource {
  url: string                            // 仓库 URL
  ref?: string                           // 分支/tag/SHA (默认: "main")
  dir?: string                           // 子目录 (monorepo)
  depth?: number                         // clone 深度 (默认: 1)
  sshKeySecret?: string                  // K8s SSH key secret
  tokenSecret?: string                   // HTTPS token secret
}
```

**两种策略对比**:

| 策略 | 何时使用 | 优点 | 缺点 |
|------|---------|------|------|
| `init-container` | 开发、快速迭代 | 无需预构建镜像；pod 重启自动拉取最新 | 启动慢（需要 git clone）|
| `build-image` | 生产 | 快速启动；镜像不可变 | 需要 `shadowob-cloud build` 步骤 |

### 2.5 `workspace` — 共享工作空间

```typescript
interface SharedWorkspaceConfig {
  enabled: boolean                       // 是否启用
  storageSize?: string                   // PVC 大小 (默认: "5Gi")
  storageClassName?: string              // StorageClass (空则用集群默认)
  mountPath?: string                     // 挂载路径 (默认: "/workspace/shared")
  accessMode?: 'ReadWriteOnce' | 'ReadWriteMany' | 'ReadOnlyMany'
}
```

### 2.6 `skills` — 云端技能注册

```typescript
interface CloudSkillsConfig {
  installDir?: string                    // 安装目录 (默认: "/app/skills")
  entries?: CloudSkillEntry[]            // 技能列表
}

interface CloudSkillEntry {
  name: string                           // 技能名称
  source?: 'bundled' | 'npm' | 'path'   // 来源
  version?: string                       // 版本
  path?: string                          // path source 的本地路径
  enabled?: boolean                      // 是否启用
  env?: Record<string, string>           // 环境变量
  apiKey?: string                        // API Key
}
```

---

## 3. 模板变量系统

### 3.1 语法

| 语法 | 解析时机 | 解析方式 |
|------|---------|---------|
| `${env:VAR_NAME}` | CLI 端 (`resolveConfig`) | 读取 `process.env[VAR_NAME]` |
| `${secret:k8s/name/key}` | K8s 部署时 | 生成 `secretKeyRef` 引用 |
| `${file:/path/to/file}` | CLI 端 (`resolveConfig`) | 读取文件内容 |

### 3.2 解析规则

1. **`${env:...}`** — 缺失则抛出错误（除非 `--offline` 模式）
2. **`${secret:...}`** — 永远保留原文，在 K8s 资源生成时转为 `secretKeyRef`
3. **`${file:...}`** — 文件不存在则抛出错误

### 3.3 当前问题 (P0-3) 与修复

**问题**: `validate` 命令调用 `resolveConfig()` → `resolveTemplates()` → 对缺失 env var 抛错。用户在本地开发时没有设置 `ANTHROPIC_API_KEY` 等变量就无法验证配置。

**修复方案**: 

```typescript
// validate 命令使用 schema-only 验证 (不解析模板)
export function validateConfigFile(filePath: string): ValidationResult {
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
  return validateCloudConfig(parsed)  // typia schema 验证
}

// --strict 模式才做完整解析 (包含 env var 解析)
export function validateConfigStrict(filePath: string): ValidationResult {
  const config = parseConfigFile(filePath)
  resolveConfig(config)  // 会检查 env vars
}
```

---

## 4. 配置处理流水线

完整的配置从文件到 K8s 资源的处理流程:

```
shadowob-cloud.json
       │
       ▼
┌──────────────────┐
│ 1. JSON 解析      │  JSON.parse()
└──────┬───────────┘
       │
┌──────▼───────────┐
│ 2. Schema 校验    │  typia.validate<CloudConfig>()
└──────┬───────────┘
       │
┌──────▼───────────┐
│ 3. extends 展开   │  expandExtends() — deep merge base configs
└──────┬───────────┘
       │
┌──────▼───────────┐
│ 4. GitAgent 适配  │  readGitAgentDir() + enrichAgentFromGitAgent()
│   (仅 source.path)│  仅 path 模式在此阶段执行
└──────┬───────────┘
       │
┌──────▼───────────┐
│ 5. 模板解析       │  resolveTemplates() — ${env:...}, ${file:...}
│                   │  ${secret:...} 保留为占位符
└──────┬───────────┘
       │
┌──────▼───────────┐
│ 6. OpenClaw 配置  │  buildOpenClawConfig() — per agent
│    生成           │  identity → systemPrompt
│                   │  model → agents.defaults.model
│                   │  integrations → env vars
│                   │  compliance → audit plugin
│                   │  source → agentDir/repoRoot
└──────┬───────────┘
       │
       ├──── generate manifests → 输出 YAML/JSON 文件
       │
       ├──── up → Pulumi program → K8s API
       │
       └──── validate → 报告验证结果
```

---

## 5. `OpenClawConfig` 映射参考

shadowob-cloud.json 的字段如何映射到最终的 OpenClaw `config.json`:

| Shadow Cloud 字段 | OpenClaw config.json 字段 |
|---|---|
| `agent.identity.name` | `agents.list[0].identity.name` |
| `agent.identity.emoji` | `agents.list[0].identity.emoji` |
| `agent.identity.personality` | `agents.list[0].systemPrompt` (prepended) |
| `agent.identity.systemPrompt` | `agents.list[0].systemPrompt` |
| `agent.model.preferred` | `agents.defaults.model.primary` |
| `agent.model.fallbacks` | `agents.defaults.model.fallbacks` |
| `agent.model.constraints.temperature` | `agents.list[0].params.temperature` |
| `agent.model.constraints.thinkingLevel` | `agents.defaults.thinkingDefault` |
| `registry.providers[]` | `models.providers.*` |
| `plugins.shadowob.bindings[]` | `channels.shadowob.accounts.*` + `bindings[]` |
| `agent.source.mountPath` | `agents.defaults.repoRoot` + `agents.list[0].agentDir` |
| `agent.compliance.auditLogging` | `plugins.entries.audit-log.enabled` |
| `workspace.mountPath` | `agents.defaults.workspace` |
| `skills.entries[]` | `skills.entries.*` + `skills.load.extraDirs[]` |
| `agent.runtime = "claude-code"` | `acp.enabled` + `agents.list[0].runtime.type = "acp"` |
| `agent.configuration.openclaw.*` | 直接 merge 到对应的 OpenClaw 配置节 |
