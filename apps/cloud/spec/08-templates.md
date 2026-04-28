# Shadow Cloud — 模板系统规范

> **Spec:** 08-templates
> **Version:** 2.0-draft
> **Date:** 2026-04-10

---

## 1. 概述

模板系统提供预定义的 Agent 部署配置，用户通过 `shadowob-cloud init` 选择模板快速开始。

### 当前模板

| 模板 | 文件 | Agent 数量 | 说明 |
|------|------|-----------|------|
| shadowob-cloud | `shadowob-cloud.template.json` | 1 | 基础模板 |
| devops-team | `devops-team.template.json` | 3 | DevOps 团队: CI/CD、监控、安全 |
| code-review-team | `code-review-team.template.json` | 3 | 代码审查团队 |
| customer-support-team | `customer-support-team.template.json` | 3 | 客服团队 |
| metrics-team | `metrics-team.template.json` | 3 | 指标分析团队 |
| research-team | `research-team.template.json` | 3 | 研究团队 |
| security-team | `security-team.template.json` | 3 | 安全审计团队 |
| solopreneur-pack | `solopreneur-pack.template.json` | 5 | 个人全栈: PM、法务、营销、DevOps、Support |
| gitagent-from-repo | `gitagent-from-repo.template.json` | 1 | 从 Git 仓库构建 Agent |

---

## 2. 模板格式规范

### 2.1 完整格式

```jsonc
{
  // === 元数据（必选）===
  "$schema": "https://shadowob-cloud.dev/schema/template.json",
  "name": "template-name",
  "version": "1.0.0",
  "description": "模板描述",
  
  // === 元数据（可选）===
  "team": "Cloud Engineering",
  "tags": ["devops", "monitoring"],
  "icon": "🔧",
  
  // === 配置体 ===
  "namespace": "shadowob-cloud",
  "providers": [
    {
      "id": "anthropic-provider",    // ← 必选（P0-1 修复）
      "api": "openai-completions",   // ← 字段名统一为 api（P0-1 修复）
      "url": "${env:LLM_API_URL}",
      "apiKey": "${env:LLM_API_KEY}"
    }
  ],
  "agents": [
    {
      "id": "agent-name",
      "model": {
        "provider": "anthropic-provider",
        "name": "claude-sonnet-4-20250514"
      },
      "identity": {
        "name": "Agent Display Name",
        "systemPrompt": "You are a helpful assistant."
      }
    }
  ]
}
```

### 2.2 字段一致性修复 (P0-1)

**问题**: `shadowob-cloud.template.json` 使用 `apiType: "openai-completions"`，但 schema.ts 定义为 `api`:

```typescript
// schema.ts - ProviderConfig
interface ProviderConfig {
  id: string             // ← 应为必选
  api: ProviderApiType   // ← 字段名是 api
  url: string
  apiKey: string
}
```

**修复**: 所有模板将 `apiType` → `api`，并确保 `id` 始终必填。

**影响的模板**: 全部 9 个（所有模板都有 providers 配置）。

### 2.3 Provider ID 必选 (P1-3)

当前 schema:
```typescript
interface ProviderConfig {
  id?: string  // 可选 — 问题根源
}
```

修复后:
```typescript
interface ProviderConfig {
  id: string   // 必选 — agent.model.provider 需要引用此 ID
}
```

**原因**: `agent.model.provider` 引用 `providers[].id`，如果 id 缺失则无法关联。

---

## 3. 模板变量系统

### 3.1 变量类型

| 语法 | 说明 | 解析时机 |
|------|------|----------|
| `${env:VAR_NAME}` | 环境变量 | CLI 运行时 |
| `${secret:k8s/namespace/secret-name/key}` | K8s Secret | CLI 运行时 |
| `${file:/path/to/file}` | 文件内容 | CLI 运行时 |

### 3.2 解析规则

```typescript
// 解析顺序:
// 1. 收集所有模板引用
// 2. 按依赖顺序解析（避免循环）
// 3. 嵌套变量递归解析
// 4. 未解析变量: validate 模式保留, deploy 模式报错

function resolveTemplateString(
  input: string,
  context: TemplateContext,
  options?: { dryRun?: boolean }
): string
```

### 3.3 集合收集

