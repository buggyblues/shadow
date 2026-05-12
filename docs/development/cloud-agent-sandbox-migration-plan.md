# apps/cloud agent-sandbox 迁移方案

日期：2026-05-11

状态：Implementation in progress

调研基线：`kubernetes-sigs/agent-sandbox` main，提交 `a8de4e57dcc4c523b31e25438afb86869a331d8b`

## 背景

Shadow Cloud 当前通过 Kubernetes `Deployment` 运行 `apps/cloud` 中定义的 agent runtime。OpenClaw runner 的主要状态目录 `/home/openclaw/.openclaw` 目前由 `emptyDir` 提供，Pod 重建、缩容或迁移时会丢失本地状态；同时普通 Deployment 无法自然表达 pause/resume、Pod 级 sandbox 生命周期和每个 agent 的持久状态卷。

目标是将 Cloud 内部 Kubernetes 后端从 `Deployment` 迁移到 `kubernetes-sigs/agent-sandbox`，产品和 API 层继续沿用 deployment 术语，同时在底层获得更强隔离、稳定状态卷、pause/resume 和备份能力。

## agent-sandbox 调研结论

agent-sandbox 当前核心资源：

- `Sandbox`：底层一对一 Pod 资源，`spec.replicas` 只支持 `0` 或 `1`。设置为 `0` 时 controller 删除 Pod，但保留 `Sandbox`、headless Service 和 PVC；设置为 `1` 时恢复 Pod。
- `SandboxTemplate`：可复用 pod template、`volumeClaimTemplates`、NetworkPolicy 和 env 注入策略。
- `SandboxClaim`：面向用户/租户的声明式申请资源，可引用 `SandboxTemplate`，可通过 warm pool 领用预热 Sandbox。
- `SandboxWarmPool`：维护预热 Sandbox 池，提高启动性能。

当前限制：

- agent-sandbox 仍处于 alpha，必须 pin 固定 release 或固定 commit，不能直接跟随 `main`。
- 自动“网络访问即唤醒”不是当前主线的完整能力，Shadow 需要在控制面或消息路由层实现自动 resume。
- `SandboxClaim` 使用 warm pool 时不支持自定义 `spec.env`，不能直接复用 Shadow 当前 per-agent env/Secret 注入模型。
- `Sandbox` 更新 pod template 后不应假设现有 Pod 会自动完成 Deployment 式滚动更新；配置变化需要显式重建 Pod，同时保留 PVC。

OpenClaw 官方 agent-sandbox 示例要点：

- 关闭 `automountServiceAccountToken`。
- 使用非 root 用户、`allowPrivilegeEscalation: false`、drop `ALL` capabilities。
- 通过 `volumeClaimTemplates` 挂载 workspace PVC。
- 以 gateway 模式启动 OpenClaw，并暴露 gateway/health 端口。

## 当前 Shadow Cloud 影响面

主要代码路径：

- `apps/cloud/src/infra/agent-deployment.ts`：生成 Kubernetes `Deployment`。
- `apps/cloud/src/infra/index.ts`：Pulumi program 和 manifest builder。
- `apps/cloud/src/infra/constants.ts`：OpenClaw 状态目录、volume mount、probe、基础 env。
- `apps/cloud/src/clients/kubectl-client.ts`、`apps/cloud/src/services/k8s.service.ts`：列 deployments/pods/logs、scale、rollout。
- `apps/cloud/src/interfaces/http/handlers/cluster.handler.ts`：`/deployments`、pods、logs、scale API。
- `apps/cloud/src/interfaces/web-saas/api.ts`、`api-adapter.ts` 和 Cloud UI API types：前端展示部署、pods、logs。
- `apps/server/src/handlers/cloud-saas.handler.ts`、Cloud deployment DAO/schema：SaaS deployment 状态与任务流。
- `packages/sdk`、`packages/sdk-python`、`website/docs/*/platform/cloud*.md`：API 类型和文档同步。

OpenClaw 状态路径：

- Runner 使用 `/home/openclaw/.openclaw` 作为状态目录。
- `packages/openclaw-shadowob` 的 session cache、message watermarks 和 monitor logs 写入 `~/.openclaw/shadow`。
- 迁移后该目录必须挂载到 Sandbox PVC，才能保证 pause/resume 后消息水位和会话缓存不丢。

## 目标架构

产品层继续使用 deployment 命名；Kubernetes 工作负载后端新增：

```ts
type CloudWorkloadBackend = 'agent-sandbox' | 'deployment'
```

默认新部署使用 `agent-sandbox`，保留 `deployment` 作为回滚开关。第一阶段以 `SandboxClaim + per-agent SandboxTemplate` 为主，不默认启用 warm pool；第二阶段通过 runner bootstrap 改造再启用通用 warm pool。

每个 agent 的资源结构：

- `ConfigMap`：非敏感 runtime config。
- `Secret`：敏感 env 和 token。
- `SandboxTemplate`：Pod template、安全上下文、volumes、volumeClaimTemplates、NetworkPolicy。
- `SandboxClaim`：每个 agent 一个 claim，`warmpool: none`。
- 兼容 `Service`：继续提供 `${agentName}-svc`，避免 UI、日志和健康检查路径一次性重构。
- `PersistentVolumeClaim`：由 `volumeClaimTemplates` 创建，用于 `openclaw-data`。

## 配置接口

新增 Cloud config：

```ts
interface DeploymentsConfig {
  namespace?: string
  backend?: 'agent-sandbox' | 'deployment'
  sandbox?: SandboxDefaults
  agents: AgentDeployment[]
}

interface AgentDeployment {
  sandbox?: AgentSandboxConfig
}

interface AgentSandboxConfig {
  runtimeClassName?: string
  state?: {
    enabled?: boolean
    size?: string
    storageClassName?: string
    accessMode?: 'ReadWriteOnce' | 'ReadWriteMany' | 'ReadOnlyMany'
  }
  lifecycle?: {
    autoPause?: boolean
    idleSeconds?: number
    backupBeforePause?: boolean
    shutdownPolicy?: 'Delete' | 'Retain'
  }
  backup?: {
    enabled?: boolean
    driver?: 'volumeSnapshot' | 'restic'
    schedule?: string
    retention?: number
  }
  warmPool?: {
    enabled?: boolean
    replicas?: number
    updateStrategy?: 'OnReplenish' | 'Recreate'
  }
}
```

默认值：

- `deployments.backend = 'agent-sandbox'`。
- `runtimeClassName = 'gvisor'`。
- `state.enabled = true`。
- `state.size = '5Gi'`。
- `state.accessMode = 'ReadWriteOnce'`。
- `lifecycle.shutdownPolicy = 'Retain'`。
- `warmPool.enabled = false`，直到 bootstrap 改造完成。

校验规则：

- agent-sandbox 后端下，`agent.replicas` 只允许 `undefined`、`0` 或 `1`。
- `warmPool.enabled = true` 时，第一阶段直接报错，提示需要启用后续 bootstrap 模式。
- 若集群没有 `RuntimeClass/gvisor`，部署前置检查失败，不静默降级到普通 runtime。

## Kubernetes 资源生成

新增 workload adapter：

- `createAgentSandboxTemplate`
- `createAgentSandboxClaim`
- `createAgentSandboxWarmPool`
- `buildAgentSandboxManifests`

迁移策略：

- `createInfraProgram` 根据 `config.deployments.backend` 分流。
- `buildManifests` 与 Pulumi program 使用同一套 builder，保证本地 manifest 和 CI/Pulumi 结果一致。
- 原 `createAgentDeployment` 保留，用于 `backend: deployment` 回滚。
- 新资源统一打标签：
  - `app=shadowob-cloud`
  - `agent=<agentName>`
  - `runtime=<runtime>`
  - `shadowob.cloud/workload-kind=agent-sandbox`

Pod template 要求：

- `automountServiceAccountToken: false`
- `runtimeClassName: gvisor`
- pod `securityContext` 沿用当前 `buildSecurityContext()`
- container `securityContext` 沿用当前 `buildContainerSecurityContext()`
- `allowPrivilegeEscalation: false`
- drop `ALL`
- OpenClaw health/gateway 端口保持当前 runner 约定

