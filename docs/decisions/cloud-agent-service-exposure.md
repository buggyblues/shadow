# Shadow Cloud Agent Service Exposure 与 Server App 挂载方案

> **Status:** Proposed
> **Date:** 2026-06-23
> **Scope:** `apps/cloud`, `apps/server`, Shadow Cloud SaaS, agent runtime
> **Goal:** 将 agent 容器内启动的 HTTP 服务安全挂载到 `shadowob.com` 子域名，并支持 agent 启动符合 Shadow Server App 标准的应用后，通过 `shadowob-cli` 安装到指定 server。

## 背景

Shadow Cloud 里的 agent 会在 Kubernetes 中运行。部分 agent 会临时启动 Web UI、preview server、API mock、文档站、MCP-over-HTTP 服务等，希望外网可以通过类似 `https://<id>.run.shadowob.com` 访问。

更重要的目标是打通 agent 容器和 Shadow server 内的应用系统：agent 可以在容器里生成或启动一个标准 Server App，提供 `/.well-known/shadow-app.json`、`/shadow/server`、`/api/shadow/commands/:commandName` 等标准入口，然后把它安装到某个 Shadow server。用户和 Buddy 看到的是正常的 Server App；Cloud exposure 只是给这个 App 后端提供受控 HTTPS 入口。

当前 Cloud 代码的网络底座相对安全：

- agent 只创建 `ClusterIP` Service，不直接暴露公网。
- NetworkPolicy 已有默认限制 ingress/egress 的框架。
- agent-sandbox / deployment 后端都可以通过 selector 找到 workload pod。

本方案要求保持这些安全属性：**公网入口只能经过 Shadow 管控的 gateway，agent 容器不能直接持有公网 tunnel 凭据，也不能任意指定 upstream URL；安装 Server App 也必须经过 Shadow Server 的 Actor / PolicyService 授权，不能仅凭容器内写文件或持有普通用户 token 完成。**

## 目标

1. 支持模板中静态声明要暴露的服务端口。
2. 支持容器运行时动态声明要暴露的服务端口。
3. 支持 agent 容器内的标准 Server App 通过 CLI 暴露 manifest URL，并安装到目标 server。
4. 暴露出的地址统一挂载到 `*.run.shadowob.com` 或后续配置的专用子域。
5. 所有访问必须经过 Shadow 授权、审计、限流和网关代理。
6. 默认私有访问，public 访问必须显式授权。
7. 动态声明不能提升模板或部署策略授予的权限。
8. `shadowob-cli` 在 agent 容器里的凭据必须是部署范围、短期、最小权限的 agent actor，不能是完整用户 token。

## 非目标

- 不支持 agent 容器直接运行 `cloudflared` / frp / ngrok 并持有 tunnel token。
- 不支持容器声明任意 upstream URL，例如 `http://169.254.169.254` 或内网其他服务。
- 不在第一版支持原始 TCP 暴露。第一版只支持 HTTP / HTTPS 上的 WebSocket / SSE。
- 不把 `shadowob.com` 主站 cookie 或用户 token 透传给 agent 服务。
- 不允许 agent 仅凭动态配置文件把 App 安装到任意 server；安装、授权、默认权限变更都必须走 CLI/API 的显式 PolicyService 校验。

## 推荐架构

```text
Browser / API Client
  -> *.run.shadowob.com
  -> Cloudflare DNS / WAF / Tunnel
  -> cloudflared Deployment
  -> shadow-preview-gateway
  -> exposure registry lookup + PolicyService
  -> per-exposure ClusterIP Service
  -> agent pod targetPort
```

Server App 挂载在这条 exposure 链路之上：

```text
agent container starts Server App on localhost:<port>
  -> shadowob app expose/publish validates policy
  -> exposure gateway serves/reaches public manifest URL
  -> shadowob app preview/install uses that manifest URL
  -> Shadow Server stores installation and grants
  -> Server UI/Buddy commands call the app through the exposure URL
```

### 核心组件

| 组件 | 职责 |
|------|------|
| `shadow-preview-gateway` | 唯一公网代理入口；按 Host 查 exposure；鉴权、限流、审计、header 清洗、反向代理。 |
| `cloudflared` | 集群内出站连接 Cloudflare Tunnel，只把 `*.run.shadowob.com` 转发到 gateway。 |
| `cloud-exposure-controller` | 根据注册表创建/回收 per-exposure Service 和 NetworkPolicy。可内置在 cloud-worker，后续拆独立 controller。 |
| `shadow-exposure-agent` sidecar | 运行在 agent pod 内，读取容器写入的动态 expose 配置文件，验证后向 Shadow 控制面 reconcile。 |
| `cloud_exposures` registry | Shadow Server 持久化 exposure 状态、来源、权限、生命周期。 |
| `shadowob app` CLI | agent 容器内的主要操作面；把 expose、manifest 发现、server app install、默认权限和 Buddy grant 串成可审计流程。 |

## Agent-hosted Server App 目标形态

Agent 启动的应用必须是普通 Shadow Server App，而不是 Cloud 专用协议。最低要求沿用现有标准：

- `/.well-known/shadow-app.json`：`shadow.app/1` manifest。
- `/shadow/server`：server 内嵌页面入口。
- `/assets/...`：静态资源。
- `/api/shadow/commands/:commandName`：Shadow server-origin command 入口。
- 可选 `/api/runtime/...`：iframe launch token 下的 app runtime API。
- 后端使用 `createShadowServerAppRuntime(...)` 或兼容协议处理 command token、outbox 和 launch context。
- 前端优先使用 `createShadowServerAppRuntimeClient()`，避免自己拼 launch header、runtime path、event stream。

这里有两层能力，必须分开授权：

| 层 | 目的 | 授权资源 |
|----|------|----------|
| Exposure layer | 把容器内端口变成 Shadow 管控的 HTTPS URL。 | `cloud_exposure:{id}`、`cloud_deployment:{id}` |
| Server App mount layer | 读取 manifest，把 App 安装/更新到某个 server，并设置默认权限或 Buddy grant。 | `server:{id}`、`server_app_installation:{serverId}:{appKey}` |

推荐 CLI 提供一个组合命令，内部复用现有 `shadowob app preview/install/defaults/grant` 能力：

```sh
shadowob app publish \
  --deployment "$SHADOWOB_CLOUD_DEPLOYMENT_ID" \
  --agent "$SHADOWOB_AGENT_ID" \
  --server <server-id-or-slug> \
  --app-key kanban \
  --port 4201 \
  --manifest-file ./shadow-app.local.json \
  --visibility private \
  --permissions cards.read,cards.create \
  --json
```

组合命令的等价展开：

```sh
publish_json="$(shadowob app expose \
  --deployment "$SHADOWOB_CLOUD_DEPLOYMENT_ID" \
  --agent "$SHADOWOB_AGENT_ID" \
  --app-key kanban \
  --port 4201 \
  --manifest-path /.well-known/shadow-app.json \
  --visibility private \
  --json)"

manifest_url="$(printf '%s' "$publish_json" | jq -r '.manifestUrl')"

shadowob app preview \
  --server <server-id-or-slug> \
  --manifest-url "$manifest_url" \
  --json

shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url "$manifest_url" \
  --json

shadowob app defaults kanban \
  --server <server-id-or-slug> \
  --permissions cards.read,cards.create \
  --json
```

如需给 Buddy 授权，继续使用现有命令：

```sh
shadowob app grant kanban \
  --server <server-id-or-slug> \
  --buddy <buddy-id> \
  --permissions cards.read,cards.update,buddy_inbox:deliver \
  --approval-mode policy \
  --json
```

第一版可以先实现拆分命令；`publish` 作为 CLI 便利封装。这样 Cloud exposure 与 Server App 安装可以独立测试和审计。

### 容器内 CLI 凭据

agent 容器可以使用 `shadowob-cli`，但不能注入完整用户 token。Cloud 控制面应为每个 deployment/agent 下发短期 agent CLI profile，例如：

```env
SHADOWOB_CLI_PROFILE=cloud-agent
SHADOWOB_CLOUD_DEPLOYMENT_ID=dep_...
SHADOWOB_AGENT_ID=builder
```

该 profile 背后的 token 是 `actor.kind = agent`，并绑定：

