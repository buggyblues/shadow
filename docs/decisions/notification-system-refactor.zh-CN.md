# 通知系统重构方案

> **状态:** 草稿 — 待审核
> **日期:** 2025-03-30
> **作者:** 小炸 (AI 助理)

## 背景

Shadow 当前通知系统存在以下问题：

1. **Mention 解析有缺陷** — 正则 `@([A-Za-z0-9_-]+)` 会错误匹配邮箱、不支持中文用户名、不区分代码块

2. **通知创建逻辑分散** — 在 6+ 个文件中分散创建（chat.gateway.ts、server.handler.ts、friendship.handler.ts 等）

3. **缺少离线推送** — 只有 Socket.IO 实时推送，用户离线时无法收到通知

4. **无通知聚合** — 每条消息都创建独立通知，高频时通知列表膨胀

5. **Buddy/Agent 回复无通知** — Agent 发送消息后不触发通知（只广播 WebSocket）

6. **无多语言模板** — title/body 硬编码字符串拼接

## 目标

1. Discord 风格 `<@userId>` mention 格式，正确解析和验证
2. Expo Push Notifications 离线推送（服务端推送）
3. 通知聚合（5分钟窗口）
4. i18n 通知模板系统
5. 统一 NotificationTriggerService
6. Buddy/Agent 回复通知

---

## 决策 1: Mention 格式 — Discord 风格

### 当前方案
```
@username  — 有缺陷的正则，邮箱误匹配、不支持中文
```

### 新方案
```
<@userId>  — Discord 风格，渲染时解析为 displayName
```

### 优势
- 用户改名后 mention 仍有效
- 不误匹配邮箱地址
- 支持任意用户名格式（中文、emoji 等）
- 数据库存储 userId，前端渲染 displayName

### 实现

**消息存储：**
- 保持原始内容不变（包含 `<@userId>` 格式）
- 服务端不解析 mention 文本

**MentionService：**
```typescript
class MentionService {
  // 从内容解析 <@userId> 格式
  parseMentions(content: string): string[]
  
  // 验证被 mention 的用户是否在频道中
  validateMentions(channelId: string, userIds: string[]): Promise<User[]>
  
  // 前端渲染：将 userId 解析为 displayName
  resolveMention(userId: string, members: Member[]): string
}
```

**前端输入：**
- 输入 `@` 时弹出成员列表自动补全
- 选择后插入 `<@userId>` 格式
- 消息气泡渲染为 `@displayName`

---

## 决策 2: Push Notifications — Expo Push 服务

### 当前状态
- Mobile 端只有本地通知（expo-notifications scheduleNotificationAsync）
- 无服务端推送能力
- 数据库未存储 push token

### 新方案
- 服务端 Expo Push Notifications（expo-server-sdk-node）
- 多设备支持（user_push_tokens 表）
- 用户离线时 Push，在线时 Centrifugo

### 数据库变更

```sql
CREATE TABLE user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  expo_push_token TEXT NOT NULL UNIQUE,
  device_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_push_tokens_user ON user_push_tokens(user_id);
CREATE INDEX idx_push_tokens_active ON user_push_tokens(is_active);
```

### PushService

```typescript
import { Expo } from 'expo-server-sdk'

class PushService {
  private expo = new Expo()
  
  // 注册 push token
  async registerPushToken(userId: string, token: string, platform: string, deviceName?: string)
  
  // 发送推送（批量）
  async sendPushNotifications(userIds: string[], notification: {
    title: string
    body: string
    data: Record<string, unknown>
  }): Promise<PushTicket[]>
  
  // 检查推送 receipt（15分钟后）
  async checkPushReceipts(ticketIds: string[]): Promise<PushReceipt[]>
  
  // 清理无效 token
  async cleanInvalidTokens(): void  // DeviceNotRegistered 时标记 inactive
}
```

### Token 生命周期
- App 启动时注册（获得权限后）
- 存储到 user_push_tokens
- 退出登录时清理（删除 token）
- 收到 DeviceNotRegistered receipt 时标记 inactive

---

## 决策 3: 通知聚合

### 当前问题
每条消息创建独立通知 → 通知刷屏

