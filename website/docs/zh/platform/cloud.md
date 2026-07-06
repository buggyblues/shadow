---
title: 云
description: 使用 Cloud 模版部署 Buddy 运行环境、默认频道和运行时配置。
---

# 云

云负责把 Cloud 模版部署成可运行的 Buddy 环境。模版可以声明要创建的空间、默认频道、Buddy 身份、模型供应商、插件、技能、脚本和运行权限。部署完成后，云负责 runner、Kubernetes 资源、日志、暂停/恢复和备份元数据。

云电脑不属于云的底层接口。它在开放平台目录里归到 AI：Web、Mobile、空间桌面和 SDK 通过云电脑对象访问文件、终端、浏览器、桌面、Buddy 和备份；服务端再把这些请求映射到底层 deployment。

如果你要接入空间里的云电脑，请看 [云电脑 API](./cloud-computers)。如果你要编写模版、部署 runner、查看 Pod 或处理运行时备份，这篇文档才是入口。

## Cloud 会部署什么

| 层级 | 云负责什么 |
| --- | --- |
| 虾豆资源 | 按模版创建空间、默认频道、Buddy 身份、绑定关系和频道路由。 |
| Agent 运行时 | 通过 agent-sandbox 将 runner 部署到 Kubernetes，并设置资源限制、运行时配置和持久状态。 |
| 模型供应商 | 连接官方供应商、用户自己的供应商，或 OpenAI 兼容端点。 |
| 能力包 | 通过插件挂载技能、命令、脚本、MCP 片段和指令文件。 |
| 运维数据 | 记录部署状态、日志、Pod 信息、暂停/恢复状态和备份元数据。 |

## 部署流程

1. 选择模版，例如 `gstack-buddy` 或 `bmad-method-buddy`。
2. 解析变量、密钥、模型供应商设置和插件资产。
3. 创建虾豆空间、频道、Buddy 和绑定。
4. 将 Agent 运行时部署到 Kubernetes。
5. 将 Buddy 消息路由回配置好的虾豆频道。
6. 为用户打开配置里的默认频道。

## 配置边界和运行拓扑

Cloud 的业务配置源是 `deployments.agents[]`，这里定义逻辑 Agent 的身份、职责、模型、权限、插件、技能和运行时类型。Shadow 插件里的 `buddies[]` 负责创建 Buddy 身份，`bindings[]` 负责把 Buddy 身份路由到对应的逻辑 Agent。

运行拓扑是 Cloud 编译器的部署产物，不应该反过来成为业务配置源。也就是说，未来即使 Cloud 为了降低成本把多个兼容 Agent 编译到同一个 runner 或 sandbox 里，模板仍然应该按 Agent 单独声明身份、技能和插件；部署层只产生内部的 execution unit/runner instance 映射。

共享 runner 只能用于同一信任域的 Agent 团队。它不是权限隔离边界：如果多个 Buddy 的 token、环境变量、插件资产和状态目录进入同一个进程，就必须假设这些 Agent 共享运行时信任。不同租户、不同密钥隔离、不同网络策略、不同 runtime image、不同资源/lifecycle 要求，或插件不支持多 Agent profile 时，Cloud 必须保持独立 sandbox。

## 云和 AI 接口的关系

AI 接口负责操作 Agent、云电脑和模型代理。云负责把模版部署成运行环境，并维护 runner、Pod、PVC、日志和备份元数据。

需要下面这些内容时，看云文档：

- Cloud 模版如何声明空间、频道、Buddy、插件和技能。
- runner 如何部署到 Kubernetes。
- deployment 如何暂停、恢复、备份、还原和销毁。
- 模型供应商、密钥、插件资产和 runtime image 如何进入运行环境。

需要列出、创建或管理云电脑时，看 [云电脑 API](./cloud-computers)。云电脑 API 会隐藏 deployment、namespace、PVC 和 Pod 等细节，只暴露 AI 应用需要使用的对象和动作。

## 运行时后端

新的 Cloud 部署默认使用 `agent-sandbox` 工作负载后端。上层仍然使用“部署”这个概念，但 Kubernetes 资源会生成 `SandboxTemplate` 和 `SandboxClaim`，不再默认生成标准 `Deployment`。

该后端会把 state PVC 挂载到每个 runner 的 `/home/shadow`。runtime state、认证 dotdir、npm/pip 用户态安装、XDG config/cache/data/state，以及 Shadow 管理的用户态工具都会落在这个持久化 runner home 下。OpenClaw 使用 `/home/shadow/.openclaw`，cc-connect 系 runner 使用 `/home/shadow/.cc-connect` 加各自原生 CLI home（例如 `/home/shadow/.codex`），Hermes 使用 `/home/shadow/.hermes`。老集群可以通过 `deployments.backend = "deployment"` 回滚到旧后端。

`/tmp`、`/workspace/.agents` 和 runner 日志目录是临时区，不应该保存登录状态、包安装结果或长期用户数据。

Hermes runner 不预装 Codex。用户可以把 `codex` 二进制安装到持久化 runner home 后由 Hermes 当作普通本地工具调用；如果 Buddy 的主进程应该是 Codex，应选择 `runtime: codex`。

Cloud 继续在现有 deployment API 命名空间下提供暂停、恢复、备份、恢复备份、Pods 和日志能力。备份记录包含 status 和 phase 字段，Dashboard 可以区分创建快照、上传对象归档、恢复 PVC、恢复 Sandbox 等阶段。Sandbox 暂停后没有运行中的 Pod，但 PVC 会保留，用于后续恢复或还原。

当 Kubernetes 集群支持 CSI `VolumeSnapshot`、目标 PVC 绑定的是 CSI StorageClass，且存在匹配的 `VolumeSnapshotClass` 时，Cloud 会显式写入 `volumeSnapshotClassName` 并使用快照备份和 PVC restore；没有 snapshot API、PVC 仍使用非 CSI StorageClass，或缺少匹配 snapshot class 的集群会自动回退到对象归档备份。运维可以配置 `CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY` 加密对象归档，`expiresAt` retention 清理会删除过期的 snapshot/object artifact。

## 安全模型

Cloud 模版不应该写入原始 API Key。本地 CLI 部署使用 `${env:VAR_NAME}`，平台部署使用托管密钥组或供应商配置。

agent-sandbox 工作负载默认不挂载 service account token，使用非 root 安全上下文，并默认要求 `gvisor` RuntimeClass。网络策略仍然是默认拒绝，必须显式允许 Shadow server 和模型供应商出口。

`shadowob-cloud validate` 会拒绝疑似内联密钥，校验 schema 引用，并且可以在 strict 模式下要求所有环境变量都能解析。

## 下一步

- [Cloud SaaS 运行时 API](./cloud-saas) 了解暂停、恢复、备份和还原操作。
- [Cloud CLI](./cloud-cli) 了解本地和 Kubernetes 工作流。
- [Cloud 模版](./cloud-templates) 学习 `template.json` 编写方式。
- [Cloud 插件](./cloud-plugins) 了解模型供应商、Shadow provisioning、技能、脚本、CLI 和 MCP。
- [云电脑 API](./cloud-computers) 了解 AI 分类中的云电脑对象。
- [官方模型代理](./model-proxy) 了解基于虾币的模型用量。