- `deploymentId`、`agentId`、namespace、pod/service account。
- `allowedServerIds` 或 `allowedServerSlugs`。
- `allowedAppKeys`。
- `allowedPorts`、`maxVisibility`、`maxTtlSeconds`。
- `allowedCliCommands`，例如 `cloud.app.expose`、`cloud.app.publish`、受限 `app.preview`、受限 `app.install`。
- 过期时间和可撤销 token id。

`shadowob app install/defaults/grant` 在普通用户机器上仍可使用完整用户授权；在 agent 容器里调用时，server 必须识别 agent actor，并用 PolicyService 校验它是否被允许管理目标 server 的指定 appKey。OAuth/PAT scope 或 CLI command 白名单不能替代资源授权。

### Manifest URL 与重写

Agent App 可以在容器内只知道本地监听端口，不需要提前知道公网域名。推荐控制面返回：

```json
{
  "exposureId": "exp_...",
  "url": "https://e-01jz-kanban.run.shadowob.com",
  "manifestUrl": "https://e-01jz-kanban.run.shadowob.com/.well-known/shadow-app.json"
}
```

manifest 处理规则：

1. Agent 生成的 manifest 可以使用相对路径，或通过 `SHADOWOB_APP_PUBLIC_BASE_URL` / `SHADOWOB_APP_API_BASE_URL` 读取 gateway 注入的公开 base URL。
2. `shadowob app expose` 可以只暴露原始 manifest；`shadowob app publish` 可以要求控制面先通过 gateway discover，再安装。
3. 更安全的默认方式是由 gateway 提供 synthesized manifest：读取 upstream manifest 后，将 `iframe.entry`、`api.baseUrl`、`iconUrl` 等可相对化字段规范化到 exposure public base URL。
4. 如果 manifest 出现 `localhost`、Pod DNS、ClusterIP、link-local、RFC1918 私网地址或跳转到内网地址，Shadow server discovery 必须拒绝，开发环境只能通过显式 allowlist 放行。
5. manifest URL 必须是 HTTPS，host 必须属于 Shadow 管控的 exposure registry 或管理员 allowlist 域名。

## 再审查后的关键补强

上一版方案解决了“如何安全访问容器内服务”和“如何通过 CLI 安装 Server App”，但长期可用性还缺三件事：

1. **稳定入口**：不能把安装到 server 的 manifest 固定指向一次性的 runtime exposure host，否则 agent 重启、TTL 到期、Deployment pause/destroy 后，已安装 App 会变成坏链接。
2. **代码 release**：容器里临时生成的代码不能只存在当前文件系统里。发布时必须生成不可变 release artifact，记录 checksum、manifest snapshot、构建信息和 source ref。
3. **状态备份**：Server App 的业务数据不能散落在随机路径。必须有标准 state dir / volume contract，并纳入 Cloud 控制台现有 backup/restore 链路。

因此需要把“exposure”升级成“Cloud App Release”的一部分：

```text
Agent workspace
  -> build Server App
  -> create immutable code release artifact
  -> expose active runtime port
  -> install stable manifest URL into Shadow server
  -> bind state PVC + backup policy
  -> controller keeps stable host -> active runtime mapping fresh
```

### App 生命周期等级

| 等级 | 用途 | URL 稳定性 | 数据保障 |
|------|------|------------|----------|
| `preview` | 临时预览、测试报告、dev server。 | 短 TTL，可失效。 | 默认不承诺持久化。 |
| `installed` | 已安装到 server 的 Server App。 | 稳定 host，不随 pod/exposure 变化。 | 必须绑定 code release 和 state policy。 |
| `promoted` | 用户确认长期运行的 App。 | 稳定 host + 自动恢复。 | 强制 scheduled backup、restore 演练、明确保留策略。 |

`shadowob app publish` 默认创建 `installed` release；普通 `shadowob app expose` 仍只创建 `preview` exposure。需要只创建 release 而不安装到 server 时，显式传 `--no-install`。

### 稳定 Host

Server App 安装时不应保存 `https://e-01jz-kanban.run.shadowob.com/...` 这种一次性 exposure host。应保存稳定 host：

```text
https://app-<installation-id>.run.shadowob.com/.well-known/shadow-app.json
```

或：

```text
https://<app-key>-<deployment-id>.apps.run.shadowob.com/.well-known/shadow-app.json
```

稳定 host 指向 `cloud_app_releases.current_exposure_id`。Pod 重启、Service 重建、runtime exposure host 变化时，只更新 registry 映射，不需要重新安装 Server App。若 runtime 暂时不可用，gateway 返回可诊断的 `503 app starting/degraded` 页面，而不是让 manifest URL 静默变成 404。

### 失效风险与处理

Agent 发布应用后过一阵子失效，主要来自这些路径：

| 风险 | 后果 | 处理 |
|------|------|------|
| Runtime exposure TTL 到期 | iframe/API 入口 404/410。 | `installed/promoted` release 不使用普通 TTL；改为 controller lease，随安装状态自动续租。 |
| Agent pod 重启或迁移 | 旧 Service endpoint 失效。 | stable host 绑定 release，controller 重建 per-exposure Service 并更新 `current_exposure_id`。 |
| Deployment pause/auto-pause | App 暂停，用户认为坏了。 | pause 前备份；UI 标记 paused；访问时可触发 resume 或显示恢复按钮。 |
| Deployment destroy | PVC/Service 被删，App 永久不可用。 | destroy 前必须有最新备份或用户确认“删除代码和数据”；安装状态改为 disabled，不保留坏 iframe。 |
| 发布只保存运行中代码 | 容器重建后代码丢失。 | publish 时强制生成 code release artifact；恢复时从 artifact rebuild/run。 |
| App 数据写在临时目录 | 重启后业务状态丢失。 | 强制使用 `SHADOWOB_APP_STATE_DIR` 或声明 `state.paths[]`，并挂载到 persistent state PVC。 |
| Manifest URL/host 变更 | Shadow server 仍引用旧地址。 | Shadow server 保存 stable manifest URL；gateway synthesized manifest 动态指向当前 active runtime。 |
| 健康检查缺失 | 已安装但进程已死。 | publish 等待 health/readiness；controller 定期检查 manifest、iframe、command endpoint。 |

## Cloud App 备份机制

备份必须是一等控制面能力，而不是散落在 publish、update、pause、destroy 流程里的若干补丁。发布、更新、暂停、删除和手动操作只是 **trigger**；真正决定“备什么、怎么备、备到哪里、保留多久、如何验证、如何恢复”的，是统一的 BackupPolicy、BackupSet 和 RestoreJob。

### 设计原则

1. **一个可恢复单元**：用户看到的是一个 Cloud App，所以备份也必须围绕 Cloud App，而不是只围绕 PVC、只围绕源码或只围绕 Server App installation。
2. **组件化备份**：代码、状态、安装元数据、策略、secret references 是不同组件，分别采集、校验、恢复，但属于同一个 BackupSet。
3. **策略驱动**：publish/update/pause/destroy 不直接决定备份细节，只向 BackupController 提交 trigger。BackupController 按 policy 选择 driver、retention、consistency 和验证方式。
4. **默认可恢复**：`installed` App 至少有 code release + metadata snapshot；`promoted` App 必须有 off-cluster state backup 和恢复验证。
5. **不备明文 secrets**：备份中只保存 secret reference、vault key id/version、required secret names；恢复后重新绑定当前有效 secret。
6. **恢复优先于删除**：删除、销毁、覆盖恢复都必须先检查最新可用 BackupSet，或要求用户显式确认放弃数据。

### 备份对象模型

```text
CloudAppInstance
  appKey
  serverId
  installationId
  stableHost
  currentReleaseId
  stateBindings[]
  backupPolicyId

CloudAppRelease
  immutable code artifact
  manifest snapshot
  build/source provenance
  runtime contract

BackupPolicy
  triggers
  components
  consistency
  destinations
  retention
  verification

BackupSet
  point-in-time recovery unit
  metadata component
  release component
  state components
  integrity manifest

RestoreJob
  target app/deployment
  restore mode
  selected BackupSet
  pre-restore safety BackupSet
  verification result
```

