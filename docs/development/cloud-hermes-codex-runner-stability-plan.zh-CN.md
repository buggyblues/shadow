# Cloud Hermes / Codex Runner 稳定性修复方案

日期：2026-06-27

状态：Implemented in code, pending image build and rollout

## 背景

线上云 Buddy `buddy-cloud-hermes-5b2b08f9e769/codex-er-hao-ji` 出现 Codex CLI 登录、安装和 Hermes gateway 重启问题。用户侧反馈包含：

- `codex login` 浏览器 OAuth 在无 GUI 环境超时。
- `codex login --device-auth` 可完成登录，但重启后再次出现 `401 Unauthorized`。
- 手动全局安装 `@openai/codex` 后出现 `codex: command not found`、npm `ENOTEMPTY` 和 `.codex-*` 临时目录残留。
- Hermes gateway 在 `16:34:05` 收到 `SIGTERM` 并重启。

本次诊断目标是区分 Cloud 调度/资源问题、Hermes runner 问题和 Codex CLI 临时安装问题，并给出修复方案。

## 线上诊断结论

诊断对象：

- Kubernetes context: `default`
- Namespace: `buddy-cloud-hermes-5b2b08f9e769`
- Pod: `codex-er-hao-ji`
- Runtime label: `hermes`
- Image: `ghcr.io/buggyblues/hermes-runner:sha-a8c1ad311f1d`
- Node: `shadow-worker-2`

关键证据：

- Pod events 显示 `hermes` 容器被 liveness probe 重启：
  - `Liveness probe failed: Get "http://10.42.2.19:3100/live": context deadline exceeded`
  - `Container hermes failed liveness probe, will be restarted`
- 容器上一轮状态为 `exitCode=0 reason=Completed`，说明是 kubelet 发送 `SIGTERM` 后 entrypoint 优雅退出，不是进程崩溃或 `OOMKilled`。
- Hermes 日志在 `16:34:05` 记录：`Shutdown context: signal=SIGTERM ... loadavg_1m=12.01`。
- `shadow-worker-2` 只有约 `1.6Gi` 内存，当前 memory requests 已达约 `97%`，memory limits 超卖约 `388%`。
- 当前 `hermes` 容器实时内存约 `247Mi`，没有持续高内存；更像是节点瞬时资源压力或 kubelet/API watch 抖动导致 probe 超时。
- agent-sandbox controller 在同一窗口附近出现 Kubernetes watch 断流：`http2: client connection lost`。
- Pod 已挂载 state PVC：`shadow-runner-state-codex-er-hao-ji`，容量 `5Gi`；现行契约中 PVC 挂载到 `/home/shadow`，Hermes runtime state 位于 `/home/shadow/.hermes`。

Codex 相关证据：

- 该 Buddy 的 Cloud runtime 实际是 `hermes`，Pod 名称中的 `codex` 只是 agent id/name，不表示使用 Cloud `runtime: codex`。
- 线上旧 Hermes runner 镜像不会内置 `@openai/codex`；当时容器里的 `codex-cli 0.142.2` 是运行时手动 `npm install -g` 安装出来的。
- 本次修复后，新 Hermes runner 仍不预装 Codex；它通过持久化 home 和 npm/pip/apt 安装约定兼容用户自行安装 Codex。
- `/home/shadow/.codex/auth.json` 当前不存在。
- `/usr/local/lib/node_modules` 和 `/tmp/npm-cache` 不在 Hermes state PVC 的设计边界内，容器重建或运行时清理后都不可靠。

## 根因拆解

### 1. Hermes gateway 被过于敏感的 probe 重启

Cloud 当前默认 probe 位于 `apps/cloud/src/infra/constants.ts`：

- liveness: `/live`，`periodSeconds=15`，未设置 `timeoutSeconds`，Kubernetes 默认 `1s`
- readiness: `/ready`，`periodSeconds=1`，未设置 `timeoutSeconds`，Kubernetes 默认 `1s`
- startup: `/live`，`periodSeconds=2`，未设置 `timeoutSeconds`，Kubernetes 默认 `1s`

