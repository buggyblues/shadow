# Shadow Cloud — 运行时架构规范

> **Spec:** 03-runtime
> **Version:** 2.0-draft
> **Date:** 2026-04-10

---

## 1. 运行时概览

每个 Agent Deployment 映射为一组 K8s 资源：

```
AgentDeployment                        K8s Resources
───────────────                        ─────────────

agents[i]                   ──▶       Namespace: {namespace}
  id: "phantom-core"                  
                                       ConfigMap: phantom-core-config
                                         └─ config.json (OpenClaw 配置)
                                       
                                       Secret: phantom-core-secrets
                                         └─ API keys, tokens
                                       
                                       Deployment: phantom-core
                                         ├─ initContainers[] (可选: git clone)
                                         ├─ containers[0]: agent runtime
                                         │    ├─ image: openclaw-runner 或 claude-runner
                                         │    ├─ ports: 3100
                                         │    ├─ volumeMounts: config, data, logs, source, workspace, skills
                                         │    ├─ envFrom: ConfigMap + Secret
                                         │    ├─ startupProbe: /health
                                         │    ├─ readinessProbe: /health
                                         │    └─ livenessProbe: /health
                                         └─ volumes: configMap, emptyDir, PVC
                                       
                                       Service: phantom-core (ClusterIP)
                                         └─ port 3100 → container 3100
```

---

## 2. 容器镜像

### 2.1 openclaw-runner

**用途**: 运行 OpenClaw gateway + shadowob 插件。

**构建 (`images/openclaw-runner/Dockerfile`)**:

```dockerfile
# Stage 1: 安装依赖
FROM node:22-alpine AS builder
ARG OPENCLAW_VERSION=2026.6.5
RUN npm install -g "openclaw@${OPENCLAW_VERSION}"
RUN npm install @shadowob/openclaw-shadowob@latest
# 复制 shadowob 到 extensions 目录

# Stage 2: 最终镜像
FROM node:22-alpine AS runner
COPY --from=builder /app /app
RUN apk add --no-cache tini curl
HEALTHCHECK CMD curl -f http://localhost:3100/health || exit 1
ENTRYPOINT ["tini", "--", "node", "/app/entrypoint.mjs"]
```

**`entrypoint.mjs` 启动流程**:

```
容器启动 (PID 1: tini)
    │
    ▼
┌──────────────────────────┐
│ 1. loadMountedConfig()   │  读取 /etc/shadowob-cloud/config.json
│    (从 ConfigMap)         │  (由 K8s ConfigMap volume 挂载)
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ 2. mergeEnvVars()        │  环境变量覆盖配置
│    SHADOW_TOKEN_*         │  (由 K8s Secret envFrom 注入)
│    ANTHROPIC_API_KEY      │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ 3. generateOpenClawConfig│  写入 ~/.openclaw/openclaw.json
│    - plugins.load.paths   │  - 设置 shadowob 插件路径
│    - channels.shadowob    │  - 启用 shadow 频道
│    - pricing fetch patch │  - 降低 OpenRouter/LiteLLM 价格目录 fetch 超时
│    - gateway.port=3100    │  - 设置端口和绑定
│    - gateway.bind=lan     │
│    - gateway.mode=local   │
│    - agents.*             │  - Agent 配置
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ 4. verifyExtensions()    │  检查 shadowob 插件
│    /app/extensions/shadowob│  文件存在性检查
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ 5. startHealthServer()   │  临时 HTTP server on :3100
│    GET /health → 200     │  在 gateway 启动前提供健康端点
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ 6. startGateway()        │  spawn openclaw 进程
│    openclaw --port 3100   │  替代临时 health server
│    stdout → process.stdout│
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ 7. 信号处理               │  SIGTERM → graceful shutdown
│    关闭 gateway 进程      │  SIGINT → 同上
│    退出 entrypoint        │
└──────────────────────────┘
```

### 2.2 acp-runner (统一 ACP 运行时)

**用途**: 运行 OpenClaw gateway + 任意 ACP 集成 (claude-code, codex, opencode)。

**架构**: 一个统一的 Dockerfile，通过 `RUNTIME_PACKAGE` build arg 安装不同的 CLI 包：

```bash
# Claude Code
docker build --build-arg RUNTIME_PACKAGE=@anthropic-ai/claude-code -t acp-runner:claude-code .
# Codex
docker build --build-arg RUNTIME_PACKAGE=@openai/codex -t acp-runner:codex .
# OpenCode
docker build --build-arg RUNTIME_PACKAGE=opencode-ai -t acp-runner:opencode .
```

