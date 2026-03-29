# OAuth 开放平台设计决策

> **决策编号**: DEC-001
> **决策日期**: 2026-03-29
> **状态**: 已批准
> **决策者**: 彭猫
> **记录者**: 小炸

---

## 1. 背景

虾豆（Shadow）旨在通过 OAuth 授权使第三方服务商能够访问用户账号。目标服务商包括资讯、游戏、创意类服务，需要：

- 与社区建立连接
- 用户授权后创建服务器或邀请用户加入服务器
- 推送消息到频道，与用户互动

现有 OAuth 实现支持基础的 Authorization Code Flow，但 scope 仅限于 `user:read` 和 `user:email`。本文档定义扩展为完整开放平台的决策。

---

## 2. 决策摘要

| 决策项 | 决策结果 |
|--------|----------|
| Scope 扩展 | 扩展至服务器、频道、消息、附件、工作区、Buddy |
| Token 方案 | 保持 Opaque Token（不迁移 JWT） |
| PKCE 支持 | 第一期不支持（服务商为服务端应用，使用 client_secret） |
| 开发者门户 | 需要开发；第一期包含 App 管理、授权统计、API 文档 |
| 服务商入驻 | 自助注册；后续可增加审核机制 |
| 企业级功能 | 第一期不需要；预留扩展性 |
| Scope 验证 | 中间件统一验证 + 路由声明 scope |
| Buddy 设计 | Buddy = Agent + User；关联 OAuth App 子账户 |

---

## 3. Scope 设计

### 3.1 Scope 列表

| Scope | 描述 | 对应资源 |
|-------|------|----------|
| `user:read` | 读取用户基本信息 | User |
| `user:email` | 读取用户邮箱（需配合 user:read） | User |
| `servers:read` | 读取用户所在服务器列表 | Server |
| `servers:write` | 创建服务器、邀请用户加入服务器 | Server |
| `channels:read` | 读取服务器频道列表 | Channel |
| `channels:write` | 创建频道 | Channel |
| `messages:read` | 读取频道消息历史 | Message |
| `messages:write` | 发送消息到频道 | Message |
| `attachments:read` | 读取附件信息 | Attachment |
| `attachments:write` | 上传附件 | Attachment |
| `workspaces:read` | 读取工作区信息 | Workspace |
| `workspaces:write` | 创建/修改工作区节点 | Workspace |
| `buddies:create` | 创建 Buddy Bot | Buddy (Agent + User) |
| `buddies:manage` | 管理 Buddy（发送消息、配置等） | Buddy |

### 3.2 Scope 分组（供授权页面展示）

| 分组 | 包含 Scope | 说明 |
|------|------------|------|
| **用户信息** | `user:read`, `user:email` | 基础身份信息 |
| **服务器** | `servers:read`, `servers:write` | 服务器管理与邀请 |
| **频道与消息** | `channels:read`, `channels:write`, `messages:read`, `messages:write` | 内容交互 |
| **附件** | `attachments:read`, `attachments:write` | 文件上传 |
| **工作区** | `workspaces:read`, `workspaces:write` | 项目文件管理 |
| **Buddy** | `buddies:create`, `buddies:manage` | Bot 创建与管理 |

### 3.3 Scope 验证机制

采用中间件统一验证 + 路由声明 scope：

```typescript
// 中间件实现示例
export function oauthScopeMiddleware(requiredScopes: string[]) {
  return async (c: Context, next: Next) => {
    const token = c.get('oauthToken') // 从 authMiddleware 获取
    const grantedScopes = token.scope.split(' ')
    
    const hasAllScopes = requiredScopes.every(s => grantedScopes.includes(s))
    if (!hasAllScopes) {
      return c.json({ error: 'insufficient_scope', required: requiredScopes }, 403)
    }
    
    await next()
  }
}

// 路由定义示例
oauthHandler.get('/servers', 
  oauthAuthMiddleware,           // OAuth token 验证
  oauthScopeMiddleware(['servers:read']),
  async (c) => { ... }
)
```

---

## 4. Buddy 设计

### 4.1 Buddy 定义

Buddy 是服务商创建的虚拟 Bot，具有双重身份：
- **User 身份**: `users` 表中 `isBot = true` 的用户，可以加入服务器和频道
- **Agent 身份**: `agents` 表中的 Agent，可以执行 AI 任务

### 4.2 数据模型扩展

新增字段关联 Buddy 到 OAuth App：

```sql
-- users 表扩展
ALTER TABLE users ADD COLUMN oauth_app_id UUID REFERENCES oauth_apps(id);
ALTER TABLE users ADD COLUMN parent_user_id UUID REFERENCES users(id); -- 子账户的父账户

-- agents 表扩展
ALTER TABLE agents ADD COLUMN oauth_app_id UUID REFERENCES oauth_apps(id);
ALTER TABLE agents ADD COLUMN buddy_user_id UUID REFERENCES users(id); -- Buddy 关联的 User
```

### 4.3 Buddy 创建流程

```
OAuth App (服务商)
    ↓ 创建子账户
子账户 (users, isBot=true, oauth_app_id=app.id)
    ↓ 创建 Buddy
Buddy Agent (agents, buddy_user_id=子账户.id, oauth_app_id=app.id)
```

### 4.4 Buddy 能力

- 被 OAuth App 控制发送消息（通过 `messages:write` scope）
- 加入服务器、频道（作为普通用户）
- 可选：执行 AI 任务（Agent 能力）

---

## 5. Token 方案