当小规格 worker 出现高 load、API watch 断流或短时调度抖动时，1 秒 HTTP probe 很容易误判。Hermes entrypoint 的 `/live` 是 Node HTTP server，如果 Node event loop 或容器网络短暂卡住，kubelet 会重启容器。

### 2. 默认资源配置不适合 1.6Gi worker

Cloud 默认资源位于 `apps/cloud/src/infra/constants.ts`：

```ts
requests: { cpu: '250m', memory: '512Mi' }
limits: { cpu: '2000m', memory: '2Gi' }
```

在 1.6Gi worker 上，单个 Hermes 容器的 memory limit 已超过节点可分配内存。当前 `shadow-worker-2` 同时运行多个 `512Mi request / 2Gi limit` Buddy，导致 requests 接近打满、limits 严重超卖。Codex 登录、npm 安装、浏览器启动等瞬时重操作会放大探针误杀概率。

### 3. Hermes runner 与 Codex CLI 职责边界混淆

`hermes` runtime 的目标进程是：

```text
hermes gateway -> ShadowOB Hermes platform plugin
```

Cloud 的 `codex` runtime 才是：

```text
cc-connect -> Codex CLI
```

新的边界规则是：Hermes 可以操作用户安装的 Codex CLI，但 runner 镜像不预装 Codex，也不为某个工具单独开持久化特例。

- `runtime: hermes` 仍然由 `hermes gateway` 和 ShadowOB Hermes plugin 驱动。
- `runtime: codex` 仍然由 `cc-connect -> Codex CLI` 驱动。
- Hermes 中如果出现 `codex` 二进制，它应来自用户态安装路径，而不是 Hermes image 预装。
- `/home/shadow` 是持久区；任何工具写入 home 下的 dotdir、XDG config/cache/data/state、npm/pip 用户态安装和 Shadow 用户态 apt root 都随 state PVC 保留。

因此旧镜像里的 `401 Unauthorized`、`codex: command not found` 和 npm `.codex-*` 残留不是 Hermes gateway 的直接 bug，而是“运行时安装没有落到持久化 home 契约内”的副作用。

## 修复目标

- Hermes gateway 不应因为 1 秒短暂 probe timeout 被误杀。
- 小规格 worker 不应承载超出节点能力的 Hermes/Codex 类 Buddy。
- Codex 主 runtime 通过正式 `runtime: codex` 暴露；Hermes 只保证用户安装的 Codex CLI 能随持久化 home 保留。
- OAuth/API auth 状态边界清晰：可持久化的放 PVC，敏感长期凭据放 Secret，不把临时登录当作部署状态。

## 短期止血

1. 将 `codex-er-hao-ji` 迁移到至少 `4Gi` 内存的 worker，或降低同节点 Buddy 数量。
2. 对 Hermes 类 Buddy 临时提高资源 request，避免调度到 1.6Gi worker：

```json
{
  "resources": {
    "requests": { "cpu": "250m", "memory": "768Mi" },
    "limits": { "cpu": "2000m", "memory": "2Gi" }
  }
}
```

3. 重新构建并 rollout 新 Hermes runner 镜像；rollout 后 `npm install -g @openai/codex` 会写入持久化 `~/.local`。
4. rollout 前若必须使用 Codex CLI，优先新建 `runtime: codex` Buddy；旧 Hermes 镜像内的手工安装只作为一次性运维动作。

## 代码改造方案

### P0：放宽 probes，避免误杀

已修改 `apps/cloud/src/infra/constants.ts`：

- liveness 增加 `timeoutSeconds: 5`。
- readiness 增加 `timeoutSeconds: 5`，`failureThreshold` 保持 3 或提升到 5。
- startup 增加 `timeoutSeconds: 5`。

当前目标：

```ts
export const LIVENESS_PROBE = {
  httpGet: { path: '/live', port: HEALTH_PORT },
  initialDelaySeconds: 30,
  periodSeconds: 15,
  timeoutSeconds: 5,
  failureThreshold: 5,
} as const

export const READINESS_PROBE = {
  httpGet: { path: '/ready', port: HEALTH_PORT },
  initialDelaySeconds: 1,
  periodSeconds: 2,
  timeoutSeconds: 5,
  failureThreshold: 5,
} as const

export const STARTUP_PROBE = {
  httpGet: { path: '/live', port: HEALTH_PORT },
  initialDelaySeconds: 1,
  periodSeconds: 2,
  timeoutSeconds: 5,
  failureThreshold: 150,
} as const
```

