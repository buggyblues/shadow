# Shadow Cloud — Dashboard 规范

> **Spec:** 06-dashboard
> **Version:** 2.0-draft
> **Date:** 2026-04-10

---

## 1. 概述

Dashboard 是一个 Web UI，用于监控和管理 Shadow Cloud 部署。由两部分组成:

| 组件 | 技术栈 | 端口 |
|------|--------|------|
| **API Server** | Node.js http (serve.ts) | 3004 |
| **Frontend** | React 19 + TanStack Router + TailwindCSS 4 | Dev: 由 rsbuild 服务 |

### 架构

```
Browser ──▶ Frontend (React SPA)
               │
               ▼
         API Server (:3004)
            │     │
  ┌─────────┘     └──────────┐
  ▼                           ▼
kubectl                  Template files
(K8s API)               (templates/*.json)
```

**生产部署**: `shadowob-cloud serve` 同时提供 API 和静态文件。
**开发模式**: rsbuild dev server + API proxy → 3004。

---

## 2. 页面

### 2.1 Overview (/)

**功能**: 显示所有 Agent 部署的概览。

**数据源**: `GET /api/deployments`

**UI 组件**:

| 元素 | 描述 |
|------|------|
| 状态卡片 | Total Agents / Ready / Not Ready |
| 部署表格 | NAME, NAMESPACE, READY, AGE |
| 刷新按钮 | 手动触发 refetch |

**自动刷新**: 每 10 秒自动 refetch (`refetchInterval: 10_000`)。

**行为**: 点击表格行 → 跳转到 `DeploymentDetailPage`。

### 2.2 Templates (/templates)

**功能**: 模板库，支持一键部署。

**数据源**: `GET /api/templates` + `GET /api/templates/:name`

**UI 组件**:

| 元素 | 描述 |
|------|------|
| 模板卡片 | name, description, agent count, tags |
| Deploy 按钮 | 打开部署 Modal |
| Deploy Modal | 实时 SSE 日志流 |

**部署流程**:
1. 用户点击 "Deploy"
2. 弹出 Modal，显示模板配置预览
3. 用户确认 → `POST /api/deploy` with template config
4. 服务端返回 SSE 流，前端实时展示日志
5. 完成后显示成功/失败状态

### 2.3 Settings (/settings)

**功能**: 配置 LLM Provider API Keys。

**数据源**: `GET /api/settings` + `PUT /api/settings`

**UI 组件**:

| 元素 | 描述 |
|------|------|
| Provider 下拉 | 添加: Anthropic, OpenAI, Ollama, DeepSeek, Groq |
| Provider 表单 | API Key + Base URL |
| Save 按钮 | 保存到 `~/.shadowob/settings.json` |

**安全问题 (P1-5)**: 当前 API 无认证。任何可以访问 3004 端口的用户都可以:
- 读取 LLM API keys
- 触发部署
- 查看 pod 日志

**最低修复**: 默认绑定 `127.0.0.1`（当前已如此），生产模式添加 token auth。

### 2.4 Deployment Detail (/deployments/:namespace/:id)

**功能**: 单个 Agent 部署的详细状态。

**数据源**: `GET /api/deployments/pods` (过滤) + `GET /api/logs/:ns/:pod` (SSE)

**UI 组件**:

| 元素 | 描述 |
|------|------|
| 面包屑 | Overview / namespace / agent-id |
| Pod 表格 | NAME, STATUS, READY, RESTARTS, AGE |
| Log Viewer | 实时日志流 (最多 2000 行) |

**Log Viewer 行为**:
- 使用 EventSource (SSE) 连接 `/api/logs/:ns/:pod`
- 保留最近 2000 行
- 自动滚动到底部
- 手动 Connect/Disconnect 按钮

---

## 3. API 端点规范

### 3.1 `GET /api/deployments`

**返回**: K8s Deployment 列表。

```typescript
interface DeploymentInfo {
  name: string
  namespace: string
  ready: string         // "1/1"
  replicas: number
  age: string           // "2h"
}

// Response
{ deployments: DeploymentInfo[] }
```

### 3.2 `GET /api/deployments/pods`

**返回**: 所有 Pod 列表。

