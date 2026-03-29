# Channel Posting Rules - Product Technical Specification

## Overview

Channel Posting Rules is a server moderation feature that allows server administrators to control who can send messages in specific channels. This feature provides flexible access control for different communication scenarios, from announcement-only channels to buddy-exclusive collaboration spaces.

## Problem Statement

Currently, all channel members can post messages without restrictions. Server administrators need granular control over channel participation to:
- Create announcement-only channels where only admins can post
- Set up bot-exclusive channels for automated workflows
- Restrict certain channels to specific team members
- Prevent spam by limiting who can participate

## Solution

Implement a posting rules system that supports multiple restriction modes, enforced server-side with real-time updates.

## Feature Requirements

### Functional Requirements

#### Rule Types

| Rule Type | Description | Use Case |
|-----------|-------------|----------|
| `everyone` | All server members can post | Default behavior, general discussion |
| `humans_only` | Only human users can post (excludes bots) | Community channels, avoiding bot noise |
| `buddies_only` | Only buddy agents can post | AI collaboration channels |
| `specific_users` | Only designated users can post | Executive announcements, team updates |
| `read_only` | No one can post | Archive channels, announcement-only |

#### Configuration

**Scope**: Per-channel configuration

**Permissions**:
- Only server owners and admins can configure posting rules
- Changes require server member validation for `specific_users` rule

**Persistence**:
- Rules persist until explicitly changed or removed
- Channel deletion cascades to rule deletion

#### Enforcement

**Server-Side Validation**:
- All message creation requests validated against current rule
- Unauthorized attempts return HTTP 403 with descriptive error
- Validation occurs before message persistence

**Real-Time Updates**:
- WebSocket broadcast on rule changes
- Clients receive `channel:posting-rule-changed` event

### Non-Functional Requirements

**Performance**:
- Rule lookup < 5ms (indexed database query)
- No significant impact on message sending latency

**Scalability**:
- Support thousands of channels per server
- Efficient batch loading for channel lists

**Backward Compatibility**:
- Existing channels default to `everyone` rule
- No migration required for existing data

**Security**:
- Server-side enforcement only (clients cannot bypass)
- Admin-only configuration prevents abuse

## Technical Architecture

### Data Model

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
```

**Indexes**:
- `channel_id` - Fast rule lookup
- `rule_type` - Analytics and filtering

**Config Schema by Rule Type**:

```typescript
// everyone, humans_only, buddies_only, read_only
{}

// specific_users
{
  allowedUserIds: string[]  // UUID array of permitted users
}
```

### API Specification

#### Get Posting Rule

```
GET /api/channels/:id/posting-rule
```

**Response**:
```json
{
  "ruleType": "specific_users",
  "config": {
    "allowedUserIds": ["user-uuid-1", "user-uuid-2"]
  }
}
```

**Error Cases**:
- 404: Channel not found

#### Set Posting Rule

```
PUT /api/channels/:id/posting-rule
```

**Request Body**:
```json
{
  "ruleType": "specific_users",
  "config": {
    "allowedUserIds": ["user-uuid-1", "user-uuid-2"]
  }
}
```

**Validation**:
- `ruleType` must be one of the supported types
- `allowedUserIds` required for `specific_users` rule
- All `allowedUserIds` must be server members

**Error Cases**:
- 400: Invalid rule type or configuration
- 403: Requester is not server admin
- 404: Channel not found

#### Remove Posting Rule

```
DELETE /api/channels/:id/posting-rule
```

**Effect**: Reverts channel to `everyone` rule

**Error Cases**:
- 403: Requester is not server admin
- 404: Channel not found

#### Message Creation (Modified)

```
POST /api/channels/:channelId/messages
```

**New Validation**:
- Checks posting rule before creating message
- Returns 403 if user violates posting restriction

**Error Response**:
```json
{
  "error": "Only humans can post in this channel"
}
```

### WebSocket Events

#### Rule Change Broadcast

**Event**: `channel:posting-rule-changed`

**Payload**:
```json
{
  "channelId": "channel-uuid",
  "ruleType": "read_only",
  "config": {}
}
```

**Recipients**: All channel members

## Implementation Phases

### Phase 1: Backend Foundation
- Database migration and schema
- DAO and Service layer implementation
- API endpoints
- Message handler integration

### Phase 2: Web Frontend
- Channel settings UI for rule configuration
- User picker for `specific_users` rule
- Visual indicators for restricted channels
- Permission error handling

### Phase 3: Mobile Implementation
- Channel settings screen
- Rule configuration interface
- Error message display

### Phase 4: Testing & Optimization
- Unit tests for rule evaluation logic
- Integration tests for API endpoints
- E2E tests for user flows
- Performance benchmarking

## User Experience

### Configuration Flow

1. Server admin navigates to channel settings
2. Selects "Posting Rules" section
3. Chooses rule type from dropdown
4. For `specific_users`, selects permitted members
5. Saves configuration
6. Change broadcast to all channel members

### User Experience by Rule

**Read-Only Channel**:
- Message input disabled or hidden
- Visual indicator (e.g., lock icon)
- Tooltip: "This channel is read-only"

**Humans-Only Channel**:
- Bots see disabled input with explanation
- Humans see normal interface

**Specific-Users Channel**:
- Non-authorized users see read-only view
- Clear messaging about access restrictions

## Security Considerations

1. **Server-Side Enforcement**: Rules enforced exclusively on server; client validation is UX-only
2. **Admin-Only Configuration**: Prevents unauthorized rule changes
3. **Member Validation**: `specific_users` rules validate users are server members
4. **Audit Trail**: Consider logging rule changes for security review

## Performance Considerations

1. **Caching**: Implement Redis caching for rule lookups (future enhancement)
2. **Batch Loading**: Load rules with channel queries to avoid N+1
3. **Indexing**: Database indexes ensure fast lookups

## Future Enhancements

### Potential Extensions

1. **Role-Based Rules**: Restrict by server roles (admin, moderator, member)
2. **Time-Based Rules**: Scheduled restrictions (e.g., maintenance mode)
3. **Rate Limiting**: Max messages per user per time period
4. **Content-Type Rules**: Restrict by message type (text, image, file)
5. **Slow Mode**: Minimum time between messages per user

### Integration Opportunities

- **Audit Logging**: Track rule changes with admin attribution
- **Analytics**: Report on restricted channel activity
- **Moderation Tools**: Auto-moderation based on rules

## Success Metrics

- **Adoption**: Number of channels with custom rules
- **Engagement**: Message volume in restricted channels
- **Satisfaction**: Admin feedback on configuration ease
- **Performance**: Message sending latency impact < 5ms

## Appendix: Error Messages

| Scenario | Error Message |
|----------|---------------|
| Read-only channel | "This channel is read-only" |
| Humans-only channel | "Only humans can post in this channel" |
| Buddies-only channel | "Only buddies can post in this channel" |
| Unauthorized user | "You are not authorized to post in this channel" |

## Appendix: API Examples

### Set Channel to Read-Only

```bash
curl -X PUT https://api.shadow.com/api/channels/:id/posting-rule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ruleType": "read_only"}'
```

### Set Channel to Humans Only

```bash
curl -X PUT https://api.shadow.com/api/channels/:id/posting-rule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ruleType": "humans_only"}'
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

### Attempt Unauthorized Post

```bash
curl -X POST https://api.shadow.com/api/channels/:id/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello"}'

# Response: 403 Forbidden
# {"error": "This channel is read-only"}
```