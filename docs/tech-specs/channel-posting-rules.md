# Channel Posting Rules - Technical Design Document

## Overview

This document describes the technical design for implementing channel posting rules, which allow server administrators to restrict who can send messages in specific channels.

## Requirements

### Functional Requirements

1. **Posting Rule Types**: Support the following posting restriction modes:
   - `everyone` - All server members can post (default)
   - `humans_only` - Only human users can post (bots excluded)
   - `buddies_only` - Only buddy agents can post
   - `specific_users` - Only specific users can post
   - `read_only` - No one can post (read-only channel)

2. **Configuration**: Server admins can configure posting rules per channel via API.

3. **Enforcement**: The system must enforce posting rules at the message sending level.

4. **Extensibility**: The rule system should be designed to allow easy addition of new rule types.

### Non-Functional Requirements

1. **Performance**: Rule checks must be fast and not significantly impact message sending latency.
2. **Backward Compatibility**: Existing channels without rules should default to `everyone`.
3. **Security**: Rule enforcement must be server-side and cannot be bypassed by clients.

## Technical Design

### Data Model

#### Database Schema Changes

**New Table: `channel_posting_rules`**

```sql
CREATE TABLE channel_posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  rule_type varchar(50) NOT NULL DEFAULT 'everyone',
  config jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(channel_id)
);

CREATE INDEX channel_posting_rules_channel_id_idx ON channel_posting_rules(channel_id);
```

**Rule Type Enum:**

```typescript
type ChannelPostingRuleType = 
  | 'everyone' 
  | 'humans_only' 
  | 'buddies_only' 
  | 'specific_users' 
  | 'read_only'
```

**Config JSON Schema by Rule Type:**

- `everyone`: `{}` (no config needed)
- `humans_only`: `{}` (no config needed)
- `buddies_only`: `{}` (no config needed)
- `specific_users`: `{ allowedUserIds: string[] }`
- `read_only`: `{}` (no config needed)

#### Shared Types Update

Add to `packages/shared/src/types/channel.types.ts`:

```typescript
export type ChannelPostingRuleType = 
  | 'everyone' 
  | 'humans_only' 
  | 'buddies_only' 
  | 'specific_users' 
  | 'read_only'

export interface ChannelPostingRule {
  ruleType: ChannelPostingRuleType
  config?: {
    allowedUserIds?: string[]
  }
}

export interface Channel {
  // ... existing fields
  postingRule?: ChannelPostingRule
}
```

### API Design

#### New Endpoints

**GET /api/channels/:id/posting-rule**

Returns the current posting rule for a channel.

Response:
```json
{
  "ruleType": "specific_users",
  "config": {
    "allowedUserIds": ["user-uuid-1", "user-uuid-2"]
  }
}
```

**PUT /api/channels/:id/posting-rule**

Sets or updates the posting rule for a channel.

Request:
```json
{
  "ruleType": "specific_users",
  "config": {
    "allowedUserIds": ["user-uuid-1", "user-uuid-2"]
  }
}
```

Response: The updated posting rule.

**DELETE /api/channels/:id/posting-rule**

Removes the posting rule (defaults to `everyone`).

#### Modified Endpoints

**GET /api/channels/:id**

Include `postingRule` in the response.

**GET /api/servers/:serverId/channels**

Include `postingRule` in each channel object.

### Service Layer

#### New Service: `ChannelPostingRuleService`

```typescript
export class ChannelPostingRuleService {
  constructor(private deps: {
    channelPostingRuleDao: ChannelPostingRuleDao
    channelDao: ChannelDao
    userDao: UserDao
    agentDao: AgentDao
  }) {}

  /** Get posting rule for a channel */
  async getRule(channelId: string): Promise<ChannelPostingRule | null>

  /** Set or update posting rule for a channel */
  async setRule(
    channelId: string, 
    ruleType: ChannelPostingRuleType, 
    config?: { allowedUserIds?: string[] }
  ): Promise<ChannelPostingRule>

  /** Remove posting rule from a channel */
  async removeRule(channelId: string): Promise<void>

  /** Check if a user can post in a channel */
  async canPost(
    channelId: string, 
    userId: string
  ): Promise<{ allowed: boolean; reason?: string }>
}
```

#### Rule Evaluation Logic

```typescript
async canPost(channelId: string, userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const rule = await this.getRule(channelId)
  
  // Default: everyone can post
  if (!rule || rule.ruleType === 'everyone') {
    return { allowed: true }
  }

  const user = await this.deps.userDao.findById(userId)
  if (!user) {
    return { allowed: false, reason: 'User not found' }
  }

  switch (rule.ruleType) {
    case 'read_only':
      return { allowed: false, reason: 'This channel is read-only' }
    
    case 'humans_only':
      if (user.isBot) {
        return { allowed: false, reason: 'Only humans can post in this channel' }
      }
      return { allowed: true }
    
    case 'buddies_only':
      // Check if user is a buddy agent
      const agent = await this.deps.agentDao.findByUserId(userId)
      if (!agent) {
        return { allowed: false, reason: 'Only buddies can post in this channel' }
      }
      return { allowed: true }
    
    case 'specific_users':
      const allowedUserIds = rule.config?.allowedUserIds || []
      if (!allowedUserIds.includes(userId)) {
        return { allowed: false, reason: 'You are not authorized to post in this channel' }
      }
      return { allowed: true }
    
    default:
      return { allowed: true }
  }
}
```