### 5.1 决策：保持 Opaque Token

第一期保持当前 Opaque Token 方案，不迁移 JWT。

| Token 类型 | 格式 | 存储方式 | 过期时间 |
|------------|------|----------|----------|
| Access Token | `oat_xxx` | SHA-256 hash 存数据库 | 1 小时 |
| Refresh Token | `ort_xxx` | SHA-256 hash 存数据库 | 30 天 |

### 5.2 后续扩展考虑

如果未来需要无状态验证或大规模 API 调用：
- JWT Access Token（15min）+ Opaque Refresh Token
- Redis 黑名单支持即时撤销

---

## 6. 开发者门户

### 6.1 第一期功能范围

| 功能模块 | 内容 |
|----------|------|
| **OAuth App 管理** | 创建、编辑、删除 App；查看 Client ID；重置 Secret（创建时显示一次） |
| **授权统计** | 已授权用户列表；按日期授权统计 |
| **API 文档** | OAuth 接入指南；Scope 说明；SDK 使用示例；错误码说明 |

### 6.2 入口位置

放在 `website` 的 API 文档页面下方：
- `/docs/api/oauth` - API 文档
- `/docs/api/oauth/apps` - App 管理（需登录）

### 6.3 预留扩展

- App 审核入口（暂不启用）
- 高级统计（API 调用量、错误率、响应时间）
- Webhook 配置

---

## 7. 服务商入驻流程

### 7.1 第一期：自助注册

```
1. 服务商开发者注册虾豆账号
2. 进入开发者门户，创建 OAuth App
3. 配置 redirect_uri、选择 scope
4. 立即获得 Client ID/Secret，可开始接入
```

### 7.2 后续扩展：敏感 Scope 审核

对于敏感 scope（如大规模 `servers:write` 邀请）：
- 申请审核流程
- 使用量监控
- 违规处罚机制

---

## 8. API 端点设计

### 8.1 OAuth Provider 端点（现有 + 扩展）

| 端点 | 方法 | 说明 | Scope |
|------|------|------|-------|
| `/api/oauth/apps` | POST | 创建 OAuth App | 需登录 |
| `/api/oauth/apps` | GET | 列出我的 App | 需登录 |
| `/api/oauth/apps/:id` | PATCH | 更新 App | 需登录 |
| `/api/oauth/apps/:id` | DELETE | 删除 App | 需登录 |
| `/api/oauth/apps/:id/reset-secret` | POST | 重置 Secret | 需登录 |
| `/oauth/authorize` | GET | 授权页面 | 需登录 |
| `/api/oauth/authorize` | POST | 用户同意授权 | 需登录 |
| `/api/oauth/token` | POST | 交换 Token | 公开 |
| `/api/oauth/userinfo` | GET | 用户信息 | `user:read` |

### 8.2 OAuth API 端点（新增）

| 端点 | 方法 | 说明 | Scope |
|------|------|------|-------|
| `/api/oauth/servers` | GET | 用户服务器列表 | `servers:read` |
| `/api/oauth/servers` | POST | 创建服务器 | `servers:write` |
| `/api/oauth/servers/:id/invite` | POST | 邀请用户加入 | `servers:write` |
| `/api/oauth/servers/:id/channels` | GET | 频道列表 | `channels:read` |
| `/api/oauth/channels` | POST | 创建频道 | `channels:write` |
| `/api/oauth/channels/:id/messages` | GET | 消息历史 | `messages:read` |
| `/api/oauth/channels/:id/messages` | POST | 发送消息 | `messages:write` |
| `/api/oauth/attachments` | POST | 上传附件 | `attachments:write` |
| `/api/oauth/workspaces/:id` | GET | 工作区信息 | `workspaces:read` |
| `/api/oauth/buddies` | POST | 创建 Buddy | `buddies:create` |
| `/api/oauth/buddies/:id/messages` | POST | Buddy 发送消息 | `buddies:manage` |

---

## 9. 实施计划

### 9.1 第一阶段：Scope 扩展

- 扩展 scope 定义和验证
- 新增 OAuth API 端点（服务器、频道、消息）
- 更新 `@shadowob/oauth` SDK

### 9.2 第二阶段：Buddy 支持

- 数据模型扩展（users、agents 表）
- Buddy 创建 API
- Buddy 消息发送 API

### 9.3 第三阶段：开发者门户

- OAuth App 管理页面
- 授权统计页面
- API 文档页面

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 服务商滥用邀请功能 | 大量垃圾邀请 | 监控邀请量、设置阈值、异常告警 |
| Buddy 滥用消息推送 | 频道被垃圾消息淹没 | 消息频率限制、用户可屏蔽 Buddy |
| OAuth App 泄露 Secret | 安全风险 | Secret 仅显示一次、支持重置、IP 白名单（预留） |

---

## 11. 附录

### 11.1 现有 OAuth 实现

参见 `docs/oauth.md` 和以下代码：
- `packages/oauth/` - OAuth SDK
- `apps/server/src/services/oauth.service.ts` - OAuth 服务
- `apps/server/src/handlers/oauth.handler.ts` - OAuth Handler
- `apps/server/src/db/schema/oauth.ts` - 数据模型

### 11.2 参考资料

- OAuth 2.0 规范: https://oauth.net/2/
- Discord OAuth 设计: https://discord.com/developers/docs/topics/oauth2
- Slack OAuth 设计: https://api.slack.com/docs/oauth

---

_文档由小炸记录，彭猫确认。_