```typescript
// collectTemplateRefs 遍历整个配置树，收集所有变量引用
function collectTemplateRefs(config: unknown): TemplateRef[] {
  // 返回: [
  //   { type: 'env', key: 'LLM_API_KEY', path: 'providers[0].apiKey' },
  //   { type: 'secret', key: 'k8s/default/api-secrets/key', path: '...' },
  // ]
}
```

---

## 4. 模板注册发现

### 4.1 内置模板

```
apps/cloud/
  templates/
    shadowob-cloud.template.json
    devops-team.template.json
    ...
```

在运行时，通过以下方式发现:
```typescript
// 打包后嵌入 dist/
import templates from './templates/*.json'

// 或运行时读取
const templatesDir = path.join(__dirname, '../templates')
const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.template.json'))
```

### 4.2 自定义模板目录

```bash
# 用户可以指定额外模板目录
shadowob-cloud init --template-dir ./my-templates
```

### 4.3 远程模板 (未来)

```bash
# 从 registry 拉取模板
shadowob-cloud init --from https://registry.shadowob.dev/templates/devops-team
```

---

## 5. `shadowob-cloud init` 工作流

### 5.1 交互式初始化

```
$ shadowob-cloud init

? Choose a template:
  ❯ shadowob-cloud       — 基础单 Agent 部署
    devops-team         — DevOps 三人组: CI/CD、监控、安全
    code-review-team    — 代码审查团队
    solopreneur-pack    — 个人全栈团队 (5 agents)
    gitagent-from-repo  — 从 Git 仓库导入 Agent
    (empty)             — 空配置

? Project namespace: shadowob-cloud
? LLM Provider: Anthropic
? API Key: sk-ant-*** (masked)

✓ Created shadowob-cloud.json
✓ Created .env with LLM_API_KEY

Next steps:
  shadowob-cloud validate   # 验证配置
  shadowob-cloud up         # 部署
```

### 5.2 非交互式初始化

```bash
shadowob-cloud init \
  --template devops-team \
  --namespace my-project \
  --output shadowob-cloud.json \
  --no-interactive
```

### 5.3 初始化输出文件

| 文件 | 内容 |
|------|------|
| `shadowob-cloud.json` | 从模板生成的配置（变量已替换为实际值或 env 引用） |
| `.env` | 用户输入的密钥（如果选择 env 方式） |
| `.gitignore` 追加 | `.env` + `.shadowob/` |

---

## 6. 模板验证

### 6.1 自动验证

所有内置模板必须通过 CI 验证:

```typescript
// __tests__/templates.test.ts
import { validateCloudConfig } from '../src/config/schema'
import { glob } from 'glob'

const templateFiles = glob.sync('templates/*.template.json')

describe('template validation', () => {
  for (const file of templateFiles) {
    it(`${path.basename(file)} passes schema validation`, () => {
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'))
      // 移除模板元数据字段
      const config = stripTemplateMeta(content)
      const result = validateCloudConfig(config)
      expect(result.success).toBe(true)
    })
  }
})
```

### 6.2 需验证的规则

| 规则 | 说明 |
|------|------|
| Schema 有效 | 通过 typia validateCloudConfig |
| Provider 引用完整 | 每个 agent.model.provider 都对应一个 providers[].id |
| 变量格式正确 | `${env:...}` / `${secret:...}` / `${file:...}` 语法合法 |
| Agent ID 唯一 | 同一模板内 agent.id 不重复 |
| Namespace 合法 | 符合 K8s namespace 命名规则 (`[a-z0-9-]`, 长度 1-63) |

---

## 7. 模板格式统一 (P3-2)

### 7.1 当前不一致

| 模板 | `team` | `description` | `tags` | `icon` |
|------|--------|---------------|--------|--------|
| shadowob-cloud | ❌ | ❌ | ❌ | ❌ |
| devops-team | ✅ | ✅ | ✅ | ❌ |
| code-review-team | ✅ | ✅ | ✅ | ❌ |
| customer-support-team | ✅ | ✅ | ✅ | ❌ |
| solopreneur-pack | ✅ | ✅ | ✅ | ❌ |
| gitagent-from-repo | ❌ | ✅ | ❌ | ❌ |

### 7.2 统一要求