### Message Handler Integration

Modify `POST /api/channels/:channelId/messages` in `message.handler.ts`:

```typescript
channelHandler.post(
  '/channels/:channelId/messages',
  zValidator('json', sendMessageSchema),
  async (c) => {
    const messageService = container.resolve('messageService')
    const channelPostingRuleService = container.resolve('channelPostingRuleService')
    const channelId = c.req.param('channelId')
    const input = c.req.valid('json')
    const user = c.get('user')

    // Check posting rules
    const canPost = await channelPostingRuleService.canPost(channelId, user.userId)
    if (!canPost.allowed) {
      return c.json({ error: canPost.reason || 'Not authorized to post in this channel' }, 403)
    }

    const message = await messageService.send(channelId, user.userId, input)
    // ... rest of handler
  }
)
```

### Extensibility Design

The rule system is designed to be extensible:

1. **New Rule Types**: Add new values to `ChannelPostingRuleType` enum and implement the evaluation logic in `canPost()`.

2. **Rule Configurations**: The `config` JSONB field allows flexible configuration for different rule types.

3. **Future Enhancements**:
   - Role-based rules (e.g., only admins/moderators)
   - Time-based rules (e.g., no posting during certain hours)
   - Rate-limiting rules (e.g., max N messages per user per hour)
   - Content-type rules (e.g., only images allowed)

## Implementation Plan

### Phase 1: Backend Implementation

1. **Database Migration** (0029_add_channel_posting_rules.sql)
   - Create `channel_posting_rules` table
   - Add index on `channel_id`

2. **DAO Layer**
   - Create `ChannelPostingRuleDao` with CRUD operations

3. **Service Layer**
   - Create `ChannelPostingRuleService` with rule evaluation logic

4. **API Layer**
   - Add endpoints to `channel.handler.ts`
   - Integrate rule checking into `message.handler.ts`

5. **Shared Types**
   - Update `channel.types.ts` with new types

### Phase 2: Frontend Implementation (Web)

1. **UI Components**
   - Channel settings panel with posting rules configuration
   - Rule type selector dropdown
   - User picker for `specific_users` rule
   - Permission error display

2. **State Management**
   - Update channel store to include posting rules
   - Add mutations for setting/removing rules

3. **API Integration**
   - Add API client methods for posting rule endpoints

### Phase 3: Frontend Implementation (Mobile)

1. **UI Components**
   - Channel settings screen with posting rules
   - Rule type selector
   - User picker for `specific_users` rule

2. **API Integration**
   - Add API client methods for posting rule endpoints

### Phase 4: Testing

1. **Unit Tests**
   - `ChannelPostingRuleService` rule evaluation logic
   - DAO operations

2. **Integration Tests**
   - API endpoint tests
   - Message sending with rules

3. **E2E Tests**
   - Web: Configure rules and verify enforcement
   - Mobile: Configure rules and verify enforcement

## Security Considerations

1. **Authorization**: Only server admins/owners can modify posting rules.
2. **Server-Side Enforcement**: Rules are enforced server-side; clients cannot bypass.
3. **Input Validation**: Validate `allowedUserIds` to ensure users are server members.
4. **Audit Logging**: Consider logging rule changes for security audit purposes.

## Performance Considerations

1. **Caching**: Cache posting rules in memory or Redis to avoid repeated database lookups.
2. **Indexing**: The `channel_id` index ensures fast rule lookups.
3. **Batch Loading**: When fetching channels, load posting rules in batch to reduce N+1 queries.

## Migration Strategy

1. **Zero-Downtime**: The migration adds a new table; existing channels work without rules.
2. **Rollback**: Dropping the table reverts to default behavior.
3. **Data Migration**: No data migration needed; rules are opt-in.

## Open Questions

1. Should we support role-based rules (e.g., only admins can post)?
2. Should rule changes be broadcast via WebSocket to update clients in real-time?
3. Should we show a visual indicator in the UI for channels with posting restrictions?
4. Should we support temporary rules (e.g., read-only for maintenance)?

## Appendix: API Examples

### Set Channel to Humans Only

```bash
curl -X PUT https://api.shadow.com/api/channels/:id/posting-rule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ruleType": "humans_only"
  }'
```

### Set Channel to Specific Users

```bash
curl -X PUT https://api.shadow.com/api/channels/:id/posting-rule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ruleType": "specific_users",
    "config": {
      "allowedUserIds": ["user-uuid-1", "user-uuid-2"]
    }
  }'
```

### Attempt to Post in Read-Only Channel

```bash
curl -X POST https://api.shadow.com/api/channels/:id/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello"}' 
# Response: 403 Forbidden
# { "error": "This channel is read-only" }
```