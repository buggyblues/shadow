# Shadow Cloud SaaS 完整部署指南

> 适用范围：在当前 monorepo 中部署一套可用的 Shadow Cloud SaaS 环境，包含 `server`、`web`、`cloud-worker` 以及依赖的 PostgreSQL / Redis / MinIO，并让 Cloud 部署能力真正连到 Kubernetes 集群。

## 1. 这套服务包含什么

最小可用组合如下：

- `postgres`：主业务数据库
- `redis`：缓存 / 队列辅助
- `minio`：对象存储
- `server`：主 API 服务，暴露 `/api/*` 与 `/api/cloud-saas/*`
- `web`：用户前端，包含嵌入式 Cloud SaaS UI
- `admin`：管理后台（可选，但建议一起起）
- `cloud-worker`：真正执行 K8s 部署 / 销毁 / 日志任务的后台 worker

如果只启动 `server + web`，页面可以打开，但 Cloud SaaS 的部署、销毁、日志、用量统计都不会完整工作，因为实际执行链条在 `cloud-worker`。

## 2. 部署前需要准备什么

### 2.1 必需基础设施

1. **Docker / Docker Compose**
   - 本仓库默认通过 `docker compose` 起服务。
2. **一个可访问的 Kubernetes 集群**
   - 可以是本机开发集群，也可以是远端集群。
   - `server` 和 `cloud-worker` 需要能读取 kubeconfig。
3. **可用的 kubeconfig**
   - 本地常见路径：`~/.kube/config`
   - 如果 kubeconfig 里 API Server 是 `127.0.0.1` / `localhost`，容器内通常无法直接访问，需要设置 `KUBECONFIG_LOOPBACK_HOST`。
4. **对象存储**
   - 开发环境可直接用仓库自带的 MinIO。
5. **数据库**
   - 开发环境可直接用仓库自带的 PostgreSQL。

### 2.2 建议准备

- **公网域名 / 反向代理**（生产环境）
- **Stripe**（如果要走真实充值）
- **Google / GitHub OAuth 凭据**（如果要启用外部登录）
- **Pulumi backend + passphrase**（生产云部署建议配置）

## 3. 必填环境变量

优先参考根目录 `.env.example`。建议复制为项目根 `.env`：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `KMS_MASTER_KEY`
- `KUBECONFIG_HOST_PATH`
- `KUBECONFIG`
- `KUBECONFIG_B64`
- `KUBECONFIG_CONTEXT`（可选）
- `KUBECONFIG_LOOPBACK_HOST`
- `SHADOW_AGENT_SERVER_URL`
- `PULUMI_CONFIG_PASSPHRASE`（生产建议必填）
- `OAUTH_BASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

### 3.1 一份开发环境可用的最小示例

```env
DATABASE_URL=postgresql://shadow:shadow@localhost:5432/shadow
REDIS_URL=redis://localhost:16379
JWT_SECRET=replace-me-with-a-long-random-string
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=shadow
OAUTH_BASE_URL=http://localhost:3000
ADMIN_EMAIL=admin@shadowob.app
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
KMS_MASTER_KEY=replace-me-with-64-hex-chars
KUBECONFIG_HOST_PATH=/Users/yourname/.kube/config
KUBECONFIG=/root/.kube/config
KUBECONFIG_B64=<base64-encoded-kubeconfig>
KUBECONFIG_LOOPBACK_HOST=host.lima.internal
SHADOW_AGENT_SERVER_URL=http://host.lima.internal:3002
PULUMI_CONFIG_PASSPHRASE=replace-me-too
```

### 3.2 kubeconfig 相关注意事项

- `KUBECONFIG_HOST_PATH` 是 **宿主机路径**，会被挂载进 `server` / `cloud-worker` 容器。
- `KUBECONFIG` 是 **容器内路径**，默认 `/root/.kube/config`。
- `SHADOW_SERVER_URL` 是 **`cloud-worker` 做 Shadow provisioning 时访问主服务的地址**。
   - 在 docker-compose 本地开发里，通常应是 `http://server:3002`。
   - 不建议在这里填 `http://localhost:3002`，因为那会让 `cloud-worker` 容器把自己当成 Shadow Server。
- `SHADOW_AGENT_SERVER_URL` 是 **部署到 Kubernetes 里的 agent pod 访问 Shadow Server 的地址**。
   - 它通常需要是 **从集群 / node / pod 视角可达的地址**，而不是 docker-compose service name。
   - Rancher Desktop / Lima 本地常见可用值是 `http://host.lima.internal:3002`。
