---
title: Cloud CLI
description: 使用独立的 shadowob-cloud CLI 校验、部署、监控和管理 Buddy 模版。
---

# Cloud CLI

`shadowob-cloud` 是云的独立部署命令行。它可以从模版创建配置、校验密钥和 schema、部署到 Kubernetes、打开 Dashboard，并管理裸机节点上的 k3s 集群。

## 安装

```bash
npm install -g @shadowob/cloud
# 或
pnpm add -g @shadowob/cloud
```

检查本机环境：

```bash
shadowob-cloud --version
shadowob-cloud doctor
```

`doctor` 会检查 `kubectl`、Docker、Pulumi 等本地依赖。

## 第一次部署

```bash
shadowob-cloud init --template gstack-buddy
shadowob-cloud validate --strict
shadowob-cloud up
shadowob-cloud status
```

模版使用 `${env:VAR_NAME}` 引用密钥：

```bash
export OPENAI_COMPATIBLE_API_KEY="sk-..."
export OPENAI_COMPATIBLE_BASE_URL="https://api.example.com/v1"
export OPENAI_COMPATIBLE_MODEL_ID="deepseek-v4-flash"
export SHADOWOB_SERVER_URL="https://app.example.com"
export SHADOWOB_USER_TOKEN="..."
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `shadowob-cloud init` | 创建 `shadowob-cloud.json`，可指定内置模版。 |
| `shadowob-cloud init --list` | 列出可用模版。 |
| `shadowob-cloud validate --strict` | 校验 schema、模版引用、安全规则和环境变量。 |
| `shadowob-cloud up` | 部署到当前 Kubernetes context。 |
| `shadowob-cloud up --local` | 先启动本地 Kind 集群再部署。 |
| `shadowob-cloud status` | 查看 Deployment 和 Pod 状态。 |
| `shadowob-cloud logs <agent-id>` | 查看 Agent 日志。 |
| `shadowob-cloud scale <agent-id> --replicas 3` | 扩缩容 Agent。 |
| `shadowob-cloud down` | 销毁部署的资源。 |
| `shadowob-cloud dashboard` | 打开 Cloud Dashboard。 |
| `shadowob-cloud serve` | 启动 API Server 和 Dashboard。 |
| `shadowob-cloud generate manifests` | 导出 Kubernetes manifests，不直接应用。 |
| `shadowob-cloud sandbox status` | 列出 agent-sandbox 工作负载及其当前状态。 |
| `shadowob-cloud sandbox pause <agent>` | 通过将 Sandbox 副本缩为 0 来暂停 agent-sandbox 工作负载。 |
| `shadowob-cloud sandbox resume <agent>` | 恢复已暂停的 agent-sandbox 工作负载。 |
| `shadowob-cloud sandbox backup <agent>` | 为 agent-sandbox 状态 PVC 创建 VolumeSnapshot 备份。 |
| `shadowob-cloud sandbox restore <agent>` | PVC 外部恢复完成后恢复 Sandbox。 |

## Agent-Sandbox 生命周期

Agent-sandbox 工作负载支持从 CLI 直接进行暂停/恢复和状态备份/还原：

```bash
# 暂停 Agent 以释放计算资源，同时保留 PVC 状态
shadowob-cloud sandbox pause strategy-buddy

# 稍后恢复；Agent 从其保存的状态重建上下文
shadowob-cloud sandbox resume strategy-buddy

# 创建状态 PVC 的 VolumeSnapshot 备份
shadowob-cloud sandbox backup strategy-buddy --snapshot-class csi-hostpath-snapclass

# 外部 PVC 恢复完成后，交接给 Sandbox
shadowob-cloud sandbox restore strategy-buddy --backup-id <backup-id>
```

`sandbox status` 命令会显示每个 agent-sandbox 工作负载的运行时状态、就绪数和状态 PVC 名称。

```bash
shadowob-cloud sandbox status -n my-namespace
```

## 裸机节点集群

Cloud 可以通过 SSH 在 Ubuntu 或 Debian 节点上初始化 k3s。

```bash
shadowob-cloud cluster init --config cluster.json
shadowob-cloud cluster status
shadowob-cloud up --cluster prod
```

最小集群配置：

```json
{
  "name": "prod",
  "nodes": [
    {
      "role": "master",
      "host": "1.2.3.4",
      "user": "root",
      "sshKeyPath": "~/.ssh/id_rsa"
    }
  ]
}
```

生成的 kubeconfig 会保存在 `~/.shadow-cloud/clusters/<name>.yaml`。

## 本地调试

```bash
shadowob-cloud generate openclaw-config
shadowob-cloud logs strategy-buddy
shadowob-cloud dashboard
```

当你需要检查最终挂载到 Agent 里的模型供应商、工具、权限和 Shadow 频道配置时，优先使用 `generate openclaw-config`。