状态卷：

- `openclaw-data` 从 `emptyDir` 改为 `volumeClaimTemplates`。
- 挂载路径保持 `/home/openclaw/.openclaw`。
- `logs` 和 `tmp` 仍为 `emptyDir`。
- 显式 env：
  - `OPENCLAW_STATE_DIR=/home/openclaw/.openclaw`
  - `OPENCLAW_DATA_DIR=/home/openclaw/.openclaw`

## Pause / Resume

新增 `SandboxLifecycleService`：

- `resolveSandbox(namespace, agentName)`：通过 `SandboxClaim.status`、标签或名称解析实际 `Sandbox`。
- `pause(namespace, agentName)`：patch `Sandbox.spec.replicas=0`。
- `resume(namespace, agentName)`：patch `Sandbox.spec.replicas=1`，等待 `Ready`。
- `status(namespace, agentName)`：返回 `running | paused | resuming | failed | unknown`。

HTTP API：

- `POST /deployments/:ns/:id/pause`
- `POST /deployments/:ns/:id/resume`
- `POST /deployments/:ns/:id/scale`
  - agent-sandbox 后端只接受 `0` 或 `1`
  - `0` 等价 pause
  - `1` 等价 resume

日志和 pods：

- paused 状态没有 Pod 时，pods API 返回空数组并附带 paused 状态。
- logs API paused 时返回明确错误码和状态信息，不再只返回 `No pod found`。

自动 pause/resume：

- 自动 pause 由 Cloud 控制面根据 `lastActiveAt` 和 `idleSeconds` 触发。
- 自动 resume 由 Shadow server/Cloud 控制面触发：收到 agent mention、用户显式打开/调用 agent、gateway 请求时先 resume，再投递或重放消息。
- 不能依赖 agent-sandbox controller 自己完成网络访问唤醒。

## Backup / Restore

新增备份记录：

本地 SQLite 和 SaaS Postgres 都需要记录：

- `deploymentId`
- `agentId`
- `namespace`
- `sandboxName`
- `pvcName`
- `driver`
- `snapshotName`
- `objectKey`
- `status`
- `error`
- `expiresAt`
- `createdAt`
- `updatedAt`

驱动策略：

- 优先使用 CSI `VolumeSnapshot`，但必须同时满足集群安装了 `snapshot.storage.k8s.io` API、目标 PVC 的 StorageClass 由 CSI provisioner 提供，并能解析到匹配该 provisioner 的 `VolumeSnapshotClass`。
- 创建 VolumeSnapshot 时显式写入解析得到的 `volumeSnapshotClassName`，不依赖 snapshot-controller 的隐式 default class 选择。
- 若集群没有 snapshot CRD、目标 PVC 仍绑定到非 CSI StorageClass，或没有匹配的 VolumeSnapshotClass，SaaS 第一阶段自动使用对象归档 fallback：从运行中的 OpenClaw Pod 读取 `/home/openclaw/.openclaw`，或在 paused/no-pod 状态下挂载状态 PVC 到短生命周期 helper Pod，再将 `tar.gz` 归档写入私有对象存储。
- 后续可把对象归档实现替换为标准 restic/kopia repository、Job、retention 和跨集群 restore 流程；API driver 仍沿用 `restic`，避免再次改动产品接口。
- pause 前如果 `backupBeforePause=true`，先创建备份，再 patch `replicas=0`。
- destroy 前默认创建最终备份，除非用户显式跳过。

HTTP API：

- `GET /deployments/:ns/:id/backups`
- `POST /deployments/:ns/:id/backups`
- `POST /deployments/:ns/:id/restore`

Restore 行为：

- 从 snapshot 创建 PVC，或通过 restore Job 回填 PVC。
- 再创建或 resume Sandbox。
- 恢复后 OpenClaw 读取同一状态目录，`openclaw-shadowob` 使用持久化 watermarks 做 catch-up。

## WarmPool 分阶段策略

第一阶段：

- 不默认启用 warm pool。
- `SandboxClaim.spec.warmpool = none`。
- per-agent config、Secret、env 仍沿用当前注入模型。

第二阶段：

- 改造 OpenClaw runner bootstrap。
- 预热 Pod 使用通用镜像和通用 template 启动。
- Pod 被 claim 领用后，通过 claim metadata 和短期 bootstrap token 向 Shadow API 拉取 agent config/secret。
- 启用 `SandboxWarmPool`，按 runtime/image/resource profile 维护预热池。

这样可以避免 agent-sandbox 当前 warm pool 与自定义 env 的冲突。

## 安全策略

隔离默认值：

- `runtimeClassName = gvisor`
- `automountServiceAccountToken = false`
- 非 root 用户运行
- 禁止 privilege escalation
- drop all Linux capabilities
- 禁止 hostPath、hostNetwork、hostPID、hostIPC、hostPort

NetworkPolicy：

- 默认 deny。
- 明确允许 DNS。
- 明确允许 Shadow server。
- 明确允许配置中的模型/provider egress。
- 阻断 metadata、本地私网和未声明 egress。
- 如果 Shadow server 位于私有网段，需要由配置显式允许，不能依赖默认放行。

Admission：

- 增加可选 ValidatingAdmissionPolicy 或等价策略，要求 agent-sandbox workload 满足上述安全上下文。
- `pnpm check:security-pr` 的规则需要覆盖新的 Sandbox/SandboxTemplate manifest。

## API / SDK / UI 同步

Cloud API 返回新增字段：

```ts
interface DeploymentStatus {
  name: string
  ready: string
  upToDate: string
  available: string
  age: string
  workloadKind?: 'deployment' | 'agent-sandbox'
  runtimeState?: 'running' | 'paused' | 'resuming' | 'failed' | 'unknown'
  sandboxName?: string
  serviceFQDN?: string
  statePvc?: string
  pausedAt?: string
  lastActiveAt?: string
}
```

SaaS deployment 状态新增：

- `paused`
- `resuming`

同步范围：

- `apps/cloud/packages/ui/src/lib/api.ts`
- `apps/cloud/src/interfaces/web-saas/api.ts`
- `apps/cloud/src/interfaces/web-saas/api-adapter.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/src/client.ts`
- `packages/sdk-python/shadowob_sdk/types.py`
- `packages/sdk-python/shadowob_sdk/client.py`
- `website/docs/en/platform/cloud.md`
- `website/docs/zh/platform/cloud.md`

所有新增 UI copy 必须写入 i18n。

## 迁移和回滚

迁移：

- 不原地接管旧 Kubernetes `Deployment`。
- 重新部署时先创建 Sandbox 资源。
- Sandbox Ready 后删除旧 Deployment。
- PVC 创建完成并绑定后再标记 deployment 可用。

回滚：

- 将 `deployments.backend` 改为 `deployment`。
- 重新部署旧 Deployment 资源。
- 保留 Sandbox PVC，直到用户显式清理。

不支持：

- 单个 agent 在 agent-sandbox 后端设置 `replicas > 1`。
- 第一阶段 warm pool 与 per-agent env/Secret 注入混用。

## 测试计划

Unit：

- manifest 生成不再输出 Deployment。
- 正确输出 `SandboxTemplate`、`SandboxClaim`、PVC template、Service、NetworkPolicy。
- OpenClaw `openclaw-data` 使用 PVC，不使用 `emptyDir`。
- `replicas > 1` 报错。
- pause/resume 生成正确 patch。
- backup driver 选择正确。

OpenClaw runner：

- `/home/openclaw/.openclaw/shadow` 的 session cache 和 watermarks 在 pause/resume 后保留。
- generated config 不写入备份敏感日志。

Integration：

- kind 集群安装 pinned agent-sandbox CRD/controller。
- 部署 OpenClaw SandboxClaim。
- 等待 Ready。
- 读取 pods/logs。
- scale `0 -> 1`。
- 确认 PVC 数据保留。

Backup：

- CSI snapshot 路径。
- restic/kopia fallback 路径。
- restore 后新 Sandbox 使用恢复 PVC 并能启动。

Product E2E：