`cloud_deployment_backups` 继续作为 **state component** 的底层执行记录，复用现有 VolumeSnapshot、对象归档、GitHub backup 和 restore runtime。新增的 Cloud App 备份表只负责把多个组件组织成一个一致的 BackupSet。

### 标准目录与状态声明

Agent-hosted Server App 必须把代码、构建产物和业务状态分层：

```text
/workspace/server-apps/<appKey>/source      # 源码，可由 agent 生成或从 Git clone
/workspace/server-apps/<appKey>/dist        # 构建产物，可重新生成
/state/server-apps/<appKey>/data            # 业务状态，必须纳入 state component
/state/server-apps/<appKey>/uploads         # App 私有上传文件，必须纳入 state component
/run/shadow/exposure                        # 低信任动态 expose desired/status
```

运行时注入：

```env
SHADOWOB_APP_KEY=kanban
SHADOWOB_APP_SOURCE_DIR=/workspace/server-apps/kanban/source
SHADOWOB_APP_STATE_DIR=/state/server-apps/kanban/data
SHADOWOB_APP_RELEASE_DIR=/workspace/server-apps/kanban/dist
SHADOWOB_APP_PUBLIC_BASE_URL=https://app-sai-....run.shadowob.com
SHADOWOB_APP_API_BASE_URL=https://app-sai-....run.shadowob.com
```

Server App manifest 或 publish request 需要声明持久状态：

```json
{
  "backup": {
    "state": {
      "paths": ["/state/server-apps/kanban/data", "/state/server-apps/kanban/uploads"],
      "externalStores": []
    },
    "consistency": "crash-consistent",
    "policy": "installed-standard"
  }
}
```

规则：

- durable data 只能写入 `SHADOWOB_APP_STATE_DIR` 或 policy 允许的 `state.paths[]`。
- `/tmp`、容器镜像层、`emptyDir`、checkout scratch 目录都视为可丢失。
- `state.paths[]` 必须落在控制面分配的 state root 内，不能通过 symlink 跳出。
- 使用外部数据库、外部对象存储或第三方 SaaS 的 App 必须声明 `externalStores[]` 和 backup adapter；没有 adapter 只能标记为 `partially-protected`，不能进入 `promoted`。

### BackupPolicy

BackupPolicy 是可继承的控制面对象。模板、部署、App publish request 可以选择 policy，但最终必须经 Cloud policy allowlist 合并：

```json
{
  "id": "installed-standard",
  "components": ["metadata", "release", "state"],
  "triggers": {
    "onPublish": true,
    "beforeUpdate": true,
    "beforePause": "if-stateful",
    "beforeDestroy": "require-fresh-or-confirm",
    "schedule": "0 3 * * *",
    "manual": true
  },
  "rpoSeconds": 86400,
  "rtoSeconds": 1800,
  "destinations": [
    { "kind": "cluster-snapshot", "driver": "volumeSnapshot" },
    { "kind": "object-archive", "driver": "restic", "encrypted": true }
  ],
  "retention": {
    "daily": 14,
    "weekly": 8,
    "monthly": 6
  },
  "verification": {
    "checksum": true,
    "manifestSchema": true,
    "restoreDrill": "weekly"
  }
}
```

默认策略：

| App 等级 | 默认 policy | 说明 |
|----------|-------------|------|
| `preview` | `none` | 不自动备份；用户可手动生成一次 BackupSet。 |
| `installed` | `installed-standard` | 发布、更新、删除保护都有 BackupSet；off-cluster backup 可按部署策略开启。 |
| `promoted` | `promoted-protected` | 必须有定时 off-cluster backup、RPO/RTO、恢复演练和告警。 |

### BackupSet 组件

一个 BackupSet 是控制台展示、审计、恢复选择的最小单位：

| 组件 | 内容 | 存储位置 | 说明 |
|------|------|----------|------|
| `metadata` | CloudAppInstance、installation、stable host、manifest snapshot、权限/grants、backup policy snapshot。 | Shadow DB + 私有对象存储 JSON。 | 恢复时重建控制面关系。 |
| `release` | 源码/构建输入/lockfile/manifest、artifact checksum、source provenance、可选 SBOM。 | 私有对象存储，content-addressed。 | release 不可变；BackupSet 引用或复制 release artifact。 |
| `state` | `state.paths[]` 所在 PVC 或外部 store export。 | `cloud_deployment_backups` 记录的 snapshot/archive/GitHub artifact。 | 支持多 state component。 |
| `integrity` | 组件 checksum、大小、driver、createdAt、policy、schema version。 | Shadow DB + 私有对象存储 JSON。 | 恢复前必须校验。 |

备份状态必须区分：

- `succeeded`：所有 required components 成功。
- `partial`：optional component 失败，required component 成功；不能作为 promoted 的合规备份。
- `failed`：任一 required component 失败。
- `expired`：超过 retention，artifact 已删除或不可恢复。
- `verified`：通过 checksum 和恢复演练。

### 一致性模型

不同 App 对一致性的要求不同，必须显式记录：

| 模式 | 含义 | 适用 |
|------|------|------|
| `crash-consistent` | 类似进程突然断电时的文件系统状态。 | 简单文件状态、可自动修复的数据。 |
| `hooked` | backup 前调用 App hook flush/lock，backup 后 unlock。 | SQLite、队列、需要 flush 的文件状态。 |
| `transactional` | App 或外部 store 提供事务级 snapshot/export。 | 数据库、强一致业务状态。 |

建议 Server App runtime 支持内部 hook，不通过公网暴露：

```json
{
  "backup": {
    "hooks": {
      "preparePath": "/api/shadow/backup/prepare",
      "commitPath": "/api/shadow/backup/commit",
      "restorePreparePath": "/api/shadow/restore/prepare",
      "restoreVerifyPath": "/api/shadow/restore/verify"
    }
  }
}
```

Gateway 只允许 Shadow control-plane service identity 调这些 hook。Hook token 的 audience 必须绑定 `cloud-app-backup`，不能复用用户 JWT、PAT 或 agent CLI token。

### 执行流程

BackupController 处理所有 trigger：

```text
trigger received
  -> resolve CloudAppInstance + BackupPolicy
  -> acquire app backup lock
  -> create BackupSet(status=running)
  -> snapshot metadata component
  -> ensure/reuse immutable release component
  -> run consistency prepare hook if configured
  -> run state component backups through configured drivers
  -> run consistency commit hook
  -> write integrity manifest
  -> verify required components
  -> mark BackupSet succeeded/partial/failed
  -> emit audit + console event
```

实现要求：

- 每个 CloudAppInstance 同一时间只能有一个 backup/restore job。
- BackupSet 必须幂等；同一 trigger retry 不能生成冲突 release 或重复 grants。
- required component 失败时，流程失败且生命周期 trigger 必须停住。例如 destroy 不得继续删除 state。
- 运行中的 backup 过久未更新，由现有 stale operation reconcile 统一标记失败。
- backup helper pod 使用最小权限 service account，只能访问目标 PVC、目标 object prefix 和必要 K8s API。

### Driver 选择

| Driver | 角色 | 选择逻辑 |
|--------|------|----------|
| `volumeSnapshot` | 同集群快速回滚。 | PVC 由支持 snapshot 的 CSI StorageClass 提供，且存在 matching `VolumeSnapshotClass`。 |
| `object-archive` / `restic` | 跨集群、跨存储恢复。 | 默认 promoted 必须启用；所有 artifact envelope encryption。 |
| `git` | 用户可审计的加密归档。 | 适合小型文本状态和源码镜像；不作为大二进制状态默认 driver。 |
| external adapter | 外部数据库/SaaS。 | App 声明 `externalStores[]` 时必须提供；否则标记 partial protection。 |

Kubernetes `VolumeSnapshot` 是快速恢复手段，不应被当成唯一灾备；它依赖 CSI driver、CRD、snapshot controller 和底层云厂商持久性。对象归档才是跨集群/跨存储的默认安全网。

### RestoreJob

恢复同样是一等 job，不能让控制台直接“覆盖 PVC”：

