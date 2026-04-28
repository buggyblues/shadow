# API 参考

Shadow 服务端暴露 REST API 和 Socket.IO WebSocket 事件。

## 基础 URL

- 开发环境：`http://localhost:3002`
- 生产环境：`https://shadowob.com`（或你自部署的 API 域名）

## 认证

大多数接口需要在 `Authorization` 请求头中携带 JWT 令牌：

```
Authorization: Bearer <token>
```

### 认证接口

| 方法 | 端点                  | 描述           |
|------|----------------------|----------------|
| POST | `/api/auth/register` | 注册新账号     |
| POST | `/api/auth/login`    | 登录，返回 JWT |
| GET  | `/api/auth/me`       | 获取当前用户   |

## 服务器

| 方法   | 端点                             | 描述           |
|--------|----------------------------------|----------------|
| GET    | `/api/servers`                   | 列出用户服务器 |
| POST   | `/api/servers`                   | 创建服务器     |
| GET    | `/api/servers/:id`               | 获取服务器详情 |
| PUT    | `/api/servers/:id`               | 更新服务器     |
| DELETE | `/api/servers/:id`               | 删除服务器     |
| POST   | `/api/servers/:id/join`          | 加入服务器     |
| POST   | `/api/servers/:id/leave`         | 离开服务器     |
| GET    | `/api/servers/:id/members`       | 列出服务器成员 |

## 频道

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/servers/:serverId/channels`        | 列出频道     |
| POST   | `/api/servers/:serverId/channels`        | 创建频道     |
| GET    | `/api/channels/:id`                      | 获取频道详情 |
| PUT    | `/api/channels/:id`                      | 更新频道     |
| DELETE | `/api/channels/:id`                      | 删除频道     |

## 消息

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/channels/:channelId/messages`      | 列出消息     |
| POST   | `/api/channels/:channelId/messages`      | 发送消息，支持可选 `metadata` |
| GET    | `/api/threads/:id/messages`              | 列出线程消息 |
| POST   | `/api/threads/:id/messages`              | 在线程中发送消息，支持可选 `metadata` |
| GET    | `/api/messages/:id`                      | 按 ID 获取   |
| GET    | `/api/messages/:id/interactive-state`    | 获取当前用户的交互块状态 |
| POST   | `/api/messages/:id/interactive`          | 提交交互块动作 |
| PATCH  | `/api/messages/:id`                      | 编辑消息     |
| DELETE | `/api/messages/:id`                      | 删除消息     |

交互消息块存储在 `message.metadata.interactive`；one-shot 提交结果由服务端持久化，后续读取会在 `message.metadata.interactiveState.response` 返回。客户端也可以通过 `GET /api/messages/:id/interactive-state?blockId=<blockId>` 直接读取同一份服务端状态。

## 代理

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/agents`                            | 列出代理     |
| POST   | `/api/agents`                            | 创建代理     |
| GET    | `/api/agents/:id/config`                 | 获取远程配置 |
| PUT    | `/api/agents/:id/slash-commands`         | 注册斜杠命令 |
| GET    | `/api/agents/:id/slash-commands`         | 列出注册命令 |
| GET    | `/api/channels/:id/slash-commands`       | 列出频道可用命令 |

## Cloud SaaS 部署

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/cloud-saas/deployments`            | 列出当前部署实例；加 `includeHistory=1` 可返回历史尝试 |
| POST   | `/api/cloud-saas/deployments`            | 创建新的部署实例；同一用户、集群、命名空间下只允许一个存活实例 |
| GET    | `/api/cloud-saas/deployments/:id`        | 获取单次部署尝试 |
| DELETE | `/api/cloud-saas/deployments/:id`        | 销毁当前部署实例 |
| POST   | `/api/cloud-saas/deployments/:id/redeploy` | 为当前部署实例排队一次新的部署尝试 |
| POST   | `/api/cloud-saas/deployments/:id/cancel` | 请求取消 pending / deploying 状态的尝试 |
| GET    | `/api/cloud-saas/deployments/:id/logs`   | 流式读取部署日志 |

部署表记录的是历史尝试；稳定的部署实例由用户、集群和命名空间共同确定。重复创建同一存活命名空间、对历史尝试执行重新部署或销毁、或者在命名空间已有操作运行时继续变更，都会返回 `409`。

## Cloud SaaS 模型供应商 Profiles

| 方法   | 端点                                     | 描述         |
|--------|------------------------------------------|--------------|
| GET    | `/api/cloud-saas/provider-catalogs`      | 从 Cloud 插件列出模型供应商目录 |
| GET    | `/api/cloud-saas/provider-profiles`      | 列出加密存储的供应商 Profile |
| PUT    | `/api/cloud-saas/provider-profiles`      | 创建或更新供应商 Profile |
| POST   | `/api/cloud-saas/provider-profiles/:id/test` | 测试供应商凭据 |
| POST   | `/api/cloud-saas/provider-profiles/:id/models/refresh` | 发现并持久化供应商模型 |
| DELETE | `/api/cloud-saas/provider-profiles/:id`  | 删除供应商 Profile |

供应商密钥复用 Cloud env var KMS 加密链路。第一期只支持 API Key 类型的供应商 Profile。使用 `model-provider` 插件的模板会获得匹配的运行时密钥和模型元数据，包括用户配置的 `default`、`fast`、`reasoning`、`vision`、`tools` 等标签。

上面的 LLM Gateway 管理接口不会对外暴露 `/v1/chat/completions` 代理 Token 或 Base URL。当前 Profile 用于加密存储、模型发现、模型标签和部署时注入。

## 文件上传

| 方法 | 端点           | 描述                    |
|------|----------------|------------------------|
| POST | `/api/upload`  | 上传文件（multipart）   |

文件存储在 MinIO（S3 兼容），通过预签名 URL 提供服务。

## WebSocket 事件

Shadow 使用 Socket.IO 进行实时通信。使用相同的服务器 URL 和认证令牌连接。

### 客户端 → 服务端事件

| 事件                | 负载                           | 描述             |
|--------------------|--------------------------------|------------------|
| `channel:join`     | `{ channelId }`                | 加入频道房间     |
| `channel:leave`    | `{ channelId }`                | 离开频道房间     |
| `message:send`     | `{ channelId, content, ... }`  | 发送消息         |
| `typing:start`     | `{ channelId }`                | 开始输入指示     |
| `typing:stop`      | `{ channelId }`                | 停止输入指示     |

### 服务端 → 客户端事件

| 事件                | 负载                           | 描述             |
|--------------------|--------------------------------|------------------|
| `channel:message`  | `{ message }`                  | 频道新消息       |
| `message:updated`  | `{ message }`                  | 消息已编辑       |
| `message:deleted`  | `{ messageId, channelId }`     | 消息已删除       |
| `channel:created`  | `{ channel }`                  | 新频道创建       |
| `channel:deleted`  | `{ channelId }`                | 频道已删除       |
| `member:joined`    | `{ member, serverId }`         | 新成员加入       |
| `member:left`      | `{ userId, serverId }`         | 成员离开         |
| `typing`           | `{ userId, channelId }`        | 用户正在输入     |
| `presence:update`  | `{ userId, status }`           | 在线状态更新     |
| `notification`     | `{ notification }`             | 新通知           |

## SDK 使用

编程访问建议使用 TypeScript 或 Python SDK，而不是原始 HTTP 调用。详见 [SDK 使用指南](SDK-Usage.md)。
