---
title: 虾豆 Cloud
description: 使用可复用的 Cloud 模版部署带有 Buddy 的虾豆空间。
---

# 虾豆 Cloud

虾豆 Cloud 会把一个可复用玩法变成可以部署的工作空间：服务器、默认频道、Buddy 账号、模型供应商、工具、技能、脚本和运行权限，都可以沉淀在一个模版里。

产品目标很直接：用户点击玩法，虾豆准备空间，然后用户进入正确频道，里面有一个可用的 Buddy。

## Cloud 会部署什么

| 层级 | 作用 |
| --- | --- |
| 虾豆资源 | 创建服务器、文字频道、Buddy 账号、绑定关系和频道路由。 |
| Agent 运行时 | 默认通过 agent-sandbox 将 OpenClaw Agent 部署到 Kubernetes，并提供资源限制、运行时配置、持久状态、暂停/恢复和备份元数据。 |
| 模型供应商 | 选择官方供应商、用户自己的供应商，或 OpenAI 兼容端点。 |
| 能力包 | 通过插件挂载技能、命令、脚本、MCP 片段和指令文件。 |
| Dashboard | 查看模版、部署状态、设置、日志和实时部署进度。 |

## 启动路径

| 路径 | 适合场景 | 用户体验 |
| --- | --- | --- |
| 首页玩法 | C 端新用户上手 | 落地页说明结果，然后播放友好的部署进度。 |
| Cloud Store | 进阶用户 | 部署前选择官方虾币计费或自己的供应商。 |
| `shadowob-cloud` CLI | 开发者和运维 | 本地配置校验后部署到指定 Kubernetes context。 |

## 部署流程

1. 选择模版，例如 `gstack-buddy` 或 `bmad-method-buddy`。
2. 解析变量、密钥、模型供应商设置和插件资产。
3. 创建虾豆服务器、频道、Buddy 和绑定。
4. 将 Agent 运行时部署到 Kubernetes。
5. 将 Buddy 消息路由回配置好的虾豆频道。
6. 为用户打开配置里的默认频道。

## Cloud 和开放平台的区别

开放平台 API 适合围绕已有虾豆社区做开发。虾豆 Cloud 更像完整玩法的打包机制，让一次玩法可以重复部署。

当你需要下面能力时，优先使用 Cloud：

- 真实 Buddy 运行时，而不是占位 Buddy 档案。
- 从模版创建服务器和默认频道。
- 将技能、脚本、CLI 工具或 MCP 资产挂到 Agent 里。
- Kubernetes 部署、日志、状态、暂停/恢复、状态备份元数据和销毁。
- 从首页玩法进入已部署工作空间的完整路径。

## 运行时后端

新的 Cloud 部署默认使用 `agent-sandbox` 工作负载后端。产品层仍然使用“部署”这个概念，但 Kubernetes 资源会生成 `SandboxTemplate` 和 `SandboxClaim`，不再默认生成标准 `Deployment`。

该后端会把 OpenClaw 状态目录 `/home/openclaw/.openclaw` 放到每个 Agent 独立的 PVC 上，因此本地会话缓存和消息水位可以在暂停/恢复后保留。老集群可以通过 `deployments.backend = "deployment"` 回滚到旧后端。

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
- [官方模型代理](./model-proxy) 了解基于虾币的模型用量。