- `KUBECONFIG_B64` 是 **传给模板 / agent runtime 的 base64 kubeconfig**。
   - 这和 `KUBECONFIG_HOST_PATH` / `KUBECONFIG` 不是一回事。
   - 前者解决的是 `server` / `cloud-worker` 如何访问集群。
   - 后者解决的是模板里的 agent（例如使用 `kubernetes` plugin 的 OpenClaw agent）如何在容器内访问集群。
   - 如果缺了它，部署可能会在模板解析阶段直接报：`Environment variable KUBECONFIG_B64 is not set`。
- 如果你的本地 K8s 发行版需要从容器访问宿主机回环地址：
  - Rancher Desktop / Lima 常见：`host.lima.internal`
  - Colima 常见：`host.lima.internal` 或平台自定义 host
- 如果集群本身就是远端 API Server，不需要 loopback 改写时，可以保持默认或留空。

## 4. 推荐启动方式（本仓库开发 / 验证）

在项目根目录：

1. 复制环境变量模板并填写：
   - 根目录 `.env`
2. 确保你的 kubeconfig 可以在宿主机执行：
   - `kubectl get ns`
3. 启动基础服务和 Cloud 相关服务：
   - `postgres`
   - `server`
   - `web`
   - `cloud-worker`
   - 如需要管理后台，再加 `admin`

本仓库现成任务对应的核心启动组合是：

- `postgres`
- `server`
- `web`
- `cloud-worker`

如果要直接按 compose 文件理解，关键点在于：

- `server` 暴露 `3002`
- `web` 暴露 `3000`
- `admin` 暴露 `3001`
- `cloud-worker` 复用 `shadow/runtime:dev` 镜像，并执行 `apps/server/dist/cloud-worker.cjs`
- `server` 与 `cloud-worker` 都会挂载 kubeconfig
- `cloud-worker` 还应配置 `SHADOW_AGENT_SERVER_URL`，这样生成到 k8s pod 里的 `SHADOW_SERVER_URL` 才会指向 pod 可访问的地址

## 5. 生产部署最关键的约束

### 5.1 `server` 与 `cloud-worker` 必须共享这几类能力

1. **同一数据库**
   - `server` 写入部署记录与日志索引
   - `cloud-worker` 轮询并消费部署任务
2. **同一套加密主密钥**
   - `KMS_MASTER_KEY` 必须一致，否则无法解密云侧密钥 / kubeconfig
3. **同一可访问的 Kubernetes 凭据**
   - 至少 `cloud-worker` 必须能访问集群
   - `server` 也需要访问集群，因为 SaaS UI 的 pods / pod logs / OpenClaw token usage 统计是它直接查询的
   - 这些查询必须走异步 kubectl 调用，避免日志或 usage 采集阻塞其它 API 请求
4. **一致的 Pulumi backend**
   - 生产建议显式配置 `PULUMI_BACKEND_URL`

### 5.2 不建议省略 `cloud-worker`

省略后会出现这些症状：

- 部署记录停留在 `pending` / `deploying`
- 销毁动作不落地
- Step Deploy 没有有效进度推进
- SaaS 页面只能看到“有记录”，看不到真实运行结果

### 5.3 部署实例与历史尝试

Cloud SaaS 中的稳定部署实例由 **用户 + 集群 + namespace** 唯一确定。`cloud_deployments` 表中的每一行是一次部署 / 重新部署 / 销毁尝试的历史记录，而不是一个新的运行实例。

关键规则：

- 同一个模板可以部署多次，但每个存活实例必须使用不同 namespace。
- 同一个实例可以重新部署来更新或修复；重新部署会创建新的历史尝试，但复用同一 namespace、Pulumi stack、Shadow server/channel/buddy provision state。
- 历史尝试不能单独销毁或重新部署；这些操作只能作用在当前实例上。
- 同一 namespace 同一时间只允许一个部署生命周期操作。API 与 cloud-worker 都会使用 namespace 级 advisory lock，避免 `deploy` 和 `destroy` 同时操作同一个 Pulumi stack。
- 销毁成功后，同实例的可见历史行会统一标记为 `destroyed`，避免旧记录在 UI 中重新变成“当前实例”。
- ShadowOB provision state 会写入 DB 中隐藏的 SaaS runtime metadata；不要只依赖容器内临时目录，否则重启后会丢失 buddy/server/channel 映射。