- Cloud console/SaaS pause。
- resume。
- backup。
- restore。
- Web 和 mobile 云部署状态展示一致。

CI：

```bash
docker compose -f docker-compose.ci-tests.yml run --rm ci-tests
```

按现有 E2E compose 追加 Cloud/SaaS 关键路径。格式化只使用 Biome。

## 实施阶段

### Phase 1：资源生成和兼容层

- 增加 config schema。
- 增加 agent-sandbox manifest/Pulumi builder。
- 将 OpenClaw 状态目录迁到 PVC。
- 保留 Deployment 后端作为回滚路径。
- 补 unit tests。

### Phase 2：运行时操作

- 增加 `SandboxLifecycleService`。
- 改造 kubectl client/list/status/scale/logs/pods。
- 增加 pause/resume API。
- 更新 Cloud UI/SaaS API types。

### Phase 3：备份恢复

- 增加备份表。
- 实现 CSI snapshot driver。
- 实现 restic/kopia fallback。
- 增加 backup/restore API 和 UI。

### Phase 4：自动 pause/resume

- 记录 `lastActiveAt`。
- 实现 idle scanner。
- 接入 Shadow server 事件触发 resume。
- resume ready 后投递或重放消息。

### Phase 5：WarmPool

- 改造 runner bootstrap。
- 引入短期 bootstrap token。
- 按 runtime profile 创建 `SandboxWarmPool`。
- 验证预热 Pod 领用后的配置和 Secret 拉取安全性。

## 验收标准

- 新部署默认创建 agent-sandbox 资源，不创建 Kubernetes Deployment。
- OpenClaw 状态在 pause/resume 后保留。
- `pause` 后 Pod 被删除，PVC 保留。
- `resume` 后 Pod 重建并恢复 Ready。
- logs/pods API 对 running 和 paused 状态都有明确返回。
- backup/restore 能恢复 OpenClaw 状态目录。
- `backend: deployment` 可回滚旧行为。
- 所有新增 API 类型、SDK 和文档同步。
- 本地 docker-compose CI 测试通过。

## 当前实现状态（2026-05-11）

已完成：

- Cloud config 已新增 `deployments.backend`、`deployments.sandbox` 和 `agents[].sandbox`，默认后端为 `agent-sandbox`，并同步生成 `apps/cloud/schemas/config.schema.json`。
- Infra 已新增 agent pod builder 与 agent-sandbox builder；默认输出 `SandboxTemplate` + `SandboxClaim`，显式 `backend: "deployment"` 时保留旧 Deployment 输出。
- OpenClaw 状态目录 `/home/openclaw/.openclaw` 在 agent-sandbox 后端改为 `volumeClaimTemplates` PVC，并显式注入 `OPENCLAW_STATE_DIR`、`OPENCLAW_DATA_DIR`。
- kubectl 操作层可以合并列出 Deployment 和 SandboxClaim，返回 `workloadKind`、`runtimeState`、`sandboxName`、`serviceFQDN`、`statePvc`，并将 scale `0/1` 转换为 Sandbox patch。
- 本地 HTTP API 已新增 pause、resume、backups、restore 路由；VolumeSnapshot backup 会创建 `VolumeSnapshot`，SaaS 路径在缺少 VolumeSnapshot API 或目标 PVC 不是 CSI-backed 时会自动选择对象归档 fallback。
- 本地 SQLite 已新增 `deployment_backups` 表和 DAO；SaaS Postgres 已新增 `paused`、`resuming` 状态和 `cloud_deployment_backups` 记录表。
- CLI 已新增 `shadowob-cloud sandbox status/pause/resume/backup/restore`，`status` 表格展示 `WORKLOAD`、`STATE`、`SANDBOX`、`STATE PVC`。
- Dashboard 命名空间页已展示 agent-sandbox runtime state、pause/resume/backup/restore 操作、Backups tab、Sandbox metadata 和 paused empty state；restore 操作使用 SaaS 备份记录的真实 ID，避免本地 UI 序号与后端记录 ID 混淆。
- Web SaaS API client、adapter 和 server handler 已接入 pause/resume/backups/createBackup/restore，并会执行 Sandbox patch、VolumeSnapshot wait 和 PVC restore。
- runtime kubectl helper 已支持 kubeconfig-aware Sandbox scale/wait、VolumeSnapshot create/wait、PVC-from-snapshot restore；本地 HTTP 与 SaaS handler 已开始复用这套执行能力。
- runtime kubectl helper 已兼容真实 agent-sandbox `SandboxClaim.status.sandbox` 对象引用，并在 pause/resume wait 中同时检查 Pod 删除/Ready，避免旧 Pod 仍 `Terminating` 时提前返回。
- VolumeSnapshot create/restore 前会先检查集群是否安装 `snapshot.storage.k8s.io` API；backup 默认 driver 还会检查目标 PVC 的 StorageClass provisioner 是否为 CSI，并解析匹配 provisioner 的 `VolumeSnapshotClass` 后显式写入 `volumeSnapshotClassName`；缺少 CRD/controller、PVC 非 CSI-backed 或缺匹配 snapshot class 时返回明确错误或自动 fallback，不会在 restore 中先删除 PVC 后才失败。
- SaaS pause/resume/backup/restore 已共用 namespace 级 operation lock，防止同时对同一个 Sandbox/PVC 执行并发 pause、resume、backup、restore。
- SaaS restore 已补充当前实例校验和状态门禁：拒绝历史 deployment instance，只允许 `deployed`、`paused`、`failed` 进入恢复流程，并拒绝恢复非 `succeeded` 备份。
- 对象归档 fallback 已增加 running Pod 优先、helper Pod 降级策略；备份日志记录归档来源和 archive bytes，restore 日志记录恢复 archive bytes，便于诊断备份是否真正覆盖状态目录。
- SaaS 备份记录已增加 `phase` 字段，后台任务会写入 `queued`、`object-archiving`、`object-storing`、`snapshot-creating`、`snapshot-waiting`、`restoring-pausing`、`restoring-pvc`、`restoring-resuming`、`completed` 等阶段；server worker 启动/reconcile 时会把长时间未更新的 `pending/running` backup 标记为 `failed` 并写入 deployment log，避免重启后 UI 永久卡在运行中。
- 本轮 Review 修复 restore 失败可观测性：restore 后台任务失败时不再把 backup phase 误写为 `completed`，而是写入 `restore-failed` 并保留 artifact 可再次恢复；stale restore reconciler 在发现 deployment 已经进入 `failed` 时同样保留 `restore-failed` phase 和错误信息，Dashboard 会展示“恢复失败”。
- Web SaaS API client 已透传后端错误详情；Dashboard pause/resume/backup/restore toast 会显示 409/422/502 等具体原因，而不是只显示通用失败文案。
- Dashboard 会根据 deployment/runtime 状态禁用无效的备份操作；`resuming`、`failed` 等状态不再让用户点进必然失败的 backup 请求；Backups tab 会展示 backup/restore phase，用户能区分归档、写对象存储、暂停、恢复 PVC、恢复 Sandbox 等阶段。
- 本地 Cloud HTTP restore 已拒绝恢复 `pending/running/failed/expired` 备份，默认选择最近的 `succeeded` 备份。
- Cloud 部署入口在 agent-sandbox 后端会等待 Sandbox/Pod Ready 后再记录部署完成和计费，避免 CR 创建成功但 runner 仍在拉镜像/启动时产品层误报 ready。
- runtime kubeconfig 处理已避免用过期的环境变量 `KUBECONFIG_CONTEXT` 覆盖 mounted kubeconfig 的 `current-context`，防止 reconcile/list/logs 查询到错误集群后把真实 namespace 误判为 `orphaned-by-cluster`。
- SaaS reconcile 对刚更新的部署增加 orphan grace，并会在真实 OpenClaw Pod Ready 时恢复误标失败的 runtime 部署；部署列表保留最新 failed runtime 记录用于诊断，过滤用户取消和被新部署 supersede 的记录。
- OpenClaw Shadow 插件已将 channel mention 的 `sourceReplyDeliveryMode` 调整为 `automatic`，允许模型正常最终回答自动投递到 Shadow 消息流；message tool 仍可作为显式发消息路径。
- TypeScript SDK 和 Python SDK 已新增 Cloud deployment pause/resume/backups/restore 方法。
- Cloud UI API types 和 Web SaaS adapter status types 已同步；中英文 Cloud 平台文档已说明 agent-sandbox 默认后端。
- Cloud/SaaS 已新增部署 Manifest 管理链路：新部署会写入 manifest metadata；历史部署会按 `templateSlug`、`metadata.template`、Cloud config `name`、deployment name 和 namespace 保守反查可访问模板，Dashboard Info tab 可展示模板来源、drift、快照重部署、最新模板重部署、保存可编辑模板和保存后重部署。
- Deployment 环境变量页已改为任务导向说明：区分当前部署覆盖值、全局回退值和浏览器会话；CookieJar 导入弹窗支持 Playwright storageState JSON、JSON cookie array 和 Netscape cookies.txt，并保存到加密 deployment-scoped env `AGENT_BROWSER_STORAGE_STATE_JSON`。

