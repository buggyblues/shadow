# Shadow Cloud — Provisioning 规范

> **Spec:** 05-provisioning
> **Version:** 2.0-draft
> **Date:** 2026-04-10

---

## 1. 概述

Provisioning 是将 `shadowob-cloud.json` 中声明的 Shadow 资源（Server、Channel、Buddy）在 Shadow 平台上实际创建的过程。创建后的真实资源 ID 会保存为 state；Buddy token 只作为运行时 secret 注入到 Agent 容器环境变量，不写入 state。

### 流程

```
shadowob-cloud.json                     Shadow Platform
─────────────────                     ────────────────

plugins.shadowob.servers[]    ──▶     Create Server (API)
                                         └─ 返回 server.id (UUID)
                                         
plugins.shadowob.servers[].channels[] ──▶  Create Channel (API)
                                         └─ 返回 channel.id (UUID)
                                         
plugins.shadowob.buddies[]    ──▶     Create Buddy (API)
                                         └─ 返回 buddy.id + 运行时 token
                                         
plugins.shadowob.bindings[]   ──▶     Add Buddy to Server/Channel (API)
                                         └─ Buddy 获得消息访问权限

       ┌─────────────────────────────────────────┐
       │         Provision State                  │
       │  .shadowob/provision-state.json          │
       │                                          │
       │  servers: { "my-server": "uuid-..." }    │
       │  channels: { "general": "uuid-..." }     │
       │  buddies: { "my-buddy": { agentId, userId } } │
       └─────────────────────────────────────────┘
                          │
                          ▼
       ┌─────────────────────────────────────────┐
       │    Injected as K8s Environment Vars      │
       │                                          │
       │  SHADOWOB_SERVER_URL=https://shadow.example│
       │  SHADOWOB_TOKEN_MY_BUDDY=token-...          │
       └─────────────────────────────────────────┘
```

---

## 2. API 调用序列

### 2.1 创建顺序

```
1. Servers (依赖: 无)
   ├── Server A
   │   ├── Channel A1
   │   └── Channel A2
   └── Server B
       └── Channel B1

2. Buddies (依赖: 无)
   ├── Buddy X
   └── Buddy Y

3. Bindings (依赖: Servers + Channels + Buddies 全部创建完成)
   ├── Bind Buddy X → Server A (all channels)
   └── Bind Buddy Y → Server B, Channel B1
```

### 2.2 幂等性

provisioning 模块实现 find-or-create 语义:

1. **Server**: 先按 slug 查找，找到则复用，否则创建
2. **Channel**: 在 server 下按 title 查找，找到则复用，否则创建
3. **Buddy**: 先按 name 查找，找到则复用，否则创建
4. **Binding**: addBuddyToServer API 是幂等的（重复调用不报错）

### 2.3 State 文件

**路径**: `{configDir}/.shadowob/provision-state.json`

```json
{
  "servers": {
    "my-server": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Shadow Server",
      "slug": "my-shadow-server"
    }
  },
  "channels": {
    "general": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "General",
      "serverId": "550e8400-e29b-41d4-a716-446655440000"
    }
  },
  "buddies": {
    "my-buddy": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "My AI Assistant"
    }
  }
}
```

**安全性**: state 只保存资源 ID，不保存 token / secret / API key。Buddy token 由 provisioning 阶段即时生成，并通过 K8s Secret 注入运行态。

---

## 3. 环境变量生成

provisioning 完成后，为每个 agent 生成环境变量:

```typescript
function buildProvisionedEnvVars(
  agentId: string,
  config: CloudConfig,
  provision: ProvisionResult,
  serverUrl: string
): Record<string, string> {
  const envVars: Record<string, string> = {
    SHADOWOB_SERVER_URL: serverUrl,
  }

  // 为绑定到此 agent 的每个 buddy 生成 token env var
  const bindings = config.plugins?.shadowob?.bindings?.filter(b => b.agentId === agentId)
  for (const binding of bindings ?? []) {
    const buddy = provision.buddies.get(binding.targetId)
    if (buddy?.token) {
      const envKey = `SHADOWOB_TOKEN_${binding.targetId.toUpperCase().replace(/-/g, '_')}`
      envVars[envKey] = buddy.token
    }
  }

  return envVars
}
```

**命名规则**: `SHADOWOB_TOKEN_{BUDDY_ID}` — buddy ID 大写化，`-` 替换为 `_`

**示例**: buddy id `my-buddy` → `SHADOWOB_TOKEN_MY_BUDDY`

---

## 4. 与 `up` 命令的集成

```
shadowob-cloud up
       │
       ├── 1. parseConfigFile()
       │
       ├── 2. provisionShadowResources()     ← Provisioning
       │      ├── 创建 Server, Channel, Buddy
       │      ├── 保存 state.json
       │      └── 返回 ProvisionResult
       │
       ├── 3. buildProvisionedEnvVars()       ← 生成 env vars
       │      需要 ProvisionResult + agent bindings
       │
       ├── 4. resolveConfig()                 ← 模板解析
       │      需要 env vars 已注入到 process.env
       │
       └── 5. Pulumi up                       ← K8s 部署
              env vars 写入 Secret
```

**`--skip-provision` 行为**: 
- 跳过步骤 2
- 从 state 文件读取已有的 provision 结果
- 如果 state 文件不存在，env vars 中不包含 SHADOWOB_TOKEN_*

---

## 5. `shadowob-cloud provision` 独立命令

用于不部署到 K8s，仅在 Shadow 平台上创建资源:

**场景**:
- 预创建 Shadow 资源，之后在其他环境部署
- 调试 provisioning 逻辑
- 获取 buddy token 用于本地开发

**依赖**:
- Shadow Server URL (via `--server-url` 或 env `SHADOWOB_SERVER_URL`)
- 用户认证 token (via `--user-token` 或 env `SHADOWOB_USER_TOKEN`)
- 有效的配置文件（至少包含 `plugins.shadowob`）

---

## 6. 错误处理

| 场景 | 行为 |
|------|------|
| Shadow Server 不可达 | 报错 + 建议检查 URL 和网络 |
| 认证失败 | 报错 + 提示检查 token |
| Server 已存在但 slug 冲突 | 复用已存在的（find-or-create） |
| Channel 已存在 | 复用已存在的 |
| Buddy 已存在 | 复用 agentId，并重新 mint 运行时 token |
| Binding 已存在 | 静默成功（API 幂等） |
| 部分失败 | 已创建的资源保留，报告失败的资源 |