**所有模板必须包含**:
- `name` (string, 必选，稳定 kebab-case slug，例如 `customer-support-team`)
- `title` (string, 必选，可通过 `${i18n:title}` 本地化)
- `version` (semver string, 必选)
- `description` (string, 必选，可通过 `${i18n:description}` 本地化；说明该 Agent Team 能为客户带来的独特价值)
- `tags` (string[], 必选, 至少 1 个标签)

**可选元数据**:
- `icon` (emoji string)
- `author` (string)
- `minVersion` (最低 shadowob-cloud CLI 版本)

### 7.3 模板 Schema

```typescript
interface TemplateFile extends CloudConfig {
  // 模板元数据
  $schema?: string
  /** Stable kebab-case slug */
  name: string
  /** Locale-aware display title */
  title: string
  version: string
  /** Locale-aware customer value proposition */
  description: string
  tags: string[]
  icon?: string
  author?: string
  minVersion?: string
}
```

---

## 8. 预设模板详细设计

### 8.1 shadowob-cloud (基础)

**场景**: 最简部署，单个通用 Agent。

```jsonc
{
  "name": "shadowob-cloud",
  "title": "${i18n:title}",
  "version": "1.0.0",
  "description": "${i18n:description}",
  "tags": ["basic", "starter"],
  "namespace": "shadowob-cloud",
  "providers": [{
    "id": "default-provider",
    "api": "openai-completions",
    "url": "${env:LLM_API_URL}",
    "apiKey": "${env:LLM_API_KEY}"
  }],
  "agents": [{
    "id": "phantom-core",
    "model": { "provider": "default-provider", "name": "claude-sonnet-4-20250514" },
    "identity": { "name": "Phantom Core", "systemPrompt": "You are a helpful AI assistant." }
  }]
}
```

### 8.2 gitagent-from-repo (GitAgent)

**场景**: 从 Git 仓库按 GitAgent 标准读取 Agent 定义。

```jsonc
{
  "name": "gitagent-from-repo",
  "title": "${i18n:title}",
  "version": "1.0.0",
  "description": "${i18n:description}",
  "tags": ["gitagent", "git"],
  "namespace": "shadowob-cloud",
  "providers": [{
    "id": "default-provider",
    "api": "openai-completions",
    "url": "${env:LLM_API_URL}",
    "apiKey": "${env:LLM_API_KEY}"
  }],
  "agents": [{
    "id": "gitagent",
    "model": { "provider": "default-provider", "name": "claude-sonnet-4-20250514" },
    "source": {
      "type": "gitagent",
      "repo": "${env:AGENT_REPO_URL}",
      "branch": "main",
      "agentDir": "."
    }
  }]
}
```

### 8.3 solopreneur-pack (5 Agents)

**场景**: 个人开发者全栈团队（最复杂的模板）。

**Agents**:
1. **product-manager** — 需求分析、PRD 撰写
2. **legal-advisor** — 合规审查、条款审核
3. **marketing-strategist** — 增长策略、内容规划
4. **devops-engineer** — CI/CD、基础设施
5. **support-agent** — 客户支持、FAQ

每个 Agent 有独立的 `identity.systemPrompt`，共享同一 provider。

---

## 9. 扩展考虑

### 9.1 模板继承 (extends)

```jsonc
{
  "extends": "shadowob-cloud",
  "agents": [
    // 继承 shadowob-cloud 的 providers、namespace
    // 仅覆盖/添加 agents
    {
      "id": "custom-agent",
      "model": { "provider": "default-provider", "name": "gpt-4o" }
    }
  ]
}
```

**当前限制 (P1-1)**: `expandExtends()` 只支持单层继承。

### 9.2 模板组合

```jsonc
{
  "extends": ["shadowob-cloud", "security-team"],
  // 合并两个模板的 agents 和 providers
}
```

**当前**: 不支持数组 extends。需要 P1-1 修复后才能实现。

### 9.3 条件配置

```jsonc
{
  "agents": [{
    "id": "agent",
    "model": {
      "provider": "default-provider",
      "name": "${env:MODEL_NAME:-claude-sonnet-4-20250514}"
    }
  }]
}
```

**当前**: 不支持默认值语法。可在 `resolveTemplateString` 中添加 `:-` 支持。