已验证：

```bash
pnpm biome check <changed-files>
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/cloud build
pnpm --filter @shadowob/cloud test -- apps/cloud/__tests__/infra/runtime-package.test.ts
pnpm --filter @shadowob/cloud test -- apps/cloud/__tests__/clients/kubectl-runtime.test.ts
pnpm --filter @shadowob/cloud test -- apps/cloud/__tests__/services/deploy.service.test.ts
pnpm --filter @shadowob/openclaw-shadowob build
pnpm --filter @shadowob/openclaw-shadowob test -- packages/openclaw-shadowob/__tests__/plugin.test.ts
pnpm --filter @shadowob/server typecheck
JWT_SECRET=test-secret-with-enough-entropy pnpm --filter @shadowob/server test -- __tests__/cloud-saas-e2e.test.ts
pnpm --filter @shadowob/web typecheck
pnpm --filter @shadowob/sdk typecheck
python3 -m py_compile packages/sdk-python/shadowob_sdk/client.py
apps/cloud/__tests__/layer0/test-openclaw-runner.sh
docker compose build server
docker compose up -d server
docker buildx imagetools inspect ghcr.io/buggyblues/openclaw-runner:latest
pnpm check:security-pr
```

本轮 Review 追加验证（2026-05-11）：

```bash
pnpm biome check apps/server/src/dao/cloud-deployment-backup.dao.ts apps/server/src/lib/cloud-deployment-processor.ts apps/server/src/handlers/cloud-saas.handler.ts apps/server/__tests__/cloud-deployment-processor.test.ts apps/cloud/packages/ui/src/pages/DeploymentNamespacePage.tsx apps/cloud/packages/ui/src/i18n/en.json apps/cloud/packages/ui/src/i18n/zh-CN.json apps/server/src/handlers/app.handler.ts apps/server/src/lib/cloud-deployment-autoresume.ts apps/web/src/components/app/app-page.tsx
JWT_SECRET=test-secret-with-enough-entropy pnpm --filter @shadowob/server typecheck
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/web typecheck
pnpm check:security-pr
JWT_SECRET=test-secret-with-enough-entropy pnpm --filter @shadowob/server test -- __tests__/cloud-deployment-processor.test.ts __tests__/cloud-deployment-autoresume.test.ts __tests__/cloud-saas-e2e.test.ts
pnpm --filter @shadowob/cloud test -- apps/cloud/__tests__/infra/runtime-package.test.ts apps/cloud/__tests__/clients/kubectl-runtime.test.ts apps/cloud/__tests__/services/deploy.service.test.ts
kubectl config current-context && kubectl get sandboxclaim,sandbox,pod,pvc,svc -n gstack-buddy -o wide
```

结果：

- Biome、server/cloud/web typecheck 和 security PR checks 通过。
- Server 目标测试通过：42 个 test files，878 个 tests。
- Cloud 目标测试通过：31 个 test files，493 个 tests。
- 真实集群只读检查通过：当前 context 为 `kind-agent-sandbox`，`gstack-buddy` namespace 中 `SandboxClaim/strategy-buddy`、`Sandbox/strategy-buddy`、Pod、PVC、Service 均存在；Pod `strategy-buddy` 为 `2/2 Running`，PVC `openclaw-data-strategy-buddy` 为 `Bound`。
- In-app browser 回归检查：当前 3003 页面可加载命名空间页并展示 running sandbox、Backups tab、对象归档备份和旧 VolumeSnapshot 失败原因；键盘切换 Backups tab 正常。由于 3003 运行进程未立即应用源码热更新，本轮新增的鼠标点击兜底以 code/typecheck 验证为准。
- Manifest/CookieJar UI 回归检查：当前 3003 页面 `gstack-buddy` Info tab 能从历史部署反查 `gstack-buddy` 模板并启用“按最新模板重部署 / 保存可编辑模板 / 保存模板并重部署”；Environment tab 能打开 CookieJar 导入弹窗，粘贴 Playwright storageState JSON 后显示识别到 `1` 个 cookie。

真实 kind smoke（2026-05-11）：