| 模式 | 行为 | 用途 |
|------|------|------|
| `in-place` | 对当前 App 做 pre-restore safety BackupSet，然后恢复所选 BackupSet。 | 回滚线上 App。 |
| `clone` | 恢复到新 appKey/stable host，不影响当前安装。 | 验证备份、复制环境。 |
| `disaster-recovery` | 在新 deployment/cluster 上恢复 metadata、release、state，再重新绑定 installation。 | 集群或命名空间损坏。 |

恢复顺序：

```text
select BackupSet
  -> verify integrity manifest
  -> create pre-restore safety BackupSet for in-place mode
  -> pause runtime / drain traffic
  -> restore release component
  -> restore state components
  -> restore metadata + installation policy
  -> rebind stable host
  -> run restore verify hook
  -> health check manifest/iframe/command endpoints
  -> cut traffic back to restored runtime
```

失败处理：

- restore 失败后保留 pre-restore safety BackupSet。
- stable host 不切换到未验证 runtime。
- installation grants 不在 restore 中自动扩大权限；只能恢复到 snapshot 中已有权限或当前更严格策略。

### 控制台体验

Cloud Console 不只给一个“备份按钮”，而是展示恢复能力：

- `Protection`：policy、RPO/RTO、last successful BackupSet、last verified BackupSet、next run。
- `Components`：metadata/release/state/external adapters 每个组件的状态。
- `Destinations`：snapshot、object archive、GitHub、external store export。
- `Actions`：backup now、restore in-place、restore as clone、run restore drill、download metadata、change policy、delete backup。
- `Warnings`：RPO breached、no off-cluster backup、latest backup partial、restore drill stale、PVC-only protection、external store unprotected。

控制台里的“随时备份”应创建一个 manual BackupSet；“随时恢复”应创建 RestoreJob。用户不直接操作底层 VolumeSnapshot 或 tarball。

### 建议数据模型

```sql
cloud_app_instances
  id
  deployment_id
  agent_id
  server_id
  app_key
  installation_id
  stable_host
  current_release_id
  current_exposure_id
  backup_policy_id
  protection_status     -- none | pvc-only | snapshot | off-cluster | verified
  status                -- active | degraded | paused | disabled | deleted
  created_at
  updated_at
```

```sql
cloud_app_releases
  id
  app_instance_id
  release_version
  manifest_snapshot_json
  source_kind
  source_ref
  code_artifact_key
  code_sha256
  build_metadata_json
  status                -- building | active | superseded | failed
  created_by_actor
  created_at
```

```sql
cloud_backup_policies
  id
  owner_type            -- system | user | deployment | app
  owner_id
  policy_json
  created_at
  updated_at
```

```sql
cloud_backup_sets
  id
  app_instance_id
  policy_id
  trigger_type          -- publish | update | pause | destroy | schedule | manual | restore-safety
  status                -- running | succeeded | partial | failed | expired | verified
  consistency_mode
  integrity_object_key
  error
  expires_at
  verified_at
  created_by_actor
  created_at
  updated_at
```

```sql
cloud_backup_components
  id
  backup_set_id
  component_type        -- metadata | release | state | external | integrity
  required
  driver
  deployment_backup_id
  object_key
  checksum
  status
  error
  created_at
  updated_at
```

```sql
cloud_restore_jobs
  id
  app_instance_id
  backup_set_id
  mode                  -- in-place | clone | disaster-recovery
  target_json
  safety_backup_set_id
  status                -- running | succeeded | failed
  phase
  error
  created_by_actor
  created_at
  updated_at
```

## 暴露来源

### 1. 模板静态声明

模板可以声明固定服务：

```json
{
  "deployments": {
    "agents": [
      {
        "id": "builder",
        "expose": [
          {
            "id": "web",
            "port": 3000,
            "protocol": "http",
            "visibility": "private",
            "auth": "shadow",
            "ttlSeconds": 86400,
            "displayName": "Builder Preview"
          }
        ]
      }
    ]
  }
}
```

静态声明适合模板作者明确知道的端口，例如固定 Web UI。静态声明进入模板 review 范围，`public` 级别必须经过模板策略或管理员授权。

### 2. 容器内动态声明

动态声明用于运行时才知道的服务，例如 dev server 随任务启动、临时 demo、测试报告站点。

动态声明有两种入口：

- **desired-state 文件**：低信任入口。Agent 主容器只写文件，sidecar 读取后 reconcile，适合普通 HTTP preview。
- **`shadowob-cli`**：显式操作入口。Agent 主容器使用短期 agent CLI profile 调用 `shadowob app expose/publish/status/unpublish`，适合 Server App 发布、安装和授权编排。

desired-state 文件路径：

```text
/run/shadow/exposure/desired.json
```

运行时注入环境变量：

```env
SHADOWOB_EXPOSURE_CONFIG=/run/shadow/exposure/desired.json
SHADOWOB_EXPOSURE_STATUS=/run/shadow/exposure/status.json
```

推荐写入方式：先写临时文件，再原子 rename，避免 sidecar 读到半截 JSON。

```sh
cat > "$SHADOWOB_EXPOSURE_CONFIG.tmp" <<'JSON'
{
  "version": 1,
  "exposures": [
    {
      "id": "preview",
      "kind": "http_service",
      "port": 3000,
      "protocol": "http",
      "visibility": "private",
      "auth": "shadow",
      "ttlSeconds": 3600,
      "displayName": "Preview Server",
      "healthPath": "/"
    }
  ]
}
JSON
mv "$SHADOWOB_EXPOSURE_CONFIG.tmp" "$SHADOWOB_EXPOSURE_CONFIG"
```

删除动态 exposure：从 `desired.json` 中移除对应条目。sidecar reconcile 后会关闭注册表状态，并由 controller 回收 Service / NetworkPolicy。

如果动态声明的是 Server App，它只表达“这个端口上运行了标准 Server App”，不等价于安装到 server：

```json
{
  "version": 1,
  "exposures": [
    {
      "id": "kanban",
      "kind": "server_app",
      "port": 4201,
      "protocol": "http",
      "visibility": "private",
      "auth": "shadow",
      "ttlSeconds": 86400,
      "displayName": "Kanban",
      "serverApp": {
        "appKey": "kanban",
        "manifestPath": "/.well-known/shadow-app.json",
        "iframePath": "/shadow/server",
        "apiBasePath": "/",
        "sourcePath": "/workspace/server-apps/kanban/source",
        "statePaths": ["/state/server-apps/kanban/data"]
      }
    }
  ]
}
```

sidecar 可以把它暴露成 manifest URL，并写入 `status.json`。安装到哪个 server、授予哪些权限，仍建议由 `shadowob app publish --server ...` 或显式的 `shadowob app install/defaults/grant` 完成。

## 动态声明协议

### `desired.json` schema

```ts
interface ExposureDesiredState {
  version: 1
  exposures: ExposureRequest[]
}

interface ExposureRequest {
  /**
   * Agent-local stable id. 只能包含 [a-z0-9-]，长度 1-32。
   * 它不是最终 hostname，不能用于抢占域名。
   */
  id: string
  /** 普通 HTTP 服务或标准 Shadow Server App。默认 http_service。 */
  kind?: 'http_service' | 'server_app'
  /** Container/pod 内监听端口。 */
  port: number
  /** 第一版仅允许 http。 */
  protocol: 'http'
  /** 不能超过部署策略允许的 maxVisibility。默认 private。 */
  visibility?: 'private' | 'signed' | 'public'
  /** 默认 shadow。public visibility 下仍可要求 shadow。 */
  auth?: 'shadow' | 'signed' | 'none'
  /** 动态 exposure TTL。不能超过策略上限。 */
  ttlSeconds?: number
  displayName?: string
  description?: string
  healthPath?: string
  pathPrefix?: string
  /** kind=server_app 时必填。 */
  serverApp?: ServerAppExposure
  tags?: string[]
}

interface ServerAppExposure {
  /** 必须与 manifest.appKey 一致。 */
  appKey: string
  /** 容器内 manifest path，默认 /.well-known/shadow-app.json。 */
  manifestPath?: string
  /** 容器内 iframe entry path，默认读取 manifest。 */
  iframePath?: string
  /** 容器内 API base path，默认读取 manifest。 */
  apiBasePath?: string
  /** 源码目录提示；只作为 publish/release 的输入，不代表已备份。 */
  sourcePath?: string
  /** 持久状态目录提示；必须在策略允许的 state root 内。 */
  statePaths?: string[]
  /** 只允许声明期望，不允许仅凭文件安装到 server。 */
  requestedServerId?: string
}
```

