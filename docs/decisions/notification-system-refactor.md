# Notification System Refactor

> **Status:** Draft — Pending Review
> **Date:** 2025-03-30
> **Author:** 小炸 (AI Assistant)

## Background

Shadow's current notification system has several issues:

1. **Mention parsing is flawed** — regex `@([A-Za-z0-9_-]+)` incorrectly matches emails, doesn't support Unicode usernames, and doesn't distinguish code blocks.

2. **Notification creation logic is scattered** — across 6+ files (chat.gateway.ts, server.handler.ts, friendship.handler.ts, etc.)

3. **No offline push notifications** — only Socket.IO real-time push; users offline receive nothing.

4. **No notification aggregation** — every message creates a separate notification.

5. **Buddy/Agent replies have no notifications** — Agent messages don't trigger notifications for the target user.

6. **No i18n templates** — hardcoded strings in title/body.

## Goals

1. Discord-style `<@userId>` mentions with proper parsing and validation
2. Expo Push Notifications for offline users (server-side push)
3. Notification aggregation (5-minute windows)
4. i18n notification templates
5. Unified notification trigger service
6. Buddy/Agent reply notifications

---

## Decision 1: Mention Format — Discord Style

### Current
```
@username  — flawed regex, fails on emails/Unicode
```

### Proposed
```
<@userId>  — Discord-style, resolves to displayName at render
```

### Benefits
- User renames don't break mentions
- No false positives on emails
- Works with any username format (Chinese, emojis, etc.)
- Database stores userId, frontend renders displayName

### Implementation

**Message Storage:**
- Store raw content as-is (with `<@userId>` format)
- No server-side mention resolution needed

**MentionService:**
```typescript
class MentionService {
  // Parse <@userId> patterns from content
  parseMentions(content: string): string[]
  
  // Validate mentioned users are channel members
  validateMentions(channelId: string, userIds: string[]): Promise<User[]>
  
  // Frontend: resolve userId to displayName for rendering
  resolveMention(userId: string, members: Member[]): string
}
```

**Frontend Input:**
- Autocomplete popup when typing `@`
- Insert `<@userId>` on selection
- Render as `@displayName` in message bubbles

---

## Decision 2: Push Notifications — Expo Push Service

### Current
- Mobile-only local notifications (expo-notifications scheduleNotificationAsync)
- No server-side push capability
- No push tokens stored in database

### Proposed
- Server-side Expo Push Notifications via expo-server-sdk-node
- Multi-device support (user_push_tokens table)
- Push when user offline, Centrifugo when online

### Database Changes

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
  
  async registerPushToken(userId: string, token: string, platform: string, deviceName?: string)
  
  async sendPushNotifications(userIds: string[], notification: {
    title: string
    body: string
    data: Record<string, unknown>
  }): Promise<PushTicket[]>
  
  async checkPushReceipts(ticketIds: string[]): Promise<PushReceipt[]>
  
  async cleanInvalidTokens(): void  // Remove DeviceNotRegistered tokens
}
```

### Token Lifecycle
- Register on app start (after permission granted)
- Store in user_push_tokens
- Clean on logout (delete token)
- Clean on DeviceNotRegistered receipt (mark inactive)

---

## Decision 3: Notification Aggregation

### Current
Every message creates separate notification → notification spam

### Proposed
Aggregate same-type notifications within 5-minute windows

### Database Changes

```sql
ALTER TABLE notifications ADD COLUMN aggregated_count INT DEFAULT 1;
ALTER TABLE notifications ADD COLUMN last_aggregated_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN aggregation_key TEXT;
```

### Aggregation Rules

| Type | aggregation_key | Window | Aggregated Title |
|------|-----------------|--------|------------------|
| mention | `mention:channel:{channelId}:user:{targetUserId}` | 5 min | "N 人提到了你" |
| reply | `reply:channel:{channelId}:user:{targetUserId}` | 5 min | "N 条新回复" |
| dm | `dm:{dmChannelId}` | 5 min | "N 条新消息" |
| buddy_reply | `buddy:{dmChannelId}` | 5 min | "Buddy 发来 N 条消息" |
| system | — | — | No aggregation |

### AggregationService

```typescript
class NotificationAggregationService {
  async tryAggregate(notification: NewNotification): Promise<Notification>
  
  async flushExpiredWindows(): void  // Cron job, flush windows older than 5 min
  
  generateAggregatedTitle(notification: Notification, locale: string): string
}
```

### Important: Real-time Push Still Works
- Aggregation affects stored notification count and display
- **Real-time Centrifugo/Expo push still fires immediately**
- Aggregation only affects how notification is displayed/stored, not delivery timing

---

## Decision 4: i18n Notification Templates

### Current
Hardcoded strings like `${sender} mentioned you`

### Proposed
Template system with locale support

### Template Structure

```typescript
// packages/shared/src/notification-templates.ts
export const notificationTemplates: Record<NotificationType, Record<string, TemplateSet>> = {
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
    locale: string,  // from user profile or default
    params: TemplateParams
  ): { title: string; body?: string }
}
```

---

## Decision 5: Buddy/Agent Reply Notifications

### Problem
Agent messages don't create notifications for target users.

**Current Flow (missing notifications):**
```
User sends DM → relayDmToBot → Agent processes → Agent sends message
                                                    ↓
                                          WebSocket broadcast only
                                                    ↓
                                          NO notification created!