- 使用 `kubernetes-sigs/agent-sandbox` pinned commit `a8de4e57dcc4c523b31e25438afb86869a331d8b`。
- 通过上游 `EXTENSIONS=true CONTROLLER_ONLY=true make deploy-kind` 创建 kind 集群并安装 CRD/controller。
- controller 镜像实测构建为 `kind.local/agent-sandbox-controller:v20260511-v0.4.5-3-ga8de4e5`，`deployment/agent-sandbox-controller` Ready。
- 底层手写 `SandboxTemplate + SandboxClaim` smoke 通过：`SandboxClaim` Ready，Pod `shadow-smoke-agent` Running，PVC `openclaw-data-shadow-smoke-agent` Bound。
- 直接 patch `Sandbox.spec.replicas 1 -> 0 -> 1` 通过：pause 后 Pod 删除且 PVC 保留，resume 后新 Pod Ready，并读回 `/home/openclaw/.openclaw/shadow/watermark.txt`。
- Cloud 生成路径实测通过：从 `apps/cloud/dist` 的 `ManifestService` 生成并应用 `Namespace`、`ConfigMap`、`Secret`、`SandboxTemplate`、`SandboxClaim`、`Service`、`NetworkPolicy`；真实资源 `shadow-cloud-smoke-agent` Ready。
- Cloud runtime helper 实测通过：`scaleAgentSandboxAsync(0)` 等到 Pod 不存在，`scaleAgentSandboxAsync(1)` 等到 Pod Running/Ready；resume 后读回 PVC 文件 `cloud-helper-strict-1778484010514`。
- 同一次 Cloud helper 验证中 Pod IP 从 `10.244.0.11` 变为 `10.244.0.12`，PVC `openclaw-data-shadow-cloud-smoke-agent` 仍绑定同一个 PV `pvc-d8a13164-008b-4f75-90ee-70db802f5d63`。
- Cloud 部署入口实测通过：直接调用 `K8sService.deploy()` 走 Pulumi automation + `createInfraProgram`，创建 namespace `shadow-cloud-up-smoke`、agent `shadow-cloud-up-agent`，Pulumi 输出 `shadow-cloud-up-agent-sandbox-claim-name`、`shadow-cloud-up-agent-sandbox-template-name`、`shadow-cloud-up-agent-state-pvc`、`shadow-cloud-up-agent-workload-name`。
- 对 Pulumi 创建的 Cloud workload 再次执行 Cloud helper pause/resume 通过：resume 后 Pod IP 为 `10.244.0.15`，PVC `openclaw-data-shadow-cloud-up-agent` 仍绑定 PV `pvc-a520be8a-8e96-4f19-b1a6-94e99fe969d9`，并读回 `/home/openclaw/.openclaw/shadow/cloud-up.txt` 内容 `cloud-up-helper-1778484242447`。
- Cloud CLI 完整路径实测通过：`node dist/cli.js up -f /tmp/shadow-cloud-cli-smoke.json -n shadow-cloud-cli-smoke --stack agent-sandbox-cli-smoke --skip-provision --yes --k8s-context kind-agent-sandbox --image-pull-policy IfNotPresent` 创建真实 `SandboxClaim/Sandbox/Pod/PVC/Service`，Pod `shadow-cloud-cli-agent` Ready，PVC `openclaw-data-shadow-cloud-cli-agent` Bound。
- CLI status smoke 暴露并修复两个兼容问题：表格输出需要字符串化 `READY`；同步 kubectl client 也要兼容真实 `status.sandbox: { name, podIPs }` 对象引用。修复后 `KUBECONFIG=/tmp/agent-sandbox-smoke/bin/KUBECONFIG node dist/cli.js sandbox status -n shadow-cloud-cli-smoke` 正确显示 `shadow-cloud-cli-agent running 1/1`。
- SaaS Cloud 真实部署 `gstack-buddy` 通过产品部署队列创建 `SandboxTemplate/SandboxClaim/Sandbox/Pod/PVC/Service`，Pod `strategy-buddy` `2/2 Running`，PVC `openclaw-data-strategy-buddy` `Bound`。
- `gstack-buddy` 冷启动瓶颈来自镜像拉取：init `node:22-bookworm` 约 2 分钟，`ghcr.io/buggyblues/openclaw-runner:latest` 约 4 分钟；CR 创建本身很快，但产品层必须等 runner Ready。
- `gstack-buddy` 诊断确认 LLM proxy 请求成功，Shadow server 返回 chat completion `200`，OpenClaw trajectory 生成了中文回复；未回复根因是 `message_tool_only` 不会自动投递最终文本。热修复为 `automatic` 后，测试消息 `热修复验证：请回复一句收到` 成功收到 bot 回复 `收到 ✅`。
- 同次诊断确认产品端看不到部署/日志的根因是 server 容器中 `KUBECONFIG_CONTEXT=rancher-desktop` 覆盖了实际 kubeconfig `current-context=kind-agent-sandbox`；修复后 server runtime helper 能列出 `gstack-buddy`，DB 状态恢复为 `deployed`。
- OpenClaw runner 镜像已本地重建并通过 layer0 smoke：`apps/cloud/__tests__/layer0/test-openclaw-runner.sh` 会构建真实镜像、验证 `/health`、非 root、配置隔离、无 secret 日志，并新增检查镜像内 bundled `openclaw-shadowob` 不再包含 `message_tool_only`、且使用 `sourceReplyDeliveryMode: "automatic"`。
- 本地 kind 已加载 `shadowob/openclaw-runner:agent-sandbox-fix-20260511`，并将当前 `gstack-buddy` Sandbox/SandboxTemplate 切到该镜像。新 Pod `strategy-buddy` Ready 后确认镜像内 reply mode 为 `automatic`，发送验证消息 `新镜像验证：请只回复 OK-SANDBOX` 后，OpenClaw 经 model proxy `200` 返回并成功投递 bot 回复 `OK-SANDBOX`。
- `shadow/runtime:dev` server/cloud 容器已通过 `docker compose build server` 从源码重建，并用 `docker compose up -d server` 替换旧容器；本地 compose 现在会把 `SHADOWOB_OPENCLAW_RUNNER_IMAGE` 传入 server，当前 `.env` 指向 `ghcr.io/buggyblues/openclaw-runner:latest`。重启后 server 容器内 `listManagedNamespaces()` 能看到 `gstack-buddy`，`namespaceExists("gstack-buddy") === true`，DB 部署状态保持 `deployed`，未再出现 false orphan。重启后再次发送 `重启后验证：请只回复 OK-AFTER-RESTART`，OpenClaw 经 model proxy `200` 成功投递 `OK-AFTER-RESTART`。
- 已通过临时发布分支 `codex/publish-openclaw-runner-fix` 触发并完成 GitHub Actions workflow `publish-openclaw-runner.yml`，发布目标为 `ghcr.io/buggyblues/openclaw-runner:latest`，run URL：`https://github.com/buggyblues/shadow/actions/runs/25659213824`。
- 远端 runner 镜像 manifest 已验证：`ghcr.io/buggyblues/openclaw-runner:latest` 为 multi-arch OCI index，digest `sha256:194777d88cb49870bac49b5adbdda6d07e08fcf4e895f65c5d4cd6e6c023c566`，包含 `linux/amd64` 和 `linux/arm64`。
- 当前 `gstack-buddy` Sandbox 已切回远端镜像 `ghcr.io/buggyblues/openclaw-runner:latest`，`imagePullPolicy=Always`，Pod 实际 `imageID` 为 `ghcr.io/buggyblues/openclaw-runner@sha256:194777d88cb49870bac49b5adbdda6d07e08fcf4e895f65c5d4cd6e6c023c566`。通过 pause/resume 重新拉取远端镜像后，Admin 在 `#Weekly Retro` 发送验证消息，Buddy 自动回复 `OK-GHCR-164849`。
- 当前 `gstack-buddy` 集群资源再次确认：`Sandbox`、`SandboxClaim`、Pod、PVC、Service 均存在，Pod `strategy-buddy` `2/2 Running`，PVC `openclaw-data-strategy-buddy` `Bound` 到 `standard` StorageClass。
- SaaS backup endpoint 已改为异步执行：创建记录后立即返回 `202/running`，后台优先创建并等待 VolumeSnapshot；若集群没有 `snapshot.storage.k8s.io` API，则自动改用对象归档 fallback，完成后将备份记录更新为 `succeeded` 或 `failed` 并写入 deployment logs。restore endpoint 也已改为 `202` 后台任务，支持恢复 `succeeded` 的 `volumeSnapshot` 或对象归档备份，执行 pause、PVC restore、resume、wait ready，并将 deployment 状态落到 `deployed` 或 `failed`。
- 对象归档 fallback 已在真实 `gstack-buddy` sandbox 上验证：kind 集群没有 VolumeSnapshot API，`POST /api/cloud-saas/deployments/:id/backups` 不指定 driver 时自动返回 `driver=restic`、`objectKey=backups/cloud/...tar.gz`，后台状态从 `running` 更新为 `succeeded`。
- 对象归档 restore 已在真实 `gstack-buddy` sandbox 上验证：先将 PVC 文件 `/home/openclaw/.openclaw/shadow/backup-fallback.txt` 从 `backup-fallback-1778491900` 改为 `backup-fallback-mutated`，再调用 restore；流程自动 pause、helper Pod 回填 PVC、resume，Pod 回到 `2/2 Running` 后文件内容恢复为 `backup-fallback-1778491900`。
- Dashboard Backups tab 已验证：缺少 VolumeSnapshot API 的 kind 集群中，点击 `创建备份` 会创建新的对象归档备份并展示为 `已完成 / 对象归档`；旧的 CSI 失败记录仍显示后端错误，方便诊断历史失败。
- Dashboard restore UI 已验证：`succeeded` 的 VolumeSnapshot 或对象归档记录都启用恢复；恢复前会打开中英 i18n 的危险确认弹窗，说明备份对象和 PVC；窄视口下 Backups tab 改为卡片布局，避免对象路径和操作按钮挤压表格。
- Dashboard 可用性继续补强：备份/恢复运行中切到 3 秒快轮询，完成后回到常规轮询；禁用的 Backup/Restore/Pause/Resume 按钮会给出明确原因，Info tab 展示 `lastActiveAt` 和 `pausedAt`，备份列表展示最近更新时间。
- 本轮 Review 补强后，backup/restore/pause/resume 具备同一 namespace 的互斥保护；restore 不再允许历史部署或 active operation 状态误恢复；SaaS/UI 能直接展示后端返回的具体错误信息。
- Server E2E 已新增 restore 防回退测试：历史 deployment instance、active deployment 状态、非 `succeeded` 备份和 namespace operation lock 都返回明确 409/422。
- Server E2E 取消流程已补强：cancel destroy 现在允许 API 先返回 `cancelling`，测试会继续等待后台 worker 将状态落到 `failed/cancelled by user`，覆盖异步 worker 竞争窗口。
- SaaS deployment logs 和 pod-logs SSE 已增加 abort/closed-controller 保护；复现断开 pod log stream 后 server 容器 `RestartCount=0`，不再因为 `Controller is already closed` 崩溃。
- 备份记录新增 `phase` 字段并补了历史回填迁移：旧的 `succeeded/failed` 记录不再显示为 `queued`；backup 创建、snapshot waiting、object archiving/storing、restore pause/PVC/resume 都会写入可观测 phase。
- Worker startup/reconcile 已补 stale operation 自愈：长时间未更新的 `pending/running` backup 会自动标记 `failed` 并写入 deployment log；卡在 `restoring-*` phase 的 restore 会先探测 runtime 是否已 Ready，能恢复则标记 deployed，否则将 deployment 从 `resuming` 落为 `failed`，避免 server 重启后无限挂起。
- 对象归档 fallback 已补 artifact retention：`expiresAt` 到期的成功备份会删除 Shadow 私有对象或 VolumeSnapshot artifact，删除成功后标记 `expired`；删除失败会保留 `succeeded` 以便下轮 reconcile 重试并写入 warn log。
- 对象归档 fallback 已补可选 AES-256-GCM 加密：配置 `CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY` 后，server 写入对象存储前会加密 tar.gz archive，restore 自动识别并解密；配置 `CLOUD_BACKUP_OBJECT_ENCRYPTION_REQUIRED=true` 时缺 key 会让对象备份失败而不是明文落盘。
- backup 默认 driver 已从“只看集群是否安装 VolumeSnapshot API”收紧为“VolumeSnapshot API + 目标 PVC StorageClass 是 CSI provisioner + 存在匹配 VolumeSnapshotClass”；当前 `gstack-buddy` 使用 `rancher.io/local-path` 的 `standard` StorageClass，即使集群后来安装了 snapshot CRD/controller，也会继续默认走对象归档 fallback，避免创建不可恢复的 snapshot 任务。
- `cloud_deployments.last_active_at` 已落库并接入活跃链路：agent heartbeat、usage snapshot、HTTP message、WebSocket message 中的 Buddy mention 会刷新对应 Cloud deployment 的活跃时间。
- Worker 已实现自动 idle pause 基础链路：当 agent-sandbox deployment 的所有 agent 都显式配置 `sandbox.lifecycle.autoPause=true`，且超过 `idleSeconds` 未活跃时，worker 会 patch 对应 Sandbox `replicas=0`、等待 paused、再将 deployment 状态落为 `paused`。
- `backupBeforePause=true` 已接入自动 pause：worker 在持有 namespace operation lock 后先同步创建备份，备份成功才继续 pause；备份失败会阻断 pause 并写入 `[auto-pause] Failed` 日志，避免无备份停机。
- 自动 resume 已接入统一触发服务：HTTP/WS 消息里的 Buddy mention、agent heartbeat、usage snapshot、app gateway join/broadcast 和已显式配置 Cloud auto-resume target 的 app proxy 请求都会走同一条 `record activity -> find paused deployment -> patch Sandbox replicas=1 -> wait Ready` 路径；消息已先持久化，runner resume 后依赖现有 catch-up 逻辑消费。
- Dashboard 已补 Deployments 列表的 paused 聚合指标、namespace 内 sandbox/paused/resuming chips、Sandbox/PVC 元数据、paused pods/logs 的 Resume 主操作，以及 backup/restore 运行中提示条；Backups tab 在 active operation 期间提高轮询频率，结束后恢复常规刷新。
- Cloud Dashboard 的共享 tab 组件已增加显式 `onSelect` 点击兜底，并接入 Deployments、Deployment detail、Namespace、Monitoring 和 Template detail 页面，避免 Radix tab keyboard path 正常但鼠标点击路径不切换时影响 Dashboard 可用性。
- Web App Center 已补 URL app 的 Cloud auto-resume 配置项：管理员可开启“应用访问时唤醒 Cloud Buddy”，可显式填写 Buddy user IDs，也可从 app hidden channel 推断 Buddy；App iframe 在 Cloud runtime 恢复期间展示启动中的覆盖层，proxy 和非 proxy URL open 都会先等待 resume 或返回明确 starting 状态。
- CSI VolumeSnapshot 正向路径已在 `kind-agent-sandbox` 验证：安装 external-snapshotter `v8.2.0` CRD/controller 和 `csi-driver-host-path v1.17.0` 后，创建 `source-pvc -> VolumeSnapshot -> restored-pvc`，显式使用 `volumeSnapshotClassName=csi-hostpath-snapclass`，`VolumeSnapshot.readyToUse=true`，恢复 Pod 读回 marker `shadow-csi-snapshot-ok-1778501025`。
- 实测 snapshot-controller 对隐式 default class 选择不稳定，曾返回 `cannot find default snapshot class`；因此实现已改为解析 PVC StorageClass provisioner，再选择匹配的 `VolumeSnapshotClass` 并显式写入。
- SaaS CSI-backed backup/restore 已真实验证：创建临时 template `csi-snapshot-smoke-03649947`，将 sandbox state PVC 绑定到 `csi-hostpath-sc`，通过正常 SaaS deploy API 部署 namespace `csi-snapshot-03649947`；默认 backup 选择 `driver=volumeSnapshot`，生成 `VolumeSnapshot.spec.volumeSnapshotClassName=csi-hostpath-snapclass` 且 `readyToUse=true`；将 PVC marker 改写后调用 restore API，流程自动 pause、PVC-from-snapshot restore、resume，最终 Pod 回到 `2/2 Running` 且 marker 恢复为备份前值。临时 deployment 已通过正常 destroy flow 清理。