验收：

- 生成 manifest 中三个 probe 均包含 `timeoutSeconds`。
- Hermes gateway 在高 load 下 `/live` 短暂慢响应不会触发重启。
- Readiness 仍能在 gateway 未 ready 时摘流。

### P0：增加 Hermes/Codex 调度保护

已为 Hermes、Codex 等重 runner 增加更保守的资源策略：

- `runtime=hermes`、`runtime=codex` 默认资源提升到 `requests.memory=768Mi`，用户显式配置仍可覆盖。
- 对 `runtime=hermes`、`runtime=codex` 注入 soft node affinity，优先选择 `shadowob.com/runner-class in (large, xlarge, compute)`。
- 同时注入 soft pod anti-affinity，尽量避免 Hermes/Codex 类 runner 扎堆在同一 node。
- agent-sandbox backend 仍保留 `shadowob.com/sandbox-ready=true` nodeSelector。

实现位置：

- `apps/cloud/src/infra/agent-pod.ts`：根据 runtime 注入默认资源、持久化挂载和调度约束。
- `apps/cloud/src/config/schema/agent.schema.ts`：补充 runtime resource defaults 文档。

验收：

- 新部署的 Hermes/Codex Buddy 不再默认扎堆到 1.6Gi worker。
- `kubectl describe node` 中 memory requests 不应长期超过 85%。

### P1：修正重启后工具不可用

已将 runner home 纳入 state PVC，并约定清楚持久区/临时区：

- 所有 runner pod 将 state PVC 挂载到 `/home/shadow`，整个 runner home 为持久区。
- 持久区包含 runtime state（如 `~/.hermes`、`~/.cc-connect`、`~/.openclaw`）、工具 dotdir（如用户安装 Codex 后产生的 `~/.codex`）、`~/.local`、`~/.cache`、`~/.config`、`~/.local/share`、`~/.local/state` 和 `~/.shadow-tools`。
- 临时区是 `/tmp`、`/workspace/.agents` 和 runner 日志目录；这些目录可以随容器重启或重建丢失。
- 注入 `PATH=/home/shadow/.local/bin:...`、`NPM_CONFIG_PREFIX=/home/shadow/.local`、`npm_config_cache=/home/shadow/.cache/npm`、`PIP_CACHE_DIR=/home/shadow/.cache/pip`、`PIP_BREAK_SYSTEM_PACKAGES=1`、`PYTHONUSERBASE=/home/shadow/.local` 以及 XDG env（`XDG_CONFIG_HOME`、`XDG_CACHE_HOME`、`XDG_DATA_HOME`、`XDG_STATE_HOME`）。
- 注入 `SHADOWOB_RUNNER_PERSISTENT_DIRS`、`SHADOWOB_RUNNER_EPHEMERAL_DIRS` 和 `SHADOWOB_RUNNER_TEMP_DIR`，便于用户、工具和排查脚本直接判断目录语义。
- 所有 phase-1 runner 镜像增加非 root apt shim：`apt update` / `apt install <packages>` 会下载 deb、解包到 `~/.shadow-tools/apt/root`，并在 `~/.local/bin` 生成命令 wrapper。
- `PATH`、`PYTHONPATH`、`NODE_PATH` 等冒号分隔环境变量在最终 Pod env 去重时会合并，插件增加自己的 bin path 不会覆盖掉持久化 `~/.local/bin`。
- 新增静态 contract smoke：扫描所有 runner Dockerfile 和 `container.ts`，防止某个镜像漏掉 persistent install contract，或重新引入 Codex/Claude/OpenCode 这类工具专项持久化 mount。

边界限制：

- npm/pip/工具 auth/用户态 apt 工具在 pod/container 重启后可恢复，因为它们落在持久化 home 内。
- apt shim 适合 CLI 工具类包；需要 systemd、内核能力、系统级配置写入或复杂服务安装的包仍应通过自定义镜像或 runtime asset manifest 声明。
- 长期敏感凭据仍不应靠交互式登录状态承载；生产可复现部署应优先使用 Secret 管理。