```

### Proposed
Add notification trigger for Agent replies.

**New Flow:**
```
Agent sends message → MessageService.send() →
  if (authorId is Agent/Bot) →
    NotificationTriggerService.triggerBuddyReply({
      targetUserId: channel.otherUser,
      buddyId: agent.id,
      buddyName: agent.displayName,
      messageId: message.id,
      dmChannelId: channel.id,
      contentPreview: content.slice(0, 100)
    })
```

### New Notification Type
```sql
-- Add to notification_type enum
ALTER TYPE notification_type ADD VALUE 'buddy_reply';
```

### Trigger Location
- `MessageService.send()` — when author is bot/agent, trigger buddy_reply
- `DmService.sendMessage()` — same logic for DM context

---

## Decision 6: Unified NotificationTriggerService

### Current
Notifications created in 6+ scattered locations:
- `chat.gateway.ts` — mention, reply
- `dm.handler.ts` — DM (via gateway)
- `server.handler.ts` — server_join, channel_invite
- `friendship.handler.ts` — friend_request

### Proposed
Single `NotificationTriggerService` as the only entry point.

### Service Design

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
  
  // === Trigger Methods ===
  
  async triggerMention(params: MentionTriggerParams): void
  async triggerReply(params: ReplyTriggerParams): void
  async triggerDm(params: DmTriggerParams): void
  async triggerBuddyReply(params: BuddyReplyTriggerParams): void
  async triggerServerJoin(params: ServerJoinTriggerParams): void
  async triggerChannelInvite(params: ChannelInviteTriggerParams): void
  async triggerFriendRequest(params: FriendRequestTriggerParams): void
  
  // === Internal Dispatch Flow ===
  
  private async dispatch(userId: string, payload: NotificationPayload): void {
    // 1. Check user preferences (strategy, muted servers/channels)
    // 2. Check if notification should be created (preference filter BEFORE create)
    // 3. Try aggregation
    // 4. Create notification record
    // 5. Check user presence (online via Centrifugo?)
    // 6. If online → Centrifugo publish
    // 7. If offline → Expo Push
    // 8. If multi-device → Push all active tokens (unless user disabled)
  }
}
```

### Migration
Replace all scattered notification creation calls with:
```typescript
// Old (scattered)
const notification = await notificationService.create({...})
io.to(`user:${userId}`).emit('notification:new', notification)

// New (unified)
await notificationTrigger.triggerMention({...})
```

---

## Decision 7: Centrifugo + Push Coordination

### Architecture

```
                    NotificationTriggerService
                              │
                              ▼
                    ┌─────────────────┐
                    │ Create Record   │
                    │ (with agg)      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Check Presence  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
        ┌───────────┐               ┌─────────────┐
        │ Centrifugo│               │ Expo Push   │
        │ WebSocket │               │ (all tokens)│
        └─────┬─────┘               └──────┬──────┘
              │                             │
              ▼                             ▼
        User Online                  User Offline/Background
        Immediate UI                 Device Notification Bar
```

### Presence Detection
- Centrifugo provides presence API
- Check `isUserOnline(userId)` before dispatch
- Online → WebSocket publish
- Offline → Expo Push to all registered tokens

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1-2)
- [ ] Database migrations (user_push_tokens, notifications aggregation fields)
- [ ] Centrifugo deployment
- [ ] PushService implementation
- [ ] NotificationTriggerService skeleton

### Phase 2: Mentions (Week 2-3)
- [ ] MentionService implementation
- [ ] Frontend autocomplete component
- [ ] Message rendering update
- [ ] Replace regex parser

### Phase 3: Buddy Notifications (Week 3)
- [ ] Add `buddy_reply` notification type
- [ ] Trigger buddy reply in MessageService/DmService
- [ ] i18n templates for buddy_reply

### Phase 4: Aggregation & Templates (Week 3-4)
- [ ] NotificationAggregationService
- [ ] NotificationTemplateService
- [ ] UI adaptation for aggregated display
- [ ] Cron job for window flush

### Phase 5: Migration & Cleanup (Week 4)
- [ ] Replace all scattered notification calls
- [ ] Remove Socket.IO notification logic
- [ ] Test all notification paths
- [ ] Mobile push token registration flow

---

## Confirmed Decisions

1. **Push priority:** No differentiation needed — all notification types use same push urgency.

2. **Buddy notification preferences:** Deferred to future iteration — not in Phase 1-5 scope.

3. **Thread notifications:** Deferred — thread feature incomplete, will revisit when thread implementation is finalized.

4. **Notification retention:** 30 days — aggregated notification records and original entries expire after 30 days.

5. **Push token registration:** On first login — request permissions and register token after user successfully logs in (not on app start).

---

## Related Documents

- `docs/research/notification-system-tech-spec.md` — Centrifugo technical spec
- `docs/ARCHITECTURE.md` — Current architecture overview

---

## Approval

- [ ] Reviewed by: 彭猫
- [ ] Approved for implementation
- [ ] Implementation started