剩余缺口：

- server/cloud 容器镜像本地已重建验证；仍需把同一镜像构建流程推到远端/部署环境，确保 kubeconfig context 修复、orphan grace、Ready wait 和 failed runtime 可见性进入正式发布版本。
- VolumeSnapshot backup/restore 的 Kubernetes 和 SaaS API 真实路径均已验证；还需要把 CSI-capable StorageClass 的 integration 固化到 CI。
- 对象归档 fallback 已有加密和 retention 清理，但仍是 Shadow 私有对象存储 + helper Pod tar.gz；标准 restic/kopia repository secret、原生 repository prune、跨集群 restore API 仍是后续强化项。
- restore 目前复用 deployment `resuming/failed/deployed` 状态与 backup `phase` 展示进度，后续如果需要审计级 restore 历史，应新增独立 `cloud_deployment_restore_operations` 表。
- UI 当前通过 polling 展示 backup/restore 状态和 phase，active operation 期间已降到 3 秒轮询；后续可补充 operation progress SSE，把 archive、pause、PVC restore、resume、Ready wait 作为实时事件推送。
- 自动 idle pause/resume 的控制面基础链路已实现，`backupBeforePause=true` 已补自动备份前置，HTTP/WS mention、agent runtime 上报、app gateway 和 app proxy 已统一到同一 auto-resume helper；mobile 端状态展示一致性仍待补齐。
- WarmPool bootstrap 尚未启用：当前仍对 `warmPool.enabled=true` 报错。需要 runner 支持短期 bootstrap token/config fetcher 后，再生成通用 `SandboxWarmPool`。
- Product E2E、kind integration、backup restore integration 还未接入 CI；当前 kind smoke 是本地手动验证。

## 分层测试和验证方案

### Layer 0：静态检查和 schema drift

目标：先验证代码、schema、安全规则没有基础错误。

命令：

```bash
pnpm biome check <changed-files>
pnpm --filter @shadowob/cloud typecheck
pnpm --filter @shadowob/server typecheck
pnpm --filter @shadowob/cloud generate:schema
pnpm check:security-pr
```

验收：

- Biome 无格式或 import order 错误。
- Cloud/server typecheck 通过。
- `config.schema.json` 与 CloudConfig types 同步。
- 安全检查没有发现直接 wallet mutation、public media、危险 env 注入等回归。

### Layer 1：单元测试

目标：不依赖 Kubernetes，先验证资源生成和操作命令 payload。

测试点：