**差异点** (相较 openclaw-runner):
- 额外安装 `RUNTIME_PACKAGE` (coding CLI)
- 基础镜像包含 `git`（coding CLI 需要）
- `entrypoint.mjs` 配置 ACP runtime (从 ConfigMap 读取，runtime-agnostic)
- 通过 ACPX plugin 桥接到 CLI 进程

**RuntimeAdapter 注册机制**: 每个运行时在 `src/runtimes/` 中注册自己的 adapter，
parser 通过 `getRuntime(agent.runtime).applyConfig()` 自动配置 ACP，无需 if/else。

### 2.3 自定义镜像 (build-image 策略)

当 agent 有 `source.strategy: "build-image"` 时，`shadowob-cloud build` 生成多阶段 Dockerfile:

```dockerfile
# Stage 1: 基础 runtime
FROM ghcr.io/shadowob/openclaw-runner:20260604-faststart AS base

# Stage 2: Clone agent source
FROM alpine/git AS source
RUN git clone --depth 1 --branch main <repo-url> /agent-source

# Stage 3: 合并
FROM base
COPY --from=source /agent-source /agent
# 挂载点: /agent (SOUL.md, RULES.md, skills/, tools/, etc.)
```

---

## 3. K8s 资源详解

### 3.1 ConfigMap

**名称**: `{agent-id}-config`

**内容**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: phantom-core-config
  namespace: shadowob-cloud
data:
  config.json: |
    {
      "agents": { ... },
      "channels": { ... },
      "models": { ... },
      "gateway": { "port": 3100, "bind": "lan" }
    }
```

**挂载路径**: `/etc/shadowob-cloud/config.json`

### 3.2 Secret

**名称**: `{agent-id}-secrets`

**内容**: 从 `agent.env`、`registry.providers[].apiKey`、provisioning tokens 自动提取。

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: phantom-core-secrets
type: Opaque
stringData:
  ANTHROPIC_API_KEY: sk-...
  SHADOW_TOKEN_MY_BUDDY: token-...
  SHADOW_SERVER_URL: https://shadow.example.com
```

**Secret 分离规则**:
- `${env:VAR}` 解析后的值如果以 `sk-`、`token-`、`ghp_` 等开头 → Secret
- `${secret:k8s/name/key}` → 生成 `secretKeyRef` 引用（不创建 Secret）
- 其他值 → ConfigMap 或直接环境变量

### 3.3 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: phantom-core
  namespace: shadowob-cloud
  labels:
    app: shadowob-cloud
    agent: phantom-core
spec:
  replicas: 1
  selector:
    matchLabels:
      agent: phantom-core
  template:
    metadata:
      labels:
        app: shadowob-cloud
        agent: phantom-core
    spec:
      # --- Init Containers (可选: git clone) ---
      initContainers:
        - name: git-clone
          image: alpine/git
          command: ["sh", "-c", "git clone --depth 1 ..."]
          volumeMounts:
            - name: agent-source
              mountPath: /agent
      
      # --- Main Container ---
      containers:
        - name: agent
          image: ghcr.io/shadowob/openclaw-runner:20260604-faststart
          ports:
            - containerPort: 3100
          
          # 环境变量
          envFrom:
            - configMapRef:
                name: phantom-core-config
            - secretRef:
                name: phantom-core-secrets
          env:
            - name: AGENT_ID
              value: phantom-core
          
          # 健康探针
          startupProbe:
            httpGet:
              path: /health
              port: 3100
            initialDelaySeconds: 5
            periodSeconds: 3
            failureThreshold: 30      # 最多 90s 启动
          
          readinessProbe:
            httpGet:
              path: /health
              port: 3100
            initialDelaySeconds: 10
            periodSeconds: 5
          
          livenessProbe:
            httpGet:
              path: /health
              port: 3100
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 3
          
          # 资源限制
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          
          # Volume 挂载
          volumeMounts:
            - name: config
              mountPath: /etc/shadowob-cloud
            - name: openclaw-data
              mountPath: /root/.openclaw
            - name: logs
              mountPath: /var/log/openclaw
            - name: agent-source       # 仅 source 配置时
              mountPath: /agent
            - name: shared-workspace   # 仅 workspace.enabled 时
              mountPath: /workspace/shared
            - name: skills             # 仅 skills 配置时
              mountPath: /app/skills
      
      # --- Volumes ---
      volumes:
        - name: config
          configMap:
            name: phantom-core-config
        - name: openclaw-data
          emptyDir: {}
        - name: logs
          emptyDir: {}
        - name: agent-source
          emptyDir: {}                 # init-container 写入
        - name: shared-workspace
          persistentVolumeClaim:
            claimName: shadowob-cloud-workspace
        - name: skills
          emptyDir: {}