### 新方案
在 5分钟窗口内聚合同类型通知

### 数据库变更

```sql
ALTER TABLE notifications ADD COLUMN aggregated_count INT DEFAULT 1;
ALTER TABLE notifications ADD COLUMN last_aggregated_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN aggregation_key TEXT;
```

### 聚合规则

| 类型 | aggregation_key | 窗口 | 聚合标题 |
|------|-----------------|------|----------|
| mention | `mention:channel:{channelId}:user:{targetUserId}` | 5 min | "N 人提到了你" |
| reply | `reply:channel:{channelId}:user:{targetUserId}` | 5 min | "N 条新回复" |
| dm | `dm:{dmChannelId}` | 5 min | "N 条新消息" |
| buddy_reply | `buddy:{dmChannelId}` | 5 min | "Buddy 发来 N 条消息" |
| system | — | — | 不聚合 |

### AggregationService

```typescript
class NotificationAggregationService {
  // 尝试聚合新通知
  async tryAggregate(notification: NewNotification): Promise<Notification>
  
  // 刷新过期窗口（cron job，5分钟过期）
  async flushExpiredWindows(): void
  
  // 生成聚合标题
  generateAggregatedTitle(notification: Notification, locale: string): string
}
```

### 重要：实时推送仍然立即生效
- 聚合只影响通知存储和显示
- **Centrifugo/Expo 推送仍然立即触发**
- 聚合改变的是"如何显示"，不是"何时推送"

---

## 冰策 4: i18n 通知模板

### 当前问题
硬编码字符串如 `${sender} mentioned you`

### 新方案
模板系统支持多语言

### 模板结构

```typescript
// packages/shared/src/notification-templates.ts
export const notificationTemplates = {
  mention: {
    zh_CN: {
      single: '{{sender}} 提到了你',
      aggregated: '有 {{count}} 人提到了你',
      body: '{{preview}}'
    },
    en: {
      single: '{{sender}} mentioned you',
      aggregated: '{{count}} people mentioned you',
      body: '{{preview}}'
    }
  },
  buddy_reply: {
    zh_CN: {
      single: '{{buddy}} 回复了你',
      aggregated: '{{buddy}} 发来 {{count}} 条消息'
    },
    en: {
      single: '{{buddy}} replied to you',
      aggregated: '{{buddy}} sent {{count}} messages'
    }
  }
}
```

### TemplateService

```typescript
class NotificationTemplateService {
  render(
    type: NotificationType,
    locale: string,  // 来自用户 profile 或默认
    params: TemplateParams
  ): { title: string; body?: string }
}
```

---

## 冰策 5: Buddy/Agent 回复通知

### 问题
Agent 发送消息不触发通知。

**当前流程（缺少通知）：**
```
用户发 DM → relayDmToBot → Agent 处理 → Agent 发消息
                                        ↓
                              WebSocket 广播仅此而已
                                        ↓
                              没有创建通知！
```

### 新方案
Agent 回复时触发通知。

**新流程：**
```
Agent 发消息 → MessageService.send() →
  if (authorId 是 Agent/Bot) →
    NotificationTriggerService.triggerBuddyReply({
      targetUserId: channel.otherUser,
      buddyId: agent.id,
      buddyName: agent.displayName,
      messageId,
      dmChannelId,
      contentPreview
    })
```

### 新通知类型
```sql
-- 添加到 notification_type enum
ALTER TYPE notification_type ADD VALUE 'buddy_reply';
```

### 触发位置
- `MessageService.send()` — 当 author 是 bot/agent 时触发 buddy_reply
- `DmService.sendMessage()` — DM 上下文相同逻辑

---

## 冰策 6: 统一 NotificationTriggerService

### 当前问题
通知在 6+ 个分散位置创建：
- `chat.gateway.ts` — mention, reply
- `dm.handler.ts` — DM（通过 gateway）
- `server.handler.ts` — server_join, channel_invite
- `friendship.handler.ts` — friend_request

### 新方案
单一 `NotificationTriggerService` 作为唯一入口。

### 服务设计