- 默认 manifest 不输出 `apps/v1 Deployment`，输出 `SandboxTemplate`、`SandboxClaim`、兼容 `Service`、NetworkPolicy。
- `openclaw-data` 在 agent-sandbox 后端来自 `volumeClaimTemplates`，不再来自 `emptyDir`。
- 容器 env 包含 `OPENCLAW_STATE_DIR`、`OPENCLAW_DATA_DIR`。
- `backend: "deployment"` 保持旧 Deployment manifest。
- `replicas > 1` 和第一阶段 `warmPool.enabled=true` 报错。
- kubectl mock 覆盖 SandboxClaim 解析、paused/running/resuming 映射、scale `0/1` patch payload、VolumeSnapshot manifest。
- HTTP handler mock 覆盖 pause/resume/backups/restore 成功与失败路径。

验收命令：

```bash
pnpm --filter @shadowob/cloud test -- apps/cloud/__tests__/infra/runtime-package.test.ts
pnpm --filter @shadowob/cloud test -- apps/cloud/__tests__/clients/kubectl-runtime.test.ts
```

后续需要新增：

- `apps/cloud/__tests__/interfaces/http/cluster-sandbox.test.ts`

### Layer 2：manifest dry-run

目标：在安装 CRD 的集群里用 API server 校验资源结构。

步骤：

1. 准备最小 OpenClaw config，默认 `deployments.backend` 不填。
2. 生成 manifests，确认包含 SandboxTemplate/SandboxClaim。
3. 安装 pinned agent-sandbox CRD/controller。
4. 执行 server-side dry-run：

```bash
kubectl apply --dry-run=server -f <generated-manifests.yaml>
```

验收：

- API server 接受所有 agent-sandbox CR。
- 没有未知字段或 enum 值错误。
- NetworkPolicy、Service、ConfigMap、Secret 同时通过 dry-run。

### Layer 3：本地 kind 集群 smoke

目标：验证本地 Kubernetes 生命周期，不验证真实 gVisor 隔离。

前置：

- 安装 Docker、kind、kubectl、pulumi。
- 使用 pinned agent-sandbox controller。
- kind 环境可临时创建 `RuntimeClass/gvisor` 指向 `runc`，只用于生命周期 smoke。

步骤：

```bash
git clone https://github.com/kubernetes-sigs/agent-sandbox.git /tmp/agent-sandbox-smoke
cd /tmp/agent-sandbox-smoke
git checkout a8de4e57dcc4c523b31e25438afb86869a331d8b
EXTENSIONS=true CONTROLLER_ONLY=true make deploy-kind
kubectl apply -f <runtimeclass-gvisor-runc-alias.yaml>
shadowob-cloud up -f <minimal-openclaw-config.json> --local --skip-provision --pod-shadow-url http://host.docker.internal:3002
shadowob-cloud status -n <namespace> --pods
kubectl get sandboxclaims,sandboxes,pvc,pods,svc -n <namespace>
```

验收：

- SandboxClaim Ready。
- Sandbox/PVC/Pod/Service 都存在。
- PVC Bound。
- Pod Ready。
- `shadowob-cloud status` 能显示 agent-sandbox workload。
- Cloud manifest builder 输出的 `SandboxTemplate` 和 `SandboxClaim` 使用 `extensions.agents.x-k8s.io/v1alpha1`。
- `SandboxClaim.status.sandbox` 为对象引用时，Cloud runtime helper 可以解析 `sandbox.name`。

### Layer 4：pause/resume 状态持久化

目标：证明 pause 删除 Pod 但保留 PVC，resume 后状态仍在。

步骤：

```bash
kubectl exec -n <namespace> <pod> -- sh -lc 'mkdir -p /home/openclaw/.openclaw/shadow && echo ok > /home/openclaw/.openclaw/shadow/verification.txt'
curl -X POST http://127.0.0.1:<cloud-port>/api/deployments/<namespace>/<agent>/pause
kubectl get pods,pvc -n <namespace>
curl -X POST http://127.0.0.1:<cloud-port>/api/deployments/<namespace>/<agent>/resume
kubectl exec -n <namespace> <new-pod> -- cat /home/openclaw/.openclaw/shadow/verification.txt
```

验收：

- pause 后 Pod 删除，PVC 保留。
- resume 后新 Pod Ready。
- `verification.txt` 内容仍为 `ok`。
- paused 时 logs/pods API 返回明确状态，不误报 500。
- Cloud wait helper 不在旧 Pod `Terminating` 时提前返回；pause 等到 Pod absent，resume 等到 Pod `Running` 且 Ready。

### Layer 5：backup/restore

目标：验证 VolumeSnapshot 和后续 restic/kopia 路径。

VolumeSnapshot 路径：

- 在支持 snapshot 的 CSI 集群运行。
- 调用 backup endpoint，确认创建 `VolumeSnapshot`。
- 等待 `status.readyToUse=true` 后标记 succeeded。
- restore 时从 snapshot 创建新 PVC 并 resume Sandbox。

对象归档 fallback 路径：

- 在没有 `snapshot.storage.k8s.io` API 的 kind 集群中调用 backup endpoint，不显式指定 driver。
- API 自动选择 `driver=restic` 并写入 `objectKey`。
- running 状态优先从 OpenClaw Pod 归档 `/home/openclaw/.openclaw`；paused/no-pod 状态通过 helper Pod 挂载 PVC 后归档。
- restore 时先 pause sandbox，再通过 helper Pod 清空并回填 PVC，最后 resume。

标准 restic/kopia 后续路径：

- 配置对象存储 repository secret。
- 创建 backup Job，将 PVC 数据写入对象存储。
- restore Job 回填 PVC。
- retention 清理过期备份。

验收：

- backup 记录状态准确。
- 失败路径有 error message。
- restore 后 OpenClaw state 和 `~/.openclaw/shadow` 文件可读。
- 缺少 VolumeSnapshot API 时不会让用户停在“备份不可用”，而是自动得到可恢复的对象归档备份。
- 同一 namespace 的 pause/resume/backup/restore 并发请求只有一个进入执行，其余请求返回明确 409。
- restore 拒绝历史 deployment instance、active operation 状态和非 `succeeded` 备份。

### Layer 6：产品 E2E

目标：验证用户可见工作流。

路径：

- CLI：`up/status --pods/logs/sandbox pause/sandbox resume/sandbox backup/sandbox restore/down`。
- Dashboard：列表显示状态，详情页能 pause/resume，backup/restore 面板能展示记录。
- Web SaaS：部署状态 `paused/resuming` 可见，按钮调用 SaaS endpoint，任务日志和状态同步。
- 自动 resume：用户 mention agent 后控制面 resume，Ready 后投递消息。
- Mobile：当前 mobile app 没有 Cloud deployment console；本阶段无 mobile UI 入口变更，后续新增 Cloud 管理入口时必须复用同一 API 和状态枚举。

最终 CI：

```bash
docker compose -f docker-compose.ci-tests.yml run --rm ci-tests
```

并追加独立 kind integration job，避免普通单元测试依赖本地 Kubernetes。

## Phase 2 详细任务：接口层和产品化

实施状态（2026-05-11）：

- CLI、Dashboard 命名空间页、Web SaaS API shape、SaaS 备份记录表、TypeScript SDK、Python SDK 已完成第一轮实现。
- Dashboard 详情页当前在本地 router 中会重定向到命名空间页，第二期实现优先落在实际可达的命名空间页。
- SaaS runtime 操作 endpoint 已经可被 UI/SDK 调用；pause/resume 会 patch Sandbox 并等待 Ready，backup/restore 已改为 HTTP `202` 后台任务，避免长时间占用请求。
- Dashboard Backups tab 已新增 Restore 操作，并只对 `succeeded` 且带 snapshot 或 object key 的备份启用；restore 前已有产品级危险确认弹窗，backup/restore 状态通过列表刷新展示。

### CLI

- 新增 `shadowob-cloud sandbox` 命令组。
- 子命令：
  - `sandbox pause <agent> -n <namespace>`
  - `sandbox resume <agent> -n <namespace>`
  - `sandbox backup <agent> -n <namespace> --driver volumeSnapshot`
  - `sandbox restore <agent> -n <namespace> --backup-id <id>`
  - `sandbox status -n <namespace>`