## 6. 端口与访问入口

默认开发端口：

- Web：`http://localhost:3000`
- Admin：`http://localhost:3001`
- Server API：`http://localhost:3002`
- MinIO API：`http://localhost:9000`
- MinIO Console：`http://localhost:9001`
- PostgreSQL：`localhost:5432`
- Redis：`localhost:16379`

Cloud SaaS UI 是嵌在 Web 里的，不是单独一个独立站点。用户入口通常是主站登录后进入 `/app/cloud`。

## 7. 首次启动后的必做检查

### 7.1 基础健康检查

确认以下服务可用：

- `server` 可以正常连接数据库
- `web` 能访问 `server`
- `cloud-worker` 没有启动即崩溃
- `kubectl` 在容器上下文中可访问目标集群

### 7.2 Cloud SaaS 功能链路检查

至少做一遍完整链路：

1. 登录 Web
2. 打开 Cloud SaaS 页面
3. 选择一个模板并开始部署
   - 如果模板要求填写 `SHADOW_SERVER_URL`，在本地 docker-compose 开发里优先填 `http://server:3002`
4. 确认 Step Deploy 中可以看到实时部署日志
5. 确认 Step Deploy 中可以点击取消
6. 部署完成后进入命名空间页
7. 检查每个 Agent 的：
   - Pods
   - Recent Logs
   - Live Logs
   - Cost / Tokens
8. 进入 Monitoring 页面，确认：
   - 成本单位显示为虾币（而不是美元）
   - Token 总数可见
9. 执行 Destroy，确认对应 namespace / team 不再残留在部署列表里

## 8. 如何验证 openclaw / Buddy 真的工作了

这一步很重要，不能只看 Pod 是 `Running`。

### 8.1 检查 Agent 容器日志

部署完成后，至少确认每个 Agent 容器日志里出现过这类关键信号：

- OpenClaw 启动成功
- Shadow 插件初始化成功
- heartbeat 正常发送
- WebSocket 已连接到社区
- 监听频道成功

### 8.2 检查 Buddy 是否创建成功

验证点：

- 数据库里存在对应 agent / bot user
- Agent 状态为运行中
- 最近 heartbeat 在在线窗口内

### 8.3 检查在线状态

不要只看“部署成功”，还要确认：

- Buddy 在应用里显示在线
- 不是仅创建成功但没有 heartbeat

### 8.4 检查频道应答

最终验收建议：

1. 找到部署模板对应加入的服务器 / 频道
2. 向频道发送一条真实消息
3. 确认日志里看到：
   - 收到 `message:new`
   - reply delivered successfully
4. 确认频道里真的出现 Buddy 回复

### 8.5 检查斜杠命令和交互表单

如果模板安装了 agent pack，还要验证命令链路：

1. 在频道输入 `/`，确认能看到 pack 注册的命令。
2. 确认 agent 的 ConfigMap 中存在插件生成的 `runtime-extensions.json`，且 `artifacts` 内有 `kind: "shadow.slashCommands"` 指向 `agent-pack` 生成的命令索引；交互规则应来自上游 frontmatter、插件通用 rule 或 AskUserQuestion 风格 markdown 推断。
3. 触发带 `interaction` 的命令，例如 `/office-hour`。
4. 确认 Buddy 先发送表单 / 审批组件，而不是直接纯聊天。
5. 提交表单后刷新页面，确认原表单仍显示已提交状态且按钮不可再次点击。
6. 确认后续 Buddy 回复包含命令要求的正文内容，例如问题重构、MVP 范围、路线图，再出现审批动作。

交互提交状态来自服务端 `message_interactive_submissions`，不是浏览器本地缓存。排查时可同时看：

- 源消息的 `metadata.interactive`
- 提交回显消息的 `metadata.interactiveResponse`
- 重新拉取源消息时的 `metadata.interactiveState.response`

### 8.6 检查模型供应商 Profile

Cloud SaaS 的模型配置不应该写死模型名。部署前建议：

1. 打开 Cloud 的模型供应商页面。
2. 新建或编辑 provider profile。
3. 填写 API key、可选 base URL、模型列表和模型 tag。
4. 执行 Test Connection。
5. 在模板部署时确认 `model-provider` 能从 profile 注入运行时 secret 和模型 metadata。