### `status.json` schema

sidecar 将控制面的接受/拒绝结果写回给主容器读取：

```json
{
  "version": 1,
  "updatedAt": "2026-06-23T05:20:00.000Z",
  "exposures": [
    {
      "id": "preview",
      "status": "active",
      "url": "https://e-01jz-preview.run.shadowob.com",
      "manifestUrl": null,
      "reason": null,
      "expiresAt": "2026-06-23T06:20:00.000Z"
    },
    {
      "id": "kanban",
      "status": "active",
      "url": "https://e-01jz-kanban.run.shadowob.com",
      "manifestUrl": "https://e-01jz-kanban.run.shadowob.com/.well-known/shadow-app.json",
      "serverApp": {
        "appKey": "kanban",
        "releaseId": null,
        "stableUrl": null,
        "installed": false,
        "installReason": "run shadowob app publish --server <server>"
      },
      "reason": null,
      "expiresAt": "2026-06-24T05:20:00.000Z"
    }
  ]
}
```

`status` 可取值：

- `pending`：已提交，等待控制面创建资源。
- `active`：可访问。
- `denied`：违反策略或授权不足。
- `error`：控制面或 K8s 资源创建失败。
- `expired`：TTL 到期。
- `closing`：正在回收。

## 动态声明安全边界

动态 expose 必须受部署策略约束。建议新增 `dynamicExposePolicy`，来源可以是模板 review 结果、用户部署偏好、管理员策略或集群默认策略：

```json
{
  "dynamicExposePolicy": {
    "enabled": true,
    "allowedKinds": ["http_service", "server_app"],
    "allowedPorts": [{ "from": 3000, "to": 3999 }],
    "deniedPorts": [22, 80, 443, 2375, 2379, 2380, 3100],
    "maxExposures": 5,
    "maxVisibility": "private",
    "allowedAuthModes": ["shadow", "signed"],
    "allowedServerAppKeys": ["kanban", "skills-*"],
    "allowedServerIds": ["srv_..."],
    "allowedStateRoots": ["/state/server-apps"],
    "maxStatePaths": 8,
    "maxTtlSeconds": 86400,
    "requireListeningPort": true,
    "requireHealthCheck": false,
    "allowPublicRequiresUserApproval": true,
    "allowFileRequestedInstall": false
  }
}
```

规则：

1. `enabled=false` 时 sidecar 忽略 `desired.json`，并写入 denied status。
2. 动态声明只能暴露端口号，不能声明 upstream host、Service name、namespace 或 DNS。
3. 端口必须在 `allowedPorts` 内，且不在 `deniedPorts` 内。
4. `visibility` 不能高于 `maxVisibility`。
5. `public` 必须二次确认：模板 review 或用户在 UI 中批准；容器写文件不能单方面变成 public。
6. `kind=server_app` 时，`serverApp.appKey` 必须匹配 `allowedServerAppKeys`，并与实际 manifest 的 `appKey` 一致。
7. 文件里的 `requestedServerId` 只作为提示；`allowFileRequestedInstall=false` 时不得触发安装。即使开启，也必须再检查 agent actor 对目标 server 的 `manage server_app_installation` 权限。
8. `serverApp.statePaths[]` 必须落在 `allowedStateRoots` 内；路径只能作为备份声明，不能让容器选择任意 host path/PVC。
9. `ttlSeconds` 必须有上限；动态 exposure 默认短 TTL。
10. `desired.json` 最大 64 KiB，最多 16 个条目，JSON 深度和字符串长度有限制。
11. sidecar 读取文件时必须拒绝 symlink，使用 realpath/lstat 确认路径仍在 `/run/shadow/exposure`。
12. JSON parse 失败时不立即关闭已有 active exposure，保留上一份有效 desired state，并把错误写入 `status.json`。
13. sidecar 定期 heartbeat。heartbeat 断开超过 grace period 后，控制面自动过期 runtime source exposure。

## 控制面 API

`shadow-exposure-agent` sidecar 使用 sidecar-only token 调用控制面。

### Token

由 cloud-worker 在部署时生成短期、部署范围 token，作为 K8s Secret 只挂载给 sidecar，不挂载给主容器。

Claims：

```json
{
  "aud": "shadow-cloud-exposure-agent",
  "scope": "cloud:exposure:reconcile",
  "deploymentId": "dep_...",
  "namespace": "shadow-cloud-...",
  "agentId": "builder",
  "allowedKinds": ["http_service", "server_app"],
  "allowedServerAppKeys": ["kanban"],
  "allowedServerIds": ["srv_..."],
  "maxVisibility": "private",
  "allowedPorts": [{ "from": 3000, "to": 3999 }],
  "exp": 1782181200
}
```

主容器即使能写 `desired.json`，也拿不到 token；sidecar 负责把不可信文件变成受控 reconcile 请求。

### Reconcile endpoint

```http
POST /api/cloud/exposures/runtime/reconcile
Authorization: Bearer <deployment-scoped-sidecar-token>
Content-Type: application/json
```

Body：

```json
{
  "version": 1,
  "desiredHash": "sha256:...",
  "podName": "builder-...",
  "workloadName": "builder",
  "exposures": [
    {
      "id": "preview",
      "kind": "http_service",
      "port": 3000,
      "protocol": "http",
      "visibility": "private",
      "auth": "shadow",
      "ttlSeconds": 3600,
      "displayName": "Preview Server",
      "healthPath": "/"
    },
    {
      "id": "kanban",
      "kind": "server_app",
      "port": 4201,
      "protocol": "http",
      "visibility": "private",
      "auth": "shadow",
      "ttlSeconds": 86400,
      "displayName": "Kanban",
      "serverApp": {
        "appKey": "kanban",
        "manifestPath": "/.well-known/shadow-app.json"
      }
    }
  ]
}
```

Response：

```json
{
  "ok": true,
  "accepted": [
    {
      "id": "preview",
      "exposureId": "exp_...",
      "host": "e-01jz-preview.run.shadowob.com",
      "url": "https://e-01jz-preview.run.shadowob.com",
      "manifestUrl": null,
      "expiresAt": "2026-06-23T06:20:00.000Z"
    },
    {
      "id": "kanban",
      "exposureId": "exp_...",
      "host": "e-01jz-kanban.run.shadowob.com",
      "url": "https://e-01jz-kanban.run.shadowob.com",
      "manifestUrl": "https://e-01jz-kanban.run.shadowob.com/.well-known/shadow-app.json",
      "serverApp": {
        "appKey": "kanban",
        "installed": false
      },
      "expiresAt": "2026-06-24T05:20:00.000Z"
    }
  ],
  "denied": []
}
```

### CLI publish endpoint

`shadowob app publish` 可以调用一个更高层 API，把 exposure 和 Server App mount 作为一个事务编排：

```http
POST /api/cloud/exposures/server-apps/publish
Authorization: Bearer <deployment-scoped-agent-cli-token>
Content-Type: application/json
```

Body：

```json
{
  "deploymentId": "dep_...",
  "agentId": "builder",
  "serverId": "srv_...",
  "appKey": "kanban",
  "port": 4201,
  "manifestPath": "/.well-known/shadow-app.json",
  "sourcePath": "/workspace/server-apps/kanban/source",
  "statePaths": ["/state/server-apps/kanban/data"],
  "releaseMode": "installed",
  "visibility": "private",
  "install": true,
  "backup": {
    "policyId": "installed-standard",
    "policyOverrides": {
      "rpoSeconds": 86400,
      "retention": { "daily": 14 }
    }
  },
  "defaultPermissions": ["cards.read", "cards.create"],
  "buddyGrants": [
    {
      "buddyAgentId": "buddy_...",
      "permissions": ["cards.read", "cards.update", "buddy_inbox:deliver"],
      "approvalMode": "policy"
    }
  ]
}
```

处理顺序：