- `status` 命令表格增加 `WORKLOAD`、`STATE`、`SANDBOX`、`STATE PVC`。
- `scale` 命令在 agent-sandbox 后端下只允许 `0/1`，错误文案说明 pause/resume。

### Dashboard

用户目标：

- 一眼看出 agent 是 running、paused、resuming、failed 还是 unknown。
- 在详情页直接 pause/resume。
- 看到 Sandbox name、Service FQDN、state PVC。
- 查看备份列表，触发 VolumeSnapshot backup。
- 在 paused 状态下不把“没有 Pod”误认为部署坏了。

界面更新：

- Deployment list/namespace/detail 增加 runtime state badge。
- Detail header 增加 pause/resume action。
- Info tab 增加 workload kind、sandbox name、service FQDN、state PVC。
- 新增 Backups tab，列出 backup records，支持 create backup。
- Backups tab 对可恢复备份显示 Restore 操作，禁用 pending/running/failed/expired 或缺少 artifact 的记录。
- Backups tab 对失败记录展示后端 error message，避免用户只能看到 failed。
- 运行时操作 toast 显示后端具体失败原因，用户可以直接区分资源忙、状态不允许、备份不可恢复和集群错误。
- Restore 操作必须先弹出危险确认，明确将替换 PVC 并 resume Sandbox。
- Pods empty state 根据 `runtimeState=paused` 显示 paused 文案。
- 窄视口使用备份卡片布局，桌面宽视口使用表格布局；长 PVC 名称和对象路径截断展示并保留 title，避免撑破布局。
- 所有新增 copy 写入 `apps/cloud/packages/ui/src/i18n/en.json` 和 `zh-CN.json`。

### Web SaaS

- SaaS API client 增加 pause/resume/backups/createBackup/restore 方法。
- Server handler 增加对应 endpoint，并接入真实 K8s control plane；backup/restore 以后台任务更新状态和日志。
- `paused` 视为可见、可恢复、可销毁状态；`resuming` 视为 active operation。
- Web SaaS adapter 不再返回 stub，改为调用真实 endpoint。
- 追加 manifest/template 管理 API：`GET /api/cloud-saas/deployments/:id/manifest` 返回来源模板、manifest revision、config hash、template drift；`POST /api/cloud-saas/deployments/:id/template` 将已部署快照保存为可编辑模板；`POST /api/cloud-saas/deployments/:id/redeploy` 支持 `mode=snapshot|template`、`templateSlug`、显式 `configSnapshot` 和声明过的 env override。
- Manifest 反查兼容历史部署：新部署优先使用 runtime manifest metadata；旧部署缺 metadata 时按 config/template 字段推断，并只在 deployment name 或 namespace 确实命中可访问模板时才作为模板来源，避免误标。
- TypeScript SDK、Python SDK、Web SaaS adapter 和网站 API 文档已同步 manifest/template/redeploy 方法。

### Backup / Restore

- VolumeSnapshot backup 创建后轮询 `VolumeSnapshot.status.readyToUse`。
- restore 需要创建 PVC-from-snapshot，并把 SandboxClaim/Sandbox 指向恢复后的 PVC。
- 无 VolumeSnapshot API 时，SaaS 先用对象归档 fallback 保障可用性。
- 标准 restic/kopia 仍需要单独配置 repository secret、backup Job、restore Job 和 retention。

### Auto Pause / Resume

- 写入 `lastActiveAt`。
- idle scanner 根据 `agents[].sandbox.lifecycle.idleSeconds` 执行 pause。
- Shadow server 收到 HTTP/WS mention、agent heartbeat、usage snapshot、app gateway join/broadcast 或 app proxy 请求时调用统一 auto-resume helper，Ready 后由 runner catch-up 逻辑继续投递或重放消息。
- 公开 app proxy 入口只对显式配置的 `cloudAutoResume.enabled`、`cloudAutoResumeUserIds`、`cloudAutoResumeBuddyUserIds` 或嵌套 `cloudDeployment/cloud` target 生效；开启后可从 hidden channel bot members 推断目标。已认证的 app gateway 和 app-proxy websocket 也会走同一推断路径，避免公开访问无门槛唤醒运行时。

### UI 产品功能规划

信息架构：

- List：面向运维扫描，显示 namespace、agent、runtime state、workload kind、ready、age。
- Detail：面向单 agent 运维，提供状态、操作、Pod/logs/config/env/backups/info。
- Namespace：面向一组 agent 管理，提供聚合 ready count、paused count、cost、selected agent 操作。

状态文案：

- Running：agent 正在运行。
- Paused：Pod 已释放，状态卷保留。
- Resuming：正在重建 Pod。
- Failed：需要查看日志或重新部署。
- Unknown：控制面无法确认状态。

操作规则：

- Running 显示 Pause、Backup。
- Paused 显示 Resume、Restore。
- Resuming 禁用 Pause/Resume，显示 loading。
- Deployment 后端隐藏 Sandbox metadata 和 backup 操作。
- Backup/Restore 进行中显示 phase 与最近更新时间；按钮禁用原因必须可见，避免用户误以为 UI 卡死。
- Paused 的 pods/logs empty state 必须明确说明 Pod 已释放、PVC 仍保留，并提供 Resume 主操作。
- App Center 的 URL app 配置可开启 Cloud auto-resume，并在 iframe 首屏展示 runtime starting 状态，避免用户把 cold resume 误判为应用挂掉。
- Namespace Info 增加 “Template & Manifest” 面板：展示 template slug、manifest revision、config hash、template updated time 和 drift 状态；支持按已部署快照重新部署、按最新模板重新部署、保存可编辑模板、保存模板并重新部署。
- Namespace Environment 增加解释区：区分 deployment override、global fallback、redeploy 生效边界；CookieJar 导入作为浏览器会话入口，避免用户把环境变量理解成无上下文的 key/value 表。

风险提示：

- Pause 说明会中断当前 agent 进程，但保留状态。
- Backup 说明会自动选择 CSI Snapshot 或对象归档；CSI Snapshot 仍依赖集群 CSI snapshot 组件。
- Restore 说明会从备份恢复状态卷，可能覆盖当前状态。

### CookieJar / Browser Session 规划

调研结论：

- 主格式采用 Playwright `storageState` JSON，因为官方文档明确它可复用 cookies、localStorage、IndexedDB 等认证状态：https://playwright.dev/docs/auth。
- 兼容导入 Netscape `cookies.txt`，作为浏览器扩展、curl、yt-dlp 等生态常见导出格式；格式说明参考 https://everything.curl.dev/http/cookies/fileformat.html。
- Node 侧 cookie 解析可引入 `tough-cookie`（RFC6265 CookieJar，BSD-3-Clause）：https://github.com/salesforce/tough-cookie。当前前端导入先做轻量规范化，不在服务端解析 Cookie 语义。
- 交互式远端登录后续可以接 Browserless OSS Docker / Playwright endpoint（https://docs.browserless.io/enterprise/open-source）或 noVNC（https://github.com/novnc/noVNC）。第一阶段不保存用户账号密码，只导入用户主动导出的会话状态。

已落地：

- `agent-browser` 插件新增敏感字段 `AGENT_BROWSER_STORAGE_STATE_JSON`。
- Deployment 环境变量页新增 CookieJar 导入弹窗，支持 Playwright storageState JSON、JSON cookie array 和 Netscape cookies.txt，保存为加密的 deployment-scoped env。
- 导入结果只展示 cookie/origin 数量，不回显 cookie value。
- 已用 in-app browser 验证当前部署页：弹窗可打开，粘贴 storageState JSON 后能即时显示解析格式、cookie 数和 origin 数。

后续生产化：

- Runner/Agent Browser CLI 需要约定读取 `AGENT_BROWSER_STORAGE_STATE_JSON` 并写入临时 storageState 文件，避免把大 JSON 直接暴露给子进程日志。
- 增加服务端 CookieJar 校验和大小上限，限制 domain 数、cookie 数、总字节数，并在审计日志中只记录摘要。
- 远端浏览器/VNC 登录入口需要独立会话隔离、短期访问 token、屏幕录制/审计开关，以及一键清除 CookieJar。