验收：

- `npm install -g <tool>` 安装到 `~/.local`，重启后命令仍在 PATH。
- `pip install --user <tool>` 或 pip 的用户态安装结果落在 `~/.local`，重启后仍在 PATH。
- 任一 phase-1 runner 中 `apt install <tool>` 生成的 wrapper 位于 `~/.local/bin`，重启后仍可调用。
- 用户安装 Codex 后，`codex login --device-auth` 产生的 `~/.codex` 状态随 state PVC 保留。

本轮机制巡检发现并补齐的问题点：

- 初版只在 Hermes/Codex image 中放入 apt shim，但 `container.ts` 已对所有 runner 注入 apt 持久化环境，存在“声明支持但镜像缺入口”的漂移风险；现已补齐 OpenClaw/Claude/OpenCode。
- Claude/OpenCode/Codex 旧镜像没有统一预装 `python3-pip`，无法满足 pip 用户态安装的基础要求；现已统一安装 `python-is-python3`、`python3`、`python3-pip`、`python3-venv`。
- Dockerfile 本地默认环境和 K8s Pod 注入环境不完全一致，`docker run` 复现可能走 `/tmp/npm-cache`；现已统一到 persistent home。
- 插件 PATH 可能在最终 env 去重时覆盖 base PATH；现已在 `dedupeEnvVars` 合并 path-like env。
- `/home/shadow` 挂 PVC 会遮住镜像 build 阶段写入 home 的内容；因此必须由 entrypoint 从 `/etc/*` 或 `/opt/*` materialize 必需配置，不能依赖 Dockerfile 预写 home。

### P1：明确 Hermes 与 Codex runtime 边界

产品和模板层需要明确：

- 如果用户想要一个以 Codex 为主进程的 Buddy，应部署 `runtime: codex`。
- Hermes `/codex-runtime` 是 Hermes 自身能力开关，不等于 Cloud Codex runner。
- Hermes runner 允许调用用户安装到 PATH 的 `codex` 二进制，但这是普通本地工具 path，不是 cc-connect session path。
- 部署失败和日志提示中应将 agent id 与 runtime 分开显示，避免 `codex-er-hao-ji` 被误认为 Codex runtime。

改动点：

- Cloud UI runtime 选择文案。
- website Cloud/Buddy 文档。
- Hermes slash command 说明。
- runner 文档：`apps/cloud/images/RUNNERS.md` 与 `apps/cloud/images/hermes-runner/RUNNER.md`。

验收：

- UI 和文档中能清楚区分 `Hermes Agent` 与 `Codex (OpenAI)`。
- 默认推荐使用 `runtime: codex` 承载 Codex 主进程，同时说明 Hermes 中用户态安装 Codex CLI 的兼容边界。

### P1：Hermes 兼容 Codex 安装

Hermes Buddy 不预装 Codex CLI，但要确保用户安装 Codex 后不会因重启丢失：

- `npm install -g @openai/codex` 写入 `~/.local`，该目录位于持久化 home 内。
- npm cache 写入 `~/.cache/npm`，不再使用普通 `/tmp`。
- Codex 默认 `~/.codex` auth/config 状态自然落在持久化 home 内，不需要为 Codex 单独开 volume mount。
- Cloud 安全策略中明确 ChatGPT OAuth 与 API key auth 的支持边界。

验收：

- 新 Hermes image 中不预装 `codex`。
- 用户安装 `@openai/codex` 后，Pod 重启仍能通过 PATH 找到 `codex`。
- 用户登录后，Pod 重启仍保留 `~/.codex` 状态或通过 Secret 可恢复。
- 不再出现 npm `.codex-*` 残留导致重装失败。

### P1：健康检查与主进程解耦增强

当前 Hermes entrypoint 的 `/live` 与 Node event loop 共用。如果 Hermes 工具调用导致 Node 事件循环被拖慢，probe 仍可能误判。

已完成改造：