```typescript
interface PodInfo {
  name: string
  namespace: string
  status: string        // "Running", "Pending", "Error"
  ready: string         // "1/1"
  restarts: number
  age: string
}

// Response
{ pods: PodInfo[] }
```

### 3.3 `GET /api/templates`

**返回**: 可用模板列表。

```typescript
interface TemplateInfo {
  // Stable kebab-case slug used for routes and CLI references.
  name: string
  // Locale-aware display title.
  title: string
  description?: string
  agentCount: number
  tags?: string[]
  filename: string
}

// Response
{ templates: TemplateInfo[] }
```

### 3.4 `GET /api/templates/:name`

**返回**: 模板完整内容。

```typescript
// Response
{ name: string; content: CloudConfig }
```

### 3.5 `POST /api/deploy`

**请求**:
```typescript
{ config: CloudConfig }
```

**返回**: SSE 流。

```
event: log
data: {"line": "Validating config..."}

event: log
data: {"line": "Deploying agent-phantom-core..."}

event: complete
data: {"success": true}

event: error
data: {"message": "Deployment failed: ..."}
```

### 3.6 `GET /api/settings`

```typescript
interface Settings {
  providers: ProviderSettings[]
}

interface ProviderSettings {
  id: string
  apiKey: string
  baseUrl?: string
}
```

### 3.7 `PUT /api/settings`

**请求**: `Settings` object。
**应答**: `{ ok: true }`

### 3.8 `GET /api/logs/:namespace/:pod`

**返回**: SSE 日志流。

```
event: log
data: {"line": "2026-04-10T10:00:00Z [INFO] Gateway started"}

event: log
data: {"line": "2026-04-10T10:00:01Z [INFO] Agent ready"}
```

---

## 4. 技术架构

### 4.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| TanStack Router | 1.x | 客户端路由 |
| TanStack Query | 5.x | 数据获取 + 缓存 |
| TailwindCSS | 4.x | 样式 |
| Lucide React | latest | 图标 |
| Rsbuild | 1.x | 构建工具 |

### 4.2 后端

| 技术 | 用途 |
|------|------|
| Node.js `http` 模块 | REST API |
| `child_process.spawn` | kubectl 调用 |
| 文件系统 | 模板读取、设置存储 |

### 4.3 开发工作流

```bash
# Terminal 1: API server
cd apps/cloud
pnpm build && node dist/index.js serve --port 3004

# Terminal 2: Frontend dev
cd apps/cloud
pnpm dashboard:dev
# Opens http://localhost:3000 with proxy to :3004
```

### 4.4 生产构建

```bash
pnpm build              # 构建 CLI (dist/index.js)
pnpm dashboard:build    # 构建前端 (dashboard/dist/)

# 启动
node dist/index.js serve --port 3004
# 同时服务 API + dashboard/dist/ 静态文件
```

---

## 5. 改进建议

### 5.1 API 认证 (P1-5)

```
shadowob-cloud serve --auth-token SECRET_TOKEN

# 请求需要带 header
Authorization: Bearer SECRET_TOKEN
```

**实现**: 
- 启动时生成随机 token 或接受 `--auth-token` 参数
- 打印 token 到 stdout 供用户使用
- 所有 API 端点检查 Authorization header
- Dashboard 前端在 localStorage 存储 token

### 5.2 Agent 健康聚合 (P2-3)

当前只展示 K8s pod 状态，不检查 Agent 内部健康。

**改进**: API 端点通过 port-forward 调用 pod 内部的 `/health` 端点:

```typescript
// GET /api/deployments/:id/health
interface AgentHealth {
  name: string
  k8sStatus: 'Running' | 'Pending' | 'Error'
  agentHealth: 'healthy' | 'unhealthy' | 'unknown'
  gatewayVersion?: string
  lastHeartbeat?: string
  sessionCount?: number
}
```

### 5.3 SSE 实现统一 (P3-3)

当前 `TemplatesPage.tsx` 和 `DeploymentDetailPage.tsx` 各自实现了 SSE 解析。

**改进**: 提取为共享 hook:

```typescript
function useSSEStream(url: string | null) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  
  // ... EventSource 管理
  
  return { lines, status, connect, disconnect }
}
```