```

### 3.4 Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: phantom-core
  namespace: shadowob-cloud
spec:
  type: ClusterIP
  selector:
    agent: phantom-core
  ports:
    - port: 3100
      targetPort: 3100
      protocol: TCP
```

### 3.5 PersistentVolumeClaim (共享工作空间)

仅当 `workspace.enabled = true` 或 `team.sharedWorkspace = true` 时创建:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shadowob-cloud-workspace
  namespace: shadowob-cloud
spec:
  accessModes:
    - ReadWriteMany           # 多 agent pod 共享
  resources:
    requests:
      storage: 5Gi
  storageClassName: ""         # 集群默认
```

---

## 4. Pulumi IaC 层

### 4.1 架构

```typescript
// infra/index.ts — Pulumi program 入口
export function createInfraProgram(options: InfraOptions): pulumi.PulumiSelfManagedProgram {
  return async () => {
    // 1. K8s Provider (指定 context)
    const provider = new k8s.Provider("k8s", { context: options.context })
    
    // 2. Namespace
    const ns = new k8s.core.v1.Namespace("ns", { ... }, { provider })
    
    // 3. SharedWorkspace PVC (optional)
    if (options.workspace?.enabled) {
      new k8s.core.v1.PersistentVolumeClaim("workspace", { ... })
    }
    
    // 4. Per-agent resources
    for (const agent of options.agents) {
      const configMap = createConfigResources(agent, ...)    // ConfigMap + Secret
      const deployment = createAgentDeployment(agent, ...)   // Deployment
      const service = createNetworkingResources(agent, ...)  // Service
    }
  }
}
```

### 4.2 状态管理

| 存储 | 路径 | 内容 |
|------|------|------|
| Pulumi state | `~/.shadowob/pulumi/{stack}.json` | K8s 资源状态 |
| Provision state | `.shadowob/provision-state.json` (相对于配置文件) | Shadow 资源 ID 映射 |
| Dashboard settings | `~/.shadowob/settings.json` | LLM provider 设置 |

**当前问题 (P1-4)**: 三处不同的状态存储路径。建议统一到 `~/.shadowob/`:
```
~/.shadowob/
├── pulumi/                    # Pulumi stack state
│   └── dev.json
├── provision/                 # Shadow provisioned resources
│   └── {config-hash}.json
└── settings.json              # Dashboard settings
```

### 4.3 `buildManifests` vs `createInfraProgram` (P0-5)

**当前**: 两套独立的资源构建逻辑:
- `buildManifests()` → plain K8s objects (for `generate manifests`)
- `createInfraProgram()` → Pulumi resources (for `up`)

**问题**: 当给 Deployment 添加新字段时，需要在两处都更新，容易遗漏。

**修复方案**:
```typescript
// 共享的资源定义函数
function buildAgentResources(agent, config): K8sResourceSet {
  return {
    configMap: { ... },
    secret: { ... },
    deployment: { ... },
    service: { ... },
  }
}

// generate manifests 直接输出
export function buildManifests(options) {
  return options.agents.map(a => buildAgentResources(a, options.config))
}

// up 包装为 Pulumi resources
export function createInfraProgram(options) {
  return async () => {
    for (const resources of buildManifests(options)) {
      new k8s.core.v1.ConfigMap("cm", resources.configMap, { provider })
      // ...
    }
  }
}
```

---

## 5. 容器内目录布局

### 5.1 openclaw-runner

```
/
├── app/
│   ├── node_modules/          # openclaw + dependencies
│   ├── extensions/
│   │   └── shadowob/          # @shadowob/openclaw-shadowob plugin
│   ├── skills/                # Cloud skills (volume mount)
│   └── entrypoint.mjs
├── etc/
│   └── shadowob-cloud/
│       └── config.json        # ConfigMap mount
├── root/
│   └── .openclaw/
│       └── openclaw.json      # Generated at startup
├── agent/                     # GitAgent source (optional volume)
│   ├── SOUL.md
│   ├── RULES.md
│   ├── agent.yaml
│   ├── skills/
│   └── ...
├── workspace/
│   └── shared/                # Shared PVC mount (optional)
└── var/
    └── log/
        └── openclaw/          # Log volume
```

### 5.2 文件写入时序

| 时序 | 谁写 | 目标 | 来源 |
|------|------|------|------|
| Pre-start | K8s | `/etc/shadowob-cloud/config.json` | ConfigMap volume |
| Pre-start | K8s | env vars | Secret envFrom |
| Init container | git clone | `/agent/*` | Git repo |
| Startup | entrypoint.mjs | `/root/.openclaw/openclaw.json` | 合并 config.json + env |
| Runtime | OpenClaw | `/var/log/openclaw/` | 日志文件 |
| Runtime | OpenClaw | `/workspace/shared/` | Agent 工作产物 |