- `/live` 只表示 entrypoint 进程活着，保持轻量。
- `/ready` 才检查 Hermes ready file。
- 对 health server 增加 event loop lag、ready 时间和子进程退出记录，但不因 lag 直接失败 liveness。
- SIGTERM/SIGINT shutdown 时 `/live` 返回 shutting down。

相关文件：

- `apps/cloud/images/hermes-runner/entrypoint.mjs`
- `apps/cloud/images/cc-connect-runner/entrypoint.mjs`

## 运维与容量建议

### 节点规格

Hermes/Codex 类 Buddy 推荐节点：

- 最低：2 vCPU / 4Gi memory。
- 推荐：4 vCPU / 8Gi memory，尤其是会运行浏览器、npm、Codex/Claude CLI 或多工具链的 Buddy。
- 开启 swap 可作为缓冲，但不应替代 request/limit 和调度隔离。

### 告警

新增或补齐告警：

- Node memory requests > 85%。
- Node `Ready=False` 或 `NodeNotReady` 事件。
- Pod `reason=Unhealthy` 且 message 包含 liveness probe failed。
- Agent container restart count 增长。
- Hermes log 中出现 `Shutdown context: signal=SIGTERM`。
- `loadavg_1m` 高于 CPU 核数 2 倍。

### 日志排查命令

```bash
kubectl get pod -n <ns> <pod> -o jsonpath='{range .status.containerStatuses[*]}{.name} restart={.restartCount} last={.lastState}{"\n"}{end}'
kubectl describe pod -n <ns> <pod> | awk '/Events:/{flag=1} flag {print}'
kubectl logs -n <ns> <pod> -c hermes --previous --tail=200 --timestamps
kubectl describe node <node> | grep -E 'MemoryPressure|DiskPressure|Allocated resources' -A20
kubectl top pod -n <ns> <pod> --containers
kubectl top node
```

敏感信息处理：

- 日志中 JWT、Shadow token、OpenAI key 必须脱敏。
- 不要把完整 `auth.json`、Secret 或 OAuth URL 贴入 issue。

## 测试计划

### 单元/快照测试

- 更新 `apps/cloud/src/infra` 的 manifest 生成测试，断言 probe `timeoutSeconds`。
- 为 runtime resource defaults 增加测试，覆盖 Hermes/Codex 默认值和用户 override。
- 若新增 Codex PVC/Secret 支持，补充 runtime package smoke test，确认 ConfigMap 不泄漏 auth。

### 集成测试

- 在 1.6Gi worker 环境部署 Hermes Buddy，模拟高 load，确认不会因一次 1 秒超时被重启。
- 在 4Gi worker 环境运行 Codex 登录/安装等重任务，确认 liveness 稳定。
- Pod 重启后检查：
  - `/home/shadow/.hermes` 状态保留。
- 用户在新 Hermes image 中安装 Codex 后，`/home/shadow/.codex` 或 auth 恢复策略生效。

### 回归验证

```bash
pnpm --filter @shadowob/cloud test -- --runInBand
pnpm --filter @shadowob/cloud typecheck
pnpm check:security-pr
```

如果只改 docs，可不运行上述测试；实现代码改造时必须运行。

## 发布与回滚

发布步骤：

1. 合并 probe timeout 和资源/调度保护。
2. 构建并发布 Cloud 镜像。
3. 重新部署 Cloud 控制面。
4. 对受影响 Buddy 触发 rollout 或 pause/resume，确认 manifest 生效。
5. 观察 24 小时：restart count、NodeNotReady、liveness failure、Hermes SIGTERM 日志。

回滚：

- probe timeout 改动可直接回滚 Cloud 镜像。
- 调度保护若导致部署失败，可临时通过 agent-level `resources` 和 `scheduling` override 放行。
- 若 Hermes 内用户安装 Codex 的路径引入问题，应保留 `runtime: codex` 作为推荐路径，并可临时禁用 Hermes 中的安装入口或相关指导。

## 最终建议

短期优先修 probe、节点容量和镜像 rollout；中期把 Hermes 与 Codex runtime 的产品边界讲清楚；长期维护通用 runner home 持久化契约，而不是为每个工具不断增加专用挂载。