```typescript
class NotificationTriggerService {
  constructor(
    private notificationService: NotificationService,
    private pushService: PushService,
    private centrifugoService: CentrifugoService,
    private templateService: NotificationTemplateService,
    private aggregationService: NotificationAggregationService,
    private presenceService: UserPresenceService,
    private preferenceService: NotificationPreferenceService,
  )
  
  // === 触发方法 ===
  
  async triggerMention(params: MentionTriggerParams): void
  async triggerReply(params: ReplyTriggerParams): void
  async triggerDm(params: DmTriggerParams): void
  async triggerBuddyReply(params: BuddyReplyTriggerParams): void
  async triggerServerJoin(params: ServerJoinTriggerParams): void
  async triggerChannelInvite(params: ChannelInviteTriggerParams): void
  async triggerFriendRequest(params: FriendRequestTriggerParams): void
  
  // === 内部分发流程 ===
  
  private async dispatch(userId: string, payload: NotificationPayload): void {
    // 1. 检查用户偏好（strategy, muted servers/channels）
    // 2. 检查是否应创建通知（偏好过滤在创建前）
    // 3. 尝试聚合
    // 4. 创建通知记录
    // 5. 检查用户在线状态（Centrifugo presence）
    // 6. 在线 → Centrifugo publish
    // 7. 离线 → Expo Push
    // 8. 多设备 → Push 所有活跃 token（除非用户禁用）
  }
}
```

### 迁移
替换所有分散的通知创建调用：
```typescript
// 旧（分散）
const notification = await notificationService.create({...})
io.to(`user:${userId}`).emit('notification:new', notification)

// 新（统一）
await notificationTrigger.triggerMention({...})
```

---

## 冰策 7: Centrifugo + Push 协作架构

### 流程图

```
                    NotificationTriggerService
                              │
                              ▼
                    ┌─────────────────┐
                    │ 创建记录        │
                    │ (含聚合)        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ 检查在线状态    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
        ┌───────────┐               ┌─────────────┐
        │ Centrifugo│               │ Expo Push   │
        │ WebSocket │               │ (所有token) │
        └─────┬─────┘               └──────┬──────┘
              │                             │
              ▼                             ▼
        用户在线                    用户离线/后台
        立即 UI 更新                设备通知栏
```

### 在线检测
- Centrifugo 提供 presence API
- 分发前检查 `isUserOnline(userId)`
- 在线 → WebSocket publish
- 离线 → Expo Push 到所有已注册 token

---

## 实施阶段

### Phase 1: 基础架构（第 1-2 周）
- [ ] 数据库迁移（user_push_tokens, notifications 聚合字段）
- [ ] Centrifugo 部署
- [ ] PushService 实现
- [ ] NotificationTriggerService 基础框架

### Phase 2: Mentions（第 2-3 周）
- [ ] MentionService 实现
- [ ] 前端自动补全组件
- [ ] 消息渲染更新
- [ ] 替换正则解析器

### Phase 3: Buddy 通知（第 3 周）
- [ ] 添加 `buddy_reply` 通知类型
- [ ] MessageService/DmService 触发 buddy_reply
- [ ] buddy_reply i18n 模板

### Phase 4: 聚合与模板（第 3-4 周）
- [ ] NotificationAggregationService
- [ ] NotificationTemplateService
- [ ] UI 适配聚合显示
- [ ] Cron job 刷新窗口

### Phase 5: 迁移与清理（第 4 周）
- [ ] 替换所有分散的通知调用
- [ ] 移除 Socket.IO 通知逻辑
- [ ] 测试所有通知路径
- [ ] Mobile push token 注册流程

---

## 已确认细节

1. **推送优先级：** 无需区分 — 所有通知类型使用相同推送紧迫性。

2. **Buddy 通知偏好：** 后续迭代 — 不在 Phase 1-5 范围内。

3. **Thread 通知：** 暂缓 — Thread 功能尚未完整实现，待 Thread 实现后再考虑。

4. **通知保留期：** 30天 — 聚合通知记录和原始条目 30天后过期删除。

5. **Push token 注册时机：** 首次登录后 — 用户成功登录后请求权限并注册 token（而非 App 启动时）。

---

## 审批

- [ ] 审核人: 彭猫
- [ ] 批准实施
- [ ] 开始实施