1. 认证为 `actor.kind=agent`，加载 deployment-scoped policy。
2. 校验 `deploymentId`、`agentId`、`serverId`、`appKey`、port、visibility 都在 token/policy 允许范围内。
3. 校验 `sourcePath` 和 `statePaths` 都在允许根目录内，且没有 symlink 跳出。
4. 创建 immutable code release artifact，写入 checksum 和 manifest snapshot。
5. 创建或复用 `installed/promoted` release 的 stable host。
6. 创建或复用 active runtime exposure，并把 stable host 指向当前 exposure。
7. 通过 stable manifest URL discover manifest，并执行 SSRF/private URL 检查和 manifest schema 校验。
8. 调用现有 Server App install service，使用同一个 agent actor 触发 `manage server_app_installation` policy。
9. 设置默认权限和 Buddy grant，每一步都写审计事件。
10. 注册 CloudAppInstance 的 BackupPolicy，并向 BackupController 提交 `publish` trigger。
11. 返回 app instance、release、exposure、manifest、installation、BackupSet、grant 结果；任一步失败都不隐藏错误，必要时保留 private exposure 供调试，但不创建半授权 grant。

## 数据模型

建议新增表：

```sql
cloud_exposures
  id
  deployment_id
  user_id
  namespace
  agent_id
  source              -- template | runtime | manual
  local_id            -- template/runtime declared id
  exposure_kind       -- http_service | server_app
  release_id
  host
  stable_host
  protocol
  target_port
  service_name
  public_base_url
  manifest_url
  stable_manifest_url
  server_id
  server_app_key
  manifest_path
  installation_id
  visibility          -- private | signed | public
  auth_mode           -- shadow | signed | none
  status              -- pending | active | denied | error | expired | closed
  policy_snapshot_json
  desired_hash
  last_heartbeat_at
  expires_at
  created_by_actor
  created_at
  updated_at
  closed_at
  error_message
```

```sql
cloud_exposure_events
  id
  exposure_id
  server_id
  server_app_key
  actor_kind
  actor_id
  event_type          -- request | accept | deny | activate | access | publish | install | grant | expire | close
  ip_hash
  user_agent_hash
  metadata_json
  created_at
```

访问日志不记录完整 query/body。必要时只记录 request id、status、字节数、耗时、actor、exposure id。

## K8s 资源模型

不要修改现有 health Service。每个 exposure 创建独立 Service：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: exp-<short-id>
  namespace: <agent-namespace>
  labels:
    app: shadowob-cloud
    shadowob.cloud/exposure: "true"
    shadowob.cloud/exposure-id: <exposure-id>
spec:
  type: ClusterIP
  selector:
    app: shadowob-cloud
    agent: <workload-name>
  ports:
    - name: http
      port: 80
      targetPort: <requested-port>
      protocol: TCP
```

为每个 exposure 创建补充 NetworkPolicy，允许 gateway 访问目标端口：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: exp-<short-id>-ingress
  namespace: <agent-namespace>
spec:
  podSelector:
    matchLabels:
      app: shadowob-cloud
      agent: <workload-name>
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              shadowob.cloud/ingress: "true"
          podSelector:
            matchLabels:
              app: shadow-preview-gateway
      ports:
        - protocol: TCP
          port: <requested-port>
```

如果 gateway namespace 配置了 egress deny-all，还需要创建 gateway egress allow policy。

生产环境要求 CNI 支持 NetworkPolicy；不支持时禁止 public exposure，private exposure 也应给出高风险告警。

## Gateway 行为

`shadow-preview-gateway` 必须把所有输入当作不可信。

### 路由

1. 从 `Host` 解析 exposure host。
2. 查缓存或 DB：host -> active exposure。
3. 验证 deployment 未销毁、未暂停、未过期。
4. 构造 upstream：`http://<serviceName>.<namespace>.svc.cluster.local:80`。
5. 严禁从 query/header/body 读取 upstream。

Server App exposure 的特殊路由：

- `GET /.well-known/shadow-app.json` 可以返回 upstream manifest，或返回 gateway synthesized manifest。
- `GET /shadow/server` 是 iframe entry；Shadow host 会追加 `shadow_launch` query 参数。
- `/api/runtime/...` 允许 iframe 使用 launch token 调 App backend。
- `/api/shadow/commands/:commandName` 只接受 Shadow server-origin command 调用，不接受浏览器伪造调用。
- 其他路径按普通 App 静态资源/API 代理，但仍受 exposure policy、限流和 header 清洗约束。

### 授权

访问 action：

- actor kind：`user | pat | oauth | service_token | server_app_launch | server_app_command | agent | anonymous`
- resource：`cloud_exposure:{id}`，关联 `cloud_deployment:{deploymentId}`
- action：`read`
- data class：默认 `server-private`
- required capability：`cloud.exposure.read`

Visibility 策略：

| visibility | 行为 |
|------------|------|
| `private` | 普通 preview 必须登录 Shadow，PolicyService 校验 deployment/exposure read 权限；Server App iframe/runtime 可用短期 launch token；Server App command 可用 server-origin command token。 |
| `signed` | 允许短期签名链接；默认只允许 `GET/HEAD`；写方法仍要求 `private`。 |
| `public` | 允许匿名访问，但必须经过 WAF、限流、审计和模板/用户显式批准。 |

Server App 相关授权：

- `shadow_launch` token 只证明某个用户/上下文被 Shadow server 授权启动指定 server app。Gateway 可先做轻量校验，App backend 仍必须用 SDK runtime introspect/verify。
- `/api/runtime/...` 可以转发 launch token，但不能转发用户 JWT。
- `/api/shadow/commands/...` 可以转发 Shadow server-origin command token；gateway 必须确认请求来自 Shadow server 服务身份或可信 mTLS/service token，不能让公网浏览器直接带任意 bearer token 调 command。
- 安装、默认权限、Buddy grant 属于 `manage server_app_installation`，不属于 `cloud_exposure.read`，必须在 Server App service 中再次校验。

### Header / Cookie 清洗

请求转发前：

- 删除客户端传入的 `X-Shadow-*`、`X-Forwarded-*`、`CF-*` 中不应透传的内部头。
- 不把 Shadow 主站 `Authorization`、session cookie、OAuth token 透传给 agent。
- 只在 allowlist 路径转发 Server App launch token 或 command token；令牌必须有可识别 audience/type，且不能是普通用户 JWT/PAT。
- 如需要身份上下文，gateway 生成短期签名 header：
  - `X-Shadow-Exposure-Id`
  - `X-Shadow-Actor-Id`
  - `X-Shadow-Actor-Kind`
  - `X-Shadow-Context-Signature`

响应返回前：

- 删除或重写 `Set-Cookie` 中的 Shadow 保留前缀，例如 `__Host-shadow-*`、`shadow_session`。
- 对 Server App 子域，只允许 host-only、SameSite、Secure cookie；不得设置 `Domain=.shadowob.com`。
- 强制加安全响应头：`X-Content-Type-Options`, `Referrer-Policy`。
- 对普通 preview iframe 使用独立策略：默认不允许被主站 iframe，除非 exposure 显式声明 preview embedding。
- 对 `kind=server_app` 的 `/shadow/server`，根据 manifest `iframe.allowedOrigins` 生成 CSP `frame-ancestors`，只允许 Shadow app host。

### 限制

- Request header size 上限。
- Request body size 上限，按 exposure policy 配置。
- Upstream connect/read/write timeout。
- WebSocket 最大连接数和 idle timeout。
- 每 exposure / 每 actor / 每 IP hash 限流。
- 响应流量配额，避免被滥用做文件分发。

## Cloudflare 配置

推荐使用专用子域：

- `*.run.shadowob.com`：生产 preview。
- `*.dev-run.shadowob.com`：开发/测试 preview。

Cloudflare Tunnel ingress：

```yaml
ingress:
  - hostname: "*.run.shadowob.com"
    service: http://shadow-preview-gateway.shadow-cloud-ingress.svc.cluster.local:8080
  - service: http_status:404
```

DNS：

- Wildcard CNAME 指向 `<tunnel-uuid>.cfargotunnel.com`。
- Proxy status 开启。

Cloudflare Access：

- 可作为企业私有 preview 的外层保护。
- 不能替代 Shadow PolicyService，因为 Shadow 仍需要按 deployment/exposure 做资源授权。
- 若启用 Access JWT，gateway 必须验证 `Cf-Access-Jwt-Assertion`，不能只信 header 存在。

