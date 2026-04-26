# Cloud SaaS 化 + CLI 插件 — 架构决策

> **Status:** Accepted
> **Date:** 2026-04-16
> **Scope:** `apps/server` + `apps/cloud` + `packages/cli`

---

## 背景

`apps/cloud` 现为单机 CLI + SQLite 工具（`shadowob-cloud` 二进制），提供 K8s Agent 集群部署能力，附带本地 Hono HTTP Server + React Dashboard。

本次决策的目标：

1. **SaaS 化**：将 cloud 的部署/模板/配置能力整合进 `apps/server`，支持多租户、计费、共享集群
2. **CLI 插件化**：`packages/cli` 的 `shadowob` 命令通过 `shadowob cloud` 子命令转发到 `shadowob-cloud` 二进制

Cloud 保持两种运行模式并存：
- **Standalone 模式**：本地 SQLite，无需 server，适合个人开发者/私有集群
- **Connected 模式**（Phase 3，不在本期实现）：cloud CLI 通过 server API token 连接，数据存储在 server

---

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  shadowob CLI (packages/cli)                            │
│    shadowob cloud <cmd> → spawn shadowob-cloud          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  apps/server  (/api/cloud/*)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ cloud handler│  │  cloud DAOs  │  │ CloudService │  │
│  │ (auth: JWT)  │  │ (PostgreSQL) │  │ (task mgmt)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                                    │           │
│         │ DB Task record                     │           │
│         ▼                                    ▼           │
│  ┌─────────────────┐              ┌──────────────────┐  │
│  │  cloud_deploy   │              │   Redis / SSE    │  │
│  │   _tasks (PG)   │              │  progress stream │  │
│  └─────────────────┘              └──────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │ task picked up by
         ▼
┌─────────────────────────────────────────────────────────┐
│  cloud-worker (独立容器)                                 │
│  @shadowob/cloud DeployService + K8sService             │
│  kubectl / Pulumi — 执行真实 K8s 操作                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  K8s 集群                                                │
│  平台共享集群: namespace = user-{userId}                  │
│  BYOK 集群: kubeconfig 从 KMS 注入                       │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Server SaaS API

### 步骤 1：DB Schema（`apps/server/src/db/schema/cloud.ts`）

全部表带 `userId` FK（PostgreSQL）：

| 表 | 说明 |
|---|---|
| `cloud_templates` | 公共模板库（admin 管理 + 社区提交审核） |
| `cloud_deployments` | 部署记录（userId, namespace, status, config, agentCount, clusterId） |
| `cloud_deployment_logs` | 部署日志流（关联 deploymentId） |
| `cloud_configs` | 用户配置文件（userId, name, content, version） |
| `cloud_config_versions` | 配置版本历史 |
| `cloud_env_vars` | 加密环境变量（userId, scope, key, encryptedValue, kmsKeyId） |
| `cloud_env_groups` | 环境变量分组（userId, name） |
| `cloud_clusters` | 集群（userId, name, kubeconfig_kms_ref, isDefault, isPlatform） |
| `cloud_activities` | 操作审计日志（userId, type, namespace） |

### 步骤 2：Drizzle Migration

`apps/server/src/db/migrations/` 新增迁移文件，覆盖上述所有表。

### 步骤 3：Cloud DAOs（`apps/server/src/dao/cloud-*.dao.ts`）

参考现有 DAO 模式（构造函数接 `db`，所有查询约束 `userId`）：
`cloud-deployment.dao.ts` / `cloud-template.dao.ts` / `cloud-config.dao.ts` /
`cloud-envvar.dao.ts` / `cloud-activity.dao.ts` / `cloud-cluster.dao.ts`

### 步骤 4：Cloud Handler（`apps/server/src/handlers/cloud.handler.ts`）

挂载 `/api/cloud`，所有路由使用现有 `authMiddleware`：

| 路由 | 说明 |
|---|---|
| `GET /api/cloud/templates` | 浏览公共模板 |
| `POST /api/cloud/templates` | 提交社区模板（待审核） |
| `GET /api/cloud/deployments` | 列出我的部署 |
| `POST /api/cloud/deploy` | 发起部署（创建 DB task，返回 taskId） |
| `GET /api/cloud/deploy/:taskId/stream` | SSE 实时进度 |
| `GET/POST/PUT /api/cloud/configs` | 配置管理 |
| `GET/POST /api/cloud/env-vars` | 环境变量管理 |
| `GET/POST /api/cloud/clusters` | 集群管理（BYOK + 平台共享） |
| `GET /api/cloud/activity` | 操作历史 |

### 步骤 5：Container 扩展（`apps/server/src/container.ts`）

注册所有 cloud DAO + `CloudService`（负责 task 创建/状态同步，不直接执行 kubectl）。
`apps/server/package.json` 添加 `"@shadowob/cloud": "workspace:*"`。

### 步骤 6：模板 Seed

Server 启动时从 `@shadowob/cloud/templates/*.template.json` 幂等初始化 `cloud_templates`（`slug` 唯一，已存在则跳过）。

### 步骤 7：路由挂载

`apps/server/src/app.ts` 追加：
```ts
app.route('/api/cloud', createCloudHandler(container))
```

### 步骤 8：cloud-worker 容器

新增 `apps/server/src/cloud-worker.ts`，由 `server` 依赖 `@shadowob/cloud` SDK，轮询/订阅 DB 任务队列，调用云部署运行时，写回日志和状态。
`docker-compose.yml` 新增 `cloud-worker` 服务。

---

## Phase 2 — CLI 插件

### 步骤 9：`packages/cli/src/commands/cloud.ts`

```
shadowob cloud [args...]
```

逻辑：
1. `which shadowob-cloud` 检测是否已安装
2. 未安装 → 提示并自动执行 `npm install -g @shadowob/cloud`（需用户确认）
3. `spawn('shadowob-cloud', args, { stdio: 'inherit' })` 转发所有参数

### 步骤 10：注册命令

`packages/cli/src/index.ts` 追加：
```ts
program.addCommand(createCloudCommand())
```

---

## Phase 3 — Cloud CLI Connected 模式（不在本期）

cloud CLI 在 settings 填写 server API token 后，`provision` / `deploy` / `templates` 命令可透传到 `/api/cloud/*`，实现数据统一存储在 server。

---

## 决策记录

### 决策 1：加密方案 — KMS

**结论**：env vars 和 kubeconfig 的加密密钥由 KMS 管理（AWS KMS / GCP KMS / HashiCorp Vault，通过环境变量切换 provider）。

**理由**：
- 主密钥集中管理，可审计、可轮换，不与数据共存
- 平台 SaaS 化后涉及多用户敏感凭证，AES key 硬编码在 env 的方案安全风险过高
- cloud standalone 模式（本地 SQLite）仍可沿用现有 AES-256-GCM 方案，KMS 只在 server 侧启用

**实现**：
- `apps/server/src/lib/kms.ts` — 统一 KMS 抽象（local-dev 时 fallback 到 AES-256-GCM + `KMS_MASTER_KEY` env）
- DB 存储 `kms_key_id`（KMS 数据密钥引用），加密值本体存 `encrypted_value`

---

### 决策 2：部署执行位置 — cloud-worker 独立容器

**结论**：server 只负责任务调度（写 DB task），`cloud-worker` 独立容器消费任务、执行 kubectl/Pulumi，通过 SSE 推进度。

**理由**：
- kubectl / Pulumi 需要特定运行时环境（kubeconfig mount、网络权限），不适合在 server 进程内运行
- worker 可独立水平扩展，不影响 server 稳定性
- 安全边界清晰：K8s 访问凭证只在 worker 容器内，不暴露给 server HTTP 进程

**任务流**：
```
POST /api/cloud/deploy
  → server 写 cloud_deployments (status=pending)
  → cloud-worker 轮询/订阅 pending tasks
  → worker 执行 DeployService
  → worker 写 cloud_deployment_logs
  → worker 更新 status=deployed|failed
  → 前端通过 GET /api/cloud/deploy/:taskId/stream (SSE) 拿实时日志
```

---

### 决策 3：模板归属 — 公共 + 私有 + 社区共享（带审核）

**结论**：三层模板体系：

| 层级 | 来源 | 可见性 | 管理方 |
|---|---|---|---|
| 官方模板 | cloud 包内置 + admin 上传 | 所有用户只读 | admin |
| 私有模板 | 用户保存的 config | 仅本人 | 用户 |
| 社区模板 | 用户提交，admin 审核后公开 | 审核通过后全用户只读 | 用户提交 + admin 审核 |

**实现**：`cloud_templates` 增加 `source`（`official` / `community`）和 `reviewStatus`（`pending` / `approved` / `rejected`）字段；admin handler 增加审核接口。

---

## Verification（验收标准）

1. `GET /api/cloud/templates` 返回 seeded 官方模板列表（需 JWT）
2. `POST /api/cloud/deploy` 创建 task，worker 容器接管，SSE 流实时返回日志
3. 多租户隔离：用户 A 无法访问用户 B 的 deployments / configs / env-vars
4. `shadowob cloud --help` 正确转发到 `shadowob-cloud --help`
5. 未安装 `shadowob-cloud` 时，`shadowob cloud` 提示并自动安装
6. BYOK 集群：kubeconfig 加密存储，worker 解密后注入，明文不落盘