如果没有连接社区 profile，`model-provider` 会退回到环境变量嗅探，这适合本地开发和临时 smoke test。

### 8.7 检查 runner readiness

Buddy 在线状态应该基于 runner 的 ready 状态，而不只是容器启动：

- `/live` 只代表 runner 进程还活着。
- `/ready` 代表 OpenClaw、Shadow WebSocket、频道监听和 agent config 都已就绪。

如果应用里显示 Buddy 离线，按顺序看：

- Pod 是否 OOMKilled 或反复重启
- runner `/ready` 返回的原因
- `SHADOW_AGENT_SERVER_URL` 从 Pod 内是否可达
- agent config 里是否存在目标服务器 / 频道
- slash command registry 是否为空

## 9. 常见问题

### 9.1 Step Deploy 没有日志

优先检查：

- `cloud-worker` 是否在运行
- deploy wizard / 模板里填写的 `SHADOW_SERVER_URL` 是否对 `cloud-worker` 容器可达（本地 compose 通常应为 `http://server:3002`）
- `server` 是否能访问数据库中的部署日志
- `server` 是否能向前端提供 SSE
- 当前登录态是否正常（SaaS 日志流需要鉴权）

如果日志里很快出现类似报错：

- `Environment variable KUBECONFIG_B64 is not set`

说明不是 SSE 本身坏了，而是模板解析阶段缺了运行时环境变量。此时要补齐模板要求的全局 env vars（尤其是 `KUBECONFIG_B64`）。

### 9.2 Pods 能看到，但 Recent Logs / Live Logs 没内容

优先检查：

- `server` 是否能访问集群
- Pod 名称是否能被 SaaS 层正确匹配到 agent
- `kubectl logs` 在 `server` 容器里是否可执行

### 9.3 Destroy 后页面还有残留 Team

优先检查：

- `cloud_deployments` 记录状态是否已变成 `destroyed`
- 是否还有历史失败 / 中断的旧部署记录没有被过滤
- 目标 namespace 是否真的已从集群删除

### 9.4 成本一直不可用

优先检查：

- Agent Pod 的 `openclaw` 容器内是否能执行 `openclaw status --usage --json`
- `SHADOW_AGENT_SERVER_URL` 是否指向 pod 真正能访问到的 Shadow Server 地址
- 当前 provider 是否返回 usage 明细
- Pod 日志里是否出现 OpenClaw usage 相关错误

成本页统计的是 OpenClaw 上报的 Token / USD usage，不是部署时扣除的虾币套餐费用。部署套餐费用只属于钱包交易和部署元数据。

### 9.5 部署历史与重新部署

- `/api/cloud-saas/deployments` 默认只返回每个 namespace 最新的可见部署，供基础设施列表使用。
- `/api/cloud-saas/deployments?includeHistory=1` 返回历史部署记录，供“任务历史”和任务详情使用。
- 重新部署使用 `POST /api/cloud-saas/deployments/:id/redeploy`，会创建新的 `pending` 历史记录，不再次扣费。请求体可传 `{ configSnapshot, envVars }` 更新运行配置；如果新的快照没有包含 provision state，服务端会复用原部署的插件 provision state，避免 Buddy / Shadow server / channel 被重新创建。

## 10. 一套“可交付”环境的验收标准

满足以下几点，才算完整部署成功：

- 用户可以登录 Web 并进入 `/app/cloud`
- 可以成功发起 SaaS 部署
- Deploy step 有实时日志，并且可以取消
- 命名空间页可以查看每个 Agent 的历史 / 实时容器日志
- Monitoring 页显示虾币成本和 Token 总数
- Buddy 被创建并在线
- Buddy 能在目标服务器频道里正常应答
- agent pack 的斜杠命令能补全、触发并按需发送表单 / 审批组件
- 交互表单提交状态由服务端持久化，刷新或换端后仍然锁定
- 模板的模型选择来自 provider profile / selector，而不是硬编码模型名
- Destroy 后 namespace / team 不残留

## 11. 建议的后续自动化

如果这套环境要长期维护，建议补上：

- 部署后自动 smoke test
- 自动验证 Buddy 在线状态
- 自动向测试频道发消息并断言回复
- 自动截图保存：
  - Deploy step
  - Namespace logs
  - Monitoring cost/tokens
  - Destroy 后部署列表

这样下次就不是靠眼缘验收，而是靠证据验收。