参考：

- Cloudflare Tunnel outbound-only model: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- Cloudflare Tunnel on Kubernetes: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/
- Cloudflare Tunnel wildcard ingress rules: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/
- Cloudflare wildcard DNS records: https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/
- Cloudflare Access JWT validation: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- Kubernetes Volume Snapshots: https://kubernetes.io/docs/concepts/storage/volume-snapshots/
- Kubernetes Persistent Volumes reclaim policy: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
- Velero file-system backup with Kopia: https://velero.io/docs/main/file-system-backup/
- Velero CSI snapshot support: https://velero.io/docs/main/csi/

## 用户体验

### 模板静态 expose

Deploy Wizard 显示模板声明的 services：

- 名称、端口、可见性、认证方式、TTL。
- Public service 必须显示风险提示并要求用户确认。
- 部署完成后在 Deployment Detail 中显示访问 URL 和 revoke 按钮。

### 动态 expose

Deployment Detail 增加 `Exposed services` 区块：

- Runtime requests：显示容器请求的 desired state。
- Accepted：显示 URL、TTL、访问模式。
- Server Apps：显示 `appKey`、stable manifest URL、安装 server、release version、安装状态、默认权限和 Buddy grants。
- Denied：显示拒绝原因，例如 `port outside allowed range`。
- Actions：copy URL、extend TTL、make private、revoke。

动态 preview 服务的 URL 不保证永久稳定。已安装 Server App 必须显示 stable host；默认重启后由 controller 恢复 stable host 到 active runtime 的映射。

Deployment Detail 还应增加 `Cloud Apps` 区块：

- Release：`appKey`、release version、source ref、code artifact checksum、manifest snapshot。
- Runtime：stable host、active exposure、health、last checked、restart/resume 按钮。
- Durability：state paths、PVC、latest backup、可恢复性等级、下次 scheduled backup。
- Actions：backup now、restore、rollback code、rollback state、download metadata、disable install、delete with data confirmation。

### Agent CLI 工作流

Agent 生成 Server App 前必须能读到标准开发资料。这些资料通过标准 Skill 包注入 runtime：

- Cloud runtime 由 `shadowob` plugin 在 `runtimeExtensions.shadowob.officialSkills` 中声明
  `shadowob` 和 `shadow-server-app`。
- runtime package builder 把完整 Skill package 挂载到目标 runtime 的标准 skill 目录，包括
  `SKILL.md` 和 `references/`。
- 本地 runtime 由 `shadowob-connector` 安装同一组官方 Shadow Skill package。
- 不再通过独立 docs bundle、CLI docs 子命令或 runner docs 环境变量分发开发资料。

当前只把 `integrations/kanban` 和 `integrations/qna` 作为标准实现参考：Kanban 覆盖完整
workflow、Inbox dispatch、OAuth/session 和事件刷新，Q&A 覆盖更小的知识应用、multipart
upload 和 app-owned 持久化。Skill 分发包不得包含这些示例的 `node_modules` 或构建产物；agent
需要示例时读取仓库源码或受控模板，而不是依赖历史 demo。

Agent 在容器里完成标准 Server App 发布的推荐脚本：

```sh
pnpm build
pnpm start --host 0.0.0.0 --port 4201 &

shadowob app publish \
  --deployment "$SHADOWOB_CLOUD_DEPLOYMENT_ID" \
  --agent "$SHADOWOB_AGENT_ID" \
  --server "$SHADOWOB_TARGET_SERVER" \
  --app-key "$SHADOWOB_APP_KEY" \
  --port 4201 \
  --manifest-file ./shadow-app.local.json \
  --source-path /workspace/server-apps/"$SHADOWOB_APP_KEY"/source \
  --state-paths /state/server-apps/"$SHADOWOB_APP_KEY"/data \
  --visibility private \
  --json
```

CLI 输出必须稳定，方便 agent 自动化读取：

```json
{
  "release": {
    "id": "car_...",
    "appKey": "kanban",
    "version": 3,
    "stableUrl": "https://app-sai-....run.shadowob.com",
    "manifestUrl": "https://app-sai-....run.shadowob.com/.well-known/shadow-app.json",
    "codeSha256": "sha256:..."
  },
  "exposure": {
    "id": "exp_...",
    "url": "https://e-01jz-kanban.run.shadowob.com",
    "status": "active"
  },
  "serverApp": {
    "serverId": "srv_...",
    "appKey": "kanban",
    "installed": true,
    "installationId": "sai_..."
  },
  "backup": {
    "status": "queued",
    "backupId": "bkp_..."
  }
}
```

配套命令：

- `shadowob app expose`：只创建/更新 exposure，返回 URL/manifestUrl。
- `shadowob app publish`：创建 code release、stable host、exposure，可选 install/defaults/grants/backup。
- `shadowob app status --app-key <key>`：查询 exposure 与安装状态。
- `shadowob app backup --app-key <key>`：立即备份 code/state/metadata。
- `shadowob app restore --app-key <key> --backup <id>`：恢复 code/state/metadata，可选择恢复到新 appKey。
- `shadowob app unpublish --app-key <key>`：关闭 exposure，可选卸载 server app 或保留安装但标记 unavailable。
- `shadowob app install/defaults/grant/uninstall`：继续作为通用 Server App 管理命令，不只服务 Cloud。

## 生命周期

| 事件 | 行为 |
|------|------|
| Deployment 创建 | 创建静态 exposure；按策略注入 sidecar 和 shared volume。 |
| 容器写入 desired.json | sidecar reconcile；控制面校验；controller 创建 Service/NetworkPolicy。 |
| Agent 运行 `shadowob app expose` | 创建或更新 `kind=server_app` exposure，返回 public base URL 和 manifest URL。 |
| Agent 运行 `shadowob app publish` | 创建 code release 和 stable host；expose 后 discover manifest；安装/更新 server app；设置默认权限和 Buddy grant；按策略备份。 |
| Agent 更新已发布 App | 先创建新 code release 和 pre-update backup；健康检查通过后切换 stable host；失败则保留旧 release。 |
| desired.json 删除条目 | sidecar reconcile close；controller 回收资源。 |
| Agent 运行 `shadowob app unpublish` | 关闭 exposure；根据参数保留或卸载 Server App 安装；写审计记录。 |
| sidecar heartbeat 中断 | grace period 后标记 expired 并回收 runtime exposure。 |
| Deployment pause | 对 installed/promoted App 先备份并标记 paused；stable host 返回 paused/resume 页面；preview exposure 关闭。 |
| Deployment resume | controller 恢复 installed/promoted App runtime；静态 exposure 恢复；preview 等 runtime 重新声明。 |
| Deployment destroy | finalizer 检查最新备份或用户删除确认；关闭 registry，删除 K8s resources；安装状态 disabled 或卸载；审计记录。 |
| TTL 到期 | 只影响 preview exposure；installed/promoted 由 release lease 管理，不走普通 TTL。 |

## 威胁模型与缓解

| 威胁 | 缓解 |
|------|------|
| Agent 试图暴露任意内网地址 | 动态协议只接受 port，不接受 URL/host；gateway upstream 只来自 registry。 |
| Agent 试图绕过授权变 public | visibility 受 `maxVisibility` 和用户/模板审批限制。 |
| Agent 试图安装到未授权 server | `shadowob-cli` 使用 agent actor；Server App install/defaults/grant 必须 PolicyService 校验 server 资源权限和 appKey allowlist。 |
| Agent 用动态 JSON 越权安装 App | desired-state 文件默认只创建 exposure；`allowFileRequestedInstall=false`；安装必须走 CLI/API 授权。 |
| 一次性 exposure 过期导致已安装 App 失效 | Server App 安装使用 stable host；controller 持续维护 stable host 到 active runtime 的映射。 |
| 容器重建导致代码丢失 | publish 前创建 immutable code release artifact；没有 release artifact 不允许 install。 |
| App 状态写入临时目录 | 标准化 `SHADOWOB_APP_STATE_DIR`；promoted App 必须声明 state paths 并纳入 backup policy。 |
| PVC 被删除导致底层卷跟着删除 | Cloud destroy finalizer 要求最新备份或显式删除确认；不能依赖 StorageClass reclaim policy 保护数据。 |
| Backup artifact 泄露 | 对象/GitHub backup 必须加密；secrets 只存 reference；下载/恢复需要 PolicyService 和审计。 |
| Agent 窃取 tunnel token | tunnel token 只存在 ingress namespace 的 `cloudflared`，不进入 agent pod。 |
| Agent CLI token 泄露 | token 短期、绑定 deployment/agent/server/appKey/port，支持撤销；不能调用普通用户 API。 |
| Agent 伪造 Shadow headers | gateway 删除客户端传入的 Shadow 内部 headers，重新签发上下文。 |
| 浏览器伪造 Server App command | `/api/shadow/commands/*` 只接受 Shadow server 服务身份和 server-origin command token；App backend 仍按 SDK runtime 校验。 |
| Manifest 指向内网或 localhost | discovery 使用 SSRF guard，拒绝 private/link-local/cluster DNS/localhost 和危险 redirect。 |
| Manifest appKey 漂移 | `serverApp.appKey`、CLI `--app-key`、manifest `appKey` 必须一致。 |
| 子域污染主站 cookie | preview 使用专用子域；gateway 清洗 `Set-Cookie`；主站使用 host-only `__Host-` cookie。 |
| 动态 JSON 文件攻击 sidecar | 文件大小/深度/条目数限制；拒绝 symlink；parse 错误不破坏已有状态。 |
| 暴露内部 health/control port | policy deniedPorts 默认包含 runtime health、sidecar、Docker/K8s 常见敏感端口。 |
| K8s Service 漂移污染 Pulumi | exposure Service 独立创建，不修改 Pulumi 管理的 health Service。 |
| CNI 不执行 NetworkPolicy | 生产禁止 public exposure；部署前 preflight；UI/CLI 明确告警。 |
| Public endpoint 被滥用 | Cloudflare WAF + gateway rate limit + TTL + quotas + one-click revoke。 |

## 实施阶段

### Phase 1：静态 private exposure

- 新增 config schema：`deployments.agents[].expose[]`。
- 新增 `cloud_exposures` 表。
- 新增 `shadow-preview-gateway`。
- 新增 controller 创建 per-exposure Service / NetworkPolicy。
- Cloudflare Tunnel wildcard 接入 gateway。
- 只支持 `visibility=private`。

### Phase 2：动态 private / signed exposure

- 给支持动态 expose 的 agent pod 注入 `emptyDir`：
  - `/run/shadow/exposure`
- 注入 `shadow-exposure-agent` sidecar。
- sidecar 读取 `desired.json`，调用 reconcile API。
- 支持 `private` 和短期 `signed`。
- UI 展示 runtime accepted/denied 状态。

### Phase 2.5：Agent-hosted Server App publish

- 新增 `kind=server_app` exposure。
- 新增 agent CLI profile/token，actor kind 为 `agent`。
- 新增 `shadowob app expose/status/unpublish`。
- 新增 `cloud_app_releases` 和 `cloud_app_backups`。
- 新增 `shadowob app publish`，组合 code release、stable host、exposure、manifest discover、install、defaults、grant。
- Server App discovery 增加 Shadow exposure manifest allowlist 和 SSRF guard。
- Gateway 支持 synthesized manifest、launch token、server-origin command token 转发规则。

### Phase 2.6：Cloud App backup / restore

- 复用现有 `cloud_deployment_backups` 的 PVC backup/restore。
- 发布成功后自动备份 metadata + code release + state。
- 控制台增加 backup now、restore、rollback、download metadata。
- restore 前强制 safety backup，恢复后重新校验 manifest/appKey/stable host。
- destroy 前增加 data deletion finalizer。

### Phase 3：Public exposure

- 引入用户确认/管理员审批。
- 接入 WAF、全局限流、滥用检测。
- Public 默认短 TTL，强制可 revoke。
- 对模板市场 public exposure 做 review gate。

### Phase 4：高级能力

- 自定义域名。
- 多区域 gateway。
- WebSocket/SSE 连接观测。
- Preview embedding 策略。
- TCP 暴露评估，默认仍不开放。

## 代码落点建议

| 模块 | 建议改动 |
|------|----------|
| `apps/cloud/src/config/schema/*` | 增加 `AgentExposeConfig`、`DynamicExposePolicy`。 |
| `apps/cloud/src/infra/*` | 增加 exposure Service/NetworkPolicy 生成逻辑；不要复用 health Service。 |
| `apps/cloud/src/infra/agent-pod.ts` | 按策略注入 `/run/shadow/exposure` emptyDir 和 `shadow-exposure-agent` sidecar。 |
| `apps/server/src/db/schema/cloud.ts` | 增加 `cloud_exposures`、`cloud_exposure_events`。 |
| `apps/server/src/services/cloud-exposure.service.ts` | 实现 registry、policy、reconcile、lifecycle。 |
| `apps/server/src/handlers/cloud-exposure.handler.ts` | 实现 runtime reconcile、user revoke、signed link、server app publish API。 |
| `apps/server/src/dao/cloud-deployment-backup.dao.ts` | 复用现有 backup records；必要时增加 app release 关联查询。 |
| `apps/server/src/handlers/cloud-saas.handler.ts` | 把 Cloud App backup/restore 接入现有 `/deployments/:id/backups` 和 `/restore` 运行时。 |
| `apps/server/src/services/app-integration.service.ts` | 复用现有 discover/install/defaults/grant；增加 agent actor 资源授权和 exposure manifest allowlist。 |
| `apps/server/src/services/policy.service.ts` | 增加 `cloud_exposure:read/manage`、`server_app_installation:manage` 的 agent actor 授权。 |
| `packages/cli/src/commands/app.ts` | 增加 `app expose/publish/status/backup/restore/unpublish`，并复用现有 app command 语义。 |
| `packages/sdk/src/client.ts` | 增加 Cloud exposure 与 server app publish API client。 |
| `apps/cloud/packages/ui/src/pages/DeploymentNamespacePage.tsx` | 展示 exposed services、Cloud Apps、release、backup、restore、revoke/extend 操作。 |
| `apps/cloud/images/*-runner` | 提供 `shadowob-cli` agent profile 注入、写入 desired.json 的辅助 CLI 或文档示例。 |

## 默认策略建议

开发环境：

- dynamic expose 默认可开，但 `maxVisibility=private`。
- allowedPorts：`3000-3999`, `5173`, `8000-8999`。
- TTL：最长 24 小时。
- `preview` 可无备份；`installed` 默认创建 code release artifact。
- state paths 默认限制在 `/state/server-apps/<appKey>`。

生产 SaaS：

- dynamic expose 默认关闭，只有模板 review 或用户显式开启。
- public exposure 默认关闭。
- 所有 public exposure 必须短 TTL、限流、审计、可 revoke。
- CNI 不支持 NetworkPolicy 时不允许 public exposure。
- `shadowob app publish` 必须创建 code release artifact 和 stable host。
- `installed` 默认 backup on publish 和 backup before update。
- `promoted` 必须配置 scheduled off-cluster backup，推荐保留 14 到 30 天。
- destroy 前必须存在未过期备份或用户显式确认删除代码和状态。

## 结论

支持容器内动态 expose 是可行的，但安全边界必须放在 Shadow 控制面和 preview gateway，而不是放在 agent 容器里。

推荐第一版采用：

1. `*.run.shadowob.com` wildcard Tunnel 到 `shadow-preview-gateway`。
2. 模板静态声明用于稳定服务。
3. `/run/shadow/exposure/desired.json` + `shadow-exposure-agent` sidecar 用于动态服务。
4. `shadowob app publish` 用于 agent 容器内发布标准 Server App，并复用现有 `shadowob app install/defaults/grant` 的安装与授权模型。
5. 已安装 Server App 使用 `cloud_app_releases` stable host，而不是一次性 exposure host。
6. 发布时强制创建 code release artifact；业务状态只写入声明的 state paths，并复用现有 Cloud backup/restore。
7. 动态声明只能在 `dynamicExposePolicy` 授权范围内创建 private/signed exposure，不能单靠文件安装到任意 server。
8. Public exposure 延后到审计、限流、审批和滥用治理完整后再开放。
